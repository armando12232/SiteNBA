import argparse
import asyncio
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from telethon import TelegramClient


DEFAULT_STATE_FILE = ".telegram-sync-state.json"
INTEL_PATTERN = re.compile(r"dados\s+disciplinares", re.IGNORECASE)


def env(name, default=""):
    return os.environ.get(name, default).strip()


def required_env(name):
    value = env(name)
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def read_state(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError:
        return {}


def write_state(path, state):
    Path(path).write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")


def message_date_iso(message):
    value = message.date
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def build_bot_update(message, chat_id):
    text = message.message or ""
    return {
        "update_id": int(message.id),
        "message": {
            "message_id": int(message.id),
            "date": int(message.date.timestamp()) if message.date else int(datetime.now(timezone.utc).timestamp()),
            "chat": {"id": str(chat_id)},
            "text": text,
        },
    }


def post_update(site_url, secret, update, timeout=15):
    body = json.dumps(update).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
    }
    if secret:
        headers["X-Telegram-Bot-Api-Secret-Token"] = secret

    request = urllib.request.Request(
        f"{site_url.rstrip('/')}/api/telegram",
        data=body,
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
            return response.status, raw
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        return error.code, raw


async def sync(args):
    api_id = int(required_env("TELEGRAM_API_ID"))
    api_hash = required_env("TELEGRAM_API_HASH")
    session = env("TELEGRAM_SESSION", "statcast_telegram")
    source_chat = required_env("TELEGRAM_SOURCE_CHAT")
    site_url = env("SITE_URL", "https://site-nba-ten.vercel.app")
    secret = env("TELEGRAM_WEBHOOK_SECRET")
    state_file = env("TELEGRAM_SYNC_STATE", DEFAULT_STATE_FILE)

    state = read_state(state_file)
    last_seen = int(state.get(source_chat, 0))

    client = TelegramClient(session, api_id, api_hash)
    await client.start()

    sent = 0
    skipped = 0
    newest_id = last_seen

    async for message in client.iter_messages(source_chat, limit=args.limit, reverse=True, min_id=last_seen):
        newest_id = max(newest_id, int(message.id))
        text = message.message or ""
        if not INTEL_PATTERN.search(text):
            skipped += 1
            continue

        update = build_bot_update(message, source_chat)
        status, raw = post_update(site_url, secret, update)
        if status >= 300:
            raise RuntimeError(f"POST /api/telegram failed: HTTP {status} {raw[:300]}")
        sent += 1
        print(f"saved message_id={message.id} date={message_date_iso(message)}")

    await client.disconnect()

    if newest_id > last_seen:
        state[source_chat] = newest_id
        write_state(state_file, state)

    print(json.dumps({"ok": True, "sent": sent, "skipped": skipped, "last_seen": newest_id}, ensure_ascii=False))


def parse_args():
    parser = argparse.ArgumentParser(description="Sync authorized Telegram group intel into StatCast BR.")
    parser.add_argument("--limit", type=int, default=80, help="Max messages to scan per run.")
    return parser.parse_args()


def main():
    try:
        asyncio.run(sync(parse_args()))
    except Exception as error:
        print(f"telegram sync error: {error}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
