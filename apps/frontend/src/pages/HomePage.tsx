import { Button } from '@renova/ui/components/ui/button';

/** Guia inicial substituível pelo produto. A biblioteca permanece em /referência. */
export function HomePage() {
  return (
    <>
      <title>{__PROJECT_NAME__}</title>
      <a className="skip-link" href="#home-content">
        Ir para o conteúdo
      </a>
      <header className="starter-header">
        <img src="/renova-logo.png" alt="Renova Consulting Group" width="2846" height="660" />
        <span>Guia inicial</span>
      </header>
      <main
        className="product-home"
        id="home-content"
        aria-labelledby="home-title"
        data-testid="product-home"
      >
        <section className="starter-intro" aria-labelledby="home-title">
          <p className="eyebrow">{__PROJECT_NAME__}</p>
          <h1 id="home-title">Seu projeto começa aqui.</h1>
          <p className="lead">
            Uma base pronta para transformar sua ideia em um projeto, com ou sem ajuda de IA. Este
            guia é temporário: a página inicial será a primeira tela do seu produto.
          </p>
        </section>

        <ol className="starter-steps" aria-label="Primeiros passos">
          <li>
            <span className="record-number" aria-hidden="true">
              01
            </span>
            <h2>Explore a referência</h2>
            <p>Conheça as cores, os componentes e os exemplos Renova antes de começar.</p>
            <Button asChild variant="outline" size="sm">
              <a href="/referência">Abrir referência</a>
            </Button>
          </li>
          <li>
            <span className="record-number" aria-hidden="true">
              02
            </span>
            <h2>Conte sua ideia</h2>
            <p>
              Explique o que quer criar, para quem e qual é a primeira tarefa que precisa funcionar.
            </p>
            <a className="starter-text-link" href="#ai-prompt">
              Ver um pedido para a IA
            </a>
          </li>
          <li>
            <span className="record-number" aria-hidden="true">
              03
            </span>
            <h2>Faça o projeto ser seu</h2>
            <p>
              Substitua este guia pela sua primeira tela. A referência continua separada para
              consulta.
            </p>
            <span className="starter-step-note">Comece pequeno. Valide cada mudança.</span>
          </li>
        </ol>

        <section className="starter-prompt" aria-labelledby="ai-prompt">
          <p className="eyebrow">Para começar com IA</p>
          <h2 id="ai-prompt">Uma ideia bem explicada já é um bom começo.</h2>
          <p>Copie este pedido para a conversa com sua IA e preencha os trechos entre colchetes:</p>
          <blockquote>
            Leia o AGENTS.md e o README deste repositório. Quero criar [sua ideia] para [quem vai
            usar]. A primeira tarefa é [o que precisa funcionar]. Planeje uma versão simples e
            substitua o guia da página inicial pelo meu produto, usando os componentes Renova.
            Mantenha /referência como consulta e valide cada mudança.
          </blockquote>
        </section>

        <details className="starter-help">
          <summary>Onde editar e como verificar o ambiente</summary>
          <div>
            <p>
              O guia fica em <code>apps/frontend/src/pages/HomePage.tsx</code>. Você ou sua IA podem
              substituir seu conteúdo. As instruções completas estão no <code>README.md</code>.
            </p>
            <dl>
              <div>
                <dt>Preparar o projeto</dt>
                <dd>
                  <code>pnpm run setup</code>
                </dd>
              </div>
              <div>
                <dt>Iniciar o ambiente</dt>
                <dd>
                  <code>pnpm dev</code>
                </dd>
              </div>
              <div>
                <dt>Entender um problema</dt>
                <dd>
                  <code>pnpm run doctor</code>
                </dd>
              </div>
            </dl>
            <p>
              Execute os comandos no terminal da pasta do projeto. O diagnóstico não altera seus
              arquivos.
            </p>
          </div>
        </details>
        <footer className="starter-footer">
          Seu projeto roda localmente. Consulte a documentação antes de publicar no Railway.
        </footer>
      </main>
    </>
  );
}
