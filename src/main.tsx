import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
// index.html stellt den Mount-Punkt bereit; StrictMode prüft in Entwicklung unter anderem Effekt-Cleanups.
const root = document.getElementById('root');
if (!root) throw new Error('Der Mount-Punkt #root fehlt.');
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
