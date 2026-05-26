import React from 'react';
import { useApp } from '../context/AppContext';
import { 
  BarChart, Bar, 
  XAxis, YAxis, Tooltip, 
  Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, 
  AreaChart, Area, 
  LineChart, Line 
} from 'recharts';
import { 
  BarChart3, 
  Download, 
  Calendar, 
  TrendingUp, 
  FileCheck2, 
  ShieldCheck, 
  Hammer 
} from 'lucide-react';

const ReportesPage = () => {
  const { 
    tecnicos, 
    brigadas, 
    reposiciones, 
    inventario, 
    actas 
  } = useApp();

  const COLORS = ['#00f0ff', '#ff6b00', '#10b981', '#a855f7', '#f59e0b', '#ef4444'];

  // 1. Personal por Zona
  const personalPorZonaData = [
    { name: 'Noroeste Lote 4', Técnicos: tecnicos.length },
    { name: 'Sur Lote 1', Técnicos: 8 },
    { name: 'Este Lote 2', Técnicos: 12 },
    { name: 'Metro Lote 3', Técnicos: 19 }
  ];

  // 2. Brigadas por Coordinador
  const brigadasCoordinadorData = [
    { name: 'Coordinador William', Brigadas: brigadas.length },
    { name: 'Coordinadora Sofía', Brigadas: 5 },
    { name: 'Coordinador Marcos', Brigadas: 4 }
  ];

  // 3. Brigadas por Supervisor
  const brigadasPorSupervisorData = [
    { name: 'Isaac G. (TCT)', Brigadas: brigadas.filter(b => b.supervisorId === 'SUP-001').length },
    { name: 'Cristian P. (Maint)', Brigadas: brigadas.filter(b => b.supervisorId === 'SUP-002').length }
  ];

  // 4. Técnicos por Brigada
  const tecnicosPorBrigadaData = brigadas.map(b => ({
    name: b.id,
    Técnicos: tecnicos.filter(t => t.brigadaId === b.id).length
  }));

  // 5. Reposiciones por Zona (Valores en USD)
  const reposicionesPorZonaData = [
    { name: 'Lote 4 Noroeste', Costo: reposiciones.reduce((acc, c) => acc + c.valor, 0) },
    { name: 'Lote 1 Sur', Costo: 420.00 },
    { name: 'Lote 2 Este', Costo: 180.00 },
    { name: 'Lote 3 Metro', Costo: 890.00 }
  ];

  // 6. Actas por Estado
  const actasPorEstadoData = [
    { name: 'Borrador', Actas: actas.filter(a => a.estado === 'Borrador').length },
    { name: 'Validada', Actas: actas.filter(a => a.estado === 'Validada').length },
    { name: 'Firmada', Actas: actas.filter(a => a.estado === 'Firmada').length },
    { name: 'Anulada', Actas: actas.filter(a => a.estado === 'Anulada').length },
    { name: 'Pendiente', Actas: actas.filter(a => a.estado === 'Pendiente').length }
  ];

  // Custom tooltips
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-industrial-panel border border-industrial-border p-2.5 rounded shadow-panel-glow">
          <p className="text-neon-cyan font-bold text-xs">{label}</p>
          <p className="text-white text-xs font-semibold mt-1">
            {payload[0].name}: <span className="font-extrabold">{payload[0].value}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  const handleExportData = () => {
    alert('Preparando y compilando reporte cifrado en PDF...\nGenerando hashes criptográficos de GridOps...\n[PDF exportado con éxito en simulación]');
  };

  return (
    <div className="space-y-6">
      
      {/* Header filters */}
      <div className="glass-panel p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-opacity-40">
        <div className="flex items-center space-x-2">
          <Calendar size={14} className="text-industrial-cyan" />
          <span className="text-xs text-industrial-gray font-bold">Rango Operativo: <span className="text-white">Mayo 2026 (Mensual Activo)</span></span>
        </div>
        <button
          onClick={handleExportData}
          className="flex items-center justify-center space-x-2 px-4 py-1.5 rounded bg-gradient-to-r from-industrial-cyan to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-industrial-bg text-xs font-extrabold tracking-wider uppercase transition-all shadow-cyan-glow"
        >
          <Download size={14} />
          <span>Exportar PDF Operativo</span>
        </button>
      </div>

      {/* Grid containing 6 charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Chart 1: Personal por Zona */}
        <div className="glass-panel rounded-lg p-5">
          <div className="flex items-center justify-between mb-4 border-b border-industrial-border pb-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">1. Colaboradores por Lote / Zona</h4>
            <span className="w-2.5 h-2.5 rounded-full bg-industrial-cyan shadow-cyan-glow" />
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={personalPorZonaData}>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Técnicos" fill="#00f0ff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Brigadas por Coordinador */}
        <div className="glass-panel rounded-lg p-5">
          <div className="flex items-center justify-between mb-4 border-b border-industrial-border pb-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">2. Brigadas por Coordinador de Lote</h4>
            <span className="w-2.5 h-2.5 rounded-full bg-industrial-orange shadow-orange-glow" />
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={brigadasCoordinadorData}
                  cx="50%"
                  cy="50%"
                  outerRadius={65}
                  dataKey="Brigadas"
                  label={({ name, percent }) => `${name.split(' ')[1]}: ${(percent * 100).toFixed(0)}%`}
                >
                  {brigadasCoordinadorData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Brigadas por Supervisor */}
        <div className="glass-panel rounded-lg p-5">
          <div className="flex items-center justify-between mb-4 border-b border-industrial-border pb-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">3. Brigadas por Supervisor (Lote 4)</h4>
            <span className="w-2.5 h-2.5 rounded-full bg-industrial-green shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={brigadasPorSupervisorData}>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Brigadas" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Técnicos por Brigada */}
        <div className="glass-panel rounded-lg p-5">
          <div className="flex items-center justify-between mb-4 border-b border-industrial-border pb-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">4. Dotación de Técnicos por Roster de Brigada</h4>
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.4)]" />
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tecnicosPorBrigadaData}>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={8} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Técnicos" fill="#a855f7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 5: Reposiciones por Zona */}
        <div className="glass-panel rounded-lg p-5">
          <div className="flex items-center justify-between mb-4 border-b border-industrial-border pb-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">5. Costo de Reposición por Daño en USD</h4>
            <span className="w-2.5 h-2.5 rounded-full bg-industrial-yellow shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={reposicionesPorZonaData}>
                <defs>
                  <linearGradient id="colorCosto" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="Costo" stroke="#f59e0b" fillOpacity={1} fill="url(#colorCosto)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 6: Actas por Estado */}
        <div className="glass-panel rounded-lg p-5">
          <div className="flex items-center justify-between mb-4 border-b border-industrial-border pb-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">6. Estado de Actas de Entrega / Despacho</h4>
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]" />
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={actasPorEstadoData}>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                <Tooltip />
                <Line type="monotone" dataKey="Actas" stroke="#3b82f6" strokeWidth={2.5} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

    </div>
  );
};

export default ReportesPage;
