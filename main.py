from fastapi import FastAPI
from nba_api.stats.endpoints import playergamelog, playercareerstats
import time

app = FastAPI()

cache = {}
CACHE_TTL = 600


def get_season_avg(player_id):
    career = playercareerstats.PlayerCareerStats(player_id=player_id)
    data = career.get_dict()

    reg = next(s for s in data["resultSets"] if s["name"] == "SeasonTotalsRegularSeason")
    headers = reg["headers"]
    last = reg["rowSet"][-1]
    row = dict(zip(headers, last))

    return float(row.get("PTS", 0))


@app.get("/pregame")
def pregame(playerId: int):
    now = time.time()

    if playerId in cache:
        data, ts = cache[playerId]
        if now - ts < CACHE_TTL:
            return data

    try:
        season_pts = get_season_avg(playerId)

        log = playergamelog.PlayerGameLog(player_id=playerId)
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

        line = round((season_pts - 1.5)*2)/2

        hits = sum(1 for r in last10 if float(r["PTS"]) >= line)
        hit_rate = int((hits/len(last10))*100)

        edge = round(last5_pts - line,1)

        result = {
            "player_id": playerId,
            "season_avg": season_pts,
            "last5": last5_pts,
            "last10": last10_pts,
            "line": line,
            "hit_rate": hit_rate,
            "edge": edge
        }

        cache[playerId] = (result, now)
        return result

    except Exception as e:
        return {"error": str(e)}
