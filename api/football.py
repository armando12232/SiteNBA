import json, os, math, time, urllib.request, urllib.parse
from http.server import BaseHTTPRequestHandler

RAPIDAPI_KEY = os.environ.get('RAPIDAPI_KEY', '')

# ─── LIGAS ───────────────────────────────────────────────────────────────────
LEAGUES = {
    'brasileirao': {'id': 71,  'name': 'Brasileirão',      'flag': '🇧🇷', 'season': 2025},
    'champions':   {'id': 2,   'name': 'Champions League', 'flag': '🏆',  'season': 2024},
    'premier':     {'id': 39,  'name': 'Premier League',   'flag': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'season': 2024},
    'laliga':      {'id': 140, 'name': 'La Liga',          'flag': '🇪🇸', 'season': 2024},
    'bundesliga':  {'id': 78,  'name': 'Bundesliga',       'flag': '🇩🇪', 'season': 2024},
    'seriea':      {'id': 135, 'name': 'Serie A',          'flag': '🇮🇹', 'season': 2024},
    'ligue1':      {'id': 61,  'name': 'Ligue 1',          'flag': '🇫🇷', 'season': 2024},
    'libertadores':{'id': 13,  'name': 'Libertadores',     'flag': '🌎',  'season': 2025},
}

LEAGUE_IDS = {v['id'] for v in LEAGUES.values()}

# ─── CACHE ────────────────────────────────────────────────────────────────────
_cache = {}

def _cache_get(key, ttl=3600):
    e = _cache.get(key)
    if e and time.time() - e['ts'] < ttl:
        return e['data']
    return None

def _cache_set(key, data):
    _cache[key] = {'data': data, 'ts': time.time()}

# ─── API-FOOTBALL ─────────────────────────────────────────────────────────────
def _fetch(endpoint, params):
    if not RAPIDAPI_KEY:
        return None
    url = f'https://api-football-v1.p.rapidapi.com/v3/{endpoint}?{urllib.parse.urlencode(params)}'
    req = urllib.request.Request(url, headers={
        'X-RapidAPI-Key':  RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com',
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f'API-Football error [{endpoint}]: {e}')
        return None

# ─── JOGOS DO DIA ─────────────────────────────────────────────────────────────
def get_fixtures_today():
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    ck = f'fixtures_{today}'
    cached = _cache_get(ck, ttl=300)
    if cached is not None:
        return cached

    data = _fetch('fixtures', {'date': today, 'timezone': 'America/Sao_Paulo'})
    if not data:
        return []

    result = []
    for f in (data.get('response') or []):
        lid = f.get('league', {}).get('id')
        if lid not in LEAGUE_IDS:
            continue
        league_info = next((v for v in LEAGUES.values() if v['id'] == lid), {})
        status = f.get('fixture', {}).get('status', {}).get('short', '')
        result.append({
            'id':          f['fixture']['id'],
            'date':        f['fixture']['date'],
            'status':      status,
            'league_id':   lid,
            'league_name': f['league']['name'],
            'league_flag': league_info.get('flag', '⚽'),
            'home':        f['teams']['home']['name'],
            'home_logo':   f['teams']['home']['logo'],
            'away':        f['teams']['away']['name'],
            'away_logo':   f['teams']['away']['logo'],
            'home_goals':  f['goals'].get('home'),
            'away_goals':  f['goals'].get('away'),
            'live':        status in ('1H', '2H', 'HT', 'ET', 'BT', 'P'),
        })

    _cache_set(ck, result)
    return result

# ─── PLAYERS DO JOGO ──────────────────────────────────────────────────────────
def get_fixture_players(fixture_id):
    ck = f'fp_{fixture_id}'
    cached = _cache_get(ck, ttl=120)
    if cached is not None:
        return cached

    data = _fetch('fixtures/players', {'fixture': fixture_id})
    if not data:
        return []

    players = []
    for team in (data.get('response') or []):
        team_name = team.get('team', {}).get('name', '')
        team_logo = team.get('team', {}).get('logo', '')
        for p in (team.get('players') or []):
            pi   = p.get('player', {})
            st   = (p.get('statistics') or [{}])[0]

            def g(path, default=0):
                parts = path.split('.')
                v = st
                for part in parts:
                    v = (v or {}).get(part)
                return v if v is not None else default

            minutes = g('games.minutes') or 0
            shots   = g('shots.total')   or 0
            shots_on= g('shots.on')      or 0
            goals   = g('goals.total')   or 0
            assists = g('goals.assists') or 0
            tackles = g('tackles.total') or 0
            fouls   = g('fouls.committed') or 0

            # Projeção para 90 min
            pace = max(minutes / 90, 0.1)
            players.append({
                'id':          pi.get('id'),
                'name':        pi.get('name', ''),
                'photo':       pi.get('photo', ''),
                'team':        team_name,
                'team_logo':   team_logo,
                'minutes':     minutes,
                'rating':      g('games.rating', None),
                'shots':       shots,
                'shots_on':    shots_on,
                'goals':       goals,
                'assists':     assists,
                'tackles':     tackles,
                'fouls':       fouls,
                'cards_y':     g('cards.yellow') or 0,
                'dribbles':    g('dribbles.success') or 0,
                'passes':      g('passes.total') or 0,
                'key_passes':  g('passes.key') or 0,
                # ritmo projetado para 90'
                'proj_shots':   round(shots   / pace, 1),
                'proj_shots_on':round(shots_on/ pace, 1),
                'proj_goals':   round(goals   / pace, 1),
                'proj_tackles': round(tackles / pace, 1),
                'proj_fouls':   round(fouls   / pace, 1),
            })

    _cache_set(ck, players)
    return players

# ─── STATS DA TEMPORADA ───────────────────────────────────────────────────────
def get_player_season(player_id, league_id, season):
    ck = f'ps_{player_id}_{league_id}_{season}'
    cached = _cache_get(ck, ttl=7200)
    if cached is not None:
        return cached

    data = _fetch('players', {'id': player_id, 'league': league_id, 'season': season})
    if not data or not data.get('response'):
        return {}

    st = (data['response'][0].get('statistics') or [{}])[0]
    apps = st.get('games', {}).get('appearences') or 1

    def avg(val):
        return round((val or 0) / apps, 1)

    result = {
        'appearances':  apps,
        'avg_shots':    avg((st.get('shots') or {}).get('total')),
        'avg_shots_on': avg((st.get('shots') or {}).get('on')),
        'avg_goals':    avg((st.get('goals') or {}).get('total')),
        'avg_assists':  avg((st.get('goals') or {}).get('assists')),
        'avg_tackles':  avg((st.get('tackles') or {}).get('total')),
        'avg_fouls':    avg((st.get('fouls') or {}).get('committed')),
    }

    _cache_set(ck, result)
    return result

# ─── PROPS SINTÉTICAS ─────────────────────────────────────────────────────────
def build_player_props(player, season_avg):
    props = {}
    mapping = [
        ('shots',    'avg_shots',    'Finalizações'),
        ('shots_on', 'avg_shots_on', 'Chutes ao Gol'),
        ('goals',    'avg_goals',    'Gols'),
        ('assists',  'avg_assists',  'Assistências'),
        ('tackles',  'avg_tackles',  'Desarmes'),
        ('fouls',    'avg_fouls',    'Faltas'),
    ]
    for prop_key, avg_key, label in mapping:
        avg = season_avg.get(avg_key) or 0
        if avg < 0.2:
            continue
        line = math.floor(avg) + 0.5
        cur  = player.get(prop_key) or 0
        proj = player.get(f'proj_{prop_key}') or 0
        props[prop_key] = {
            'label':   label,
            'line':    line,
            'avg':     avg,
            'current': cur,
            'proj':    proj,
            'on_pace': proj >= line,
        }
    return props

# ─── HANDLER ──────────────────────────────────────────────────────────────────
class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        from urllib.parse import urlparse, parse_qs
        q = parse_qs(urlparse(self.path).query)
        t = q.get('type', [''])[0]

        try:
            if t == 'fixtures':
                data = get_fixtures_today()
                self._json(200, {'fixtures': data, 'count': len(data)})

            elif t == 'players':
                fid = q.get('fixture_id', [''])[0]
                if not fid:
                    self._json(400, {'error': 'fixture_id required'}); return
                self._json(200, {'players': get_fixture_players(int(fid))})

            elif t == 'leagues':
                self._json(200, {'leagues': [{'key': k, **v} for k, v in LEAGUES.items()]})

            elif t == 'status':
                self._json(200, {'ok': True, 'key_set': bool(RAPIDAPI_KEY)})

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
