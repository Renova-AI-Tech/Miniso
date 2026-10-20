# Arquitetura

Monorepo pnpm com aplicações independentes e pacotes locais. Cada clone tem
código, banco e identidade próprios; não usa o banco nem o runtime do renova-monorepo.

```text
Browser → Vite /api (proxy local) → Fastify/tRPC → Postgres
Browser → Fastify (build Vite + /api, Railway) → Postgres privado
apps/frontend → packages/ui
apps/frontend → import type de @renova/backend/contract
apps/backend → packages/db-types + packages/dbmigrator (readiness)
scripts/db → packages/dbmigrator → Postgres (papel de migração)
```

Frontend e API compartilham origem no navegador. O backend não é importado em
runtime pelo browser. O harness descobre os nomes nos manifests: renomear scopes
não permite que `packages/*` importe `apps/*`, nem que o frontend importe DB/Node
ou implementação do backend.

| Pasta | Responsabilidade |
| --- | --- |
| `apps/frontend` | React/Vite; produto em `/`, catálogo e exemplo público em `/referência` |
| `apps/backend/src/env.ts` | Validação central de configuração antes de listen |
| `apps/backend/src/server` | HTTP, políticas obrigatórias, limites e erros sanitizados |
| `apps/backend/src/modules/example` | Consulta pública paginada, sem writer |
| `packages/ui` | Componentes, tokens, fontes e origem registrados em NOTICE |
| `packages/db-types` | Contrato tipado do schema |
| `packages/dbmigrator` | Histórico/checksum, transação, lock e readiness sem escrita |
| `scripts/db` | Identidade e alvos locais/teste, Compose e credenciais separadas |
| `scripts/project` | Manifesto, plano, setup retomável, diagnóstico readonly e execução local |
| `scripts/deploy` | Setup remoto com destino explícito, plano IaC nativo, publicação e verificação |
| `.railway/railway.ts` | Configuração parcial do serviço `app`, sem administrar Postgres ou volume |
| `scripts/harness` | Regras objetivas; produto em harness.rules.mjs |

## Produto e biblioteca de referência

`HomePage.tsx` pertence ao produto e começa com um guia substituível. `ReferencePage.tsx` e
`reference/ReferenceGallery.tsx` são exemplos em `/referência` (alias `/referencia`),
carregados sob demanda. A página inicial não consulta a API demonstrativa. A logo
oficial acompanha o clone, sem dependência do monorepo original em execução.

O setup configura identidade e prepara o ambiente; não sobrescreve os workspaces.
O diagnóstico somente observa. O plano `--plan` não instala nem inicia recursos.
Todos usam o mesmo manifesto validado. A publicação Railway é uma etapa separada,
com recursos próprios e destino explícito.
Auth é uma receita fixa em `templates/modules/auth`, fora dos workspaces. O primeiro
setup do perfil autenticado verifica os arquivos originais e materializa o módulo
com seu lockfile. Depois disso, o código pertence ao projeto; repetir setup não o
recopia. Projetos já preparados e arquivos customizados impedem essa instalação.

## Fronteiras de segurança

O perfil público é somente leitura: três exemplos sintéticos, nenhuma rota/tabela
de identidade e nenhuma operação de escrita anônima. Registrar política privada
sem módulo auth falha. O perfil autenticado acrescenta Better Auth, caixa de email
local e registros privados por proprietário; o exemplo público não recebe dono
implícito e continua somente leitura.

O processo da API usa credencial limitada às operações do perfil; o migrador usa
papel separado. No perfil público ela só lê; no autenticado escreve somente nas
tabelas de identidade e registros privados, sem DDL nem acesso administrativo.
O migrador local recusa alvos remotos. O migrador Railway exige IDs explícitos de
projeto e ambiente, banco na rede privada e papel `renova_migrator`; recusa
identidade divergente e histórico alterado. Readiness verifica conexão, identidade,
permissões e histórico exato de migrations; retorna 503
se estiver indisponível, pendente ou divergente. Não exige tabelas de demonstração.
Schema de produto tem testes próprios; health
indica apenas que o processo responde. Migração não acontece ao iniciar a API.

Segredos ficam no ambiente do servidor. O frontend recebe apenas nome de projeto
público; não recebe DATABASE_URL. Erros públicos são genéricos e têm request ID.
Produção usa uma imagem Docker que serve frontend e API na mesma origem, com um
serviço `app` e Postgres privado no mesmo projeto e ambiente Railway. O bootstrap
usa SSH no Postgres; a credencial administrativa não é enviada à aplicação.
Migrations rodam no predeploy; o processo da API recebe somente a credencial de
runtime. `deploy:prepare` fixa o plano nativo e o commit; `deploy:apply` exige
destino confirmado, árvore limpa e CI aprovado para esse SHA. `deploy:verify`
verifica a origem HTTPS separadamente.

O perfil autenticado mantém Mailpit local e usa Resend HTTPS em produção; a
[validação remota](docs/specs/renova-project-template/railway-validation.md) registra
entrega, jornada e limites dos pilotos. Cada nova instalação precisa de sua prova. Consulte os guias de
[acesso](docs/process/authentication.md) e [Railway](docs/process/railway.md).
