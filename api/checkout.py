import hashlib
import hmac
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler

STRIPE_SECRET_KEY = os.environ.get('STRIPE_SECRET_KEY', '')
SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://dhirxfoxcswctxcjzvhf.supabase.co')
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY', 'sb_publishable_DC3I02jLVjM013WrODpgCg_xiPl1rsl')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')
SITE_URL = os.environ.get('SITE_URL', 'https://site-nba-ten.vercel.app').rstrip('/')

PLAN_PRICES = {
    'basic': 2900,
    'pro': 5900,
    'premium': 9900,
}

PLAN_NAMES = {
    'basic': 'StatCast BR Basic',
    'pro': 'StatCast BR Pro',
    'premium': 'StatCast BR Premium',
}


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self._json(200, {'ok': True})

    def do_POST(self):
        if self.headers.get('stripe-signature'):
            self._handle_webhook()
            return

        if not STRIPE_SECRET_KEY:
            self._json(500, {'error': 'STRIPE_SECRET_KEY is not configured'})
            return

        session = self._require_session()
        if not session:
            return

        try:
            data = json.loads(self._read_body() or b'{}')
        except Exception:
            self._json(400, {'error': 'invalid json'})
            return

        plan = str(data.get('plan') or '').strip().lower()
        if plan not in PLAN_PRICES:
            self._json(400, {'error': 'invalid plan'})
            return

        self._ensure_subscription_row(session['id'])

        payload = urllib.parse.urlencode({
            'payment_method_types[]': 'card',
            'mode': 'subscription',
            'client_reference_id': session['id'],
            'customer_email': session.get('email') or '',
            'line_items[0][price_data][currency]': 'brl',
            'line_items[0][price_data][product_data][name]': PLAN_NAMES[plan],
            'line_items[0][price_data][recurring][interval]': 'month',
            'line_items[0][price_data][unit_amount]': str(PLAN_PRICES[plan]),
            'line_items[0][quantity]': '1',
            'success_url': f'{SITE_URL}?payment=success&plan={plan}',
            'cancel_url': f'{SITE_URL}?payment=cancelled',
            'metadata[user_id]': session['id'],
            'metadata[plan]': plan,
            'subscription_data[metadata][user_id]': session['id'],
            'subscription_data[metadata][plan]': plan,
        }).encode()

        req = urllib.request.Request(
            'https://api.stripe.com/v1/checkout/sessions',
            data=payload,
            headers={
                'Authorization': f'Bearer {STRIPE_SECRET_KEY}',
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        )

        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                stripe_session = json.loads(resp.read())
            self._json(200, {'url': stripe_session['url']})
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode('utf-8', errors='ignore')
            message = 'stripe error'
            try:
                message = json.loads(raw).get('error', {}).get('message') or message
            except Exception:
                pass
            self._json(502, {'error': message})
        except Exception as exc:
            self._json(502, {'error': str(exc)[:200]})

    def do_GET(self):
        self._json(200, {
            'ok': True,
            'stripe_configured': bool(STRIPE_SECRET_KEY),
            'supabase_configured': bool(SUPABASE_SERVICE_KEY),
            'plans': list(PLAN_PRICES.keys()),
        })

    def _handle_webhook(self):
        payload = self._read_body()
        sig_header = self.headers.get('stripe-signature', '')
        webhook_secret = os.environ.get('STRIPE_WEBHOOK_SECRET', '')

        if webhook_secret and not self._valid_stripe_signature(payload, sig_header, webhook_secret):
            self._json(400, {'error': 'invalid signature'})
            return

        try:
            event = json.loads(payload)
        except Exception:
            self._json(400, {'error': 'invalid json'})
            return

        event_type = event.get('type', '')
        obj = event.get('data', {}).get('object', {})
        meta = obj.get('metadata', {}) or {}
        user_id = meta.get('user_id') or obj.get('client_reference_id')
        plan = meta.get('plan')

        if event_type == 'checkout.session.completed' and user_id and plan:
            self._upsert_subscription(user_id, plan, 'active')
        elif event_type == 'customer.subscription.deleted' and user_id:
            self._upsert_subscription(user_id, 'free', 'active')
        elif event_type == 'invoice.payment_failed' and user_id:
            self._upsert_subscription(user_id, plan or 'free', 'past_due')
        elif event_type == 'invoice.payment_succeeded' and user_id and plan:
            self._upsert_subscription(user_id, plan, 'active')

        self._json(200, {'received': True})

    def _read_body(self):
        length = int(self.headers.get('Content-Length', 0) or 0)
        return self.rfile.read(length)

    def _require_session(self):
        token = self.headers.get('Authorization', '').replace('Bearer ', '').strip()
        if not token:
            self._json(401, {'error': 'missing bearer token'})
            return None

        req = urllib.request.Request(
            f'{SUPABASE_URL}/auth/v1/user',
            headers={'apikey': SUPABASE_ANON_KEY, 'Authorization': f'Bearer {token}'},
        )
        try:
            with urllib.request.urlopen(req, timeout=12) as resp:
                user = json.loads(resp.read())
        except Exception:
            self._json(401, {'error': 'invalid token'})
            return None

        if not user.get('id'):
            self._json(401, {'error': 'invalid token'})
            return None
        return {'id': user['id'], 'email': user.get('email')}

    def _ensure_subscription_row(self, user_id):
        if not SUPABASE_SERVICE_KEY:
            return
        if self._subscription_exists(user_id):
            return
        req = urllib.request.Request(
            f'{SUPABASE_URL}/rest/v1/subscriptions',
            data=json.dumps({'user_id': user_id, 'plan': 'free', 'status': 'active'}).encode(),
            method='POST',
            headers={
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
            },
        )
        try:
            urllib.request.urlopen(req, timeout=12)
        except Exception as exc:
            print(f'Supabase subscription ensure error: {exc}')

    def _upsert_subscription(self, user_id, plan, status):
        if not SUPABASE_SERVICE_KEY:
            return
        exists = self._subscription_exists(user_id)
        path = f'/rest/v1/subscriptions?user_id=eq.{urllib.parse.quote(user_id)}' if exists else '/rest/v1/subscriptions'
        method = 'PATCH' if exists else 'POST'
        req = urllib.request.Request(
            f'{SUPABASE_URL}{path}',
            data=json.dumps({'user_id': user_id, 'plan': plan, 'status': status}).encode(),
            method=method,
            headers={
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
            },
        )
        try:
            urllib.request.urlopen(req, timeout=12)
        except Exception as exc:
            print(f'Supabase subscription upsert error: {exc}')

    def _subscription_exists(self, user_id):
        req = urllib.request.Request(
            f'{SUPABASE_URL}/rest/v1/subscriptions?select=user_id&user_id=eq.{urllib.parse.quote(user_id)}&limit=1',
            headers={
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=12) as resp:
                rows = json.loads(resp.read() or b'[]')
            return bool(rows)
        except Exception as exc:
            print(f'Supabase subscription lookup error: {exc}')
            return False

    def _valid_stripe_signature(self, payload, sig_header, webhook_secret):
        try:
            parts = dict(part.split('=', 1) for part in sig_header.split(',') if '=' in part)
            ts = parts.get('t', '')
            v1 = parts.get('v1', '')
            signed = f'{ts}.'.encode() + payload
            expected = hmac.new(webhook_secret.encode(), signed, hashlib.sha256).hexdigest()
            return bool(v1) and hmac.compare_digest(expected, v1)
        except Exception:
            return False

    def _json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass
