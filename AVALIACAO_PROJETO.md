# Avaliação técnica do projeto SiteNBA

## Visão geral
- O projeto implementa um endpoint de análise pré-jogo de jogadores NBA com cache em memória e cálculo de métricas de pontos.
- Há duas implementações de backend com responsabilidades sobrepostas:
  - `main.py` com FastAPI.
  - `api/nba.py` com `BaseHTTPRequestHandler` (fluxo de função serverless para Vercel).
- O frontend atual (`index.html`) apenas dispara chamadas e faz `console.log`, sem renderização de UI.

## Pontos positivos
1. **Estrutura simples e direta**: o cálculo de média dos últimos 5 e 10 jogos está fácil de entender.
2. **Cache básico funcional**: reduz chamadas repetidas ao `nba_api` por 10 minutos (`CACHE_TTL = 600`).
3. **Deploy orientado ao Vercel**: `vercel.json` já limita duração da função para 30 segundos.

## Riscos e problemas encontrados
1. **Duplicação de lógica**
   - `main.py` e `api/nba.py` mantêm implementações diferentes para o mesmo objetivo, elevando custo de manutenção e risco de inconsistência.

2. **Tratamento de erro frágil**
   - Em `api/nba.py` há `except:` genérico em `get_season_averages`, ocultando causas reais.
   - Em ambos os backends, erros são devolvidos como string sem tipagem/status HTTP adequado.

3. **Ausência de validação de entrada**
   - `playerId` chega como string no handler da API e não há validação explícita antes de chamar a biblioteca externa.

4. **Falta de observabilidade**
   - Não há logs estruturados, métricas ou nível de erro; isso dificulta investigação em produção.

5. **Frontend incompleto**
   - `index.html` não exibe estado de carregamento, erro ou tabela/cartões com resultados.
   - Atualmente os dados só aparecem no console.

6. **Dependências sem controle robusto**
   - Apenas `nba_api` está pinado; `fastapi` e `uvicorn` estão sem versão fixa.

## Recomendações priorizadas

### Prioridade alta (1–2 dias)
1. Unificar o backend em **uma única implementação** (idealmente FastAPI + rota serverless compatível).
2. Adicionar validação rigorosa de `playerId` e retornar códigos HTTP corretos (`400`, `502`, `500`).
3. Substituir `except` genérico por exceções específicas e logs mínimos com contexto.
4. Padronizar o contrato de resposta JSON (campos, tipos e mensagens de erro).

### Prioridade média (3–5 dias)
1. Criar testes unitários para cálculo (`avg`, `line`, `hit_rate`, `edge`).
2. Criar testes de integração para endpoint com mocks do `nba_api`.
3. Versionar todas as dependências no `requirements.txt`.
4. Melhorar frontend para renderizar cards/tabela + estados de loading/erro.

### Prioridade baixa (1 semana)
1. Adicionar rate limit simples por IP (ou token) se houver exposição pública.
2. Incluir monitoramento básico (logs com request id, latência, falhas externas).
3. Documentar API (README com exemplos de request/response).

## Nota geral
- **Maturidade atual**: protótipo funcional.
- **Nota sugerida**: **6.5/10**.
- **Potencial**: alto para MVP após unificação do backend, validações e testes.
