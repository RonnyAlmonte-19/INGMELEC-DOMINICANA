import React from 'react';
import { useApp } from '../context/AppContext';
import { 
  Users, 
  AlertTriangle, 
  FileText, 
  Hammer, 
  Compass, 
  CheckSquare, 
  ShieldCheck, 
  Activity, 
  TrendingUp, 
  Clock,
  RotateCcw
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Legend 
} from 'recharts';

const DashboardPage = ({ setActivePage }) => {
  const { 
    currentRole, 
    currentUser,
    coordinadores, 
    supervisores, 
    brigadas, 
    tecnicos, 
    inventario, 
    actas, 
    reposiciones,
    auditoria,
    devoluciones,
    getFilteredBrigadas,
    getFilteredTecnicos,
    getFilteredReposiciones
  } = useApp();

  // Role Filtered Data
  const roleBrigades = getFilteredBrigadas();
  const roleTechnicians = getFilteredTecnicos();
  const roleReposiciones = getFilteredReposiciones();

  // Calculations for KPI metric cards
  const totalCoordinators = coordinadores.length;
  const totalSupervisores = supervisores.length;
  const totalBrigades = roleBrigades.length;
  const totalTechnicians = roleTechnicians.length;
  
  const assignedToolsCount = inventario
    .filter(i => i.status === 'Asignado')
    .reduce((acc, curr) => acc + curr.stock, 0);

  const pendingReposicionesCount = roleReposiciones.filter(r => r.estado === 'Pendiente').length;
  const pendingActasCount = actas.filter(a => a.estado === 'Pendiente' || a.estado === 'Borrador').length;
  const criticalStockCount = inventario.filter(i => i.status === 'Bajo mínimo' || i.stock <= i.min).length;
  
  const pendingDevoluciones = devoluciones.filter(d => d.estado === 'Pendiente' || d.estado === 'Parcial').length;

  // Chart data calculations
  // Chart 1: Brigadas por Supervisor
  const supervisoresBrigadasData = supervisores.map(sup => {
    const count = brigadas.filter(b => b.supervisorId === sup.id).length;
    const nameStr = (sup.name && typeof sup.name === 'string') ? sup.name : 'Supervisor';
    return { name: nameStr.split(' ')[0], brigadas: count };
  });

  // Chart 2: Técnicos por Brigada (top 5)
  const tecnicosBrigadaData = brigadas.slice(0, 5).map(b => {
    const count = tecnicos.filter(t => t.brigadaId === b.id).length;
    return { name: b.id, técnicos: count };
  });

  const COLORS = ['#f28524', '#1e293b', '#10b981', '#3b82f6', '#f59e0b'];

  return (
    <div className="space-y-6">
      
      {/* Welcome Banner */}
      <div className="glass-panel rounded-lg p-6 border-neon-cyan flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center space-x-2">
            <span className="text-neon-cyan animate-pulse">●</span>
            <span>Ingmelec Dominicana - Sistema de Control Logístico</span>
          </h2>
          <p className="text-xs text-industrial-gray font-semibold mt-1">
            Ubicación del nodo: <span className="text-slate-800">Lote 4 Noroeste</span> | Operador activo: <span className="text-industrial-cyan font-bold">{currentUser.name}</span>
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs bg-industrial-bg bg-opacity-50 p-2.5 rounded border border-industrial-border">
          <Clock size={14} className="text-industrial-cyan" />
          <span className="font-mono text-industrial-gray">Telemetry Lock: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      {/* -------------------- 1. STATS METRICS BLOCK -------------------- */}
      
      {/* DEVELOPER / GERENTE METRICS */}
      {(currentRole === 'Developer' || currentRole === 'Gerente') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-panel p-5 rounded-lg border-l-4 border-l-industrial-cyan relative overflow-hidden group hover:scale-[1.02] transition-transform">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-industrial-gray font-bold uppercase tracking-wider">Dotación Técnica</p>
                <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{totalTechnicians} <span className="text-xs text-industrial-gray font-normal">Técnicos</span></h3>
              </div>
              <div className="w-10 h-10 rounded bg-industrial-cyan bg-opacity-10 flex items-center justify-center text-industrial-cyan">
                <Users size={20} />
              </div>
            </div>
            <p className="text-[10px] text-industrial-gray font-semibold mt-4">
              En <span className="text-slate-800 font-bold">{totalBrigades} brigadas</span> activas.
            </p>
          </div>

          <div className="glass-panel p-5 rounded-lg border-l-4 border-l-industrial-orange relative overflow-hidden group hover:scale-[1.02] transition-transform">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-industrial-gray font-bold uppercase tracking-wider">Reposiciones Abiertas</p>
                <h3 className="text-2xl font-extrabold text-industrial-orange mt-1">{pendingReposicionesCount} <span className="text-xs text-industrial-gray font-normal">Casos</span></h3>
              </div>
              <div className="w-10 h-10 rounded bg-industrial-orange bg-opacity-10 flex items-center justify-center text-industrial-orange">
                <AlertTriangle size={20} />
              </div>
            </div>
            <p className="text-[10px] text-industrial-gray font-semibold mt-4">
              Valor estimado: <span className="text-slate-800 font-bold">${roleReposiciones.reduce((acc, c) => acc + (c.estado === 'Pendiente' ? (parseFloat(c.valor) || 0) : 0), 0).toFixed(2)} USD</span>
            </p>
          </div>

          <div className="glass-panel p-5 rounded-lg border-l-4 border-l-industrial-green relative overflow-hidden group hover:scale-[1.02] transition-transform">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-industrial-gray font-bold uppercase tracking-wider">Actas Pendientes</p>
                <h3 className="text-2xl font-extrabold text-industrial-green mt-1">{pendingActasCount} <span className="text-xs text-industrial-gray font-normal">Protocolos</span></h3>
              </div>
              <div className="w-10 h-10 rounded bg-industrial-green bg-opacity-10 flex items-center justify-center text-industrial-green">
                <FileText size={20} />
              </div>
            </div>
            <p className="text-[10px] text-industrial-gray font-semibold mt-4">
              Requieren <span className="text-slate-800 font-bold">firma digital de supervisor</span>.
            </p>
          </div>

          <div className="glass-panel p-5 rounded-lg border-l-4 border-l-purple-500 relative overflow-hidden group hover:scale-[1.02] transition-transform">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-industrial-gray font-bold uppercase tracking-wider">Stock Crítico</p>
                <h3 className="text-2xl font-extrabold text-purple-600 mt-1">{criticalStockCount} <span className="text-xs text-industrial-gray font-normal">Ítems</span></h3>
              </div>
              <div className="w-10 h-10 rounded bg-purple-500 bg-opacity-10 flex items-center justify-center text-purple-600">
                <Hammer size={20} />
              </div>
            </div>
            <p className="text-[10px] text-industrial-gray font-semibold mt-4">
              Stock <span className="text-slate-800 font-bold">bajo el mínimo establecido</span>.
            </p>
          </div>
        </div>
      )}

      {/* COORDINADOR METRICS (WILLIAM) */}
      {currentRole === 'Coordinador' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-panel p-5 rounded-lg border-l-4 border-l-industrial-cyan">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-industrial-gray font-bold uppercase tracking-wider">Supervisores a Cargo</p>
                <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{totalSupervisores}</h3>
              </div>
              <div className="w-10 h-10 rounded bg-industrial-cyan bg-opacity-10 flex items-center justify-center text-industrial-cyan">
                <ShieldCheck size={20} />
              </div>
            </div>
            <p className="text-[10px] text-industrial-gray font-semibold mt-4">
              Zona: <span className="text-slate-800 font-bold">Noroeste Lote 4</span>
            </p>
          </div>

          <div className="glass-panel p-5 rounded-lg border-l-4 border-l-industrial-orange">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-industrial-gray font-bold uppercase tracking-wider">Mis Brigadas Activas</p>
                <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{totalBrigades}</h3>
              </div>
              <div className="w-10 h-10 rounded bg-industrial-orange bg-opacity-10 flex items-center justify-center text-industrial-orange">
                <Users size={20} />
              </div>
            </div>
            <p className="text-[10px] text-industrial-gray font-semibold mt-4">
              Campamento: <span className="text-slate-800 font-bold">Mantenimiento Noroeste</span>
            </p>
          </div>

          <div className="glass-panel p-5 rounded-lg border-l-4 border-l-industrial-green">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-industrial-gray font-bold uppercase tracking-wider">Actas Lote 4</p>
                <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{actas.length} <span className="text-xs text-industrial-gray font-normal">Totales</span></h3>
              </div>
              <div className="w-10 h-10 rounded bg-industrial-green bg-opacity-10 flex items-center justify-center text-industrial-green">
                <FileText size={20} />
              </div>
            </div>
            <p className="text-[10px] text-industrial-gray font-semibold mt-4">
              <span className="text-slate-800 font-bold">{pendingActasCount} pendientes</span> de validación.
            </p>
          </div>

          <div className="glass-panel p-5 rounded-lg border-l-4 border-l-purple-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-industrial-gray font-bold uppercase tracking-wider">Reposiciones Lote 4</p>
                <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{pendingReposicionesCount} <span className="text-xs text-industrial-gray font-normal">Abiertas</span></h3>
              </div>
              <div className="w-10 h-10 rounded bg-purple-500 bg-opacity-10 flex items-center justify-center text-purple-600">
                <AlertTriangle size={20} />
              </div>
            </div>
            <p className="text-[10px] text-industrial-gray font-semibold mt-4">
              Requieren <span className="text-slate-800 font-bold">autorización administrativa</span>.
            </p>
          </div>
        </div>
      )}

      {/* SUPERVISOR METRICS (ISAAC/CRISTIAN) */}
      {currentRole?.startsWith('Supervisor') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-panel p-5 rounded-lg border-l-4 border-l-industrial-cyan">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-industrial-gray font-bold uppercase tracking-wider">Mis Brigadas</p>
                <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{totalBrigades} <span className="text-xs text-industrial-gray font-normal">Asignadas</span></h3>
              </div>
              <div className="w-10 h-10 rounded bg-industrial-cyan bg-opacity-10 flex items-center justify-center text-industrial-cyan">
                <Users size={20} />
              </div>
            </div>
            <p className="text-[10px] text-industrial-gray font-semibold mt-4">
              Personal asignado: <span className="text-slate-800 font-bold">{totalTechnicians} Técnicos</span>
            </p>
          </div>

          <div className="glass-panel p-5 rounded-lg border-l-4 border-l-industrial-orange">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-industrial-gray font-bold uppercase tracking-wider">Devoluciones de Turno</p>
                <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{pendingDevoluciones} <span className="text-xs text-industrial-gray font-normal">Casos</span></h3>
              </div>
              <div className="w-10 h-10 rounded bg-industrial-orange bg-opacity-10 flex items-center justify-center text-industrial-orange">
                <RotateCcw size={20} />
              </div>
            </div>
            <p className="text-[10px] text-industrial-gray font-semibold mt-4">
              Retorno <span className="text-slate-800 font-bold">de herramientas al almacén</span>.
            </p>
          </div>

          <div className="glass-panel p-5 rounded-lg border-l-4 border-l-industrial-green">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-industrial-gray font-bold uppercase tracking-wider font-extrabold">Actas por Firmar</p>
                <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{actas.filter(a => a.responsable === currentUser.name && !a.firmado).length} <span className="text-xs text-industrial-gray font-normal">Firmas</span></h3>
              </div>
              <div className="w-10 h-10 rounded bg-industrial-green bg-opacity-10 flex items-center justify-center text-industrial-green">
                <FileText size={20} />
              </div>
            </div>
            <p className="text-[10px] text-industrial-gray font-semibold mt-4">
              Requiere <span className="text-slate-800 font-bold">firma digital manuscrita</span>.
            </p>
          </div>

          <div className="glass-panel p-5 rounded-lg border-l-4 border-l-purple-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-industrial-gray font-bold uppercase tracking-wider">Incidencias Reportadas</p>
                <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{roleReposiciones.length} <span className="text-xs text-industrial-gray font-normal">Historial</span></h3>
              </div>
              <div className="w-10 h-10 rounded bg-purple-500 bg-opacity-10 flex items-center justify-center text-purple-600">
                <AlertTriangle size={20} />
              </div>
            </div>
            <p className="text-[10px] text-industrial-gray font-semibold mt-4">
              <span className="text-slate-800 font-bold">{roleReposiciones.filter(r => r.estado === 'Pendiente').length} pendientes</span> de reponer.
            </p>
          </div>
        </div>
      )}

      {/* -------------------- 2. CHARTS SECTION -------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Brigades by Supervisor Chart */}
        <div className="lg:col-span-8 glass-panel rounded-lg p-5">
          <div className="flex items-center justify-between mb-4 border-b border-industrial-border pb-3">
            <div className="flex items-center space-x-2">
              <TrendingUp size={16} className="text-industrial-cyan" />
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">Asignación Operativa: Brigadas por Supervisor</h4>
            </div>
            <span className="text-[10px] bg-industrial-cyan bg-opacity-10 border border-industrial-cyan border-opacity-35 text-industrial-cyan px-2 py-0.5 rounded uppercase font-bold tracking-wider">
              En Tiempo Real
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={supervisoresBrigadasData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                <Tooltip 
                  contentStyle={{ background: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} 
                  labelStyle={{ color: '#f28524', fontSize: '11px', fontWeight: 'bold' }}
                  itemStyle={{ color: '#1e293b', fontSize: '11px' }}
                />
                <Bar dataKey="brigadas" fill="#00f0ff" radius={[4, 4, 0, 0]}>
                  {supervisoresBrigadasData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Roster count per brigade */}
        <div className="lg:col-span-4 glass-panel rounded-lg p-5">
          <div className="flex items-center justify-between mb-4 border-b border-industrial-border pb-3">
            <div className="flex items-center space-x-2">
              <Activity size={16} className="text-industrial-orange" />
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Técnicos por Brigada</h4>
            </div>
          </div>

          <div className="h-64 w-full flex flex-col justify-between">
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={tecnicosBrigadaData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="técnicos"
                  >
                    {tecnicosBrigadaData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ background: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                    itemStyle={{ color: '#1e293b', fontSize: '10px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            {/* Custom Legend */}
            <div className="grid grid-cols-2 gap-2 text-[10px] border-t border-industrial-border pt-3">
              {tecnicosBrigadaData.map((item, idx) => (
                <div key={item.name} className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                  <span className="text-industrial-gray font-semibold truncate">{item.name}:</span>
                  <span className="text-white font-bold">{item.técnicos}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* -------------------- 3. RECENT ACTIVITY LIST (AUDIT TRAIL SIMULATION) -------------------- */}
      <div className="glass-panel rounded-lg p-5">
        <div className="flex items-center justify-between mb-4 border-b border-industrial-border pb-3">
          <div className="flex items-center space-x-2">
            <Clock size={16} className="text-industrial-cyan" />
            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Registro Reciente de Modificaciones Operativas</h4>
          </div>
          <button 
            onClick={() => setActivePage('auditoria')}
            className="text-xs text-industrial-cyan hover:underline font-bold"
          >
            Ver Auditoría Completa
          </button>
        </div>

        <div className="space-y-2">
          {auditoria.slice(0, 4).map((log) => (
            <div 
              key={log.id} 
              className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-industrial-bg bg-opacity-35 hover:bg-opacity-50 rounded border border-industrial-border gap-2 transition-all"
            >
              <div className="flex items-center space-x-3">
                <div className="w-2.5 h-2.5 rounded-full bg-industrial-cyan shadow-cyan-glow flex-shrink-0" />
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-slate-800 truncate">{log.entidad}</span>
                    <span className="text-[9px] bg-industrial-border px-1.5 py-0.2 rounded text-industrial-gray font-mono uppercase tracking-wider">
                      {log.accion}
                    </span>
                  </div>
                  <p className="text-[10px] text-industrial-gray mt-0.5 leading-relaxed truncate max-w-lg">
                    Cambio: <span className="text-slate-700 font-medium">{log.despues}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-4 text-[10px] text-industrial-gray font-semibold sm:text-right pl-5 sm:pl-0">
                <div>
                  <span className="text-slate-800 font-bold">@{log.usuario}</span>
                  <span className="block text-[8px] text-industrial-gray uppercase font-bold tracking-widest">{log.rol}</span>
                </div>
                <span className="text-[9px] font-mono text-industrial-cyan">
                  {(log.fecha && typeof log.fecha === 'string') ? (log.fecha.split(' ')[1] || log.fecha) : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default DashboardPage;
