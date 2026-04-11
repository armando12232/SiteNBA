from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen
import json, time

cache = {}
CACHE_TTL = 300

def _cache_get(key):
    if key in cache:
        data, ts = cache[key]
        if time.time() - ts < CACHE_TTL:
            return data
    return None

def _cache_set(key, data):
    cache[key] = (data, time.time())

NBA_HEADERS = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://www.nba.com',
    'Referer': 'https://www.nba.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'x-nba-stats-origin': 'stats',
    'x-nba-stats-token': 'true',
}

def _nba_fetch(url, timeout=9):
    req = Request(url, headers=NBA_HEADERS)
    with urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())

def get_live_games():
    from nba_api.live.nba.endpoints import scoreboard
    board = scoreboard.ScoreBoard()
    data = board.get_dict()
    games = data.get("scoreboard", {}).get("games", [])
    live = []
    for g in games:
        if g.get("gameStatus") == 2:
            ht = g.get("homeTeam", {})
            at = g.get("awayTeam", {})
            live.append({
                "gameId": g.get("gameId"),
                "period": g.get("period", 1),
                "gameClock": g.get("gameClock", "PT12M00S"),
                "gameStatusText": g.get("gameStatusText", ""),
                "homeTeam": {
                    "teamId": ht.get("teamId"),
                    "teamAbbreviation": ht.get("teamTricode", ht.get("teamAbbreviation", "HME")),
                    "score": ht.get("score", 0),
                },
                "awayTeam": {
                    "teamId": at.get("teamId"),
                    "teamAbbreviation": at.get("teamTricode", at.get("teamAbbreviation", "AWY")),
                    "score": at.get("score", 0),
                },
            })
    return live

def get_boxscore(game_id):
    from nba_api.live.nba.endpoints import boxscore
    bs = boxscore.BoxScore(game_id=game_id)
    data = bs.get_dict()
    game = data.get("game", {})
    players = []
    for team_key in ["homeTeam", "awayTeam"]:
        team = game.get(team_key, {})
        team_abbr = team.get("teamTricode", team.get("teamAbbreviation", "???"))
        team_id = team.get("teamId")
        for p in team.get("players", []):
            s = p.get("statistics", {})
            mins_str = s.get("minutesCalculated", "PT00M00S")
            try:
                mins = int(mins_str.replace("PT", "").split("M")[0])
            except:
                mins = 0
            players.append({
                "playerId": p.get("personId"),
                "name": p.get("name", ""),
                "position": p.get("position", "—"),
                "teamAbbr": team_abbr,
                "teamId": team_id,
                "isHome": team_key == "homeTeam",
                "mins": mins,
                "pts": s.get("points", 0),
                "reb": s.get("reboundsTotal", 0),
                "ast": s.get("assists", 0),
                "pf": s.get("foulsPersonal", 0),
                "fgm": s.get("fieldGoalsMade", 0),
                "fga": s.get("fieldGoalsAttempted", 0),
                "tpm": s.get("threePointersMade", 0),
                "to": s.get("turnovers", 0),
                "plusMinus": s.get("plusMinusPoints", 0),
                "stl": s.get("steals", 0),
            })
    return players

def get_season_avg(player_id):
    cached = _cache_get(f"avg_{player_id}")
    if cached:
        return cached
    try:
        url = "https://cdn.nba.com/static/json/staticData/playerIndex.json"
        data = _nba_fetch(url, timeout=8)
        rs = data.get("resultSets", [{}])[0]
        headers = rs.get("headers", [])
        rows = rs.get("rowSet", [])
        pid_idx = headers.index("PERSON_ID") if "PERSON_ID" in headers else 0
        pts_idx = headers.index("PTS") if "PTS" in headers else -1
        reb_idx = headers.index("REB") if "REB" in headers else -1
        ast_idx = headers.index("AST") if "AST" in headers else -1
        row = next((r for r in rows if r[pid_idx] == player_id), None)
        if not row:
            return None
        avg = {
            "pts": float(row[pts_idx] or 0) if pts_idx >= 0 else 0,
            "reb": float(row[reb_idx] or 0) if reb_idx >= 0 else 0,
            "ast": float(row[ast_idx] or 0) if ast_idx >= 0 else 0,
        }
        _cache_set(f"avg_{player_id}", avg)
        return avg
    except Exception as e:
        return None

def get_pregame(player_id):
    """Busca L5/L10/hitRate via urllib direto — sem nba_api (evita timeout)"""
    cached = _cache_get(f"pregame_{player_id}")
    if cached:
        return cached

    try:
        # 1. Média da temporada via CDN (rápido, ~1s)
        cdn_url = "https://cdn.nba.com/static/json/staticData/playerIndex.json"
        cdn_data = _nba_fetch(cdn_url, timeout=8)
        rs = cdn_data.get("resultSets", [{}])[0]
        hdrs = rs.get("headers", [])
        rows = rs.get("rowSet", [])
        pid_idx = hdrs.index("PERSON_ID") if "PERSON_ID" in hdrs else 0
        pts_idx = hdrs.index("PTS") if "PTS" in hdrs else -1
        reb_idx = hdrs.index("REB") if "REB" in hdrs else -1
        ast_idx = hdrs.index("AST") if "AST" in hdrs else -1
        row = next((r for r in rows if r[pid_idx] == player_id), None)
        season_pts = round(float(row[pts_idx] or 0), 1) if (row and pts_idx >= 0) else 0
        season_reb = round(float(row[reb_idx] or 0), 1) if (row and reb_idx >= 0) else 0
        season_ast = round(float(row[ast_idx] or 0), 1) if (row and ast_idx >= 0) else 0
    except Exception:
        season_pts, season_reb, season_ast = 0, 0, 0

    try:
        # 2. Game log via stats.nba.com direto (urllib, headers corretos)
        log_url = (
            f"https://stats.nba.com/stats/playergamelog"
            f"?PlayerID={player_id}&Season=2024-25"
            f"&SeasonType=Regular+Season&LeagueID=00"
        )
        log_data = _nba_fetch(log_url, timeout=9)
        rs2 = log_data.get("resultSets", [{}])[0]
        game_rows = [
            dict(zip(rs2["headers"], r))
            for r in rs2.get("rowSet", [])
        ]
    except Exception:
        game_rows = []

    if len(game_rows) < 5:
        # Fallback: retornar só médias da temporada sem L5/L10
        line = round((season_pts - 1.5) * 2) / 2 if season_pts > 0 else None
        result = {
            "player_id": player_id,
            "season_avg": {"pts": season_pts, "reb": season_reb, "ast": season_ast},
            "last5_avg":  {"pts": None},
            "last10_avg": {"pts": None},
            "synthetic_lines": {"pts": line},
            "hit_rates": {"pts_last10": None},
            "edge_points": None,
            "last5_games": [],
            "summary": f"Temporada: {season_pts}pts"
        }
        _cache_set(f"pregame_{player_id}", result)
        return result

    last5  = game_rows[:5]
    last10 = game_rows[:10] if len(game_rows) >= 10 else game_rows

    last5_pts  = round(sum(float(r["PTS"]) for r in last5)  / len(last5),  1)
    last10_pts = round(sum(float(r["PTS"]) for r in last10) / len(last10), 1)
    last5_reb  = round(sum(float(r.get("REB",0)) for r in last5) / len(last5), 1)
    last5_ast  = round(sum(float(r.get("AST",0)) for r in last5) / len(last5), 1)
    last5_mins = round(sum(float(r.get("MIN","0").split(":")[0]) for r in last5) / len(last5), 1)

    line = round((season_pts - 1.5) * 2) / 2 if season_pts > 0 else round(last5_pts - 1.5)
    hits = sum(1 for r in last10 if float(r["PTS"]) >= line)
    hit_rate = round((hits / len(last10)) * 100)
    edge = round(last5_pts - line, 1)

    result = {
        "player_id": player_id,
        "season_avg": {"pts": season_pts, "reb": season_reb, "ast": season_ast},
        "last5_avg":  {"pts": last5_pts, "reb": last5_reb, "ast": last5_ast},
        "last10_avg": {"pts": last10_pts},
        "synthetic_lines": {"pts": line},
        "hit_rates": {"pts_last10": hit_rate},
        "edge_points": edge,
        "minsL5": last5_mins,
        "last5_games": [
            {
                "opp": r.get("MATCHUP", ""),
                "pts": float(r["PTS"]),
                "reb": float(r.get("REB", 0)),
                "ast": float(r.get("AST", 0)),
                "hit": float(r["PTS"]) >= line
            }
            for r in last5
        ],
        "summary": f"L5 {last5_pts}pts · L10 hit {hit_rate}%"
    }
    _cache_set(f"pregame_{player_id}", result)
    return result


# Cache longo para dados de defesa (mudam pouco)
def get_defense_ranking(team_abbr, position):
    cache_key = f"defense_{team_abbr}_{position}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    pos_map = {
        "G": "Guards", "PG": "Guards", "SG": "Guards",
        "F": "Forwards", "SF": "Forwards", "PF": "Forwards",
        "C": "Centers", "FC": "Centers",
    }
    pos_upper = (position or "").upper().split("-")[0]
    category = pos_map.get(pos_upper, "Guards")

    try:
        url = (
            "https://stats.nba.com/stats/leaguedashptdefend"
            "?College=&Conference=&Country=&DateFrom=&DateTo="
            f"&DefenseCategory={category.replace(' ', '+')}"
            "&Division=&DraftPick=&DraftYear=&GameSegment=&Height="
            "&LastNGames=0&LeagueID=00&Location=&Month=0&OpponentTeamID=0"
            "&Outcome=&PORound=0&PerMode=PerGame&Period=0"
            "&PlayerExperience=&PlayerPosition=&Season=2024-25"
            "&SeasonSegment=&SeasonType=Regular+Season"
            "&StarterBench=&TeamID=0&VsConference=&VsDivision=&Weight="
        )
        data = _nba_fetch(url, timeout=9)
        rs = data.get("resultSets", [{}])[0]
        headers = rs.get("headers", [])
        rows = rs.get("rowSet", [])

        if not rows or not headers:
            return None

        abbr_idx = headers.index("TEAM_ABBREVIATION") if "TEAM_ABBREVIATION" in headers else None
        pts_idx  = headers.index("PTS") if "PTS" in headers else None

        if abbr_idx is None or pts_idx is None:
            return None

        team_data = [{"abbr": r[abbr_idx], "pts": float(r[pts_idx] or 0)} for r in rows]
        sorted_teams = sorted(team_data, key=lambda x: x["pts"], reverse=True)
        target = next((t for t in team_data if t["abbr"] == team_abbr.upper()), None)
        if not target:
            return None

        rank = next((i+1 for i, t in enumerate(sorted_teams) if t["abbr"] == team_abbr.upper()), None)
        total = len(sorted_teams)

        result = {
            "team": team_abbr.upper(),
            "position": position,
            "category": category,
            "pts_allowed": round(target["pts"], 1),
            "rank": rank,
            "total": total,
            "rating": "ruim" if rank <= 10 else "media" if rank <= 20 else "boa",
            "favorable": rank <= 15,
        }
        _cache_set(cache_key, result)
        return result

    except Exception as e:
        return {"error": str(e)}

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        req_type = params.get("type", [""])[0]
        try:
            if req_type == "scoreboard":
                self._send(200, {"games": get_live_games()})

            elif req_type == "boxscore":
                game_id = params.get("gameId", [""])[0]
                if not game_id:
                    self._send(400, {"error": "missing gameId"}); return
                self._send(200, {"players": get_boxscore(game_id)})

            elif req_type == "season_avg":
                player_id = params.get("playerId", [""])[0]
                if not player_id:
                    self._send(400, {"error": "missing playerId"}); return
                self._send(200, {"avg": get_season_avg(int(player_id))})

            elif req_type == "pregame":
                player_id = params.get("playerId", [""])[0]
                if not player_id:
                    self._send(400, {"error": "missing playerId"}); return
                self._send(200, get_pregame(int(player_id)))

            elif req_type == "defense":
                team_abbr = params.get("teamAbbr", [""])[0]
                position  = params.get("position", ["G"])[0]
                if not team_abbr:
                    self._send(400, {"error": "missing teamAbbr"}); return
                result = get_defense_ranking(team_abbr, position)
                self._send(200, result or {"error": "not found"})

            else:
                self._send(400, {"error": f"type invalido: '{req_type}'"})

        except Exception as e:
            self._send(500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,OPTIONS")
        self.end_headers()

    def _send(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass
