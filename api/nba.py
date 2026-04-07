from http.server import BaseHTTPRequestHandler
from nba_api.live.nba.endpoints import scoreboard, boxscore
from nba_api.stats.endpoints import playercareerstats, playergamelog
import json
from datetime import datetime


def safe_round(value, digits=1):
    try:
        return round(float(value), digits)
    except Exception:
        return 0


def get_live_games():
    board = scoreboard.ScoreBoard()
    data = board.get_dict()
    games = data.get("scoreboard", {}).get("games", [])
    live = []
    for g in games:
        status = g.get("gameStatus", 1)
        if status == 2:
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
            "pts": safe_round(row.get("PTS", 0)),
            "reb": safe_round(row.get("REB", 0)),
            "ast": safe_round(row.get("AST", 0)),
            "team_id": row.get("TEAM_ID"),
        }
    except Exception:
        return None


def mean_of(rows, key, n):
    subset = rows[:n]
    if not subset:
        return 0
    values = [float(r.get(key, 0) or 0) for r in subset]
    return safe_round(sum(values) / len(values))


def count_hit_rate(rows, key, line, n):
    subset = rows[:n]
    if not subset:
        return 0
    hits = sum(1 for r in subset if float(r.get(key, 0) or 0) >= line)
    return int(round((hits / len(subset)) * 100))


def build_synthetic_lines(season_avg):
    pts = max(8.5, round((float(season_avg.get("pts", 0)) - 1.5) * 2) / 2)
    reb = max(2.5, round((float(season_avg.get("reb", 0)) - 0.5) * 2) / 2)
    ast = max(1.5, round((float(season_avg.get("ast", 0)) - 0.5) * 2) / 2)
    return {"pts": pts, "reb": reb, "ast": ast}


def get_pregame_data(player_id):
    season_avg = get_season_averages(player_id)
    if not season_avg:
        return None

    # Current season can be derived from current date; keep practical for testing.
    now = datetime.utcnow()
    season_year = now.year if now.month >= 10 else now.year - 1
    season = f"{season_year}-{str((season_year + 1) % 100).zfill(2)}"

    log = playergamelog.PlayerGameLog(
        player_id=player_id,
        season=season,
        season_type_all_star="Regular Season"
    )
    df = log.get_data_frames()[0]
    rows = df.to_dict("records") if hasattr(df, "to_dict") else []
    if not rows:
        return None

    player_name = rows[0].get("Player_ID")
    # resolve player name / matchup from the API object where possible
    headers = list(rows[0].keys())

    synthetic = build_synthetic_lines(season_avg)

    result = {
        "player_id": int(player_id),
        "player_name": None,
        "team_abbr": None,
        "next_game": "Radar pré-jogo",
        "season_avg": {
            "pts": season_avg["pts"],
            "reb": season_avg["reb"],
            "ast": season_avg["ast"],
        },
        "last5_avg": {
            "pts": mean_of(rows, "PTS", 5),
            "reb": mean_of(rows, "REB", 5),
            "ast": mean_of(rows, "AST", 5),
        },
        "last10_avg": {
            "pts": mean_of(rows, "PTS", 10),
            "reb": mean_of(rows, "REB", 10),
            "ast": mean_of(rows, "AST", 10),
        },
        "hit_rates": {
            "pts_last5": count_hit_rate(rows, "PTS", synthetic["pts"], 5),
            "pts_last10": count_hit_rate(rows, "PTS", synthetic["pts"], 10),
            "reb_last5": count_hit_rate(rows, "REB", synthetic["reb"], 5),
            "reb_last10": count_hit_rate(rows, "REB", synthetic["reb"], 10),
            "ast_last5": count_hit_rate(rows, "AST", synthetic["ast"], 5),
            "ast_last10": count_hit_rate(rows, "AST", synthetic["ast"], 10),
        },
        "synthetic_lines": synthetic,
        "recent_games": [
            {
                "game_date": r.get("GAME_DATE"),
                "matchup": r.get("MATCHUP"),
                "pts": r.get("PTS"),
                "reb": r.get("REB"),
                "ast": r.get("AST"),
                "min": r.get("MIN"),
            }
            for r in rows[:10]
        ]
    }

    # best available fields from game log
    first = rows[0]
    result["team_abbr"] = (first.get("MATCHUP", "").split(" ")[0] if first.get("MATCHUP") else None)

    # get player name from career stats response when available
    try:
        career = playercareerstats.PlayerCareerStats(player_id=player_id, per_mode36="PerGame")
        sets = career.get_dict().get("resultSets", [])
        reg = next((s for s in sets if s["name"] == "SeasonTotalsRegularSeason"), None)
        if reg and reg["rowSet"]:
            headers = reg["headers"]
            last = reg["rowSet"][-1]
            row = dict(zip(headers, last))
            result["player_name"] = f'{row.get("PLAYER_NAME", "")}'.strip() or None
            team_abbr = row.get("TEAM_ABBREVIATION")
            if team_abbr:
                result["team_abbr"] = team_abbr
    except Exception:
        pass

    if not result["player_name"]:
        # fallback map for demo/test
        name_map = {
            203999: "Nikola Jokic",
            1628983: "Shai Gilgeous-Alexander",
            1628384: "Jalen Brunson",
            1629029: "Tyler Herro",
            1630532: "Franz Wagner",
            202695: "Kawhi Leonard",
        }
        result["player_name"] = name_map.get(int(player_id), f"Player {player_id}")

    result["edge_points"] = safe_round(result["last5_avg"]["pts"] - synthetic["pts"], 1)
    result["summary"] = (
        f'L5 {result["last5_avg"]["pts"]} pts · '
        f'L10 hit {result["hit_rates"]["pts_last10"]}% · '
        f'temporada {result["season_avg"]["pts"]}'
    )
    return result


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        from urllib.parse import urlparse, parse_qs
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        req_type = params.get("type", [""])[0]

        try:
            if req_type == "scoreboard":
                result = get_live_games()
                self._send_json(200, {"games": result})
                return

            elif req_type == "boxscore":
                game_id = params.get("gameId", [""])[0]
                if not game_id:
                    self._send_json(400, {"error": "missing gameId"})
                    return
                players = get_boxscore(game_id)
                self._send_json(200, {"players": players})
                return

            elif req_type == "season_avg":
                player_id = params.get("playerId", [""])[0]
                if not player_id:
                    self._send_json(400, {"error": "missing playerId"})
                    return
                avg = get_season_averages(player_id)
                self._send_json(200, {"avg": avg})
                return

            elif req_type == "pregame":
                player_id = params.get("playerId", [""])[0]
                if not player_id:
                    self._send_json(400, {"error": "missing playerId"})
                    return
                data = get_pregame_data(player_id)
                if not data:
                    self._send_json(404, {"error": "pregame data unavailable"})
                    return
                self._send_json(200, data)
                return

            else:
                self._send_json(400, {"error": "invalid type"})
                return

        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def _send_json(self, status_code, payload):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        pass
