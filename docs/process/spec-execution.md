# Spec → PR

Proporcional: uma correção pequena registra objetivo e validação no PR ou em `docs/plans/progress.md`. Feature com decisões ou várias etapas ganha spec. Conceito alinhado a Spec Kit / Kiro; **sem** o CLI deles.

## Objetivo, pasta e PR

- O pedido do usuário ou o plano local define o objetivo. A spec fica em `docs/specs/<slug>/`; link para uma tarefa externa é opcional.
- Uma branch/PR por objetivo, com nome descritivo. Branch criada pelo Codex usa `codex/<slug>`.
- O título do PR descreve o resultado, sem ID obrigatório. A conclusão fica registrada no plano e na validação local.

## Arquivos

Copie de [docs/specs/_templates/](../specs/_templates/requirements.md):

| Arquivo | Contém |
| --- | --- |
| `requirements.md` | Problem Statement, Out of Scope, Assumptions, REQ WHEN/SHALL, Traceability |
| `design.md` | Recorte, fronteiras, Validation Strategy |
| `tasks.md` | Ownership, Done when, Gate, Test (`it` + arquivo) |
| `handoff.md` | Só se o trabalho cruzar sessões |

A [spec da base Renova](../specs/renova-project-template/requirements.md) mostra um trabalho grande; use os templates com detalhe proporcional à sua feature.

## REQ

```
REQ-001. WHEN <condição observável>
         SHALL <comportamento observável>
```

## tasks.md (máquina lê)

```
## T-001 — título
- **Status:** todo | in_progress | done | blocked
- **Ownership:** path
- **Done when:** frase observável
- **Gate:** `pnpm test:loop`
- **Test:** `it('nome')` em `tests/unit/foo.test.ts`
```

`harness:check` recusa `done` sem o `it` no arquivo. Isso não prova que o teste distingue implementação errada — propriedades e o revisor fazem isso.

## Validation Log

```
## Validation Log
- Rodou: `pnpm test:loop`
- Não verificou: E2E (mudança não toca tela)
```
