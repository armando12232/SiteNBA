from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from nba_api.stats.static import players
from nba_api.stats.endpoints import playercareerstats

app = FastAPI(
    title="Site NBA API",
    version="1.0.0",
    description="API de apoio ao frontend do projeto NBA"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> Dict[str, str]:
    return {"status": "ok", "message": "API NBA online"}


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "healthy"}


@app.get("/pregame")
def pregame(
    playerId: Optional[int] = Query(
        default=None,
        description="ID do jogador. Ex.: 2544 para LeBron James"
    )
) -> Dict[str, Any]:
    if playerId is None:
        return {
            "status": "ok",
            "message": "Envie o parâmetro playerId para consultar um jogador específico.",
            "example": "/pregame?playerId=2544"
        }

    try:
        all_players = players.get_players()
        player_info = next((p for p in all_players if p["id"] == playerId), None)

        if not player_info:
            raise HTTPException(status_code=404, detail="Jogador não encontrado.")

        career = playercareerstats.PlayerCareerStats(player_id=playerId)
        dfs = career.get_data_frames()

        career_stats = []
        if dfs and len(dfs) > 0:
            df = dfs[0]
            career_stats = df.tail(5).to_dict(orient="records")

        return {
            "status": "ok",
            "playerId": playerId,
            "player": {
                "id": player_info["id"],
                "full_name": player_info["full_name"],
                "first_name": player_info["first_name"],
                "last_name": player_info["last_name"],
                "is_active": player_info["is_active"],
            },
            "recent_seasons": career_stats
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro interno: {str(exc)}")


@app.get("/pregame/tips")
def pregame_tips() -> Dict[str, Any]:
    return {
        "status": "ok",
        "tips": [
            {
                "game": "Lakers vs Warriors",
                "market": "Over 228.5",
                "odd": 1.85,
                "confidence": "Alta"
            },
            {
                "game": "Celtics vs Heat",
                "market": "Celtics ML",
                "odd": 1.62,
                "confidence": "Média"
            }
        ]
    }
