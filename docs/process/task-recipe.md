# Receita da tarefa

Comece pelo pedido e pelo resultado esperado. Detalhe: [spec-execution.md](spec-execution.md). Skill: [develop-feature](../../.agents/skills/develop-feature/SKILL.md).

## 1. Antes do código

1. Defina um objetivo e um critério observável de pronto no pedido ou no plano local. Link externo é opcional; nenhuma ferramenta de tarefas é necessária.
2. Para uma feature com decisões ou várias etapas, copie `docs/specs/_templates/` → `docs/specs/<slug>/`. Uma correção pequena pode registrar objetivo e validação no PR ou em `docs/plans/progress.md`.
3. Mantenha um objetivo por branch/PR, com nome descritivo. Branch criada pelo Codex usa `codex/<slug>`; não é necessário um ID externo.
4. Para comportamento novo, escreva o `it('…')` dono **antes** da implementação. Invariante → `tests/property/` (`fast-check`, seed fixa). Exemplo → `tests/unit/`.
5. Se houver spec, registre o critério de pronto e o teste dono em `tasks.md`.

## 2. Camada e teste dono

| Camada | Pasta | Teste dono |
| --- | --- | --- |
| Função pura | `packages/*` | `tests/unit` + `tests/property` |
| App | `apps/*` | recorte sem DB no `test:loop` |
| SQL / webhook | I/O | `tests/integration/*.test.ts` — não pule |
| Tela | [feature-map](../specs/feature-map.md) | skill [verify-app](../../.agents/skills/verify-app/SKILL.md) |

Um dono por comportamento.

## 3. Loop

```
pnpm test:loop
pnpm check:quick
pnpm check:full
```

Depois de cada edição no núcleo: `test:loop`.

## 4. Encerrar

Registre a validação, incluindo o que **não** foi verificado. Quando abrir PR, use o template e um título que descreva o resultado. Conclua o plano local conforme a evidência; não é necessário fechar uma tarefa externa.
