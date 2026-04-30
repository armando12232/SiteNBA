import json, urllib.request, urllib.parse, sys, os
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from _security import (
        rate_limit_check, get_client_ip,
        is_valid_id, is_valid_date, is_valid_league, sanitize_team_name,
    )
except ImportError:
    def rate_limit_check(ip): return True
    def get_client_ip(h): return '0.0.0.0'
    def is_valid_id(s): return bool(s) and len(s) <= 40 and s.replace('-','').replace('_','').isalnum()
    def is_valid_date(s): return bool(s) and len(s) <= 30
    def is_valid_league(s): return bool(s) and s.isalpha() and len(s) <= 20
    def sanitize_team_name(s): return str(s or '')[:60]

ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'

_STATUS_PT = {
    'Half Time': 'Intervalo', 'HT': 'Intervalo',
    'Full Time': 'Encerrado', 'FT': 'Encerrado',
    'Extra Time': 'Prorrogação', 'ET': 'Prorrogação',
    'Penalty': 'Pênaltis', 'Penalties': 'Pênaltis',
    'Not Started': 'Agendado', 'Kick Off': 'Início',
    'First Half': '1º Tempo', '1st Half': '1º Tempo',
    'Second Half': '2º Tempo', '2nd Half': '2º Tempo',
    'Postponed': 'Adiado', 'Cancelled': 'Cancelado',
    'Abandoned': 'Abandonado', 'Suspended': 'Suspenso',
    'Live': 'Ao Vivo', 'In Progress': 'Em Andamento',
    'Final': 'Encerrado', 'Final/OT': 'Encerrado (Prorr.)',
    'Final/Pen': 'Encerrado (Pen.)',
}

def _build_event_text(e):
    """Monta descrição do evento em PT-BR a partir dos campos estruturados da ESPN."""
    import re
    etype     = e.get('type', {}).get('text', '')
    athlete   = e.get('athletesInvolved', [])
    team_name = (e.get('team') or {}).get('shortDisplayName', '') or (e.get('team') or {}).get('abbreviation', '')
    raw_text  = e.get('text', '')
    clock     = e.get('clock', {}).get('displayValue', '')

    # Extrair nomes dos atletas
    name1 = name2 = ''
    if athlete:
        name1 = athlete[0].get('shortName') or athlete[0].get('displayName', '')
        if len(athlete) > 1:
            name2 = athlete[1].get('shortName') or athlete[1].get('displayName', '')
    if not name1 and raw_text:
        # ESPN: "Goal! Team1 1, Team2 0. PlayerName(Team) left footed..."
        # Pegar nome após o placar (padrão: "N, N. NomePrimeiroMaiusculo")
        m = re.search(r'\d+\.\s+([A-Z][a-záéíóúàâêôãç][^\(]{2,30}?)\s*\(', raw_text)
        if m:
            name1 = m.group(1).strip()
        # Fallback: "Yellow Card - Player Name"
        if not name1:
            m2 = re.search(r'(?:Card|Penalty|Substitution)[:\-\s]+([A-Z][a-záéíóúàâêôãç\w\s\.]{2,30}?)(?:\s*[\(\[]|$)', raw_text)
            if m2:
                name1 = m2.group(1).strip()
        a = re.search(r'[Aa]ssisted? by ([\w\s\-\.\']+?)(?:\s+with|\.|$)', raw_text)
        if a:
            name2 = a.group(1).strip()

    # Extrair detalhes extras do raw_text
    extra = ''
    if raw_text and etype in ('Goal', 'Own Goal', 'Penalty'):
        if re.search(r'left foot', raw_text, re.I):
            extra = 'pé esquerdo'
        elif re.search(r'right foot', raw_text, re.I):
            extra = 'pé direito'
        elif re.search(r'header', raw_text, re.I):
            extra = 'cabeça'
        if re.search(r'penalty', raw_text, re.I) and etype != 'Penalty':
            extra += (' · pênalti' if extra else 'pênalti')
        if re.search(r'free.?kick', raw_text, re.I):
            extra += (' · falta' if extra else 'falta')

    EVENT_PT = {
        'Goal':         'Gol',
        'Own Goal':     'Gol Contra',
        'Yellow Card':  'Cartão Amarelo',
        'Red Card':     'Cartão Vermelho',
        'Penalty':      'Pênalti',
        'Substitution': 'Substituição',
    }
    label = EVENT_PT.get(etype, etype)

    if etype in ('Goal', 'Own Goal', 'Penalty'):
        txt = f'⚽ {label}'
        if name1:
            txt += f' — {name1}'
        if team_name:
            txt += f' ({team_name})'
        if extra:
            txt += f' · {extra}'
        if name2:
            txt += f' · ass. {name2}'

    elif etype == 'Yellow Card':
        txt = f'🟨 {label}'
        if name1:
            txt += f' — {name1}'
        if team_name:
            txt += f' ({team_name})'

    elif etype == 'Red Card':
        txt = f'🟥 {label}'
        if name1:
            txt += f' — {name1}'
        if team_name:
            txt += f' ({team_name})'

    elif etype == 'Substitution':
        txt = f'🔄 Substituição'
        if name2 and name1:
            txt += f': {name2} ▶ {name1}'
        elif name1:
            txt += f': {name1}'
        if team_name:
            txt += f' ({team_name})'

    else:
        txt = label
        if name1:
            txt += f' — {name1}'

    return txt


def _translate_status(s):
    if not s:
        return s
    return _STATUS_PT.get(s, s)


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
        'status_long':  _translate_status(status.get('type', {}).get('shortDetail', '')),
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
    EVENT_PT = {
        'Goal': 'Gol', 'Own Goal': 'Gol Contra',
        'Yellow Card': 'Cartão Amarelo', 'Red Card': 'Cartão Vermelho',
        'Penalty': 'Pênalti', 'Substitution': 'Substituição',
    }
    key_events = data.get('keyEvents', [])
    result['_debug_first_event'] = key_events[0] if key_events else None
    result['events'] = [
        {
            'type':  e.get('type', {}).get('text', ''),
            'clock': e.get('clock', {}).get('displayValue', ''),
            'text':  _build_event_text(e),
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


# ─── API-Football (árbitro + cartões + faltas) ────────────────────────────────
APIFOOTBALL_KEY  = '225f99518f22050258f44c558fab250b'
APIFOOTBALL_BASE = 'https://v3.football.api-sports.io'

APIFOOTBALL_LEAGUE_IDS = {
    'brasileirao':  71,
    'premier':      39,
    'laliga':       140,
    'bundesliga':   78,
    'seriea':       135,
    'ligue1':       61,
    'champions':    2,
    'libertadores': 13,
}

def apifootball_fetch(path):
    cache_key = f"apifb_{path}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached
    url = f"{APIFOOTBALL_BASE}/{path}"
    req = urllib.request.Request(url, headers={
        'x-apisports-key': APIFOOTBALL_KEY,
        'User-Agent': 'Mozilla/5.0',
    })
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read())
        _cache_set(cache_key, data)
        return data
    except Exception:
        return None


def _norm(s):
    if not s: return ''
    import unicodedata
    return unicodedata.normalize('NFKD', s).encode('ASCII','ignore').decode('ASCII').lower().strip()


def get_fixture_referee(home_name, away_name, league_key, game_date):
    """Árbitro + stats de cartões/faltas via API-Football."""
    league_id = APIFOOTBALL_LEAGUE_IDS.get(league_key)
    if not league_id or not game_date:
        return None

    cache_key = f"referee_{league_key}_{game_date[:10]}_{_norm(home_name)}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    date_str = game_date[:10]
    matched = None

    def name_match(api_name, espn_name):
        a = _norm(api_name)
        e = _norm(espn_name)
        if not a or not e: return False
        if a == e or a in e or e in a: return True
        # Compara palavras significativas (ignora FC, United, etc)
        STOP = {'fc','af','sc','cf','ac','us','as','de','do','da','dos','the','city','united'}
        a_words = set(w for w in a.split() if w not in STOP and len(w) > 2)
        e_words = set(w for w in e.split() if w not in STOP and len(w) > 2)
        return bool(a_words & e_words)

    for season in ['2025', '2026', '2024']:
        data = apifootball_fetch(f"fixtures?date={date_str}&league={league_id}&season={season}")
        if not data or not data.get('response'):
            continue
        for fix in data['response']:
            h = fix.get('teams',{}).get('home',{}).get('name','')
            a = fix.get('teams',{}).get('away',{}).get('name','')
            if name_match(h, home_name) and name_match(a, away_name):
                matched = fix
                break
        if matched:
            break

    if not matched:
        available = []
        debug_seasons = {}
        for season in ['2025', '2026', '2024']:
            data = apifootball_fetch(f"fixtures?date={date_str}&league={league_id}&season={season}")
            if data and data.get('response'):
                teams = [f"{f.get('teams',{}).get('home',{}).get('name','')} x {f.get('teams',{}).get('away',{}).get('name','')}" for f in data['response']]
                debug_seasons[season] = teams
                available.extend(teams)
            else:
                debug_seasons[season] = data.get('errors') if data else 'no response'
        result = {'error': 'match not found', 'debug_available': available, 'debug_seasons': debug_seasons, 'searched': f"{home_name} x {away_name}", 'league_id': league_id, 'date': date_str}
        _cache_set(cache_key, result)
        return result

    referee_raw = matched.get('fixture', {}).get('referee') or ''
    referee_name = referee_raw.split(',')[0].strip()
    home_id = matched.get('teams', {}).get('home', {}).get('id')
    away_id = matched.get('teams', {}).get('away', {}).get('id')

    result = {'referee': referee_name}

    # Stats do árbitro (últimos jogos)
    if referee_name:
        ref_stats = get_referee_avg(referee_name, league_id)
        if ref_stats:
            result['referee_stats'] = ref_stats

    # Stats dos times na temporada
    season_str = '2025' if '2025' in str(matched.get('fixture',{}).get('date','')) else '2024'
    for side, tid in [('home', home_id), ('away', away_id)]:
        if tid:
            ts = get_team_season_stats(tid, league_id, season_str)
            if ts:
                result[f'{side}_stats'] = ts

    _cache_set(cache_key, result)
    return result


def get_referee_avg(referee_name, league_id):
    """Média de cartões/faltas do árbitro nos últimos 15 jogos."""
    cache_key = f"ref_{_norm(referee_name)}_{league_id}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    yellows, reds, fouls, count = 0, 0, 0, 0
    for season in ['2025', '2024']:
        data = apifootball_fetch(
            f"fixtures?referee={urllib.parse.quote(referee_name)}&league={league_id}&season={season}&last=15"
        )
        if not data or not data.get('response'):
            continue
        for fix in data['response'][:15]:
            fid = fix.get('fixture', {}).get('id')
            if not fid:
                continue
            stats = apifootball_fetch(f"fixtures/statistics?fixture={fid}")
            if not stats or not stats.get('response'):
                continue
            for team_stat in stats['response']:
                for s in team_stat.get('statistics', []):
                    t = s.get('type', '').lower()
                    try: v = int(s.get('value') or 0)
                    except: v = 0
                    if 'yellow' in t: yellows += v
                    elif 'red' in t: reds += v
                    elif 'foul' in t: fouls += v
            count += 1
        if count >= 5:
            break

    if count == 0:
        return None

    result = {
        'games':      count,
        'avg_cards':  round((yellows + reds) / count, 1),
        'avg_yellow': round(yellows / count, 1),
        'avg_red':    round(reds / count, 1),
        'avg_fouls':  round(fouls / count, 1),
    }
    _cache_set(cache_key, result)
    return result


def get_team_season_stats(team_id, league_id, season='2024'):
    """Médias de cartões e faltas do time na temporada."""
    cache_key = f"tmstats_{team_id}_{league_id}_{season}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    data = apifootball_fetch(f"teams/statistics?team={team_id}&league={league_id}&season={season}")
    if not data or not data.get('response'):
        return None

    stats = data['response']
    cards  = stats.get('cards', {})
    fouls  = stats.get('fouls', {})
    games_played = stats.get('fixtures', {}).get('played', {}).get('total', 0) or 0
    if games_played == 0:
        return None

    yellow_total = sum(
        (v.get('total') or 0) for v in cards.get('yellow', {}).values() if isinstance(v, dict)
    )
    red_total = sum(
        (v.get('total') or 0) for v in cards.get('red', {}).values() if isinstance(v, dict)
    )
    fouls_committed = fouls.get('committed') or 0

    result = {
        'games':      games_played,
        'avg_yellow': round(yellow_total / games_played, 1),
        'avg_red':    round(red_total / games_played, 1),
        'avg_cards':  round((yellow_total + red_total) / games_played, 1),
        'avg_fouls':  round(fouls_committed / games_played, 1),
    }
    _cache_set(cache_key, result)
    return result


# ─── Bet365 API (via RapidAPI) ────────────────────────────────────────────────
BET365_KEY  = '8916f08b53msh9e0258a756f7e96p12c1d5jsn125e17bdbb2d'
BET365_HOST = 'bet36528.p.rapidapi.com'
BET365_BASE = 'https://bet36528.p.rapidapi.com'

BET365_TOURNAMENT_IDS = {
    'premier':      17,
    'laliga':       8,
    'bundesliga':   35,
    'seriea':       23,
    'ligue1':       34,
    'champions':    7,
    'libertadores': 384,
    'brasileirao':  325,
}

def bet365_fetch(path):
    cache_key = f"bet365_{path}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        url = f"{BET365_BASE}/{path}"
        req = urllib.request.Request(url, headers={
            'x-rapidapi-key':  BET365_KEY,
            'x-rapidapi-host': BET365_HOST,
            'Content-Type':    'application/json',
        })
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read())
        _cache_set(cache_key, data)
        return data
    except Exception:
        return None


def get_bet365_fixtures(league_key):
    tid = BET365_TOURNAMENT_IDS.get(league_key)
    if not tid:
        return []
    data = bet365_fetch(f"fixtures?tournamentId={tid}&hasOdds=true")
    if not data or not isinstance(data, list):
        return data if data else []
    return data


def get_bet365_odds(fixture_id):
    if not fixture_id:
        return None
    cache_key = f"bet365_odds_{fixture_id}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    # Endpoint correto: fixtures com fixtureId específico retorna bookmakerOdds
    data = bet365_fetch(f"fixtures?fixtureId={fixture_id}")
    if not data:
        return None

    # Pode retornar lista ou objeto único
    fix = data[0] if isinstance(data, list) and data else (data if isinstance(data, dict) else None)
    if not fix:
        return None

    markets = (fix.get('bookmakerOdds') or {}).get('bet365', {}).get('markets') or {}
    if not markets:
        return None

    result = {}

    def get_price(market_id, outcome_id):
        """Pega o preço decimal de um market/outcome."""
        m = markets.get(str(market_id)) or markets.get(market_id)
        if not m: return None
        o = (m.get('outcomes') or {}).get(str(outcome_id)) or (m.get('outcomes') or {}).get(outcome_id)
        if not o: return None
        players = o.get('players') or {}
        p = players.get('0') or (next(iter(players.values()), None) if players else None)
        if not p or not p.get('active'): return None
        price = p.get('price')
        return price if price else None

    # Market 101 = 1X2
    h = get_price(101, 101)
    d = get_price(101, 102)
    a = get_price(101, 103)
    if h: result['homeML']   = h
    if d: result['drawOdds'] = d
    if a: result['awayML']   = a

    # Market 104 = BTTS (Both Teams to Score)
    y = get_price(104, 104)
    n = get_price(104, 105)
    if y: result['bttsYes'] = y
    if n: result['bttsNo']  = n

    # Market 10208 = Over/Under — outcome 10208=Over, 10210=Under (2.5 goals)
    ov = get_price(10208, 10208)
    un = get_price(10208, 10210)
    if ov: result['over25']  = ov
    if un: result['under25'] = un

    _cache_set(cache_key, result or None)
    return result or None


def match_bet365_fixture(home_name, away_name, league_key):
    fixtures = get_bet365_fixtures(league_key)
    if not fixtures or not isinstance(fixtures, list):
        return None

    home_n = _norm(home_name)
    away_n = _norm(away_name)
    STOP = {'fc','af','sc','cf','ac','de','do','da','dos','city','united','the'}

    for fix in fixtures:
        h = _norm(fix.get('participant1Name') or fix.get('homeName') or fix.get('home') or '')
        a = _norm(fix.get('participant2Name') or fix.get('awayName') or fix.get('away') or '')
        fid = fix.get('fixtureId') or fix.get('id') or fix.get('fixture_id')
        if not h or not a or not fid:
            continue

        h_w = set(w for w in h.split() if w not in STOP and len(w) > 2)
        a_w = set(w for w in a.split() if w not in STOP and len(w) > 2)
        hn_w = set(w for w in home_n.split() if w not in STOP and len(w) > 2)
        an_w = set(w for w in away_n.split() if w not in STOP and len(w) > 2)

        if (h_w & hn_w) and (a_w & an_w):
            return {'fixture_id': fid, 'home': h, 'away': a}
    return None


def get_bet365_match_odds(home_name, away_name, league_key):
    cache_key = f"bet365_match_{league_key}_{_norm(home_name)}_{_norm(away_name)}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    fix = match_bet365_fixture(home_name, away_name, league_key)
    if not fix:
        result = {'error': 'fixture not found'}
        _cache_set(cache_key, result)
        return result

    odds = get_bet365_odds(fix['fixture_id'])
    if not odds:
        result = {'error': 'odds not found', 'fixture_id': fix['fixture_id']}
        _cache_set(cache_key, result)
        return result

    result = {'fixture_id': fix['fixture_id'], **odds}
    _cache_set(cache_key, result)
    return result


class handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_GET(self):
        from urllib.parse import urlparse, parse_qs

        # Rate limit
        ip = get_client_ip(self)
        if not rate_limit_check(ip):
            self._json(json.dumps({'error': 'rate limit exceeded'}).encode(), 429)
            return

        params = parse_qs(urlparse(self.path).query)
        t = params.get('type', ['fixtures'])[0]

        # Whitelist de tipos
        VALID_TYPES = {'fixtures','live','stats','pregame','form','lineup','referee','bet365odds'}
        if t not in VALID_TYPES:
            self._json(json.dumps({'error': 'invalid type'}).encode(), 400)
            return

        # ── Bet365 Odds ────────────────────────────────────────────────────────
        if t == 'bet365odds':
            home       = params.get('home',      [''])[0]
            away       = params.get('away',      [''])[0]
            league_key = params.get('leagueKey', [''])[0]
            if not (home and away and league_key):
                self._json(json.dumps({'error': 'home, away, leagueKey required'}).encode(), 400)
                return
            result = get_bet365_match_odds(home, away, league_key)
            self._json(json.dumps(result).encode())
            return

        # ── Referee + stats (API-Football) ────────────────────────────────
        if t == 'referee':
            home       = params.get('home',      [''])[0]
            away       = params.get('away',      [''])[0]
            game_date  = params.get('date',      [''])[0]
            league_key = params.get('leagueKey', [''])[0]
            import sys
            print(f"[referee] home={repr(home)} away={repr(away)} date={repr(game_date)} league={repr(league_key)}", file=sys.stderr)
            if not home or not away or not game_date or not league_key:
                self._json(json.dumps({'error': 'missing params', 'home': bool(home), 'away': bool(away), 'date': bool(game_date), 'league': bool(league_key)}).encode(), 400)
                return
            result = get_fixture_referee(home, away, league_key, game_date)
            self._json(json.dumps(result or {'error': 'not found'}).encode())
            return

        # ── Pregame ────────────────────────────────────────────────────────
        if t == 'pregame':
            game_id    = params.get('gameId',    [''])[0]
            league_key = params.get('leagueKey', ['premier'])[0]
            if not is_valid_id(game_id):
                self._json(json.dumps({'error': 'invalid gameId'}).encode(), 400); return
            if not is_valid_league(league_key):
                self._json(json.dumps({'error': 'invalid leagueKey'}).encode(), 400); return
            body = json.dumps(get_pregame(game_id, league_key)).encode()
            self._json(body)
            return

        # ── Form (V/E/D últimos 5) ─────────────────────────────────────────
        if t == 'form':
            league_key = params.get('leagueKey', [''])[0]
            if not is_valid_league(league_key):
                self._json(json.dumps({'error': 'invalid leagueKey'}).encode(), 400); return
            body = json.dumps(get_league_form(league_key)).encode()
            self._json(body)
            return

        # ── Stats ──────────────────────────────────────────────────────────
        if t == 'stats':
            game_id    = params.get('gameId',    [''])[0]
            league_key = params.get('leagueKey', ['premier'])[0]
            if not is_valid_id(game_id):
                self._json(json.dumps({'error': 'invalid gameId'}).encode(), 400); return
            if not is_valid_league(league_key):
                self._json(json.dumps({'error': 'invalid leagueKey'}).encode(), 400); return
            body = json.dumps(get_stats(game_id, league_key)).encode()
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

    def _json(self, body, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)
