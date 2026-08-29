import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../styles/globals.css';
import { initializeAIStore } from '../stores/aiStore';
import { I18nProvider } from '../i18n';

// Initialize AI store from persistent storage
initializeAIStore();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
