# Feature map

Ponto de vista do usuário. Skill [verify-app](../../.agents/skills/verify-app/SKILL.md)
percorre estas jornadas; Playwright usa os mesmos nomes acessíveis e seletores.

## Base Renova

Prepare com `pnpm run setup`; `pnpm dev` mostra o endereço local.
O perfil público é somente leitura. O perfil autenticado acrescenta as jornadas
abaixo; sua referência continua pública e sintética.

| Jornada | Como chegar | Seletores / nomes | Oráculo | Pegadinha |
| --- | --- | --- | --- | --- |
| Começar o produto | `/` | `product-home` | Guia de três passos, link para referência e ajuda acessível por teclado, sem API ou chunk da galeria | Substituir o guia em HomePage.tsx pelo produto |
| Abrir a referência | `/referência` ou `/referencia` diretamente e após refresh | logo Renova Consulting Group | Mesma galeria, logo local oficial, Unicode normalizado | Caminho codificado também funciona |
| Rota inexistente | `/pagina-inexistente` | Página não encontrada | 404 visual com links para produto e referência | No Railway, rota sem extensão usa fallback SPA com HTTP 200; API e assets inexistentes retornam HTTP 404 |
| Consultar exemplos | `/referência` → Visão geral | `api-status`, `public-record` | API conectada e 3 registros sintéticos do DB real | Não confundir loading com lista vazia |
| Recuperar falha | Visão geral → erro → Tentar novamente | `records-error`, botão Tentar novamente | Alerta some e dados reaparecem após conexão voltar | Interceptação do E2E prova estado de UI; indisponibilidade do DB tem integração própria |
| Lista vazia | Visão geral sem resultados | `records-empty` | Mensagem sem erro nem dados inventados | Cenário de UI simulado explicitamente |
| Explorar componentes | Componentes / Explorar componentes | `component-gallery`, tabs | Fontes locais e controles instalados funcionam | Exemplos interativos não salvam dados |
| Usar teclado | Foco Visão geral → seta → Componentes | tabs, Selecionar exemplo, Exibição compacta | Seleção/foco e Space funcionam | Manter foco visível |
| Abrir e fechar painel | Galeria → Abrir painel → Esc | dialog, Fechar painel | Foco contido e restaurado no acionador | Testar também em 390 px |
| Celular | Viewport 390 px | visão geral e galeria | Sem scroll horizontal; controles e painel utilizáveis | Inspeção visual além de medida de largura |

## Perfil com login

Conta liberada pelo responsável, sem cadastro público. Os testes usam Postgres e
caixa de email descartáveis. A caixa local captura mensagens, sem entrega externa.
No Railway, transporte Resend e jornada foram ensaiados em piloto isolado. Consulte
a evidência própria em
[railway-validation.md](renova-project-template/railway-validation.md).

| Jornada | Como chegar | Oráculo |
| --- | --- | --- |
| Entrar no produto | `/` sem sessão → `/entrar` | Nenhum conteúdo privado; email/senha, recuperação e referência acessíveis |
| Ativar conta | Convite administrativo → link em `/ativar` | Senha 15–128 sem truncamento; token único; conta pendente não entra |
| Recuperar acesso | `/recuperar` → email local → `/redefinir-senha` | Resposta genérica, senha nova funciona e sessões anteriores são rejeitadas |
| Sair | Barra da conta → Sair | Retorna à entrada; sessão revogada no servidor |
| Trabalhar com dados privados | `/minha-area` | Criar/listar/editar; outro usuário não vê nem altera pelo ID |
| Link indisponível | Ativação/recuperação expirada ou reutilizada | Mensagem compreensível e opção de solicitar novo link, sem expor token |
| Celular e teclado | Entrada em 390 px, Tab e envio | Foco visível, labels, erros úteis e ausência de overflow |

O guia inicial em `/` continua substituível no perfil autenticado, dentro do gate
de acesso. Cada nova operação da API também precisa declarar sua política;
proteção visual sozinha não autoriza dados privados.
