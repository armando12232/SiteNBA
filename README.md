# SiteNBA

Projeto simples para análise pregame de jogadores da NBA.

## Endpoints

- `GET /api/nba?type=pregame&playerId=<id>` (Vercel Serverless)
- `GET /pregame?playerId=<id>` (FastAPI local)
- `GET /health` (FastAPI local)

## Resposta de sucesso

```json
{
  "player_id": 203999,
  "season_avg": 26.5,
  "last5": 27.4,
  "last10": 25.2,
  "line": 25.0,
  "hit_rate": 60,
  "edge": 2.4,
  "summary": "L5 27.4 pts · L10 hit 60%"
}
```

## Erros

```json
{
  "error": "playerId must be an integer.",
  "code": "bad_request"
}
```

## Rodar localmente

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Abra o `index.html` com um servidor estático para testar a interface.

## Arquitetura

- `nba_service.py`: regras de negócio, cache e validações.
- `api/nba.py`: entrada serverless para Vercel.
- `main.py`: API FastAPI para desenvolvimento local.
- `index.html`: front-end simples para visualizar métricas.
