# Validação independente da base local

## Validation: PASS

**Verdict:** PASS

**Data:** 19/10/2026. **Escopo:** incremento local T-000–T-010, perfil público,
com configuração local do workflow Blacksmith antecipada. Este parecer não
conclui os 40 requisitos nem as 31 tarefas do plano.

O revisor não escreveu a implementação nem os testes. Reconstruiu os critérios
de [requirements.md](requirements.md), [design.md](design.md) e
[tasks.md](tasks.md), executou o gate completo e inseriu falhas somente em cópias
descartáveis. A implementação local passou; T-020 permanece parcial.

## Estado avaliado e gate

- Branch: `codex/renova-local-foundation`.
- Baseline Git: `d0c2db9440cdc9d1ed2befa0d3f282c865659f06`; implementação em WIP,
  sem commit, push ou publicação feitos pelo revisor.
- Snapshot: 193 arquivos versionados ou não ignorados. SHA-256 do mapa ordenado
  de hashes: `356ff8c1dd592f0b0f76961ad5d761eff48083883cede93587d6f0b34e3bd7f3`.
- Comando independente: `pnpm check:full`, saída **0**. Executa quick, build,
  integração e E2E, abrangendo as etapas dos gates Build, Integration e Browser.
- Log local: `/tmp/renova-local-full-validation.log`.
- Ambiente observado: macOS, Node `v24.21.0`, pnpm `10.33.4`, Docker `29.7.2`,
  Playwright `1.64.1`; Postgres `18-alpine` definido no Compose.

| Etapa | Resultado observado |
| --- | --- |
| Harness estrutural | 180 arquivos, 9 regras, nenhuma violação |
| Biome | 131 arquivos; nenhuma correção aplicada |
| Typecheck e build | Workspaces aplicáveis aprovados; frontend e backend compilados |
| Testes do harness | 37 aprovados |
| Unitários e propriedades | 31 aprovados |
| Componentes UI | 15 aprovados |
| Integração | 46 aprovados em 7 arquivos; Postgres descartável real |
| Navegador | 12 aprovados em Chromium, 1 worker, 0 retries; 10 da base e 2 do sample |
| Total | **141 aprovados, 0 reprovados, 0 ignorados** |

Houve somente avisos de `NO_COLOR`/`FORCE_COLOR` no navegador. Não houve redução
de timeout, relaxamento de asserção ou desativação de teste para obter o resultado.
O baseline contém 38 declarações de teste: 21 do harness, 15 do loop e 2 E2E.
A comparação dos nomes por AST não encontrou remoção. Os arquivos de teste
preexistentes de dinheiro, preview e navegador do sample não foram alterados.
O total executado atual cresceu em 103 casos em relação a essa base declarada.

## Matriz de critérios T-000–T-010

Cada linha liga um resultado preciso à asserção real. Os caminhos são relativos
à raiz do repositório. PASS refere-se à entrega local descrita na linha, sem
atribuir conclusão aos incrementos futuros do requisito associado.

| Tarefa e critério | Resultado esperado | Evidência e asserção | Parecer |
| --- | --- | --- | --- |
| T-000: campo correto e runners | Ownership não substitui Test; Vitest e Playwright aceitos | `scripts/harness/check.test.mjs:130` e `scripts/harness/check.test.mjs:138`: `violations.toEqual([])`; `scripts/harness/check.test.mjs:211`: referência em outra seção produz uma violação | PASS |
| T-000: evidência inexistente ou não executável | Arquivo/nome ausente, comentário, string e teste desabilitado recusados | `scripts/harness/check.test.mjs:143`, `scripts/harness/check.test.mjs:153`, `scripts/harness/check.test.mjs:169`, `scripts/harness/check.test.mjs:229`: mensagens `inexistente`/`não encontrado` | PASS |
| T-000: evidência externa | Teste não substitui aceite humano; tipo e relatório PASS exigidos | `scripts/harness/check.test.mjs:180`: `Evidence human`; `scripts/harness/check.test.mjs:199`: zero ou uma violação conforme tipo/veredito/referência | PASS |
| T-001: configuração canônica | Manifesto válido preservado, perfis/capacidades fechados e origem registrada | `tests/unit/project-config.test.ts:26`: `parseProjectConfig(valid).toEqual(valid)`; linhas 30 e 31 verificam `['auth']` e destino `railway` como dados de configuração | PASS |
| T-001: manifesto inválido sem I/O | Campos desconhecidos, versão, traversal, nomes e perfil inconsistente recusados | `tests/unit/project-config.test.ts:16`: `toThrow('campo desconhecido')`; linha 19: entrada preservada; linhas 47, 61, 67, 70 e 79: entradas inválidas lançam erro; parser em `scripts/project/config.mjs:21` não faz I/O | PASS |
| T-002: bootstrap e env | Saúde 200 com `{status:'ok'}`; configuração insegura recusada antes de listen | `tests/integration/backend-bootstrap.test.ts:15`, `tests/integration/backend-bootstrap.test.ts:18`, `tests/integration/backend-bootstrap.test.ts:45`: 200, servidor não escutando no teste e erro de configuração; build real no gate | PASS |
| T-003: política obrigatória | HTTP e tRPC sem política ou privados sem auth não registram | `tests/integration/security.test.ts:23`, `tests/integration/security.test.ts:26`, `tests/integration/security.test.ts:36`: `toThrow`/`rejects.toThrow` de política | PASS |
| T-003: origem e CSRF | Cookie com origem/prova inválidas recebe 403, sem executar mutation | `tests/integration/security.test.ts:57`: 403; linha 58: `writes.toBe(0)`; linhas 74, 100 e 102: prova inválida recusada e válida executada uma vez | PASS |
| T-003: tamanho e frequência | Corpo maior que 1 MiB: 413; após 120 chamadas/IP: 429 com Retry-After | `tests/integration/security.test.ts:114`: 413; linha 115: zero escritas; linhas 125, 131 e 132: primeiras 120 recebem 200, seguinte 429 e retry positivo | PASS |
| T-003: sanitização | Erros HTTP/tRPC e URL malformada não expõem sentinela/stack e mantêm correlação | `tests/integration/security.test.ts:158` até linha 164: 500 genérico, ID, ausência de stack/sentinela; `tests/integration/security.test.ts:211`: UUID; linha 212: corpo exato genérico; linha 213: sentinela ausente também nos logs | PASS |
| T-004: isolamento por projeto | Mesma slug em raízes diferentes gera DB/volume/namespace distintos; mesma raiz é estável | `tests/integration/local-db.test.ts:42` até linha 48: diferenças de identidade e `toEqual(first)` na repetição com `target:'local'`; linhas 56–58 também verificam dois bancos descartáveis reais e portas distintas | PASS |
| T-004: loopback e alvo proibido | Porta do Postgres em 127.0.0.1; URL remota/querystring/banco errado recusados | `tests/integration/local-db.test.ts:84`: saída exata `127.0.0.1:${port}`; linhas 78, 93 e 106: `toThrow('Alvo recusado')` | PASS |
| T-004: preservar vizinhos | Porta ocupada não encerra processo; limpeza recusa volume persistente | `tests/integration/local-db.test.ts:116`: recusa; linha 117: `server.listening.toBe(true)`; linha 146: limpeza local rejeitada | PASS |
| T-005: evolução e idempotência | Banco vazio aplica uma migration; repetição aplica zero; três registros sintéticos | `tests/integration/migrations.test.ts:33`: readiness falsa; linhas 34 e 38: `{applied:1/0,version:'001_public_example'}`; linha 42: readiness verdadeira; linha 46: três IDs exatos | PASS |
| T-005: corrida e integridade | Concorrência aplica uma vez; checksum ou histórico removido é recusado | `tests/integration/migrations.test.ts:70`: `[0,1]`; linha 75: `HISTORY_CHANGED`; linha 81: readiness falsa para manifesto alterado; linha 93: migration removida recusada | PASS |
| T-005: transação e indisponibilidade | Falha não deixa tabela/histórico parcial e readiness permanece falsa | `tests/integration/migrations.test.ts:107`: `MIGRATION_FAILED`; linha 112: readiness falsa; linha 119: tabelas nulas; linha 171: pool encerrado produz false | PASS |
| T-005: papéis e identidade | Runtime não escreve, não é superusuário; identidade errada bloqueia migration | `tests/integration/migrations.test.ts:55` e linha 56: código PostgreSQL `42501`; linha 129: `IDENTITY_MISMATCH`; `tests/integration/local-db.test.ts:131`: três privilégios false; linha 139: timeout `5s` | PASS |
| T-006: transporte real e contrato | Cliente recebe resposta HTTP real; chamada incompatível falha na compilação | `tests/integration/transport.test.ts:18` inicia socket local; linha 20: `{status:'ok'}`; linhas 51–53: compilação negativa com código 2 e mensagem `not assignable` | PASS |
| T-006: fronteira do bundle | Bundle não contém runtime/variáveis privadas selecionadas nem sourcemaps | `tests/integration/transport.test.ts:59` faz build real; linhas 67–76: ausência de cinco sentinelas/tokens e lista de mapas vazia; não equivale ao scanner universal futuro de REQ-024 | PASS |
| T-007: consulta pública | Somente os três registros sintéticos e campos públicos, com paginação | `tests/integration/public-profile.test.ts:41`: resposta exata; linhas 71, 75, 79 e 83: IDs/cursor/campos exatos | PASS |
| T-007: nenhuma escrita/identidade | POST/PUT/PATCH/DELETE recusados com 405; nenhum endpoint ou tabela de identidade | `tests/integration/public-profile.test.ts:113`: 405; linha 120: runtime recusa DML com `42501`; linha 126: endpoints 404; linha 131: única tabela pública `public_example_records` | PASS |
| T-008: UI independente e fontes | Pacote renderiza sem app; fontes locais Manrope/Playfair/Material Symbols | `packages/ui/src/components/app-sidebar.test.tsx:14` verifica markup isolado; `tests/e2e/design-system.spec.ts:27`, linha 34 e linha 37: famílias corretas e mesma origem; `packages/ui/src/globals.css:1` importa estilos/fontes locais | PASS |
| T-008: fronteiras e procedência | Sem dependência de apps/auth/domínio; origem e condições registradas | `scripts/harness/check.test.mjs:338`: import de app pelo pacote recusado; inspeção dos imports/exportações e manifesto do pacote; `packages/ui/NOTICE.md:5`–19 registra revisão e ausência de licença aberta da origem, sem conceder redistribuição pública | PASS documental local |
| T-009: dados e estados | Navegador mostra dados da API real, carregamento, recuperação e vazio explícito | `tests/e2e/local-foundation.spec.ts:15`, linha 17 e linha 19: origem/linhas/conteúdo reais; linhas 40–44: loading→dados; linhas 54–59: erro→dados após retry; linha 67: mensagem vazia com resposta declaradamente simulada | PASS |
| T-009: teclado, foco e painel | Teclado seleciona controles; drawer contém foco e o devolve ao fechar | `tests/e2e/design-system.spec.ts:45`, linha 60 e linha 64: foco/checkbox/switch; linhas 77–84: foco interno, ciclo, Esc e retorno ao trigger | PASS |
| T-009: 390 px e conteúdo público | Sem overflow horizontal; drawer cabe no viewport; sem identidade fictícia | `tests/e2e/design-system.spec.ts:95`, linha 102 e linha 108: largura ≤390; `packages/ui/src/components/app-sidebar.test.tsx:15`–18: sem footer/contexto/pessoa/cargo herdados; inspeção visual dos screenshots do gate | PASS |
| T-010: arquitetura após renomear | Scope renomeado não evita regra; runtime/backend/DB/Node continuam proibidos no frontend | `scripts/harness/check.test.mjs:338`, linha 355 e linha 373: 1/2/4 violações; linha 381: duas violações com crases; linha 391: import type privado recusado | PASS |
| T-010: gate executável | Integração realmente coletada; falha impede sucesso e próximos passos; não há skip E2E oculto | `tests/unit/gate-contract.test.ts:39`: sequência build/integration/e2e mesmo com variável antiga; linhas 55–57 e 62–63: falhas propagadas; gate real coletou 46 integrações e 12 E2E | PASS |

T-000 e T-001 já estavam `done` no snapshot. T-002–T-010 estavam implementados
com status aguardando o fechamento do revisor. O integrador atualiza os estados
documentais após este parecer; o revisor não editou tarefas ou requisitos.

## Provas complementares

- `tests/integration/public-profile.test.ts:97` exige 400 para limite 101, zero,
  fracionário, campo desconhecido e cursor de SQL; linha 102 mantém três linhas.
- `tests/integration/dev-lifecycle.test.ts:117` exige o exit code esperado;
  linhas 121–122 comprovam processos e portas fechados após SIGINT/SIGTERM ou
  falha do wrapper. Linhas 172–173 comprovam que outro projeto sintético permanece
  ativo quando um grupo resistente precisa de encerramento forçado.
- As capturas `renova-overview-desktop.png` e `renova-gallery-mobile.png`, geradas
  no `test-results/` deste Full, foram inspecionadas pelo revisor. Textos, cartões
  e controles permanecem legíveis no desktop e em 390 px. Isso é inspeção do
  agente, não aceite de um participante humano.
- O principal informou um smoke adicional do backend compilado, com health/ready/
  consulta 200 e SIGTERM encerrando a porta. É prova do autor, complementar; não
  foi incluída nos 141 testes nem usada para substituir a execução independente.

## Sensor de discriminação

Após o Full verde, foram copiados os 193 arquivos não ignorados para um diretório
temporário. Apenas `node_modules` foi reutilizado por symlinks. As três mutações
atingiram código copiado; os testes originais foram copiados sem alteração. Cada
mutação foi descartada antes da seguinte. Os testes de migration criaram e
removeram seus próprios bancos `target:'test'`.

| ID | Falha inserida na cópia | Comando no scratch | Falha observada | Resultado |
| --- | --- | --- | --- | --- |
| M1 | `packages/dbmigrator/src/index.ts:53`: comparação de checksum substituída por true | `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/migrations.test.ts` | `tests/integration/migrations.test.ts:75` recebeu sucesso ao esperar `HISTORY_CHANGED`; 1 reprovado, 7 aprovados; exit 1 | Detectada |
| M2 | `apps/backend/src/server/security.ts:31`: desativada a rejeição de CSRF inválido | `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/security.test.ts` | Linha 57 recebeu 200 em vez de 403; mais duas asserções de rejeição falharam; 3 reprovados, 8 aprovados; exit 1 | Detectada |
| M3 | `scripts/harness/rules/spec-tests.mjs:74`: desativada a exigência de declaração real do teste | `pnpm exec vitest run --config vitest.harness.config.ts scripts/harness/check.test.mjs` | Linhas 153, 169 e 229 deixaram de receber violação esperada; 3 reprovados, 34 aprovados; exit 1 | Detectada |

**Resultado do sensor:** 3 inseridas, 3 detectadas, 0 sobreviventes. As falhas
foram asserções de comportamento, não erros de importação, sintaxe ou ambiente.
Não foi uma campanha exaustiva de mutation testing.

Logs locais: `/tmp/renova-local-sensor-M1.log`,
`/tmp/renova-local-sensor-M2.log`, `/tmp/renova-local-sensor-M3.log`.
Resumo: `/tmp/renova-local-sensor-results.json`.

O scratch foi removido. `git status --porcelain=v1` e os hashes dos 193 arquivos
permaneceram idênticos antes/depois do Full e antes/depois do sensor. Não houve
stash, reset ou mutação da árvore real. Este relatório foi criado somente depois
da comparação. Os logs em `/tmp` são diagnósticos locais transitórios; o registro
persistente da verificação é este documento.

## Achados tratados e qualidade

Antes do parecer, o revisor reproduziu e encaminhou: URL malformada refletindo
query sensível, comentário/string aceito como evidência de teste e import estático
com crases escapando do harness. As correções possuem regressões em
`tests/integration/security.test.ts:194`, `scripts/harness/check.test.mjs:158` e
`scripts/harness/check.test.mjs:376`. A lacuna do ramo local por raiz recebeu a
asserção em `tests/integration/local-db.test.ts:28`.

Não há achado aberto impeditivo dentro dos critérios locais acima. A revisão
seguiu `AGENTS.md`, `scripts/harness/AGENTS.md`, `packages/ui/AGENTS.md` e
`docs/process/testing-strategy.md`: fronteiras explícitas, ausência de segredo
novo versionado, escopo sem auth/domínio de cliente, erros sanitizados, teste
negativo e preservação de WIP. O sensor mostrou discriminação dos três controles
selecionados. Não houve edição concorrente do código durante a execução final.

## Limites e requisitos ainda parciais

| Área | O que está provado nesta entrega | O que permanece pendente |
| --- | --- | --- |
| REQ-001/002/003/037 | Workspaces locais, parser puro fechado e origem no manifesto | Gerador, wizard de três escolhas, aplicação de diff e código 2 da CLI; T-011/T-012 |
| REQ-004/005/006/008/011 | Dev local, comandos executados, credenciais isoladas e encerramento seguro | Setup completo retomável, doctor, conflitos de geração e piloto sem histórico; T-011–T-014/T-027/T-029 |
| REQ-007 | Identidade por raiz, bancos/volumes distintos, loopback e proteção da porta ocupada | Ensaio completo com dois clones frontend/backend iniciados simultaneamente não foi realizado; portas são verificadas na preparação, não reservadas indefinidamente |
| REQ-009/010 | Pacote e jornada local em Chromium desktop/390 px | Aceite visual humano; outros navegadores e plataformas não foram executados |
| REQ-012/013/018 | Perfil público atual sem operações de negócio de escrita ou tabelas de identidade; política obrigatória | Geração dos dois perfis e ausência de auth em artefato gerado independente; T-019 |
| REQ-014/015/016/017 | Guard comum de origem/CSRF testado com mutations e cookies sintéticos | Login, biblioteca, sessões, ownership e handler real de auth; T-015–T-018 |
| REQ-019/020/021 | Limites/sanitização locais e env do backend validados | Limites de login, cookies, fixtures privadas, preflight e runtime de produção dependem das próximas etapas |
| REQ-022/023/028 | Migration local transacional, checksum/lock, alvo protegido e readiness real | Migration de publicação, readiness durante release e política de recuperação remota |
| REQ-024/027 | Bundle inspecionado e navegador local usa `/api` na mesma origem | Scanner de sentinelas em todos os artefatos, imagens e proxy de produção; T-020–T-023 |
| REQ-031/032/039/040 | Gate local bloqueante, contratos do YAML Blacksmith, arquitetura e evidência | Habilitação do App, proteção de branch, execução no SHA remoto e aplicador de publicação; T-020 segue parcial |
| REQ-025/026/029/030/033–036/038 | Não avaliados como concluídos | Railway, backup/restore, dois perfis gerados, piloto humano e atualização/adição de auth |

O workflow local exige labels Blacksmith em `tests/unit/ci-contract.test.ts:29`,
recusa resultados incompletos com exit 1 na linha 16 e aceita somente ambos os
jobs em sucesso na linha 23. Isso não comprova execução em Blacksmith ou GitHub.
Nenhuma chamada de provider, publicação, dados reais de negócio ou aceite humano
fez parte desta revisão. Não foi feita instalação em uma máquina limpa nem
validação em Linux/WSL2. A licença aberta da origem visual não foi presumida.

**Conclusão de escopo:** base local T-000–T-010 aprovada pelos critérios acima.
A aprovação não autoriza nem comprova release, autenticação ou operação remota.
