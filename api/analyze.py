from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen
import json, os

ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')

def build_prompt(d: dict) -> str:
    name      = d.get('name', 'Jogador')
    team      = d.get('team', '')
    period    = d.get('period', 1)
    clock     = d.get('clock', '')
    pts       = d.get('pts', 0)
    reb       = d.get('reb', 0)
    ast       = d.get('ast', 0)
    mins      = d.get('mins', 0)
    game      = d.get('gameLabel', '')
    warnings  = d.get('warnings', [])
    triggered = d.get('triggered', [])

    l10       = d.get('l10', {})
    l10_pts   = l10.get('pts', None)
    l10_reb   = l10.get('reb', None)
    l10_ast   = l10.get('ast', None)
    hit_rate  = d.get('hitRate', None)
    l5_pts    = d.get('l5Pts', None)
    h2h       = d.get('h2h', [])
    line_real = d.get('line', None)      # linha sintética do pré-jogo
    edge_real = d.get('edge', None)      # edge real L5 vs linha
    b2b       = d.get('isB2B', False)
    mins_l5   = d.get('minsL5', None)
    pace_factor = d.get('paceFactor', 100)

    triggered_lines = []
    for t in triggered:
        stat  = t.get('stat','').upper()
        cur   = t.get('cur', 0)
        proj  = t.get('proj', 0)
        avg   = t.get('avg', 0)
        pct   = t.get('pct', 0)
        line  = t.get('line', None)
        low   = t.get('projLow', proj)
        high  = t.get('projHigh', proj)
        line_txt = f", linha {line}" if line else (f", linha sintetica {line_real}" if line_real else "")
        edge_txt = f" (edge L5: +{edge_real}pts)" if edge_real and edge_real > 0 else ""
        triggered_lines.append(
            f"  - {stat}: {cur} atual -> proj {proj} (IC: {low}-{high}), {pct}% acima media {avg}{line_txt}{edge_txt}"
        )
    triggered_text = '\n'.join(triggered_lines) if triggered_lines else '  nenhum'

    l10_parts = []
    if l10_pts  is not None: l10_parts.append(f"PTS {l10_pts}")
    if l10_reb  is not None: l10_parts.append(f"REB {l10_reb}")
    if l10_ast  is not None: l10_parts.append(f"AST {l10_ast}")
    l10_text  = ', '.join(l10_parts) if l10_parts else 'nao disponivel'
    hit_text  = f"{hit_rate}% hit rate L10" if hit_rate is not None else 'nao disponivel'
    l5_text   = f"{l5_pts} pts" if l5_pts is not None else 'nao disponivel'

    if h2h:
        h2h_lines = [
            f"  - vs {g.get('opp','?')}: {g.get('pts','?')}pts/{g.get('reb','?')}reb/{g.get('ast','?')}ast"
            for g in h2h[:5]
        ]
        h2h_text = '\n'.join(h2h_lines)
    else:
        h2h_text = '  nao disponivel'

    b2b_text    = "SIM - jogou ontem, carga elevada" if b2b else "nao"
    mins_l5_txt = f"{mins_l5} min/jogo L5" if mins_l5 is not None else 'nao disponivel'
    pace_txt    = f"{pace_factor}% ritmo NBA - {'jogo acelerado' if pace_factor > 108 else 'ritmo normal' if pace_factor > 95 else 'jogo lento'}"
    warnings_text = ', '.join(warnings) if warnings else 'nenhum'
    clock_txt   = f"Q{period} {clock}" if clock else f"Q{period}"

    prompt = f"""Voce e um analista senior de props NBA com 10 anos de experiencia. Analise rigorosamente.

DADOS DO ALERTA
Jogador: {name} ({team}) | Jogo: {game} | {clock_txt} | Minutos jogados: {mins}

STATS DISPARADOS (>130% da media):
{triggered_text}

FORMA RECENTE
Medias L10: {l10_text}
Media L5 pontos: {l5_text}
Hit rate na linha: {hit_text}

HISTORICO vs ADVERSARIO (H2H):
{h2h_text}

CONTEXTO E CARGA
Back-to-back: {b2b_text}
Minutos medios: {mins_l5_txt}
Pace do jogo: {pace_txt}
Riscos: {warnings_text}

Responda APENAS em portugues brasileiro. SEM markdown, SEM asteriscos, SEM emojis. Texto simples.

Use exatamente este formato com 4 secoes separadas por |||:

FORMA ||| [1 frase especifica com numeros do L5/L10 e hit rate]
CONTEXTO ||| [1 frase sobre H2H com esse adversario e ritmo do jogo]
RISCO ||| [1 frase sobre riscos: back-to-back, faltas, blowout, minutos]
VEREDICTO ||| [OVER RECOMENDADO confianca ALTA/MEDIA/BAIXA ou AGUARDAR - 1 frase com o principal motivo]"""

    return prompt


def analyze_alert(d: dict) -> str:
    payload = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 400,
        "messages": [{"role": "user", "content": build_prompt(d)}]
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
    with urlopen(req, timeout=25) as r:
        resp = json.loads(r.read())
    return resp["content"][0]["text"].strip()


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        try:
            self._send(200, {"analysis": analyze_alert(body)})
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
