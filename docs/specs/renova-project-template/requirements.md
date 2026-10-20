# SPEC: base independente de projetos Renova

- **Origem:** pedido do usuário registrado em [context.md](context.md); sem item externo obrigatório.
- **Pasta:** `docs/specs/renova-project-template/`.
- **Status:** base local, configurador/diagnóstico, referência e autenticação opcional local implementados e validados nos respectivos incrementos. Docker, publicação Railway e transporte Resend implementados; pilotos técnicos validados, incluindo convite e recuperação recebidos. T-030 permanece futuro.
- **Contexto:** [decisões e autorização](context.md).
- **Fontes:** [pesquisa de mercado](research.md).

## Problem Statement

O template atual orienta agentes, mas cada novo projeto ainda precisa montar
aplicação, banco, identidade visual e publicação. Isso exige conhecimento
implícito do mantenedor e permite configurações inseguras. A Renova precisa de
uma base independente, simples de iniciar, com escolhas pequenas e verificadas.

## Goals

- Criar um projeto local sem contas GitHub, Railway, ferramenta de tarefas ou serviços pagos.
- Oferecer perfis sem login e com login usando a mesma stack e identidade visual.
- Publicar no Railway corporativo sem misturar dados ou credenciais de projetos.
- Tornar erros comuns detectáveis por comandos, CI e testes de comportamento.
- Permitir evolução por alterações revisáveis, preservando customizações.

## Out of Scope

| Fora da primeira versão | Motivo |
| --- | --- |
| Portal web de plataforma, Backstage e marketplace de plugins | Operação adicional sem necessidade validada |
| Aplicação só frontend, sem Postgres, ou seleção de framework/ORM | A stack aprovada é fixa; reduz a matriz de suporte |
| SSO Renova, multiempresa, RBAC complexo, MFA e billing | Políticas de produto independentes; não são checkboxes vazios |
| CRUD anônimo aberto, uploads e formulários públicos de coleta | Exigem análise de abuso, dados e política própria |
| Email marketing, notificações de produto e escolha de vários provedores de login | O módulo inclui somente email transacional necessário à identidade |
| Copiar domínio, dados, credenciais e migrations BPO/CRM/Consulting | Projetos independentes |
| Remover auth automaticamente ou sincronizar código customizado à força | Pode expor/apagar dados e destruir trabalho |
| Garantia de segurança de futuras features ou certificação ASVS | A base oferece controles delimitados, não uma auditoria universal |
| Migração de infraestrutura existente e múltiplos provedores de deploy/email | A publicação implementada atende projetos novos no Railway, com Resend somente no perfil autenticado |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Independência e UI | Repositório, banco, sessões e segredos próprios; UI incorporada | Direção explícita do usuário | Sim |
| Opções iniciais | Dois perfis, sem login/com login; capacidades depois | Resposta explícita nesta sessão | Sim |
| Entrada de usuários | O responsável libera as contas; cadastro público fechado | Resposta explícita nesta sessão | Sim |
| CI | GitHub Actions em runners Blacksmith | Pedido explícito nesta sessão | Sim; CI executado nos dois repositórios do ensaio; novos clones precisam habilitar o App |
| Stack mínima | Vite/React, Fastify/tRPC, Kysely/Postgres e TypeScript; Node 24/pnpm fixados | Reuso da base Renova; evita escolhas técnicas iniciais | Implementada na base local |
| Destino inicial | Local; publicação Railway em etapa separada, com um app e Postgres privado | Reduz acesso/custo inicial e mantém recursos próprios por projeto | Setup e publicação implementados; evidência remota em [railway-validation.md](railway-validation.md) |
| Sem login | Exemplo público somente leitura; sem dependências, tabelas ou páginas de auth | Evita ensinar CRUD aberto que seria publicado por acidente | Implementado e validado no piloto público |
| Método de identidade local | Email/senha; responsável libera a conta por CLI, pessoa define senha por link | Funciona sem SSO e mantém cadastro público fechado | Implementado e validado no incremento local autorizado |
| Biblioteca de auth | Better Auth 1.7.11; uma implementação suportada | Integração Fastify/Postgres e sessões próprias por projeto | Adotada no incremento local; decisão em [auth-spike.md](auth-spike.md) |
| Email | Mailpit 1.31.6 isolado em loopback no local; Resend HTTPS no Railway | Uso local sem credenciais externas; remetente e chave próprios na produção | Transportes implementados; convite e recuperação recebidos no piloto |
| Limites da API | Valores explícitos do design, revisáveis por política e testes | Limites observáveis, não números atribuídos à OWASP | Implementados; verificação por requisito e perfil |
| Plataformas locais | macOS, Linux e Windows por WSL2, com Node/pnpm e Docker disponíveis | Comportamento verificável sem prometer suporte nativo Windows | Proposta |
| Gestão de tarefas | Pedido/spec local; ferramenta e ID externos opcionais, inclusive em PRs | Cada pessoa pode usar o template sem outra conta ou integração | Sim; remoção autorizada para este repo e seus clones |
| Governança e custo | Responsável, workspace, budget e disponibilidade de checks definidos antes de publicar | Não inferir destino corporativo nem gasto autorizado | Verificar para cada instalação; autorização dos pilotos não autoriza outros projetos |
| Atualização | Origem/versionamento e PRs revisados; sem atualização automática de código do produto | Preserva independência e WIP | Proposta |

A implementação local usa email/senha e Mailpit; não oferece escolha de provedor
a quem inicia o projeto. A publicação Railway usa `deploy:setup` e `deploy:prepare`
com IDs explícitos de projeto, ambiente e serviço, `deploy:apply` com confirmação
do projeto do plano e `deploy:verify` com a origem HTTPS. Setup também exige o ID
do Postgres. A integração Resend e a jornada
autenticada foram comprovadas no piloto isolado. Gates locais e CI não equivalem
a aceite humano nem autorizam publicação em outro destino.

## User Stories

### P1: começar um projeto com poucas decisões

Como criador, quero informar o nome e confirmar a configuração disponível para
começar a desenvolver sem montar o monorepo. Teste independente: clone limpo sem credenciais externas.

**Acceptance Criteria**:

1. WHEN um projeto é configurado THEN o configurador SHALL produzir workspaces frontend, backend, UI, migrations e tipos de banco independentes do repositório Renova de origem. (REQ-001)
2. WHEN o assistente inicia em clone novo THEN ele SHALL solicitar nome e perfil (sem login por padrão ou contas liberadas pelo responsável), apresentar resumo e pedir confirmação; em projeto já preparado SHALL preservar o perfil, sem perguntas sobre ORM, biblioteca ou destino ainda indisponível. (REQ-002)
3. IF o manifesto contém campo desconhecido, versão incompatível, nome inválido ou combinação não suportada THEN o configurador SHALL terminar com código 2 sem alterar arquivos. (REQ-003)
4. WHERE o destino é local THEN setup/dev SHALL funcionar sem credenciais GitHub, Railway, Sentry, email externo ou ferramenta de tarefas. (REQ-004)
5. WHEN setup é repetido com a mesma configuração THEN ele SHALL preservar arquivos customizados, segredos e dados já existentes. (REQ-005)
6. IF uma etapa falha ou é interrompida THEN setup SHALL informar a etapa e permitir retomá-la sem recriar recursos concluídos ou apagar dados. (REQ-006)
7. WHEN dois projetos locais são iniciados THEN cada projeto SHALL usar portas, banco e volume próprios, com serviços publicados somente em loopback. (REQ-007)
8. WHEN doctor executa THEN ele SHALL emitir diagnóstico sanitizado em texto ou JSON, com código 0 para pronto, 1 para falha e 2 para configuração inválida. (REQ-008)

### P1: desenvolver usando a identidade Renova

Como criador com IA, quero componentes prontos e exemplos para compor telas.
Teste independente: abrir catálogo e implementar uma alteração no exemplo.

**Acceptance Criteria**:

1. WHEN o frontend abre THEN ele SHALL carregar componentes, tokens e fontes Renova pelo pacote UI, sem depender do CSS de outro aplicativo. (REQ-009)
2. WHEN o catálogo é percorrido THEN ele SHALL demonstrar navegação, formulário, drawer e estados vazio/erro/carregando/sucesso em desktop e viewport de 390 px, com operação por teclado. (REQ-010)
3. WHEN uma IA recebe o clone e um pedido de feature THEN o repositório SHALL fornecer arquitetura, comandos, exemplos e critérios de verificação sem depender de memória ou skill pessoal do mantenedor; pedido/spec local SHALL bastar para iniciar e nenhum ID ou serviço externo de tarefas SHALL ser exigido, inclusive em PRs. (REQ-011)
4. WHEN a pessoa abre `/` no perfil público ou após validar a sessão no perfil com login THEN a aplicação SHALL mostrar um guia simples e substituível, com acesso à referência e orientação para criar o produto, sem catálogo, dados demonstrativos ou consulta à API de negócio; no perfil com login, uma sessão válida SHALL ser exigida antes de mostrar o guia. (REQ-041)
5. WHEN a pessoa abre `/referência` diretamente ou atualiza essa página THEN ela SHALL acessar a demonstração e os componentes Renova, com logo oficial incorporada, navegação acessível e layout responsivo; `/referencia` SHALL oferecer o mesmo acesso sem acento. (REQ-042)
6. WHEN humanos ou IA consultam as instruções THEN elas SHALL indicar a página inicial como área do produto e `/referência` como exemplos reutilizáveis, sem orientar implementação de funcionalidades dentro da demonstração. (REQ-043)

### P1: escolher acesso sem desativar proteções

Como criador, quero um perfil coerente com quem acessará o projeto. Teste
independente: gerar cada perfil e testar acesso diretamente na API.

**Acceptance Criteria**:

1. WHERE o perfil é sem login THEN a aplicação gerada SHALL expor apenas saúde, catálogo e consulta demonstrativa de dados públicos sintéticos, sem endpoints de escrita de negócio ou tabelas de identidade. (REQ-012)
2. IF uma operação de aplicação não declara política de acesso THEN seu registro SHALL ser recusado, sem inferir acesso público pela ausência de auth. (REQ-013)
3. WHERE o perfil é com login THEN o módulo SHALL oferecer provisionamento pelo responsável, ativação, login, logout e recuperação de acesso com cadastro público fechado. (REQ-014)
4. WHEN a sessão expira, ocorre logout ou a credencial é recuperada THEN o servidor SHALL rejeitar a sessão revogada em nova requisição protegida. (REQ-015)
5. WHERE uma operação acessa registro de usuário THEN o backend SHALL restringir a operação ao proprietário autenticado, inclusive em requisições com identificador de outro usuário. (REQ-016)
6. IF uma mutation com cookie recebe origem não autorizada ou prova CSRF inválida THEN o backend SHALL rejeitá-la com 403 antes de qualquer escrita. (REQ-017)
7. WHERE auth não foi selecionado THEN o projeto gerado SHALL omitir dependências runtime, páginas, endpoints, tabelas e segredos desse módulo, mantendo somente sua receita fora dos workspaces; a seleção local disponível SHALL ocorrer em clone novo antes do ambiente, e a adição a produto existente SHALL permanecer reservada a P2. (REQ-018)

### P1: manter os controles mínimos

Como responsável, quero limites verificáveis para prevenir erros recorrentes.
Teste independente: suíte negativa com entradas, alvos e configurações proibidos.

**Acceptance Criteria**:

1. IF entrada, conteúdo, tamanho ou frequência excede o contrato da API THEN ela SHALL rejeitar a chamada antes de executar o caso de uso, conforme limites e respostas definidos no design. (REQ-019)
2. WHEN ocorre erro na aplicação THEN a resposta e os logs SHALL excluir senha, cookie, token, corpo sensível, string de conexão e stack pública, preservando identificador de correlação. (REQ-020)
3. IF produção contém segredo ausente/default, origem curinga, cookie inseguro, fixture privada ou módulo inconsistente THEN o startup e o preflight SHALL recusar a configuração; no perfil autenticado Railway, a configuração SHALL exigir chave Resend, remetente válido e origem HTTPS canônica. (REQ-021)
4. WHEN migrations executam THEN o runner SHALL serializar aplicação e preservar histórico aplicado, sem reset, rollback destrutivo ou alteração silenciosa de migration existente. (REQ-022)
5. IF teste ou reset recebe alvo que não é banco descartável explicitamente permitido THEN o comando SHALL encerrar antes de conectar para escrita. (REQ-023)
6. WHEN um pacote, bundle, imagem, relatório ou arquivo versionado é produzido THEN o gate de entrega SHALL detectar e rejeitar os segredos sintéticos usados como sentinelas de vazamento. (REQ-024)

### P1: publicar no Railway sem reconstruir o projeto

Como responsável autorizado, quero conectar um projeto pronto à infraestrutura
Renova. Teste independente: plano sem mutações e depois piloto remoto isolado.

**Acceptance Criteria**:

1. WHEN prepare gera o plano Railway THEN ele SHALL apresentar workspace, projeto, ambiente, serviços, recursos, referências de variáveis e ações sem criar, alterar ou publicar recursos. (REQ-025)
2. IF apply não recebe destino explícito e aprovação correspondente ao plano atual, incluindo commit e conteúdo a publicar, THEN ele SHALL recusar qualquer mutação remota. (REQ-026)
3. WHEN uma aplicação é publicada THEN o navegador SHALL acessar API pela mesma origem do frontend, com frontend e API no mesmo serviço Fastify e Postgres acessível somente pela rede privada do ambiente. (REQ-027)
4. IF migration falha ou banco está indisponível THEN readiness SHALL indicar indisponibilidade sem divulgar detalhes, e a publicação não SHALL ser declarada concluída. (REQ-028)
5. WHEN publicação é verificada THEN o relatório SHALL separar imagem/healthcheck, jornada funcional, CI do commit, domínio/TLS e recuperação de dados, sem usar um deles como prova dos demais. (REQ-029)
6. WHEN um projeto local passa a usar Railway THEN a configuração SHALL preservar o código e os dados locais, criando configuração remota própria sem copiar automaticamente o banco local. (REQ-030)

### P1: confiar no processo de entrega

Como mantenedor, quero saber o que foi realmente verificado em cada perfil.
Teste independente: inserir falhas controladas em cópia descartável e observar rejeição.

**Acceptance Criteria**:

1. IF um check obrigatório do commit a publicar falha, cancela ou não executa THEN o gate de CI e o aplicador de deploy SHALL impedir sua publicação. (REQ-031)
2. WHEN o nome ou scope de um projeto muda THEN as regras de arquitetura SHALL continuar detectando imports proibidos e configuração fora das fronteiras declaradas. (REQ-032)
3. WHEN a versão da base é candidata a release THEN sua validação SHALL cobrir geração, build, banco, navegador e controles negativos dos dois perfis, além dos dois destinos na etapa remota autorizada. (REQ-033)
4. WHEN iniciantes realizam o piloto THEN o relatório SHALL registrar conclusão, tempo, intervenções e dificuldades de um técnico e de uma pessoa com IA, usando apenas instruções presentes no clone. (REQ-034)
5. WHEN um job de CI executa THEN ele SHALL usar runner Blacksmith habilitado para o repositório, sem fallback silencioso para outro executor. (REQ-039)
6. WHEN uma tarefa é marcada como concluída THEN o harness SHALL exigir evidência identificada no campo próprio, distinguindo teste automatizado de aceite humano ou prova de provedor. (REQ-040)

### P2: acrescentar login depois e manter a base

Como dono do projeto, quero evoluir sem perder customizações ou dados. Teste
independente: projeto sem login com mudanças locais e registros pré-existentes.

**Acceptance Criteria**:

1. WHEN adicionar auth é solicitado THEN o comando SHALL produzir plano/diff e exigir classificação das operações e dados existentes antes da aplicação, sem atribuir ownership automaticamente. (REQ-035)
2. IF remover auth ou aplicar receita sobrescreveria customização ou dependeria de exclusão de dados THEN o comando SHALL recusar a ação automática e apresentar os conflitos. (REQ-036)
3. WHEN o projeto é gerado ou uma capacidade é acrescentada THEN o manifesto SHALL registrar versões e origem dos componentes sem credenciais. (REQ-037)
4. WHEN uma correção da base ou UI é distribuída THEN o processo SHALL produzir alteração revisável com checks e preservar código do produto até a aprovação do responsável. (REQ-038)

P2 é o incremento seguinte à base publicável, não condição para demonstrar a
primeira fatia local. Não anunciar adição posterior automática antes de P2 passar.

## Edge Cases

| Caso | Resultado definido | Requisito |
| --- | --- | --- |
| Nome com caminho, comando de shell, Unicode confusável ou path traversal | Código 2; zero escrita | REQ-003 |
| Porta ocupada ou daemon Docker desligado | Diagnóstico e nova porta persistida após seleção; sem matar processo | REQ-007, REQ-008 |
| Interrupção entre criar Postgres e aplicar migrations | Retomar etapa faltante, conferir destino | REQ-006, REQ-022 |
| Provider de email indisponível | Resposta pública genérica; diagnóstico administrativo sanitizado sem afirmar envio; conta permanece pendente | REQ-014, REQ-019 |
| Dois pedidos simultâneos de migration | Um executa; outro espera de forma limitada ou falha sem aplicar em paralelo | REQ-022 |
| Alteração de plano, commit ou conteúdo entre prepare e apply | Invalidar aprovação anterior; CI verde de outro commit não serve | REQ-026, REQ-031 |
| Cancelamento de CI junto a outro workflow verde | Resultado obrigatório falha; não confiar só em Wait for CI | REQ-031 |
| Upgrade em arquivo customizado | Conflito explícito; nenhuma sobrescrita | REQ-036, REQ-038 |

## Varredura de dimensões implícitas

| Dimensão | Cobertura |
| --- | --- |
| Validação e limites | REQ-003, REQ-019 |
| Falha parcial | REQ-006, REQ-014, REQ-028 |
| Idempotência e retries | REQ-005, REQ-006, REQ-022, REQ-026 |
| Auth e abuso | REQ-012 a REQ-021 |
| Concorrência e ordem | REQ-022, REQ-031 |
| Ciclo de vida | REQ-015, REQ-022, REQ-036 |
| Observabilidade | REQ-008, REQ-020, REQ-029 |
| Falha externa | REQ-004, REQ-014, REQ-026, REQ-028 |
| Transições | REQ-026, REQ-030, REQ-035, REQ-036 |

## Requirement Traceability

A tabela relaciona implementações existentes e contratos de etapas futuras.
Paths sob `templates/modules/auth/files/` são a fonte dos testes materializados
no projeto autenticado. Existência do teste não comprova execução: status e
evidência ficam nas tarefas e nos relatórios de validação.

| REQ | Tarefas donas | Teste/comportamento dono |
| --- | --- | --- |
| REQ-001 | T-002, T-006, T-010, T-019 | Composição em `tests/integration/auth-composition.test.ts`; clones independentes pelo runner `scripts/project/test-profiles.mjs` |
| REQ-002 | T-001, T-012 | Perguntas e resumo em `tests/unit/setup-prompts.test.ts` |
| REQ-003 | T-001, T-011 | Manifesto inválido sem escrita em `tests/unit/project-config.test.ts` |
| REQ-004 | T-013, T-018 | Setup sem credenciais externas em `tests/integration/setup.test.ts` |
| REQ-005 | T-011, T-013 | Reexecução preserva arquivos/dados em `tests/integration/setup.test.ts` |
| REQ-006 | T-013, T-025 | Retomada local/remota sem duplicação em `tests/integration/setup.test.ts` e piloto |
| REQ-007 | T-004 | Dois projetos isolados em `tests/integration/local-db.test.ts` |
| REQ-008 | T-014 | Saída sanitizada e códigos em `tests/unit/doctor.test.ts` |
| REQ-009 | T-008 | Fontes/tokens sem CSS externo em `tests/e2e/design-system.spec.ts` |
| REQ-010 | T-009 | Responsividade/teclado em `tests/e2e/design-system.spec.ts` |
| REQ-011 | T-027, T-029 | Jornada inicial sem contexto pessoal e piloto humano |
| REQ-012 | T-007 | API pública sem writer em `tests/integration/public-profile.test.ts` |
| REQ-013 | T-003 | Registro sem política recusado em `tests/integration/security.test.ts` |
| REQ-014 | T-015, T-016, T-018, T-019 | Convite/ativação/recuperação em `templates/modules/auth/files/tests/e2e/auth.spec.ts` |
| REQ-015 | T-016 | Sessão revogada em `templates/modules/auth/files/tests/integration/auth.test.ts` |
| REQ-016 | T-017 | Dois usuários/ownership em `templates/modules/auth/files/tests/integration/owned-records.test.ts` |
| REQ-017 | T-003, T-016 | Origem e CSRF em `tests/integration/security.test.ts` |
| REQ-018 | T-011, T-019 | Perfil público sem auth em `tests/integration/public-profile.test.ts`; composição/ambientes em `tests/integration/auth-composition.test.ts` e runner dos perfis |
| REQ-019 | T-003, T-016 | Limites/paginação/abuso em `tests/integration/security.test.ts` |
| REQ-020 | T-003, T-014 | Redação de sentinelas em `tests/integration/security.test.ts` |
| REQ-021 | T-002, T-022 | Config insegura bloqueada em `tests/integration/backend-bootstrap.test.ts` e na versão do perfil autenticado; runtime em `tests/containers/runtime.test.mjs` |
| REQ-022 | T-005, T-023 | Corrida/checksum/falha de migration em `tests/integration/migrations.test.ts` e identidade/permissões remotas em `tests/integration/railway-database.test.ts` |
| REQ-023 | T-004 | Alvo indevido recusado antes da escrita em `tests/integration/local-db.test.ts` |
| REQ-024 | T-020, T-021 | Sentinelas não chegam ao bundle/imagem/artefatos |
| REQ-025 | T-024 | Prepare sem escrita remota em `tests/unit/deploy-release.test.ts` |
| REQ-026 | T-025 | Plano alterado, destino divergente, WIP e CI inválido recusados em `tests/unit/deploy-release.test.ts`; setup em `tests/unit/deploy-setup.test.ts` |
| REQ-027 | T-021, T-022 | Mesma origem, cookies e SPA em `tests/containers/runtime.test.mjs`; rede privada no piloto remoto |
| REQ-028 | T-005, T-023 | Banco indisponível e migration falha no smoke |
| REQ-029 | T-026 | Relatório separado de publicação e ensaio de recuperação |
| REQ-030 | T-024, T-026 | Publicação não modifica nem copia banco local |
| REQ-031 | T-020, T-025 | Falha/cancelamento/skip recusados no agregador e no deploy do commit |
| REQ-032 | T-010 | Regra funciona após renomear workspaces |
| REQ-033 | T-019, T-026 | Matriz dos perfis gerados e pilotos cloud |
| REQ-034 | T-029 | Registro de duas pessoas e intervenções |
| REQ-035 | T-030 | Plano de adição auth sem ownership implícito |
| REQ-036 | T-011, T-030 | Conflito/removal recusado preservando árvore e DB |
| REQ-037 | T-001, T-011 | Manifesto sem segredo com versão/origem |
| REQ-038 | T-028 | Procedimento de atualização ensaiado com conflito |
| REQ-039 | T-020 | Labels Blacksmith e execução real no repo autorizado, com cache frio |
| REQ-040 | T-000 | Parser exige campo de evidência correto e rejeita evidências ausentes/inadequadas |
| REQ-041 | T-031 | Guia inicial com acesso à referência, sem API/chunk da galeria no E2E |
| REQ-042 | T-031 | Rotas, refresh, logo oficial e 390 px no E2E |
| REQ-043 | T-031 | README, feature map e AGENTS do frontend distinguem produto/referência |

Cobertura planejada: 43 requisitos mapeados. Implementação local T-000–T-010
validada em [local-validation.md](local-validation.md); T-011–T-014 e T-031 em
[onboarding-validation.md](onboarding-validation.md). A tabela acima mantém
também contratos de etapas futuras. Autenticação local e geração dos perfis estão
implementadas e validadas em [auth-validation.md](auth-validation.md); não herdam o resultado dos
incrementos anteriores. Docker, CI e publicação Railway estão implementados; seus
resultados e pendências de validação remota ficam em
[railway-validation.md](railway-validation.md). Estado por tarefa em [tasks.md](tasks.md).

| Escopo verificado | Estado |
| --- | --- |
| REQ-007, REQ-009, REQ-010, REQ-012, REQ-013, REQ-023, REQ-032, REQ-040 | Verificado no incremento local, com assertions no relatório |
| REQ-001–003, REQ-017–022, REQ-024, REQ-028, REQ-031, REQ-037, REQ-039 | Evidências distribuídas entre os incrementos local, auth e Railway; consultar os relatórios para limites por ambiente |
| REQ-004–006, REQ-008, REQ-041–043 | Verificados no escopo public/local em onboarding-validation; operações remotas e auth continuam nas etapas próprias |
| REQ-014–016, REQ-018, REQ-033 no recorte local | Implementados e validados em T-015–T-019; evidências próprias em [auth-validation.md](auth-validation.md) |
| REQ-025–030 e REQ-033 no recorte remoto | Implementação e pilotos remotos validados no recorte do relatório Railway, com limites de backup gerenciado e aceite humano |
| Demais requisitos | Consultar tarefas e evidências próprias; T-030 e aceite humano não são concluídos pela implementação Railway |

## Success Criteria

- Clone limpo + setup + dev entrega uma aplicação; sem edição manual de placeholders.
- Os dois perfis passam build, integração e navegador com banco descartável.
- Os dois pilotos Railway passam somente após autorização própria da etapa remota.
- Falhas de acesso, configuração e CI são rejeitadas nos ensaios negativos.
- Piloto com um técnico e uma pessoa com IA conclui a primeira alteração sem
  instrução oral do mantenedor. Registrar tempo; alvo inicial de 15 minutos
  para abrir o app após pré-requisitos, medido separando downloads. Se não
  cumprir, revisar a experiência antes de ampliar opções.
