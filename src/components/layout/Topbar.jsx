import React from 'react';
import { Database, Bell, Shield, User, Search, RefreshCw, MapPin, FlaskConical } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export default function Topbar({ activePage, setActivePage }) {
  const { currentUser, currentRole, refreshKpis, kpisLoading, activeCampamento, setActiveCampamento, entornoInfo, kpis } = useApp();

  const getPageTitle = (page) => {
    switch (page) {
      case 'dashboard': return 'Dashboard Ejecutivo';
      case 'inventario': return `Inventario Maestro${kpis?.totalArticulos != null ? ` (${kpis.totalArticulos} Activos)` : ''}`;
      case 'informatica': return `Informática y Telecomunicaciones${kpis?.porArea?.INFORMATICA != null ? ` (${kpis.porArea.INFORMATICA})` : ''}`;
      case 'oficinas': return `Mobiliario y Oficinas${kpis?.porArea?.OFICINAS != null ? ` (${kpis.porArea.OFICINAS})` : ''}`;
      case 'cocina': return `Cocina y Comedor${kpis?.porArea?.COCINA != null ? ` (${kpis.porArea.COCINA})` : ''}`;
      case 'almacen': return `Almacén Central y Herramientas${kpis?.porArea?.ALMACEN != null ? ` (${kpis.porArea.ALMACEN})` : ''}`;
      case 'ubicaciones': return 'Campamentos y Sedes';
      case 'movimientos': return 'Movimientos Transaccionales';
      case 'reportes': return 'Centro de Reportes Gerenciales';
      case 'auditoria': return 'Bitácora de Auditoría';
      case 'usuarios': return 'Control Exclusivo de Usuarios y Permisos';
      default: return 'Almacén General';
    }
  };

  const getRoleBadge = (rol) => {
    switch (rol) {
      case 'developer':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/10 text-amber-600 border border-amber-500/30 uppercase tracking-wide">Developer</span>;
      case 'admin':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200 uppercase">Admin Operativo</span>;
      case 'almacen':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#F28524]/20 text-[#F28524] border border-[#F28524]/30 uppercase">Almacén</span>;
      case 'supervisor':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200 uppercase">Supervisor</span>;
      case 'gerencia':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-800 border border-purple-200 uppercase">Gerencia</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-300 uppercase">Auditor</span>;
    }
  };

  // Dinámica de nomenclatura según el usuario
  const isDev = currentRole === 'developer' || currentUser?.es_developer === 1;
  const currentAlmacenTitle = isDev
    ? 'ALMACÉN GENERAL'
    : (activeCampamento?.nombre ? `ALMACÉN ${activeCampamento.nombre.toUpperCase()}` : (currentUser?.campamento_nombre ? `ALMACÉN ${currentUser.campamento_nombre.toUpperCase()}` : 'ALMACÉN GENERAL'));

  return (
    <header className="h-16 bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-30 px-6 flex items-center justify-between">
      {/* Title & Breadcrumbs */}
      <div>
        <div className="flex items-center space-x-2 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
          <span>INGMELEC</span>
          <span>|</span>
          <span className="text-[#F28524] font-bold">{currentAlmacenTitle}</span>
        </div>
        <h2 className="text-base font-extrabold text-slate-900 tracking-tight leading-none mt-0.5">
          {getPageTitle(activePage)}
        </h2>
      </div>

      {/* Right Controls */}
      <div className="flex items-center space-x-3">
        {/* Multi-Campamento Switcher */}
        {currentUser?.campamentos && currentUser.campamentos.length > 1 && (
          <div className="flex items-center space-x-1.5 px-3 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 shadow-sm">
            <MapPin className="w-3.5 h-3.5 text-[#F28524]" />
            <span className="text-slate-400 font-normal">Sede:</span>
            <select
              value={activeCampamento?.id || ''}
              onChange={(e) => {
                const targetId = parseInt(e.target.value);
                const selected = currentUser.campamentos.find(c => c.id === targetId);
                setActiveCampamento(selected || null);
              }}
              className="bg-transparent border-none text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              {currentUser.campamentos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Environment Indicator (PRUEBAS vs PRODUCCION) */}
        {entornoInfo?.esPruebas ? (
          <div
            className="hidden sm:flex items-center space-x-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full text-[11px] font-bold text-amber-700 shadow-sm"
            title={entornoInfo.aviso || 'Entorno de Pruebas: Datos sintéticos'}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            <FlaskConical className="w-3.5 h-3.5 text-amber-600" />
            <span>PRUEBAS — MariaDB Local</span>
          </div>
        ) : (
          <div
            className="hidden sm:flex items-center space-x-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-[11px] font-semibold text-emerald-800"
            title="Conexión en vivo con base de datos de producción"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <Database className="w-3.5 h-3.5 text-emerald-600" />
            <span>PRODUCCIÓN — Clever Cloud</span>
          </div>
        )}

        {/* Sync button */}
        <button
          onClick={refreshKpis}
          title="Sincronizar con base de datos"
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${kpisLoading ? 'animate-spin text-[#F28524]' : ''}`} />
        </button>

        {/* User Card */}
        <div className="flex items-center space-x-2.5 pl-3 border-l border-slate-200">
          <div className="text-right hidden md:block">
            <div className="text-xs font-bold text-slate-900 leading-tight">
              {currentUser?.nombre}
            </div>
            <div className="text-[11px] text-slate-400">
              {currentUser?.cargo || currentUser?.email}
            </div>
          </div>
          {getRoleBadge(currentRole)}
        </div>
      </div>
    </header>
  );
}
