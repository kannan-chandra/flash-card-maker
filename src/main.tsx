import React from 'react';
import ReactDOM from 'react-dom/client';
import 'regenerator-runtime/runtime';
import App from './App';
import { ArticlesApp } from './articles/ArticlesApp';
import './styles.css';

function restoreRedirectPath(): void {
  const url = new URL(window.location.href);
  const redirectPath = url.searchParams.get('redirect');
  if (!redirectPath || !redirectPath.startsWith('/')) {
    return;
  }

  url.searchParams.delete('redirect');
  const leftoverSearch = url.searchParams.toString();
  const joiner = redirectPath.includes('?') ? '&' : '?';
  const restoredPath = `${redirectPath}${leftoverSearch ? `${joiner}${leftoverSearch}` : ''}`;
  window.history.replaceState(null, '', restoredPath);
}

restoreRedirectPath();

const pathname = window.location.pathname;
const isLearnRoute = pathname === '/learn' || pathname.startsWith('/learn/');
document.body.style.overflow = isLearnRoute ? 'auto' : 'hidden';
document.body.classList.toggle('learn-route', isLearnRoute);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isLearnRoute ? <ArticlesApp /> : <App />}
  </React.StrictMode>
);
