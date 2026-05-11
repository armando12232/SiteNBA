"""Plan checks shared by Python serverless functions.

Frontend gating is useful for UX, but paid endpoints also need a server-side
check so direct API calls cannot bypass the plan.
"""

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request


DEFAULT_SUPABASE_URL = "https://dhirxfoxcswctxcjzvhf.supabase.co"
ACTIVE_STATUS = {"active", "trialing"}
PLAN_RANK = {"free": 0, "basic": 1, "pro": 2, "premium": 3}
FEATURE_MIN_PLAN = {
    "modal": "basic",
    "live": "pro",
    "injuries": "pro",
    "football": "pro",
    "sports": "pro",
    "props_by_game": "premium",
}
_CACHE = {}
_CACHE_TTL = 60


def check_feature(headers, feature):
    """Return (ok, status, payload) for the requested feature."""
    min_plan = FEATURE_MIN_PLAN.get(feature)
    if not min_plan:
        return True, 200, {}

    try:
        user = _load_user_and_subscription(headers)
    except PlanError as error:
        return False, error.status, {"error": error.message, "feature": feature}

    if user.get("role") == "admin":
        return True, 200, user

    if user.get("status") not in ACTIVE_STATUS:
        return False, 403, {"error": "subscription inactive", "feature": feature}

    plan = user.get("plan") or "free"
    if PLAN_RANK.get(plan, 0) < PLAN_RANK[min_plan]:
        return False, 403, {
            "error": "plan upgrade required",
            "feature": feature,
            "required_plan": min_plan,
            "current_plan": plan,
        }

    return True, 200, user


def _load_user_and_subscription(headers):
    service_key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not service_key:
        raise PlanError("SUPABASE_SERVICE_KEY is not configured", 500)

    token = _extract_bearer(headers)
    if not token:
        raise PlanError("missing bearer token", 401)

    cache_key = f"plan:{token[-24:]}"
    cached = _CACHE.get(cache_key)
    if cached and time.time() < cached["exp"]:
        return cached["data"]

    supabase_url = _normalize_supabase_url(os.environ.get("SUPABASE_URL", ""))
    auth_user = _json_request(
        f"{supabase_url}/auth/v1/user",
        headers={
            "Accept": "application/json",
            "apikey": service_key,
            "Authorization": f"Bearer {token}",
        },
    )
    user_id = auth_user.get("id")
    if not user_id:
        raise PlanError("invalid token payload", 401)

    rows = _json_request(
        f"{supabase_url}/rest/v1/subscriptions?select=plan,status,role&user_id=eq.{urllib.parse.quote(user_id)}&limit=1",
        headers={
            "Accept": "application/json",
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    row = rows[0] if isinstance(rows, list) and rows else {}
    data = {
        "user_id": user_id,
        "email": auth_user.get("email"),
        "plan": row.get("plan") or "free",
        "status": row.get("status") or "active",
        "role": row.get("role") or "user",
    }
    _CACHE[cache_key] = {"data": data, "exp": time.time() + _CACHE_TTL}
    return data


def _json_request(url, headers):
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            raw = response.read().decode("utf-8", errors="replace")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        status = 401 if error.code in (401, 403) else 500
        raise PlanError("invalid bearer token" if status == 401 else f"Supabase HTTP {error.code}", status)


def _extract_bearer(headers):
    value = headers.get("Authorization") or headers.get("authorization") or ""
    value = str(value).strip()
    if value.lower().startswith("bearer "):
        return value[7:].strip()
    return value


def _normalize_supabase_url(value):
    raw = str(value or "").strip().rstrip("/")
    if raw.startswith("https://") and raw.endswith(".supabase.co"):
        return raw
    return DEFAULT_SUPABASE_URL


class PlanError(Exception):
    def __init__(self, message, status):
        super().__init__(message)
        self.message = message
        self.status = status
