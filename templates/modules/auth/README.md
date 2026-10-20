# Receita de autenticação

Conteúdo de instalação, fora dos workspaces da aplicação pública. O uso do perfil
está no [guia de acesso](../../../docs/process/authentication.md).

`files/` espelha os caminhos que serão criados ou substituídos em um clone novo.
`recipe.json` registra o SHA-256 dos arquivos da base que podem ser substituídos;
`null` significa arquivo novo. O gerador verifica todos antes de escrever. O
lockfile autenticado já está resolvido e o setup usa `--frozen-lockfile`.

Depois de instalado, edite o código normal em `apps/`, `packages/` e `tests/`.
O setup não sincroniza essa receita sobre um produto personalizado.

Manutenção deste template: altere as fontes em `files/`, gere o lockfile em uma
cópia isolada com as versões explícitas dos manifests e revise os hashes da base
em `recipe.json`. Não atualize hashes para esconder conflitos de um produto.
Execute `pnpm test:profiles` para conferir os dois projetos antes de publicar.
