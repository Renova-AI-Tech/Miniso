import { lazy, Suspense } from 'react';
import { AuthGate } from './auth/AuthGate';
import { AuthPage } from './pages/AuthPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PrivatePage } from './pages/PrivatePage';
import './auth/auth.css';

const ReferencePage = lazy(() => import('./pages/ReferencePage'));

function readPathname() {
  try {
    return decodeURIComponent(window.location.pathname).normalize('NFC').replace(/\/$/, '') || '/';
  } catch {
    return null;
  }
}

export function App() {
  const pathname = readPathname();
  if (pathname === '/entrar') return <AuthPage mode="login" />;
  if (pathname === '/ativar') return <AuthPage mode="activate" />;
  if (pathname === '/recuperar') return <AuthPage mode="recover" />;
  if (pathname === '/redefinir-senha') return <AuthPage mode="reset" />;
  if (pathname === '/')
    return (
      <AuthGate>
        <HomePage />
      </AuthGate>
    );
  if (pathname === '/minha-area')
    return (
      <AuthGate>
        <PrivatePage />
      </AuthGate>
    );
  if (pathname === '/referência' || pathname === '/referencia') {
    return (
      <Suspense fallback={<main aria-label="Carregando referência" aria-busy="true" />}>
        <ReferencePage />
      </Suspense>
    );
  }
  return <NotFoundPage />;
}
