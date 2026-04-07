from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import httpx

app = FastAPI(
    title="Site NBA API",
    version="1.0.0",
    description="API de apoio ao frontend do projeto NBA"
)

# Libera acesso do frontend. Depois você pode trocar "*" pelo domínio do Vercel.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

NBA_API_BASE = "https://www.balldontlie.io/v1"
REQUEST_TIMEOUT = 15.0


@app.get("/")
def root() -> Dict[str, str]:
    return {"status": "ok", "message": "API NBA online"}


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "healthy"}


async def fetch_json(url: str, params: Optional[Dict[str, Any]] = None) -> Any:
    """Faz request com timeout e erro controlado para evitar loading infinito."""
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response.json()
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="A consulta demorou demais para responder."
        )
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"Erro ao consultar API externa: {exc.response.text}"
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Erro interno: {str(exc)}"
        )


@app.get("/pregame")
async def pregame(
    playerId: Optional[int] = Query(
        default=None,
        description="ID do jogador. Se não informar, a rota retorna uma mensagem padrão."
    )
) -> Dict[str, Any]:
    """
    Rota segura para evitar travamentos:
    - sem playerId: responde normalmente
    - com playerId: busca dados do jogador
    """

    if playerId is None:
        return {
            "status": "ok",
            "message": "Envie o parâmetro playerId para consultar um jogador específico.",
            "example": "/pregame?playerId=237"
        }

    player_url = f"{NBA_API_BASE}/players/{playerId}"
    player_data = await fetch_json(player_url)

    return {
        "status": "ok",
        "playerId": playerId,
        "player": player_data
    }


@app.get("/pregame/player-stats")
async def pregame_player_stats(
    playerId: int = Query(..., description="ID do jogador")
) -> Dict[str, Any]:
    """
    Exemplo de rota separada para estatísticas.
    Você pode adaptar depois para a API que estiver usando.
    """
    stats_url = f"{NBA_API_BASE}/stats"
    stats_data = await fetch_json(stats_url, params={"player_ids[]": playerId, "per_page": 10})

    return {
        "status": "ok",
        "playerId": playerId,
        "stats": stats_data
    }


@app.get("/pregame/tips")
def pregame_tips() -> Dict[str, Any]:
    """
    Rota pronta para o frontend consumir sem depender de playerId.
    """
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
