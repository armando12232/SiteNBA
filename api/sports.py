import json, os, time, urllib.request, urllib.parse, sys
from http.server import BaseHTTPRequestHandler

API_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(API_DIR)
sys.path.insert(0, API_DIR)
sys.path.insert(0, ROOT_DIR)
try:
    from _security import rate_limit_check, get_client_ip, sanitize_team_name, is_valid_id
except ImportError:
    def rate_limit_check(ip): return True
    def get_client_ip(h): return '0.0.0.0'
    def sanitize_team_name(s): return (s or '')[:60]
    def is_valid_id(s): return bool(s) and len(s) <= 40

try:
    from server.wnba_data import get_players as get_wnba_players, get_pregame as get_wnba_pregame, get_player_by_name as get_wnba_player_by_name
except ImportError:
    get_wnba_players = get_wnba_pregame = get_wnba_player_by_name = None

# ── ESPN Base ──────────────────────────────────────────────────────────────────
ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'

# Slugs ESPN por esporte/liga
SPORT_SLUGS = {
    'nfl':  ('football',    'nfl'),
    'nhl':  ('hockey',      'nhl'),
    'mlb':  ('baseball',    'mlb'),
    'nba':  ('basketball',  'nba'),
    'wnba': ('basketball',  'wnba'),
}

# ── Cache simples ──────────────────────────────────────────────────────────────
_cache = {}
def _cache_get(k):
    v = _cache.get(k)
    if v and time.time() < v['exp']:
        return v['data']
    return None

def _cache_set(k, data, ttl=60):
    _cache[k] = {'data': data, 'exp': time.time() + ttl}

# ── ESPN fetch ─────────────────────────────────────────────────────────────────
def espn_fetch(path, ttl=60):
    ck = f'espn_{path}'
    cached = _cache_get(ck)
    if cached is not None:
        return cached
    try:
        url = f'{ESPN_BASE}/{path}'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        _cache_set(ck, data, ttl)
        return data
    except Exception as e:
        print(f'ESPN fetch error [{path}]: {e}')
        return None

# ── Scoreboard ─────────────────────────────────────────────────────────────────
def get_scoreboard(league):
    if league not in SPORT_SLUGS:
        return []
    sport, slug = SPORT_SLUGS[league]
    data = espn_fetch(f'{sport}/{slug}/scoreboard', ttl=30)
    if not data:
        return []

    events = data.get('events') or []
    results = []
    for ev in events:
        comps = ev.get('competitions') or [{}]
        comp  = comps[0] if comps else {}
        competitors = comp.get('competitors') or []

        home = next((c for c in competitors if c.get('homeAway') == 'home'), {})
        away = next((c for c in competitors if c.get('homeAway') == 'away'), {})

        status_obj = ev.get('status') or {}
        status_type = status_obj.get('type') or {}
        state  = status_type.get('state', 'pre')   # pre / in / post
        detail = status_type.get('shortDetail') or status_obj.get('displayClock', '')
        period = status_obj.get('period', 0)

        home_team = home.get('team') or {}
        away_team = away.get('team') or {}

        home_score = home.get('score', '')
        away_score = away.get('score', '')

        # Situação de jogo ao vivo
        situation = comp.get('situation') or {}
        broadcasts = [b.get('names', []) for b in (comp.get('broadcasts') or [])]

        results.append({
            'id':           ev.get('id', ''),
            'name':         ev.get('name', ''),
            'date':         ev.get('date', ''),
            'state':        state,
            'detail':       detail,
            'period':       period,
            'home': {
                'id':     home_team.get('id', ''),
                'name':   home_team.get('displayName', ''),
                'abbr':   home_team.get('abbreviation', ''),
                'logo':   home_team.get('logo', ''),
                'color':  home_team.get('color', '333333'),
                'score':  home_score,
                'record': (home.get('records') or [{}])[0].get('summary', '') if home.get('records') else '',
            },
            'away': {
                'id':     away_team.get('id', ''),
                'name':   away_team.get('displayName', ''),
                'abbr':   away_team.get('abbreviation', ''),
                'logo':   away_team.get('logo', ''),
                'color':  away_team.get('color', '333333'),
                'score':  away_score,
                'record': (away.get('records') or [{}])[0].get('summary', '') if away.get('records') else '',
            },
            'venue':      (comp.get('venue') or {}).get('fullName', ''),
            'situation':  situation,
            'league':     league.upper(),
        })

    return results

# ── Boxscore / Game Detail ─────────────────────────────────────────────────────
def get_game_detail(league, game_id):
    if league not in SPORT_SLUGS:
        return None
    sport, slug = SPORT_SLUGS[league]
    data = espn_fetch(f'{sport}/{slug}/summary?event={game_id}', ttl=30)
    if not data:
        return None

    # Boxscore
    boxscore = data.get('boxscore') or {}
    players  = boxscore.get('players') or []

    # Leaders
    leaders = data.get('leaders') or []

    # Game Info
    header = data.get('header') or {}
    comps  = header.get('competitions') or [{}]
    comp   = comps[0] if comps else {}

    return {
        'players':  players,
        'leaders':  leaders,
        'boxscore': boxscore,
        'header':   header,
    }

# ── Standings ─────────────────────────────────────────────────────────────────
def get_standings(league):
    if league not in SPORT_SLUGS:
        return []
    sport, slug = SPORT_SLUGS[league]
    # standings usa endpoint diferente
    data = espn_fetch(f'{sport}/{slug}/standings', ttl=3600)
    if not data:
        return []
    return data.get('children') or data.get('standings') or []

# ── News ──────────────────────────────────────────────────────────────────────
def get_news(league, limit=10):
    if league not in SPORT_SLUGS:
        return []
    sport, slug = SPORT_SLUGS[league]
    data = espn_fetch(f'{sport}/{slug}/news?limit={limit}', ttl=300)
    if not data:
        return []
    articles = data.get('articles') or []
    return [{
        'headline':    a.get('headline', ''),
        'description': a.get('description', ''),
        'published':   a.get('published', ''),
        'link':        a.get('links', {}).get('web', {}).get('href', ''),
        'image':       (a.get('images') or [{}])[0].get('url', '') if a.get('images') else '',
    } for a in articles[:limit]]

# ── Handler ───────────────────────────────────────────────────────────────────
VALID_LEAGUES = {'nfl', 'nhl', 'mlb', 'nba', 'wnba'}
VALID_TYPES   = {'scoreboard', 'game', 'standings', 'news', 'players', 'pregame', 'pregame_by_name'}

class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        ip = get_client_ip(self)
        if not rate_limit_check(ip):
            self._json(429, {'error': 'rate limit'})
            return

        qs  = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        t   = (qs.get('type',   [''])[0]).lower().strip()
        lg  = (qs.get('league', [''])[0]).lower().strip()
        gid = (qs.get('game_id',[''])[0]).strip()

        if t not in VALID_TYPES:
            self._json(400, {'error': f'invalid type: {t}'})
            return
        if lg not in VALID_LEAGUES:
            self._json(400, {'error': f'invalid league: {lg}'})
            return

        if lg == 'wnba' and t == 'players':
            if not get_wnba_players:
                self._json(500, {'error': 'internal server error'})
                return
            limit = int(qs.get('limit', ['60'])[0] or 60)
            self._json(200, {'players': get_wnba_players(limit)})
        elif lg == 'wnba' and t == 'pregame':
            if not get_wnba_pregame:
                self._json(500, {'error': 'internal server error'})
                return
            player_id = qs.get('playerId', [''])[0]
            if not is_valid_id(player_id) or not str(player_id).isdigit():
                self._json(400, {'error': 'invalid playerId'})
                return
            self._json(200, get_wnba_pregame(int(player_id)))
        elif lg == 'wnba' and t == 'pregame_by_name':
            if not get_wnba_player_by_name or not get_wnba_pregame:
                self._json(500, {'error': 'internal server error'})
                return
            name = sanitize_team_name(qs.get('name', [''])[0]).strip()
            if not name:
                self._json(400, {'error': 'invalid name'})
                return
            player = get_wnba_player_by_name(name)
            if not player:
                self._json(404, {'error': 'player not found'})
                return
            self._json(200, get_wnba_pregame(player['player_id']))
        elif t == 'scoreboard':
            self._json(200, {'games': get_scoreboard(lg)})
        elif t == 'game':
            if not gid:
                self._json(400, {'error': 'game_id required'})
                return
            detail = get_game_detail(lg, gid)
            self._json(200 if detail else 404, detail or {'error': 'not found'})
        elif t == 'standings':
            self._json(200, {'standings': get_standings(lg)})
        elif t == 'news':
            self._json(200, {'articles': get_news(lg)})

    def _cors(self):
        origin = os.environ.get('SITE_URL', 'https://site-nba-ten.vercel.app')
        self.send_header('Access-Control-Allow-Origin',  origin)
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self._cors()
        self.send_header('Content-Type',   'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control',  'no-store')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a): pass
