# AGENTS.md

Mapa do repo para o agente. Manual: [docs/index.md](docs/index.md). Docs em **pt-BR**; código em inglês. Clone limpo: não carregue skill pessoal.

O arquivo **mais próximo** do path editado vence ([agents.md](https://agents.md/) · Codex concatena raiz → cwd). Aninhado só onde a regra muda: [apps/frontend/AGENTS.md](apps/frontend/AGENTS.md), [packages/ui/AGENTS.md](packages/ui/AGENTS.md), [scripts/harness/AGENTS.md](scripts/harness/AGENTS.md).

## Onde está

| Precisa de | Abra |
| --- | --- |
| Camadas e dependências | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Qual doc responde o quê | [docs/index.md](docs/index.md) |
| O que existe agora | [docs/plans/active/current.md](docs/plans/active/current.md) |
| Trabalho longo (passes) | [docs/plans/feature-list.json](docs/plans/feature-list.json) + [progress.md](docs/plans/progress.md) |
| Spec da feature | [docs/specs/](docs/specs/) (`requirements` / `design` / `tasks`) |
| Jornadas de UI | [docs/specs/feature-map.md](docs/specs/feature-map.md) |
| Do pedido à entrega | [docs/process/task-recipe.md](docs/process/task-recipe.md) |
| Skills | [.agents/skills/](.agents/skills/) |

## Comandos (os mesmos no CI)

```
pnpm run setup          # nome + confirmação; prepara o ambiente local
pnpm run doctor         # diagnóstico sem alterações
pnpm test:loop           # unit + property + UI, sem DB
pnpm check:quick         # harness + lint + types + loop
pnpm check:full          # + integração + e2e
pnpm dev                 # Vite + Fastify; porta exibida no terminal
```

Aliases: `ci:quick` → `check:quick`. Sem npm/yarn. Sem `--no-verify`.

## Produto e referência

`/` começa com um guia substituível: implemente o produto em `apps/frontend/src/pages/HomePage.tsx`.
`/referência` (alias `/referencia`) contém exemplos e componentes. Consulte
[apps/frontend/AGENTS.md](apps/frontend/AGENTS.md); não desenvolva o produto na galeria.
Para IA: `pnpm run setup -- --config renova.project.json --plan --json`, depois
`--yes --json` para preparar localmente. `pnpm run doctor -- --json` não modifica
arquivos. Login opcional é instalado somente em clone novo, por receita fixa em
`templates/modules/auth`; veja [acesso](docs/process/authentication.md). O perfil
público não carrega auth. A publicação [Railway](docs/process/railway.md) usa uma
aplicação e Postgres privado, com `deploy:setup`, `deploy:prepare`, `deploy:apply`
e `deploy:verify`; setup e prepare exigem IDs explícitos, apply confirma o projeto
do plano e verify recebe a origem HTTPS. Resend foi validado no piloto; veja a
[evidência](docs/specs/renova-project-template/railway-validation.md). Adição automática de login a produto existente
(T-030) continua futura.

## Inegotiável

- Um objetivo claro por alteração; use o pedido do usuário ou a spec local. Ferramenta de tarefas e ID externo são opcionais, inclusive em PRs. Branch descritiva (`codex/<slug>` quando criada pelo Codex).
- Não enfraqueça teste, timeout, asserção ou regra do harness para o CI passar.
- Não decida produto sozinho (preço, permissão, apagar dado). Registre a dúvida no plano ou na conversa e confirme com o usuário antes da parte dependente.
- Tela: skill `verify-app`. Unitário com fake-api não fecha jornada.
- Pronto = comando verde + o que **não** foi verificado escrito. O texto do agente não é o veredito.
- Segredo fora do Git. MCP em [`.mcp.json`](.mcp.json) com `${VAR}`.

## Skills (corpo só sob demanda)

- [`develop-feature`](.agents/skills/develop-feature/SKILL.md) — pedido → implementação validada
- [`verify-app`](.agents/skills/verify-app/SKILL.md) — sobe o app e anda o feature map
- [`failure-to-rule`](.agents/skills/failure-to-rule/SKILL.md) — erro repetido → teste, lint ou regra

Não instale coleção extra. Descrição de skill entra em toda sessão.

## A máquina recusa

`pnpm harness:check` — motor em `scripts/harness/`, produto em [harness.rules.mjs](harness.rules.mjs). Formato `arquivo:linha [id] mensagem`.

Formatação: husky + hook Claude `PostToolUse`. Gate: pre-push `check:quick`. Prosa neste arquivo **não** substitui hook/lint/CI.

## Sessão longa

1. `pwd`, `git log`, [progress.md](docs/plans/progress.md), [feature-list.json](docs/plans/feature-list.json).
2. Uma feature. Cadastre o objetivo do projeto no JSON; só marque `passes` com evidência. Não herde resultados de outro projeto.
3. Commit limpo + nota em progress.md.

Revisor em **contexto fresco**, não o autor. PR: [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md).
