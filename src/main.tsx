import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import { ErrorBoundary } from './components/ErrorBoundary';

const initTheme = () => {
  const theme = localStorage.getItem('vendora-theme') || 'light';
  document.documentElement.classList.add(theme);
};
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
