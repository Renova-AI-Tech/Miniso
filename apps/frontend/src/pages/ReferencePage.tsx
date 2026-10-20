import { Badge } from '@renova/ui/components/ui/badge';
import { Button } from '@renova/ui/components/ui/button';
import { Skeleton } from '@renova/ui/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renova/ui/components/ui/tabs';
import { EmptyState } from '@renova/ui/components/empty-state';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { ReferenceGallery } from '../reference/ReferenceGallery';

type PublicPage = Awaited<ReturnType<typeof api.public.list.query>>;
type RecordsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: PublicPage };

function PublicRecords() {
  const [state, setState] = useState<RecordsState>({ status: 'loading' });
  const [request, setRequest] = useState<{ cursor?: string }>({});

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    api.public.list
      .query({ limit: 100, ...request }, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [request]);

  return (
    <section className="records-section" aria-labelledby="records-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Explore a base</p>
          <h2 id="records-title">Exemplos públicos</h2>
        </div>
        <Badge variant="outline">Somente leitura</Badge>
      </div>
      <p className="section-description">
        Conteúdo fictício para explorar seu projeto. Estes exemplos são públicos e podem ser vistos
        por qualquer pessoa.
      </p>
      <div className="connection-status" role="status" data-testid="api-status">
        <span className={`status-dot status-dot--${state.status}`} aria-hidden="true" />
        {state.status === 'loading'
          ? 'Conectando'
          : state.status === 'error'
            ? 'Conexão indisponível'
            : 'API conectada'}
      </div>
      {state.status === 'loading' && (
        <div
          className="record-grid"
          role="status"
          aria-label="Carregando exemplos"
          aria-busy="true"
          data-testid="records-loading"
        >
          {[0, 1, 2].map((item) => (
            <div className="record-card" key={item}>
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="mt-4 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-3/4" />
            </div>
          ))}
        </div>
      )}
      {state.status === 'error' && (
        <div className="connection-error" role="alert" data-testid="records-error">
          <span className="material-symbols-outlined" aria-hidden="true">
            cloud_off
          </span>
          <div>
            <h3>Não foi possível carregar os exemplos</h3>
            <p>Verifique se os serviços do projeto estão em execução e tente novamente.</p>
          </div>
          <Button variant="outline" onClick={() => setRequest((value) => ({ ...value }))}>
            Tentar novamente
          </Button>
        </div>
      )}
      {state.status === 'ready' && (
        <>
          {state.data.items.length === 0 ? (
            <div data-testid="records-empty">
              <EmptyState>Nenhum exemplo público por aqui ainda.</EmptyState>
            </div>
          ) : (
            <ul className="record-grid" data-testid="public-records">
              {state.data.items.map((record, index) => (
                <li className="record-card" key={record.id} data-testid="public-record">
                  <span className="record-number" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3>{record.title}</h3>
                  <p>{record.description}</p>
                </li>
              ))}
            </ul>
          )}
          {(request.cursor || state.data.nextCursor) && (
            <div className="button-row pagination">
              {request.cursor && (
                <Button variant="outline" onClick={() => setRequest({})}>
                  Voltar ao início
                </Button>
              )}
              {state.data.nextCursor && (
                <Button
                  onClick={() =>
                    setRequest(state.data.nextCursor ? { cursor: state.data.nextCursor } : {})
                  }
                >
                  Próximos exemplos
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default function ReferencePage() {
  const [section, setSection] = useState('overview');
  const componentsTab = useRef<HTMLButtonElement>(null);
  function showComponents() {
    setSection('components');
    componentsTab.current?.focus();
  }
  return (
    <Tabs value={section} onValueChange={setSection} className="project-shell">
      <title>{`Referência · ${__PROJECT_NAME__}`}</title>
      <a className="skip-link" href="#main-content">
        Ir para o conteúdo
      </a>
      <aside className="project-sidebar" aria-label="Identidade e navegação da referência">
        <a className="brand" href="/referência" aria-label="Renova · referência">
          <img src="/renova-logo.png" alt="Renova Consulting Group" width="2846" height="660" />
        </a>
        <div className="sidebar-project">
          <span className="sidebar-project-icon material-symbols-outlined" aria-hidden="true">
            auto_stories
          </span>
          <div>
            <span className="eyebrow">Biblioteca Renova</span>
            <p>Referência do projeto</p>
          </div>
        </div>
        <p className="navigation-label">Explore</p>
        <TabsList className="project-navigation" aria-label="Navegação da referência">
          <TabsTrigger value="overview">
            <span className="material-symbols-outlined" aria-hidden="true">
              space_dashboard
            </span>
            Visão geral
          </TabsTrigger>
          <TabsTrigger value="components" ref={componentsTab}>
            <span className="material-symbols-outlined" aria-hidden="true">
              widgets
            </span>
            Componentes
          </TabsTrigger>
        </TabsList>
        <div className="sidebar-bottom">
          <a href="/" className="product-link">
            <span className="material-symbols-outlined" aria-hidden="true">
              arrow_outward
            </span>
            Ir para o projeto
          </a>
          <p className="sidebar-note">
            Exemplos para consultar.
            <br />
            Um projeto livre para criar.
          </p>
        </div>
      </aside>
      <div className="project-main">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Referência</span>
            <span aria-hidden="true">/</span>
            <strong>{section === 'overview' ? 'Visão geral' : 'Componentes'}</strong>
          </div>
          <Badge variant="outline">Acesso público</Badge>
        </header>
        <main id="main-content" className="page" tabIndex={-1}>
          <TabsContent value="overview">
            <section className="welcome" aria-labelledby="welcome-title">
              <p className="eyebrow">Referência para criar com consistência</p>
              <h1 id="welcome-title">
                Sua próxima ideia.
                <br />
                <em>Com a identidade Renova.</em>
              </h1>
              <p className="lead">
                Uma biblioteca de componentes, estilos e exemplos para acompanhar a construção de{' '}
                {__PROJECT_NAME__}. Explore, experimente e leve o que precisar para o seu projeto.
              </p>
              <Button variant="accent" onClick={showComponents}>
                Explorar componentes
                <span className="material-symbols-outlined" aria-hidden="true">
                  arrow_forward
                </span>
              </Button>
              <div className="welcome-meta">
                <span>01 / Identidade</span>
                <span>02 / Componentes</span>
                <span>03 / Exemplos</span>
              </div>
            </section>
            <PublicRecords />
            <div className="getting-started">
              <span className="material-symbols-outlined" aria-hidden="true">
                auto_awesome
              </span>
              <div>
                <h2>O seu produto começa na página inicial</h2>
                <p>
                  Esta página é uma referência. A página inicial está livre para você construir sua
                  experiência, com ajuda da IA e dos componentes desta biblioteca.
                </p>
              </div>
              <Button variant="link" onClick={showComponents}>
                Conhecer a galeria<span aria-hidden="true"> →</span>
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="components">
            <ReferenceGallery />
          </TabsContent>
          <footer className="page-footer">
            <span>Referência · {__PROJECT_NAME__}</span>
            <span>Renova Consulting Group</span>
          </footer>
        </main>
      </div>
    </Tabs>
  );
}
