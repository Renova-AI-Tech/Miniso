import { lazy, Suspense } from 'react';
import DashboardPage from './pages/DashboardPage';
import { NotFoundPage } from './pages/NotFoundPage';

const ReferencePage = lazy(() => import('./pages/ReferencePage'));

function pathname() {
  return decodeURIComponent(window.location.pathname).normalize('NFC').replace(/\/$/, '') || '/';
}

export function App() {
  const currentPath = pathname();
  if (currentPath === '/') return <DashboardPage />;
  if (currentPath === '/referência' || currentPath === '/referencia') {
    return (
      <Suspense fallback={<main aria-busy="true">Carregando referência…</main>}>
        <ReferencePage />
      </Suspense>
    );
  }
  return <NotFoundPage />;
}
