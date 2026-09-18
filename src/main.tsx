import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';

const host = document.getElementById('root');
if (!host) throw new Error('Missing #root — index.html and main.tsx have diverged.');

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
