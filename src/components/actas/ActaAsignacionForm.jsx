import React, { useState, useEffect, useMemo, useRef } from 'react';
import { UserCheck, Plus, Trash2, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import ActaImprimible from './ActaImprimible';
import AgotadoBadge from '../common/AgotadoBadge';
import { isAgotado } from '../../utils/stock';

const SERIE_PLACEHOLDERS = new Set(['N/A', 'S/N', 'S/S', 'SIN SERIAL', 'SIN SERIE', 'NO APLICA', 'NO TIENE', 'NONE', 'NULL', '--', '-']);
const tieneSerieReal = (s) => { const v = String(s ?? '').trim().toUpperCase(); return v !== '' && !SERIE_PLACEHOLDERS.has(v); };

// Validación de la cantidad a entregar (el backend repite estas reglas y es la autoridad final).
const esUnidadEntera = (i) => String(i.unidad ?? 'Unidad').trim().toLowerCase() === 'unidad';
function errorCantidad(i) {
  const raw = String(i.cantidad ?? '').trim();
  if (raw === '') return 'Indique la cantidad.';
  const n = Number(raw);
  if (!Number.isFinite(n)) return 'Cantidad no válida.';
  if (n <= 0) return 'Debe ser mayor que cero.';
  if (esUnidadEntera(i) && !Number.isInteger(n)) return 'Debe ser un número entero.';
  if (Number(n.toFixed(2)) !== n) return 'Máximo 2 decimales.';
  if (n > i.stock) return `No puede superar el stock (${i.stock}).`;
  return null;
}

const inputCls ='w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none';

export default function ActaAsignacionForm({ onClose, onCreated }) {
  const { currentUser, activeCampamento, fetchArticulos, fetchCustodios, fetchActaOpciones, crearActaEntrega, fetchActaById } = useApp();
  const requestUuid = useRef(crypto.randomUUID());
  const [campamentoId, setCampamentoId] = useState('');
  // Opciones según el alcance del usuario: sedes permitidas y departamentos ya registrados (sin escritura libre)
  const [opciones, setOpciones] = useState({ campamentos: [], campamento_bloqueado: false, departamentos: [], departamento_sugerido: null, colaboradores: [] });
  const [cargandoOpciones, setCargandoOpciones] = useState(true);
  const [colaborador, setColaborador] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [items, setItems] = useState([]);
  const [custodios, setCustodios] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actaCreada, setActaCreada] = useState(null);

  useEffect(() => {
    let activo = true;
    fetchActaOpciones().then((r) => {
      if (!activo || !r?.success) return;
      setOpciones(r);
      const permitidas = r.campamentos || [];
      if (permitidas.length === 1) setCampamentoId(String(permitidas[0].id));
      else if (activeCampamento?.id && permitidas.some((c) => String(c.id) === String(activeCampamento.id))) setCampamentoId(String(activeCampamento.id));
      if (r.departamento_sugerido) setDepartamento(r.departamento_sugerido);
    }).catch(() => {}).finally(() => { if (activo) setCargandoOpciones(false); });
    return () => { activo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchActaOpciones]);

  useEffect(() => {
    fetchCustodios().then((r) => {
      const lista = r?.custodios || r?.data || [];
      setCustodios(Array.isArray(lista) ? lista : []);
    }).catch(() => setCustodios([]));
  }, [fetchCustodios]);

  useEffect(() => {
    if (!campamentoId) { setResultados([]); return undefined; }
    const t = setTimeout(async () => {
      const r = await fetchArticulos({ limit: 30, campamento_id: campamentoId, search: busqueda.trim() });
      // Los agotados siguen visibles (con etiqueta) pero no se pueden agregar al acta.
      setResultados(r?.success ? r.articulos.filter((a) => a.cantidad_num !== null && a.cantidad_num !== undefined) : []);
    }, 250);
    return () => clearTimeout(t);
  }, [busqueda, campamentoId, fetchArticulos]);

  const nombresCustodios = useMemo(() => [...new Set(custodios.map((c) => c.nombre).filter(Boolean))], [custodios]);

  const onColaborador = (v) => {
    setColaborador(v);
    const c = opciones.colaboradores.find((x) => x.nombre === v);
    if (c?.departamento && !departamento) setDepartamento(c.departamento);
  };

  const agregar = (a) => {
    if (items.some((i) => i.articulo_id === a.id)) return;
    setItems([...items, {
      articulo_id: a.id, codigo: a.codigo_original, descripcion: a.articulo_nombre,
      serie: tieneSerieReal(a.serie_imei) ? String(a.serie_imei).trim() : null,
      unidad: a.unidad_medida || 'Unidad', stock: Number(a.cantidad_num), cantidad: 1
    }]);
  };

  const setCantidad = (id, v) => setItems((prev) => prev.map((i) => (i.articulo_id === id ? { ...i, cantidad: v } : i)));

  const hayCantidadInvalida = items.some((i) => errorCantidad(i));

  const confirmar = async (e) => {
    e.preventDefault();
    setError('');
    if (items.length === 0) { setError('Agregue al menos una herramienta.'); return; }
    if (hayCantidadInvalida) { setError('Corrija las cantidades marcadas en rojo antes de confirmar.'); return; }
    setSubmitting(true);
    try {
      const res = await crearActaEntrega({
        request_uuid: requestUuid.current,
        campamento_id: Number(campamentoId),
        colaborador_nombre: colaborador, departamento: departamento || null, supervisor_nombre: supervisor,
        motivo, observaciones: observaciones || null,
        items: items.map((i) => ({ articulo_id: i.articulo_id, cantidad: Number(i.cantidad), unidad: i.unidad }))
      });
      if (!res.success) { setError(res.message || 'No se pudo registrar el acta.'); return; }
      const det = await fetchActaById(res.id);
      onCreated?.();
      setActaCreada(det.acta);
    } catch (err) {
      setError(err.message || 'Error de conexión.');
    } finally {
      setSubmitting(false);
    }
  };

  if (actaCreada) return <ActaImprimible acta={actaCreada} onClose={onClose} />;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="modal-acta-title" className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto border border-slate-200">
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <h3 id="modal-acta-title" className="font-bold text-base flex items-center space-x-2">
            <UserCheck className="w-5 h-5 text-[#F28524]" />
            <span>Acta de Entrega de Herramientas</span>
          </h3>
          <button type="button" onClick={onClose} aria-label="Cerrar formulario de acta" className="text-slate-300 hover:text-white p-1 rounded-lg">✕</button>
        </div>

        <form onSubmit={confirmar} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Campamento *</label>
              <select required value={campamentoId} disabled={opciones.campamento_bloqueado || cargandoOpciones} onChange={(e) => { setCampamentoId(e.target.value); setItems([]); }} className={`${inputCls} ${opciones.campamento_bloqueado ? 'bg-slate-50 text-slate-600' : ''}`}>
                <option value="">{cargandoOpciones ? 'Cargando…' : '-- Seleccione --'}</option>
                {opciones.campamentos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              {opciones.campamento_bloqueado && <p className="text-[10px] text-slate-400 mt-1">Sede asignada a su usuario.</p>}
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Usuario que entrega</label>
              <input readOnly value={currentUser?.nombre || ''} className={`${inputCls} bg-slate-50 text-slate-500`} />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nombre del colaborador *</label>
              <input required list="acta-custodios" maxLength={150} value={colaborador} onChange={(e) => onColaborador(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Departamento</label>
              <select value={departamento} onChange={(e) => setDepartamento(e.target.value)} className={inputCls}>
                <option value="">-- Sin departamento --</option>
                {opciones.departamentos.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Supervisor o coordinador responsable *</label>
              <input required list="acta-custodios" maxLength={150} value={supervisor} onChange={(e) => setSupervisor(e.target.value)} className={inputCls} />
            </div>
            <datalist id="acta-custodios">{nombresCustodios.map((n) => <option key={n} value={n} />)}</datalist>
          </div>

          <div className="border border-slate-200 rounded-xl p-3 space-y-2">
            <label className="block font-semibold text-slate-700">Herramientas del inventario *</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input type="text" placeholder={campamentoId ? 'Buscar por nombre, código o serie…' : 'Seleccione primero un campamento'} disabled={!campamentoId}
                value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className={`${inputCls} pl-8`} />
            </div>
            {campamentoId && resultados.length > 0 && (
              <ul className="max-h-36 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
                {resultados.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => agregar(a)} disabled={isAgotado(a) || items.some((i) => i.articulo_id === a.id)}
                      className="w-full text-left px-3 py-1.5 hover:bg-orange-50 disabled:opacity-40 flex items-center justify-between gap-2">
                      <span><span className="font-mono text-slate-400">[{a.codigo_original || 'S/C'}]</span> {a.articulo_nombre}{tieneSerieReal(a.serie_imei) ? ` · S/N ${a.serie_imei}` : ''}</span>
                      <span className="text-slate-500 whitespace-nowrap">
                        <AgotadoBadge articulo={a} className="mr-2" />
                        Stock: {Number(a.cantidad_num)} {!isAgotado(a) && <Plus className="inline w-3 h-3 text-[#F28524]" />}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {items.length > 0 && (
              <table className="w-full text-left">
                <thead><tr className="text-slate-500 uppercase text-[10px]"><th className="py-1">Herramienta</th><th>Serie</th><th className="w-24">Cantidad</th><th /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((i) => (
                    <tr key={i.articulo_id}>
                      <td className="py-1.5 pr-2"><span className="font-mono text-slate-400">[{i.codigo || 'S/C'}]</span> {i.descripcion}</td>
                      <td className="pr-2 font-mono">{i.serie || '—'}</td>
                      <td>
                        {(() => {
                          const err = errorCantidad(i);
                          const restante = err ? null : Number((i.stock - Number(i.cantidad)).toFixed(2));
                          return (
                            <>
                              <input type="number" inputMode={esUnidadEntera(i) ? 'numeric' : 'decimal'} min={esUnidadEntera(i) ? 1 : 0.01} step={esUnidadEntera(i) ? 1 : 'any'} max={i.stock}
                                aria-label={`Cantidad a entregar de ${i.descripcion}`} aria-invalid={Boolean(err)}
                                value={i.cantidad} onChange={(e) => setCantidad(i.articulo_id, e.target.value)}
                                className={`${inputCls} py-1 ${err ? 'border-rose-400 focus:ring-rose-400' : ''}`} />
                              <span className="block text-[10px] text-slate-400 whitespace-nowrap">Stock: {i.stock} · Quedará: {restante === null ? '—' : restante}</span>
                              {err && <span role="alert" className="block text-[10px] font-semibold text-rose-700">{err}</span>}
                              {i.serie && (i.stock > 1
                                ? <span className="block text-[10px] text-amber-700">Varias unidades comparten el N.º de serie</span>
                                : <span className="block text-[10px] text-slate-400">Artículo con serie: 1 unidad</span>)}
                            </>
                          );
                        })()}
                      </td>
                      <td><button type="button" aria-label="Quitar herramienta" onClick={() => setItems(items.filter((x) => x.articulo_id !== i.articulo_id))} className="text-rose-500 p-1"><Trash2 className="w-4 h-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Motivo de la entrega *</label>
            <input required minLength={5} maxLength={255} placeholder="Ej. Herramientas para trabajos de mantenimiento en obra…" value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Observaciones</label>
            <textarea rows={2} maxLength={2000} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className={inputCls} />
          </div>

          <p className="text-[11px] text-slate-500">Al confirmar se descontarán las cantidades del stock (movimientos SALIDA), se generará el número de acta y podrá imprimirla con tres firmas.</p>
          {error && <div role="alert" className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-semibold">{error}</div>}

          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50">Cancelar</button>
            <button type="submit" disabled={submitting || hayCantidadInvalida} className="px-5 py-2 bg-[#F28524] hover:bg-[#d87019] text-white rounded-lg font-bold shadow disabled:opacity-60">
              {submitting ? 'Registrando acta…' : 'Confirmar y generar acta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

