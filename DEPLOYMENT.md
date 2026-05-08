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
