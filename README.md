# Base de projetos Renova

Monorepo independente com **React/Vite, Fastify, Postgres e design system Renova**.
Cada projeto tem seu código, banco e credenciais próprios. O configurador prepara
a base local sem exigir contas corporativas. Escolha **sem login, somente leitura**
ou **com login por convite** ao iniciar um projeto. A publicação usa o
[guia Railway](docs/process/railway.md), validado em pilotos independentes.

## Começar

Pré-requisitos: **Node.js 24, pnpm 10.33.4 e Docker com Compose aberto**.
Crie um repositório com “Use this template” no GitHub ou copie o clone para uma
pasta própria. No terminal dessa pasta:

```bash
pnpm run setup
pnpm dev
```

Em um clone novo, o configurador pede o nome e se o projeto precisa de login.
Confira o resumo e confirme; ele instala as dependências, prepara o Postgres e
aplica as migrations. Com login, prepara também uma caixa de email local.
Não é preciso editar `.env`. Repetir o setup preserva o perfil já instalado.
Não use `pnpm setup`: esse é um comando do próprio pnpm, por isso o `run` é necessário.

Abra o endereço mostrado pelo Vite. **A página `/` começa com um guia de primeiros passos**:
explore a referência, descreva sua ideia para a IA e substitua o guia pelo seu produto. Para consultar exemplos e componentes instalados,
abra **`/referência`** (também funciona `/referencia`) nesse mesmo endereço.
A referência tem logo oficial, tokens, fontes e componentes Renova prontos para reutilizar.

No perfil com login, `/` exige uma conta liberada pelo responsável. Siga o
[guia de acesso](docs/process/authentication.md) para enviar o convite local e
definir sua senha. `/minha-area` demonstra registros privados por proprietário;
`/referência` continua pública, com dados sintéticos. Não existe cadastro público.

Se algo falhar, execute `pnpm run doctor`. O diagnóstico mostra o problema e a
próxima ação sem alterar o projeto. Depois de corrigir a causa, repita o setup;
ele preserva credenciais, código customizado e dados. Não apague volumes para resolver erros.

Cada pasta recebe identidade, banco, volume e portas separados em `127.0.0.1`.
Não copie `.env`, `.renova` ou volumes entre projetos e não copie `.env.example`.
Depois de preparar o ambiente, mantenha o slug; o nome exibido pode mudar.
Mover uma pasta configurada requer tratar sua identidade, não recriar o banco
apagando os arquivos de controle. Consulte [operações](docs/process/operations.md).

## Trabalhar com IA ou sem perguntas

Peça à IA para ler [AGENTS.md](AGENTS.md). Parta do `renova.project.json` deste clone,
altere nome/slug antes do primeiro setup e preserve o campo `origin`.
Você também pode fornecer uma cópia desse JSON com `--config caminho.json`.
Para login, use `profile: "authenticated"` e `capabilities: ["auth"]`; sem login,
use `profile: "public"` e `capabilities: []`.

```bash
pnpm run setup -- --config renova.project.json --plan --json
pnpm run setup -- --config renova.project.json --yes --json
pnpm run doctor -- --json
pnpm dev
```

`--plan` apenas mostra arquivos e conflitos. `--yes` autoriza a preparação local;
não publica nada. Fora de um terminal interativo, `--config` é obrigatório e
aplicar exige `--yes`. O JSON direto do script tem `schemaVersion: 1`, estado e
próximas ações; `pnpm --silent run doctor -- --json` remove o cabeçalho do pnpm
quando precisar capturar apenas JSON. Códigos: 0 pronto/plano válido, 1 falha
operacional e 2 configuração inválida.

## Desenvolver

- `apps/frontend/src/pages/HomePage.tsx`: substitua o guia pelo produto na rota `/`.
- `apps/frontend/src/pages/ReferencePage.tsx` e `src/reference/ReferenceGallery.tsx`:
  exemplos em `/referência`. Consulte e reutilize; não desenvolva o produto na galeria.
- `apps/frontend/src/App.tsx`: acrescente aqui as rotas do produto.
- `packages/ui`: 22 componentes, tokens e fontes locais; importe de `@renova/ui`.
- `apps/backend`: API Fastify/tRPC. Toda operação declara a política de acesso.
- `packages/dbmigrator`: migrations versionadas; acrescente uma nova, não edite a aplicada.
- `packages/db-types`: tipos de tabelas confrontados pelos testes com o schema real.

Ao criar seu produto, adapte também os testes e a documentação dos exemplos
substituídos. O teste da página inicial deve verificar sua nova jornada; ao criar
tabelas, atualize os tipos e a lista esperada nos testes de banco. Se renomear um
teste, atualize seu vínculo em `tasks.md`. As specs de
[`renova-project-template`](docs/specs/renova-project-template/requirements.md)
registram a origem da base, **não são um backlog obrigatório do seu projeto**:
anote o comportamento substituído e a nova spec, preservando os relatórios
históricos. Mantenha as verificações de segurança e os gates.

Sem login, o usuário runtime do banco apenas lê dados e o projeto não instala auth.
Com login, a escrita fica limitada às tabelas de identidade e ao exemplo privado;
cada operação privada verifica a sessão e o proprietário. Defina a política de
novas features antes de ampliar os acessos. A instalação automática de auth é
para clones novos; o setup recusa trocar o perfil de um produto já preparado.

## Validar

```bash
pnpm check:quick                       # harness, lint, tipos, unit/property e UI
pnpm exec playwright install chromium # primeira execução do navegador
pnpm check:full                        # quick, build, integração real e E2E
```

Integração e E2E criam bancos descartáveis e portas exclusivas, sem usar o banco
de desenvolvimento. `pnpm ci:local` é uma checagem parcial sem navegador.
O workflow está configurado para **Blacksmith**, com todos os gates bloqueantes.
A execução remota e as proteções de branch precisam ser verificadas no repositório
destino; a instalação do App Blacksmith não é feita por este template.

O agente começa em [AGENTS.md](AGENTS.md); o [manual](docs/index.md) contém comandos,
arquitetura e evidências. Docs em pt-BR, código em inglês. As três skills do
repositório acompanham o clone; não é necessário instalar skills pessoais.

Para desenvolver, basta um pedido claro ou uma spec local. Nenhuma ferramenta de
tarefas, conta ou ID externo é obrigatório, inclusive em PRs; links externos são
opcionais. Siga a [receita da tarefa](docs/process/task-recipe.md).
Se quiser revisão por responsáveis, descomente as regras de CODEOWNERS com usuários
ou times reais. Os exemplos comentados não criam uma exigência para começar.
Não há publicação ou conexão automática a um projeto Railway existente.

Publicação: [guia Railway e convites](docs/process/railway.md). Os dois perfis passaram nos pilotos remotos; consulte as [evidências e pendências](docs/specs/renova-project-template/railway-validation.md).
