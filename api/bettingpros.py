from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.parse import parse_qs, urlparse, urlencode
import json, time
from datetime import datetime, timezone

cache = {}
CACHE_TTL = 300  # 5 min

def _cache_get(key):
    if key in cache:
        data, ts = cache[key]
        if time.time() - ts < CACHE_TTL:
            return data
    return None

def _cache_set(key, data):
    cache[key] = (data, time.time())

BP_HEADERS = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://www.bettingpros.com',
    'Referer': 'https://www.bettingpros.com/nba/picks/prop-bets/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
}

# market_id por categoria
MARKETS = {
    'pts':  156,   # Player Points
    'reb':  151,   # Player Rebounds
    'ast':  157,   # Player Assists
    'fg3m': 162,   # Player 3-Pt Made
    'pra':  147,   # Pts+Reb+Ast
    'pr':   160,   # Pts+Reb
    'pa':   152,   # Pts+Ast
    'stl':  142,   # Steals
    'blk':  136,   # Blocks
}

def hit_rate(period_data):
    """Calcula hit rate Over de um período."""
    if not period_data:
        return None
    o = period_data.get('over', 0)
    u = period_data.get('under', 0)
    total = o + u
    if total == 0:
        return None
    return round((o / total) * 100)


def fetch_bp(params: dict):
    qs = urlencode(params)
    url = f'https://api.bettingpros.com/v3/props?{qs}'
    req = Request(url, headers=BP_HEADERS)
    with urlopen(req, timeout=10) as r:
        return json.loads(r.read())

def get_props(date_str: str = None, stats: list = None):
    """Busca props do BettingPros para todas as categorias."""
    if not date_str:
        date_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')

    if not stats:
        stats = ['pts', 'reb', 'ast', 'fg3m']

    cache_key = f'bp2_{date_str}_{"_".join(stats)}'  # v2: usa market_id correto
    cached = _cache_get(cache_key)
    if cached:
        return cached

    all_props = {}  # player_name -> { pts: {...}, reb: {...}, ... }

    for stat in stats:
        market_id = MARKETS.get(stat)
        if not market_id:
            continue

        try:
            data = fetch_bp({
                'sport': 'NBA',
                'market_id': market_id,  # precisa ser market_id (int), nao market (string)
                'date': date_str,
                'limit': 100,
                'sort': 'diff',
                'sort_direction': 'desc',
            })

            for prop in (data.get('props') or []):
                participant = prop.get('participant', {})
                player_info = participant.get('player', {})
                name = participant.get('name', '')
                if not name:
                    continue

                over  = prop.get('over', {})
                perf  = prop.get('performance', {})
                proj  = prop.get('projection', {})

                prop_data = {
                    'line':       over.get('line'),
                    'odds':       over.get('odds'),
                    'consensus':  over.get('consensus_line'),
                    'l5':         hit_rate(perf.get('last_5')),
                    'l10':        hit_rate(perf.get('last_10')),
                    'l15':        hit_rate(perf.get('last_15')),
                    'l20':        hit_rate(perf.get('last_20')),
                    'season':     hit_rate(perf.get('season')),
                    'h2h':        hit_rate(perf.get('h2h')),
                    'streak':     perf.get('streak'),
                    'streak_type': perf.get('streak_type'),
                    'projection': proj.get('value'),
                    'ev':         round(proj.get('expected_value', 0) * 100, 1) if proj.get('expected_value') else None,
                    'bet_rating': proj.get('bet_rating'),
                    'diff':       proj.get('diff'),
                    'rec_side':   proj.get('recommended_side'),
                }

                if name not in all_props:
                    all_props[name] = {
                        'player_name': name,
                        'team':       player_info.get('team', ''),
                        'position':   player_info.get('position', ''),
                        'image':      player_info.get('image', ''),
                        'props':      {},
                    }

                all_props[name]['props'][stat] = prop_data

        except Exception as e:
            print(f'BP error {stat}: {e}')
            continue

    result = list(all_props.values())
    _cache_set(cache_key, result)
    return result


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        date_str = params.get('date', [None])[0]
        stats_raw = params.get('stats', ['pts,reb,ast,fg3m'])[0]
        stats = [s.strip() for s in stats_raw.split(',') if s.strip()]

        try:
            data = get_props(date_str, stats)
            # Se vazio, tenta dia anterior (UTC pode estar adiantado)
            if not data and date_str:
                from datetime import datetime, timedelta
                prev = (datetime.strptime(date_str, '%Y-%m-%d') - timedelta(days=1)).strftime('%Y-%m-%d')
                data_prev = get_props(prev, stats)
                if data_prev:
                    data = data_prev
                    date_str = prev
            self._send(200, {'players': data or [], 'count': len(data or []), 'date': date_str})
        except Exception as e:
            self._send(500, {'error': str(e)})

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,OPTIONS')
        self.end_headers()

    def _send(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, f, *a):
        pass
