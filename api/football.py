import json, urllib.request
from http.server import BaseHTTPRequestHandler

ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'

# Cache simples em memória (por processo serverless)
import time
_CACHE = {}
_CACHE_TTL = 600  # 10 min

def _cache_get(key):
    entry = _CACHE.get(key)
    if entry and time.time() - entry[0] < _CACHE_TTL:
        return entry[1]
    return None

def _cache_set(key, value):
    _CACHE[key] = (time.time(), value)

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
        # xG (variações ESPN)
        'expectedGoals', 'xG', 'xg', 'totalExpectedGoals',
        # Extras úteis
        'shotsInsideBox', 'shotsOutsideBox', 'bigChancesCreated', 'bigChancesMissed',
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

def get_pregame(game_id, league_key):
    slug = SLUG_MAP.get(league_key, 'eng.1')
    url  = f'{ESPN_BASE}/{slug}/summary?event={game_id}'
    try:
        data = espn_fetch(url)
    except Exception as e:
        return {'error': str(e)}

    result = {}

    # Informações do jogo (venue, record dos times)
    header = data.get('header', {})
    comp0  = (header.get('competitions') or [{}])[0]
    competitors = comp0.get('competitors', [])
    teams_info = []
    for c in competitors:
        record_total = next((r.get('displayValue','') for r in (c.get('record') or []) if r.get('type') == 'total'), '')
        record_pts   = next((r.get('displayValue','') for r in (c.get('record') or []) if r.get('type') == 'points'), '')
        teams_info.append({
            'team':     c.get('team', {}).get('displayName', ''),
            'logo':     c.get('team', {}).get('logo', ''),
            'homeAway': c.get('homeAway', ''),
            'record':   record_total,
            'points':   record_pts,
        })
    result['teams'] = teams_info

    gi = data.get('gameInfo', {})
    result['venue'] = gi.get('venue', {}).get('fullName', '')
    result['city']  = gi.get('venue', {}).get('address', {}).get('city', '')

    # Classificação (standings)
    groups = (data.get('standings') or {}).get('groups') or []
    if groups:
        entries = (groups[0].get('standings') or {}).get('entries') or []
        result['standings'] = [
            {
                'team':   str(e.get('team', '')),
                'rank':   next((s.get('displayValue') for s in e.get('stats',[]) if s.get('name')=='rank'), ''),
                'pts':    next((s.get('displayValue') for s in e.get('stats',[]) if s.get('name')=='points'), ''),
                'wins':   next((s.get('displayValue') for s in e.get('stats',[]) if s.get('name')=='wins'), ''),
                'draws':  next((s.get('displayValue') for s in e.get('stats',[]) if s.get('name')=='ties'), ''),
                'losses': next((s.get('displayValue') for s in e.get('stats',[]) if s.get('name')=='losses'), ''),
                'gp':     next((s.get('displayValue') for s in e.get('stats',[]) if s.get('name')=='gamesPlayed'), ''),
            }
            for e in entries
        ]

    # Leaders (artilheiros, assists, chutes)
    leaders_raw = data.get('leaders') or []
    leaders_out = []
    for cat in leaders_raw:
        for sub in (cat.get('leaders') or []):
            top = []
            for x in (sub.get('leaders') or [])[:3]:
                top.append({
                    'name':  (x.get('athlete') or {}).get('displayName', ''),
                    'value': x.get('shortDisplayValue', x.get('displayValue', '')),
                    'team':  str((x.get('team') or {}).get('displayName', '') or ''),
                })
            if top:
                leaders_out.append({
                    'category': sub.get('displayName', sub.get('name', '')),
                    'leaders':  top,
                })
    result['leaders'] = leaders_out

    # Odds
    odds_raw = (data.get('odds') or [{}])[0]
    if odds_raw:
        home_comp = next((c for c in competitors if c.get('homeAway') == 'home'), {})
        away_comp = next((c for c in competitors if c.get('homeAway') == 'away'), {})
        result['odds'] = {
            'spread':    odds_raw.get('spread'),
            'overUnder': odds_raw.get('overUnder'),
            'homeML':    (odds_raw.get('homeTeamOdds') or {}).get('moneyLine'),
            'awayML':    (odds_raw.get('awayTeamOdds') or {}).get('moneyLine'),
            'drawOdds':  (odds_raw.get('drawOdds') or {}).get('moneyLine'),
            'provider':  (odds_raw.get('provider') or {}).get('name', ''),
        }

    # H2H (últimos confrontos diretos)
    h2h_raw = data.get('headToHeadGames') or []
    h2h_out = []
    for g in h2h_raw[:5]:
        comp = (g.get('competitions') or [{}])[0]
        teams_h = comp.get('competitors', [])
        home_h = next((t for t in teams_h if t.get('homeAway') == 'home'), {})
        away_h = next((t for t in teams_h if t.get('homeAway') == 'away'), {})
        h2h_out.append({
            'date':      comp.get('date', ''),
            'home':      (home_h.get('team') or {}).get('displayName', ''),
            'homeScore': home_h.get('score', ''),
            'away':      (away_h.get('team') or {}).get('displayName', ''),
            'awayScore': away_h.get('score', ''),
            'winner':    home_h.get('winner', False),
        })
    result['h2h'] = h2h_out

    return result


def get_team_form(league_slug, team_id, team_name):
    """Busca últimos 5 jogos finalizados de um time. Retorna string W/D/L."""
    cache_key = f"form_{league_slug}_{team_id}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    try:
        url = f'{ESPN_BASE}/{league_slug}/teams/{team_id}/schedule'
        data = espn_fetch(url)
    except Exception:
        return ''

    events = data.get('events', []) or []
    # Filtrar só jogos finalizados, ordenar por data desc
    finished = []
    for ev in events:
        comp = (ev.get('competitions') or [{}])[0]
        status = comp.get('status', {}).get('type', {}).get('state', '')
        if status != 'post':
            continue
        comps = comp.get('competitors', [])
        my = next((c for c in comps if (c.get('team') or {}).get('displayName','').lower() == team_name.lower()), None)
        if not my:
            # fallback: checar por id
            my = next((c for c in comps if str((c.get('team') or {}).get('id','')) == str(team_id)), None)
        if not my:
            continue
        opp = next((c for c in comps if c != my), {})
        try:
            my_score  = int(my.get('score', 0) or 0)
            opp_score = int(opp.get('score', 0) or 0)
        except:
            continue
        result = 'W' if my_score > opp_score else ('D' if my_score == opp_score else 'L')
        finished.append({
            'date':   comp.get('date',''),
            'result': result,
            'score':  f"{my_score}-{opp_score}",
            'opp':    (opp.get('team') or {}).get('abbreviation','') or (opp.get('team') or {}).get('displayName','')[:3].upper(),
            'homeAway': my.get('homeAway',''),
        })

    # Ordenar por data desc e pegar 5
    finished.sort(key=lambda x: x['date'], reverse=True)
    recent = finished[:5]
    # String simplificada ('WWDLW') + detalhes
    form_str = ''.join(g['result'] for g in recent)
    result = {'form': form_str, 'games': recent}
    _cache_set(cache_key, result)
    return result


def get_league_form(league_key):
    """Retorna forma de todos os times da liga."""
    slug = SLUG_MAP.get(league_key)
    if not slug:
        return {'error': 'invalid league'}

    cache_key = f"league_form_{league_key}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    try:
        teams_data = espn_fetch(f'{ESPN_BASE}/{slug}/teams')
    except Exception as e:
        return {'error': str(e)}

    sports  = (teams_data.get('sports') or [{}])[0]
    leagues = (sports.get('leagues') or [{}])[0]
    teams   = leagues.get('teams', [])

    out = {}
    for t in teams[:30]:
        team_obj = t.get('team', {}) or {}
        team_id   = team_obj.get('id')
        team_name = team_obj.get('displayName', '')
        team_abbr = team_obj.get('abbreviation', '')
        if not team_id or not team_name:
            continue
        form = get_team_form(slug, team_id, team_name)
        if form and isinstance(form, dict) and form.get('form'):
            # Chave: nome + abbr (frontend matcha por nome)
            out[team_name] = form
            if team_abbr:
                out[team_abbr] = form

    _cache_set(cache_key, out)
    return out


class handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_GET(self):
        from urllib.parse import urlparse, parse_qs
        params = parse_qs(urlparse(self.path).query)
        t = params.get('type', ['fixtures'])[0]

        # ── Pregame ────────────────────────────────────────────────────────
        if t == 'pregame':
            game_id    = params.get('gameId',    [''])[0]
            league_key = params.get('leagueKey', ['premier'])[0]
            body = json.dumps(
                get_pregame(game_id, league_key) if game_id
                else {'error': 'gameId required'}
            ).encode()
            self._json(body)
            return

        # ── Form (V/E/D últimos 5) ─────────────────────────────────────────
        if t == 'form':
            league_key = params.get('leagueKey', [''])[0]
            if not league_key:
                body = json.dumps({'error': 'leagueKey required'}).encode()
            else:
                body = json.dumps(get_league_form(league_key)).encode()
            self._json(body)
            return

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
