from urllib.parse import urlencode
from urllib.request import Request, urlopen, ProxyHandler, build_opener
import json, math, os, sys, time
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from _security import rate_limit_check, get_client_ip, is_valid_id
except ImportError:
    def rate_limit_check(ip): return True
    def get_client_ip(h): return '0.0.0.0'
    def is_valid_id(s): return bool(s) and len(s) <= 40

PROXY_URL = os.environ.get("PROXY_URL", "")
PROXY_READY = bool(PROXY_URL and "user:pass" not in PROXY_URL and "replace" not in PROXY_URL.lower())

WNBA_CDN = "https://cdn.wnba.com/static/json/staticData"
WNBA_STATS = "https://stats.wnba.com/stats"
MAX_GAMELOG_ROWS = 20
MIN_CURRENT_SEASON_ROWS = 10
POPULAR_PLAYER_IDS = [
    1628932, 1629483, 1629477, 1642286, 1642291, 1628276, 203826,
    1627668, 204319, 1629498, 1627674, 1631009, 204324, 203400,
    1629481, 1641648, 1628909, 1642784,
]

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.wnba.com",
    "Referer": "https://www.wnba.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
}

cache = {}
CACHE_TTL = 300

def _make_opener():
    if not PROXY_READY:
        return None
    return build_opener(ProxyHandler({"http": PROXY_URL, "https": PROXY_URL}))

def _cache_get(key):
    row = cache.get(key)
    if row and time.time() - row[1] < CACHE_TTL:
        return row[0]
    return None

def _cache_set(key, data):
    cache[key] = (data, time.time())

def _fetch_json(url, timeout=9, use_proxy=False):
    req = Request(url, headers=HEADERS)
    opener = _make_opener() if use_proxy else None
    if opener:
        with opener.open(req, timeout=timeout) as res:
            return json.loads(res.read())
    with urlopen(req, timeout=timeout) as res:
        return json.loads(res.read())

def _first_result_set(data):
    return (data.get("resultSets") or [{}])[0]

def _idx(headers, *names):
    for name in names:
        if name in headers:
            return headers.index(name)
    return None

def _num(value, default=0):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except Exception:
        return default

def _parse_date(value):
    text = str(value or "").strip()
    for candidate in (text, text.title(), text[:12], text[:12].title()):
        for fmt in ("%b %d, %Y", "%Y-%m-%d", "%m/%d/%Y"):
            try:
                return datetime.strptime(candidate[:12] if fmt == "%b %d, %Y" else candidate[:10], fmt)
            except ValueError:
                pass
    return datetime.min

def _get_player_index():
    cached = _cache_get("player_index")
    if cached:
        return cached
    data = _fetch_json(f"{WNBA_CDN}/playerIndex.json", timeout=8, use_proxy=False)
    rs = _first_result_set(data)
    headers = rs.get("headers", [])
    rows = rs.get("rowSet", [])
    by_id = {}
    by_name = {}

    pid_i = _idx(headers, "PERSON_ID", "PLAYER_ID")
    first_i = _idx(headers, "PLAYER_FIRST_NAME", "FIRST_NAME")
    last_i = _idx(headers, "PLAYER_LAST_NAME", "LAST_NAME")
    if pid_i is None:
        raise ValueError("player index missing id")

    for row in rows:
        pid = int(row[pid_i])
        name = f"{row[first_i] if first_i is not None else ''} {row[last_i] if last_i is not None else ''}".strip()
        if not name:
            continue
        player = _player_from_index_row(headers, row)
        by_id[pid] = player
        by_name[_norm_name(name)] = player

    result = {"headers": headers, "rows": rows, "by_id": by_id, "by_name": by_name}
    _cache_set("player_index", result)
    return result

def _player_from_index_row(headers, row):
    def col(*names, default=None):
        i = _idx(headers, *names)
        return row[i] if i is not None and i < len(row) else default

    pid = int(col("PERSON_ID", "PLAYER_ID", default=0))
    first = col("PLAYER_FIRST_NAME", "FIRST_NAME", default="")
    last = col("PLAYER_LAST_NAME", "LAST_NAME", default="")
    team = col("TEAM_ABBREVIATION", default="")
    pts = _num(col("PTS"), None)
    reb = _num(col("REB"), None)
    ast = _num(col("AST"), None)
    season_avg = {
        "pts": pts,
        "reb": reb,
        "ast": ast,
        "fg3m": None,
    }
    props = _fallback_props_from_season_avg(season_avg)
    player = {
        "id": pid,
        "player_id": pid,
        "player_name": f"{first} {last}".strip(),
        "team_abbr": team,
        "team_name": col("TEAM_NAME", default=""),
        "position": col("POSITION", default=""),
        "season_avg": season_avg,
        "props": props,
        "synthetic_lines": {key: value.get("line") for key, value in props.items()},
        "sample_seasons": [_season_candidates()[0]],
        "using_previous_season": False,
        "league": "wnba",
        "photo_url": f"https://cdn.wnba.com/headshots/wnba/latest/1040x760/{pid}.png",
    }
    return player

def _norm_name(value):
    return "".join(ch.lower() for ch in str(value or "") if ch.isalnum())

def _season_candidates():
    year = datetime.now(timezone.utc).year
    return [str(year), str(year - 1)]

def get_players(limit=60):
    cached = _cache_get(f"players_{limit}")
    if cached:
        return cached
    idx = _get_player_index()
    players = list(idx["by_id"].values())
    popular_rank = {pid: rank for rank, pid in enumerate(POPULAR_PLAYER_IDS)}

    def sort_key(player):
        pid = player["player_id"]
        popularity = popular_rank.get(pid, 999)
        pts = _num(player.get("season_avg", {}).get("pts"), 0)
        return (popularity, -pts, player.get("player_name", ""))

    ordered = sorted(players, key=sort_key)
    result = ordered[:max(1, min(int(limit or 60), 120))]
    _cache_set(f"players_{limit}", result)
    return result

def get_player_by_name(name):
    idx = _get_player_index()
    key = _norm_name(name)
    if key in idx["by_name"]:
        return idx["by_name"][key]
    for player_key, player in idx["by_name"].items():
        if key and (key in player_key or player_key in key):
            return player
    return None

def _fetch_gamelog_rows(player_id):
    cached = _cache_get(f"gamelog_{player_id}")
    if cached:
        return cached

    rows = []
    current_rows = 0
    seen = set()
    seasons = _season_candidates()
    current_season = seasons[0]
    for season in seasons:
        for season_type in ("Regular Season", "Playoffs"):
            params = {
                "DateFrom": "",
                "DateTo": "",
                "LeagueID": "10",
                "PlayerID": str(player_id),
                "Season": season,
                "SeasonType": season_type,
            }
            url = f"{WNBA_STATS}/playergamelog?{urlencode(params)}"
            try:
                data = _fetch_json(url, timeout=8, use_proxy=PROXY_READY)
                rs = _first_result_set(data)
                headers = rs.get("headers", [])
                for raw in rs.get("rowSet", []):
                    row = {headers[i]: raw[i] for i in range(min(len(headers), len(raw)))}
                    game_key = row.get("Game_ID") or row.get("GAME_ID") or f"{row.get('GAME_DATE')}|{row.get('MATCHUP')}"
                    if game_key in seen:
                        continue
                    seen.add(game_key)
                    row["_SEASON"] = season
                    row["_SEASON_TYPE"] = season_type
                    rows.append(row)
                    if season == current_season:
                        current_rows += 1
            except Exception:
                continue
            if len(rows) >= MAX_GAMELOG_ROWS:
                break
        if len(rows) >= MAX_GAMELOG_ROWS:
            break
        if season == current_season and current_rows >= MIN_CURRENT_SEASON_ROWS:
            break

    rows.sort(key=lambda row: _parse_date(row.get("GAME_DATE")), reverse=True)
    _cache_set(f"gamelog_{player_id}", rows)
    return rows

def _avg(rows, stat):
    vals = [_num(row.get(stat), 0) for row in rows]
    return round(sum(vals) / len(vals), 1) if vals else None

def _hit_rate(rows, stat, line):
    if not rows or line is None:
        return None
    hits = sum(1 for row in rows if _num(row.get(stat), 0) >= line)
    return round((hits / len(rows)) * 100)

def _line_for(avg, stat):
    if avg is None:
        return None
    if stat == "FG3M" and avg < 0.2:
        return None
    if stat != "FG3M" and avg < 0.5:
        return None
    return math.floor(float(avg)) + 0.5

def _fallback_props_from_season_avg(season_avg):
    props = {}
    for source_key, target_key in (("PTS", "pts"), ("REB", "reb"), ("AST", "ast"), ("FG3M", "fg3m")):
        avg = season_avg.get(target_key)
        line = _line_for(avg, source_key)
        if line is None:
            continue
        projection = round(float(avg), 1)
        props[target_key] = {
            "line": line,
            "projection": projection,
            "edge": round(projection - line, 1),
            "hit_rate": None,
            "l5": None,
            "l10": None,
            "source": "season_estimate",
        }
    return props

def _build_props(rows, season_avg):
    props = {}
    last5 = rows[:5]
    last10 = rows[:10]
    for source_key, target_key in (("PTS", "pts"), ("REB", "reb"), ("AST", "ast"), ("FG3M", "fg3m")):
        l5_avg = _avg(last5, source_key)
        l10_avg = _avg(last10, source_key)
        base = season_avg.get(target_key)
        if base is None or base == 0:
            base = l10_avg if l10_avg is not None else l5_avg
        line = _line_for(base, source_key)
        if line is None:
            continue
        props[target_key] = {
            "l5": _hit_rate(last5, source_key, line),
            "l10": _hit_rate(last10, source_key, line),
            "line": line,
            "hit_rate": _hit_rate(last10, source_key, line),
            "edge": round((l5_avg or 0) - line, 1) if l5_avg is not None else None,
            "projection": l5_avg if l5_avg is not None else base,
        }
    return props or _fallback_props_from_season_avg(season_avg)

def get_pregame(player_id):
    cached = _cache_get(f"pregame_{player_id}")
    if cached:
        return cached

    index = _get_player_index()
    player = index["by_id"].get(int(player_id), {
        "player_id": int(player_id),
        "player_name": "",
        "team_abbr": "",
        "position": "",
        "season_avg": {"pts": None, "reb": None, "ast": None, "fg3m": None},
        "league": "wnba",
        "photo_url": f"https://cdn.wnba.com/headshots/wnba/latest/1040x760/{player_id}.png",
    })
    rows = _fetch_gamelog_rows(int(player_id))
    last5 = rows[:5]
    last10 = rows[:10]
    sample_seasons = sorted({row.get("_SEASON") for row in rows if row.get("_SEASON")}, reverse=True)
    current_season = _season_candidates()[0]

    season_avg = dict(player.get("season_avg") or {})
    for source_key, target_key in (("PTS", "pts"), ("REB", "reb"), ("AST", "ast"), ("FG3M", "fg3m")):
        if season_avg.get(target_key) is None or season_avg.get(target_key) == 0:
            season_avg[target_key] = _avg(rows, source_key)

    props = _build_props(rows, season_avg)
    result = {
        **player,
        "season_avg": season_avg,
        "props": props,
        "last5_avg": {
            "pts": _avg(last5, "PTS"),
            "reb": _avg(last5, "REB"),
            "ast": _avg(last5, "AST"),
            "fg3m": _avg(last5, "FG3M"),
        },
        "last10_avg": {
            "pts": _avg(last10, "PTS"),
            "reb": _avg(last10, "REB"),
            "ast": _avg(last10, "AST"),
            "fg3m": _avg(last10, "FG3M"),
        },
        "synthetic_lines": {key: value.get("line") for key, value in props.items()},
        "hit_rates": {"pts_last10": props.get("pts", {}).get("hit_rate")},
        "edge_points": props.get("pts", {}).get("edge"),
        "sample_seasons": sample_seasons,
        "using_previous_season": any(season != current_season for season in sample_seasons),
        "last5_games": [
            {
                "opp": row.get("MATCHUP", ""),
                "date": row.get("GAME_DATE", ""),
                "pts": _num(row.get("PTS"), 0),
                "reb": _num(row.get("REB"), 0),
                "ast": _num(row.get("AST"), 0),
                "fg3m": _num(row.get("FG3M"), 0),
                "season_type": row.get("_SEASON_TYPE", ""),
            }
            for row in rows[:20]
        ],
        "summary": f"WNBA L5 {props.get('pts', {}).get('l5', '-')} / amostra {', '.join(sample_seasons) or '-'}",
    }
    _cache_set(f"pregame_{player_id}", result)
    return result

def get_schedule():
    cached = _cache_get("schedule")
    if cached:
        return cached
    data = _fetch_json(f"{WNBA_CDN}/scheduleLeagueV2_1.json", timeout=8, use_proxy=False)
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(days=7)
    games = []
    for game_date in data.get("leagueSchedule", {}).get("gameDates", []):
        for game in game_date.get("games", []):
            raw_time = game.get("gameDateTimeUTC") or ""
            try:
                dt = datetime.strptime(raw_time[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
            except Exception:
                dt = now
            if dt < now - timedelta(days=1) or dt > cutoff:
                continue
            home = game.get("homeTeam", {})
            away = game.get("awayTeam", {})
            games.append({
                "gameId": game.get("gameId"),
                "status": game.get("gameStatus"),
                "statusText": game.get("gameStatusText", ""),
                "gameDateLabel": dt.strftime("%Y-%m-%d"),
                "homeTeam": {"abbr": home.get("teamTricode") or home.get("teamAbbreviation"), "name": home.get("teamCityName") or home.get("teamName")},
                "awayTeam": {"abbr": away.get("teamTricode") or away.get("teamAbbreviation"), "name": away.get("teamCityName") or away.get("teamName")},
            })
    _cache_set("schedule", games)
    return games
