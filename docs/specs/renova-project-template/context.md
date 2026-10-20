# Contexto: base de projetos Renova

Data: 19/10/2026. Estado: plano aprovado; base local T-000–T-010 implementada e validada.
Evidências e limites em [local-validation.md](local-validation.md).
Fontes: conversa desta sessão, [pesquisa](research.md) e levantamento do código.

## Confirmado pelo usuário

- Transformar o harness em base Renova de monorepo com Vite, Fastify e Postgres.
- Manter cada projeto independente, com design system integrado.
- Permitir desenvolver e executar localmente ou publicar no Railway da Renova.
- Atender técnicos e pessoas que desenvolvem com ajuda de IA.
- Incluir segurança mínima que previna erros comuns.
- Começar com perfis prontos sem login/com login, acrescentando recursos depois.
- No perfil com login, o responsável libera as contas; sem cadastro público.
- Usar Blacksmith como executor do CI.
- Produzir spec e plano de execução agora; pesquisar referências de mercado.
- Após revisar o plano, implementar a base local Vite/Fastify/Postgres/UI, validando cada etapa.
- Remover a dependência de Linear deste repositório e dos clones; manter o restante
  do harness, com pedido/spec local e ferramenta externa de tarefas opcional.

## Fronteira desta entrega

Na continuação, o usuário autorizou T-011–T-014 (configurador guiado e diagnóstico),
com validação antes de autenticação. Também pediu usar a logo do Renova Monorepo,
melhorar a barra lateral, mover toda demonstração para `/referência` e deixar `/`
vazio para o produto. `/referencia` será um alias sem acento, sem criar outra
demonstração. Documentação humana e instruções de IA explicam os dois destinos.

Nesta etapa, somente sem login/local pode ser aplicado. Após a revisão de simplicidade,
o wizard pede apenas nome e confirmação; informa o perfil/destino no resumo.
O modo JSON recusa combinações não implementadas antes de gravar arquivos. Não produz
um projeto parcialmente autenticado nem provisiona recursos remotos.

Incremento local T-000–T-010: perfil público somente leitura, banco isolado,
contrato tipado, design system e gates. Workflow Blacksmith preparado localmente;
T-020 continua parcial até matriz dos perfis e execução remota. Não altera o Renova existente.
Não cria item remoto, commit, push, PR, recursos, custos ou dados remotos.

A implementação local explicitamente autorizada segue na branch
`codex/renova-local-foundation`, preservando o rascunho documental anterior.
O pedido e a spec local bastam para orientar o trabalho; não há vínculo externo
obrigatório antes de implementar ou abrir PR.

## Direção do plano aprovado

O plano define as escolhas abaixo. Método/biblioteca de autenticação e provedor
de email continuam sujeitos ao spike; aprovação do plano não configura um destino remoto.

- Núcleo sempre inclui Postgres; aplicações sem backend/banco ficam fora da v1.
- Sem login entrega exemplo de consulta de dados públicos sintéticos, igual em
  local e Railway. Escrita anônima exige uma feature específica com sua política.
- Com login entrega identidade própria, recuperação de acesso e exemplo por
  proprietário. Sem SSO, organizações, papéis complexos ou usuários compartilhados.
- Primeiro método candidato: email/senha, recuperação e ativação por email.
  A liberação pelo responsável e a ausência de cadastro público estão confirmadas. Provedor
  de email escolhido no spike; caixa local não entrega para destinatários reais.
- CLI guiada e configuração declarativa atendem humanos e IA com o mesmo motor.
  Um painel web de criação não é necessário na v1.
- GitHub/Railway não são pré-requisitos para o uso local. Uma ferramenta de tarefas
  é opcional tanto neste repositório quanto nos projetos gerados, inclusive para PRs.
- Destino corporativo, responsáveis e orçamento Railway devem ser definidos antes
  de provisionar. Não assumir que o workspace pessoal observado é o destino final.

## Iteração

Primeiro validar uma base local sem login. Depois integrar o perfil autenticado,
validar a geração de ambos e publicar pilotos isolados quando autorizado. Adicionar
login a projeto existente é uma alteração com plano/diff e revisão da política
dos dados; remover login automaticamente não entra na v1.

## Ideias adiadas

SSO, multiempresa, billing, uploads, filas, agentes de IA dentro do produto,
seleção de ORM/framework, portal Backstage, registry privado obrigatório,
remoção automática de módulos e sincronização automática de código customizado.
Ser capaz de desenvolver com IA não significa incluir um provedor de IA no app.

### Ajuste posterior da página inicial

O usuário pediu um guia em `/`. A página inicialmente vazia passa a mostrar
primeiros passos simples e substituíveis pelo produto, link para `/referência`,
um exemplo de pedido à IA e ajuda de ambiente recolhida. A galeria e seus dados
continuam separados, sem consulta à API pela página inicial. Essa solicitação
atualiza REQ-041; relatórios anteriores registram o estado vazio validado à época.

### Ajuste posterior do fluxo de trabalho

O usuário removeu a exigência de Linear para este repositório e os projetos que
usam o template. Pedido do usuário, plano/spec local, branch descritiva e validação
orientam o desenvolvimento. Links externos são opcionais. Configurações MCP,
skills e modelos não exigem serviço ou ID de tarefa. Notas históricas que citam
vínculo pendente não representam mais uma obrigação; os gates do harness e do CI
permanecem inalterados.

### Simplificação e publicação autorizadas

O usuário autorizou simplificar o configurador, retirar o aplicativo financeiro
anterior e desacoplar readiness da tabela de demonstração. O configurador pede
somente o nome enquanto existe uma única combinação disponível. A retirada inclui
workspaces, testes exclusivos, porta extra, specs e lista de features do exemplo;
os resultados antigos permanecem nos relatórios históricos e no Git. O clone inicia
com lista de features vazia, para não atribuir evidências a um produto ainda não criado.

Também autorizou commit, push, PR e merge após validação, seguido de um clone real
em outra pasta para construir e verificar um projeto simples. O ensaio usa dados
sintéticos, identidade/banco próprios e não publica o novo projeto. Autenticação e
Railway continuam fora deste incremento; a autorização de merge não é deploy.
