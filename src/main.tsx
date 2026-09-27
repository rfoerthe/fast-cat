import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
// index.html stellt den Mount-Punkt bereit; StrictMode prüft in Entwicklung unter anderem Effekt-Cleanups.
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
