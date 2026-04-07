from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import json
import os
import time

from nba_api.stats.endpoints import playercareerstats, playergamelog

CACHE_TTL_SECONDS = 600
NBA_TIMEOUT_SECONDS = 15

# Headers are required by stats.nba.com in many environments.
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

# In some hosts, env proxies break calls to stats.nba.com (403 on tunnel).
for proxy_key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
    os.environ.pop(proxy_key, None)

existing_no_proxy = os.environ.get("NO_PROXY", "")
if "stats.nba.com" not in existing_no_proxy:
    os.environ["NO_PROXY"] = f"{existing_no_proxy},stats.nba.com".strip(",")

cache = {}


def _safe_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def get_season_averages(player_id: int):
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
        return None

    headers = reg["headers"]
    last = reg["rowSet"][-1]
    row = dict(zip(headers, last))
    return {"pts": _safe_float(row.get("PTS", 0))}


def get_pregame_data(player_id: int):
    now = time.time()

    if player_id in cache:
        data, ts = cache[player_id]
        if now - ts < CACHE_TTL_SECONDS:
            return data

    season = get_season_averages(player_id)
    if season is None:
        return {
            "error": "no_season_data",
            "message": "Não foi possível carregar médias da temporada para este jogador.",
        }

    log = playergamelog.PlayerGameLog(
        player_id=player_id,
        timeout=NBA_TIMEOUT_SECONDS,
        headers=NBA_HEADERS,
    )
    data = log.get_dict()

    result_sets = data.get("resultSets", [])
    if not result_sets:
        return {
            "error": "no_game_log",
            "message": "Resposta da NBA sem histórico de jogos.",
        }

    rows = result_sets[0].get("rowSet", [])
    headers = result_sets[0].get("headers", [])
    games = [dict(zip(headers, row)) for row in rows]

    if not games:
        return {
            "error": "empty_game_log",
            "message": "Jogador sem partidas disponíveis no game log.",
        }

    last10 = games[:10]
    last5 = games[:5]

    def avg(rs):
        if not rs:
            return 0.0
        return round(sum(_safe_float(r.get("PTS")) for r in rs) / len(rs), 1)

    last5_pts = avg(last5)
    last10_pts = avg(last10)
    line = round((season["pts"] - 1.5) * 2) / 2

    hits = sum(1 for r in last10 if _safe_float(r.get("PTS")) >= line)
    hit_rate = int((hits / len(last10)) * 100) if last10 else 0

    edge = round(last5_pts - line, 1)

    result = {
        "player_id": int(player_id),
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
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        request_type = params.get("type", [""])[0]

        if request_type != "pregame":
            return self._send({"error": "invalid_type", "message": "Use type=pregame"}, status=400)

        raw_player_id = params.get("playerId", [""])[0]
        if not raw_player_id.isdigit():
            return self._send(
                {"error": "invalid_player_id", "message": "playerId deve ser um número inteiro."},
                status=400,
            )

        try:
            payload = get_pregame_data(int(raw_player_id))
        except Exception as exc:
            payload = {
                "error": "nba_api_request_failed",
                "message": str(exc),
                "hint": "Verifique conectividade com https://stats.nba.com e bloqueio de proxy/firewall.",
            }

        status = 502 if payload.get("error") in {"nba_api_request_failed"} else 200
        return self._send(payload, status=status)

    def _send(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
