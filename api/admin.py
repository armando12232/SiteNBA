import json
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://dhirxfoxcswctxcjzvhf.supabase.co')
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY', 'sb_publishable_DC3I02jLVjM013WrODpgCg_xiPl1rsl')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')

PLAN_PRICES = {
    'free': 0,
    'basic': 29,
    'pro': 59,
    'premium': 99,
}

VALID_PLANS = set(PLAN_PRICES.keys())


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self._send(200, {'ok': True})

    def do_GET(self):
        try:
            admin = self._require_admin()
            if not admin:
                return

            query = parse_qs(urlparse(self.path).query)
            req_type = query.get('type', ['summary'])[0]

            if req_type == 'summary':
                users = self._load_users()
                self._send(200, {
                    'admin': admin,
                    'users': users,
                    'metrics': self._metrics(users),
                    'plans': PLAN_PRICES,
                })
                return

            self._send(400, {'error': 'invalid type'})
        except Exception as exc:
            self._send(500, {'error': str(exc)[:200]})

    def do_POST(self):
        try:
            self._require_admin()
            length = int(self.headers.get('Content-Length', '0') or '0')
            body = self.rfile.read(length)
            try:
                data = json.loads(body or b'{}')
            except Exception:
                self._send(400, {'error': 'invalid json'})
                return

            action = data.get('action')
            if action == 'update_plan':
                user_id = str(data.get('user_id') or '').strip()
                plan = str(data.get('plan') or '').strip().lower()
                if not user_id or plan not in VALID_PLANS:
                    self._send(400, {'error': 'invalid user_id or plan'})
                    return
                self._update_plan(user_id, plan)
                self._send(200, {'ok': True, 'user_id': user_id, 'plan': plan})
                return

            self._send(400, {'error': 'invalid action'})
        except Exception as exc:
            self._send(500, {'error': str(exc)[:200]})

    def _require_admin(self):
        if not SUPABASE_SERVICE_KEY:
            self._send(500, {'error': 'SUPABASE_SERVICE_KEY is not configured'})
            return None

        token = self.headers.get('Authorization', '').replace('Bearer ', '').strip()
        if not token:
            self._send(401, {'error': 'missing bearer token'})
            return None

        user = self._supabase_json(
            '/auth/v1/user',
            headers={'apikey': SUPABASE_ANON_KEY, 'Authorization': f'Bearer {token}'},
        )
        user_id = user.get('id')
        if not user_id:
            self._send(401, {'error': 'invalid token'})
            return None

        rows = self._supabase_json(
            f'/rest/v1/subscriptions?select=role,plan,status&user_id=eq.{urllib.parse.quote(user_id)}&limit=1',
            headers=self._service_headers(),
        )
        subscription = rows[0] if isinstance(rows, list) and rows else {}
        if subscription.get('role') != 'admin':
            self._send(403, {'error': 'admin role required'})
            return None

        return {
            'id': user_id,
            'email': user.get('email'),
            'plan': subscription.get('plan'),
            'status': subscription.get('status'),
        }

    def _load_users(self):
        subs = self._supabase_json(
            '/rest/v1/subscriptions?select=user_id,plan,status,role,created_at&order=created_at.desc',
            headers=self._service_headers(),
        )
        email_map = self._load_email_map()
        users = []
        for row in subs if isinstance(subs, list) else []:
            user_id = row.get('user_id') or ''
            users.append({
                **row,
                'email': email_map.get(user_id) or f'{user_id[:8]}...',
            })
        return users

    def _load_email_map(self):
        try:
            data = self._supabase_json('/auth/v1/admin/users?page=1&per_page=1000', headers=self._service_headers())
        except Exception:
            return {}
        return {item.get('id'): item.get('email') for item in data.get('users', []) if item.get('id')}

    def _metrics(self, users):
        total = len(users)
        paid = len([u for u in users if u.get('plan') != 'free'])
        free = len([u for u in users if u.get('plan') == 'free'])
        admins = len([u for u in users if u.get('role') == 'admin'])
        mrr = sum(PLAN_PRICES.get(u.get('plan'), 0) for u in users)
        return {'total': total, 'paid': paid, 'free': free, 'admins': admins, 'mrr': mrr}

    def _update_plan(self, user_id, plan):
        body = json.dumps({'plan': plan, 'status': 'active'}).encode()
        url = f'/rest/v1/subscriptions?user_id=eq.{urllib.parse.quote(user_id)}'
        self._supabase_json(url, method='PATCH', body=body, headers={
            **self._service_headers(),
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
        }, allow_empty=True)

    def _service_headers(self):
        return {'apikey': SUPABASE_SERVICE_KEY, 'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}'}

    def _supabase_json(self, path, method='GET', body=None, headers=None, allow_empty=False):
        req = urllib.request.Request(
            f'{SUPABASE_URL}{path}',
            data=body,
            method=method,
            headers=headers or {},
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                raw = response.read()
                if allow_empty and not raw:
                    return None
                return json.loads(raw or b'{}')
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode('utf-8', errors='ignore')
            raise Exception(raw or f'Supabase HTTP {exc.code}')

    def _send(self, status, data):
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
