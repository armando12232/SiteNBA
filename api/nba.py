from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import json

from nba_service import ServiceError, compute_pregame_metrics, error_response


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        endpoint_type = params.get("type", [""])[0]

        if endpoint_type != "pregame":
            self._send(
                error_response("invalid type; use type=pregame", code="invalid_type"),
                status=400,
            )
            return

        player_id = params.get("playerId", [""])[0]

        try:
            payload = compute_pregame_metrics(player_id)
            self._send(payload, status=200)
        except ServiceError as exc:
            self._send(error_response(str(exc), code="bad_request"), status=400)
        except Exception:
            self._send(
                error_response("Upstream NBA API failure.", code="upstream_error"),
                status=502,
            )

    def _send(self, data, status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
