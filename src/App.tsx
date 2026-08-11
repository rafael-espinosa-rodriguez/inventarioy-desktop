/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { lazy, Suspense, useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import ErrorBoundary from './components/ErrorBoundary';

const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const MenuView = lazy(() => import('./pages/MenuView'));
const AccessPage = lazy(() => import('./pages/AccessPage'));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));

function initGlobalErrorHandlers() {
  window.onerror = (_event, _source, _lineno, _colno, error) => {
    if (!error) return;
    try {
      const errors = JSON.parse(localStorage.getItem('app_errors') || '[]');
      errors.push({
        timestamp: new Date().toISOString(),
        message: error.message || String(error),
        stack: error.stack,
        type: 'window.onerror',
        url: window.location.href,
        userAgent: navigator.userAgent,
      });
      if (errors.length > 50) errors.shift();
      localStorage.setItem('app_errors', JSON.stringify(errors));
    } catch {}
  };

  window.onunhandledrejection = (event) => {
    const error = event.reason;
    try {
      const errors = JSON.parse(localStorage.getItem('app_errors') || '[]');
      errors.push({
        timestamp: new Date().toISOString(),
        message: error?.message || error?.toString() || String(error),
        stack: error?.stack,
        type: 'unhandledrejection',
        url: window.location.href,
        userAgent: navigator.userAgent,
      });
      if (errors.length > 50) errors.shift();
      localStorage.setItem('app_errors', JSON.stringify(errors));
    } catch {}
  };
}

initGlobalErrorHandlers();

export default function App() {
  const { initialize: initializeAuth } = useAuthStore();

  useEffect(() => {
    initializeAuth();
  }, []);

  return (
    <Router>
      <Toaster 
        position="top-right" 
        theme="dark"
        toastOptions={{
          classNames: {
            toast: 'bg-surface border-border text-text shadow-2xl',
            title: 'text-text font-medium',
            description: 'text-text-secondary',
            success: 'border-success/30 text-success',
            error: 'border-danger/30 text-danger',
          }
        }}
      />
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-bg"><div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary"></div></div>}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/menu" element={<MenuView />} />
          <Route path="/acceso" element={<AccessPage />} />
          <Route path="/acceso/:businessCode" element={<AccessPage />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/dashboard/*" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
        </Routes>
      </Suspense>
    </Router>
  );
}