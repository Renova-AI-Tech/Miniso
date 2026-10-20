# Validation: configurador local e referência — PASS

O incremento T-011–T-014 e T-031 passou na verificação independente local.
`pnpm check:full` aprovou 204 testes, sem falhas ou skips. Os três defeitos
inseridos na cópia descartável foram detectados. Este veredito cobre o perfil
`public` com destino `local`; não conclui autenticação, Railway ou aceite humano.

- Data: 19/10/2026.
- Verificador: subagente independente, distinto dos autores.
- Contrato: [requirements.md](requirements.md), [design.md](design.md),
  [tasks.md](tasks.md) e [context.md](context.md).
- Intervalo revisado: snapshot anterior de 194 arquivos em
  `/var/folders/m3/3j_ygv4j3r3gw8qgprvlnb200000gn/T/renova-config-baseline-xdiawsc2/`
  até a árvore de trabalho congelada para esta validação. `HEAD d0c2db9` contém
  apenas o commit inicial e não foi usado como base deste incremento.
- Branch observada: `codex/renova-local-foundation`. WIP preservado, sem commit,
  push, reset ou stash pelo verificador.
- Orientações aplicadas: `AGENTS.md`, `apps/frontend/AGENTS.md`,
  `.agents/skills/verify-app/SKILL.md`, TLC `validate.md` e `coding-principles.md`.

## Tarefas verificadas

| Tarefa | Resultado | Evidência principal |
| --- | --- | --- |
| T-011 | Verificada | 15 integrações do gerador: plano, conflito, idempotência, origem, links e interrupções |
| T-012 | Verificada | 8 unitários de prompts: três escolhas, equivalência JSON, resumo e ausência de TTY |
| T-013 | Verificada | 8 integrações de setup e 12 de recuperação das credenciais; dado persistente preservado em Postgres real |
| T-014 | Verificada | 10 unitários e 6 integrações de doctor; códigos, HTTP real, CLI por alias e consultas sem escrita |
| T-031 | Verificada | 4 E2E novos de rotas/marca; 10 jornadas anteriores da base preservadas no novo endereço |

## Critérios ligados aos resultados da spec

Os 15 requisitos abaixo foram conferidos no recorte autorizado. As linhas citadas
contêm as assertions observadas, salvo REQ-043, cuja evidência é a revisão
documental prevista no gate Docs. Não há requisito sem evidência nesse recorte.

| Requisito e resultado esperado | Evidência e assertion | Resultado |
| --- | --- | --- |
| REQ-002: somente nome, perfil e destino; mesmo motor para humano/JSON; resumo antes do aceite | `tests/unit/setup-prompts.test.ts:49`: `questions` tem comprimento 3; linhas 53, 66–67 excluem escolhas técnicas e comparam configuração e plano; linhas 188–197 verificam resumo e confirmação negativa por padrão | PASS |
| REQ-003: inválido ou indisponível retorna 2 sem escrita | `tests/integration/profile-generation.test.ts:110`: rejeita com `{ code: 2 }`; linha 112 compara snapshot completo. `tests/unit/project-config.test.ts:21` recusa versão incompatível. `tests/integration/setup.test.ts:159` exige 2 sem TTY; linhas 166–168 recusam auth/Railway e preservam arquivos | PASS |
| REQ-004: preparação pública local não exige contas externas | `tests/integration/setup.test.ts:110`: retomada conclui com 0 em fixture local; linhas 111–116 consultam dado real e preservam arquivos. Revisão de `scripts/project/setup.mjs:41` e dos serviços padrão confirma somente Node, pnpm, Docker, instalação do lockfile e migrations locais | PASS local |
| REQ-005: repetir preserva customizações, segredo e dados | `tests/integration/profile-generation.test.ts:95`: `changedFiles` vazio e snapshot igual na linha 97. `tests/integration/setup.test.ts:111`: registro `user data survives` permanece; linhas 114–116 comparam env, identidade e produto | PASS |
| REQ-006: falha informa etapa/ação e permite retomada sem apagar dados | `tests/integration/setup.test.ts:182`: status failed, exit 1 e etapa prerequisites; linha 188 exige comando de retomada. `tests/integration/profile-generation.test.ts:225` e 245 causam SIGKILL; linhas 236 e 251 exigem somente reconciliação ou nenhuma alteração. `tests/integration/database-setup-recovery.test.ts:274` compara hash após processo morto | PASS |
| REQ-008: doctor sanitizado, texto/JSON e códigos 0/1/2, somente leitura | `tests/unit/doctor.test.ts:52`, 38 e 88 exigem respectivamente 0, 1 e 2. Linhas 181–197 analisam JSON único e argumento inválido. `tests/integration/doctor.test.ts:77` compara bytes, modos e datas; linha 210 compara registros e histórico do DB | PASS |
| REQ-009: componentes, tokens e fontes locais do pacote UI | `apps/frontend/src/main.tsx:3` importa `@renova/ui/globals.css`. `tests/e2e/design-system.spec.ts:27` e 28 exigem Manrope/Playfair; linhas 34–38 conferem famílias carregadas, mesma origem e ausência de violações CSP | PASS |
| REQ-010: navegação, formulário, drawer, estados e responsividade/teclado | `tests/e2e/design-system.spec.ts:45`, 60, 67, 77–84 e 95 verificam foco, interação, formulário, contenção/restauração de foco e largura. `tests/e2e/local-foundation.spec.ts:40`, 54, 58 e 67 verificam carregamento, erro, recuperação real e vazio explicitamente simulado | PASS |
| REQ-018: perfil público sem módulo runtime de identidade | `tests/integration/public-profile.test.ts:126` exige 404 nos endpoints de login/cadastro/mutação; linha 131 exige apenas a tabela pública. `tests/e2e/local-foundation.spec.ts:96` exige zero controles de conta. Revisão dos manifests frontend/backend confirma ausência de dependências de auth; instalação posterior continua futura | PASS no perfil público |
| REQ-020: diagnóstico não divulga senha, URL de conexão, corpo remoto ou erro bruto | `tests/unit/doctor.test.ts:44` a 46 excluem sentinela e `postgresql://` de texto/JSON; `tests/integration/doctor.test.ts:98` e 144 excluem corpo e localização recebidos. `tests/integration/setup.test.ts:187` exclui sentinela do erro de pré-requisito | PASS local |
| REQ-036: conflitos e remoção de auth não são aplicados automaticamente | `tests/integration/profile-generation.test.ts:80` e 84 exigem conflito e código 2, com snapshot igual na linha 85; linhas 213–214 recusam converter manifesto autenticado para público e preservam a árvore | PASS no configurador |
| REQ-037: manifesto registra origem/versões sem credenciais | `tests/unit/project-config.test.ts:26` exige configuração canônica igual à entrada válida; linha 67 recusa segredo aninhado. `tests/integration/profile-generation.test.ts:72` compara manifesto final completo e linhas 108–112 recusam trocar origem sem escrita | PASS no manifesto |
| REQ-041: `/` fica vazio, sem catálogo, chamada demonstrativa ou carga da referência | `tests/e2e/reference-routing.spec.ts:12` exige main vazio; linha 13 exige body sem texto; linha 16 exige zero requests API/ReferencePage/ReferenceGallery; linha 17 exige zero elementos de demonstração | PASS |
| REQ-042: referência/alias funcionam direto e após refresh, com logo oficial, teclado e 390 px | `tests/e2e/reference-routing.spec.ts:23` percorre Unicode, alias, encoding e normalização; linhas 25–30 conferem conteúdo após navegação/refresh. Linha 57 exige SHA-256 oficial; linhas 73–78 exigem dimensões/proporção e ausência de overflow. Teclado/foco em `tests/e2e/design-system.spec.ts:45` e 84 | PASS |
| REQ-043: instruções distinguem produto e exemplos reutilizáveis | Revisão de `README.md:62` e `apps/frontend/AGENTS.md:3`: ambos apontam HomePage para produto e ReferencePage/ReferenceGallery para consulta; instruem explicitamente a não desenvolver o produto dentro da referência. `docs/process/operations.md:79` repete os destinos e comandos verificados | PASS documental |

O cenário de setup com Postgres real injeta pré-requisitos/instalação para delimitar
a integração; não o apresentamos como piloto com iniciantes. Os testes de vazio e
texto hostil da UI declaram a resposta simulada. A leitura, recuperação de rede,
schema, persistência e contratos HTTP possuem evidência real nos gates.

## Casos de borda e preservação

- Plano sem escrita: `tests/integration/profile-generation.test.ts:57` compara a
  árvore e linha 58 exige ausência de `.renova`.
- Symlinks, plano obsoleto e plano adulterado: mesmo arquivo, linhas 122, 126,
  135, 144 e 148 exigem rejeição antes de alterar o destino.
- Hardlink pendente reconhecido: `tests/integration/database-setup-recovery.test.ts:147`
  compara a classificação com `nlink`; linhas 152–158 exigem hashes iguais,
  retorno a um link e retirada somente do journal próprio.
- Concorrência: `tests/integration/setup.test.ts:246` exige código 1 na segunda
  execução; `tests/integration/database-setup-recovery.test.ts:231` exige rejeição
  da segunda preparação e linhas 237–239 preservam identidade, credenciais e lock.
- Clones distintos: `tests/integration/local-db.test.ts:42` a 48 distinguem raiz,
  banco e volume; linhas 56–58 distinguem banco, volume e porta reais; linha 84
  exige publicação exclusivamente em `127.0.0.1`.
- Docker indisponível, dependências ausentes, porta ocupada e serviço parcial:
  `tests/unit/doctor.test.ts:43`, 67 e `tests/integration/doctor.test.ts:89`
  exigem diagnóstico de falha; linha 99 confirma que o servidor alheio permanece vivo.
- CLI por alias de diretório: `tests/integration/setup.test.ts:63` analisa o plano
  JSON e linha 64 exige zero estado criado; `tests/integration/doctor.test.ts:165`
  a 171 exigem código 2 e JSON válido para opção inválida.

## Gate completo e integridade dos testes

Comando final executado pelo verificador: `pnpm check:full`. Ele inclui quick,
build, integração e E2E. Código de saída 0. Ambiente: macOS, Node `v24.21.0`,
pnpm `10.33.4`, Chromium e Postgres descartável. Log local:
`/tmp/renova-onboarding-verifier-full.log`.

| Etapa | Resultado |
| --- | --- |
| Harness estrutural | 197 arquivos, 9 regras, nenhuma violação |
| Biome | 145 arquivos, nenhuma correção aplicada |
| Tipos e build | Todos os workspaces aplicáveis aprovados |
| Testes do harness | 37 aprovados |
| Unitários/propriedades | 49 aprovados |
| Componentes UI | 15 aprovados |
| Integração | 87 aprovados em 11 arquivos |
| E2E | 16 aprovados, 1 worker, 0 retries; 14 da base e 2 do sample |
| Total | **204 aprovados, 0 falhas, 0 skips** |

A base anterior documentou 141 testes em
`docs/specs/renova-project-template/local-validation.md:39`. O incremento
acrescenta 63: 18 unitários, 41 integrações e 4 E2E. A comparação com o snapshot
confirmou que os testes E2E antigos somente trocaram a rota `/` por `/referência`;
suas assertions permaneceram intactas. A galeria foi movida, renomeada e recebeu
rótulos visuais, preservando os exemplos. Nenhum teste, timeout ou assertiva foi
enfraquecido para obter o resultado.

Uma execução preliminar passou durante a janela das correções descritas abaixo.
Ela não foi usada como gate final. A repetição integral acima começou com código
estável; hashes de 150 arquivos de código/testes/configuração permaneceram iguais
até o término. Houve apenas avisos de NO_COLOR/FORCE_COLOR no navegador.

## Sensor de discriminação

Profundidade: três mutações comportamentais focadas em conflito, integridade das
credenciais e diagnóstico HTTP. Cada uma executou `pnpm check:full` na cópia,
passou por quick/build e foi reprovada por assertions de integração. O código
original da cópia foi restaurado antes da mutação seguinte.

| Mutação isolada | Local original | Assertion que a detectou | Resultado |
| --- | --- | --- | --- |
| M1: declarar `canApply: true` mesmo com conflito | `scripts/project/generate.mjs:240` | `tests/integration/profile-generation.test.ts:80`, 172 e 240, esperado false, recebido true; 3 falhas/84 aprovações na integração | Morta |
| M2: remover comparação entre bytes do ambiente e hash do journal | `scripts/db/local.mjs:337` | `tests/integration/database-setup-recovery.test.ts:112`, promise resolveu em vez de rejeitar edição; 1 falha/86 aprovações | Morta |
| M3: trocar `/api/trpc/system.health` por `/api/health` | `scripts/project/doctor.mjs:356` | `tests/integration/doctor.test.ts:123`, esperado exit 0, recebido 1; 1 falha/86 aprovações | Morta |

**Result**: PASS, 3 mutações mortas, 0 sobreviventes.

A cópia partiu dos arquivos atuais, com `node_modules` preexistentes ligados para
execução. O snapshot guardou 211 arquivos versionáveis e os dois arquivos locais
protegidos existentes (`.env` e `.renova/db-state.json`). Antes de escrever este
relatório, hashes/modos dos 211 arquivos, hashes/modos/datas dos dois protegidos e
`git status --porcelain=v1 -z` eram idênticos. A cópia foi removida sem seguir os
links das dependências. Nenhum sensor usou stash ou alterou a árvore real.

Logs locais: `/tmp/renova-onboarding-sensor-1.log`,
`/tmp/renova-onboarding-sensor-2.log`, `/tmp/renova-onboarding-sensor-3.log`.
Snapshot e resultado de isolamento ficaram em
`/var/folders/m3/3j_ygv4j3r3gw8qgprvlnb200000gn/T/renova-onboarding-sensor-tjndsrr3/`.

## Correções confirmadas durante a validação

O ensaio real paralelo do coordenador encontrou dois defeitos antes do gate final.
Ambos foram corrigidos numa rodada e revalidados aqui:

1. O doctor consultava uma rota de proxy inexistente. A regressão passou a usar
   `createApp` real em `tests/integration/doctor.test.ts:106`, com assertion na
   linha 123. O sensor M3 confirmou que a regressão falha ao reintroduzir o defeito.
2. O guard do CLI comparava paths sem canonicalizar aliases de diretório. O guard
   corrigido usa `realpathSync`; os processos reais dos testes em
   `tests/integration/doctor.test.ts:147` e `tests/integration/setup.test.ts:50`
   comprovam saída JSON e códigos observáveis.

Não há gap remanescente no incremento. O coordenador registrou os dois sinais
como candidatos em [lições locais](../../plans/onboarding-lessons.md): contratos
HTTP testados contra o servidor real e execução de CLI por paths equivalentes.

O `validate_state.py` da skill TLC passou com zero erros usando uma cópia deste
relatório em adaptador temporário `.specs/features/renova-project-template/validation.md`.
O repositório manteve sua estrutura `docs/specs`; não foi criada uma `.specs` real.

## Qualidade, UI e limites

A revisão verificou mudanças restritas ao configurador, recuperação, diagnóstico,
rotas/marca, testes e orientação de uso. Os guardas de filesystem e checkpoints
tratam interrupções e edição concorrente demonstradas por testes. Comandos de
processo usam argumentos estruturados; os erros públicos não reaproveitam stderr
ou conteúdo de arquivos. O perfil futuro é recusado antes de escrita.

UI: skill verify-app, jornadas do feature map executadas pelo fallback E2E
bloqueante. As capturas de galeria desktop e overview de 390 px foram inspecionadas
pelo verificador. Navegação, hierarquia, logo e largura estavam consistentes.
O SHA-256 do asset local foi comparado diretamente com `git show` da revisão
`9e186b82e10d29aec2175b32a9857fed0b835c80` do Renova Monorepo: ambos resultaram em
`8b92fc666951122ac121492678da6e315df78c727ad562ceb6ed5532d4fd55c7`.

Não foi realizado aceite humano com iniciantes, medição de tempo/intervenções,
validação Linux/WSL2, CI remoto Blacksmith, autenticação ou publicação Railway.
Os gates e sensores não substituem essas evidências. As tarefas futuras do plano
continuam futuras; este relatório sustenta apenas a conclusão local do incremento.
