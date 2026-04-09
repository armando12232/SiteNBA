from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen
import json, os

ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')

def analyze_alert(player_data: dict) -> str:
    name     = player_data.get('name', 'Jogador')
    team     = player_data.get('team', '')
    period   = player_data.get('period', 1)
    pts      = player_data.get('pts', 0)
    reb      = player_data.get('reb', 0)
    ast      = player_data.get('ast', 0)
    mins     = player_data.get('mins', 0)
    game     = player_data.get('gameLabel', '')
    warnings = player_data.get('warnings', [])
    triggered = player_data.get('triggered', [])

    stats_text = ', '.join([
        f"{t['stat'].upper()}: {t['cur']} (ritmo {t['proj']} proj, {t['pct']}% da média {t['avg']})"
        for t in triggered
    ])

    warnings_text = ', '.join(warnings) if warnings else 'nenhum'

    prompt = f"""Você é um analista especialista em apostas esportivas da NBA, focado em props de jogadores.

Analise este alerta ao vivo e dê uma recomendação em português brasileiro. Seja direto e use no máximo 2-3 frases curtas. NÃO use markdown, asteriscos, hashtags ou formatação especial. Escreva texto simples e direto.

Jogador: {name} ({team})
Jogo: {game} — Q{period}
Minutos jogados: {mins}
Stats ao vivo: PTS {pts} | REB {reb} | AST {ast}
Ritmos acima da média: {stats_text}
Alertas de risco: {warnings_text}

Formato obrigatório — duas partes separadas por ||| :
VEREDICTO (uma frase curta: ex "Over PTS recomendado" ou "Aguardar mais dados") ||| MOTIVO (1-2 frases explicando o ritmo, minutos e contexto do jogo)"""

    payload = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 200,
        "messages": [{"role": "user", "content": prompt}]
    }).encode()

    req = Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
    )

    with urlopen(req, timeout=20) as r:
        resp = json.loads(r.read())

    return resp["content"][0]["text"].strip()


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        try:
            analysis = analyze_alert(body)
            self._send(200, {"analysis": analysis})
        except Exception as e:
            self._send(500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _send(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, f, *a): pass
