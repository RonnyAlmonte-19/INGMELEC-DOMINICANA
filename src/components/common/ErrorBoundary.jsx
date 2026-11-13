import React from 'react';
import { AlertTriangle, RefreshCw, ShieldAlert, LogOut, Home } from 'lucide-react';
import { toSafeDisplayString } from '../../utils/jsonFormat';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('Error de renderizado capturado por ErrorBoundary (INGMELEC v2.1):', error, errorInfo);
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null, errorInfo: null });
    }
  }

  handleRetry = () => {
    if (typeof this.props.onRetry === 'function') {
      this.setState({ hasError: false, error: null, errorInfo: null });
      this.props.onRetry();
      return;
    }

    if (this.props.scoped) {
      this.setState({ hasError: false, error: null, errorInfo: null });
      return;
    }

    window.location.reload();
  };

  handleReset = () => {
    try {
      localStorage.removeItem('ingmelec_token');
      localStorage.removeItem('ingmelec_user');
      localStorage.removeItem('ingmelec_active_campamento');
    } catch {
      // Ignorar errores de almacenamiento local
    }
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      const { scoped = false, onGoHome } = this.props;
      const errorMessage = toSafeDisplayString(
        this.state.error?.message || this.state.error,
        'Error inesperado de renderizado en la interfaz.'
      );
      const componentStack = toSafeDisplayString(this.state.errorInfo?.componentStack, '');

      return (
        <div
          className={`${
            scoped ? 'min-h-[60vh] py-6' : 'min-h-screen bg-[#F8FAFC] p-6'
          } flex items-center justify-center font-sans`}
        >
          <div className="w-full max-w-3xl bg-white rounded-3xl border border-slate-200/90 shadow-xl overflow-hidden">
            {/* Corporative Top Header */}
            <div className="bg-[#0F172A] text-white px-6 py-5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-3.5">
                <div className="w-11 h-11 rounded-2xl bg-[#F28524]/15 border border-[#F28524]/40 flex items-center justify-center text-[#F28524] flex-shrink-0">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#F28524]">
                    INGMELEC | ALMACÉN GENERAL v2.1
                  </span>
                  <h1 className="text-base sm:text-lg font-extrabold text-white tracking-tight mt-0.5">
                    Error inesperado al mostrar este módulo
                  </h1>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Alert Notice */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-slate-700 leading-relaxed flex items-start space-x-3">
                <AlertTriangle className="w-4 h-4 text-[#F28524] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-900 mb-0.5">Protección de Sesión Activa</p>
                  <p>
                    Se detectó un problema al renderizar esta vista. Su sesión y los registros almacenados en el servidor permanecen seguros. Puede reintentar cargar el módulo o restablecer la sesión local si el inconveniente persiste.
                  </p>
                </div>
              </div>

              {/* Error Diagnostics */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Detalle Técnico
                  </label>
                  <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 font-mono text-xs text-rose-700 font-semibold break-all">
                    {errorMessage}
                  </div>
                </div>

                {componentStack && (
                  <details className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <summary className="text-[11px] font-bold text-slate-600 cursor-pointer select-none">
                      Ver traza técnica de componentes
                    </summary>
                    <pre className="mt-2 font-mono text-[10px] text-slate-500 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                      {componentStack}
                    </pre>
                  </details>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
                <span className="text-[11px] text-slate-400 font-medium text-center sm:text-left">
                  INGMELEC DOMINICANA · Control de Estabilidad de Interfaz
                </span>

                <div className="flex flex-wrap items-center justify-end gap-2.5 w-full sm:w-auto">
                  {typeof onGoHome === 'function' && (
                    <button
                      type="button"
                      onClick={onGoHome}
                      className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Home className="w-3.5 h-3.5" />
                      <span>Ir al Dashboard</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={this.handleRetry}
                    className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-800 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-[#F28524]" />
                    <span>Reintentar</span>
                  </button>

                  <button
                    type="button"
                    onClick={this.handleReset}
                    className="px-4 py-2 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-bold transition-colors shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5 text-[#F28524]" />
                    <span>Restablecer Sesión y Salir</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
