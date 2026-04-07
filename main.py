from fastapi import FastAPI, HTTPException, Query
from nba_api.stats.endpoints import playercareerstats, playergamelog
import logging
import time

app = FastAPI()

logger = logging.getLogger(__name__)

cache = {}
CACHE_TTL = 600


class UpstreamDataError(Exception):
    """Raised when upstream NBA data is missing or invalid."""


def _error_payload(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


def _avg_pts(rows: list[dict]) -> float:
    if not rows:
        raise UpstreamDataError("No game rows available to compute average")
    return round(sum(float(r["PTS"]) for r in rows) / len(rows), 1)


def _compute_line(season_pts: float) -> float:
    return round((season_pts - 1.5) * 2) / 2


def get_season_avg(player_id: int) -> float:
    career = playercareerstats.PlayerCareerStats(player_id=player_id)
    data = career.get_dict()

    reg = next(
        (s for s in data.get("resultSets", []) if s.get("name") == "SeasonTotalsRegularSeason"),
        None,
    )
    if not reg or not reg.get("rowSet"):
        raise UpstreamDataError("Season totals not available for player")

    headers = reg["headers"]
    last = reg["rowSet"][-1]
    row = dict(zip(headers, last))
    return float(row.get("PTS", 0))


@app.get("/pregame")
def pregame(playerId: int = Query(..., gt=0)):
    now = time.time()

    if playerId in cache:
        data, ts = cache[playerId]
        if now - ts < CACHE_TTL:
            return data

    try:
        season_pts = get_season_avg(playerId)

        log = playergamelog.PlayerGameLog(player_id=playerId)
        data = log.get_dict()

        result_set = data.get("resultSets", [{}])[0]
        rows = result_set.get("rowSet", [])
        headers = result_set.get("headers", [])
        rows = [dict(zip(headers, r)) for r in rows]

        if len(rows) < 10:
            raise UpstreamDataError("Insufficient game log data (need at least 10 games)")

        last10 = rows[:10]
        last5 = rows[:5]

        last5_pts = _avg_pts(last5)
        last10_pts = _avg_pts(last10)

        line = _compute_line(season_pts)

        hits = sum(1 for r in last10 if float(r["PTS"]) >= line)
        hit_rate = int((hits / len(last10)) * 100)

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
    except UpstreamDataError as exc:
        logger.warning("Upstream data issue for playerId=%s: %s", playerId, exc)
        raise HTTPException(status_code=502, detail=_error_payload("UPSTREAM_DATA_ERROR", str(exc)))
    except Exception as exc:
        logger.exception("Unhandled pregame error for playerId=%s", playerId)
        raise HTTPException(status_code=500, detail=_error_payload("INTERNAL_ERROR", str(exc)))
