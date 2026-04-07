import os
import time

from fastapi import FastAPI, HTTPException
from nba_api.stats.endpoints import playercareerstats, playergamelog

app = FastAPI()

# In some hosts, env proxies break calls to stats.nba.com (403 on tunnel).
for proxy_key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
    os.environ.pop(proxy_key, None)

existing_no_proxy = os.environ.get("NO_PROXY", "")
if "stats.nba.com" not in existing_no_proxy:
    os.environ["NO_PROXY"] = f"{existing_no_proxy},stats.nba.com".strip(",")

cache = {}
CACHE_TTL = 600
NBA_TIMEOUT_SECONDS = 15
NBA_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.nba.com/",
    "Origin": "https://www.nba.com",
    "Accept": "application/json, text/plain, */*",
}


def _safe_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def get_season_avg(player_id: int):
    career = playercareerstats.PlayerCareerStats(
        player_id=player_id,
        timeout=NBA_TIMEOUT_SECONDS,
        headers=NBA_HEADERS,
    )
    data = career.get_dict()

    reg = next(
        (s for s in data.get("resultSets", []) if s.get("name") == "SeasonTotalsRegularSeason"),
        None,
    )
    if not reg or not reg.get("rowSet"):
        return 0.0

    headers = reg["headers"]
    last = reg["rowSet"][-1]
    row = dict(zip(headers, last))

    return _safe_float(row.get("PTS", 0))


@app.get("/pregame")
def pregame(playerId: int):
    now = time.time()

    if playerId in cache:
        data, ts = cache[playerId]
        if now - ts < CACHE_TTL:
            return data

    try:
        season_pts = get_season_avg(playerId)

        log = playergamelog.PlayerGameLog(
            player_id=playerId,
            timeout=NBA_TIMEOUT_SECONDS,
            headers=NBA_HEADERS,
        )
        data = log.get_dict()

        rows = data["resultSets"][0]["rowSet"]
        headers = data["resultSets"][0]["headers"]
        rows = [dict(zip(headers, r)) for r in rows]

        if not rows:
            raise HTTPException(status_code=404, detail="Jogador sem jogos no histórico.")

        last10 = rows[:10]
        last5 = rows[:5]

        def avg(rs):
            return round(sum(_safe_float(r.get("PTS")) for r in rs) / len(rs), 1) if rs else 0.0

        last5_pts = avg(last5)
        last10_pts = avg(last10)

        line = round((season_pts - 1.5) * 2) / 2

        hits = sum(1 for r in last10 if _safe_float(r.get("PTS")) >= line)
        hit_rate = int((hits / len(last10)) * 100) if last10 else 0

        edge = round(last5_pts - line, 1)

        result = {
            "player_id": playerId,
            "season_avg": season_pts,
            "last5": last5_pts,
            "last10": last10_pts,
            "line": line,
            "hit_rate": hit_rate,
            "edge": edge,
        }

        cache[playerId] = (result, now)
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail={
                "error": "nba_api_request_failed",
                "message": str(e),
                "hint": "Verifique conectividade com https://stats.nba.com e bloqueio de proxy/firewall.",
            },
        )
