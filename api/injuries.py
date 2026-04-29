import json, os, time, urllib.request, urllib.parse, sys
from http.server import BaseHTTPRequestHandler
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from _security import rate_limit_check, get_client_ip
except ImportError:
    def rate_limit_check(ip): return True
    def get_client_ip(h): return '0.0.0.0'

# ── Cache ──────────────────────────────────────────────────────────────────────
_cache = {}
def _cache_get(k):
    v = _cache.get(k)
    if v and time.time() < v['exp']:
        return v['data']
    return None

def _cache_set(k, data, ttl=600):
    _cache[k] = {'data': data, 'exp': time.time() + ttl}

# ── Times NBA na ESPN ──────────────────────────────────────────────────────────
NBA_TEAMS = [
    (1,  'ATL', 'Atlanta Hawks',         '#E03A3E'),
    (2,  'BOS', 'Boston Celtics',        '#007A33'),
    (17, 'BKN', 'Brooklyn Nets',         '#000000'),
    (30, 'CHA', 'Charlotte Hornets',     '#1D1160'),
    (4,  'CHI', 'Chicago Bulls',         '#CE1141'),
    (5,  'CLE', 'Cleveland Cavaliers',   '#860038'),
    (6,  'DAL', 'Dallas Mavericks',      '#00538C'),
    (7,  'DEN', 'Denver Nuggets',        '#0E2240'),
    (8,  'DET', 'Detroit Pistons',       '#C8102E'),
    (9,  'GSW', 'Golden State Warriors', '#1D428A'),
    (10, 'HOU', 'Houston Rockets',       '#CE1141'),
    (11, 'IND', 'Indiana Pacers',        '#002D62'),
    (12, 'LAC', 'LA Clippers',           '#C8102E'),
    (13, 'LAL', 'Los Angeles Lakers',    '#552583'),
    (29, 'MEM', 'Memphis Grizzlies',     '#5D76A9'),
    (14, 'MIA', 'Miami Heat',            '#98002E'),
    (15, 'MIL', 'Milwaukee Bucks',       '#00471B'),
    (16, 'MIN', 'Minnesota Timberwolves','#0C2340'),
    (3,  'NOP', 'New Orleans Pelicans',  '#0C2340'),
    (18, 'NYK', 'New York Knicks',       '#006BB6'),
    (25, 'OKC', 'Oklahoma City Thunder', '#007AC1'),
    (19, 'ORL', 'Orlando Magic',         '#0077C0'),
    (20, 'PHI', 'Philadelphia 76ers',    '#006BB6'),
    (21, 'PHX', 'Phoenix Suns',          '#1D1160'),
    (22, 'POR', 'Portland Trail Blazers','#E03A3E'),
    (23, 'SAC', 'Sacramento Kings',      '#5A2D81'),
    (24, 'SAS', 'San Antonio Spurs',     '#C4CED4'),
    (28, 'TOR', 'Toronto Raptors',       '#CE1141'),
    (26, 'UTA', 'Utah Jazz',             '#002B5C'),
    (27, 'WAS', 'Washington Wizards',    '#002B5C'),
]

# ── Status ─────────────────────────────────────────────────────────────────────
STATUS_CATEGORIES = {
    'out':            {'label': 'Out',             'color': '#dc2626', 'priority': 5},
    'out for season': {'label': 'Out For Season',  'color': '#7c3aed', 'priority': 6},
    'doubtful':       {'label': 'Doubtful',        'color': '#f97316', 'priority': 4},
    'questionable':   {'label': 'Questionable',    'color': '#eab308', 'priority': 3},
    'day-to-day':     {'label': 'Day-To-Day',      'color': '#3b82f6', 'priority': 2},
    'probable':       {'label': 'Probable',        'color': '#22c55e', 'priority': 1},
    'available':      {'label': 'Available',       'color': '#22c55e', 'priority': 0},
}

def _categorize_status(s):
    if not s: return STATUS_CATEGORIES['day-to-day']
    key = s.strip().lower()
    return STATUS_CATEGORIES.get(key, {'label': s, 'color': '#6b7280', 'priority': 1})

# ── Fetch ESPN ────────────────────────────────────────────────────────────────
def _espn_fetch(url, timeout=8):
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0',
            'Accept':     'application/json',
        })
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except Exception:
        return None

# ── Tradução em batch via Claude Haiku ────────────────────────────────────────
def _translate_batch(texts):
    """Traduz lista de descrições EN→PT-BR via Claude API em chunks de 40."""
    if not texts:
        return []
    import urllib.request as ur, json as js

    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        return texts

    cache_key = "trans_" + str(hash("|".join(texts)))
    cached = _cache_get(cache_key)
    if cached:
        return cached

    def _translate_chunk(chunk):
        numbered = "\n".join(f"{i+1}. {t}" for i, t in enumerate(chunk))
        prompt = (
            "Traduza as descrições de lesão de NBA abaixo para português brasileiro. "
            "Preserve nomes próprios (jogadores, times, jornalistas, veículos de imprensa). "
            "Responda APENAS com as traduções numeradas no formato '1. texto', uma por linha, sem comentários extras.\n\n"
            + numbered
        )
        try:
            body = js.dumps({
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 4096,
                "messages": [{"role": "user", "content": prompt}]
            }).encode()
            req = ur.Request(
                "https://api.anthropic.com/v1/messages",
                data=body,
                headers={
                    "x-api-key": key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                }
            )
            with ur.urlopen(req, timeout=20) as r:
                resp = js.loads(r.read())
            raw = resp["content"][0]["text"].strip()

            import re
            parsed = {}
            for line in raw.split("\n"):
                line = line.strip()
                m = re.match(r'^(\d+)\.\s+(.*)', line)
                if m:
                    idx = int(m.group(1)) - 1
                    parsed[idx] = m.group(2).strip()

            return [parsed.get(i, chunk[i]) for i in range(len(chunk))]
        except Exception:
            return chunk

    CHUNK_SIZE = 40
    result = []
    for start in range(0, len(texts), CHUNK_SIZE):
        chunk = texts[start:start + CHUNK_SIZE]
        result.extend(_translate_chunk(chunk))

    _cache_set(cache_key, result, ttl=86400)
    return result

# ── Fetch por time ─────────────────────────────────────────────────────────────
def _fetch_team_injuries(team):
    team_id, abbr, full_name, color = team
    url = (f'https://sports.core.api.espn.com/v2/sports/basketball/'
           f'leagues/nba/teams/{team_id}/injuries')
    data = _espn_fetch(url)
    if not data or 'items' not in data:
        return []

    injuries = []
    for ref_item in data.get('items', []):
        ref_url = ref_item.get('$ref') if isinstance(ref_item, dict) else None
        if not ref_url:
            continue
        detail = _espn_fetch(ref_url, timeout=5)
        if not detail:
            continue

        athlete_ref  = detail.get('athlete', {}).get('$ref')
        athlete_data = _espn_fetch(athlete_ref, timeout=5) if athlete_ref else None

        athlete_name = athlete_data.get('displayName', '—') if athlete_data else '—'
        athlete_pos  = (athlete_data.get('position', {}) or {}).get('abbreviation', '') if athlete_data else ''
        athlete_id   = athlete_data.get('id') if athlete_data else None
        athlete_img  = (f'https://a.espncdn.com/i/headshots/nba/players/full/{athlete_id}.png'
                        if athlete_id else '')

        status      = detail.get('status', '') or detail.get('type', {}).get('description', '')
        short_desc  = detail.get('shortComment', '') or detail.get('longComment', '')
        return_date = detail.get('details', {}).get('returnDate', '')
        cat         = _categorize_status(status)

        injuries.append({
            'team':         abbr,
            'team_name':    full_name,
            'team_color':   color,
            'team_id':      team_id,
            'athlete_id':   athlete_id,
            'athlete_name': athlete_name,
            'position':     athlete_pos,
            'image':        athlete_img,
            'status':       cat['label'],
            'status_color': cat['color'],
            'priority':     cat['priority'],
            'return_date':  return_date,
            'description':  short_desc[:500],  # tradução feita em batch depois
        })
    return injuries

# ── Busca todos os 30 times ────────────────────────────────────────────────────
def get_all_injuries():
    cached = _cache_get('all_injuries')
    if cached:
        return cached

    all_injuries = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(_fetch_team_injuries, team): team for team in NBA_TEAMS}
        for fut in as_completed(futures, timeout=8):
            try:
                all_injuries.extend(fut.result())
            except Exception:
                pass

    all_injuries.sort(key=lambda x: (-x['priority'], x['team'], x['athlete_name']))

    # Tradução em batch — UMA chamada pra tudo
    descs      = [i['description'] for i in all_injuries]
    translated = _translate_batch(descs)
    for i, inj in enumerate(all_injuries):
        inj['description'] = translated[i]

    by_cat = {}
    for inj in all_injuries:
        st = inj['status']
        by_cat[st] = by_cat.get(st, 0) + 1

    result = {
        'total':      len(all_injuries),
        'by_status':  by_cat,
        'by_team':    _group_by_team(all_injuries),
        'injuries':   all_injuries,
        'updated_at': int(time.time()),
    }
    _cache_set('all_injuries', result, ttl=600)
    return result

def _group_by_team(injuries):
    grouped = {}
    for inj in injuries:
        t = inj['team']
        if t not in grouped:
            grouped[t] = {'team': t, 'team_name': inj['team_name'],
                          'team_color': inj['team_color'], 'count': 0, 'players': []}
        grouped[t]['count'] += 1
        grouped[t]['players'].append(inj['athlete_name'])
    return list(grouped.values())

# ── Handler HTTP ───────────────────────────────────────────────────────────────
class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        ip = get_client_ip(self.headers)
        if not rate_limit_check(ip):
            self._send(429, {'error': 'rate limited'}); return
        try:
            data = get_all_injuries()
            self._send(200, data)
        except Exception as e:
            self._send(500, {'error': str(e)[:200]})

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def _send(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'public, max-age=300')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def log_message(self, f, *a):
        pass
