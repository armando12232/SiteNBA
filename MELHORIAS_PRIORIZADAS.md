# Melhorias recomendadas para o SiteNBA

## Objetivo
Evoluir o projeto de protótipo para MVP confiável, mantendo simplicidade de operação no Vercel.

## Plano de ação por sprints

### Sprint 1 (alto impacto, baixa complexidade)
1. **Padronizar contrato de resposta da API**
   - Definir schema único para sucesso e erro.
   - Exemplo de erro: `{ "error": { "code": "INVALID_PLAYER_ID", "message": "..." } }`.

2. **Validação de entrada (`playerId`)**
   - Aceitar apenas inteiro positivo.
   - Retornar `400` para entrada inválida.

3. **Tratamento de exceções específico**
   - Remover `except:` genérico.
   - Diferenciar erro de upstream (`nba_api`) de erro interno.

4. **Fixar versões de dependências**
   - Versionar `fastapi` e `uvicorn` para reduzir regressões.

### Sprint 2 (confiabilidade)
1. **Cobertura de testes**
   - Unitários para `avg`, `line`, `hit_rate`, `edge`.
   - Integração de endpoint com mock de `nba_api`.

2. **Logs estruturados**
   - Incluir request id, playerId, latência e status.
   - Facilitar debugging em produção.

3. **Timeout/retry controlado no upstream**
   - Tratar lentidão/falha da NBA API sem derrubar a rota.

### Sprint 3 (produto)
1. **Frontend com UI básica**
   - Cards/tabela com: season avg, L5, L10, line, hit rate, edge.
   - Estados de loading, erro e vazio.

2. **Melhorias de performance**
   - Cache mais previsível (ex.: por chave + estratégia de invalidação).
   - Possível pré-aquecimento para jogadores mais consultados.

3. **Documentação do projeto**
   - README com setup local, endpoints, exemplos de resposta e limites.

## Métricas para medir evolução
- Taxa de erro por endpoint.
- Latência p50/p95.
- Cobertura de testes.
- Tempo de resolução de incidentes.

## Próximo passo recomendado (imediato)
Implementar Sprint 1 completo antes de adicionar novas features.
