"""
Utilitários de segurança compartilhados entre os endpoints /api.
- Rate limit por IP (in-memory por serverless instance)
- Validação de params (whitelist de formato)
- Sanitização básica
"""
import time
import re

# ─── Rate limiting ────────────────────────────────────────────────────────────
_RATE_BUCKETS = {}  # ip → [timestamps]
_RATE_MAX     = 60  # 60 requests
_RATE_WINDOW  = 60  # por 60 segundos

def rate_limit_check(ip):
    """Retorna True se dentro do limite, False se estourou."""
    now = time.time()
    bucket = _RATE_BUCKETS.get(ip, [])
    # Remove timestamps fora da janela
    bucket = [t for t in bucket if now - t < _RATE_WINDOW]
    if len(bucket) >= _RATE_MAX:
        _RATE_BUCKETS[ip] = bucket
        return False
    bucket.append(now)
    _RATE_BUCKETS[ip] = bucket
    # Limpeza periódica simples (evita crescer infinito)
    if len(_RATE_BUCKETS) > 1000:
        _cleanup_buckets(now)
    return True

def _cleanup_buckets(now):
    for ip in list(_RATE_BUCKETS.keys()):
        _RATE_BUCKETS[ip] = [t for t in _RATE_BUCKETS[ip] if now - t < _RATE_WINDOW]
        if not _RATE_BUCKETS[ip]:
            del _RATE_BUCKETS[ip]


# ─── Validação de parâmetros ──────────────────────────────────────────────────
# Whitelists por tipo — rejeitar qualquer coisa fora desse padrão
_RE_ABBR      = re.compile(r'^[A-Z]{2,4}$')            # LAL, GSW, BKN
_RE_ID        = re.compile(r'^[a-zA-Z0-9_-]{1,40}$')    # IDs alfanuméricos
_RE_DATE      = re.compile(r'^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$')
_RE_STAT      = re.compile(r'^(pts|reb|ast|fg3m|stl|blk)$')
_RE_POSITION  = re.compile(r'^[A-Z]{1,3}(-[A-Z]{1,3})?$') # G, F, C, F-C
_RE_LEAGUEKEY = re.compile(r'^[a-z]{3,20}$')

def is_valid_abbr(s):     return bool(s and _RE_ABBR.match(s))
def is_valid_id(s):       return bool(s and _RE_ID.match(s))
def is_valid_date(s):     return bool(s and _RE_DATE.match(s))
def is_valid_stat(s):     return bool(s and _RE_STAT.match(s))
def is_valid_position(s): return bool(s and _RE_POSITION.match(s))
def is_valid_league(s):   return bool(s and _RE_LEAGUEKEY.match(s))

def sanitize_team_name(s):
    """Remove caracteres perigosos mas mantém acentos."""
    if not s:
        return ''
    # Só letras (qualquer idioma), dígitos, espaço, ponto, hífen, apóstrofe
    return re.sub(r"[^\w\s.\-']", '', s, flags=re.UNICODE)[:60]


def get_client_ip(handler):
    """Extrai IP do cliente de um BaseHTTPRequestHandler com suporte a proxy."""
    # Vercel passa o IP real em x-forwarded-for
    xff = handler.headers.get('x-forwarded-for') or handler.headers.get('X-Forwarded-For')
    if xff:
        return xff.split(',')[0].strip()
    return handler.client_address[0] if handler.client_address else '0.0.0.0'
