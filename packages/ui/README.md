# UI Renova

Componentes, tokens e fontes pertencem a este workspace. A aplicação deve importar
`@renova/ui/globals.css` uma vez, na entrada, e usar o plugin `@tailwindcss/vite`.
Os arquivos de fonte são empacotados pelo Vite; não há chamada ao Google Fonts.

```tsx
import '@renova/ui/globals.css';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@renova/ui';
```

Imports granulares também estão disponíveis, por exemplo
`@renova/ui/components/ui/button` e `@renova/ui/components/drawer-shell`.
Nenhum componente depende de aplicações, autenticação, banco ou domínio de negócio.

O `AppSidebar` recebe navegação e identidade explicitamente. Sem `userName` ele
não exibe identidade fictícia; o painel de contexto inicia oculto. Quem consome o
sidebar monta o comportamento de navegação móvel da aplicação. `DrawerShell`
exige título e aceita uma descrição acessível. O `ChartContainer` recebe somente
configuração visual confiável declarada no código, não valores CSS de usuários.

O tema inicial é claro. A existência de seletores herdados de dark mode não
representa suporte visual completo ao modo escuro.

Validação do pacote: `pnpm --filter @renova/ui test` e
`pnpm --filter @renova/ui typecheck`. A jornada do navegador também valida fontes,
foco, teclado e viewport estreito; testes unitários não substituem essa prova.

Procedência e condições da extração: [NOTICE.md](NOTICE.md).
