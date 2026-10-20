# Validação da simplificação e entrega

Data: 19/10/2026. Escopo autorizado: configurador, retirada do exemplo anterior,
readiness independente da demonstração, revisão da entrega, PR/merge e clone real.

## Contrato atualizado

- `pnpm run setup` pede nome e confirmação. O resumo informa sem login/local;
  opções ainda indisponíveis não são oferecidas. JSON mantém validação fechada.
- `pnpm dev` sem ambiente orienta setup; falha de pré-requisito orienta doctor.
- Só existem frontend, backend e pacotes Renova. O exemplo financeiro, sua porta,
  specs e testes exclusivos saíram; regras do harness e gates permanecem.
- Readiness valida conexão, versão e checksums das migrations, sem exigir uma
  tabela de demonstração. Schema específico de produto é validado por seus testes.
- As skills do Claude usam symlink real. CODEOWNERS traz somente exemplos comentados.
  Script de CI sem consumidor foi removido. Estado local e segredos ficam fora do Git.

## Evidências

- `pnpm check:full` passou: 37 harness, 36 unit/property, 15 UI, 89 integração e
  14 navegador — **191 testes**, build/lint/types verdes, zero retries/skips.
- A regressão real aplicou uma nova migration que remove a tabela de exemplo;
  readiness continuou verdadeira com o manifesto atualizado e falsa antes da
  aplicação ou com manifesto antigo. Testes de checksum, alvo, papéis e rollback passaram.
- A revisão independente encontrou nomes como “RH” e “99 projetos” gerando slug
  inválido. Corrigido com normalização, limite e prefixo/fallback seguros, usando
  o próprio schema. Configuração/prompts: **28/28** após a correção, incluindo nomes
  reservados, longos e sem transliteração. Identidade existente continua preservada.
- Corrigida também instrução obsoleta na pasta de integração. Inventário confirma
  cinco workspaces (duas apps e três pacotes), sem dependência/porta do exemplo antigo.
  Scan dos arquivos candidatos não encontrou segredo ou estado local elegível para commit.
- Os 17 testes exclusivos do exemplo retirado deixaram a suíte com ele. Dois
  testes de propriedade do manifesto e duas regressões de integração foram adicionados;
  as 14 novas variações de nomes entraram após o primeiro full. Nenhuma proteção foi relaxada.
- Blacksmith aprovou quality/full/required no commit `b26438c`, com 205 testes.
  A revisão remota encontrou duas falhas de reutilização no DS, corrigidas: largura
  padrão da sidebar sem provider e nome da série quando a legenda não define label.
  Navegador real confirmou 272 px sem provider e 320 px com override; UI passou em 17 testes.
- Escritas agora recusam Origin presente divergente mesmo sem cookie; chamadas
  públicas sem Origin continuam permitidas. Cookies continuam exigindo origem e prova
  CSRF. Cinco novos casos HTTP/tRPC passaram; isso não implementa autenticação.
- Após essas correções, `pnpm check:full` passou em **212 testes**: 37 harness,
  50 unit/property, 17 UI, 94 integração e 14 navegador, além de lint/types/build.
- As expectativas de quantidade/versão nos testes de migrations acompanham o
  manifesto, permitindo acrescentar migrations sem falso negativo por total fixo.
  Asserções de dados, permissões, checksum, rollback e identidade foram preservadas;
  os nove testes focados passaram novamente após esse ajuste.
- Estes resultados locais antecederam a aprovação do CI e o clone pós-merge,
  registrados na seção seguinte.

## Ensaio de clone após o merge

- PR [#1](https://github.com/Renova-AI-Tech/renova-template/pull/1) mergeada em
  `5a6ea2627f2e39a0a6beeec0e501b5a5fb3bf989`. Repositório habilitado como template privado.
  [CI da PR](https://github.com/Renova-AI-Tech/renova-template/actions/runs/39338818096)
  e [CI da main](https://github.com/Renova-AI-Tech/renova-template/actions/runs/39339367210)
  aprovaram quality/full/required no Blacksmith, com 212 testes.
- Clone real do remoto em outra pasta, sem copiar dependências, ambiente ou volumes.
  Um agente em contexto novo usou somente a documentação/skills do clone. O setup
  em terminal interativo pediu nome e confirmação e concluiu em cerca de 19 segundos;
  Node 24, pnpm e Docker já estavam instalados e o cache/store local estava disponível.
  Nenhuma edição manual de ambiente
  foi necessária para começar.
- O clone virou um catálogo público de seis recursos fictícios, com busca e categoria.
  Uma nova migration, tabela e consulta tipada usam Postgres real e o runtime somente
  leitura; a migration inicial e `/referência` foram preservadas. Nenhuma dependência
  adicional, login, escrita pública, serviço remoto ou novo framework foi necessário.
- Gate completo do catálogo: **220 testes** (37 harness, 50 unit/property, 17 UI,
  98 integração e 18 navegador), lint/types/build verdes. Imagens isoladas de
  1440 e 390 pixels foram inspecionadas. Busca, teclado, filtros, vazio e recuperação
  de erro foram exercitados; escrita foi recusada na API e pelo papel do banco.
- Repetir setup preservou hashes de 132 arquivos de código/testes/scripts, ambiente,
  identidades, configuração e lockfile, além dos seis recursos, três exemplos e
  histórico de migrations. Bancos, volumes, portas de banco e senhas dos dois
  projetos são distintos; arquivos de ambiente do template permaneceram intactos.
- A fricção documental observada foi adaptar o guia, testes da raiz, lista explícita
  de tabelas e vínculos da spec herdada ao novo produto. O README agora explica esse
  passo e que o plano de construção do template não é backlog obrigatório dos clones.
  Não foi necessário afrouxar regras, permissões, timeouts ou retries.
- O catálogo é um projeto local de ensaio; não foi criado outro repositório remoto.
  Seu relatório detalhado fica em `PILOT-REPORT.md` no clone, com resultados e fricções.

## Limites

Este é um ensaio de agente, não um piloto de usabilidade com participante leigo.
Autenticação, publicação Railway e experiência nativa Windows não são verificadas.
A inspeção direta da aba aberta foi bloqueada pela política de acesso do navegador;
a inspeção visual usou artefatos dos E2E em ambiente isolado. O GitHub informou que
proteção de branch não está disponível no plano atual deste repositório privado;
os merges dependem de conferir explicitamente os checks.
