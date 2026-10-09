import { required } from './lib/assert';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
createRoot(required(document.getElementById('root'))).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
