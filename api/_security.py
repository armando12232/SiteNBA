"""Shared security helpers for Vercel API routes.

Keep this module private to the API runtime. Files prefixed with an underscore
are helpers, not public endpoints, and match the imports used by the Python
functions.
"""

import re
import time


_RATE_BUCKETS = {}
_RATE_MAX = 60
_RATE_WINDOW = 60

_RE_ABBR = re.compile(r"^[A-Z]{2,4}$")
_RE_ID = re.compile(r"^[a-zA-Z0-9_-]{1,40}$")
_RE_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$")
_RE_STAT = re.compile(r"^(pts|reb|ast|fg3m|stl|blk)$")
_RE_POSITION = re.compile(r"^[A-Z]{1,3}(-[A-Z]{1,3})?$")
_RE_LEAGUEKEY = re.compile(r"^[a-z]{3,20}$")


def rate_limit_check(ip):
    """Return True when the request is inside the per-instance IP limit."""
    if ip in ("127.0.0.1", "::1", "0.0.0.0"):
        return True

    now = time.time()
    bucket = [stamp for stamp in _RATE_BUCKETS.get(ip, []) if now - stamp < _RATE_WINDOW]
    if len(bucket) >= _RATE_MAX:
        _RATE_BUCKETS[ip] = bucket
        return False

    bucket.append(now)
    _RATE_BUCKETS[ip] = bucket
    if len(_RATE_BUCKETS) > 1000:
        _cleanup_buckets(now)
    return True


def _cleanup_buckets(now):
    for ip in list(_RATE_BUCKETS.keys()):
        _RATE_BUCKETS[ip] = [stamp for stamp in _RATE_BUCKETS[ip] if now - stamp < _RATE_WINDOW]
        if not _RATE_BUCKETS[ip]:
            del _RATE_BUCKETS[ip]


def is_valid_abbr(value):
    return bool(value and _RE_ABBR.match(value))


def is_valid_id(value):
    return bool(value and _RE_ID.match(str(value)))


def is_valid_date(value):
    return bool(value and _RE_DATE.match(value))


def is_valid_stat(value):
    return bool(value and _RE_STAT.match(value))


def is_valid_position(value):
    return bool(value and _RE_POSITION.match(value))


def is_valid_league(value):
    return bool(value and _RE_LEAGUEKEY.match(value))


def sanitize_team_name(value):
    if not value:
        return ""
    return re.sub(r"[^\w\s.\-']", "", value, flags=re.UNICODE)[:60]


def get_client_ip(handler):
    xff = handler.headers.get("x-forwarded-for") or handler.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    return handler.client_address[0] if handler.client_address else "0.0.0.0"
