# Publicar um projeto no Railway

O uso local continua igual: `pnpm run setup` e `pnpm dev`. Publicar é uma etapa
separada, com recursos e cobrança próprios. Cada projeto tem **uma aplicação e
um Postgres privado**. A aplicação serve o frontend Vite e a API Fastify na mesma
origem. O perfil sem login não precisa de Resend nem de conta de usuário.

## Primeira publicação, com apoio de IA ou de um responsável

1. Termine a configuração local e escolha o perfil. Crie o repositório próprio,
   habilite Blacksmith nele e espere o workflow **CI** passar no commit a publicar.
2. No workspace Railway da Renova, crie **um projeto novo**, um Postgres e um
   serviço vazio chamado `app`. Não selecione um banco de outro produto.
   O Postgres usa a versão 18, banco `railway` ou outro nome próprio e rede privada;
   não habilite TCP Proxy nem domínio público para o banco.
3. Em `app`, gere um domínio Railway apontando para a porta **8080**. Instale e
   autentique os CLIs `railway` (com `config plan/apply`) e `gh`. Não é preciso
   instalar skills ou copiar configurações de outro produto.
4. Copie os IDs do projeto, ambiente, app e Postgres. Execute uma vez, substituindo
   os exemplos; os comandos recusam IDs ausentes ou divergentes:

   ```sh
   pnpm deploy:setup --project PROJETO_UUID --environment AMBIENTE_UUID --service APP_UUID --database POSTGRES_UUID --origin https://seu-app.up.railway.app
   ```

   O comando cria dois usuários próprios no banco: um para migrations e outro
   para a aplicação. A senha administrativa permanece no Postgres. Nenhum dado
   local é enviado. Reexecutar preserva as senhas; banco ocupado ou pertencente
   a outro destino é recusado. `.renova/railway-credentials.json` contém as senhas
   desta instalação, tem acesso restrito e fica fora do Git. Preserve-o; não o
   cole em chats, tickets ou PRs. Se perder essa cópia, peça recuperação ao
   responsável; não recrie senhas nem apague o volume.
5. **Somente com login:** configure no painel do serviço `app` as variáveis
   `RESEND_API_KEY` e `AUTH_EMAIL_FROM`, conforme a seção abaixo.
6. Com o trabalho commitado e sem alterações locais, prepare e confira o plano:

   ```sh
   pnpm deploy:prepare --project PROJETO_UUID --environment AMBIENTE_UUID --service APP_UUID
   pnpm deploy:apply --confirm-project PROJETO_UUID
   ```

   `prepare` consulta o destino e produz um plano local; não altera o Railway.
   `apply` exige esse plano, válido por 30 minutos, o mesmo commit, árvore limpa
   e o workflow CI mais recente concluído com o job `required` aprovado.
   Publica um arquivo Git do commit, sem `.env`, caches ou arquivos ignorados.
   A configuração usa o IaC nativo do Railway e administra apenas `app`, sem
   poder remover o banco ou seu volume. Não conecte autodeploy que contorne esse gate.
7. Espere o deployment ficar saudável, rode `pnpm deploy:verify --origin https://seu-app.up.railway.app` e confira `/`, `/referência`, `/health` e
   `/ready`. Com login, valide convite, ativação, entrada, saída e recuperação.
   Upload aceito ou `/health` verde não comprovam persistência nem entrega de email.

Para pedir ajuda à IA, você pode usar:

> Leia AGENTS.md e docs/process/railway.md. Quero publicar meu projeto independente
> no Railway da Renova. Confira os acessos, prepare um destino novo, mostre o plano
> com projeto e ambiente e só publique após minha confirmação. Não copie meu banco
> local. Valide a jornada do perfil escolhido e relate o que não conseguiu verificar.

## Convites por email

Use uma conta Resend com domínio **verificado**. Prefira um remetente próprio do
projeto e uma chave com permissão somente de envio, limitada ao domínio. Cadastre
`RESEND_API_KEY` diretamente nas variáveis de `app`; não no Git, frontend ou build.
`AUTH_EMAIL_FROM` é o endereço remetente, por exemplo `acesso@dominio-verificado`.
O segredo de sessões é criado por `deploy:setup` e é exclusivo desta instalação.

Não altere registros DNS de um domínio que já envia por outra conta/provedor.
Use um subdomínio separado ou confirme a conta correta. A integração faz uma
requisição HTTPS ao Resend, com limite de tempo, sem redirecionamento nem repetição
silenciosa. Aceitação pelo Resend não equivale a entrega na caixa do destinatário.
O ambiente local continua usando Mailpit, sem envios externos.

O responsável libera uma conta dentro do container da aplicação:

```sh
railway ssh --project PROJETO_UUID --environment AMBIENTE_UUID --service APP_UUID -- node scripts/auth/invite-remote.mjs --project PROJETO_UUID --environment AMBIENTE_UUID --service APP_UUID pessoa@exemplo.com "Nome da pessoa"
```

O comando confere o destino e a identidade real do banco antes de criar a conta.
Não existe cadastro público. Se o envio não for confirmado, confira o evento
sanitizado no log e o status no Resend antes de repetir. Tokens, senhas e corpo de
email não devem ser copiados para logs. A pessoa define a própria senha no link
recebido; o responsável não precisa saber nem transmitir a senha.

## Falhas e manutenção

- `/health`: processo vivo. `/ready`: conexão, identidade, permissões e histórico
  exato de migrations compatíveis com a imagem. Falha retorna 503 sem detalhes.
- Migration roda uma vez no predeploy, com lock e transação. Uma falha impede a
  promoção. A aplicação executa com usuário restrito e sem a URL de migrations
  no seu processo Node.
- Após mudança de schema, a imagem anterior pode não passar no `/ready`.
  Prefira uma correção posterior; rollback de imagem nunca desfaz o banco.
- Configure backups no Railway e ensaie restauração em outro destino descartável
  antes de admitir dados reais. Backup existente não prova restauração bem-sucedida.
- Mudança de destino, plano expirado ou novo commit exige novo `deploy:prepare`.
  Resultado desconhecido exige consultar os deployments antes de repetir o upload.
- Operações de exclusão, rotação e restauração não são automatizadas pelo template.

A evidência do piloto e suas pendências ficam em
[railway-validation.md](../specs/renova-project-template/railway-validation.md).

Ao adicionar uma variável própria ao serviço, declare-a com `preserve()` em
`.railway/railway.ts`. O plano recusa remoções; não use `--confirm-destructive`
para contornar uma variável esquecida.
