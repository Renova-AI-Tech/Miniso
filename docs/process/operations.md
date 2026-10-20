# Operações

## Comandos locais

| Comando | Faz |
| --- | --- |
| `pnpm run setup` | Nome e perfil no clone novo, confirmação do resumo e preparação local retomável |
| `pnpm run setup -- --config renova.project.json --plan --json` | Plano sem escrita, Docker ou instalação |
| `pnpm run setup -- --config renova.project.json --yes --json` | Preparação declarativa para IA, com saída sanitizada |
| `pnpm run doctor` / `pnpm run doctor -- --json` | Diagnóstico somente leitura, texto ou JSON |
| `bash scripts/init.sh` | Instala o lockfile e prepara hooks/skills; requer Node 24 |
| `pnpm db:up` | Prepara credenciais e sobe o Postgres exclusivo deste projeto |
| `pnpm db:migrate` | Compila e aplica migrations locais com identidade/checksum/lock |
| `pnpm dev` | Inicia frontend e backend; mostra o endereço do Vite |
| `pnpm test:loop` | Unit/property e testes de componentes UI |
| `pnpm test:integration` | Provisiona DB descartável, aplica schema, testa e remove só o alvo de teste |
| `pnpm test:e2e` | Mesmo isolamento de DB/portas, com Playwright |
| `pnpm check:quick` | Harness, Biome, tipos e loop |
| `pnpm check:full` | Quick, build, integração e E2E obrigatórios |
| `pnpm ci:local` | Quick + integração; parcial, não substitui full |
| `pnpm auth:invite -- email "Nome"` | Só com login: libera conta pendente no banco local e envia link à caixa local |
| `pnpm test:profiles` | Manutenção do template: gera clones isolados e verifica os perfis |

Instale o navegador uma vez com `pnpm exec playwright install chromium`.
Docker precisa estar em execução. Falta de Docker/porta ocupada é um erro de
preparação, nunca motivo para encerrar um processo alheio. Não existe reset automático.

`setup` e `doctor` exigem **`pnpm run`**, pois existem comandos internos do pnpm
com esses nomes. Para capturar somente JSON, acrescente `--silent` antes de `run`
ou execute `node scripts/project/doctor.mjs --json` diretamente.

## Preparação e retomada

O setup confere Node 24, pnpm fixado no packageManager e Docker/Compose, instala
`pnpm install --frozen-lockfile`, prepara ambiente, sobe o DB e aplica migrations.
A execução local não depende de GitHub, Railway, Sentry, serviço de email externo
ou ferramenta de tarefas. Em clone novo, o perfil com login materializa uma receita
fixa e prepara Mailpit em loopback. Sem login, não instala biblioteca de auth nem
cria tabelas, segredos ou caixa de email. Veja [acesso](authentication.md).
O configurador prepara o ambiente local. A publicação separada está no [guia Railway](railway.md). Trocar o perfil de um projeto já
preparado ou remover auth automaticamente é recusado.

`--plan` não verifica o Docker nem instala dependências. `--yes` aceita a preparação
local; não autoriza operações remotas. Fora de TTY é obrigatório passar `--config`.
Sem `--yes`, é necessário confirmar o resumo no terminal. Cancelar preserva o clone.

Etapas ficam em `.renova/setup-state.json`, sem segredos. Repita o mesmo comando
após corrigir a causa; passos conferem o recurso atual e não recriam identidade ou
volume. Instalação interrompida pode repetir o lockfile. Migrations aplicadas são
validadas por checksum. Preparação de credenciais interrompida retoma apenas se
journal, identidade e bytes forem reconhecidos. Processo interrompido libera sua
trava na próxima execução somente quando seu PID é comprovadamente inexistente.

Se um arquivo foi editado ou há estado ambíguo, o setup preserva o conteúdo e para.
Não remova `.renova` ou `.env` para contornar o erro. Ao fornecer explicitamente um
manifesto idêntico ao arquivo atual, o gerador pode reconciliar somente seu hash;
configuração diferente continua exigindo resolução do conflito.

## Ler o diagnóstico

`pnpm run doctor` confere ferramentas, dependências, manifesto, ambiente, identidade
e histórico de migrations do DB, portas e serviços. Não instala, migra, corrige arquivos ou encerra
processos. As consultas ao banco usam sessões somente leitura; não há contato com
um provedor remoto. Códigos: **0** ambiente pronto, **1** pendência operacional,
**2** configuração/estado inválido. JSON tem versão 1, `status`, `checks`,
`nextActions` e `exitCode`; conteúdo de env, erros do Docker e credenciais são omitidos.

Se frontend e API estão desligados e as portas livres, o ambiente pode estar pronto:
a próxima ação é `pnpm dev`. Se ambos estão ativos, doctor confere health/readiness,
proxy e HTML; execução parcial ou porta ocupada por outro serviço é uma pendência.
O resultado local não confirma CI Blacksmith, Railway ou disponibilidade pública.

| Situação | Próximo passo |
| --- | --- |
| Docker fechado | Abrir Docker, repetir doctor e setup |
| Clone sem dependências/ambiente | Rodar setup |
| Setup interrompido com estágio íntegro | Repetir o mesmo setup; identidade e credenciais são reutilizadas |
| Arquivo alterado, link ou estágio ambíguo | Revisar com IA/responsável os arquivos preservados; não enviar segredos nem apagar volume |
| Porta ocupada ou app incompleto | Conferir terminal; encerrar somente a execução deste projeto |
| Histórico de migrations divergente | Conferir migrations; não alterar migration aplicada nem resetar DB |

## Produto e referência

`/` é a página do produto, inicialmente com um guia substituível em `apps/frontend/src/pages/HomePage.tsx`.
`/referência` (alias `/referencia`) contém exemplos, integração demonstrativa com API
e componentes. O endereço base é impresso pelo Vite; pode variar por projeto.
A logo está em `apps/frontend/public/renova-logo.png`, com origem em `NOTICE.md`.
Orientações específicas para IA estão em `apps/frontend/AGENTS.md`.

## Ambiente e persistência

`db:up` escolhe portas livres em loopback e grava `.env` e `.renova/db-state.json`
com permissão 0600. O segundo arquivo é sanitizado, sem senhas. Ambos são ignorados
pelo Git. O volume local permanece entre execuções. Cada clone em outra pasta tem
outro namespace; não copie esses arquivos ou o volume.

`db:migrate` exige que o estado já exista. Migrações aplicadas não podem ser
editadas: acrescente outra migration. O comando recusa URL remota, querystring,
identidade incorreta e papel indevido. Não há remoção/reset/rollback do banco local.

Portas de frontend, API e Postgres são definidas pelo preparador.
Os testes passam configuração apenas a seus processos; não carregam o .env local.
Uma interrupção abrupta do processo/máquina pode exigir inspeção manual dos recursos
de teste identificados pelo namespace; nunca remova volumes por prefixo genérico.

## CI Blacksmith

[ci.yml](../../.github/workflows/ci.yml) roda em PRs, inclusive rascunhos, e push em
main. Quality executa quick/build; full executa build, DB e navegador; required
recusa falha, cancelamento ou skip dos gates aplicáveis. O repo mantenedor também
executa a matriz de perfis; clones validam o próprio produto com quality/full.
Actions fixadas por SHA, token somente leitura,
sem credencial de publicação. E2E é bloqueante.

No repo destino, habilite o App Blacksmith e torne `required` obrigatório na
proteção de branch. Configuração/testes locais não comprovam que o App está
habilitado ou que um run remoto foi aprovado. Essa verificação pertence ao piloto CI.

## Hooks e agentes

Husky pre-commit executa lint-staged/Biome; pre-push executa quick.
Claude PostToolUse usa [format-edited.mjs](../../scripts/hooks/format-edited.mjs).
Não use `--no-verify`. MCP: [.mcp.json](../../.mcp.json) recebe variáveis do ambiente.
Nenhuma credencial corporativa é necessária para desenvolver a base local.
