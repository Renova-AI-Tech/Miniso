# S0: autenticação opcional

Decisão técnica: Better Auth **1.7.11**, fixado no lockfile do perfil autenticado.
Consulta de fontes e ensaio local: 19/10/2026. Este relatório complementa o
[design](design.md) e as [tarefas T-015–T-019](tasks.md).

## Evidência antes da adoção

O registro npm e a [release oficial 1.7.11](https://github.com/better-auth/better-auth/releases/tag/v1.7.11)
confirmaram a versão estável. O experimento foi executado com dependências próprias
em diretório temporário e Postgres descartável criado pelo helper protegido do
repositório. Não utilizou o banco local de desenvolvimento, uma conta real ou um
provedor remoto de email.

O primeiro ensaio teve **5 testes aprovados e 1 falha**: o handler nativo aceitou
`reset-password` com Origin divergente quando não havia cookie. O controle de
origem do Fastify, já existente na base, foi aplicado também ao transporte de
auth. A asserção continuou exigindo 403 e ausência de alteração da senha.
Depois dessa integração, os **6 testes passaram**. Somente então o módulo foi
implementado. O experimento posterior inclui proxy HTTP de loopback e preservação
de múltiplos cookies; o navegador/Vite pertencem ao gate E2E da receita.

A revisão independente encontrou uma segunda diferença da biblioteca: enviar
`rememberMe: false` no login criava uma sessão de 24 horas, mesmo com o limite
configurado em oito horas. O transporte agora aceita somente os campos dos fluxos
oferecidos e recusa opções extras e query strings. A regressão HTTP confirma 400
sem sessão para essa opção e oito horas para o login válido. Não há opção de
"lembrar de mim" neste perfil.

Fonte do experimento: `tests/experiments/auth/auth-spike.test.ts`. Ele exige as
dependências do perfil autenticado; não entra no runtime ou nos gates do perfil
público. A execução inicial usou um pacote temporário com Better Auth 1.7.11,
Fastify 5.12.5, Kysely 0.29.6 e pg 8.23.1, resolvido apenas para esse ensaio.
Os testes definitivos do clone autenticado substituem a necessidade de repetir
essa instalação manual a cada uso do template.

## Contratos verificados

| Tema | Decisão e evidência |
| --- | --- |
| Cadastro | `disableSignUp: true`; bridge HTTP aceita somente login, logout, sessão e recuperação. Endpoints de cadastro e administração retornam 404. |
| Liberação | Comando local usa o adapter da biblioteca para criar identidade pendente e uma senha inicial aleatória jamais exibida. Não instala plugin admin ou abre administração HTTP. |
| Ativação | O fluxo de reset da biblioteca entrega o primeiro link; a pessoa define a própria senha. `requireEmailVerification` impede sessão pendente; `onPasswordReset` marca email verificado após prova pelo link. |
| Link | `resetPasswordTokenExpiresIn: 900`; identificador persistido com hash, consumo de uso único e concorrência verificados no Postgres. |
| Sessão | `expiresIn: 28800`, `disableSessionRefresh: true`, `cookieCache.enabled: false`. Logout, expiração e recuperação invalidam a próxima leitura protegida. |
| Transação | Kysely/Postgres com `transaction: true`, explícito; token, revogação e senha usam a transação nativa da biblioteca. |
| Abuso | Limite nativo persistente por IP/endpoint e complemento atômico por conta normalizada; cinco tentativas em quinze minutos. IP vem do Fastify, nunca de forwarding livre do cliente. |
| Transporte | Bridge remove token de sessão do JSON, preserva todos os Set-Cookie e remove comprimento/encoding ao trocar o corpo. Cookie de sessão HttpOnly, SameSite=Lax, Secure em produção. |
| CSRF | Prova assinada pelo servidor, vinculada ao cookie de desafio e à sessão atual. Mutação com cookie exige Origin exato e x-csrf-token. A biblioteca mantém seus controles próprios. |
| Email | Nodemailer 10.1.7 fixado, SMTP local em loopback. Falha de entrega mantém resposta pública genérica; o comando local distingue aceitação de falha sem imprimir link, senha ou destinatário. |

As APIs e a semântica foram confrontadas com código da versão fixada:

- [Reset e consumo do token](https://github.com/better-auth/better-auth/blob/v1.7.11/packages/better-auth/src/api/routes/password.ts): validação de senha antes do consumo; vencedor único no reset concorrente.
- [Transação da senha e revogação](https://github.com/better-auth/better-auth/blob/v1.7.11/packages/better-auth/src/utils/password.ts): revogação precede a escrita da senha dentro da transação configurada.
- [Adapter de identidade](https://github.com/better-auth/better-auth/blob/v1.7.11/packages/better-auth/src/db/internal-adapter.ts): criação de usuário exige a origem `email-password`; callback de reset usa atualização de usuário.
- [Rate limiter](https://github.com/better-auth/better-auth/blob/v1.7.11/packages/better-auth/src/api/rate-limiter/index.ts): versão 1.7.11 usa incremento atômico condicionado para o limite em banco. O bridge também apresenta o cabeçalho padrão Retry-After.
- [Schema da biblioteca](https://github.com/better-auth/better-auth/blob/v1.7.11/packages/core/src/db/get-tables.ts): quatro tabelas de identidade e a tabela de limitação persistente; migration revisada e versionada pelo runner do projeto.
- [Sessões](https://better-auth.com/docs/concepts/session-management) e [integração Fastify](https://better-auth.com/docs/integrations/fastify): leitura server-side, ausência de cache de sessão e conversão explícita de Request/Response.

## Implementação e validação do módulo

A receita acrescenta `packages/auth` e a migration `002_optional_auth`. A migration
001 permanece byte a byte; dados públicos não ganham proprietário implícito nem
permissão de escrita. `owned_records` é uma tabela separada, cujo proprietário é
obtido exclusivamente da sessão no servidor. A página pública de referência
continua usando a consulta pública.

Após o S0, os **15 testes de integração direcionados** passaram em dois bancos
descartáveis: nove de identidade e seis de propriedade. A correção da sessão
acrescentou uma regressão, e os dez testes de identidade passaram novamente.
Comando no clone materializado:

```sh
pnpm --filter @renova/auth --filter @renova/dbmigrator --filter @renova/db-types build
pnpm exec vitest run --config vitest.integration.config.ts tests/integration/auth.test.ts tests/integration/owned-records.test.ts
```

Também passaram typecheck de auth/backend e build desses pacotes. As provas incluem
replay concorrente do link, expiração real no banco, limites concorrentes por conta
e IP entre instâncias, origem/CSRF, falha de envio, revogação e dois proprietários.
O gate completo, a geração e os testes de navegador são registrados pelo integrador;
essa lista não os substitui.

## Limites conhecidos

- O provisionamento local usa `auth.$context.internalAdapter` e o encerramento
  aguarda a introspecção por `context.checkSchema()`, APIs internas da versão
  fixada. Atualização da biblioteca exige repetir os testes; não há código próprio
  de hash de senha, sessão ou token de recuperação.
- `onPasswordReset` executa após o commit da senha. Se a atualização de email
  verificado falhar, a conta permanece sem acesso; outro link permite recuperar
  a ativação. Não se afirma atomicidade desse callback com o reset.
- A preparação autenticada local recusa produção até existir entrega remota de email
  configurada e validada. SMTP local não é uma configuração de produção.
- Aceitação SMTP não comprova recebimento humano. Nenhuma mensagem foi enviada para
  uma pessoa real e nenhum Railway foi alterado neste ensaio.
- O ensaio técnico não substitui o piloto com uma pessoa leiga ou júnior.
