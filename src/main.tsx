import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './App.tsx';
import './i18n';
import './index.css';
import { applyTheme, getClientConfig } from './config/clientConfig';

applyTheme(getClientConfig().theme);

const container = document.getElementById('root')!;
const tree = (
  <StrictMode>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </StrictMode>
);

// Marketing routes (/, /terms, /about) are prerendered to real HTML at build
// time and flagged with window.__SSG__, so we hydrate them. Every other route
// is served the empty SPA shell, so we render fresh. The lazy route components
// sit inside a Suspense boundary (RootLayout), so React 19 keeps the
// prerendered markup visible and hydrates once each chunk loads — no flash.
if ((window as unknown as { __SSG__?: boolean }).__SSG__) {
  hydrateRoot(container, tree);
} else {
  createRoot(container).render(tree);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}
