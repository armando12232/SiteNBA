from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.parse import parse_qs, urlparse
import json, time

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

NBA_HEADERS = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
}

def get_prizepicks():
    """Busca props reais do PrizePicks para NBA."""
    cached = _cache_get('prizepicks')
    if cached:
        return cached

    try:
        url = 'https://api.prizepicks.com/projections?league_id=7&per_page=250&single_stat=true&game_mode=false'
        req = Request(url, headers={
            **NBA_HEADERS,
            'Referer': 'https://app.prizepicks.com/',
            'Origin': 'https://app.prizepicks.com',
        })
        with urlopen(req, timeout=10) as r:
            raw = json.loads(r.read())

        projections = raw.get('data', [])
        included    = raw.get('included', [])

        # Mapear jogadores pelo ID
        players = {}
        for item in included:
            if item.get('type') == 'new_player':
                pid = item['id']
                attrs = item.get('attributes', {})
                players[pid] = {
                    'name':     attrs.get('name', ''),
                    'team':     attrs.get('team', ''),
                    'position': attrs.get('position', ''),
                    'image':    attrs.get('image_url', ''),
                }

        # Mapear jogos pelo ID
        games = {}
        for item in included:
            if item.get('type') == 'game':
                gid = item['id']
                attrs = item.get('attributes', {})
                games[gid] = {
                    'away': attrs.get('away_team', ''),
                    'home': attrs.get('home_team', ''),
                    'time': attrs.get('start_time', ''),
                }

        # Montar props
        result = []
        for proj in projections:
            attrs = proj.get('attributes', {})
            rels  = proj.get('relationships', {})

            pid = rels.get('new_player', {}).get('data', {}).get('id')
            gid = rels.get('game', {}).get('data', {}).get('id')

            stat_type  = attrs.get('stat_type', '')
            line_score = attrs.get('line_score')
            start_time = attrs.get('start_time', '')
            status     = attrs.get('status', '')

            if status in ('frozen', 'disabled') or line_score is None:
                continue

            player = players.get(pid, {})
            game   = games.get(gid, {})

            # Mapear stat_type para nosso formato
            stat_map = {
                'Points':         'pts',
                'Rebounds':       'reb',
                'Assists':        'ast',
                '3-Pt Made':      'fg3m',
                'Pts+Reb+Ast':    'pra',
                'Pts+Reb':        'pr',
                'Pts+Ast':        'pa',
                'Steals':         'stl',
                'Blocked Shots':  'blk',
                'Turnovers':      'to',
            }
            stat_key = stat_map.get(stat_type)
            if not stat_key:
                continue

            result.append({
                'player_name': player.get('name', ''),
                'team':        player.get('team', ''),
                'position':    player.get('position', ''),
                'stat':        stat_key,
                'stat_label':  stat_type,
                'line':        float(line_score),
                'game_away':   game.get('away', ''),
                'game_home':   game.get('home', ''),
                'game_time':   start_time or game.get('time', ''),
            })

        _cache_set('prizepicks', result)
        return result

    except Exception as e:
        return {'error': str(e)}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        try:
            data = get_prizepicks()
            if isinstance(data, dict) and 'error' in data:
                self._send(500, data)
            else:
                self._send(200, {'lines': data, 'count': len(data)})
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
