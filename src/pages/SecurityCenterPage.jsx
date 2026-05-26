import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
  ShieldCheck, 
  Lock, 
  Key, 
  Terminal, 
  EyeOff, 
  Globe, 
  Cpu, 
  Server, 
  Clock, 
  Activity, 
  AlertTriangle 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Mock list of blocked intrusion attempts matching Dominican/Lote 4 NOC environments
const INITIAL_INTRUSIONS = [
  { id: 'int-01', timestamp: '2026-05-25 14:10:04', ip: '186.6.12.87', country: 'República Dominicana (Santo Domingo)', attempt: 'SQL Injection on /api/auth/login', status: 'CORTAFUEGOS_BLOQUEO' },
  { id: 'int-02', timestamp: '2026-05-25 13:58:22', ip: '190.166.45.12', country: 'República Dominicana (Santiago)', attempt: 'Fuerza Bruta en cuenta @william', status: 'PBKDF2_SAL_RECHAZO' },
  { id: 'int-03', timestamp: '2026-05-25 12:12:09', ip: '45.89.231.11', country: 'Rusia (Moscú)', attempt: 'Escaneo de puertos REST /api/usuarios', status: 'JWT_BEARER_FALLA' },
  { id: 'int-04', timestamp: '2026-05-25 11:30:45', ip: '186.120.98.54', country: 'República Dominicana (Moca)', attempt: 'Intento de evasión de Role Gated: activePage', status: 'GATED_ROUTE_RECONDUCCION' }
];

const SecurityCenterPage = () => {
  const { currentUser, currentRole } = useApp();
  const [timeLeft, setTimeLeft] = useState(86399); // 24 hours in seconds
  const [failedAttempts, setFailedAttempts] = useState(INITIAL_INTRUSIONS);
  const [cryptLogs, setCryptLogs] = useState([
    '🔒 NÚCLEO CRIPTOGRÁFICO GRIDOPS ENTERPRISE INICIADO...',
    `[${new Date().toLocaleTimeString()}] ALGORITMO: PBKDF2 con SHA-512 configurado para contraseñas de cuentas.`,
    `[${new Date().toLocaleTimeString()}] ITERACIONES: 1000 iteraciones criptográficas por sesión.`,
    `[${new Date().toLocaleTimeString()}] SAL: Salting aleatorio de 16 bytes único generado para cada usuario.`,
    `[${new Date().toLocaleTimeString()}] FIRMA: Firma simétrica HMAC-SHA256 activa para tokens Bearer JWT.`
  ]);

  // Live countdown timer for active JWT token
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 86399));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format seconds to HH:MM:SS
  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600).toString().padStart(2, '0');
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  // Add random firewall intrusion blocks
  useEffect(() => {
    const intrusionInterval = setInterval(() => {
      if (Math.random() > 0.7) {
        const dNames = ['Dajabón', 'Santiago', 'San Cristóbal', 'La Romana', 'Mao'];
        const pickedProv = dNames[Math.floor(Math.random() * dNames.length)];
        const mockIP = `186.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
        const attempts = [
          'Intento de fuerza bruta en API',
          'Token JWT alterado estructuralmente',
          'Intento de POST sin cabecera Bearer',
          'Inyección script en Kárdex input'
        ];
        const statusList = ['CORTAFUEGOS_BLOQUEO', 'JWT_EXPIRADO', 'FIRMA_HMAC_INVALIDA', 'VALIDACION_CARGO_RECHAZO'];
        const pickedAttempt = attempts[Math.floor(Math.random() * attempts.length)];
        const pickedStatus = statusList[Math.floor(Math.random() * statusList.length)];

        const newIntrusion = {
          id: `int-${Date.now()}`,
          timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
          ip: mockIP,
          country: `República Dominicana (${pickedProv})`,
          attempt: pickedAttempt,
          status: pickedStatus
        };

        setFailedAttempts(prev => [newIntrusion, ...prev].slice(0, 8));
        setCryptLogs(logs => [
          ...logs,
          `[${new Date().toLocaleTimeString()}] ALERTA_SEGURIDAD: Bloqueo de IP ${mockIP} | Acción: ${pickedStatus}`
        ].slice(-20));
      }
    }, 6000);

    return () => clearInterval(intrusionInterval);
  }, []);

  return (
    <div className="space-y-6 text-xs text-white">
      
      {/* Cryptographic Key Parameters grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* COLUMN 1: CYPHER CORE METRICS */}
        <div className="lg:col-span-8 space-y-6">
          
          <div className="glass-panel p-4 rounded-lg border-opacity-40 flex flex-col justify-between h-[360px] bg-gradient-to-b from-industrial-panel to-industrial-bg relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/5 to-transparent h-full w-20 animate-[scrolling-right_12s_linear_infinite] pointer-events-none" />

            <div className="flex justify-between items-center border-b border-industrial-border pb-2.5 z-10">
              <div className="flex items-center space-x-1.5 text-purple-500">
                <ShieldCheck size={14} className="animate-pulse" />
                <span className="font-extrabold uppercase tracking-wider text-[10px] text-purple-500">GridOps Ciberseguridad & Diagnóstico</span>
              </div>
              <div className="text-[9px] text-industrial-gray font-mono uppercase">
                PBKDF2 SHA-512 Cifrado Activo
              </div>
            </div>

            {/* Cryptographic parameter dashboard grids */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-auto z-10">
              
              <div className="bg-black/40 p-4 border border-industrial-border rounded-lg text-center space-y-2">
                <Lock className="text-purple-500 mx-auto" size={24} />
                <span className="block text-[8px] text-industrial-gray uppercase font-bold tracking-widest leading-none">Algoritmo Encriptación</span>
                <span className="text-sm font-black text-white font-mono block">PBKDF2</span>
                <span className="text-[9px] text-purple-400 font-mono font-bold block bg-purple-500/5 py-0.5 rounded">SHA-512 Hash Engine</span>
              </div>

              <div className="bg-black/40 p-4 border border-industrial-border rounded-lg text-center space-y-2">
                <Cpu className="text-industrial-cyan mx-auto" size={24} />
                <span className="block text-[8px] text-industrial-gray uppercase font-bold tracking-widest leading-none">Iteraciones Hash</span>
                <span className="text-sm font-black text-white font-mono block">1,000 Ciclos</span>
                <span className="text-[9px] text-industrial-cyan font-mono font-bold block bg-industrial-cyan/5 py-0.5 rounded">Salting Aleatorio 16B</span>
              </div>

              <div className="bg-black/40 p-4 border border-industrial-border rounded-lg text-center space-y-2">
                <Key className="text-industrial-orange mx-auto" size={24} />
                <span className="block text-[8px] text-industrial-gray uppercase font-bold tracking-widest leading-none">Firma Sesión REST</span>
                <span className="text-sm font-black text-white font-mono block">JWT Token</span>
                <span className="text-[9px] text-industrial-orange font-mono font-bold block bg-industrial-orange/5 py-0.5 rounded">HMAC-SHA256 Signature</span>
              </div>

            </div>

            {/* Token Life Status Bar */}
            <div className="bg-black/60 p-4 border border-industrial-border rounded-lg z-10">
              <div className="flex justify-between items-center mb-1.5 text-[9px] text-industrial-gray font-bold uppercase">
                <span>Tiempo de Expiración del Token JWT de Roster</span>
                <span className="font-mono text-industrial-cyan">{formatTime(timeLeft)} restante</span>
              </div>
              <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-industrial-border">
                <div 
                  className="bg-gradient-to-r from-industrial-cyan to-purple-600 h-full transition-all duration-1000 shadow-cyan-glow" 
                  style={{ width: `${(timeLeft / 86400) * 100}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[8px] text-industrial-gray font-mono mt-1 leading-none">
                <span>Sesión iniciada: @{currentUser?.username || 'system'}</span>
                <span>Expiración atómica: 24 Horas Gated</span>
              </div>
            </div>

          </div>

          {/* CRYPTOGRAPHIC CONSOLE LOGS */}
          <div className="glass-panel p-4 rounded-lg border-opacity-40 flex flex-col justify-between h-56 bg-black/60 relative">
            <div className="flex items-center justify-between border-b border-industrial-border pb-1.5 mb-2">
              <div className="flex items-center space-x-1.5 text-purple-500">
                <Terminal size={14} />
                <span className="font-extrabold uppercase tracking-wider text-[10px]">Consola de Auditoría Criptográfica</span>
              </div>
              <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
            </div>

            <div className="flex-grow overflow-y-auto font-mono text-[10px] text-purple-400 leading-relaxed space-y-1 scrollbar-thin select-none">
              {cryptLogs.map((log, idx) => (
                <div key={idx} className="flex items-start">
                  <span className="text-industrial-gray mr-1.5">&gt;</span>
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* COLUMN 2: BLOCKED FIREWALL INTRUSIONS */}
        <div className="lg:col-span-4 space-y-6">
          
          <div className="glass-panel p-4 rounded-lg border-opacity-40 flex flex-col justify-between h-[582px]">
            <div className="flex items-center space-x-1.5 text-industrial-red border-b border-industrial-border pb-2.5 mb-3">
              <EyeOff size={14} className="text-industrial-red animate-pulse" />
              <span className="font-extrabold uppercase tracking-wider text-[10px]">Ataques Bloqueados por Cortafuegos</span>
            </div>

            {/* Blocked Intrusions scroll frame */}
            <div className="flex-grow overflow-y-auto space-y-2.5 pr-1 scrollbar-thin">
              {failedAttempts.map(i => (
                <div key={i.id} className="p-3 bg-industrial-red/5 border border-industrial-red/20 rounded relative hover:border-industrial-red/40 transition-colors">
                  <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-wider text-industrial-red leading-none">
                    <span>{i.status}</span>
                    <span className="text-industrial-gray">{i.timestamp.split(' ')[1]}</span>
                  </div>
                  <div className="text-[10px] text-white font-bold mt-1.5 leading-none">
                    Intruso: <span className="font-mono text-industrial-cyan">{i.ip}</span>
                  </div>
                  <p className="text-industrial-gray text-[9px] font-medium mt-1 leading-normal">
                    Geo: <span className="text-white font-semibold">{i.country}</span>
                  </p>
                  <p className="text-white text-[10px] font-bold mt-1.5 leading-relaxed truncate">
                    Intento: <span className="text-industrial-yellow">{i.attempt}</span>
                  </p>
                </div>
              ))}
            </div>

            {/* Security Integrity Gauge footer */}
            <div className="mt-3 p-2 bg-purple-500/5 border border-purple-500/20 rounded flex items-center justify-between text-[9px] font-bold">
              <div className="flex items-center space-x-1.5">
                <Server size={12} className="text-purple-500" />
                <span>Nivel de Integridad SQL</span>
              </div>
              <span className="text-industrial-green font-mono font-black scale-105">99.99% INMUNE</span>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
};

export default SecurityCenterPage;
