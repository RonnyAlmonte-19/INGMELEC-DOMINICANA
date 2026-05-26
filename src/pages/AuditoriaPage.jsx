import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Terminal, 
  Search, 
  Filter, 
  Calendar, 
  Eye, 
  X, 
  ArrowRight,
  GitBranch,
  Shield
} from 'lucide-react';

const AuditoriaPage = () => {
  const { auditoria } = useApp();

  // Search & Multi-Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  // Selected Log for Diff Viewer
  const [selectedLog, setSelectedLog] = useState(null);

  // Filtered List
  const filteredLogs = auditoria.filter(log => {
    const matchesSearch = log.entidad.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          log.antes.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          log.despues.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesUser = userFilter === '' || log.usuario.toLowerCase() === userFilter.toLowerCase();
    const matchesAction = actionFilter === '' || log.accion === actionFilter;

    return matchesSearch && matchesUser && matchesAction;
  });

  // Extract unique users and actions for filter options
  const uniqueUsers = Array.from(new Set(auditoria.map(l => l.usuario)));
  const uniqueActions = Array.from(new Set(auditoria.map(l => l.accion)));

  const getActionColor = (action) => {
    if (action.includes('LOGIN')) return 'text-industrial-cyan border-industrial-cyan/30 bg-industrial-cyan/5';
    if (action.includes('BAJA') || action.includes('ANULACION') || action.includes('RETORNO')) return 'text-industrial-red border-industrial-red/30 bg-industrial-red/5';
    if (action.includes('CREACION') || action.includes('STOCK')) return 'text-industrial-green border-industrial-green/30 bg-industrial-green/5';
    return 'text-industrial-yellow border-industrial-yellow/30 bg-industrial-yellow/5';
  };

  const formatDiffContent = (content) => {
    try {
      const parsed = JSON.parse(content);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      return content;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Search & Advanced Filters */}
      <div className="glass-panel p-4 rounded-lg flex flex-col xl:flex-row gap-4 justify-between items-center border-opacity-40">
        
        {/* Search */}
        <div className="relative w-full xl:w-80">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-industrial-gray">
            <Search size={14} />
          </span>
          <input
            type="text"
            placeholder="Buscar por entidad o contenido..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-industrial-bg bg-opacity-70 border border-industrial-border rounded px-3 py-1.5 pl-9 text-xs text-white focus:outline-none focus:border-industrial-cyan"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto justify-end">
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="bg-industrial-bg border border-industrial-border text-xs text-white px-3 py-1.5 rounded focus:outline-none focus:border-industrial-cyan font-semibold"
          >
            <option value="">Todos los Usuarios</option>
            {uniqueUsers.map(usr => (
              <option key={usr} value={usr}>@{usr}</option>
            ))}
          </select>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-industrial-bg border border-industrial-border text-xs text-white px-3 py-1.5 rounded focus:outline-none focus:border-industrial-cyan font-semibold"
          >
            <option value="">Todas las Acciones</option>
            {uniqueActions.map(act => (
              <option key={act} value={act}>{act}</option>
            ))}
          </select>
        </div>

      </div>

      {/* Main Datatable */}
      <div className="glass-panel rounded-lg overflow-hidden border-opacity-40">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-industrial-bg bg-opacity-80 text-industrial-gray font-bold uppercase tracking-wider border-b border-industrial-border text-[9px]">
                <th className="p-4">Timestamp</th>
                <th className="p-4">Operador Usuario</th>
                <th className="p-4">Rol de Acceso</th>
                <th className="p-4">Acción</th>
                <th className="p-4">Entidad Mutada</th>
                <th className="p-4">Ubicación / IP</th>
                <th className="p-4 text-right">Comparar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-border font-semibold">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-industrial-border hover:bg-opacity-20 transition-all">
                  <td className="p-4 font-mono text-white text-[11px]">{log.fecha}</td>
                  <td className="p-4 text-white text-sm">@{log.usuario}</td>
                  <td className="p-4 text-industrial-gray text-[11px]">{log.rol}</td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 border rounded text-[9px] font-mono font-bold uppercase tracking-widest ${getActionColor(log.accion)}`}>
                      {log.accion}
                    </span>
                  </td>
                  <td className="p-4 text-white text-[11px] truncate max-w-xs">{log.entidad}</td>
                  <td className="p-4 font-mono text-[10px] text-industrial-gray">
                    <div>IP: {log.ip}</div>
                    <div className="text-[9px] tracking-wide mt-0.5">{log.zona}</div>
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="p-1 rounded bg-industrial-cyan bg-opacity-10 hover:bg-opacity-20 text-industrial-cyan border border-industrial-cyan border-opacity-20 transition-all text-xs font-bold"
                      title="Ver Diferencias de Estado"
                    >
                      <Eye size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* -------------------- DOCK PANEL MODAL: STATE DIFF COMPARATOR -------------------- */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div 
            className="w-full max-w-4xl glass-panel rounded-lg p-6 border-neon-cyan max-h-[90vh] overflow-y-auto"
            style={{ background: 'rgba(13, 21, 39, 0.95)' }}
          >
            <div className="flex items-center justify-between border-b border-industrial-border pb-3 mb-4">
              <div className="flex items-center space-x-2 text-industrial-cyan">
                <Terminal size={18} />
                <h3 className="font-extrabold text-sm uppercase tracking-wider">Comparador de Auditoría y Diff de Estados (Ticket {selectedLog.id})</h3>
              </div>
              <button onClick={() => setSelectedLog(null)} className="text-industrial-gray hover:text-white">
                <X size={18} />
              </button>
            </div>

            {/* Log Metadata header */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-industrial-bg bg-opacity-60 rounded border border-industrial-border text-xs mb-4">
              <div>
                <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest">Operador</span>
                <span className="text-white text-[11px]">@{selectedLog.usuario} ({selectedLog.rol})</span>
              </div>
              <div>
                <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest">Fecha y Hora</span>
                <span className="text-white text-[11px] font-mono">{selectedLog.fecha}</span>
              </div>
              <div>
                <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest">IP de Registro</span>
                <span className="text-white text-[11px] font-mono">{selectedLog.ip}</span>
              </div>
              <div>
                <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest">Canal / Client</span>
                <span className="text-white text-[11px] truncate block" title={selectedLog.userAgent}>Web browser / React Client</span>
              </div>
            </div>

            {/* Visual Code Diffs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Red Left: BEFORE */}
              <div className="space-y-1">
                <span className="text-[9px] text-industrial-red uppercase font-bold tracking-widest flex items-center space-x-1">
                  <span>● State Original (Antes)</span>
                </span>
                <pre className="p-4 rounded bg-industrial-red bg-opacity-5 border border-industrial-red border-opacity-25 font-mono text-[10px] text-industrial-red overflow-x-auto max-h-64 whitespace-pre-wrap select-all leading-relaxed">
                  {formatDiffContent(selectedLog.antes)}
                </pre>
              </div>

              {/* Green Right: AFTER */}
              <div className="space-y-1">
                <span className="text-[9px] text-industrial-green uppercase font-bold tracking-widest flex items-center space-x-1">
                  <span>● State Modificado (Después)</span>
                </span>
                <pre className="p-4 rounded bg-industrial-green bg-opacity-5 border border-industrial-green border-opacity-25 font-mono text-[10px] text-industrial-green overflow-x-auto max-h-64 whitespace-pre-wrap select-all leading-relaxed">
                  {formatDiffContent(selectedLog.despues)}
                </pre>
              </div>

            </div>

            {/* Connection schematic */}
            <div className="flex items-center space-x-2 border-t border-industrial-border pt-4 mt-6 text-[10px] text-industrial-gray font-semibold justify-between">
              <span className="flex items-center space-x-1">
                <Shield size={12} className="text-industrial-cyan" />
                <span>Hash Firmado: {selectedLog.id.replace('AUD', 'G')}-SECURE-CLONE</span>
              </span>
              <span>Ubicación: Lote 4 Campamento</span>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default AuditoriaPage;
