import json, urllib.request
from http.server import BaseHTTPRequestHandler

ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'

# TheSportsDB (free tier, key=3) — usada pra forma recente e lineups
TSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3'

# Mapeamento league_key → league_id da TheSportsDB
TSDB_LEAGUE_IDS = {
    'brasileirao':  '4351',
    'premier':      '4328',
    'laliga':       '4335',
    'bundesliga':   '4331',
    'seriea':       '4332',
    'ligue1':       '4334',
    'champions':    '4480',
    'libertadores': '4483',
}

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


def tsdb_fetch(path):
    """GET em TheSportsDB com cache interno."""
    cache_key = f"tsdb_{path}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached
    url = f"{TSDB_BASE}/{path}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read())
        _cache_set(cache_key, data)
        return data
    except Exception:
        return None


def tsdb_teams_by_league(league_key):
    """Retorna mapa { nome_normalizado: team_id } para uma liga."""
    cache_key = f"tsdb_teams_{league_key}"
    cached = _cache_get(cache_key)
    if cached:
        return cached
    league_id = TSDB_LEAGUE_IDS.get(league_key)
    if not league_id:
        return {}
    data = tsdb_fetch(f"lookup_all_teams.php?id={league_id}")
    if not data or not data.get('teams'):
        return {}
    teams_map = {}
    for t in data['teams']:
        tid = t.get('idTeam')
        if not tid:
            continue
        # Indexar por várias variações de nome pra maximar match
        names = [t.get('strTeam'), t.get('strTeamShort'), t.get('strAlternate')]
        for n in names:
            if not n:
                continue
            for part in str(n).split(','):
                key = _norm_name(part.strip())
                if key:
                    teams_map[key] = {
                        'id':       tid,
                        'name':     t.get('strTeam'),
                        'badge':    t.get('strBadge') or t.get('strTeamBadge'),
                        'stadium':  t.get('strStadium'),
                    }
    _cache_set(cache_key, teams_map)
    return teams_map


def _norm_name(s):
    """Normaliza nome: minúsculas, sem acentos, sem espaços extras."""
    if not s:
        return ''
    import unicodedata
    s = unicodedata.normalize('NFKD', s).encode('ASCII', 'ignore').decode('ASCII')
    return s.lower().strip()

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


def get_team_form_tsdb(team_id, team_name):
    """Últimos 5 jogos via TheSportsDB. Muito mais rápido que ESPN schedule."""
    cache_key = f"tsdb_form_{team_id}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    data = tsdb_fetch(f"eventslast.php?id={team_id}")
    if not data or not data.get('results'):
        return None

    team_norm = _norm_name(team_name)
    games = []
    for ev in data['results'][:10]:
        home_name = ev.get('strHomeTeam', '')
        away_name = ev.get('strAwayTeam', '')
        home_score = ev.get('intHomeScore')
        away_score = ev.get('intAwayScore')
        if home_score is None or away_score is None:
            continue
        try:
            hs = int(home_score); as_ = int(away_score)
        except:
            continue

        is_home = _norm_name(home_name) == team_norm
        my_score  = hs if is_home else as_
        opp_score = as_ if is_home else hs
        opp_name  = away_name if is_home else home_name

        result = 'W' if my_score > opp_score else ('D' if my_score == opp_score else 'L')
        games.append({
            'date':     ev.get('dateEvent', ''),
            'result':   result,
            'score':    f"{my_score}-{opp_score}",
            'opp':      opp_name[:10],
            'homeAway': 'home' if is_home else 'away',
        })

    games.sort(key=lambda x: x['date'], reverse=True)
    recent = games[:5]
    form_str = ''.join(g['result'] for g in recent)
    result = {'form': form_str, 'games': recent}
    _cache_set(cache_key, result)
    return result


def get_league_form(league_key):
    """Forma recente de todos os times da liga via TheSportsDB."""
    slug = SLUG_MAP.get(league_key)
    if not slug:
        return {'error': 'invalid league'}

    cache_key = f"league_form_{league_key}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    teams_map = tsdb_teams_by_league(league_key)
    if not teams_map:
        return {}

    # Deduplica por team_id (pois indexamos por múltiplos nomes)
    unique_teams = {}
    for info in teams_map.values():
        unique_teams[info['id']] = info

    out = {}
    for team_id, info in list(unique_teams.items())[:30]:
        form = get_team_form_tsdb(team_id, info['name'])
        if form and form.get('form'):
            # Indexar por nome principal
            out[info['name']] = form
            # Indexar também pela versão normalizada pra facilitar match
            out[_norm_name(info['name'])] = form

    _cache_set(cache_key, out)
    return out


# Mantida por compat — não usada mais
def get_team_form(league_slug, team_id, team_name):
    return {'form': '', 'games': []}


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
