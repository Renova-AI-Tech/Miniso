---
name: failure-to-rule
description: Transforma erro repetido de agente (CI, PR, review) em teste, lint ou regra do harness. Use depois de incidente, não para inventar regra preventiva de domínio.
---

# Falha → teste / lint / regra

Escreva a regra quando o erro se repetir. Prosa em AGENTS.md não segura o que hook/lint/CI recusam.

| Tipo | Destino |
| --- | --- |
| Objetivo (path, AST, `it` ausente, `Math.random`, `process.env`) | `scripts/harness/rules/` + `harness.rules.mjs` + caso em `check.test.mjs` |
| Semântico (asserção fraca, conta, jornada) | teste dono em `tests/unit` ou `tests/property`; contraexemplo pinado |
| Gosto / copy | pedido ou critério da feature — não harness |

## Regra

1. `scripts/harness/rules/<id>.mjs` → `violations[]` no formato `arquivo:linha [id] mensagem`.
2. Registrar em `engine.mjs` e ligar em `harness.rules.mjs`.
3. Dois testes em `check.test.mjs`. `pnpm harness:test && pnpm harness:check`.

## Teste dono

Se a falha foi “aceitou configuração inválida”: mantenha um contraexemplo em `tests/unit` e uma propriedade pertinente em `tests/property`. Os testes de configuração do projeto mostram esse padrão. Cite em [testing-strategy.md](../../../docs/process/testing-strategy.md) “Armadilhas”.

Não crie catálogo paralelo de evals. O oráculo mora no Git como teste ou regra.
