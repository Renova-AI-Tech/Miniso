# Revisão de PR

Humano (ou revisor em contexto fresco) revisa **evidência**. Autor ≠ revisor.

1. Título descreve o resultado e o PR tem um objetivo claro. Link externo é opcional.
2. Template preenchido — camadas distintas.
3. Se houver spec, `tasks.md`: `done` tem `it` verdadeiro (`harness:check`).
4. Frente **Testes provam?**: distinguiria implementação errada?
5. Frente **Tela**: `verify-app` / E2E, ou o log diz que **não** conferiu.
6. Frente **Harness**: não desliga regra, não sobe timeout no escuro.
7. Se o projeto ativou CODEOWNERS, conferir responsáveis reais nas áreas protegidas; o template só inclui exemplos comentados.

Não mergear com “integração fica com o CI”. Não aceitar screenshot no lugar do teste dono. Não retryar flake — isole o teste.
