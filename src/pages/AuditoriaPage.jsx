import React, { useState, useEffect } from 'react';
import { ShieldCheck, History, User, Clock, Terminal, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function AuditoriaPage() {
  const { fetchAuditoria } = useApp();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchAuditoria(150)
      .then(res => {
        if (res.success) setLogs(res.logs);
      })
      .finally(() => setLoading(false));
  }, [fetchAuditoria]);

  const filteredLogs = logs.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (l.accion || '').toLowerCase().includes(q) ||
      (l.usuario_nombre || '').toLowerCase().includes(q) ||
      (l.entidad || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-[#F28524]" />
            <span>Bitácora Inmutable de Auditoría y Cumplimiento</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Registro secuencial de todas las operaciones sobre el inventario, transacciones de almacén, logins y modificaciones de usuario.
          </p>
        </div>

        <div className="w-full sm:w-72">
          <input
            type="text"
            placeholder="Filtrar por acción o usuario..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#F28524] focus:outline-none"
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-800">
            Eventos Registrados ({filteredLogs.length})
          </h3>
          <span className="text-xs text-slate-400 font-mono">Trazabilidad ISO / Compliance</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-600 font-bold uppercase">
                <th className="py-3 px-4">Fecha / Hora</th>
                <th className="py-3 px-4">Usuario</th>
                <th className="py-3 px-4">Acción Operativa</th>
                <th className="py-3 px-4">Entidad / ID</th>
                <th className="py-3 px-4">Detalle / Payload JSON</th>
                <th className="py-3 px-4">IP Origen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-16 text-center text-slate-400">
                    Cargando registros de auditoría desde MySQL...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-16 text-center text-slate-400">
                    No se encontraron eventos en la bitácora.
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 text-slate-500 font-mono whitespace-nowrap text-[11px]">
                      {new Date(log.fecha).toLocaleString('es-DO')}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-800">{log.usuario_nombre}</span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-900 text-white">
                        {log.accion}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {log.entidad} {log.entidad_id && `#${log.entidad_id}`}
                    </td>
                    <td className="py-3 px-4 max-w-md">
                      {log.detalles_nuevos ? (
                        <div className="font-mono text-[10px] text-slate-600 bg-slate-50 p-1.5 rounded border border-slate-100 truncate" title={JSON.stringify(log.detalles_nuevos)}>
                          {typeof log.detalles_nuevos === 'string' ? log.detalles_nuevos : JSON.stringify(log.detalles_nuevos)}
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                      {log.ip_origen || '127.0.0.1'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
