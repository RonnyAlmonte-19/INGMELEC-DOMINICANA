import React, { useState } from 'react';
import { ShieldCheck, Lock, Mail, ArrowRight, ShieldAlert, Sparkles, Database } from 'lucide-react';
import { useApp } from '../context/AppContext';
import IngmelecLogo from '../components/common/IngmelecLogo';

export default function LoginPage() {
  const { login } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      const res = await login(email, password);
      if (!res.success) {
        setErrorMsg(res.message || 'Error al autenticar');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      {/* Background Subtle Gradient Blobs */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#F28524]/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-slate-900/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10 space-y-6">

        {/* Logo and Titles */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <IngmelecLogo className="h-14 sm:h-16" variant="dark" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            ALMACÉN GENERAL
          </h1>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#F28524]">
            Sistema Integral de Inventario y Control de Activos
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-200/80 p-8 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Iniciar Sesión</h2>
              <p className="text-xs text-slate-400">Ingreso seguro con credenciales institucionales</p>
            </div>
            <div className="p-2 bg-slate-100 rounded-xl text-slate-600">
              <Lock className="w-4 h-4" />
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-2 text-xs text-rose-700">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 transform -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="usuario@ingmelec.com"
                  className="w-full pl-10 pr-4 py-2.5 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#F28524] focus:outline-none font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 transform -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-4 py-2.5 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#F28524] focus:outline-none font-medium"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#F28524] hover:bg-[#d87019] text-white rounded-xl text-xs font-bold shadow-lg shadow-[#F28524]/25 transition-all flex items-center justify-center space-x-2"
            >
              <span>{loading ? 'Validando sesión...' : 'Ingresar al Almacén'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Footer info */}
        <div className="text-center text-[11px] text-slate-400 space-y-1">
          <div className="flex items-center justify-center space-x-1.5 font-medium">
            <Database className="w-3.5 h-3.5 text-emerald-500" />
            <span>Base de datos MySQL activa · Conexión segura PBKDF2</span>
          </div>
          <div>INGMELEC DOMINICANA © 2026 · Todos los derechos reservados</div>
        </div>

      </div>
    </div>
  );
}
