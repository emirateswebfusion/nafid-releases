import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

// Inject Electron API Polyfill
import './electronPolyfill';

import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
