import { lazy, Suspense } from 'react';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';

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
  if (pathname === '/') return <HomePage />;
  if (pathname === '/referência' || pathname === '/referencia') {
    return (
      <Suspense fallback={<main aria-label="Carregando referência" aria-busy="true" />}>
        <ReferencePage />
      </Suspense>
    );
  }
  return <NotFoundPage />;
}
