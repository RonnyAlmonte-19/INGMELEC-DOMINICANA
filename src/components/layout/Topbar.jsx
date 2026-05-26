import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  Bell, 
  Cpu, 
  Activity, 
  Wifi, 
  User, 
  Check, 
  Shield, 
  RefreshCw 
} from 'lucide-react';

const Topbar = ({ activePage, demoModeActive, onToggleDemoMode }) => {
  const { 
    currentUser, 
    currentRole, 
    changeRole, 
    notifications,
    clearNotifications 
  } = useApp();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showRoleSwapper, setShowRoleSwapper] = useState(false);

  if (!currentUser) return null;

  const unreadCount = notifications.filter(n => n.unread).length;

  const getPageTitle = () => {
    switch (activePage) {
      case 'dashboard': return 'Consola de Monitoreo General';
      case 'brigadas': return 'Control de Brigadas Técnicas';
      case 'tecnicos': return 'Expedientes Técnicos de Personal';
      case 'personal': return 'Administración de Colaboradores';
      case 'inventario': return 'Inventario Maestro de Operaciones';
      case 'actas': return 'Actas de Entrega de EPP y Herramientas';
      case 'reposiciones': return 'Workflow de Reposiciones e Incidencias';
      case 'swaps': return 'Registro de Sustituciones y Swaps';
      case 'devoluciones': return 'Gestión de Retorno y Devoluciones';
      case 'usuarios': return 'Gestión de Seguridad, Jerarquía y Accesos';
      case 'auditoria': return 'Visor de Auditoría y Logs del Sistema';
      case 'reportes': return 'Dashboard Analítico y de Reportes';
      default: return 'Consola Operativa';
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'Developer': return 'text-purple-400 border-purple-500 bg-purple-500/10';
      case 'Gerente': return 'text-emerald-400 border-emerald-500 bg-emerald-500/10';
      case 'Coordinador': return 'text-cyan-400 border-cyan-500 bg-cyan-500/10';
      case 'Supervisor': return 'text-amber-400 border-amber-500 bg-amber-500/10';
      default: return 'text-slate-400 border-slate-500 bg-slate-500/10';
    }
  };

  return (
    <header className="h-16 border-b border-industrial-border flex items-center justify-between px-6 bg-industrial-panel bg-opacity-70 backdrop-blur-md sticky top-0 z-30">
      
      {/* Page Title & Breadcrumbs */}
      <div>
        <div className="flex items-center space-x-2 text-[10px] text-industrial-gray uppercase tracking-widest">
          <span>Ingmelec</span>
          <span>/</span>
          <span className="text-industrial-cyan font-semibold">{activePage}</span>
        </div>
        <h1 className="text-base font-bold text-slate-800 tracking-wide mt-0.5">{getPageTitle()}</h1>
      </div>

      {/* Right Controls */}
      <div className="flex items-center space-x-6">
        
        {/* Real-time Telemetry (Enterprise visual wow) */}
        <div className="hidden lg:flex items-center space-x-4 border-r border-industrial-border pr-6 text-xs text-industrial-gray font-semibold">
          <div className="flex items-center space-x-1.5" title="Base de Datos En Línea">
            <Activity size={12} className="text-industrial-cyan animate-pulse" />
            <span className="text-[10px] tracking-wider uppercase text-industrial-cyan font-bold">Ingmelec Sync</span>
          </div>

          <div className="flex items-center space-x-1.5" title="Latencia del Servidor Ficticio">
            <Wifi size={12} className="text-industrial-green" />
            <span className="text-[10px] tracking-wide text-industrial-green">14ms ping</span>
          </div>

          <div className="flex items-center space-x-1.5" title="Hardware Monitor">
            <Cpu size={12} className="text-industrial-gray" />
            <span className="text-[10px] tracking-wide">CPU OK</span>
          </div>
        </div>

        {/* Executive Demo Mode Toggle */}
        <button
          onClick={onToggleDemoMode}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded border text-xs transition-all shadow-sm ${
            demoModeActive
              ? 'bg-gradient-to-r from-industrial-cyan to-blue-600 border-industrial-cyan text-industrial-bg font-extrabold shadow-cyan-glow animate-pulse'
              : 'border-industrial-border text-industrial-gray hover:text-white hover:border-industrial-cyan/40 bg-industrial-bg bg-opacity-30'
          }`}
        >
          <Cpu size={12} className={demoModeActive ? 'animate-spin text-industrial-bg' : ''} />
          <span className="uppercase tracking-wider text-[9px] font-black">Modo Demo</span>
        </button>

        {/* Role Quick Tester Tool */}
        {(currentUser.role === 'Developer' || currentUser.role === 'Gerente') && (
          <div className="relative">
            <button 
              onClick={() => setShowRoleSwapper(!showRoleSwapper)}
              className="flex items-center space-x-2 px-3 py-1 rounded border border-dashed border-industrial-cyan/40 bg-industrial-cyan/5 text-industrial-cyan hover:bg-industrial-cyan/15 text-xs transition-colors"
            >
              <Shield size={12} />
              <span className="font-semibold">Simular Rol: {currentRole}</span>
            </button>

            {showRoleSwapper && (
              <div 
                className="absolute right-0 mt-2 w-48 rounded-md bg-industrial-panel border border-industrial-border p-2 shadow-panel-glow z-50 animate-in fade-in slide-in-from-top-1 duration-100"
                style={{ background: 'rgba(255, 255, 255, 0.98)', backdropFilter: 'blur(10px)' }}
              >
                <div className="px-2 py-1 text-[10px] text-industrial-gray uppercase font-bold tracking-widest border-b border-industrial-border mb-1">
                  Cambiar Rol UI
                </div>
                {['Developer', 'Gerente', 'Coordinador', 'Supervisor'].map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      changeRole(r);
                      setShowRoleSwapper(false);
                    }}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-slate-100 text-left text-xs font-semibold ${
                      currentRole === r ? 'text-industrial-cyan font-extrabold' : 'text-slate-600'
                    }`}
                  >
                    <span>{r}</span>
                    {currentRole === r && <Check size={12} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dynamic Notifications Center */}
        <div className="relative">
          <button 
            onClick={() => {
              setShowNotifications(!showNotifications);
              if (!showNotifications) clearNotifications();
            }}
            className="p-1.5 rounded bg-industrial-bg border border-industrial-border text-industrial-gray hover:text-industrial-cyan hover:border-industrial-cyan transition-all relative"
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-industrial-red text-[9px] text-white flex items-center justify-center font-bold animate-bounce">
                {unreadCount}
              </span>
            )}
          </button>

            {showNotifications && (
              <div 
                className="absolute right-0 mt-2 w-80 rounded-md bg-industrial-panel border border-industrial-border p-3 shadow-panel-glow z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                style={{ background: 'rgba(255, 255, 255, 0.98)', backdropFilter: 'blur(12px)' }}
              >
                <div className="flex items-center justify-between border-b border-industrial-border pb-2 mb-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Alertas del Sistema</span>
                <span className="text-[10px] text-industrial-cyan hover:underline cursor-pointer" onClick={() => clearNotifications()}>
                  Leídas todas
                </span>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {notifications.map((n) => (
                  <div 
                    key={n.id} 
                    className={`p-2 rounded text-xs border ${
                      n.unread ? 'bg-industrial-cyan/5 border-industrial-cyan/35' : 'bg-industrial-bg bg-opacity-25 border-industrial-border'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-[9px] font-extrabold px-1 py-0.2 rounded uppercase ${
                        n.type === 'critical' ? 'bg-industrial-red/20 text-industrial-red border border-industrial-red/30' :
                        n.type === 'pending' ? 'bg-industrial-yellow/20 text-industrial-yellow border border-industrial-yellow/30' :
                        'bg-industrial-cyan/20 text-industrial-cyan border border-industrial-cyan/30'
                      }`}>
                        {n.type}
                      </span>
                      <span className="text-[9px] text-industrial-gray">{n.time}</span>
                    </div>
                    <p className="text-slate-600 font-medium leading-relaxed mt-1 text-[11px]">{n.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Active User Summary Card */}
        <div className="flex items-center space-x-3 pl-4 border-l border-industrial-border">
          <div className="w-8 h-8 rounded-full bg-industrial-border border border-industrial-border flex items-center justify-center text-industrial-cyan">
            <User size={16} />
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-xs text-slate-800 leading-none">
                {(currentUser.name && typeof currentUser.name === 'string') ? currentUser.name.split(' ')[0] : (currentUser.username || 'Operador')}
              </span>
              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border uppercase tracking-wider ${getRoleColor(currentRole)}`}>
                {currentRole}
              </span>
            </div>
            <p className="text-[9px] text-industrial-gray font-medium mt-1">Lote 4 Noroeste</p>
          </div>
        </div>

      </div>
    </header>
  );
};

export default Topbar;
