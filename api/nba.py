# FAST VERSION WITH CACHE
from http.server import BaseHTTPRequestHandler
from nba_api.stats.endpoints import playercareerstats, playergamelog
from urllib.parse import parse_qs, urlparse
import json
import logging
import time

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


def _parse_player_id(raw_player_id: str) -> int:
    try:
        player_id = int(raw_player_id)
    except (TypeError, ValueError):
        raise ValueError("playerId must be an integer")

    if player_id <= 0:
        raise ValueError("playerId must be greater than zero")

    return player_id


def get_season_averages(player_id: int):
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
    return {"pts": float(row.get("PTS", 0))}


def get_pregame_data(player_id: int):
    now = time.time()
    if player_id in cache:
        data, ts = cache[player_id]
        if now - ts < CACHE_TTL:
            return data

    season = get_season_averages(player_id)
    log = playergamelog.PlayerGameLog(player_id=player_id)
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
    line = _compute_line(season["pts"])

    hits = sum(1 for r in last10 if float(r["PTS"]) >= line)
    hit_rate = int((hits / len(last10)) * 100)

    edge = round(last5_pts - line, 1)

    result = {
        "player_id": player_id,
        "player_name": f"Player {player_id}",
        "season_avg": {"pts": season["pts"]},
        "last5_avg": {"pts": last5_pts},
        "last10_avg": {"pts": last10_pts},
        "synthetic_lines": {"pts": line},
        "hit_rates": {"pts_last10": hit_rate},
        "edge_points": edge,
        "summary": f"L5 {last5_pts} pts · L10 hit {hit_rate}%",
    }

    cache[player_id] = (result, now)
    return result


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        req_type = params.get("type", [""])[0]

        if req_type != "pregame":
            self._send(400, _error_payload("INVALID_TYPE", "type must be 'pregame'"))
            return

        try:
            player_id = _parse_player_id(params.get("playerId", [""])[0])
        except ValueError as exc:
            self._send(400, _error_payload("INVALID_PLAYER_ID", str(exc)))
            return

        try:
            self._send(200, get_pregame_data(player_id))
        except UpstreamDataError as exc:
            logger.warning("Upstream data issue for playerId=%s: %s", player_id, exc)
            self._send(502, _error_payload("UPSTREAM_DATA_ERROR", str(exc)))
        except Exception as exc:
            logger.exception("Unhandled pregame error for playerId=%s", player_id)
            self._send(500, _error_payload("INTERNAL_ERROR", str(exc)))

    def _send(self, status_code: int, data: dict):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
