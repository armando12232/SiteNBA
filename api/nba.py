# FAST VERSION WITH CACHE
from http.server import BaseHTTPRequestHandler
from nba_api.stats.endpoints import playergamelog, playercareerstats
import json, time

cache = {}
CACHE_TTL = 600

def get_season_averages(player_id):
    try:
        career = playercareerstats.PlayerCareerStats(player_id=player_id)
        data = career.get_dict()
        reg = next(s for s in data["resultSets"] if s["name"] == "SeasonTotalsRegularSeason")
        headers = reg["headers"]
        last = reg["rowSet"][-1]
        row = dict(zip(headers, last))
        return {"pts": float(row.get("PTS", 0))}
    except:
        return None

def get_pregame_data(player_id):
    now = time.time()
    if player_id in cache:
        data, ts = cache[player_id]
        if now - ts < CACHE_TTL:
            return data

    try:
        season = get_season_averages(player_id)
        log = playergamelog.PlayerGameLog(player_id=player_id)
        data = log.get_dict()

        rows = data["resultSets"][0]["rowSet"]
        headers = data["resultSets"][0]["headers"]
        rows = [dict(zip(headers, r)) for r in rows]

        last10 = rows[:10]
        last5 = rows[:5]

        def avg(rs):
            return round(sum(float(r["PTS"]) for r in rs)/len(rs),1)

        last5_pts = avg(last5)
        last10_pts = avg(last10)
        line = round((season["pts"]-1.5)*2)/2

        hits = sum(1 for r in last10 if float(r["PTS"])>=line)
        hit_rate = int((hits/len(last10))*100)

        edge = round(last5_pts-line,1)

        result = {
            "player_id": int(player_id),
            "player_name": f"Player {player_id}",
            "season_avg": {"pts": season["pts"]},
            "last5_avg": {"pts": last5_pts},
            "last10_avg": {"pts": last10_pts},
            "synthetic_lines": {"pts": line},
            "hit_rates": {"pts_last10": hit_rate},
            "edge_points": edge,
            "summary": f"L5 {last5_pts} pts · L10 hit {hit_rate}%"
        }

        cache[player_id] = (result, now)
        return result
    except Exception as e:
        return {"error": str(e)}

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        from urllib.parse import urlparse, parse_qs
        params = parse_qs(urlparse(self.path).query)
        t = params.get("type", [""])[0]

        if t == "pregame":
            pid = params.get("playerId", [""])[0]
            self._send(get_pregame_data(pid))
        else:
            self._send({"error":"invalid type"})

    def _send(self, data):
        self.send_response(200)
        self.send_header("Content-Type","application/json")
        self.send_header("Access-Control-Allow-Origin","*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
