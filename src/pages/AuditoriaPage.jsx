import { useState, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatAuditDetails, toSafeDisplayString } from '../utils/jsonFormat';
import DateRangeFilter, { EMPTY_DATE_RANGE, dateRangeParams } from '../components/common/DateRangeFilter';

export default function AuditoriaPage() {
  const { fetchAuditoria } = useApp();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [fechaRango, setFechaRango] = useState(EMPTY_DATE_RANGE); // v2.2: fecha del evento (inv_auditoria.fecha)

  useEffect(() => {
    const hayFecha = Boolean(fechaRango.desde || fechaRango.hasta);
    setLoading(true);
    // Sin filtro: misma llamada de siempre. Con filtro: el backend filtra y se permite un tope mayor.
    (hayFecha ? fetchAuditoria({ limit: 500, ...dateRangeParams(fechaRango) }) : fetchAuditoria(150))
      .then(res => {
        if (res.success) setLogs(res.logs);
      })
      .finally(() => setLoading(false));
  }, [fetchAuditoria, fechaRango]);

  const filteredLogs = logs.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      toSafeDisplayString(l.accion, '').toLowerCase().includes(q) ||
      toSafeDisplayString(l.usuario_nombre, '').toLowerCase().includes(q) ||
      toSafeDisplayString(l.entidad, '').toLowerCase().includes(q)
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

        <div className="w-full sm:w-auto flex items-center gap-2">
          <DateRangeFilter value={fechaRango} onChange={setFechaRango} label="Filtrar por fecha del evento" />
          <input
            type="text"
            placeholder="Filtrar por acción o usuario..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full sm:w-72 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#F28524] focus:outline-none"
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
                filteredLogs.map(log => {
                  const hasDetails = Boolean(log.detalles_nuevos || log.detalles_previos);
                  const formattedDetails = formatAuditDetails(log.detalles_nuevos, log.detalles_previos, '');
                  const prevRaw = log.detalles_previos ? `Previo: ${toSafeDisplayString(log.detalles_previos, '')}` : '';
                  const newRaw = log.detalles_nuevos ? `Nuevo: ${toSafeDisplayString(log.detalles_nuevos, '')}` : '';
                  const tooltipText = [prevRaw, newRaw].filter(Boolean).join(' | ');

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 text-slate-500 font-mono whitespace-nowrap text-[11px]">
                        {log.fecha ? new Date(log.fecha).toLocaleString('es-DO') : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-800">{toSafeDisplayString(log.usuario_nombre, 'Sistema')}</span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-900 text-white">
                          {toSafeDisplayString(log.accion, 'EVENTO')}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {toSafeDisplayString(log.entidad, '—')} {log.entidad_id ? `#${toSafeDisplayString(log.entidad_id, '')}` : ''}
                      </td>
                      <td className="py-3 px-4 max-w-md">
                        {hasDetails && formattedDetails ? (
                          <div
                            className="font-mono text-[10px] text-slate-600 bg-slate-50 p-1.5 rounded border border-slate-100 truncate"
                            title={tooltipText || formattedDetails}
                          >
                            {formattedDetails}
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {toSafeDisplayString(log.ip_origen, '127.0.0.1')}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
