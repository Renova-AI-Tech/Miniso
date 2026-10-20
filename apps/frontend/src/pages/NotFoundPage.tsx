export function NotFoundPage() {
  return (
    <main className="not-found" aria-labelledby="not-found-title">
      <title>{`Página não encontrada · ${__PROJECT_NAME__}`}</title>
      <p className="eyebrow">404</p>
      <h1 id="not-found-title">Página não encontrada</h1>
      <p>Confira o endereço ou escolha por onde continuar.</p>
      <nav aria-label="Páginas disponíveis">
        <a href="/">Página inicial</a>
        <a href="/referência">Referência de componentes</a>
      </nav>
    </main>
  );
}
