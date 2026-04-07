from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import requests

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

NBA_API_BASE = "https://www.balldontlie.io/v1"
REQUEST_TIMEOUT = 15


@app.get("/")
def root() -> Dict[str, str]:
    return {"status": "ok", "message": "API NBA online"}


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "healthy"}


def fetch_json(url: str, params: Optional[Dict[str, Any]] = None) -> Any:
    try:
        response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        return response.json()
    except requests.Timeout:
        raise HTTPException(
            status_code=504,
            detail="A consulta demorou demais para responder."
        )
    except requests.HTTPError:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Erro ao consultar API externa: {response.text}"
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Erro interno: {str(exc)}"
        )


@app.get("/pregame")
def pregame(
    playerId: Optional[int] = Query(
        default=None,
        description="ID do jogador. Se não informar, a rota retorna uma mensagem padrão."
    )
) -> Dict[str, Any]:
    if playerId is None:
        return {
            "status": "ok",
            "message": "Envie o parâmetro playerId para consultar um jogador específico.",
            "example": "/pregame?playerId=2544"
        }

    player_url = f"{NBA_API_BASE}/players/{playerId}"
    player_data = fetch_json(player_url)

    return {
        "status": "ok",
        "playerId": playerId,
        "player": player_data
    }


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
