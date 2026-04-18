import json, time, urllib.request
from http.server import BaseHTTPRequestHandler

# ESPN API — gratuita, sem necessidade de key
ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'

LEAGUES = [
    {'key': 'brasileirao',  'slug': 'bra.1',                   'name': 'Brasileirao Serie A', 'flag': '🇧🇷'},
    {'key': 'champions',    'slug': 'uefa.champions',           'name': 'Champions League',    'flag': '🏆'},
    {'key': 'premier',      'slug': 'eng.1',                   'name': 'Premier League',      'flag': '🏴󠁧󠁢󠁥󠁮󠁧󠁿'},
    {'key': 'laliga',       'slug': 'esp.1',                   'name': 'La Liga',             'flag': '🇪🇸'},
    {'key': 'bundesliga',   'slug': 'ger.1',                   'name': 'Bundesliga',          'flag': '🇩🇪'},
    {'key': 'seriea',       'slug': 'ita.1',                   'name': 'Serie A',             'flag': '🇮🇹'},
    {'key': 'ligue1',       'slug': 'fra.1',                   'name': 'Ligue 1',             'flag': '🇫🇷'},
    {'key': 'libertadores', 'slug': 'conmebol.libertadores',   'name': 'Libertadores',        'flag': '🌎'},
]

_cache = {}

def _cache_get(key, ttl=60):
    e = _cache.get(key)
    if e and time.time() - e['ts'] < ttl:
        return e['data']
    return None

def _cache_set(key, data):
    _cache[key] = {'data': data, 'ts': time.time()}

def _fetch_espn(slug):
    url = f'{ESPN_BASE}/{slug}/scoreboard'
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
    })
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f'ESPN error [{slug}]: {e}')
        return None

def _parse_event(event, league):
    comp = (event.get('competitions') or [{}])[0]
    competitors = comp.get('competitors') or []
    home = next((c for c in competitors if c.get('homeAway') == 'home'), {})
    away = next((c for c in competitors if c.get('homeAway') == 'away'), {})
    status = event.get('status', {})
    state = status.get('type', {}).get('state', 'pre')
    return {
        'id':           event.get('id'),
        'date':         event.get('date'),
        'league_key':   league['key'],
        'league_name':  league['name'],
        'league_flag':  league['flag'],
        'home':         home.get('team', {}).get('displayName', ''),
        'home_logo':    home.get('team', {}).get('logo', ''),
        'home_goals':   home.get('score'),
        'away':         away.get('team', {}).get('displayName', ''),
        'away_logo':    away.get('team', {}).get('logo', ''),
        'away_goals':   away.get('score'),
        'status':       state,
        'status_long':  status.get('type', {}).get('detail', ''),
        'elapsed':      status.get('displayClock') if state == 'in' else None,
        'period':       status.get('period'),
        'live':         state == 'in',
        'finished':     state == 'post',
        'venue':        (comp.get('venue') or {}).get('fullName', ''),
    }

def get_fixtures(league_key=None):
    ck = f'fixtures_{league_key or "all"}'
    cached = _cache_get(ck, ttl=60)
    if cached is not None:
        return cached

    leagues = [l for l in LEAGUES if not league_key or l['key'] == league_key]
    all_fixtures = []

    for league in leagues:
        data = _fetch_espn(league['slug'])
        if not data:
            continue
        for event in (data.get('events') or []):
            all_fixtures.append(_parse_event(event, league))

    # Ordenar: ao vivo primeiro, depois agendados, depois encerrados
    order = {'in': 0, 'pre': 1, 'post': 2}
    all_fixtures.sort(key=lambda f: order.get(f['status'], 3))

    _cache_set(ck, all_fixtures)
    return all_fixtures

def get_live(league_key=None):
    fixtures = get_fixtures(league_key)
    return [f for f in fixtures if f['live']]

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        from urllib.parse import urlparse, parse_qs
        q = parse_qs(urlparse(self.path).query)
        t = q.get('type', ['fixtures'])[0]
        league = q.get('league', [None])[0]

        try:
            if t == 'fixtures':
                data = get_fixtures(league)
                self._json(200, {'fixtures': data, 'count': len(data)})

            elif t == 'live':
                data = get_live(league)
                self._json(200, {'fixtures': data, 'count': len(data), 'live': True})

            elif t == 'leagues':
                self._json(200, {'leagues': LEAGUES})

            elif t == 'status':
                self._json(200, {'ok': True, 'source': 'ESPN'})

            else:
                self._json(400, {'error': f'type invalido: {t!r}'})

        except Exception as e:
            self._json(500, {'error': str(e)})

    def _json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type',   'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a): pass
