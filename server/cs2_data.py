import json
import os
import time
import urllib.parse
import urllib.request


DEFAULT_SUPABASE_URL = "https://dhirxfoxcswctxcjzvhf.supabase.co"
_CACHE = {}
_CACHE_TTL = 180


SEED_MATCHES = [
    {
        "id": "cs2-iem-dallas-navi-vitality",
        "league": "IEM Dallas",
        "stage": "Upper bracket",
        "start": "Hoje 14:00",
        "starts_at": None,
        "status": "high",
        "format": "BO3",
        "teamA": {
            "name": "NAVI",
            "rank": 3,
            "form": "WWLWW",
            "maps": [
                {"name": "Mirage", "winRate": 64},
                {"name": "Nuke", "winRate": 58},
                {"name": "Ancient", "winRate": 61},
            ],
            "stats": {"rating": 1.10, "adr": 77.4, "kast": 72, "opening": 51, "clutch": 58, "pistol": 55},
        },
        "teamB": {
            "name": "Vitality",
            "rank": 1,
            "form": "WLWWW",
            "maps": [
                {"name": "Inferno", "winRate": 68},
                {"name": "Dust2", "winRate": 65},
                {"name": "Anubis", "winRate": 63},
            ],
            "stats": {"rating": 1.16, "adr": 81.2, "kast": 74, "opening": 54, "clutch": 61, "pistol": 58},
        },
        "odds": {"a": 2.08, "b": 1.74},
        "markets": [
            {"market": "Vencedor", "side": "Vitality", "edge": 6.4},
            {"market": "Total mapas", "side": "Over 2.5", "edge": 3.1},
            {"market": "Mapa 1 rounds", "side": "Over 20.5", "edge": 4.2},
        ],
    },
    {
        "id": "cs2-esl-faze-g2",
        "league": "ESL Pro League",
        "stage": "Group stage",
        "start": "Hoje 16:30",
        "starts_at": None,
        "status": "watch",
        "format": "BO3",
        "teamA": {
            "name": "FaZe",
            "rank": 5,
            "form": "LWWLW",
            "maps": [
                {"name": "Ancient", "winRate": 57},
                {"name": "Mirage", "winRate": 60},
                {"name": "Inferno", "winRate": 54},
            ],
            "stats": {"rating": 1.08, "adr": 75.6, "kast": 71, "opening": 53, "clutch": 56, "pistol": 52},
        },
        "teamB": {
            "name": "G2",
            "rank": 6,
            "form": "WWLLW",
            "maps": [
                {"name": "Nuke", "winRate": 59},
                {"name": "Anubis", "winRate": 56},
                {"name": "Dust2", "winRate": 61},
            ],
            "stats": {"rating": 1.07, "adr": 76.1, "kast": 70, "opening": 50, "clutch": 59, "pistol": 54},
        },
        "odds": {"a": 1.91, "b": 1.88},
        "markets": [
            {"market": "Mapa 1 rounds", "side": "Over 21.5", "edge": 5.0},
            {"market": "Handicap", "side": "G2 +1.5", "edge": 2.7},
            {"market": "Pistol rounds", "side": "FaZe", "edge": 1.9},
        ],
    },
    {
        "id": "cs2-blast-mouz-liquid",
        "league": "BLAST Premier",
        "stage": "Play-in",
        "start": "Amanha 12:00",
        "starts_at": None,
        "status": "low",
        "format": "BO1",
        "teamA": {
            "name": "MOUZ",
            "rank": 2,
            "form": "WWWWW",
            "maps": [
                {"name": "Nuke", "winRate": 71},
                {"name": "Mirage", "winRate": 67},
                {"name": "Vertigo", "winRate": 62},
            ],
            "stats": {"rating": 1.18, "adr": 82.0, "kast": 75, "opening": 56, "clutch": 60, "pistol": 61},
        },
        "teamB": {
            "name": "Liquid",
            "rank": 14,
            "form": "LWLLW",
            "maps": [
                {"name": "Inferno", "winRate": 51},
                {"name": "Ancient", "winRate": 49},
                {"name": "Anubis", "winRate": 52},
            ],
            "stats": {"rating": 1.01, "adr": 72.3, "kast": 68, "opening": 47, "clutch": 52, "pistol": 49},
        },
        "odds": {"a": 1.42, "b": 2.86},
        "markets": [
            {"market": "Vencedor", "side": "MOUZ", "edge": 1.5},
            {"market": "Handicap rounds", "side": "Liquid +4.5", "edge": 2.2},
            {"market": "Total rounds", "side": "Under 21.5", "edge": 0.8},
        ],
    },
    {
        "id": "cs2-cct-aurora-big",
        "league": "CCT Global",
        "stage": "Quarterfinal",
        "start": "Amanha 15:00",
        "starts_at": None,
        "status": "high",
        "format": "BO3",
        "teamA": {
            "name": "Aurora",
            "rank": 18,
            "form": "WWWLW",
            "maps": [
                {"name": "Anubis", "winRate": 66},
                {"name": "Ancient", "winRate": 62},
                {"name": "Dust2", "winRate": 59},
            ],
            "stats": {"rating": 1.11, "adr": 78.6, "kast": 73, "opening": 52, "clutch": 57, "pistol": 56},
        },
        "teamB": {
            "name": "BIG",
            "rank": 24,
            "form": "LWLWW",
            "maps": [
                {"name": "Nuke", "winRate": 54},
                {"name": "Vertigo", "winRate": 50},
                {"name": "Mirage", "winRate": 55},
            ],
            "stats": {"rating": 1.03, "adr": 74.1, "kast": 69, "opening": 49, "clutch": 55, "pistol": 51},
        },
        "odds": {"a": 1.77, "b": 2.02},
        "markets": [
            {"market": "Vencedor", "side": "Aurora", "edge": 4.8},
            {"market": "Mapa 1", "side": "Aurora", "edge": 3.6},
            {"market": "Total mapas", "side": "Over 2.5", "edge": 2.5},
        ],
    },
]


def get_cs2_scoreboard(limit=24):
    cached = _cache_get("cs2_scoreboard")
    if cached is not None:
        return cached

    rows = _load_supabase_matches(limit)
    raw_matches = rows if rows else SEED_MATCHES
    matches = [_with_score(_normalize_match(row)) for row in raw_matches[:limit]]
    matches.sort(key=lambda match: (-int(match.get("score") or 0), str(match.get("start") or "")))
    payload = {"games": matches, "meta": {"count": len(matches), "source": "stored" if rows else "baseline"}}
    _cache_set("cs2_scoreboard", payload, _CACHE_TTL)
    return payload


def _load_supabase_matches(limit):
    service_key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not service_key:
        return []
    supabase_url = _normalize_supabase_url(os.environ.get("SUPABASE_URL", ""))
    query = urllib.parse.urlencode({
        "select": "*",
        "order": "starts_at.asc.nullslast,created_at.desc",
        "limit": str(max(1, min(int(limit or 24), 50))),
    })
    req = urllib.request.Request(
        f"{supabase_url}/rest/v1/cs2_matches?{query}",
        headers={
            "Accept": "application/json",
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=6) as response:
            raw = response.read().decode("utf-8", errors="replace")
            data = json.loads(raw) if raw else []
            return data if isinstance(data, list) else []
    except Exception:
        return []


def _normalize_match(row):
    if "teamA" in row and "teamB" in row:
        return row

    teams = _jsonish(row.get("teams"), {})
    odds = _jsonish(row.get("odds"), {})
    markets = _jsonish(row.get("markets"), [])
    return {
        "id": row.get("external_id") or row.get("id") or "",
        "league": row.get("league") or "CS2",
        "stage": row.get("stage") or "",
        "start": row.get("start_label") or _format_start(row.get("starts_at")),
        "starts_at": row.get("starts_at"),
        "status": row.get("status") or "watch",
        "format": row.get("match_format") or row.get("format") or "BO3",
        "teamA": teams.get("teamA") or teams.get("a") or {},
        "teamB": teams.get("teamB") or teams.get("b") or {},
        "odds": odds,
        "markets": markets,
    }


def _with_score(match):
    score_data = _score_match(match)
    match["score"] = score_data["score"]
    match["status"] = _status_from_score(score_data["score"])
    match["read"] = _build_read(match, score_data)
    match["factors"] = score_data["factors"]
    match["picks"] = _build_picks(match, score_data)
    return match


def _score_match(match):
    team_a = match.get("teamA") or {}
    team_b = match.get("teamB") or {}
    factors = [
        _factor("Forma", _form_edge(team_a, team_b), 0.22, "sequencia recente"),
        _factor("Map pool", _map_pool_edge(team_a, team_b), 0.24, "winrate dos mapas fortes"),
        _factor("Ranking", _rank_edge(team_a, team_b), 0.16, "forca relativa"),
        _factor("Pistol", _stat_edge(team_a, team_b, "pistol"), 0.12, "pistol rounds"),
        _factor("Opening", _stat_edge(team_a, team_b, "opening"), 0.12, "first kills"),
        _factor("Clutch", _stat_edge(team_a, team_b, "clutch"), 0.08, "rounds decisivos"),
        _factor("Mercado", _market_edge(match), 0.06, "edge de odds"),
    ]
    raw = sum(f["value"] * f["weight"] for f in factors)
    return {"score": _clamp(round(raw), 1, 99), "factors": factors}


def _factor(label, value, weight, note):
    return {
        "label": label,
        "value": _clamp(round(value), 0, 100),
        "weight": weight,
        "note": note,
    }


def _form_edge(team_a, team_b):
    return 50 + (_form_rate(team_a.get("form")) - _form_rate(team_b.get("form"))) * 0.35


def _form_rate(form):
    text = str(form or "")
    if not text:
        return 50
    wins = sum(1 for char in text.upper() if char == "W")
    total = max(1, sum(1 for char in text.upper() if char in {"W", "L"}))
    return wins / total * 100


def _map_pool_edge(team_a, team_b):
    return 50 + (_avg_map_win(team_a) - _avg_map_win(team_b)) * 0.55


def _avg_map_win(team):
    maps = team.get("maps") or []
    values = []
    for item in maps:
        if isinstance(item, str):
            continue
        value = _num(item.get("winRate") or item.get("win_rate"))
        if value is not None:
            values.append(value)
    return sum(values) / len(values) if values else 50


def _rank_edge(team_a, team_b):
    rank_a = _num(team_a.get("rank")) or 50
    rank_b = _num(team_b.get("rank")) or 50
    return 50 + (rank_b - rank_a) * 1.1


def _stat_edge(team_a, team_b, key):
    stats_a = team_a.get("stats") or {}
    stats_b = team_b.get("stats") or {}
    value_a = _num(stats_a.get(key))
    value_b = _num(stats_b.get(key))
    if value_a is None or value_b is None:
        return 50
    return 50 + (value_a - value_b) * 0.75


def _market_edge(match):
    markets = match.get("markets") or []
    edges = [_num(item.get("edge")) for item in markets if isinstance(item, dict)]
    edges = [edge for edge in edges if edge is not None]
    if not edges:
        return 50
    return 50 + max(edges) * 5


def _build_read(match, score_data):
    team_a = (match.get("teamA") or {}).get("name") or "Time A"
    team_b = (match.get("teamB") or {}).get("name") or "Time B"
    best = max(score_data["factors"], key=lambda factor: factor["value"])
    score = score_data["score"]
    if score >= 76:
        level = "Leitura forte"
    elif score >= 62:
        level = "Boa leitura"
    else:
        level = "Mercado equilibrado"
    leader = team_a if _side_score(match) >= 50 else team_b
    return f"{level} para {leader}. Fator principal: {best['label'].lower()}."


def _build_picks(match, score_data):
    markets = match.get("markets") or []
    picks = []
    for item in markets:
        if not isinstance(item, dict):
            continue
        edge = _num(item.get("edge")) or 0
        confidence = _clamp(round(score_data["score"] * 0.62 + edge * 4), 45, 92)
        picks.append({
            "market": item.get("market") or "Mercado",
            "side": item.get("side") or "-",
            "edge": f"{edge:+.1f}",
            "confidence": confidence,
        })
    if picks:
        return picks
    team = (match.get("teamA") or {}).get("name") if _side_score(match) >= 50 else (match.get("teamB") or {}).get("name")
    return [{"market": "Vencedor", "side": team or "-", "edge": "+0.0", "confidence": score_data["score"]}]


def _side_score(match):
    return (
        _form_edge(match.get("teamA") or {}, match.get("teamB") or {}) * 0.4
        + _map_pool_edge(match.get("teamA") or {}, match.get("teamB") or {}) * 0.4
        + _rank_edge(match.get("teamA") or {}, match.get("teamB") or {}) * 0.2
    )


def _status_from_score(score):
    if score >= 72:
        return "high"
    if score >= 60:
        return "watch"
    return "low"


def _format_start(value):
    text = str(value or "").strip()
    if not text:
        return "Agendado"
    return text.replace("T", " ")[:16]


def _jsonish(value, fallback):
    if value is None:
        return fallback
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return fallback


def _num(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number


def _clamp(value, low, high):
    return max(low, min(high, value))


def _normalize_supabase_url(value):
    raw = str(value or "").strip().rstrip("/")
    if raw.startswith("https://") and raw.endswith(".supabase.co"):
        return raw
    return DEFAULT_SUPABASE_URL


def _cache_get(key):
    entry = _CACHE.get(key)
    if entry and time.time() < entry["exp"]:
        return entry["data"]
    return None


def _cache_set(key, data, ttl):
    _CACHE[key] = {"data": data, "exp": time.time() + ttl}
