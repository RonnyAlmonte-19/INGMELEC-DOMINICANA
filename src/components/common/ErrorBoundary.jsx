import React from 'react';
import { AlertTriangle, RefreshCw, ShieldAlert, Terminal } from 'lucide-react';

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
    console.error('💥 CORE RENDERING EXCEPTION CAUGHT BY NOC FIREWALL:', error, errorInfo);
  }

  handleReset = () => {
    localStorage.removeItem('gridops_auth_token');
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#060b13] flex items-center justify-center p-6 font-sans relative overflow-hidden">
          {/* Glowing Background FX */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-red-500 bg-opacity-5 filter blur-[120px] pointer-events-none" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-orange-500 bg-opacity-5 filter blur-[120px] pointer-events-none" />
          
          <div className="w-full max-w-4xl bg-[#0d1527] rounded-lg border border-red-500 border-opacity-40 p-8 shadow-[0_0_30px_rgba(239,68,68,0.15)] relative z-10">
            {/* Header */}
            <div className="flex items-center space-x-4 border-b border-red-500 border-opacity-20 pb-4 mb-6">
              <div className="w-12 h-12 rounded bg-red-500 bg-opacity-10 border border-red-500 flex items-center justify-center text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)] animate-pulse">
                <ShieldAlert size={24} />
              </div>
              <div>
                <span className="text-[10px] text-red-500 uppercase tracking-widest font-black flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block" />
                  Kernel Exception Caught
                </span>
                <h1 className="text-xl font-bold text-white tracking-wide uppercase mt-0.5">
                  Fallo Crítico de Renderizado de Interfaz (UI Crash)
                </h1>
              </div>
            </div>

            {/* Warning Message */}
            <div className="mb-6 p-4 bg-red-500 bg-opacity-5 border border-red-500 border-opacity-20 rounded text-xs text-slate-300 leading-relaxed">
              <p className="font-semibold text-white mb-1 flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-400" />
                Protocolo de Emergencia Activado:
              </p>
              El motor de visualización React ha interceptado un error de tiempo de ejecución no controlado. Para prevenir la corrupción de datos operativos o fugas de telemetría, la interfaz gráfica ha sido suspendida bajo un sandbox de seguridad.
            </div>

            {/* Error Diagnostics Panel */}
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                  <Terminal size={12} className="text-red-400" />
                  Mensaje del Error
                </label>
                <div className="bg-[#060b13] border border-red-500 border-opacity-30 rounded px-4 py-3 font-mono text-xs text-red-400 font-bold break-all">
                  {this.state.error ? this.state.error.toString() : 'Desconocido'}
                </div>
              </div>

              {this.state.errorInfo && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    Stack Trace de Componentes Afectados
                  </label>
                  <div className="bg-[#060b13] border border-slate-800 rounded p-4 font-mono text-[10px] text-slate-400 max-h-60 overflow-y-auto leading-normal whitespace-pre-wrap scrollbar-thin">
                    {this.state.errorInfo.componentStack}
                  </div>
                </div>
              )}
            </div>

            {/* Actions Panel */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-800 pt-6 mt-8">
              <div className="text-[10px] text-slate-500 font-semibold text-center sm:text-left">
                Servidor Backend: <span className="text-green-400 font-bold">ONLINE</span> | Local Host: <span className="text-white">GridOps Enterprise v2</span>
              </div>
              <div className="flex items-center space-x-3 w-full sm:w-auto">
                <button
                  onClick={() => window.location.reload()}
                  className="flex-grow sm:flex-grow-0 px-4 py-2 rounded border border-slate-700 bg-[#0d1527] hover:bg-slate-800 text-xs font-bold text-white transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw size={12} />
                  <span>Reintentar</span>
                </button>
                <button
                  onClick={this.handleReset}
                  className="flex-grow sm:flex-grow-0 px-4 py-2 rounded bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-extrabold text-xs tracking-wider uppercase transition-all shadow-[0_0_15px_rgba(239,68,68,0.2)] flex items-center justify-center gap-2"
                >
                  <ShieldAlert size={12} />
                  <span>Restablecer Sesión y Salir</span>
                </button>
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
