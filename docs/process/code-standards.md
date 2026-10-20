# Padrão × quem verifica

O que dá para apontar em arquivo:linha vira **harness / lint / hook**. O resto é humano.

| Padrão | Quem recusa |
| --- | --- |
| Link markdown quebrado | `docs-link` |
| Doc em `docs/` fora de [index.md](../index.md) | `docs-index` |
| Passo `done` sem `it('…')` | `spec-tests` |
| Status fora do vocabulário | `spec-status` |
| `Math.random` / `Date.now()` / `waitForTimeout` em teste | `test-nondeterminism` |
| Vitest sem `testTimeout` | `test-timeout` |
| `console.log` em src | `no-console` |
| `process.env` fora de `env.ts` | `env-centralized` |
| `packages/*` importar `apps/*` | `import-direction` |
| Formatação | Biome + husky + hook Claude |
| Asserção tautológica em dinheiro | propriedade + contraexemplo + review |
| Copy / a11y / gosto de API | humano |

Regra nova: só depois do erro repetir. Skill [failure-to-rule](../../.agents/skills/failure-to-rule/SKILL.md). Sem regra de domínio de cliente no motor.
