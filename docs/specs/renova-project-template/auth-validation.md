# Validação: autenticação opcional local

**Verdict:** PASS — escopo local.

Data: 19/10/2026. Escopo: T-015–T-019, sem publicação de aplicação.
Complementa o [ensaio de adoção](auth-spike.md) e o [guia de acesso](../../process/authentication.md).

## Baseline e isolamento

Antes de começar, o CI Blacksmith da `main` `e085504` foi confirmado verde no
[run 39341572792](https://github.com/Renova-AI-Tech/renova-template/actions/runs/39341572792).
O template e o catálogo de teste existentes permaneceram no perfil público.
Comparação SHA-256 confirmou `.env` e `.renova/db-state.json` preservados nos dois.
Nenhum banco de aplicação existente foi usado pelos testes de auth.

## Verificação por camada

- S0: seis testes de biblioteca/Fastify/Postgres; controles de origem do projeto
  corrigem a aceitação indevida observada no handler nativo.
- Integração focal: dez testes de identidade e seis de propriedade. Cobrem
  liberação fechada, senha, link de uso único, sessão de oito horas, revogação,
  limites concorrentes, origem/CSRF e isolamento entre duas pessoas.
- Retomada do setup: 27 testes de composição e publicação de ambiente, incluindo
  as interrupções e divergência de perfil encontradas na revisão.
- Navegador focal: oito jornadas de auth passaram contra API, Postgres e caixa
  de email descartáveis. Incluem ativação, recuperação, logout, autorização,
  erro de rede e telas em 390/1440 px. Screenshots foram inspecionados.
- Primeira matriz: projeto público gerado do zero passou instalação congelada e
  `check:full`: 37 harness, 53 unit/property, 17 UI, 109 integração e 14 E2E.
  Autenticado passou a mesma sequência: 37 harness, 53 unit/property, 17 UI,
  125 integração e 22 E2E. Totais: **230 público / 254 autenticado**.
  O comando `pnpm test:profiles` terminou com código 0 após ambos os gates;
  o relatório de execução local está em `/tmp/renova-auth-matrix-final.log`.

Os testes de transporte genérico do perfil autenticado usam router público
explícito somente na fixture. O aplicativo real e os testes de auth/ownership
mantêm sessão, origem, CSRF e banco reais. Nenhum gate, timeout ou retry foi relaxado.

## Ensaio de primeiros passos

Em cópia nova com perfil `authenticated`, sem `.env`, `.renova` ou dependências:

1. `pnpm run setup -- --config renova.project.json --plan --json`: plano gerado.
2. `pnpm run setup -- --config renova.project.json --yes --json`: sete etapas prontas,
   incluindo Postgres, migrations e Mailpit local.
3. `pnpm run doctor -- --json`: código 0 com app parado e com `pnpm dev` ativo;
   frontend, API e proxy responderam.
4. `pnpm auth:invite -- piloto@example.test "Pessoa de teste"`: aceitação local,
   exatamente uma conta pendente e um email de ativação na caixa isolada.
5. Repetir setup preservou hashes de credenciais, identidade de banco e
   `HomePage.tsx` personalizado. Nenhuma senha/link foi exibido no terminal.

## Revisão independente

Revisor distinto dos autores encontrou três problemas, corrigidos e reinspecionados:

- `rememberMe: false` ampliava a sessão nativa para 24 horas. Contrato HTTP estrito
  recusa essa opção; regressão comprova ausência de sessão após rejeição e TTL correto.
- O reconhecedor de publicação interrompida aceitava apenas perfil público.
  Agora retoma ambos mantendo identidade de arquivo e credenciais.
- Um journal de outro perfil podia ser publicado durante retomada. Validação de
  perfil precede renomeação/publicação; testes confirmam preservação sem escrita.

A matriz completa também expôs uma disputa no encerramento: a introspecção
inicial da biblioteca ainda adquiria conexão enquanto Kysely fechava o pool.
O encerramento agora aguarda a promise de checagem do schema. O teste de banco
encerrado passou de timeout para 41 ms; 16 testes de identidade/referência passaram
novamente, sem mudar timeout, asserção ou simular indisponibilidade.

Na primeira execução conjunta das 22 jornadas, o limite global de 120 requisições
por IP bloqueou uma navegação no último arquivo. O trace confirmou HTTP 429;
não era uma falha intermitente de navegação. O runner agora inicia um servidor
novo por arquivo E2E e separa seus artefatos. Os limites de produção não mudaram,
e os testes de abuso continuam cobrindo concorrência e persistência.

A revisão da PR #3 encontrou mais quatro casos, corrigidos antes do merge:

- Email excessivo era encaminhado à biblioteca sem o limite por conta. Agora
  login, recuperação e convite recusam entradas acima de 254 caracteres antes
  do processamento e usam a mesma normalização no contador e na biblioteca.
- Setup interrompido antes de preparar o ambiente escondia a escolha de perfil.
  A retomada preserva o identificador e volta a oferecer login; `.env` ou estado
  de banco existentes continuam impedindo a troca.
- A confirmação de salvamento não identificava o registro fora da primeira
  página. Agora apresenta o título retornado pela API, mantendo a ordem paginada.
- Paginação atrasada podia alterar uma lista já recarregada. Todas as leituras
  compartilham cancelamento e descartam respostas anteriores.

As regressões adicionais exercitam entrada excessiva sem efeitos em banco/email,
normalização, retomada e 25 registros reais com resposta de paginação atrasada.
As jornadas de paginação têm arquivo próprio e servidor isolado; o limite global
de requisições permanece igual. O resultado do CI final pertence ao commit da PR.

## Limites

- UI: skill `verify-app`, fallback `pnpm test:e2e` em runtime isolado. A aba de
  desenvolvimento existente não foi usada: o acesso foi recusado pela ferramenta
  de navegador e não houve tentativa de contornar essa recusa.
- Ensaio conduzido por agentes, sem aceite de pessoa leiga/júnior.
- Sem Railway, HTTPS/proxy de produção, provedor de email externo ou mensagem
  enviada a destinatário real. Runtime autenticado recusa produção neste incremento.
- T-030 (adicionar auth a produto existente) continua futura. O setup instala a
  receita apenas antes de preparar o ambiente de um clone novo.
- Não há painel administrativo, SSO, MFA ou garantia sobre futuras features.
