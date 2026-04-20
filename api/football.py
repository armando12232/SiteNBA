import json, urllib.request
from http.server import BaseHTTPRequestHandler

ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'

LEAGUES = [
    {'key': 'brasileirao',  'slug': 'bra.1',                 'name': 'Brasileirao Serie A', 'flag': '\U0001F1E7\U0001F1F7'},
    {'key': 'champions',    'slug': 'uefa.champions',         'name': 'Champions League',    'flag': '\U0001F3C6'},
    {'key': 'premier',      'slug': 'eng.1',                 'name': 'Premier League',       'flag': '\U0001F3F4\U000E0067\U000E0062\U000E0065\U000E006E\U000E0067\U000E007F'},
    {'key': 'laliga',       'slug': 'esp.1',                 'name': 'La Liga',              'flag': '\U0001F1EA\U0001F1F8'},
    {'key': 'bundesliga',   'slug': 'ger.1',                 'name': 'Bundesliga',           'flag': '\U0001F1E9\U0001F1EA'},
    {'key': 'seriea',       'slug': 'ita.1',                 'name': 'Serie A',              'flag': '\U0001F1EE\U0001F1F9'},
    {'key': 'ligue1',       'slug': 'fra.1',                 'name': 'Ligue 1',              'flag': '\U0001F1EB\U0001F1F7'},
    {'key': 'libertadores', 'slug': 'conmebol.libertadores', 'name': 'Libertadores',         'flag': '\U0001F30E'},
]
SLUG_MAP = {l['key']: l['slug'] for l in LEAGUES}

def espn_fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read())

def parse_fixture(ev, league, state=None):
    comp  = ev.get('competitions', [{}])[0]
    status = comp.get('status', {})
    s     = state or status.get('type', {}).get('state', 'pre')
    teams = comp.get('competitors', [])
    home  = next((t for t in teams if t.get('homeAway') == 'home'), {})
    away  = next((t for t in teams if t.get('homeAway') == 'away'), {})
    elapsed = status.get('displayClock', '') if s == 'in' else None
    period  = status.get('period', None)   if s in ('in', 'post') else None
    return {
        'id':           str(ev.get('id', '')),
        'date':         comp.get('date', ''),
        'league_key':   league['key'],
        'league_name':  league['name'],
        'league_flag':  league['flag'],
        'home':         home.get('team', {}).get('displayName', ''),
        'home_logo':    home.get('team', {}).get('logo', ''),
        'home_goals':   home.get('score', None),
        'away':         away.get('team', {}).get('displayName', ''),
        'away_logo':    away.get('team', {}).get('logo', ''),
        'away_goals':   away.get('score', None),
        'status':       s if s else 'pre',
        'status_long':  status.get('type', {}).get('shortDetail', ''),
        'elapsed':      elapsed,
        'period':       period,
        'live':         s == 'in',
        'finished':     s == 'post',
        'venue':        comp.get('venue', {}).get('fullName', ''),
    }

def get_stats(game_id, league_key):
    slug = SLUG_MAP.get(league_key, 'eng.1')
    url  = f'{ESPN_BASE}/{slug}/summary?event={game_id}'
    try:
        data = espn_fetch(url)
    except Exception as e:
        return {'error': str(e)}

    result = {}

    # Stats por time
    boxscore   = data.get('boxscore', {})
    teams_data = boxscore.get('teams', [])
    WANTED = [
        'possessionPct', 'totalShots', 'shotsOnTarget', 'wonCorners',
        'foulsCommitted', 'yellowCards', 'redCards', 'offsides',
        'saves', 'passPct', 'accuratePasses', 'totalPasses',
        'effectiveTackles', 'interceptions',
    ]
    stats_out = []
    for t in teams_data:
        team_stats = {}
        for s in t.get('statistics', []):
            if s['name'] in WANTED:
                team_stats[s['name']] = s.get('displayValue', s.get('value', ''))
        stats_out.append({
            'team':         t.get('team', {}).get('displayName', ''),
            'abbreviation': t.get('team', {}).get('abbreviation', ''),
            'stats':        team_stats,
        })
    result['teams'] = stats_out

    # Eventos chave (gols, cartoes)
    IMPORTANT = {'Goal', 'Yellow Card', 'Red Card', 'Penalty', 'Own Goal', 'Substitution'}
    key_events = data.get('keyEvents', [])
    result['events'] = [
        {
            'type':  e.get('type', {}).get('text', ''),
            'clock': e.get('clock', {}).get('displayValue', ''),
            'text':  e.get('text', ''),
            'team':  e.get('team', {}).get('displayName', '') if e.get('team') else '',
        }
        for e in key_events
        if e.get('type', {}).get('text', '') in IMPORTANT
    ][:20]

    # Odds
    odds = data.get('odds', [{}])
    if odds and odds[0]:
        o = odds[0]
        result['odds'] = {
            'spread':    o.get('spread'),
            'overUnder': o.get('overUnder'),
            'provider':  o.get('provider', {}).get('name', ''),
        }

    # Rosters com stats de jogadores
    PLAYER_STATS = {
        'totalGoals', 'goalAssists', 'totalShots', 'shotsOnTarget',
        'yellowCards', 'redCards', 'foulsCommitted', 'foulsSuffered',
        'offsides', 'subIns', 'shotsFaced', 'goalsConceded',
    }
    rosters_out = []
    for r in data.get('rosters', []):
        players = []
        for p in r.get('roster', []):
            athlete = p.get('athlete', {})
            pstats = {}
            for s in p.get('stats', []):
                if s.get('name') in PLAYER_STATS:
                    pstats[s['name']] = s.get('displayValue', '0')
            players.append({
                'name':       athlete.get('displayName', ''),
                'short':      athlete.get('shortName', ''),
                'jersey':     p.get('jersey', ''),
                'position':   p.get('position', {}).get('abbreviation', ''),
                'positionFull': p.get('position', {}).get('displayName', ''),
                'starter':    bool(p.get('starter')),
                'subbedIn':   bool(p.get('subbedIn')),
                'subbedOut':  bool(p.get('subbedOut')),
                'stats':      pstats,
            })
        rosters_out.append({
            'team':      r.get('team', {}).get('displayName', ''),
            'homeAway':  r.get('homeAway', ''),
            'formation': r.get('formation', {}).get('name', '') if isinstance(r.get('formation'), dict) else '',
            'players':   players,
        })
    result['rosters'] = rosters_out

    return result

class handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_GET(self):
        from urllib.parse import urlparse, parse_qs
        params = parse_qs(urlparse(self.path).query)
        t = params.get('type', ['fixtures'])[0]

        # ── Stats ──────────────────────────────────────────────────────────
        if t == 'stats':
            game_id    = params.get('gameId',    [''])[0]
            league_key = params.get('leagueKey', ['premier'])[0]
            body = json.dumps(
                get_stats(game_id, league_key) if game_id
                else {'error': 'gameId required'}
            ).encode()
            self._json(body)
            return

        # ── Live ───────────────────────────────────────────────────────────
        if t == 'live':
            fixtures = []
            for league in LEAGUES:
                try:
                    data = espn_fetch(f"{ESPN_BASE}/{league['slug']}/scoreboard")
                    for ev in data.get('events', []):
                        comp   = ev.get('competitions', [{}])[0]
                        state  = comp.get('status', {}).get('type', {}).get('state', '')
                        if state != 'in':
                            continue
                        fixtures.append(parse_fixture(ev, league, 'in'))
                except:
                    pass
            self._json(json.dumps({'fixtures': fixtures, 'count': len(fixtures), 'live': True}).encode())
            return

        # ── Fixtures ───────────────────────────────────────────────────────
        fixtures = []
        for league in LEAGUES:
            try:
                data = espn_fetch(f"{ESPN_BASE}/{league['slug']}/scoreboard")
                for ev in data.get('events', []):
                    fixtures.append(parse_fixture(ev, league))
            except:
                pass
        self._json(json.dumps({'fixtures': fixtures, 'count': len(fixtures)}).encode())

    def _json(self, body):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)
