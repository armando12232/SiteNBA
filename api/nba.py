from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen, ProxyHandler, build_opener
import json, time, math, sys, os

# ── Proxy residencial (Webshare ou similar) ──────────────────────────────────
# Adicione no Vercel: PROXY_URL = http://user:pass@proxy.webshare.io:80
# Quando ausente, faz requests diretos (CDN NBA funciona sem proxy)
PROXY_URL = os.environ.get("PROXY_URL", "")

def _make_opener():
    if PROXY_URL:
        handler = ProxyHandler({"http": PROXY_URL, "https": PROXY_URL})
        return build_opener(handler)
    return None

# Import do módulo de segurança (está em api/)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from _security import (
        rate_limit_check, get_client_ip,
        is_valid_abbr, is_valid_id, is_valid_stat, is_valid_position,
    )
except ImportError:
    # Fallback caso módulo não esteja disponível
    def rate_limit_check(ip): return True
    def get_client_ip(h): return '0.0.0.0'
    def is_valid_abbr(s): return bool(s) and len(s) <= 4
    def is_valid_id(s): return bool(s) and len(s) <= 40
    def is_valid_stat(s): return s in ('pts','reb','ast','fg3m','stl','blk')
    def is_valid_position(s): return bool(s) and len(s) <= 5

cache = {}
CACHE_TTL = 300

def _cache_get(key):
    if key in cache:
        data, ts = cache[key]
        if time.time() - ts < CACHE_TTL:
            return data
    return None

def _cache_set(key, data):
    cache[key] = (data, time.time())

NBA_HEADERS = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://www.nba.com',
    'Referer': 'https://www.nba.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'x-nba-stats-origin': 'stats',
    'x-nba-stats-token': 'true',
}

def _nba_fetch(url, timeout=9):
    """Fetch com proxy residencial se PROXY_URL estiver definido.
    CDN NBA funciona sem proxy. stats.nba.com requer proxy no Vercel.
    """
    req    = Request(url, headers=NBA_HEADERS)
    opener = _make_opener()
    if opener:
        with opener.open(req, timeout=timeout) as r:
            return json.loads(r.read())
    else:
        with urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())

# ── Cache do CDN playerIndex (usado para resolver nome→id e médias) ─────────
def get_live_games():
    from nba_api.live.nba.endpoints import scoreboard
    board = scoreboard.ScoreBoard()
    data = board.get_dict()
    games = data.get("scoreboard", {}).get("games", [])
    live = []
    for g in games:
        if g.get("gameStatus") == 2:
            ht = g.get("homeTeam", {})
            at = g.get("awayTeam", {})
            live.append({
                "gameId": g.get("gameId"),
                "period": g.get("period", 1),
                "gameClock": g.get("gameClock", "PT12M00S"),
                "gameStatusText": g.get("gameStatusText", ""),
                "homeTeam": {
                    "teamId": ht.get("teamId"),
                    "teamAbbreviation": ht.get("teamTricode", ht.get("teamAbbreviation", "HME")),
                    "score": ht.get("score", 0),
                },
                "awayTeam": {
                    "teamId": at.get("teamId"),
                    "teamAbbreviation": at.get("teamTricode", at.get("teamAbbreviation", "AWY")),
                    "score": at.get("score", 0),
                },
            })
    return live

def get_boxscore(game_id):
    from nba_api.live.nba.endpoints import boxscore
    bs = boxscore.BoxScore(game_id=game_id)
    data = bs.get_dict()
    game = data.get("game", {})
    players = []
    for team_key in ["homeTeam", "awayTeam"]:
        team = game.get(team_key, {})
        team_abbr = team.get("teamTricode", team.get("teamAbbreviation", "???"))
        team_id = team.get("teamId")
        for p in team.get("players", []):
            s = p.get("statistics", {})
            mins_str = s.get("minutesCalculated", "PT00M00S")
            try:
                mins = int(mins_str.replace("PT", "").split("M")[0])
            except:
                mins = 0
            players.append({
                "playerId": p.get("personId"),
                "name": p.get("name", ""),
                "position": p.get("position", "—"),
                "teamAbbr": team_abbr,
                "teamId": team_id,
                "isHome": team_key == "homeTeam",
                "mins": mins,
                "pts": s.get("points", 0),
                "reb": s.get("reboundsTotal", 0),
                "ast": s.get("assists", 0),
                "pf": s.get("foulsPersonal", 0),
                "fgm": s.get("fieldGoalsMade", 0),
                "fga": s.get("fieldGoalsAttempted", 0),
                "tpm": s.get("threePointersMade", 0),
                "to": s.get("turnovers", 0),
                "plusMinus": s.get("plusMinusPoints", 0),
                "stl": s.get("steals", 0),
            })
    return players

def get_season_avg(player_id):
    cached = _cache_get(f"avg_{player_id}")
    if cached:
        return cached
    try:
        url = "https://cdn.nba.com/static/json/staticData/playerIndex.json"
        data = _nba_fetch(url, timeout=8)
        rs = data.get("resultSets", [{}])[0]
        headers = rs.get("headers", [])
        rows = rs.get("rowSet", [])
        pid_idx = headers.index("PERSON_ID") if "PERSON_ID" in headers else 0
        pts_idx = headers.index("PTS") if "PTS" in headers else -1
        reb_idx = headers.index("REB") if "REB" in headers else -1
        ast_idx = headers.index("AST") if "AST" in headers else -1
        row = next((r for r in rows if r[pid_idx] == player_id), None)
        if not row:
            return None
        avg = {
            "pts": float(row[pts_idx] or 0) if pts_idx >= 0 else 0,
            "reb": float(row[reb_idx] or 0) if reb_idx >= 0 else 0,
            "ast": float(row[ast_idx] or 0) if ast_idx >= 0 else 0,
        }
        _cache_set(f"avg_{player_id}", avg)
        return avg
    except Exception as e:
        return None

def _calc_prop(game_rows, stat_key, season_avg, n5=5, n10=10):
    """Calcula L5, L10, linha sintética, hit rate e edge para qualquer stat."""
    last5  = game_rows[:n5]
    last10 = game_rows[:n10] if len(game_rows) >= n10 else game_rows
    if not last5:
        return None

    l5_val  = round(sum(float(r.get(stat_key, 0)) for r in last5)  / len(last5),  1)
    l10_val = round(sum(float(r.get(stat_key, 0)) for r in last10) / len(last10), 1)

    # Linha sintética — sempre termina em .5 (padrão das casas de apostas)
    base = season_avg if season_avg > 0 else l5_val
    line = math.floor(base) + 0.5  # ex: 6.0→6.5, 7.3→7.5, 27.5→27.5

    hits     = sum(1 for r in last10 if float(r.get(stat_key, 0)) >= line)
    hit_rate = round((hits / len(last10)) * 100)
    edge     = round(l5_val - line, 1)

    return {
        "l5": l5_val, "l10": l10_val,
        "line": line, "hit_rate": hit_rate, "edge": edge
    }


def _get_player_index_cdn():
    """Mapa nome→id usando dados estáticos do nba_api (zero HTTP, instantâneo)."""
    cached = _cache_get("player_index_cdn")
    if cached:
        return cached
    try:
        from nba_api.stats.static import players as nba_static
        all_players = nba_static.get_active_players()
        by_id   = {}
        by_name = {}
        for p in all_players:
            pid  = p['id']
            name = p['full_name']
            hdrs = ['PERSON_ID', 'PLAYER_FIRST_NAME', 'PLAYER_LAST_NAME']
            row  = [pid, p['first_name'], p['last_name']]
            by_id[pid]           = row
            by_name[name.lower()] = row
        result = {"by_id": by_id, "by_name": by_name, "headers": ['PERSON_ID', 'PLAYER_FIRST_NAME', 'PLAYER_LAST_NAME']}
        _cache_set("player_index_cdn", result)
        return result
    except Exception as e:
        return {"by_id": {}, "by_name": {}, "headers": []}


def get_player_id_by_name(player_name):
    """Resolve nome → player_id usando dados estáticos (instantâneo, sem HTTP)."""
    if not player_name:
        return None
    idx    = _get_player_index_cdn()
    by_name = idx.get("by_name", {})
    key    = player_name.strip().lower()
    row    = by_name.get(key)
    if row:
        return int(row[0])  # PERSON_ID é índice 0
    # Fallback: match parcial
    for name, r in by_name.items():
        if key.startswith(name) or name.startswith(key):
            return int(r[0])
    return None


def get_pregame(player_id):
    """Busca L5/L10/hitRate. Otimizado para Vercel (10s timeout):
    - Usa CDN para médias (rápido)
    - Tenta playergamelog com timeout agressivo (5s) para temporada atual
    - Se falhar, retorna apenas médias da temporada (sem last5_games)
    """
    cached = _cache_get(f"pregame_{player_id}")
    if cached:
        return cached

    # 1. Médias da temporada via CDN (~1s, sempre funciona)
    season_pts = season_reb = season_ast = season_3pm = 0
    try:
        idx = _get_player_index_cdn()
        row = idx.get("by_id", {}).get(player_id)
        hdrs = idx.get("headers", [])
        if row and hdrs:
            def _h(key):
                if key not in hdrs: return 0
                i = hdrs.index(key)
                try: return round(float(row[i] or 0), 1)
                except: return 0
            season_pts = _h("PTS"); season_reb = _h("REB")
            season_ast = _h("AST"); season_3pm = _h("FG3M")
    except Exception:
        pass

    # 2. Game log — apenas Regular Season da temporada atual, timeout curto
    game_rows = []
    SEASONS_TO_TRY = ["2025-26", "2024-25"]  # tenta atual, fallback pra anterior
    for season in SEASONS_TO_TRY:
        if game_rows:
            break
        try:
            from nba_api.stats.endpoints import playergamelog
            proxy_dict = {"http": PROXY_URL, "https": PROXY_URL} if PROXY_URL else None
            log = playergamelog.PlayerGameLog(
                player_id=str(player_id),
                season=season,
                season_type_all_star="Regular Season",
                proxy=proxy_dict,
                timeout=9,
            )
            rows = log.get_data_frames()[0].to_dict('records')
            game_rows.extend(rows)
        except Exception:
            continue

    # Ordenar do mais recente
    game_rows = sorted(game_rows, key=lambda r: r.get("GAME_DATE",""), reverse=True)

    # ── Se não conseguimos game log, retorna apenas médias da temporada ──
    if len(game_rows) < 3:
        props_fallback = {}
        for stat_key, avg_val, label in [
            ("PTS", season_pts, "pts"), ("REB", season_reb, "reb"),
            ("AST", season_ast, "ast"), ("FG3M", season_3pm, "fg3m"),
        ]:
            if avg_val >= 1.5:
                line = math.floor(avg_val) + 0.5
                props_fallback[label] = {
                    "l5": None, "l10": None,
                    "line": line, "hit_rate": None, "edge": None
                }
        result = {
            "player_id": player_id,
            "season_avg": {"pts": season_pts, "reb": season_reb, "ast": season_ast, "fg3m": season_3pm},
            "props": props_fallback,
            "last5_avg":  {"pts": None, "reb": None, "ast": None, "fg3m": None},
            "last10_avg": {"pts": None},
            "synthetic_lines": {"pts": props_fallback.get("pts", {}).get("line")},
            "hit_rates": {"pts_last10": None},
            "edge_points": None, "last5_games": [],
            "summary": f"Temporada: {season_pts}pts / {season_reb}reb / {season_ast}ast"
        }
        _cache_set(f"pregame_{player_id}", result)
        return result

    last5  = game_rows[:5]
    last10 = game_rows[:10] if len(game_rows) >= 10 else game_rows

    # Calcular props para cada categoria
    props = {}
    for stat_key, avg_val, label in [
        ("PTS", season_pts, "pts"), ("REB", season_reb, "reb"),
        ("AST", season_ast, "ast"), ("FG3M", season_3pm, "fg3m"),
    ]:
        if avg_val >= 1.5:
            line = math.floor(avg_val) + 0.5
            l5_vals  = [float(r.get(stat_key, 0)) for r in last5]
            l10_vals = [float(r.get(stat_key, 0)) for r in last10]
            l5_hits  = sum(1 for v in l5_vals  if v >= line)
            l10_hits = sum(1 for v in l10_vals if v >= line)
            props[label] = {
                "l5":  round((l5_hits / len(l5_vals)) * 100)   if l5_vals  else None,
                "l10": round((l10_hits / len(l10_vals)) * 100) if l10_vals else None,
                "line": line,
                "hit_rate": round((l10_hits / len(l10_vals)) * 100) if l10_vals else None,
                "edge": round((sum(l5_vals)/len(l5_vals)) - line, 1) if l5_vals else None,
            }

    pts_prop = props.get("pts", {})
    last5_mins = round(sum(float(r.get("MIN", 0)) for r in last5) / len(last5), 1) if last5 else 0

    result = {
        "player_id": player_id,
        "season_avg": {"pts": season_pts, "reb": season_reb, "ast": season_ast, "fg3m": season_3pm},
        "props": props,
        "last5_avg":  {"pts": round(sum(float(r.get("PTS",0)) for r in last5)/len(last5), 1)} if last5 else {},
        "last10_avg": {"pts": round(sum(float(r.get("PTS",0)) for r in last10)/len(last10), 1)} if last10 else {},
        "synthetic_lines": {k: v.get("line") for k,v in props.items()},
        "hit_rates":  {"pts_last10": pts_prop.get("hit_rate")},
        "edge_points": pts_prop.get("edge"),
        "minsL5": last5_mins,
        "last5_games": [
            {
                "opp":  r.get("MATCHUP",""),
                "date": r.get("GAME_DATE",""),
                "pts":  float(r.get("PTS",0)),
                "reb":  float(r.get("REB",0)),
                "ast":  float(r.get("AST",0)),
                "fg3m": float(r.get("FG3M",0)),
                "hit":  float(r.get("PTS",0)) >= (pts_prop.get("line") or 0)
            }
            for r in game_rows[:10]
        ],
        "summary": f"L5 {pts_prop.get('l5','—')}pts"
    }
    _cache_set(f"pregame_{player_id}", result)
    return result


# Cache longo para dados de defesa (mudam pouco)
def get_upcoming_schedule(days_ahead=7):
    """Busca próximos jogos via schedule CDN da NBA (suporta dias sem jogo)."""
    from datetime import datetime, timezone
    today_key = "schedule_24h_" + datetime.now(timezone.utc).strftime("%Y%m%d%H")
    cached = _cache_get(today_key)
    if cached:
        return cached

    try:
        from datetime import datetime, timedelta, timezone

        now_utc = datetime.now(timezone.utc)
        cutoff  = now_utc + timedelta(hours=24)

        # 1. Jogos de hoje via scoreboard ao vivo
        today_games = []
        try:
            from nba_api.live.nba.endpoints import scoreboard as sb_endpoint
            board = sb_endpoint.ScoreBoard()
            sdata = board.get_dict()
            raw   = sdata.get("scoreboard", {}).get("games", [])
            for g in raw:
                ht = g.get("homeTeam", {}); at = g.get("awayTeam", {})
                today_games.append({
                    "gameId":        g.get("gameId"),
                    "status":        g.get("gameStatus", 1),
                    "statusText":    g.get("gameStatusText", ""),
                    "gameTimeUTC":   g.get("gameTimeUTC", ""),
                    "gameDateLabel": now_utc.strftime("%Y-%m-%d"),
                    "homeTeam": {"teamId": ht.get("teamId"), "abbr": ht.get("teamTricode","HME"), "name": ht.get("teamName",""), "score": ht.get("score",0)},
                    "awayTeam": {"teamId": at.get("teamId"), "abbr": at.get("teamTricode","AWY"), "name": at.get("teamName",""), "score": at.get("score",0)},
                })
        except Exception:
            pass

        # 2. Próximas 24h via CDN schedule
        future_games = []
        try:
            url        = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json"
            sched_data = _nba_fetch(url, timeout=9)
            game_dates = sched_data.get("leagueSchedule", {}).get("gameDates", [])

            for gd in game_dates:
                for g in gd.get("games", []):
                    game_time_str = g.get("gameDateTimeUTC", "")
                    if not game_time_str:
                        continue
                    try:
                        # Parse do horário UTC do jogo
                        game_dt = datetime.strptime(
                            game_time_str[:19], "%Y-%m-%dT%H:%M:%S"
                        ).replace(tzinfo=timezone.utc)
                    except ValueError:
                        continue

                    # Só jogos nas próximas 24h que ainda não estão no scoreboard
                    if not (now_utc < game_dt <= cutoff):
                        continue

                    game_id = g.get("gameId","")
                    if any(x.get("gameId") == game_id for x in today_games):
                        continue  # já está no scoreboard

                    ht = g.get("homeTeam", {}); at = g.get("awayTeam", {})
                    future_games.append({
                        "gameId":        game_id,
                        "status":        1,
                        "statusText":    "Agendado",
                        "gameTimeUTC":   game_time_str,
                        "gameDateLabel": game_dt.strftime("%Y-%m-%d"),
                        "homeTeam": {"teamId": ht.get("teamId"), "abbr": ht.get("teamTricode","HME"), "name": ht.get("teamCityName",""), "score": 0},
                        "awayTeam": {"teamId": at.get("teamId"), "abbr": at.get("teamTricode","AWY"), "name": at.get("teamCityName",""), "score": 0},
                    })
        except Exception:
            pass

        all_games = today_games + future_games
        _cache_set(today_key, all_games)
        return all_games

    except Exception as e:
        return {"error": str(e)}


def get_defense_ranking(team_abbr, position, stat="pts"):
    cache_key = f"defense_{team_abbr}_{position}_{stat}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    pos_map = {
        "G": "Guards", "PG": "Guards", "SG": "Guards",
        "F": "Forwards", "SF": "Forwards", "PF": "Forwards",
        "C": "Centers", "FC": "Centers",
    }
    pos_upper = (position or "").upper().split("-")[0]
    category = pos_map.get(pos_upper, "Guards")

    # Map stat to NBA API column
    stat_col_map = {
        "pts": "PTS",
        "reb": "REB",
        "ast": "AST",
        "fg3m": "FG3M",
    }
    stat_key = (stat or "pts").lower()
    stat_col = stat_col_map.get(stat_key, "PTS")

    try:
        url = (
            "https://stats.nba.com/stats/leaguedashptdefend"
            "?College=&Conference=&Country=&DateFrom=&DateTo="
            f"&DefenseCategory={category.replace(' ', '+')}"
            "&Division=&DraftPick=&DraftYear=&GameSegment=&Height="
            "&LastNGames=0&LeagueID=00&Location=&Month=0&OpponentTeamID=0"
            "&Outcome=&PORound=0&PerMode=PerGame&Period=0"
            "&PlayerExperience=&PlayerPosition=&Season=2024-25"
            "&SeasonSegment=&SeasonType=Regular+Season"
            "&StarterBench=&TeamID=0&VsConference=&VsDivision=&Weight="
        )
        data = _nba_fetch(url, timeout=9)
        rs = data.get("resultSets", [{}])[0]
        headers = rs.get("headers", [])
        rows = rs.get("rowSet", [])

        if not rows or not headers:
            return None

        abbr_idx = headers.index("TEAM_ABBREVIATION") if "TEAM_ABBREVIATION" in headers else None
        # leaguedashptdefend uses D_FGM/D_FGA/etc — for pts use PTS if available
        # Fallback columns for the stat of interest
        col_candidates = {
            "PTS":  ["PTS", "D_PTS"],
            "REB":  ["REB", "D_REB", "DREB"],
            "AST":  ["AST", "D_AST"],
            "FG3M": ["FG3M", "D_FG3M"],
        }
        stat_idx = None
        for c in col_candidates.get(stat_col, [stat_col]):
            if c in headers:
                stat_idx = headers.index(c)
                break

        if abbr_idx is None or stat_idx is None:
            return None

        team_data = [{"abbr": r[abbr_idx], "val": float(r[stat_idx] or 0)} for r in rows]
        # Rank: higher value = worse defense = higher rank number
        sorted_teams = sorted(team_data, key=lambda x: x["val"], reverse=True)
        target = next((t for t in team_data if t["abbr"] == team_abbr.upper()), None)
        if not target:
            return None

        rank = next((i+1 for i, t in enumerate(sorted_teams) if t["abbr"] == team_abbr.upper()), None)
        total = len(sorted_teams)

        result = {
            "team": team_abbr.upper(),
            "position": position,
            "category": category,
            "stat": stat_key,
            "pts_allowed": round(target["val"], 1),  # keep key name for frontend compat
            "rank": rank,
            "total": total,
            "rating": "ruim" if rank <= 10 else "media" if rank <= 20 else "boa",
            "favorable": rank >= (total - 9),  # top 10 worst = favorable for offense
        }
        _cache_set(cache_key, result)
        return result

    except Exception as e:
        return {"error": str(e)}

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Rate limit por IP
        ip = get_client_ip(self)
        if not rate_limit_check(ip):
            self._send(429, {"error": "rate limit exceeded"}); return

        params = parse_qs(urlparse(self.path).query)
        req_type = params.get("type", [""])[0]

        # Valida tipo (whitelist)
        VALID_TYPES = {"scoreboard","boxscore","season_avg","pregame","pregame_by_name","schedule","defense","team_info","team_last","roster"}
        if req_type not in VALID_TYPES:
            self._send(400, {"error": "invalid type"}); return

        try:
            if req_type == "scoreboard":
                self._send(200, {"games": get_live_games()})

            elif req_type == "boxscore":
                game_id = params.get("gameId", [""])[0]
                if not is_valid_id(game_id):
                    self._send(400, {"error": "invalid gameId"}); return
                self._send(200, {"players": get_boxscore(game_id)})

            elif req_type == "season_avg":
                player_id = params.get("playerId", [""])[0]
                if not is_valid_id(player_id) or not player_id.isdigit():
                    self._send(400, {"error": "invalid playerId"}); return
                self._send(200, {"avg": get_season_avg(int(player_id))})

            elif req_type == "pregame":
                player_id = params.get("playerId", [""])[0]
                if not is_valid_id(player_id) or not player_id.isdigit():
                    self._send(400, {"error": "invalid playerId"}); return
                self._send(200, get_pregame(int(player_id)))

            elif req_type == "pregame_by_name":
                player_name = params.get("name", [""])[0].strip()
                if not player_name or len(player_name) > 60:
                    self._send(400, {"error": "invalid name"}); return
                pid = get_player_id_by_name(player_name)
                if not pid:
                    self._send(404, {"error": "player not found", "name": player_name}); return
                self._send(200, get_pregame(int(pid)))

            elif req_type == "schedule":
                result = get_upcoming_schedule()
                self._send(200, {"games": result} if isinstance(result, list) else result)

            elif req_type == "defense":
                team_abbr = params.get("teamAbbr", [""])[0].upper()
                position  = params.get("position", ["G"])[0].upper()
                stat      = params.get("stat", ["pts"])[0].lower()
                if not is_valid_abbr(team_abbr):
                    self._send(400, {"error": "invalid teamAbbr"}); return
                if not is_valid_position(position):
                    self._send(400, {"error": "invalid position"}); return
                if not is_valid_stat(stat):
                    self._send(400, {"error": "invalid stat"}); return
                result = get_defense_ranking(team_abbr, position, stat)
                self._send(200, result or {"error": "not found"})

        except Exception as e:
            # Não vaza detalhes internos em prod
            self._send(500, {"error": "internal server error"})

    def do_OPTIONS(self):
        # CORS é gerenciado pelo vercel.json
        self.send_response(204)
        self.end_headers()

    def _send(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass
