import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  AlertTriangle, 
  Search, 
  Check, 
  X, 
  DollarSign, 
  Hammer, 
  UserCheck, 
  AlertOctagon 
} from 'lucide-react';

const ReposicionesPage = () => {
  const { 
    currentRole,
    supervisores,
    getFilteredReposiciones,
    resolveReposicion 
  } = useApp();

  const activeReposiciones = getFilteredReposiciones();

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Filtered List
  const filteredReposiciones = activeReposiciones.filter(r => {
    const matchesSearch = r.colaborador.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          r.item.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.motivo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === '' || r.estado === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'Repuesta': return 'bg-industrial-green/10 border-industrial-green/30 text-industrial-green';
      case 'Aprobada': return 'bg-industrial-cyan/10 border-industrial-cyan/30 text-industrial-cyan';
      case 'Pendiente': return 'bg-industrial-yellow/10 border-industrial-yellow/30 text-industrial-yellow animate-pulse';
      case 'Rechazada': return 'bg-industrial-red/10 border-industrial-red/30 text-industrial-red border-dashed';
      case 'Descontar': return 'bg-purple-500/10 border-purple-500/30 text-purple-400';
      default: return 'bg-slate-500/10 border-slate-500/30 text-slate-400';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'Repuesta': return 'Repuesto';
      case 'Aprobada': return 'Aprobado';
      case 'Pendiente': return 'Pendiente';
      case 'Rechazada': return 'Rechazado';
      case 'Descontar': return 'Descontar Nómina';
      default: return status;
    }
  };

  // Calculations for headers
  const totalDamageValue = activeReposiciones.reduce((acc, curr) => acc + (parseFloat(curr.valor) || 0), 0);
  const pendingValue = activeReposiciones.reduce((acc, curr) => acc + (curr.estado === 'Pendiente' ? (parseFloat(curr.valor) || 0) : 0), 0);
  const payrollDiscountValue = activeReposiciones.reduce((acc, curr) => acc + (curr.estado === 'Descontar' ? (parseFloat(curr.valor) || 0) : 0), 0);

  return (
    <div className="space-y-6">
      
      {/* -------------------- OVERALL LOGISTICS STATS -------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-panel p-4 rounded-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest">Costo de Incidencias Histórico</span>
              <h4 className="text-lg font-extrabold text-white mt-1">${totalDamageValue.toFixed(2)} USD</h4>
            </div>
            <div className="w-8 h-8 rounded bg-industrial-cyan bg-opacity-10 flex items-center justify-center text-industrial-cyan">
              <DollarSign size={16} />
            </div>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-lg relative overflow-hidden border-l-2 border-l-industrial-yellow">
          <div className="flex items-center justify-between">
            <div>
              <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest">Compromiso por Resolver</span>
              <h4 className="text-lg font-extrabold text-industrial-yellow mt-1">${pendingValue.toFixed(2)} USD</h4>
            </div>
            <div className="w-8 h-8 rounded bg-industrial-yellow bg-opacity-10 flex items-center justify-center text-industrial-yellow">
              <AlertTriangle size={16} />
            </div>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-lg relative overflow-hidden border-l-2 border-l-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest">Cargos por Descuento Nómina</span>
              <h4 className="text-lg font-extrabold text-purple-400 mt-1">${payrollDiscountValue.toFixed(2)} USD</h4>
            </div>
            <div className="w-8 h-8 rounded bg-purple-500 bg-opacity-10 flex items-center justify-center text-purple-400">
              <AlertOctagon size={16} />
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="glass-panel p-4 rounded-lg flex flex-col md:flex-row gap-4 justify-between items-center border-opacity-40">
        
        {/* Search */}
        <div className="relative w-full md:w-80">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-industrial-gray">
            <Search size={14} />
          </span>
          <input
            type="text"
            placeholder="Buscar por colaborador, ítem o motivo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-industrial-bg bg-opacity-70 border border-industrial-border rounded px-3 py-1.5 pl-9 text-xs text-white focus:outline-none focus:border-industrial-cyan"
          />
        </div>

        {/* Filters */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full md:w-48 bg-industrial-bg border border-industrial-border text-xs text-white px-3 py-1.5 rounded focus:outline-none focus:border-industrial-cyan font-semibold"
        >
          <option value="">Todos los Estados</option>
          <option value="Pendiente">Pendientes</option>
          <option value="Aprobada">Aprobados</option>
          <option value="Rechazada">Rechazados</option>
          <option value="Descontar">Descuento Nómina</option>
          <option value="Repuesta">Repuestos</option>
        </select>

      </div>

      {/* Main Datatable */}
      <div className="glass-panel rounded-lg overflow-hidden border-opacity-40">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-industrial-bg bg-opacity-80 text-industrial-gray font-bold uppercase tracking-wider border-b border-industrial-border text-[10px]">
                <th className="p-4">Colaborador Afectado</th>
                <th className="p-4">Herramienta / EPP Dañado</th>
                <th className="p-4">Motivo de Incidencia</th>
                <th className="p-4">Costo Reposición</th>
                <th className="p-4">Fecha Reporte</th>
                <th className="p-4">Supervisores Enlace</th>
                <th className="p-4">Estado</th>
                {(currentRole === 'Developer' || currentRole === 'Gerente' || currentRole === 'Coordinador') && <th className="p-4 text-right">Acción Administrativa</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-border font-semibold">
              {filteredReposiciones.map((r) => {
                const sup = supervisores.find(s => s.id === r.supervisorId);
                
                return (
                  <tr key={r.id} className="hover:bg-industrial-border hover:bg-opacity-20 transition-all">
                    <td className="p-4 text-white text-sm">{r.colaborador}</td>
                    <td className="p-4">
                      <span className="text-white text-[11px] block">{r.item}</span>
                      <span className="text-[8px] text-industrial-gray uppercase font-bold tracking-widest">ID Ticket: {r.id}</span>
                    </td>
                    <td className="p-4 text-industrial-gray text-[11px] truncate max-w-xs">{r.motivo}</td>
                    <td className="p-4 font-mono text-white text-[11px]">${(parseFloat(r.valor) || 0).toFixed(2)} USD</td>
                    <td className="p-4 font-mono text-white text-[11px]">{r.fecha}</td>
                    <td className="p-4">
                      <span className="text-white text-[11px] block">{sup?.name || 'Isaac Gedeoni'}</span>
                      <span className="text-[8px] text-industrial-gray uppercase font-bold tracking-widest">Coordinador: William</span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 border rounded text-[9px] uppercase font-bold tracking-wider ${getStatusColor(r.estado)}`}>
                        {getStatusLabel(r.estado)}
                      </span>
                    </td>
                    
                    {/* Action Panel for Administrative Roles */}
                    {(currentRole === 'Developer' || currentRole === 'Gerente' || currentRole === 'Coordinador') && (
                      <td className="p-4 text-right">
                        {r.estado === 'Pendiente' ? (
                          <div className="flex items-center justify-end space-x-1">
                            <button
                              onClick={() => resolveReposicion(r.id, 'Aprobada')}
                              className="px-2 py-1 rounded bg-industrial-cyan text-industrial-bg hover:bg-cyan-400 font-extrabold text-[9px] uppercase tracking-wider transition-colors"
                              title="Aprobar para Compra"
                            >
                              Aprobar
                            </button>
                            <button
                              onClick={() => resolveReposicion(r.id, 'Descontar')}
                              className="px-2 py-1 rounded bg-purple-500 text-white hover:bg-purple-600 font-extrabold text-[9px] uppercase tracking-wider transition-colors"
                              title="Descontar de Sueldo por Pérdida"
                            >
                              Descontar
                            </button>
                            <button
                              onClick={() => resolveReposicion(r.id, 'Rechazada')}
                              className="p-1 rounded bg-industrial-red/10 hover:bg-industrial-red/20 text-industrial-red border border-industrial-red/20 transition-all"
                              title="Rechazar Reclamo"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : r.estado === 'Aprobada' ? (
                          <button
                            onClick={() => resolveReposicion(r.id, 'Repuesta')}
                            className="px-2 py-1 rounded bg-industrial-green text-industrial-bg hover:bg-green-400 font-extrabold text-[9px] uppercase tracking-wider transition-all flex items-center space-x-1 ml-auto"
                          >
                            <Hammer size={10} />
                            <span>Entregar Repuesto</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-industrial-gray font-semibold">Resuelto</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default ReposicionesPage;
