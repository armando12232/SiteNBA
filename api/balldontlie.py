import json, os, time, urllib.request
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from _security import rate_limit_check, get_client_ip
except ImportError:
    def rate_limit_check(ip): return True
    def get_client_ip(h): return '0.0.0.0'

BLL_KEY = os.environ.get("BALLDONTLIE_KEY", "18fcde1c-d2bd-41dd-b2dc-7226bfb9c2b6")
BLL_BASE = "https://api.balldontlie.io/v1"

_cache = {}
def _cache_get(k):
    v = _cache.get(k)
    return v['data'] if v and time.time() < v['exp'] else None

def _cache_set(k, data, ttl=3600):
    _cache[k] = {'data': data, 'exp': time.time() + ttl}

def _fetch(path, params=None):
    url = f"{BLL_BASE}/{path}"
    if params:
        from urllib.parse import urlencode
        url += "?" + urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers={"Authorization": BLL_KEY})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())

def get_player_id(name):
    """Busca player_id pelo nome."""
    cached = _cache_get(f"player_{name}")
    if cached: return cached
    data = _fetch("players", {"search": name, "per_page": 5})
    players = data.get("data", [])
    if not players: return None
    # Match exato ou o mais próximo
    exact = next((p for p in players if p['first_name'] + ' ' + p['last_name'] == name), None)
    pid = (exact or players[0])['id']
    _cache_set(f"player_{name}", pid, ttl=86400)
    return pid

def get_game_log(player_id, season=2025):
    """Últimos 15 jogos do jogador."""
    cached = _cache_get(f"gamelog_{player_id}_{season}")
    if cached: return cached
    data = _fetch("stats", {
        "player_ids[]": player_id,
        "seasons[]": season,
        "per_page": 15,
    })
    rows = data.get("data", [])
    # Ordenar do mais recente para o mais antigo
    rows.sort(key=lambda r: r['game']['date'], reverse=True)
    result = [
        {
            "date": r['game']['date'][:10],
            "opp":  r['game']['home_team_id'] == r['team']['id'] and r['game'].get('visitor_team', {}).get('abbreviation', '') or r['game'].get('home_team', {}).get('abbreviation', ''),
            "pts":  float(r.get('pts') or 0),
            "reb":  float(r.get('reb') or 0),
            "ast":  float(r.get('ast') or 0),
            "fg3m": float(r.get('fg3m') or 0),
            "min":  r.get('min', ''),
        }
        for r in rows if r.get('min') and r.get('min') != '00'
    ]
    _cache_set(f"gamelog_{player_id}_{season}", result, ttl=3600)
    return result

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        ip = get_client_ip(self.headers)
        if not rate_limit_check(ip):
            self._send(429, {"error": "rate limited"}); return

        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        req_type = params.get("type", [""])[0]

        try:
            if req_type == "debug_search":
                name = params.get("name", [""])[0].strip()
                raw = _fetch("players", {"search": name, "per_page": 10})
                self._send(200, raw)
            elif req_type == "gamelog_by_name":
                name = params.get("name", [""])[0].strip()
                if not name or len(name) > 60:
                    self._send(400, {"error": "invalid name"}); return
                season = int(params.get("season", ["2025"])[0])
                pid = get_player_id(name)
                if not pid:
                    self._send(404, {"error": "player not found"}); return
                log = get_game_log(pid, season)
                self._send(200, {"player_id": pid, "last5_games": log})
            else:
                self._send(400, {"error": "invalid type"})
        except Exception as e:
            self._send(500, {"error": str(e)[:200]})

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

    def _send(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'public, max-age=300')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def log_message(self, f, *a): pass
