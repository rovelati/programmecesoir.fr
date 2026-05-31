
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
const isStaticLeafPage = pathname.startsWith('/programme/') || pathname.startsWith('/radio/');

const crawlerFallback = document.getElementById('crawler-fallback');
if (crawlerFallback && !isStaticLeafPage) {
  crawlerFallback.remove();
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

if (isStaticLeafPage) {
  // Program/radio leaf pages are served as pre-rendered HTML snapshots.
  // Keep them as MPA/static pages instead of handing control to the SPA.
  rootElement.innerHTML = '';
} else {
const root = ReactDOM.createRoot(rootElement);
root.render(<App />);
}
