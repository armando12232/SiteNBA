import json, time, urllib.request
from http.server import BaseHTTPRequestHandler

ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'

LEAGUES = [
    {'key': 'brasileirao',  'slug': 'bra.1',                   'name': 'Brasileirao Serie A', 'flag': '\u{1F1E7}\u{1F1F7}'},
    {'key': 'champions',    'slug': 'uefa.champions',           'name': 'Champions League',    'flag': '\u{1F3C6}'},
    {'key': 'premier',      'slug': 'eng.1',                   'name': 'Premier League',       'flag': '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}'},
    {'key': 'laliga',       'slug': 'esp.1',                   'name': 'La Liga',              'flag': '\u{1F1EA}\u{1F1F8}'},
    {'key': 'bundesliga',   'slug': 'ger.1',                   'name': 'Bundesliga',           'flag': '\u{1F1E9}\u{1F1EA}'},
    {'key': 'seriea',       'slug': 'ita.1',                   'name': 'Serie A',              'flag': '\u{1F1EE}\u{1F1F9}'},
    {'key': 'ligue1',       'slug': 'fra.1',                   'name': 'Ligue 1',              'flag': '\u{1F1EB}\u{1F1F7}'},
    {'key': 'libertadores', 'slug': 'conmebol.libertadores',   'name': 'Libertadores',         'flag': '\u{1F30E}'},
]
SLUG_MAP = {l['key']: l['slug'] for l in LEAGUES}

def espn_fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read())

def parse_event(e):
    return {
        'type': e.get('type', {}).get('text', ''),
        'clock': e.get('clock', {}).get('displayValue', ''),
        'text': e.get('text', ''),
        'team': e.get('team', {}).get('displayName', '') if e.get('team') else '',
        'score': e.get('scoreValue', None),
    }

def get_stats(game_id, league_key):
    slug = SLUG_MAP.get(league_key, 'eng.1')
    url = f'{ESPN_BASE}/{slug}/summary?event={game_id}'
    try:
        data = espn_fetch(url)
    except Exception as e:
        return {'error': str(e)}

    result = {}

    # Stats dos times
    boxscore = data.get('boxscore', {})
    teams_data = boxscore.get('teams', [])
    stats_out = []
    WANTED = ['possessionPct','totalShots','shotsOnTarget','wonCorners',
              'foulsCommitted','yellowCards','redCards','offsides',
              'saves','passPct','accuratePasses','totalPasses',
              'effectiveTackles','interceptions']
    for t in teams_data:
        team_stats = {}
        for s in t.get('statistics', []):
            if s['name'] in WANTED:
                team_stats[s['name']] = s.get('displayValue', s.get('value', ''))
        stats_out.append({
            'team': t.get('team', {}).get('displayName', ''),
            'abbreviation': t.get('team', {}).get('abbreviation', ''),
            'stats': team_stats
        })
    result['teams'] = stats_out

    # Eventos chave (gols, cartões)
    key_events = data.get('keyEvents', [])
    IMPORTANT = {'Goal', 'Yellow Card', 'Red Card', 'Penalty', 'Own Goal', 'Substitution'}
    result['events'] = [
        parse_event(e) for e in key_events
        if e.get('type', {}).get('text', '') in IMPORTANT
    ][:20]

    # Odds (se disponível)
    odds = data.get('odds', [{}])
    if odds:
        o = odds[0]
        result['odds'] = {
            'spread': o.get('spread'),
            'overUnder': o.get('overUnder'),
            'provider': o.get('provider', {}).get('name', '')
        }

    return result

class handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_GET(self):
        from urllib.parse import urlparse, parse_qs
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        t = params.get('type', ['fixtures'])[0]

        # ── Stats endpoint ─────────────────────────────────────────────
        if t == 'stats':
            game_id   = params.get('gameId', [''])[0]
            league_key = params.get('leagueKey', ['premier'])[0]
            if not game_id:
                body = json.dumps({'error': 'gameId required'}).encode()
            else:
                stats = get_stats(game_id, league_key)
                body = json.dumps(stats).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(body)
            return

        # ── Live endpoint ──────────────────────────────────────────────
        if t == 'live':
            fixtures = []
            for league in LEAGUES:
                try:
                    url = f"{ESPN_BASE}/{league['slug']}/scoreboard"
                    data = espn_fetch(url)
                    for ev in data.get('events', []):
                        comp = ev.get('competitions', [{}])[0]
                        status = comp.get('status', {})
                        state = status.get('type', {}).get('state', '')
                        if state != 'in': continue
                        teams = comp.get('competitors', [])
                        home = next((t for t in teams if t.get('homeAway')=='home'), {})
                        away = next((t for t in teams if t.get('homeAway')=='away'), {})
                        elapsed = status.get('displayClock','')
                        period  = status.get('period', None)
                        fixtures.append({
                            'id': str(ev.get('id','')),
                            'date': comp.get('date',''),
                            'league_key': league['key'],
                            'league_name': league['name'],
                            'league_flag': league['flag'],
                            'home': home.get('team',{}).get('displayName',''),
                            'home_logo': home.get('team',{}).get('logo',''),
                            'home_goals': home.get('score', None),
                            'away': away.get('team',{}).get('displayName',''),
                            'away_logo': away.get('team',{}).get('logo',''),
                            'away_goals': away.get('score', None),
                            'status': 'in',
                            'status_long': elapsed,
                            'elapsed': elapsed,
                            'period': period,
                            'live': True,
                            'finished': False,
                            'venue': comp.get('venue',{}).get('fullName',''),
                        })
                except: pass
            body = json.dumps({'fixtures': fixtures, 'count': len(fixtures), 'live': True}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(body)
            return

        # ── Fixtures endpoint ──────────────────────────────────────────
        fixtures = []
        for league in LEAGUES:
            try:
                url = f"{ESPN_BASE}/{league['slug']}/scoreboard"
                data = espn_fetch(url)
                for ev in data.get('events', []):
                    comp = ev.get('competitions', [{}])[0]
                    status = comp.get('status', {})
                    state = status.get('type', {}).get('state', '')
                    teams = comp.get('competitors', [])
                    home = next((t for t in teams if t.get('homeAway')=='home'), {})
                    away = next((t for t in teams if t.get('homeAway')=='away'), {})
                    elapsed = status.get('displayClock','') if state == 'in' else None
                    period  = status.get('period', None) if state in ('in','post') else None
                    fixtures.append({
                        'id': str(ev.get('id','')),
                        'date': comp.get('date',''),
                        'league_key': league['key'],
                        'league_name': league['name'],
                        'league_flag': league['flag'],
                        'home': home.get('team',{}).get('displayName',''),
                        'home_logo': home.get('team',{}).get('logo',''),
                        'home_goals': home.get('score', None),
                        'away': away.get('team',{}).get('displayName',''),
                        'away_logo': away.get('team',{}).get('logo',''),
                        'away_goals': away.get('score', None),
                        'status': state if state else 'pre',
                        'status_long': status.get('type',{}).get('shortDetail',''),
                        'elapsed': elapsed,
                        'period': period,
                        'live': state == 'in',
                        'finished': state == 'post',
                        'venue': comp.get('venue',{}).get('fullName',''),
                    })
            except: pass
        body = json.dumps({'fixtures': fixtures, 'count': len(fixtures)}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)
