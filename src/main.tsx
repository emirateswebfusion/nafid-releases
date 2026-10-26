import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PrintRouter } from './PrintRouter.tsx'

import { ErrorBoundary } from './components/app/ErrorBoundary';

const isPrintRoute = typeof window !== 'undefined' && window.location.hash.startsWith('#/print');

const initTheme = () => {
  if (isPrintRoute) return; // Print views should stay clean white
  const theme = localStorage.getItem('vendora-theme') || 'light';
  document.documentElement.classList.add(theme);
};
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isPrintRoute ? <PrintRouter /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
)

