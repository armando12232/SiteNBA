from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
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
            })
    return players

def get_season_avg(player_id):
    cached = _cache_get(f"avg_{player_id}")
    if cached:
        return cached
    try:
        import urllib.request
        url = "https://cdn.nba.com/static/json/staticData/playerIndex.json"
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0',
            'Origin': 'https://www.nba.com',
            'Referer': 'https://www.nba.com/',
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            import json as _json
            data = _json.loads(r.read())
        rs = data.get("resultSets", [{}])[0]
        headers = rs.get("headers", [])
        rows = rs.get("rowSet", [])
        # Achar o jogador pelo ID (primeira coluna = PERSON_ID)
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
    cached = _cache_get(f"pregame_{player_id}")
    if cached:
        return cached
    from nba_api.stats.endpoints import playercareerstats, playergamelog
    from nba_api.stats.static import players as nba_players

    all_players = nba_players.get_players()
    info = next((p for p in all_players if p["id"] == player_id), None)
    player_name = info["full_name"] if info else f"Player {player_id}"

    career = playercareerstats.PlayerCareerStats(player_id=player_id, per_mode36="PerGame")
    career_data = career.get_dict()
    reg = next((s for s in career_data.get("resultSets", []) if s.get("name") == "SeasonTotalsRegularSeason"), None)
    if not reg or not reg.get("rowSet"):
        return {"error": "Sem dados de temporada"}

    headers = reg["headers"]
    last_row = dict(zip(headers, reg["rowSet"][-1]))
    season_pts = round(float(last_row.get("PTS", 0) or 0), 1)
    season_reb = round(float(last_row.get("REB", 0) or 0), 1)
    season_ast = round(float(last_row.get("AST", 0) or 0), 1)

    log = playergamelog.PlayerGameLog(player_id=player_id)
    log_data = log.get_dict()
    rs = log_data.get("resultSets", [{}])[0]
    rows = [dict(zip(rs["headers"], r)) for r in rs.get("rowSet", [])]

    if len(rows) < 5:
        return {"error": "Poucos jogos disponíveis"}

    last5  = rows[:5]
    last10 = rows[:10] if len(rows) >= 10 else rows
    last5_pts  = round(sum(float(r["PTS"]) for r in last5)  / len(last5),  1)
    last10_pts = round(sum(float(r["PTS"]) for r in last10) / len(last10), 1)
    line = round((season_pts - 1.5) * 2) / 2
    hits = sum(1 for r in last10 if float(r["PTS"]) >= line)
    hit_rate = round((hits / len(last10)) * 100)
    edge = round(last5_pts - line, 1)

    result = {
        "player_id": player_id,
        "player_name": player_name,
        "season_avg": {"pts": season_pts, "reb": season_reb, "ast": season_ast},
        "last5_avg":  {"pts": last5_pts},
        "last10_avg": {"pts": last10_pts},
        "synthetic_lines": {"pts": line},
        "hit_rates": {"pts_last10": hit_rate},
        "edge_points": edge,
        "last5_games": [{"opp": r.get("MATCHUP",""), "pts": float(r["PTS"]), "hit": float(r["PTS"]) >= line} for r in last5],
        "summary": f"L5 {last5_pts} pts · L10 hit {hit_rate}%"
    }
    _cache_set(f"pregame_{player_id}", result)
    return result


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
