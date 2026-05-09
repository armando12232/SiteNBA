"""
StatCast BR — Telegram Collector
Monitora o topico de DADOS DISCIPLINARES do grupo Favari VIP
e faz POST direto no endpoint /api/telegram do site.

Uso:
  pip install telethon requests
  python collector.py

Na primeira execucao pede numero de telefone + codigo do Telegram.
Depois a sessao fica salva em statcast_session.session
"""

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone

try:
    import requests
except ImportError:
    print("Instale: pip install requests")
    exit(1)

try:
    from telethon import TelegramClient, events
except ImportError:
    print("Instale: pip install telethon==1.36.0")
    exit(1)

# ─────────────────────────────────────────────
# CONFIGURACAO
# ─────────────────────────────────────────────
API_ID   = 25898305
API_HASH = "129e94082157d682c2861e0ce9315aa9"

GROUP_ID = -1002369699199   # Favari VIP - Cards & Afins

# Topicos que queremos monitorar
TOPIC_IDS = {
    24,      # DADOS DISCIPLINARES  ← principal
    29256,   # Libertadores + Sula  ← tambem tem dados de arbitros
}

# Endpoint do site
SITE_URL    = os.getenv("SITE_URL", "https://site-nba-ten.vercel.app")
WEBHOOK_URL = f"{SITE_URL}/api/telegram"

# Secret configurado na Vercel (TELEGRAM_WEBHOOK_SECRET)
WEBHOOK_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")

SESSION_FILE = "statcast_session"

# ─────────────────────────────────────────────
logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(message)s",
    level=logging.INFO,
)
log = logging.getLogger("collector")


def get_topic_id(event):
    """Retorna o topic_id da mensagem, ou None se nao for num topico."""
    msg = event.message
    if not msg.reply_to:
        return None
    rt = msg.reply_to
    # forum_topic flag indica que e o post inicial do topico
    if getattr(rt, 'forum_topic', False):
        return rt.reply_to_msg_id
    return rt.reply_to_msg_id


def build_fake_update(msg, text: str) -> dict:
    """
    Monta um update no formato padrao do Telegram
    para o endpoint /api/telegram processar normalmente.
    """
    chat_id    = msg.chat_id or GROUP_ID
    message_id = msg.id
    date_unix  = int(msg.date.timestamp()) if msg.date else int(time.time())

    return {
        "update_id": message_id,
        "message": {
            "message_id": message_id,
            "date": date_unix,
            "chat": {
                "id": chat_id,
                "type": "supergroup",
            },
            "text": text,
        }
    }


def post_to_site(update: dict) -> bool:
    """Faz POST no /api/telegram do site."""
    headers = {"Content-Type": "application/json"}
    if WEBHOOK_SECRET:
        headers["X-Telegram-Bot-Api-Secret-Token"] = WEBHOOK_SECRET

    try:
        resp = requests.post(
            WEBHOOK_URL,
            json=update,
            headers=headers,
            timeout=15,
        )
        data = resp.json()
        if resp.status_code == 200 and data.get("ok"):
            if data.get("ignored"):
                log.info("  → Site ignorou (nao e mensagem disciplinar)")
            else:
                log.info(f"  → Salvo no site! times={data.get('teams', 0)}")
            return True
        else:
            log.warning(f"  → Site retornou {resp.status_code}: {data}")
            return False
    except Exception as e:
        log.error(f"  → Erro ao enviar para o site: {e}")
        return False


async def main():
    log.info("Iniciando StatCast BR Collector...")
    log.info(f"Monitorando grupo {GROUP_ID}, topicos: {TOPIC_IDS}")
    log.info(f"Enviando para: {WEBHOOK_URL}")

    if not WEBHOOK_SECRET:
        log.warning("TELEGRAM_WEBHOOK_SECRET nao configurado — o endpoint aceitara qualquer origem")

    client = TelegramClient(SESSION_FILE, API_ID, API_HASH)
    await client.start()

    me = await client.get_me()
    log.info(f"Conectado como: {me.first_name} (@{me.username})")

    @client.on(events.NewMessage(chats=GROUP_ID))
    async def handler(event):
        msg  = event.message
        text = msg.text or msg.message or ""

        if not text:
            return

        topic_id = get_topic_id(event)

        # Filtra so os topicos que nos interessam
        # OU aceita qualquer mensagem que contenha "DADOS DISCIPLINARES"
        is_target_topic = topic_id in TOPIC_IDS
        has_keyword     = "dados disciplinares" in text.lower()

        if not is_target_topic and not has_keyword:
            return

        log.info(f"Nova mensagem | topic_id={topic_id} | {text[:80].replace(chr(10), ' ')}")

        update = build_fake_update(msg, text)
        post_to_site(update)

    log.info("Monitorando em tempo real... (Ctrl+C para parar)\n")
    await client.run_until_disconnected()


if __name__ == "__main__":
    asyncio.run(main())
