import json, os, hmac, hashlib
from http.server import BaseHTTPRequestHandler

STRIPE_SECRET_KEY = os.environ.get('STRIPE_SECRET_KEY', '')
SUPABASE_URL      = os.environ.get('SUPABASE_URL', 'https://dhirxfoxcswctxcjzvhf.supabase.co')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')
SITE_URL          = os.environ.get('SITE_URL', 'https://site-nba-ten.vercel.app')

# Preços dos planos em centavos (BRL)
PLAN_PRICES = {
    'basic':   2900,   # R$29
    'pro':     5900,   # R$59
    'premium': 9900,   # R$99
}

PLAN_NAMES = {
    'basic':   'StatCast BR Basic',
    'pro':     'StatCast BR Pro',
    'premium': 'StatCast BR Premium',
}

class handler(BaseHTTPRequestHandler):

    def do_POST(self):
        # ── WEBHOOK do Stripe ──────────────────────────────────────────────
        if self.path == '/api/checkout' and self.headers.get('stripe-signature'):
            self._handle_webhook()
            return

        # ── Criar Checkout Session ─────────────────────────────────────────
        content_len = int(self.headers.get('Content-Length', 0))
        body        = self.rfile.read(content_len)

        try:
            data = json.loads(body)
        except Exception:
            self._json(400, {'error': 'invalid json'})
            return

        plan = data.get('plan')
        user_id = data.get('user_id')

        if plan not in PLAN_PRICES:
            self._json(400, {'error': 'invalid plan'})
            return

        # Criar sessão Stripe via API REST
        import urllib.request, urllib.parse
        payload = urllib.parse.urlencode({
            'payment_method_types[]':       'card',
            'mode':                         'subscription',
            'line_items[0][price_data][currency]':              'brl',
            'line_items[0][price_data][product_data][name]':    PLAN_NAMES[plan],
            'line_items[0][price_data][recurring][interval]':   'month',
            'line_items[0][price_data][unit_amount]':           str(PLAN_PRICES[plan]),
            'line_items[0][quantity]':      '1',
            'success_url':                  f'{SITE_URL}?payment=success&plan={plan}',
            'cancel_url':                   f'{SITE_URL}?payment=cancelled',
            'metadata[user_id]':            user_id or '',
            'metadata[plan]':               plan,
        }).encode()

        req = urllib.request.Request(
            'https://api.stripe.com/v1/checkout/sessions',
            data    = payload,
            headers = {
                'Authorization': f'Bearer {STRIPE_SECRET_KEY}',
                'Content-Type':  'application/x-www-form-urlencoded',
            }
        )

        try:
            with urllib.request.urlopen(req) as resp:
                session = json.loads(resp.read())
            self._json(200, {'url': session['url']})
        except urllib.error.HTTPError as e:
            err = json.loads(e.read())
            self._json(500, {'error': err.get('error', {}).get('message', 'stripe error')})

    def _handle_webhook(self):
        """Recebe eventos do Stripe e atualiza o plano no Supabase."""
        content_len = int(self.headers.get('Content-Length', 0))
        payload     = self.rfile.read(content_len)
        sig_header  = self.headers.get('stripe-signature', '')
        webhook_secret = os.environ.get('STRIPE_WEBHOOK_SECRET', '')

        # Verificar assinatura do webhook
        if webhook_secret:
            try:
                parts = dict(p.split('=', 1) for p in sig_header.split(','))
                ts    = parts.get('t', '')
                v1    = parts.get('v1', '')
                signed = f'{ts}.'.encode() + payload
                expected = hmac.new(webhook_secret.encode(), signed, hashlib.sha256).hexdigest()
                if not hmac.compare_digest(expected, v1):
                    self._json(400, {'error': 'invalid signature'})
                    return
            except Exception:
                self._json(400, {'error': 'signature error'})
                return

        try:
            event = json.loads(payload)
        except Exception:
            self._json(400, {'error': 'invalid json'})
            return

        # Processar eventos relevantes
        event_type = event.get('type', '')
        data_obj   = event.get('data', {}).get('object', {})

        if event_type in ('checkout.session.completed', 'invoice.payment_succeeded'):
            meta    = data_obj.get('metadata', {})
            user_id = meta.get('user_id') or data_obj.get('client_reference_id')
            plan    = meta.get('plan')

            if user_id and plan:
                self._update_supabase_plan(user_id, plan)

        elif event_type in ('customer.subscription.deleted', 'invoice.payment_failed'):
            meta    = data_obj.get('metadata', {})
            user_id = meta.get('user_id')
            if user_id:
                self._update_supabase_plan(user_id, 'free')

        self._json(200, {'received': True})

    def _update_supabase_plan(self, user_id, plan):
        """Atualiza o plano do usuário no Supabase via REST API."""
        import urllib.request
        body = json.dumps({'plan': plan, 'status': 'active'}).encode()
        url  = f'{SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.{user_id}'
        req  = urllib.request.Request(url, data=body, method='PATCH', headers={
            'apikey':        SUPABASE_SERVICE_KEY,
            'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
            'Content-Type':  'application/json',
            'Prefer':        'return=minimal',
        })
        try:
            urllib.request.urlopen(req)
        except Exception as e:
            print(f'Supabase update error: {e}')

    def do_GET(self):
        self._json(200, {'status': 'checkout api ok'})

    def _json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type',  'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a): pass
