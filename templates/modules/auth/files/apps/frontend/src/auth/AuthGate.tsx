import { Button } from '@renova/ui/components/ui/button';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { authPost, readSession, readableError, type AuthSession } from './client';

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  const verifyAccess = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSession(null);
    setError('');
    readSession(controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        if (!value) window.location.replace('/entrar');
        else setSession(value);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(readableError(failure));
      });
  }, []);

  useEffect(() => {
    verifyAccess();
    function checkRestoredPage(event: PageTransitionEvent) {
      if (event.persisted) verifyAccess();
    }
    window.addEventListener('pageshow', checkRestoredPage);
    return () => {
      request.current?.abort();
      window.removeEventListener('pageshow', checkRestoredPage);
    };
  }, [verifyAccess]);

  async function signOut() {
    setSigningOut(true);
    setLogoutError('');
    try {
      await authPost('sign-out', {}, 'Não foi possível sair. Tente novamente.');
      window.location.replace('/entrar');
    } catch (failure) {
      setLogoutError(readableError(failure));
      setSigningOut(false);
    }
  }

  if (!session) {
    return (
      <main className="auth-pending" aria-label="Verificação de acesso">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <Button onClick={verifyAccess}>Tentar novamente</Button>
          </>
        ) : (
          <p role="status">Verificando seu acesso…</p>
        )}
      </main>
    );
  }

  return (
    <>
      <nav className="account-bar" aria-label="Sua conta">
        <div>
          <span>Você está conectado como</span>
          <strong>{session.user.name}</strong>
        </div>
        <div className="account-actions">
          <a href="/">Início</a>
          <a href="/minha-area">Minha área</a>
          <Button variant="outline" size="sm" disabled={signingOut} onClick={signOut}>
            {signingOut ? 'Saindo…' : 'Sair'}
          </Button>
        </div>
        {logoutError && (
          <p className="account-error" role="alert">
            {logoutError}
          </p>
        )}
      </nav>
      {children}
    </>
  );
}
