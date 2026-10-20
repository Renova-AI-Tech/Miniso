---
name: develop-feature
description: Implementa uma funcionalidade a partir do pedido do usuário ou de uma spec local, com escopo e validação proporcionais. Use ao desenvolver uma feature neste repositório.
---

# Pedido → implementação validada

Receita: [task-recipe.md](../../../docs/process/task-recipe.md). O pedido do usuário
ou a spec local define o objetivo. Links para tarefas externas são opcionais;
não exija conta, integração, ID de tarefa ou criação de item para começar.

## Passos

1. Confira escopo, estado do Git e instruções locais; preserve alterações existentes.
   Use branch descritiva quando necessário (`codex/<slug>` para trabalho do Codex).
2. Para uma feature, use ou atualize `docs/specs/<slug>/` com os templates do repo.
   Ajuste pequeno não exige criar uma spec completa. Registre critérios observáveis.
3. Implemente o recorte e seus testes pertinentes. Invariantes vão em `tests/property/`;
   exemplos em `tests/unit/`; I/O em `tests/integration/`. Tela usa `verify-app`.
4. Nas tarefas da spec, associe o teste dono antes de marcar `done` e registre
   comandos, resultados e o que não foi verificado. O harness confere essa associação.
5. Quando o usuário solicitar PR, use o [template](../../../.github/PULL_REQUEST_TEMPLATE.md)
   e um título descritivo. Implementar localmente não autoriza publicar ou fechar tarefas externas.

## Pronto

`pnpm check:quick` verde. Validation Log com o que **não** foi verificado. Revisor ≠ autor.
