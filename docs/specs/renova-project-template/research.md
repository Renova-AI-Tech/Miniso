# Pesquisa: criação de projetos Renova

Consulta: 19/10/2026. Fontes primárias. Este documento sustenta a
[proposta](requirements.md); não comprova que a futura implementação funciona.

## Resultado

Adotar uma base obrigatória, dois perfis testados e um configurador pequeno.
O usuário escolhe o propósito e o acesso; o template resolve stack, componentes,
testes e configuração. O destino local ou Railway é uma escolha independente.
Um portal de plataforma completo fica fora da primeira versão.

## Referências de mercado

| Fonte | Evidência | Aplicação à Renova | Limite |
| --- | --- | --- | --- |
| [Spotify: Golden Paths](https://engineering.atspotify.com/2020/8/how-we-use-golden-paths-to-solve-fragmentation-in-our-software-ecosystem) | Relato empresarial de um caminho recomendado e suportado, com instruções e feedback de onboarding | Acompanhar criação, desenvolvimento e publicação; testar o caminho com pessoas novas | Artigo de 2020, consultado agora; não é prova atual de produtividade nem de uso por não técnicos |
| [Backstage: Software Templates](https://backstage.io/docs/features/software-templates/writing-templates/) | Parâmetros, passos, revisão e execução de templates | Mostrar escolhas e plano antes de criar recursos | Hospedar Backstage adicionaria autenticação, integrações e operação à própria plataforma |
| [Spring Initializr](https://docs.spring.io/initializr/docs/current/reference/html/) | Metadados, defaults, valores válidos e compatibilidade de dependências | Manifesto único para perguntas, IA e CI; recusar combinações incompatíveis | Referência de composição, sem importar stack Java |
| [Create T3 App](https://create.t3.gg/en/introduction) e [instalação](https://create.t3.gg/en/installation) | Geração modular, perguntas e flags de automação | Poucas escolhas de capacidade, com dependências já conectadas | Projeto usa Next.js; não é evidência de adoção empresarial; algumas flags são experimentais |
| [GitHub Templates](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template) | Novo repositório com arquivos do template e histórico próprio | Projetos independentes, com versão de origem registrada | Não estabelece sincronização contínua de correções ou configurações externas |
| [Vercel: create-turbo](https://turborepo.dev/docs/reference/create-turbo) | Geração de monorepo e distinção de exemplos mantidos pelo time/comunidade | Poucos perfis oficialmente suportados e testados | Gerar o monorepo não entrega segurança ou operação Railway |

Inferência de projeto: a Renova se beneficia desses mecanismos sem precisar
operar o portal de outra empresa. Nenhuma fonte prova que pessoas não técnicas
conseguirão usar a base; isso depende do piloto definido na spec.

## Autenticação e segurança

| Fonte | Evidência aplicável | Decisão proposta |
| --- | --- | --- |
| [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) | Negar por padrão e verificar acesso em cada requisição | Política explícita por operação; isolamento por proprietário testado no backend |
| [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) | Sessão, cookies, expiração e invalidação exigem controles próprios | Biblioteca mantida, sessão no servidor, cookie seguro; nenhum token de sessão em localStorage |
| [OWASP REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html) | Validação, limites, HTTPS, erros, CORS e logs | Segurança básica também no perfil sem login |
| [OWASP ASVS](https://owasp.org/projects/asvs) | Referência versionada de controles verificáveis; versão estável consultada 5.0.0 | Matriz risco/controle/teste; não declarar conformidade integral ou certificação |
| [Better Auth: Fastify](https://better-auth.com/docs/integrations/fastify) | Integração documentada de handler e leitura de sessão | Candidato para um spike limitado antes da adoção |
| [Better Auth: segurança](https://better-auth.com/docs/reference/security) | Controles de origem, CSRF, sessão e limitação de requisições configuráveis | Não desabilitar os controles; verificar separadamente mutations da aplicação |

O spike deve verificar Fastify, Postgres, migrations, Vite, proxy de mesma
origem, múltiplos Set-Cookie, recuperação de acesso e contexto tRPC. A proteção
do handler de autenticação não prova proteção das operações do produto.
Autenticação identifica; autorização decide qual registro essa pessoa acessa.

## Railway e fronteira de publicação

[Config as Code](https://docs.railway.com/config-as-code) permite versionar
build/start/healthcheck, mas não substitui a configuração inicial de acessos e
recursos. [Rede privada](https://docs.railway.com/networking/private-networking)
serve à comunicação entre serviços no ambiente. O navegador usa o domínio do
frontend; o proxy encaminha `/api` ao backend.

[Wait for CI](https://docs.railway.com/deployments/github-autodeploys) considera
o resultado dos workflows GitHub Actions. Execuções neutras ou ignoradas não
bloqueiam; cancelamentos têm regras próprias. Por isso a proposta inclui um
resultado final obrigatório que falha se um gate obrigatório falhar, cancelar
ou não executar, além de migrations em etapa própria de publicação.

## Blacksmith no CI

Escolha confirmada pelo usuário: GitHub Actions com runners Blacksmith.
O [Quickstart](https://docs.blacksmith.sh/introduction/quickstart) exige instalação
do App e acesso ao repositório. A [documentação dos runners](https://docs.blacksmith.sh/blacksmith-runners/overview)
limita suporte a organizações GitHub, não contas pessoais. O novo repo precisa
ser habilitado; isso não acompanha os arquivos clonados.

Labels Linux x64 propostas: `blacksmith-2vcpu-ubuntu-2404` para checks rápidos e
`blacksmith-4vcpu-ubuntu-2404` para integração/browser. A seleção é inicial;
nenhum ganho de velocidade ou custo foi medido no Renova.
[Cache de dependências](https://docs.blacksmith.sh/blacksmith-caching/dependencies-actions)
usa as actions upstream compatíveis; forks `useblacksmith/setup-node` e
`useblacksmith/cache` foram arquivados. Manter proteção por branch/tag.

[Service containers Postgres no GitHub](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers)
fornecem DB descartável por job; o [cache de containers Blacksmith](https://docs.blacksmith.sh/blacksmith-caching/docker-container-caching)
é cache de imagem, não de dados de teste. [Playwright CI](https://playwright.dev/docs/ci)
requer instalação de browser/dependências e recomenda começar com um worker.
O conjunto precisa de execução real no piloto.

[Docker builds](https://docs.blacksmith.sh/blacksmith-caching/docker-builds) recomenda
actions v2, embora o Quickstart consultado ainda mostre setup v1. Reconfirmar a
versão e fixar SHA na implementação. Cache de camadas é opcional, cobrado à parte
e não se aplica automaticamente ao build Railway.
[Preço](https://www.blacksmith.sh/pricing) e franquia devem ser conferidos na
habilitação: consumo/franquia são da organização, não de cada clone.

[Segurança](https://www.blacksmith.sh/security) descreve permissões do App e
[administração](https://docs.blacksmith.sh/blacksmith-administration/permissions)
define controle por acesso GitHub. Conferir permissões reais na instalação;
não fornecer secrets de produção a jobs de PR. Não foram inspecionados billing,
instalação do App nem execuções da organização nesta pesquisa.

## Base Renova inspecionada

- Template: `d0c2db9`, inicialmente limpo. Harness real; aplicação sample,
  sem backend/Postgres/deploy. E2E não bloqueante em `.github/workflows/ci.yml:41`.
- `scripts/check-full:11-15` tem seleção de integração incompatível com o
  include de `vitest.loop.config.ts:18`.
- `scripts/harness/rules/import-direction.mjs:21` conhece `@project/sample`;
  renomear o scope pode escapar da regra.
- Fonte Renova: revisão remota
  [73830f8](https://github.com/Renova-AI-Tech/renova-monorepo/tree/73830f818932ea6d441b384ddca593c7093897ac).
  O checkout local tem WIP e não é fonte para cópia automática.
- `@renova/ui` é interno e privado. Extrair tokens, fontes e componentes;
  remover nomes de pessoas, regras de atuação e dependência de CSS do app.
- Auth e `platform-core` têm dependências de organizações e módulos do produto.
  Extrair padrões; não transportar sua política de acesso ou migrations.
- Inventário observado em 19/10: GitHub template privado e `is_template=false`;
  rulesets retornaram limitação de plano. Railway Renova usa frontend/backend/DB
  separados e `checkSuites=false`. Esses dados exigem nova leitura antes de agir.

## Alternativas consideradas

| Alternativa | Benefício | Custo | Parecer |
| --- | --- | --- | --- |
| Template + perfis + receitas locais | Clone independente; poucas combinações; funciona com IA ou terminal | Manter receitas e matriz de validação | Recomendada |
| Catálogo livre de módulos desde o início | Mais combinações imediatas | Explosão de testes e decisões para iniciante | Adiar até haver demanda e suporte |
| Portal interno com orquestração central | Interface web e administração central | Novo produto para hospedar, proteger e operar | Fora da v1 |

Pacote central de UI pode reduzir divergência futura, mas adiciona distribuição,
acesso ao registry e compatibilidade. A v1 incorpora UI no workspace e registra
origem; atualizações chegam por alterações revisáveis, nunca por sobrescrita.
