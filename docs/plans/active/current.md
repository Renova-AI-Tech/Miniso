# Estado atual

O que **existe** neste clone vs. o que está **decidido**. Objetivos e pendências
ficam nos planos locais; ferramenta externa de tarefas é opcional.

## Existe

- Monorepo pnpm: `@renova/frontend` (Vite/React), `@renova/backend` (Fastify/tRPC),
  `@renova/ui`, `@renova/db-types` e `@renova/dbmigrator`.
- Produto Miniso adaptado: dashboard Linx, repositório de serviços, coletor XML em
  `scripts/linx`, materialização analítica e mutation `linx.sync` em segundo plano.
- Postgres Docker isolado por clone, papéis separados e migrations com lock/checksum.
- Perfil público somente leitura com três exemplos sintéticos em `/referência`
  (alias `/referencia`). `/` começa com um guia substituível pelo produto. Sem auth no runtime público.
- Perfil opcional com login para clones novos: contas liberadas pelo responsável,
  ativação/recuperação por Mailpit local ou Resend no Railway, sessão limitada e registros por proprietário.
  Veja o [guia de acesso](../../process/authentication.md) e a
  [validação dos dois perfis](../../specs/renova-project-template/auth-validation.md).
- Configurador `pnpm run setup`: nome + perfil + confirmação ou JSON, plano sem escrita e
  preparação retomável. `pnpm run doctor` oferece diagnóstico somente leitura
  em texto ou JSON, com próximos passos.
- Logo oficial Renova local, sidebar refinada e galeria separada do produto.
- Harness + `harness.rules.mjs`.
- `scripts/check-quick` / `check-full` / `init.sh`.
- Três skills em `.agents/skills/`.
- Templates de spec para as features de cada projeto; sem aplicação financeira extra.
- Transformação em [base Renova](../../specs/renova-project-template/requirements.md),
  com [design](../../specs/renova-project-template/design.md) e
  [tarefas](../../specs/renova-project-template/tasks.md). O incremento local passou
  na [validação independente](../../specs/renova-project-template/local-validation.md):
  141 testes e 3/3 falhas controladas detectadas. O incremento posterior de
  [onboarding e referência](../../specs/renova-project-template/onboarding-validation.md)
  passou em 204 testes e 3/3 falhas controladas detectadas. Adição de auth a produtos
  já personalizados continua uma etapa futura.
- [Simplificação validada localmente](../../specs/renova-project-template/simplification-validation.md):
  configurador só pede nome, readiness não exige tabela de exemplo, legado retirado.
- Workflow Blacksmith preparado, E2E bloqueante e agregador que recusa skip/falha.
  Resultados remotos são registrados na PR do commit correspondente.

## Decidido

- Docs em pt-BR; código em inglês.
- Pedido ou spec local → alteração com objetivo claro → validação. PR com título
  descritivo quando solicitado, sem exigir ferramenta de tarefas ou ID externo.
- Agente não é dono do veredito.
- Direção confirmada em 19/10/2026: projetos independentes, design system
  integrado, uso local ou Railway e dois perfis iniciais sem login/com login.
  CI usa Blacksmith; no perfil com login, o responsável libera as contas, sem cadastro público.
  Plano aprovado e implementação da base local autorizada na sequência.

## Publicação Railway validada em pilotos

Container único, Postgres privado, plano IaC nativo e publicação condicionada ao CI
do commit. Dois pilotos independentes passaram em saúde, navegador e API; o perfil
com login recebeu convite e recuperação reais. Restauração lógica também ensaiada.
Veja as [evidências e limites](../../specs/renova-project-template/railway-validation.md).
Os pilotos foram encerrados em 20/10/2026: aplicações e bancos offline, com remoção
definitiva agendada pelo Railway. O template não mantém ambiente compartilhado;
cada clone cria seus próprios recursos quando precisar publicar.

## Em aberto (projeto real)

- [ ] Personalizar nome/slug no setup e responsáveis de revisão, quando aplicável.
- [ ] Validar onboarding com pessoas técnicas e não técnicas; ensaio de agente não substitui aceite humano.
- [ ] Ativar CODEOWNERS com usuários reais se o projeto quiser revisão por responsáveis.
- [ ] Definir destino/acesso/custo e política de backup de cada novo projeto antes de dados reais.
- [ ] Preencher as credenciais Linx no ambiente seguro e executar a primeira coleta real.
- [ ] Confirmar no primeiro uso que o preflight de credenciais permite iniciar a coleta
  somente quando `LINX_USER`, `LINX_PASSWORD`, `LINX_KEY` e `LINX_PORTAL` estão presentes.
- [ ] Medir a primeira coleta real e ajustar os limites de lote se a resposta da Linx
  indicar outra capacidade, preservando a carga completa como operação de backfill.
- [ ] Validar reconciliação dos dados coletados por loja e produto.
