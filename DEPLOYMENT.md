# Deploy

Este projeto está padronizado para rodar na Vercel.

## Frontend

- Build command: `npm run build`
- Output directory: `dist`
- Configuração: `vercel.json`

## APIs

As APIs ficam em `api/` e rodam como Serverless Functions da Vercel.

## Railway

Railway não é usado neste projeto.

O backend FastAPI legado foi removido para evitar detecção/deploy acidental fora da Vercel. Se algum serviço externo ainda tentar deployar este repositório no Railway, remova a integração pelo painel do Railway ou pelo GitHub.

## Variáveis necessárias

Configure no Vercel, em Production e Preview:

```env
SITE_URL
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_SERVICE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
API_FOOTBALL_KEY
RAPIDAPI_BET365_KEY
PROXY_URL
TELEGRAM_WEBHOOK_SECRET
TELEGRAM_CHAT_ID
```

## Telegram via Telethon

O Telethon nao roda dentro da Vercel, porque ele precisa de sessao persistente. Use o coletor em uma maquina local ou VPS e envie as mensagens autorizadas para `/api/telegram`.

Instalacao:

```bash
python -m venv .venv-telethon
.venv-telethon\Scripts\pip install -r requirements-telethon.txt
```

Variaveis do coletor:

```env
SITE_URL=https://site-nba-ten.vercel.app
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_SESSION=statcast_telegram
TELEGRAM_SOURCE_CHAT=
TELEGRAM_SYNC_STATE=.telegram-sync-state.json
```

Rodar uma sincronizacao:

```bash
.venv-telethon\Scripts\python scripts\telegram_telethon_sync.py --limit 100
```

O coletor envia apenas mensagens que contem "DADOS DISCIPLINARES". Nao envie autores, membros ou dados pessoais do grupo para o site.
