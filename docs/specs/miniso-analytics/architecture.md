# Miniso Analytics no template Renova

## Objetivo

Migrar o painel Linx para o monorepo do template Renova, mantendo a separação entre coleta, banco analítico, API e frontend. A camada de runtime usa somente leitura; a coleta incremental ficará em um processo separado com credenciais de migração.

## Camadas

- `apps/backend`: Fastify e tRPC. Os procedimentos `linx.*` delegam para `modules/linx/linx.repository.ts`.
- `apps/frontend`: React/Vite com as telas atuais de visão geral, vendas, estoque, produtos e status. A comunicação usa o contrato tRPC em `apps/backend/src/contract.ts`.
- `packages/db-types`: contrato Kysely das dimensões, fatos e auditoria.
- `packages/dbmigrator`: migration `001_linx_analytics`, derivada do schema analítico já validado no projeto anterior.
- `scripts/linx` (próxima etapa): coletor Linx e refresh incremental. Ele será executado com a conexão do migrador e não pelo processo web.

## Modelo de dados

O schema possui `ingest` para payloads brutos, `replica` para catálogo de endpoints, runs e auditoria, e `analytics` para lojas, produtos, fornecedores, vendas diárias, snapshots de estoque e caches. Os preços permanecem na granularidade produto + loja; nenhuma consulta reutiliza preço de uma unidade para outra.

## Convenções

- Datas são ISO `YYYY-MM-DD`.
- Filtros de loja usam CNPJ e aceitam múltiplas seleções.
- O backend converte `numeric` do PostgreSQL para números JSON antes de entregar ao frontend.
- A API mantém o perfil público local do template enquanto autenticação não for instalada; os dados reais devem ficar protegidos no ambiente de execução.
- Nenhum dado de exemplo do template participa do painel Miniso.

## Próximas etapas

1. Trazer o coletor Linx para um pacote operacional separado e conectar `syncNow` a um job idempotente.
2. Exercitar a migration em Postgres local e importar a réplica existente.
3. Substituir a superfície de compatibilidade da página `/referência` por dados de demonstração do design system sem misturar o domínio Miniso.
4. Adicionar testes de integração das procedures tRPC e do contrato de paginação.
