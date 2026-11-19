import React from 'react';
import ReactDOM from 'react-dom/client';
import NetworkDashboard from './components/NetworkDashboard';
import './app/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <NetworkDashboard />
  </React.StrictMode>
);
