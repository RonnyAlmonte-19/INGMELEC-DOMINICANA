import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowRightLeft, ArrowDownRight, ArrowUpRight, UserCheck,
  RotateCcw, Sliders, Plus, History, CheckCircle2, AlertTriangle,
  Search, Calendar, User, MapPin
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function MovimientosPage() {
  const { fetchMovimientos, registrarMovimiento, fetchArticulos, currentRole } = useApp();
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [articulosList, setArticulosList] = useState([]);
  const [formData, setFormData] = useState({
    articulo_id: '',
    tipo_movimiento: 'TRASLADO',
    cantidad: 1,
    ubicacion_destino: 'KM 19 AUT DUARTE',
    custodio_destino: '',
    estado_nuevo: 'Bueno',
    motivo: '',
    observaciones: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const loadMovimientos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchMovimientos(150);
      if (res.success) {
        setMovimientos(res.movimientos);
      }
    } finally {
      setLoading(false);
    }
  }, [fetchMovimientos]);

  useEffect(() => {
    loadMovimientos();
  }, [loadMovimientos]);

  const openModal = async () => {
    setShowModal(true);
    // Fetch active items for selector
    const res = await fetchArticulos({ limit: 500 });
    if (res.success) {
      setArticulosList(res.articulos);
      if (res.articulos.length > 0 && !formData.articulo_id) {
        setFormData(f => ({ ...f, articulo_id: res.articulos[0].id }));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.articulo_id || !formData.motivo) return;
    setSubmitting(true);
    try {
      const res = await registrarMovimiento({
        ...formData,
        cantidad: Number(formData.cantidad)
      });
      if (res.success) {
        setShowModal(false);
        setFormData({
          articulo_id: '',
          tipo_movimiento: 'TRASLADO',
          cantidad: 1,
          ubicacion_destino: 'KM 19 AUT DUARTE',
          custodio_destino: '',
          estado_nuevo: 'Bueno',
          motivo: '',
          observaciones: ''
        });
        loadMovimientos();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getTipoBadge = (tipo) => {
    switch (tipo) {
      case 'ENTRADA':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"><ArrowDownRight className="w-3 h-3 mr-1" /> Entrada</span>;
      case 'SALIDA':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300"><ArrowUpRight className="w-3 h-3 mr-1" /> Salida</span>;
      case 'TRASLADO':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300"><ArrowRightLeft className="w-3 h-3 mr-1" /> Traslado</span>;
      case 'ASIGNACION':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-300"><UserCheck className="w-3 h-3 mr-1" /> Asignación</span>;
      case 'DEVOLUCION':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300"><RotateCcw className="w-3 h-3 mr-1" /> Devolución</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300"><Sliders className="w-3 h-3 mr-1" /> Ajuste</span>;
    }
  };

  const canMove = currentRole === 'admin' || currentRole === 'almacen' || currentRole === 'supervisor' || currentRole === 'developer';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <ArrowRightLeft className="w-5 h-5 text-[#F28524]" />
            <span>Control Transaccional de Movimientos</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Registro inmutable de entradas, salidas, traslados entre sedes, asignaciones a personal técnico y ajustes de inventario.
          </p>
        </div>

        {canMove && (
          <button
            onClick={openModal}
            className="px-4 py-2.5 bg-[#F28524] hover:bg-[#d87019] text-white rounded-xl text-xs font-bold shadow-md shadow-[#F28524]/20 flex items-center space-x-2 transition-all self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Registrar Movimiento</span>
          </button>
        )}
      </div>

      {/* Movements Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-800">
            Bitácora de Operaciones ({movimientos.length})
          </h3>
          <span className="text-xs text-slate-400">Orden cronológico descendente</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-600 font-bold uppercase tracking-wider">
                <th className="py-3 px-4">Fecha / Hora</th>
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4">Artículo Afectado</th>
                <th className="py-3 px-4 text-center">Cant.</th>
                <th className="py-3 px-4">Origen → Destino</th>
                <th className="py-3 px-4">Custodio</th>
                <th className="py-3 px-4">Motivo / Observación</th>
                <th className="py-3 px-4">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="8" className="py-16 text-center text-slate-400">
                    Cargando historial de movimientos desde MySQL...
                  </td>
                </tr>
              ) : movimientos.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-16 text-center text-slate-400">
                    <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="font-medium text-slate-600">No hay movimientos registrados aún.</p>
                  </td>
                </tr>
              ) : (
                movimientos.map(mov => (
                  <tr key={mov.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap font-mono text-[11px]">
                      {new Date(mov.fecha_movimiento).toLocaleString('es-DO')}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {getTipoBadge(mov.tipo_movimiento)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-800 line-clamp-1">{mov.articulo_nombre}</div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {mov.codigo_original || 'S/C'} · Área: {mov.area}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-slate-900 whitespace-nowrap">
                      {mov.cantidad} {mov.unidad_medida}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-slate-700 font-medium">
                        {mov.ubicacion_origen ? `${mov.ubicacion_origen} →` : 'Recepción →'}
                      </div>
                      <div className="text-[#F28524] font-semibold">
                        {mov.ubicacion_destino || 'Almacén'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {mov.custodio_destino || mov.custodio_origen || 'Sin custodio'}
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      <div className="font-semibold text-slate-800">{mov.motivo}</div>
                      {mov.observaciones && (
                        <div className="text-slate-500 italic text-[11px] line-clamp-1">"{mov.observaciones}"</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                      {mov.usuario_nombre || 'Sistema'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Movement Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center space-x-2">
                <ArrowRightLeft className="w-5 h-5 text-[#F28524]" />
                <span>Registrar Transacción de Almacén</span>
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tipo de Operación *</label>
                <div className="grid grid-cols-3 gap-2">
                  {['TRASLADO', 'ASIGNACION', 'SALIDA', 'ENTRADA', 'DEVOLUCION', 'AJUSTE'].map(tipo => (
                    <button
                      type="button"
                      key={tipo}
                      onClick={() => setFormData({ ...formData, tipo_movimiento: tipo })}
                      className={`py-2 px-3 rounded-lg border font-bold text-center transition-all ${
                        formData.tipo_movimiento === tipo
                          ? 'bg-[#F28524] text-white border-[#F28524] shadow'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {tipo}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Seleccionar Artículo del Inventario *</label>
                <select
                  required
                  value={formData.articulo_id}
                  onChange={e => setFormData({ ...formData, articulo_id: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                >
                  <option value="">-- Seleccione un artículo --</option>
                  {articulosList.map(a => (
                    <option key={a.id} value={a.id}>
                      [{a.codigo_original || 'S/C'}] {a.articulo_nombre} ({a.area} · Stock: {a.cantidad_num ?? a.cantidad_texto} {a.unidad_medida})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cantidad a Mover</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={formData.cantidad}
                    onChange={e => setFormData({ ...formData, cantidad: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ubicación Destino</label>
                  <input
                    type="text"
                    value={formData.ubicacion_destino}
                    onChange={e => setFormData({ ...formData, ubicacion_destino: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nuevo Custodio / Responsable</label>
                  <input
                    type="text"
                    placeholder="Nombre del técnico o responsable..."
                    value={formData.custodio_destino}
                    onChange={e => setFormData({ ...formData, custodio_destino: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nuevo Estado Físico</label>
                  <select
                    value={formData.estado_nuevo}
                    onChange={e => setFormData({ ...formData, estado_nuevo: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                  >
                    <option value="Bueno">Bueno</option>
                    <option value="Regular">Regular</option>
                    <option value="Dañado">Dañado</option>
                    <option value="Fuera de servicio">Fuera de servicio</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Motivo del Movimiento *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Despacho a brigada Noroeste, Reparación técnica, Devolución de obra..."
                  value={formData.motivo}
                  onChange={e => setFormData({ ...formData, motivo: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observaciones</label>
                <textarea
                  rows={2}
                  placeholder="Detalles adicionales..."
                  value={formData.observaciones}
                  onChange={e => setFormData({ ...formData, observaciones: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-[#F28524] hover:bg-[#d87019] text-white rounded-lg font-bold shadow"
                >
                  {submitting ? 'Registrando en MySQL...' : 'Confirmar Transacción'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
