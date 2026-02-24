import React from 'react';
import ReactDOM from 'react-dom/client';
import 'regenerator-runtime/runtime';
import App from './App';
import { ArticlesApp } from './articles/ArticlesApp';
import './styles.css';

const pathname = window.location.pathname;
const isLearnRoute = pathname === '/learn' || pathname.startsWith('/learn/');
document.body.style.overflow = isLearnRoute ? 'auto' : 'hidden';
document.body.classList.toggle('learn-route', isLearnRoute);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isLearnRoute ? <ArticlesApp /> : <App />}
  </React.StrictMode>
);
