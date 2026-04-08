from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import json, urllib.request, time

cache = {}
CACHE_TTL = 600

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://www.nba.com',
    'Referer': 'https://www.nba.com/',
    'x-nba-stats-origin': 'stats',
    'x-nba-stats-token': 'true',
}

PLAYER_NAMES = {
    203999: 'Nikola Jokic', 1628983: 'Shai Gilgeous-Alexander',
    1628384: 'Jalen Brunson', 4065648: 'Jayson Tatum',
    203076: 'Anthony Davis', 1629029: 'Luka Doncic',
    1629027: 'Trae Young', 1629630: 'Ja Morant',
    203507: 'Giannis Antetokounmpo', 1630178: 'Anthony Edwards',
    203954: 'Joel Embiid', 1631096: 'Cade Cunningham',
    1629628: 'Zion Williamson', 1630169: 'LaMelo Ball',
    1629057: 'Jaren Jackson Jr.', 1628389: 'Bam Adebayo',
    2544: 'LeBron James', 3934673: 'Donovan Mitchell',
}

def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read())

def get_pregame(player_id):
    cached = cache.get(f"pg_{player_id}")
    if cached and time.time() - cached[1] < CACHE_TTL:
        return cached[0]

    # Médias da temporada via stats.nba.com
    url = f"https://stats.nba.com/stats/playercareerstats?PlayerID={player_id}&PerMode=PerGame&LeagueID=00"
    data = fetch_json(url)
    rs = data['resultSets'][0]
    headers = rs['headers']
    rows = rs['rowSet']
    if not rows:
        return {'error': 'no data'}

    last = dict(zip(headers, rows[-1]))
    season_pts = round(float(last.get('PTS', 0) or 0), 1)
    season_reb = round(float(last.get('REB', 0) or 0), 1)
    season_ast = round(float(last.get('AST', 0) or 0), 1)
    season_id = last.get('SEASON_ID', '')

    # Game log
    url2 = f"https://stats.nba.com/stats/playergamelog?PlayerID={player_id}&Season={season_id}&SeasonType=Regular+Season&LeagueID=00"
    data2 = fetch_json(url2)
    rs2 = data2['resultSets'][0]
    rows2 = [dict(zip(rs2['headers'], r)) for r in rs2['rowSet']]

    if len(rows2) < 5:
        return {'error': 'insufficient games'}

    last5 = rows2[:5]
    last10 = rows2[:10] if len(rows2) >= 10 else rows2
    last5_pts = round(sum(float(r['PTS']) for r in last5) / len(last5), 1)
    last10_pts = round(sum(float(r['PTS']) for r in last10) / len(last10), 1)
    line = round((season_pts - 1.5) * 2) / 2
    hits = sum(1 for r in last10 if float(r['PTS']) >= line)
    hit_rate = round((hits / len(last10)) * 100)
    edge = round(last5_pts - line, 1)

    result = {
        'player_id': player_id,
        'player_name': PLAYER_NAMES.get(player_id, f'Player {player_id}'),
        'season_avg': {'pts': season_pts, 'reb': season_reb, 'ast': season_ast},
        'last5_avg': {'pts': last5_pts},
        'last10_avg': {'pts': last10_pts},
        'synthetic_lines': {'pts': line},
        'hit_rates': {'pts_last10': hit_rate},
        'edge_points': edge,
        'last5_games': [{'opp': r.get('MATCHUP',''), 'pts': float(r['PTS']), 'hit': float(r['PTS']) >= line} for r in last5],
        'summary': f'L5 {last5_pts} pts · L10 hit {hit_rate}%'
    }
    cache[f"pg_{player_id}"] = (result, time.time())
    return result


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        player_id = params.get('playerId', [''])[0]
        if not player_id:
            self._send(400, {'error': 'missing playerId'}); return
        try:
            self._send(200, get_pregame(int(player_id)))
        except Exception as e:
            self._send(500, {'error': str(e)})

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

    def _send(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, f, *a): pass
