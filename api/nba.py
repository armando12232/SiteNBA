from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import json
import time

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
        from nba_api.stats.endpoints import playercareerstats
        career = playercareerstats.PlayerCareerStats(
            player_id=player_id, per_mode36="PerGame"
        )
        data = career.get_dict()
        reg = next(
            (s for s in data.get("resultSets", [])
             if s.get("name") == "SeasonTotalsRegularSeason"),
            None,
        )
        if not reg or not reg.get("rowSet"):
            return None
        headers = reg["headers"]
        last_row = dict(zip(headers, reg["rowSet"][-1]))
        avg = {
            "pts": float(last_row.get("PTS", 0) or 0),
            "reb": float(last_row.get("REB", 0) or 0),
            "ast": float(last_row.get("AST", 0) or 0),
        }
        _cache_set(f"avg_{player_id}", avg)
        return avg
    except Exception as e:
        return None


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

            else:
                self._send(400, {"error": f"type invalido: '{req_type}'. Use scoreboard, boxscore ou season_avg"})

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
