# Índice

Uma fonte por pergunta. Status: **atual** ou **obsoleto** (não apague obsoleto — marque).

| Pergunta | Fonte | Status |
| --- | --- | --- |
| Por onde o agente começa? | [AGENTS.md](../AGENTS.md) | atual |
| Camadas e dependências? | [ARCHITECTURE.md](../ARCHITECTURE.md) | atual |
| O que existe vs. decidido? | [plans/active/current.md](plans/active/current.md) | atual |
| Lista de features (`passes`)? | [plans/feature-list.json](plans/feature-list.json) | atual |
| Notas da sessão anterior? | [plans/progress.md](plans/progress.md) | atual |
| Dívida técnica? | [plans/tech-debt.md](plans/tech-debt.md) | atual |
| Planos concluídos? | [plans/completed/README.md](plans/completed/README.md) | atual |
| Como transformar um pedido em entrega validada? | [process/task-recipe.md](process/task-recipe.md) | atual |
| Como escrever spec / tasks / Validation Log? | [process/spec-execution.md](process/spec-execution.md) | atual |
| Máquina vs. revisão humana? | [process/code-standards.md](process/code-standards.md) | atual |
| Que teste, em que pasta, com que timeout? | [process/testing-strategy.md](process/testing-strategy.md) | atual |
| Como revisar o PR? | [process/pr-review.md](process/pr-review.md) | atual |
| Comandos, portas, hooks, CI? | [process/operations.md](process/operations.md) | atual |
| Como escolher login e liberar contas? | [process/authentication.md](process/authentication.md) | atual, perfil local |
| O que foi validado no piloto Railway? | [specs/renova-project-template/railway-validation.md](specs/renova-project-template/railway-validation.md) | pilotos técnicos validados; limites registrados |
| Como publicar e enviar convites no Railway? | [process/railway.md](process/railway.md) | implementado e ensaiado no piloto |
| Mapa de telas? | [specs/feature-map.md](specs/feature-map.md) | atual |
| Como transformar o template na base Renova? | [specs/renova-project-template/requirements.md](specs/renova-project-template/requirements.md) | atual, base local entregue |
| Quais escolhas foram confirmadas? | [specs/renova-project-template/context.md](specs/renova-project-template/context.md) | atual |
| Quais referências sustentam a proposta? | [specs/renova-project-template/research.md](specs/renova-project-template/research.md) | atual |
| Como funcionam perfis, segurança e Railway? | [specs/renova-project-template/design.md](specs/renova-project-template/design.md) | atual, etapas locais e futuras identificadas |
| Como executar a transformação em incrementos? | [specs/renova-project-template/tasks.md](specs/renova-project-template/tasks.md) | atual, T-000–T-019 e T-031 concluídos |
| O que foi validado no planejamento? | [specs/renova-project-template/review.md](specs/renova-project-template/review.md) | atual |
| O que foi validado na base local? | [specs/renova-project-template/local-validation.md](specs/renova-project-template/local-validation.md) | atual, revisão independente |
| O que foi validado no configurador, diagnóstico e referência? | [specs/renova-project-template/onboarding-validation.md](specs/renova-project-template/onboarding-validation.md) | atual, revisão independente |
| O que foi simplificado e validado para a entrega? | [specs/renova-project-template/simplification-validation.md](specs/renova-project-template/simplification-validation.md) | validação local; CI/clone têm evidências próprias |
| Por que esta biblioteca de autenticação e quais controles foram provados? | [specs/renova-project-template/auth-spike.md](specs/renova-project-template/auth-spike.md) | experimento e módulo local |
| O que foi validado nos perfis e no acesso por convite? | [specs/renova-project-template/auth-validation.md](specs/renova-project-template/auth-validation.md) | validação por camada |
| Como o painel Miniso é organizado no template? | [specs/miniso-analytics/architecture.md](specs/miniso-analytics/architecture.md) | atual, migração inicial |
| Quais aprendizados surgiram neste incremento? | [plans/onboarding-lessons.md](plans/onboarding-lessons.md), [registro](plans/onboarding-lessons.json) | candidatos observados, sem nova dependência do clone |
| Templates de spec? | [specs/_templates/requirements.md](specs/_templates/requirements.md), [design.md](specs/_templates/design.md), [tasks.md](specs/_templates/tasks.md), [handoff.md](specs/_templates/handoff.md) | atual |
| Exemplo histórico de ADR? | [decisions/0001-centavos-inteiros.md](decisions/0001-centavos-inteiros.md) | histórico, exemplo financeiro retirado |
| llms.txt de libs? | [references/README.md](references/README.md) | atual |

## Skills

| Trabalho | Skill |
| --- | --- |
| Pedido → implementação validada | [develop-feature](../.agents/skills/develop-feature/SKILL.md) |
| Subir app e andar jornada | [verify-app](../.agents/skills/verify-app/SKILL.md) |
| Falha repetida → teste/lint/regra | [failure-to-rule](../.agents/skills/failure-to-rule/SKILL.md) |

Objetivos e pendências podem ficar no plano local; uma ferramenta externa de tarefas
é opcional. Este índice apenas aponta as fontes, sem duplicar seu conteúdo.
