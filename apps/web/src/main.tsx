import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { applyStoredFontScale } from './components/profile/fontScale';
import './lib/i18n';
import './index.css';

applyStoredFontScale();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
