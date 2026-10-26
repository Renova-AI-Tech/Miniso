# Paridade das rotas Linx

Este documento registra a migração da API Starlette da aplicação antiga para o
contrato tRPC do template Renova. As consultas continuam centralizadas no
`LinxRepository`; não há uma segunda implementação de regra de negócio.

| Aplicação antiga | Aplicação atual | Situação |
| --- | --- | --- |
| `GET /health` | `linx.health` + `GET /health` (liveness) | Dados de qualidade disponíveis no procedimento Linx; `/health` permanece leve para probes |
| `GET /api/v1/lojas` | `linx.stores` | Completa |
| `GET /api/v1/resumo` | `linx.summary` | Completa; informa a fonte usada |
| `GET /api/v1/painel` | `linx.dashboard` | Completa; informa a fonte usada |
| `GET /api/v1/produtos` | `linx.products` | Completa, com paginação e filtro por loja |
| `GET /api/v1/vendas/diarias` | `linx.dailySales` | Completa, com paginação e filtro por produto |
| `GET /api/v1/estoque` | `linx.inventory` | Completa, com snapshot por loja |
| `GET /api/v1/analises` | `linx.analyses` | Completa: fornecedor, categoria, origem, velocidade, giro e série diária por loja |
| `GET /api/v1/sync/status` | `linx.syncStatus` | Completa |
| `GET /api/v1/sync/history` | `linx.syncHistory` | Completa, incluindo filtro por método e status |
| `GET /api/v1/sync/audit` | `linx.syncAudit` | Completa, incluindo execução, tabela e tipo de alteração |
| `POST /api/v1/sync` | `linx.sync` | Completa; coleta assíncrona e protegida contra concorrência |

## Fonte das vendas

Para períodos parciais, a consulta usa `analytics.daily_sales_cache`. Quando o
intervalo corresponde a um mês fechado e existe carga mensal correspondente,
usa `analytics.powerbi_monthly_sales_enriched`, replicando o comportamento da
aplicação antiga e evitando comparar um mês fechado com uma extração diária
incompleta. A origem retornada é `powerbi_monthly` ou `linx_movements`.

## Validação local

- Setembro/2026 fechado: fonte mensal e faturamento de R$ 5.213.253,46.
- Período parcial de setembro: fonte diária.
- Saúde da base: 4.021.897 movimentos, 71.364 produtos e estoque mais recente em 19/10/2026.
- `pnpm typecheck`, `pnpm build` e `pnpm harness:check` passaram após a migração.
