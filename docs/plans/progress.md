# Progresso das sessões

Cada sessão longa acrescenta um bloco no topo. Não apague histórico.

## 2026-10-19 — autenticação opcional validada localmente

- CI da main `e085504` confirmado verde: [run 39341572792](https://github.com/Renova-AI-Tech/renova-template/actions/runs/39341572792).
- Usuário autorizou seguir com contas liberadas pelo responsável e sem cadastro
  público, preservando o perfil sem login e validando cada etapa.
- Recorte: perfil autenticado em clone novo, caixa de email local, ativação,
  sessão, recuperação e exemplo privado por proprietário. A publicação Railway
  e a adição automática a produto já personalizado continuam etapas separadas.
- `pnpm test:profiles` verde: público 230 testes, autenticado 254, incluindo
  22 E2E no perfil com login. Revisão independente sem bloqueadores após correções.
- Setup/doctor/convite real em cópia nova e repetição preservando customização,
  banco e segredos. [Evidências e limites](../specs/renova-project-template/auth-validation.md).
- A PR e o CI remoto deste incremento serão conferidos no commit publicado;
  o resultado local não é apresentado como validação Railway ou aceite humano.
- A revisão da PR #3 acrescentou correções e regressões para email excessivo,
  retomada da escolha de perfil, confirmação de salvamento e paginação concorrente.
  Os resultados finais ficam vinculados ao commit validado pelo Blacksmith na PR.

## 2026-10-19 — merge e clone de outro projeto

- PR #1 mergeada em `5a6ea26`; template privado habilitado no GitHub.
  CI Blacksmith verde tanto na PR quanto na main, 212 testes.
- Clone real do remoto, agente em contexto novo e setup interativo com nome/confirmar.
  Catálogo independente com nova tabela, API tipada, busca/filtro e DS reutilizado.
- Full do catálogo: **220/220**; repetição do setup preservou código, credenciais e
  dados. Ambiente original preservado. [Evidências](../specs/renova-project-template/simplification-validation.md).
- README esclarece adaptação dos contratos de exemplo e distingue plano de origem
  do backlog do novo produto. Nenhum gerador, regra ou dependência adicional.
- Ensaio de agente em macOS com ferramentas instaladas; autenticação, Railway,
  CI em outro repositório e aceite humano não foram executados.

## 2026-10-19 — revisão da PR e gate final

- PR #1 aberta; Blacksmith aprovou o commit `b26438c` (205 testes).
- Revisão remota gerou correções pequenas no DS: largura da sidebar sem provider
  e fallback da legenda. Origem divergente em escrita sem cookie passou a ser recusada;
  chamadas públicas sem Origin e proteção CSRF com cookie mantidas.
- Revisão independente sem achados; largura real conferida em navegador.
  Full após correções: **212/212**, lint/types/build verdes.
- Testes de migrations acompanham quantidade/versão do manifesto; uma nova tabela
  não deve exigir alterar expectativas fixas do motor. Proteções preservadas.
- CI do commit final será reconferido antes do merge; clone de ensaio vem depois.

## 2026-10-19 — simplificação e preparação da PR

- Configurador pede somente nome e confirmação; JSON mantém rejeição de opções
  futuras. Mensagens de recuperação encaminham a setup/doctor.
- Nome curto, numérico, reservado ou longo gera identificador seguro automaticamente;
  correção encontrada pela revisão independente e coberta por testes.
- Exemplo financeiro retirado com seus workspaces, porta, specs e testes exclusivos.
  Lista de features inicia vazia por autorização explícita, sem herdar passes do sample.
  Propriedades agora exercitam o manifesto real; gates e proteções foram mantidos.
- Readiness verifica migrations sem depender de tabela demonstrativa. Regressão
  com migration de remoção passou em Postgres real, junto das negativas de segurança.
- Full local: **191/191** antes do ajuste de nomes; depois configuração/prompts
  **28/28** e Quick **102/102**, sem falhas. Revisão independente liberou as correções.
  [Evidências e limites](../specs/renova-project-template/simplification-validation.md).
- Entrega corrigiu symlink Claude, CODEOWNERS de exemplo, README da integração,
  script morto e placeholder sem uso; scan não encontrou segredos ou estado local
  nos arquivos candidatos. Artefatos de build/testes permanecem ignorados.
- Usuário autorizou commit/push/PR/merge após gates e um clone de ensaio posterior.
  CI remoto será conferido no commit da PR. Sem autenticação ou deploy Railway.

## 2026-10-19 — desenvolvimento sem ferramenta de tarefas obrigatória

- Usuário autorizou remover Linear deste repositório e dos clones. Pedido ou spec
  local orienta o trabalho; branch e PR têm nomes descritivos, sem ID obrigatório.
  Esta decisão substitui as notas históricas abaixo sobre vínculo Linear pendente.
- Removidos o servidor MCP nos dois arquivos de configuração, o manual específico
  e os placeholders de time/item. `develop-feature` substitui `feature-from-issue`;
  README, AGENTS, processos, templates, plano e script de início foram alinhados.
- Harness, proteções, testes e workflow Blacksmith preservados. Nenhum outro
  ponto da auditoria de simplicidade foi implementado nesta alteração.
- `pnpm check:quick` passou: links/índice, lint, tipos e 101 testes (37 harness,
  49 unit/property, 15 UI). MCPs equivalentes e apenas com Playwright; `bash -n`
  no init e `git diff --check` passaram. Busca sem credencial, endpoint ou placeholder
  ativo do serviço removido. As menções anteriores são histórico, não pré-requisito.
- Frontmatter/nome/descrição das duas skills editadas validados com o parser YAML
  já instalado no repo. O validador Python da skill não executou por falta de PyYAML;
  nenhuma dependência foi instalada para essa checagem.
- Revisão independente sem achados: conferiu o fluxo sem tracker e 106 links locais
  em 21 documentos, sem links quebrados ou exigência externa ativa.
- Não executados: integração, navegador, setup completo ou CI remoto, pois a mudança
  limita-se a instruções, configuração MCP e mensagem de início. Sem commit/push/deploy.

## 2026-10-19 — guia inicial substituível

- A pedido do usuário, `/` agora começa com um guia curto: explorar a referência,
  explicar a ideia para a IA e substituir o guia pela primeira tela do produto.
- Logo oficial, exemplo de pedido para IA e ajuda de ambiente recolhida; sem
  carregar o catálogo de componentes nem consultar a API demonstrativa.
- README, AGENTS, arquitetura, feature map e spec atualizados para humanos e IA.
  O contrato anterior de raiz vazia permanece apenas nos registros históricos.
- `pnpm check:quick`, build do frontend e **16/16 E2E** passaram. Imagens de
  1440 e 390 px inspecionadas; navegação, ausência de overflow e abertura da ajuda
  pelo teclado verificadas. React Doctor: **100/100**, sem diagnósticos.
- Revisão independente somente leitura não encontrou barreira concreta.
  O Full anterior de 204 testes não foi repetido para este ajuste de interface.
  Autenticação, Railway, CI remoto e aceite humano continuam pendentes.
- Sem commit, push ou deploy; WIP e ambiente local preservados.

## 2026-10-19 — configurador, diagnóstico e referência

- T-011–T-014 e T-031 concluídos na mesma branch local, preservando WIP anterior.
- `pnpm run setup`: três escolhas, plano sem escrita, JSON para IA, preparação
  retomável com lockfile, Postgres e migrations. Só sem login/local disponíveis.
- `pnpm run doctor`: diagnóstico sanitizado somente leitura, códigos 0/1/2,
  próximos passos e distinção entre local pronto e CI/Railway não verificados.
- `/` livre para o produto; `/referência` e `/referencia` reúnem exemplos, galeria,
  logo oficial e sidebar refinada. README/AGENTS/feature map orientam humanos e IA.
- Full independente: **204 testes** (37 harness, 49 loop, 15 UI, 87 integração,
  16 E2E), sem falhas/skips. Sensor: **3/3 mortos**, árvore e ambiente preservados.
  [Relatório com assertions](../specs/renova-project-template/onboarding-validation.md).
- Clone limpo exercitado em PTY com Node/pnpm/Docker reais; repetição declarativa
  preservou código, lockfile, credenciais e identidade. Doctor passou com serviços
  ligados e desligados. Clone e recursos Docker exclusivos do ensaio foram removidos.
- Corrigidos proxy presumido pelo diagnóstico e guard CLI por alias de diretório,
  com regressões reais. React Doctor frontend 100/100, sem diagnósticos.
- Um rerun concorrente do subagente teve timeout no bootstrap; não mudou timeout
  nem gate. Full independente posterior passou; recursos descartáveis foram limpos.
- Auth, CI remoto Blacksmith, Railway e aceite humano não executados. Sem commit,
  push ou deploy. `feature-list.json` preservado; vínculo Linear continua pendente.

## 2026-10-19 — base local Renova implementada

- Plano aprovado; incremento T-000–T-010 em `codex/renova-local-foundation`,
  base `d0c2db9`, preservando a documentação anterior e o sample.
- Entregues Vite/React, Fastify/tRPC, Postgres isolado, migrations com integridade,
  papéis separados e perfil público somente leitura. 22 componentes do DS Renova,
  fontes locais, shell responsivo e galeria integrada.
- `pnpm check:full` independente: 141 testes, build/lint/types verdes, sem skip.
  Sensor isolado: 3/3 falhas detectadas. [Relatório](../specs/renova-project-template/local-validation.md).
- Correções encontradas na revisão ganharam regressões: erro de URL malformada,
  falsa evidência em comentário/string, import dinâmico em template literal e
  encerramento de processos de desenvolvimento/teste.
- Workflow Blacksmith configurado e testado localmente, sem execução remota.
- DB local deste projeto permanece preparado; `pnpm dev` abre a base. Testes
  descartáveis não reutilizam esse banco. Guia e comandos no README/operations.
- Próximas etapas: configurador/doctor, perfil autenticado e geração; depois
  containers, piloto CI/Railway e aceite humano nas condições do plano.
- Sem commit, push, PR, deploy ou dados remotos. Vínculo Linear permanece pendente
  para publicação. `feature-list.json` preservado, sem reaproveitar passes do sample.

## 2026-10-19 — proposta da base Renova

- Criados [requisitos](../specs/renova-project-template/requirements.md),
  [pesquisa](../specs/renova-project-template/research.md),
  [contexto](../specs/renova-project-template/context.md),
  [design](../specs/renova-project-template/design.md) e
  [plano](../specs/renova-project-template/tasks.md).
- Usuário confirmou dois perfis prontos sem login/com login, com evolução posterior.
- Confirmados Blacksmith no CI e contas liberadas pelo responsável, sem cadastro público.
- Branch documental local `codex/renova-template-spec`, base `d0c2db9`.
  Sem item remoto criado, implementação, commit, push ou deploy.
- Resultado documental e limites em [review](../specs/renova-project-template/review.md).
- `feature-list.json` preservado: os passes existentes pertencem ao sample,
  não comprovam a proposta nova.

## 2026-10-15 — template

- Layout alinhado ao padrão de mercado (AGENTS.md mapa, docs/ indexado, 3 skills, check-quick/full).
- Sample money + UI 43123 verdes em `test:loop` / `check:quick`.
- E2E existe; não entra no pre-push.

## 2026-10-20 — Railway e convites externos em validação

- Incremento autorizado em `codex/railway-email`, a partir de main `4ec710c`.
- Container único Vite/Fastify, Postgres privado, bootstrap com papéis separados,
  plano IaC nativo e publicação de commit aprovado no CI. Perfil público sem email.
- Transporte Resend no perfil com login; Mailpit local preservado. Revisões frescas
  corrigiram identidade runtime, origem com ponto final e senhas em SQL/logs.
- `pnpm check:quick` passou; matriz completa dos perfis/containers em execução.
- Piloto criado isoladamente no Railway; bootstrap e credenciais de ambos os
  papéis comprovados pela rede privada. Nenhuma alteração no projeto Renova existente.
- Resend/DNS e destinatário real aguardam definição; sem prova de entrega externa,
  sem merge/liberação. [Evidência por camada](../specs/renova-project-template/railway-validation.md).

## 2026-10-20 — pilotos Railway e email comprovados

- Dois projetos independentes no Railway: público e autenticado, com Postgres próprio.
- CI Blacksmith passou no template `775a4ae` e no clone autenticado `cd9a097`.
  Saúde/readiness, UI pública, IP e restauração lógica do banco passaram.
- Resend correto confirmado na equipe renovagp; chave de envio restrita configurada
  somente no piloto autorizado, sem alterar DNS ou envios existentes.
- Convite e recuperação recebidos na caixa de entrada; ativação, login, persistência,
  logout, troca de senha, revogação e uso único passaram na API/UI remotas.
- Ensaio encontrou dois defeitos reais: fonte inline bloqueada pela CSP e cópia do
  pacote auth sem dependências no comando remoto. Ambos corrigidos com regressões;
  política de segurança preservada e nova execução aprovada.
- Revisão fresca confirmou a causa do import e a correção. Relato, comandos e
  limites em [railway-validation](../specs/renova-project-template/railway-validation.md).
- Backup gerenciado/PITR, aceite humano e evolução de produto existente continuam
  separados. Nenhum banco local ou serviço da aplicação Renova existente foi alterado.

## 2026-10-20 — encerramento dos pilotos descartáveis

- Responsável autorizou excluir os dois projetos Railway, o repositório do clone
  autenticado e sua chave exclusiva de envio, preservando o template e a Renova.
- Railway aceitou as duas exclusões: quatro serviços offline, sem deployments
  ativos, e ambas as origens HTTP 404. Remoção definitiva agendada pelo provedor
  para 22/10/2026, às 01h28–01h29 de Brasília; ainda não observada.
- Chave `renova-email-piloto` revogada no Resend; `Onboarding` e domínio preservados.
- Repositório piloto excluído após confirmação de identidade pelo responsável;
  sucesso na interface e HTTP 404 na API autenticada do GitHub.
- Revisão independente não encontrou dependências do template nesses recursos.
  Relatório preserva a prova histórica e identifica as origens como desativadas.
- `pnpm check:quick` e `git diff --check` passaram; revisão independente aprovada.
  Nenhum banco local foi modificado.
  [Registro](../specs/renova-project-template/railway-validation.md).
