import { Button } from '@renova/ui/components/ui/button';
import { Input } from '@renova/ui/components/ui/input';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../api';

type RecordItem = Awaited<ReturnType<typeof api.records.list.query>>['items'][number];

function privateError(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data as { code?: string } | undefined;
    if (data?.code === 'UNAUTHORIZED') {
      window.location.replace('/entrar');
      return 'Seu acesso expirou. Entre novamente.';
    }
  }
  return 'Não foi possível salvar ou carregar seus registros. Tente novamente.';
}

/** Exemplo substituível: a API decide o proprietário a partir da sessão. */
export function PrivatePage() {
  const [items, setItems] = useState<RecordItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const request = useRef<AbortController | null>(null);
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');

  const loadPage = useCallback((cursor?: string) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoadError('');
    setLoading(true);
    api.records.list
      .query({ limit: 20, ...(cursor ? { cursor } : {}) }, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setItems((current) => (cursor ? [...current, ...result.items] : result.items));
        setNextCursor(result.nextCursor);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(privateError(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadPage();
    return () => request.current?.abort();
  }, [loadPage]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError('');
    setNotice('');
    try {
      const record = editing
        ? await api.records.update.mutate({ id: editing, title })
        : await api.records.create.mutate({ title });
      setTitle('');
      setEditing(null);
      setNotice(`Registro salvo: ${record.title}.`);
      loadPage();
    } catch (error) {
      setSaveError(privateError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <title>{`Minha área · ${__PROJECT_NAME__}`}</title>
      <header className="starter-header">
        <img src="/renova-logo.png" alt="Renova Consulting Group" width="2846" height="660" />
        <span>{__PROJECT_NAME__}</span>
      </header>
      <main className="private-page" aria-labelledby="private-title" data-testid="private-area">
        <p className="eyebrow">Só você tem acesso aos seus registros</p>
        <h1 id="private-title">Minha área</h1>
        <p className="lead">
          Um espaço simples para guardar suas ideias. Use este exemplo como ponto de partida para o
          seu produto.
        </p>
        <form
          className="private-form"
          onSubmit={save}
          aria-label={editing ? 'Editar registro' : 'Novo registro'}
          aria-busy={saving}
        >
          <div className="field">
            <label htmlFor="record-title">{editing ? 'Editar título' : 'Título do registro'}</label>
            <Input
              id="record-title"
              required
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={saving}
            />
          </div>
          <div className="button-row">
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando…' : editing ? 'Salvar alteração' : 'Adicionar registro'}
            </Button>
            {editing && (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setEditing(null);
                  setTitle('');
                  setSaveError('');
                }}
              >
                Cancelar edição
              </Button>
            )}
          </div>
          {saveError && (
            <p className="auth-error" role="alert">
              {saveError}
            </p>
          )}
          {notice && (
            <p role="status" data-testid="saved-record">
              {notice}
            </p>
          )}
        </form>
        <section className="private-records" aria-labelledby="records-title" aria-busy={loading}>
          <h2 id="records-title">Seus registros</h2>
          {loading && (
            <p role="status" data-testid="private-loading">
              Carregando seus registros…
            </p>
          )}
          {loadError && (
            <div className="auth-result" data-testid="private-error">
              <p role="alert">{loadError}</p>
              <Button variant="outline" onClick={() => loadPage()}>
                Tentar novamente
              </Button>
            </div>
          )}
          {!loading && !loadError && items.length === 0 && (
            <p data-testid="private-empty">
              Nenhum registro ainda. Adicione sua primeira ideia acima.
            </p>
          )}
          <ul className="private-list">
            {items.map((item) => (
              <li key={item.id} data-testid="private-record">
                <h3>{item.title}</h3>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  aria-label={`Editar ${item.title}`}
                  onClick={() => {
                    setEditing(item.id);
                    setTitle(item.title);
                    setSaveError('');
                    setNotice('');
                    document.getElementById('record-title')?.focus();
                  }}
                >
                  Editar
                </Button>
              </li>
            ))}
          </ul>
          {nextCursor && (
            <Button variant="outline" disabled={loading} onClick={() => loadPage(nextCursor)}>
              Carregar mais
            </Button>
          )}
        </section>
        <a className="starter-text-link" href="/referência">
          Consultar componentes Renova
        </a>
      </main>
    </>
  );
}
