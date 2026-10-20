# Integração

Testes de Postgres, HTTP e preparação local ficam em `*.test.ts` nesta pasta.
Execute `pnpm test:integration`; o comando prepara bancos descartáveis e nunca
usa o banco de desenvolvimento. Não execute testes contra credenciais reais.

`pnpm check:full` e o CI executam integração obrigatoriamente. Acrescente o teste
da sua feature junto da implementação e preserve as proteções de isolamento.
