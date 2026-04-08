from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from nba_api.stats.endpoints import playercareerstats, playergamelog
from nba_api.stats.static import players as nba_players
import time

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

cache = {}
CACHE_TTL = 600

@app.get("/")
def root():
    return {"status": "ok"}

@app.get("/health")
def health():
    return {"status": "healthy"}

@app.get("/pregame")
def pregame(playerId: int = Query(...)):
    now = time.time()
    if playerId in cache:
        data, ts = cache[playerId]
        if now - ts < CACHE_TTL:
            return data

    try:
        # Nome do jogador
        all_players = nba_players.get_players()
        player_info = next((p for p in all_players if p["id"] == playerId), None)
        player_name = player_info["full_name"] if player_info else f"Player {playerId}"

        # Médias da temporada
        career = playercareerstats.PlayerCareerStats(player_id=playerId, per_mode36="PerGame")
        career_data = career.get_dict()
        reg = next((s for s in career_data.get("resultSets", []) if s["name"] == "SeasonTotalsRegularSeason"), None)
        if not reg or not reg["rowSet"]:
            return {"error": "Sem dados de temporada"}
        headers = reg["headers"]
        last_row = dict(zip(headers, reg["rowSet"][-1]))
        season_pts = round(float(last_row.get("PTS", 0) or 0), 1)
        season_reb = round(float(last_row.get("REB", 0) or 0), 1)
        season_ast = round(float(last_row.get("AST", 0) or 0), 1)

        # Últimos jogos
        log = playergamelog.PlayerGameLog(player_id=playerId)
        log_data = log.get_dict()
        rs = log_data.get("resultSets", [{}])[0]
        rows = [dict(zip(rs["headers"], r)) for r in rs.get("rowSet", [])]

        if len(rows) < 5:
            return {"error": "Poucos jogos disponíveis"}

        last5 = rows[:5]
        last10 = rows[:10] if len(rows) >= 10 else rows

        last5_pts = round(sum(float(r["PTS"]) for r in last5) / len(last5), 1)
        last10_pts = round(sum(float(r["PTS"]) for r in last10) / len(last10), 1)

        # Linha sintética
        line = round((season_pts - 1.5) * 2) / 2

        # Hit rate L10
        hits = sum(1 for r in last10 if float(r["PTS"]) >= line)
        hit_rate = round((hits / len(last10)) * 100)

        # Edge
        edge = round(last5_pts - line, 1)

        # Últimos 5 detalhados
        last5_games = [
            {
                "opp": r.get("MATCHUP", ""),
                "pts": float(r.get("PTS", 0)),
                "reb": float(r.get("REB", 0)),
                "ast": float(r.get("AST", 0)),
                "hit": float(r.get("PTS", 0)) >= line
            }
            for r in last5
        ]

        result = {
            "player_id": playerId,
            "player_name": player_name,
            "season_avg": {"pts": season_pts, "reb": season_reb, "ast": season_ast},
            "last5_avg": {"pts": last5_pts},
            "last10_avg": {"pts": last10_pts},
            "synthetic_lines": {"pts": line},
            "hit_rates": {"pts_last10": hit_rate},
            "edge_points": edge,
            "last5_games": last5_games,
            "summary": f"L5 {last5_pts} pts · L10 hit {hit_rate}%"
        }

        cache[playerId] = (result, now)
        return result

    except Exception as e:
        return {"error": str(e)}
