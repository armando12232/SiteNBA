from http.server import BaseHTTPRequestHandler
from nba_api.live.nba.endpoints import scoreboard, boxscore
from nba_api.stats.endpoints import playercareerstats
import json


def get_live_games():
    board = scoreboard.ScoreBoard()
    data = board.get_dict()
    games = data.get("scoreboard", {}).get("games", [])
    live = []
    for g in games:
        status = g.get("gameStatus", 1)
        if status == 2:  # 1=scheduled, 2=live, 3=final
            live.append({
                "gameId": g.get("gameId"),
                "period": g.get("period", 1),
                "gameClock": g.get("gameClock", ""),
                "gameStatusText": g.get("gameStatusText", ""),
                "homeTeam": {
                    "teamId": g["homeTeam"]["teamId"],
                    "teamAbbreviation": g["homeTeam"]["teamAbbreviation"],
                    "teamName": g["homeTeam"]["teamName"],
                    "score": g["homeTeam"]["score"],
                },
                "awayTeam": {
                    "teamId": g["awayTeam"]["teamId"],
                    "teamAbbreviation": g["awayTeam"]["teamAbbreviation"],
                    "teamName": g["awayTeam"]["teamName"],
                    "score": g["awayTeam"]["score"],
                },
            })
    return live


def get_boxscore(game_id):
    bs = boxscore.BoxScore(game_id=game_id)
    data = bs.get_dict()
    game = data.get("game", {})
    players = []

    for team_key in ["homeTeam", "awayTeam"]:
        team = game.get(team_key, {})
        team_abbr = team.get("teamAbbreviation", "")
        team_id = team.get("teamId")
        for p in team.get("players", []):
            s = p.get("statistics", {})
            mins_str = s.get("minutesCalculated", "PT00M00S")
            try:
                mins_part = mins_str.replace("PT", "").split("M")[0]
                mins = int(mins_part) if mins_part.isdigit() else 0
            except Exception:
                mins = 0

            players.append({
                "playerId": p.get("personId"),
                "name": p.get("name", ""),
                "position": p.get("position", ""),
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


def get_season_averages(player_id):
    try:
        career = playercareerstats.PlayerCareerStats(player_id=player_id, per_mode36="PerGame")
        data = career.get_dict()
        sets = data.get("resultSets", [])
        reg = next((s for s in sets if s["name"] == "SeasonTotalsRegularSeason"), None)
        if not reg or not reg["rowSet"]:
            return None
        headers = reg["headers"]
        last = reg["rowSet"][-1]
        row = dict(zip(headers, last))
        return {
            "pts": row.get("PTS", 0) or 0,
            "reb": row.get("REB", 0) or 0,
            "ast": row.get("AST", 0) or 0,
        }
    except Exception:
        return None


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        from urllib.parse import urlparse, parse_qs
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        req_type = params.get("type", [""])[0]

        try:
            if req_type == "scoreboard":
                result = get_live_games()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"games": result}).encode())
                return

            elif req_type == "boxscore":
                game_id = params.get("gameId", [""])[0]
                if not game_id:
                    self.send_response(400)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "missing gameId"}).encode())
                    return

                players = get_boxscore(game_id)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"players": players}).encode())
                return

            elif req_type == "season_avg":
                player_id = params.get("playerId", [""])[0]
                if not player_id:
                    self.send_response(400)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "missing playerId"}).encode())
                    return

                avg = get_season_averages(player_id)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"avg": avg}).encode())
                return

            else:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "invalid type"}).encode())
                return

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        pass
