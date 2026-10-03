import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { CartProvider } from './context/CartContext.jsx';
import { CanteenProvider } from './context/CanteenContext.jsx';

import './styles/base.css';
import './styles/app.css';

// Provider order matters:
//   Toast   - everything below can raise a toast
//   Cart    - toasts when an item is added
//   Auth    - api layer needs the refresh handler before the first request
//   Canteen - polls the API, so Auth must already be mounted
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <CartProvider>
            <CanteenProvider>
              <App />
            </CanteenProvider>
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);