from fastapi import FastAPI, HTTPException

from nba_service import ServiceError, compute_pregame_metrics

app = FastAPI(title="SiteNBA API", version="1.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/pregame")
def pregame(playerId: int):
    try:
        return compute_pregame_metrics(playerId)
    except ServiceError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Upstream NBA API failure.") from exc
