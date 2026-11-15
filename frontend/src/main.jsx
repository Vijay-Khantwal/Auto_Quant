import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const bootstrapEl = document.getElementById('bootstrap-data');
let bootstrapData = {};
if (bootstrapEl) {
  try {
    bootstrapData = JSON.parse(bootstrapEl.textContent);
  } catch (e) {
    console.warn('Failed to parse bootstrap data:', e);
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App bootstrapData={bootstrapData} />
  </React.StrictMode>
);
