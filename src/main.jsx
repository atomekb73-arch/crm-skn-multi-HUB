import React from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext';
import { OrgProvider } from './context/OrgContext';
import { SettingsProvider } from './context/SettingsContext';
import { AcademicYearProvider } from './context/AcademicYearContext';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('RootErrorBoundary caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleClearCacheAndReset = () => {
    try {
      localStorage.clear();
    } catch (e) {
      console.error('Błąd czyszczenia storage:', e);
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans">
          <div className="bg-white rounded-3xl p-8 max-w-lg w-full border border-slate-200 shadow-2xl space-y-6 text-center">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
              <AlertTriangle size={32} />
            </div>

            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Awaria Systemowa / Widoku</h1>
              <p className="text-xs text-slate-500 mt-1">
                Wystąpił nieoczekiwany błąd w renderowaniu interfejsu aplikacji.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-left font-mono text-[11px] text-rose-700 overflow-auto max-h-32">
              {this.state.error?.toString() || 'Nieznany błąd React Runtime'}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={this.handleReset}
                className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
              >
                <RefreshCw size={14} />
                <span>Odśwież widok</span>
              </button>

              <button
                onClick={this.handleClearCacheAndReset}
                className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 text-xs font-bold rounded-xl flex items-center justify-center gap-2 border border-slate-200 transition cursor-pointer"
              >
                <Trash2 size={14} />
                <span>Wyczyść pamięć podręczną & Reset</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootErrorBoundary>
      <AuthProvider>
        <OrgProvider>
          <SettingsProvider>
            <AcademicYearProvider>
              <App />
            </AcademicYearProvider>
          </SettingsProvider>
        </OrgProvider>
      </AuthProvider>
    </RootErrorBoundary>
  </StrictMode>
);
