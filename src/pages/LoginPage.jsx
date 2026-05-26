import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Shield, Key, Terminal, Server, Cpu, Database } from 'lucide-react';

// Vector Logo Ingmelec Dominicana with Swooshes & Atom orbits
const IngmelecLogo = ({ className = "h-20" }) => (
  <svg viewBox="0 0 500 200" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Curved swooshes in the background */}
    <path d="M20 135 C 130 185, 300 185, 450 135" stroke="#f28524" strokeWidth="6" strokeLinecap="round" opacity="0.3" />
    <path d="M30 150 C 140 200, 290 200, 440 150" stroke="#f28524" strokeWidth="4" strokeLinecap="round" opacity="0.2" />
    <path d="M40 165 C 150 215, 280 215, 430 165" stroke="#f28524" strokeWidth="2" strokeLinecap="round" opacity="0.1" />

    {/* Typography - "Ingmelec" */}
    <text x="30" y="95" fontFamily="'Outfit', 'Inter', sans-serif" fontSize="72" fontWeight="800" fill="#1e293b" letterSpacing="-2">
      Ingmelec
    </text>
    
    {/* Typography - "DOMINICANA" */}
    <text x="135" y="130" fontFamily="'Outfit', 'Inter', sans-serif" fontSize="22" fontWeight="700" fill="#f28524" letterSpacing="6">
      DOMINICANA
    </text>

    {/* Atom symbol */}
    <g transform="translate(400, 90)">
      <circle cx="0" cy="0" r="10" fill="#f28524" />
      <ellipse cx="0" cy="0" rx="42" ry="16" stroke="#1e293b" strokeWidth="3" transform="rotate(-30)" />
      <ellipse cx="0" cy="0" rx="42" ry="16" stroke="#1e293b" strokeWidth="3" transform="rotate(30)" />
      <ellipse cx="0" cy="0" rx="42" ry="16" stroke="#f28524" strokeWidth="3" transform="rotate(90)" />
      <circle cx="36" cy="-21" r="5" fill="#1e293b" />
      <circle cx="-36" cy="21" r="5" fill="#f28524" />
    </g>
  </svg>
);

const LoginPage = () => {
  const { loginUser } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Por favor complete todos los campos.');
      return;
    }
    const success = await loginUser(username, password);
    if (!success) {
      setError('Credenciales inválidas. Use "dev" o "gerente" con clave "1234".');
    }
  };

  const handleQuickLogin = async (role) => {
    await loginUser(role, '1234');
  };

  return (
    <div className="min-h-screen bg-gradient-to-tr from-[#dbeafe] via-[#eff6ff] to-[#f5f3ff] flex items-center justify-center p-4 relative overflow-hidden">
      
      {/* Decorative Brand Soft Glows */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-orange-400 bg-opacity-5 filter blur-[150px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-[#f28524] bg-opacity-5 filter blur-[150px] pointer-events-none" />
      
      <div className="w-full max-w-md relative z-10">
        
        {/* Main Minimalist Card */}
        <div className="bg-white border border-slate-100 rounded-2xl p-8 shadow-[0_10px_35px_-5px_rgba(30,41,59,0.06),0_8px_16px_-6px_rgba(30,41,59,0.04)] flex flex-col justify-between">
          
          {/* Logo container */}
          <div className="flex justify-center mb-6">
            <IngmelecLogo className="h-16 md:h-20" />
          </div>

          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
              Bienvenido de nuevo
            </h2>
            <p className="text-xs text-slate-400 font-semibold mt-1">
              Inicie sesión en su portal de Ingmelec Dominicana
            </p>
          </div>

          {/* Error alerts */}
          {error && (
            <div className="mb-4 p-2.5 bg-red-50 border border-red-100 rounded-lg text-center text-xs text-red-500 font-bold">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Código de Operador</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                  <Shield size={15} />
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Escriba dev, gerente, william..."
                  className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 pl-10 text-xs text-slate-800 placeholder-slate-300 focus:outline-none focus:border-[#f28524] focus:ring-1 focus:ring-[#f28524] transition-all font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Clave de Acceso</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                  <Key size={15} />
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 pl-10 text-xs text-slate-800 placeholder-slate-300 focus:outline-none focus:border-[#f28524] focus:ring-1 focus:ring-[#f28524] transition-all font-medium"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 mt-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs tracking-wider uppercase transition-colors shadow-sm"
            >
              AUTENTICAR OPERADOR
            </button>
          </form>

          {/* Quick login list */}
          <div className="mt-8 border-t border-slate-100 pt-6">
            <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider mb-3 text-center">
              ACCESO RÁPIDO PARA EVALUACIÓN
            </span>
            <div className="grid grid-cols-5 gap-1.5 text-center">
              {[
                { name: 'DEV', user: 'dev', color: 'border-purple-200 text-purple-600 hover:bg-purple-50 bg-purple-50/30' },
                { name: 'GER', user: 'gerente', color: 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 bg-emerald-50/30' },
                { name: 'WILL', user: 'william', color: 'border-cyan-200 text-cyan-600 hover:bg-cyan-50 bg-cyan-50/30' },
                { name: 'ISAAC', user: 'isaac', color: 'border-amber-200 text-amber-600 hover:bg-amber-50 bg-amber-50/30' },
                { name: 'CRIS', user: 'cristian', color: 'border-amber-200 text-amber-600 hover:bg-amber-50 bg-amber-50/30' }
              ].map((acc) => (
                <button
                  key={acc.user}
                  onClick={() => handleQuickLogin(acc.user)}
                  className={`border px-1 py-2 rounded-lg transition-colors text-[9px] font-bold uppercase ${acc.color}`}
                >
                  {acc.name}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-slate-400 text-center mt-3 font-semibold">
              Clave de evaluación general: <span className="text-slate-800 font-bold">1234</span>
            </p>
          </div>

        </div>

      </div>
    </div>
  );
};

export default LoginPage;
