# Validação Railway e email — 20/10/2026

**Verdict:** PASS

Estado atual: ensaio concluído; ambientes encerrados.

## Encerramento dos pilotos — 20/10/2026

Os pilotos eram descartáveis e foram encerrados após autorização do responsável.
O template não precisa manter infraestrutura no Railway: cada novo projeto cria
seu próprio destino somente quando precisar publicar.

- Railway: exclusão dos projetos `renova-template-piloto` e `renova-email-piloto`
  aceita. As duas aplicações e os dois Postgres estão offline, sem deployments
  ativos; ambas as origens retornam HTTP 404. O provedor agendou a remoção
  definitiva dos projetos, bancos e volumes para 22/10/2026, às 01h28–01h29
  (America/Sao_Paulo). Essa remoção futura ainda não foi observada.
- Resend: chave exclusiva `renova-email-piloto` revogada na equipe `renovagp`;
  a chave anterior `Onboarding`, o domínio verificado e o DNS foram preservados.
- GitHub: clone `Renova-AI-Tech/renova-email-piloto` excluído após confirmação
  de identidade do responsável. A interface confirmou a exclusão e a API
  autenticada passou a retornar HTTP 404 para esse repositório.
- O repositório `Renova-AI-Tech/renova-template`, o projeto Railway `renova` e
  os bancos locais foram preservados. A busca nos arquivos rastreados confirmou
  que as referências aos pilotos estão apenas neste relatório.

As evidências abaixo são históricas. Não use as origens desativadas para novos
projetos nem tente recuperar acesso às contas do ensaio. O template foi integrado
pela [PR #4](https://github.com/Renova-AI-Tech/renova-template/pull/4), com
[CI da main aprovado](https://github.com/Renova-AI-Tech/renova-template/actions/runs/39368629223)
no commit `4ff9318cf97724f4c9512270f9e10b37c4f677f8`.

Escopo: pilotos técnicos dos dois perfis, envio e recebimento real, jornada de
acesso e restauração lógica. Não equivale a aceite humano nem configura a política
de backup de um projeto que receberá dados reais.

## Destinos isolados

Workspace usado pela Renova: `42819615-cbb2-4a2b-a79f-ce8674e3f14e`.
Cada piloto tem app e Postgres 18 privados próprios, sem TCP Proxy no banco.
Nenhum serviço ou dado da aplicação Renova existente foi alterado.

| Perfil | Projeto / ambiente | Origem | Commit / CI / deployment |
| --- | --- | --- | --- |
| Público | `renova-template-piloto` / `piloto` | `app-piloto.up.railway.app` (desativada) | `dd1cfa7`; [CI 39365966778](https://github.com/Renova-AI-Tech/renova-template/actions/runs/39365966778); `cad52ef3-3c1d-49dc-ad19-3559e543f776` SUCCESS |
| Com login | `renova-email-piloto` / `piloto` | `app-piloto-af33.up.railway.app` (desativada) | `cd9a097`; CI 39367202055 aprovado no clone; `8cc325a8-1968-419a-826d-62300f1d728f` SUCCESS; convite e recuperação recebidos, jornada concluída |

O perfil com login foi gerado em clone independente com repositório próprio.
A exclusão desse repositório remove também sua página de CI; o SHA, o ID e o
resultado da execução ficam registrados acima. Os recursos do ensaio não
dependiam do projeto de produção Renova nem do banco local.

## Evidências por camada

- CI Blacksmith: quality, full e required passaram nos dois commits; a matriz
  dos dois perfis passou no template. No clone, a matriz é dispensada e o perfil
  escolhido executa seus próprios testes completos, incluindo container e E2E.
- `deploy:setup` comprovou autenticação dos dois papéis pela rede privada antes
  de configurar o app. `prepare` produziu plano nativo sem remoção; `apply`
  publicou arquivo Git do SHA cujo CI foi aprovado. Migrations de predeploy
  concluíram nos dois destinos.
- `pnpm deploy:verify --origin ORIGEM` passou nos dois pilotos: HTTPS, processo,
  banco/identidade/schema, build, cache e isolamento de caminhos.
- UI pública: home, referência e alias, refresh, três registros reais da API,
  escrita anônima recusada, teclado, painel, desktop/mobile, fontes e 404 visual.
  Console sem erro de JS/CSP ou recursos externos. Erro de rede e vazio foram
  simulados no navegador; retry voltou à API real. Não são falhas reais do provider.
- Rate limit externo: depois da cota, alternar `X-Real-IP`/`X-Forwarded-For` ou
  remover os cabeçalhos manteve 429. Não foi possível reiniciar a cota por spoofing.
- Após a jornada autenticada, 6 linhas de log da aplicação e 161 eventos HTTP
  foram confrontados com os tokens, senhas e chave do ensaio: nenhuma ocorrência.
- Log HTTP do Railway: uma requisição com marcador sintético em `?token=` apareceu
  somente com `path=/health`, sem a query. Nenhum token real foi usado nessa prova.

## Backup e restauração

Dump lógico do Postgres público remoto restaurado em Postgres 18 descartável,
sem portas publicadas e com rede desabilitada. Identidade, dados, histórico e
checksums de migrations, donos e permissões foram iguais antes/depois da origem
e na cópia restaurada: 3 registros, 1 migration e 3 tabelas. O runtime continuou
somente leitura. Container e volume descartáveis foram removidos após a prova.

SHA-256 do dump de 6.871 bytes:
`649ae707982f677551f8b2f4ba327a3d2e30479960a72d25d9fd47152656ef25`.

Isso comprova a restauração lógica ensaiada. Não configura nem comprova backups
agendados/PITR do Railway; cada responsável precisa definir retenção e executar
seu ensaio antes de admitir dados reais.

## Email e correções encontradas

A equipe Resend `renovagp` (Pro) tem `renovagp.com` verificado. O conector estava
vinculado a outra equipe, que mostrava domínio falho. A configuração correta foi
confirmada na sessão do usuário; nenhum DNS ou envio existente foi alterado.
Com autorização explícita, foi criada chave exclusiva do piloto, somente de envio
e limitada ao domínio, configurada somente no app autenticado. O perfil público
não exige Resend. Destinatário real autorizado foi confirmado antes de qualquer envio.

O primeiro convite falhou antes do envio: o container copiava `packages/auth/dist`
sem suas dependências transitivas. A correção usa a árvore instalada por
`pnpm deploy`, remove a cópia redundante e testa os imports reais do comando de
convite dentro da imagem autenticada, sem acessar DB ou email. Os 5 testes do
container corrigido passaram. A revisão independente reproduziu o import antigo
falhando e o novo carregando na mesma imagem, com rede desabilitada. CI do template
no commit `775a4ae` também passou, incluindo a matriz dos dois perfis
([run 39367167327](https://github.com/Renova-AI-Tech/renova-template/actions/runs/39367167327)).

Outra falha encontrada no piloto público foi uma fonte pequena embutida como
`data:` pelo Vite, bloqueada pela CSP. Assets agora são arquivos próprios e o
container verifica as fontes emitidas. A política de segurança permaneceu igual;
a repetição da UI remota passou.

## Convite e recuperação reais

O Gmail confirmou as duas mensagens na **caixa de entrada**, sem label de spam:
convite às 04:05:24 UTC e recuperação às 04:06:15 UTC. Ambas apresentaram SPF e
DKIM aprovados nos cabeçalhos recebidos. DMARC não foi reportado nesses cabeçalhos;
nenhuma mudança DNS foi feita. Foram enviados exatamente um convite bem-sucedido
e uma solicitação de recuperação, ao destinatário autorizado.

Navegador real contra o piloto autenticado concluiu às 04:06:46 UTC:

1. Link recebido ativou a conta com senha de teste aleatória.
2. Login abriu o produto; sessão usou cookie Secure/HttpOnly/SameSite=Lax, sem
   credenciais em localStorage ou sessionStorage.
3. Um registro sintético foi criado, lido e editado com persistência na API real.
4. Logout encerrou a sessão; UI e API privadas recusaram acesso anônimo (401).
5. Recuperação usou o segundo email real e permitiu definir nova senha.
6. A sessão anterior foi revogada, a senha antiga recusada e a nova aceita.
7. O link de recuperação não pôde ser reutilizado; logout final confirmado.

Cadastro público também foi recusado (404). A aplicação oferece criar/ler/editar;
não existe exclusão no exemplo. O registro sintético identificado como ensaio
ficou somente no banco isolado do piloto, agora offline e incluído na exclusão
agendada do projeto. Tokens foram usados apenas no ensaio, sem screenshots,
traces ou estado de sessão exportados. A senha de teste foi descartada; com o
encerramento do ambiente, a conta e a recuperação de acesso não estão disponíveis.

## Regressões e instruções verificadas

- `tests/containers/runtime.test.mjs:117`: imagem real e dependências do convite.
- `tests/integration/railway-database.test.ts:277`: falha transacional e compatibilidade.
- `templates/modules/auth/files/tests/e2e/auth.spec.ts:76`: recuperação local com
  revogação e uso único; a prova externa acima foi executada separadamente.
- `tests/unit/deploy-release.test.ts:186`: plano/CI/arquivo Git e fluxo de publicação.
- Guias de acesso e Railway revisados contra os comandos efetivamente usados nos
  clones. `pnpm harness:check` validou links; um clone autenticado independente
  concluiu CI e publicação sem copiar banco ou segredos locais.

## Limites

- Backup gerenciado, PITR, alertas de custo e política de retenção não foram configurados.
- Aceite por pessoa técnica e por pessoa não técnica com IA permanece pendente;
  ensaio automatizado em clone independente não substitui essas pessoas.
- WSL2, atualização automática da base e adição de auth a produto existente seguem
  fora deste incremento. As tarefas futuras não foram marcadas como concluídas.
