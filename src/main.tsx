import React from 'react';
import ReactDOM from 'react-dom/client';
import 'regenerator-runtime/runtime';
import App from './App';
import { GuidesApp } from './guides/GuidesApp';
import './styles.css';

const pathname = window.location.pathname;
const isGuidesRoute = pathname === '/guides' || pathname.startsWith('/guides/');
document.body.style.overflow = isGuidesRoute ? 'auto' : 'hidden';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isGuidesRoute ? <GuidesApp /> : <App />}
  </React.StrictMode>
);
