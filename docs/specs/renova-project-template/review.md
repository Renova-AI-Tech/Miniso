# Revisão documental da proposta

Estado: validação estrutural e segunda leitura independente concluídas, sem
bloqueios documentais remanescentes. Proposta pronta para revisão do responsável.
Data: 19/10/2026. Escopo: pesquisa, requisitos, design e plano.
Não é o relatório de verificação da futura implementação.

## Evidência desta rodada

- Planejamento solicitado pelo usuário; perfis sem login/com login confirmados.
- Confirmados Blacksmith no CI e liberação de contas pelo responsável, sem cadastro público.
- Alterações restritas a documentação; nenhum runtime ou serviço implementado.
- Pesquisa de mercado, autenticação/segurança e Blacksmith delegada em frentes
  somente leitura; fontes primárias confrontadas com a base existente.
- Revisão independente, em contexto fresco, encontrou os ajustes abaixo.
- Segunda leitura confirmou correções, coerência de Blacksmith/entrada fechada,
  cobertura de 40 requisitos e grafo de 31 tarefas; não substitui aprovação de produto.

## Ajustes incorporados ao plano

| Achado | Correção documental | Onde será implementado |
| --- | --- | --- |
| Parser de evidência escolhe primeiro path e só aceita `it`; adaptação estava tardia | Antecipada tarefa obrigatória, com casos negativos e campo explícito | T-000 antes de T-001 |
| Aprovação de deploy não fixava o conteúdo nem exigia CI antes da publicação | Plano vincula SHA e hash/digest; apply recusa checks ausentes ou sem sucesso do mesmo SHA | T-024/T-025 |
| Docs e aceite local dependiam de piloto remoto | Fases 5/6 independentes; guia local não espera T-026 | T-027/T-029; complemento remoto em T-026 |
| Gate Build/T-014 não executava integração exigida | Build inclui integração; T-014 usa Gate Integration | T-006/T-014 |
| Falha de email poderia revelar existência de conta | Resposta pública genérica inclusive em falha; diagnóstico administrativo separado | T-016/T-018 |

Os problemas do código atual não foram corrigidos nesta rodada: as correções
acima pertencem ao plano de implementação e não constituem evidência de runtime.

## Validação documental executada

- `node scripts/harness/check.mjs`: passou, 86 arquivos e 9 regras.
- `validate_spec.py docs/specs/renova-project-template/requirements.md --strict`:
  0 erros e 0 avisos. Script da skill TLC utilizada nesta sessão.
- `validate_tasks.py --strict`: 0 erros e 0 avisos em cópia temporária com
  normalização apenas de sintaxe (`T-001 —` para `T1:`, posição do negrito e
  `Ownership` para `Where`). Fonte preserva a convenção deste repo; validador não
  foi alterado e nenhum conteúdo foi removido para obter o resultado.
- Checagem adicional diretamente na fonte: 31 tarefas em todo, 40 requisitos
  mapeados nos dois sentidos, 58 arestas coincidentes, sem ciclos, fases e tabelas
  de dependências coerentes.
- `git diff --check`: passou. Alterações deste trabalho somente em `docs/`.

## Decisões ainda propostas

Perfil público com exemplo somente leitura; email/senha e provedor transacional;
valores iniciais de proteção; detalhes de stack e distribuição da UI. Método e
biblioteca passam pelo spike antes da integração. Confirmar responsáveis, acesso
ao App Blacksmith, destino e orçamento antes dos respectivos pilotos remotos.

## Limitações

Não foram executados setup, integração com banco, autenticação, build, navegador,
containers, CI remoto, Railway ou piloto humano da proposta. Comandos novos e
testes do plano ainda não existem. Nenhum requisito tem status Verified.
`check:quick`/`check:full` não foram executados: dependências não estão instaladas,
e esta entrega é documental. Os passes existentes no feature-list são do sample.
