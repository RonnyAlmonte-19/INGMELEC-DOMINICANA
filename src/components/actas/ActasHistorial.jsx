import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Search, Printer, Ban } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { userHasPermission } from '../../utils/permissions';
import ActaImprimible from './ActaImprimible';

const inputCls = 'px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none';
const LIMIT = 25;

export default function ActasHistorial({ refreshToken = 0 }) {
  const { fetchActas, fetchActaById, anularActaEntrega, currentUser, campamentosCatalog } = useApp();
  const [filtros, setFiltros] = useState({ q: '', estado: '', campamento_id: '', desde: '', hasta: '' });
  const [pagina, setPagina] = useState(0);
  const [data, setData] = useState({ actas: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [acta, setActa] = useState(null);
  const [anulando, setAnulando] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [errorAnular, setErrorAnular] = useState('');
  const canAnular = userHasPermission(currentUser, 'act:anular');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchActas({ ...filtros, limit: LIMIT, offset: pagina * LIMIT });
      if (r.success) setData({ actas: r.actas, total: r.total });
    } finally { setLoading(false); }
  }, [fetchActas, filtros, pagina]);

  useEffect(() => { const t = setTimeout(cargar, 250); return () => clearTimeout(t); }, [cargar, refreshToken]);

  const setF = (k, v) => { setPagina(0); setFiltros((f) => ({ ...f, [k]: v })); };

  const abrir = async (id) => {
    const r = await fetchActaById(id);
    if (r.success) setActa(r.acta);
  };

  const confirmarAnulacion = async (e) => {
    e.preventDefault();
    setErrorAnular('');
    const r = await anularActaEntrega(anulando.id, motivo);
    if (!r.success) { setErrorAnular(r.message || 'No se pudo anular.'); return; }
    setAnulando(null); setMotivo(''); cargar();
  };

  const paginas = Math.max(1, Math.ceil(data.total / LIMIT));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
      <div className="p-4 border-b border-slate-100 space-y-3">
        <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2"><FileText className="w-4 h-4 text-[#F28524]" /> Historial de Actas de Entrega ({data.total})</h3>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          <div className="relative col-span-2">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input placeholder="N.º acta, colaborador, supervisor, departamento, herramienta, serie…" value={filtros.q} onChange={(e) => setF('q', e.target.value)} className={`${inputCls} w-full pl-8`} />
          </div>
          <select value={filtros.estado} onChange={(e) => setF('estado', e.target.value)} className={inputCls}>
            <option value="">Todos los estados</option><option value="CONFIRMADA">Confirmadas</option><option value="ANULADA">Anuladas</option>
          </select>
          <select value={filtros.campamento_id} onChange={(e) => setF('campamento_id', e.target.value)} className={inputCls}>
            <option value="">Todos los campamentos</option>
            {(campamentosCatalog || []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <div className="flex gap-2 col-span-2 lg:col-span-1">
            <input type="date" aria-label="Desde" value={filtros.desde} onChange={(e) => setF('desde', e.target.value)} className={`${inputCls} w-full`} />
            <input type="date" aria-label="Hasta" value={filtros.hasta} onChange={(e) => setF('hasta', e.target.value)} className={`${inputCls} w-full`} />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-slate-600 font-bold uppercase tracking-wider">
              <th className="py-3 px-4">Acta / Fecha</th><th className="py-3 px-4">Colaborador</th><th className="py-3 px-4">Departamento</th>
              <th className="py-3 px-4">Supervisor</th><th className="py-3 px-4">Campamento</th><th className="py-3 px-4">Herramientas</th>
              <th className="py-3 px-4">Registró</th><th className="py-3 px-4">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan="8" className="py-12 text-center text-slate-400">Cargando actas…</td></tr>
            ) : data.actas.length === 0 ? (
              <tr><td colSpan="8" className="py-12 text-center text-slate-400">No hay actas que coincidan.</td></tr>
            ) : data.actas.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50/80">
                <td className="py-3 px-4 whitespace-nowrap">
                  <div className="font-mono font-bold text-slate-800">{a.numero_acta}</div>
                  <div className="text-[11px] text-slate-400">{new Date(a.fecha_entrega).toLocaleString('es-DO')}</div>
                  {a.estado === 'ANULADA' && <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300" title={a.motivo_anulacion}>ANULADA</span>}
                </td>
                <td className="py-3 px-4 font-semibold text-slate-800">{a.colaborador_nombre}</td>
                <td className="py-3 px-4">{a.departamento || '—'}</td>
                <td className="py-3 px-4">{a.supervisor_nombre}</td>
                <td className="py-3 px-4">{a.campamento_nombre}</td>
                <td className="py-3 px-4 max-w-xs">
                  {(a.items || []).map((it, i) => <div key={i} className="line-clamp-1">{Number(it.cantidad)} × {it.descripcion}{it.serie ? ` (S/N ${it.serie})` : ''}</div>)}
                </td>
                <td className="py-3 px-4 text-slate-500">{a.entregado_por_nombre}</td>
                <td className="py-3 px-4 whitespace-nowrap space-x-1">
                  <button type="button" onClick={() => abrir(a.id)} className="px-2 py-1 border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1"><Printer className="w-3.5 h-3.5" /> Ver / Reimprimir</button>
                  {canAnular && a.estado === 'CONFIRMADA' && (
                    <button type="button" onClick={() => { setAnulando(a); setMotivo(''); setErrorAnular(''); }} className="px-2 py-1 border border-rose-200 text-rose-700 rounded-lg hover:bg-rose-50 inline-flex items-center gap-1"><Ban className="w-3.5 h-3.5" /> Anular</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span>Página {pagina + 1} de {paginas}</span>
        <div className="space-x-2">
          <button type="button" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)} className="px-3 py-1 border border-slate-200 rounded-lg disabled:opacity-40">Anterior</button>
          <button type="button" disabled={pagina + 1 >= paginas} onClick={() => setPagina(pagina + 1)} className="px-3 py-1 border border-slate-200 rounded-lg disabled:opacity-40">Siguiente</button>
        </div>
      </div>

      {acta && <ActaImprimible acta={acta} onClose={() => { setActa(null); cargar(); }} />}

      {anulando && (
        <div role="dialog" aria-modal="true" aria-labelledby="modal-anular-title" className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form onSubmit={confirmarAnulacion} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3 text-xs">
            <h3 id="modal-anular-title" className="font-bold text-base text-slate-900">Anular acta {anulando.numero_acta}</h3>
            <p className="text-slate-600">La anulación es <strong>documental</strong>: no devuelve herramientas al stock. Las devoluciones físicas deben registrarse como operaciones separadas.</p>
            <textarea required minLength={10} maxLength={500} rows={3} placeholder="Motivo de la anulación (mínimo 10 caracteres)" value={motivo} onChange={(e) => setMotivo(e.target.value)} className={`${inputCls} w-full`} />
            {errorAnular && <div role="alert" className="text-rose-700 font-semibold">{errorAnular}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAnulando(null)} className="px-4 py-2 border border-slate-200 rounded-lg">Cancelar</button>
              <button type="submit" className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold">Anular acta</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
