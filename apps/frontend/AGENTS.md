# Frontend do projeto

- A rota `/` pertence ao produto. Comece em `src/pages/HomePage.tsx`; ela é
  inicialmente um guia substituível, sem consulta à API nem carga da referência.
  Ao criar o produto, substitua o guia; não acrescente funcionalidades dentro dele como se fosse o app final.
- `/referência` (alias `/referencia`) é a biblioteca de consulta. A página está
  em `src/pages/ReferencePage.tsx` e a galeria em `src/reference/ReferenceGallery.tsx`.
  Reutilize seus exemplos no produto; não implemente funcionalidades do produto
  dentro da referência.
- A seleção das rotas vive em `src/App.tsx`. Rotas desconhecidas exibem 404;
  atualize a seleção e os testes ao adicionar uma página de produto.
- Componentes compartilhados vêm de `@renova/ui`; preserve seus tokens,
  acessibilidade e fontes locais. A logo oficial está em `public/renova-logo.png`;
  origem em `public/NOTICE.md`. Não redesenhe a marca com texto ou ícones.
- Frontend só importa tipos de `@renova/backend/contract`; consultas ficam em
  `src/api.ts`. Nada de acesso ao banco, segredos ou runtime do backend no browser.
- Valide os testes de navegador afetados com `pnpm test:e2e`, incluindo abertura
  direta da rota, largura de 390 pixels, teclado e estados de erro/carregamento.
