from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Dict, List

from nba_api.stats.endpoints import playercareerstats, playergamelog


CACHE_TTL_SECONDS = 600
_cache: Dict[int, tuple[dict[str, Any], float]] = {}


class ServiceError(Exception):
    """Raised when input or upstream data is invalid."""


@dataclass(frozen=True)
class PregameMetrics:
    player_id: int
    season_avg: float
    last5: float
    last10: float
    line: float
    hit_rate: int
    edge: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "player_id": self.player_id,
            "season_avg": self.season_avg,
            "last5": self.last5,
            "last10": self.last10,
            "line": self.line,
            "hit_rate": self.hit_rate,
            "edge": self.edge,
            "summary": f"L5 {self.last5} pts · L10 hit {self.hit_rate}%",
        }


def _validate_player_id(player_id: int | str) -> int:
    try:
        pid = int(player_id)
    except (TypeError, ValueError) as exc:
        raise ServiceError("playerId must be an integer.") from exc

    if pid <= 0:
        raise ServiceError("playerId must be greater than 0.")
    return pid


def _safe_avg(points: List[float], window_name: str) -> float:
    if not points:
        raise ServiceError(f"Insufficient games for {window_name} average.")
    return round(sum(points) / len(points), 1)


def _calculate_line(season_avg: float) -> float:
    return round((season_avg - 1.5) * 2) / 2


def _parse_recent_points(rows: list[dict[str, Any]], window: int) -> list[float]:
    if len(rows) < window:
        raise ServiceError(f"Insufficient games: expected at least {window}.")

    points: list[float] = []
    for row in rows[:window]:
        try:
            points.append(float(row["PTS"]))
        except (KeyError, TypeError, ValueError) as exc:
            raise ServiceError("Invalid game log response from upstream API.") from exc
    return points


def _get_season_avg_points(player_id: int) -> float:
    try:
        career = playercareerstats.PlayerCareerStats(player_id=player_id)
        data = career.get_dict()
        reg = next(s for s in data["resultSets"] if s["name"] == "SeasonTotalsRegularSeason")
        headers = reg["headers"]
        row_set = reg["rowSet"]
    except Exception as exc:  # upstream library error shape is not stable
        raise ServiceError("Failed to retrieve season stats from NBA API.") from exc

    if not row_set:
        raise ServiceError("No regular-season totals found for player.")

    row = dict(zip(headers, row_set[-1]))
    try:
        return float(row.get("PTS", 0))
    except (TypeError, ValueError) as exc:
        raise ServiceError("Invalid season points value from NBA API.") from exc


def _get_game_rows(player_id: int) -> list[dict[str, Any]]:
    try:
        game_log = playergamelog.PlayerGameLog(player_id=player_id)
        data = game_log.get_dict()
        headers = data["resultSets"][0]["headers"]
        row_set = data["resultSets"][0]["rowSet"]
    except Exception as exc:
        raise ServiceError("Failed to retrieve game logs from NBA API.") from exc

    rows = [dict(zip(headers, row)) for row in row_set]
    if not rows:
        raise ServiceError("No game logs found for player.")
    return rows


def compute_pregame_metrics(player_id: int | str) -> dict[str, Any]:
    pid = _validate_player_id(player_id)
    now = time.time()

    cached = _cache.get(pid)
    if cached and now - cached[1] < CACHE_TTL_SECONDS:
        return cached[0]

    season_avg = _get_season_avg_points(pid)
    rows = _get_game_rows(pid)

    last5_points = _parse_recent_points(rows, 5)
    last10_points = _parse_recent_points(rows, 10)

    last5 = _safe_avg(last5_points, "last5")
    last10 = _safe_avg(last10_points, "last10")
    line = _calculate_line(season_avg)

    hits = sum(1 for p in last10_points if p >= line)
    hit_rate = int((hits / len(last10_points)) * 100)
    edge = round(last5 - line, 1)

    result = PregameMetrics(
        player_id=pid,
        season_avg=season_avg,
        last5=last5,
        last10=last10,
        line=line,
        hit_rate=hit_rate,
        edge=edge,
    ).to_dict()

    _cache[pid] = (result, now)
    return result


def error_response(error: str, *, code: str = "bad_request") -> dict[str, str]:
    return {"error": error, "code": code}
