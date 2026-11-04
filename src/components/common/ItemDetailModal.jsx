import React, { useState, useEffect } from 'react';
import {
  X, Edit3, Save, CheckCircle2, AlertTriangle, Clock,
  MapPin, User, Tag, Hash, FileSpreadsheet, History,
  ShieldCheck, ArrowRightLeft, Camera
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export default function ItemDetailModal({ itemId, onClose, onUpdated }) {
  const { getArticuloById, updateArticulo, currentRole } = useApp();
  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState(null);
  const [history, setHistory] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('detalle'); // 'detalle' | 'origen' | 'movimientos'

  // Edit form state
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (!itemId) return;
    let isMounted = true;
    setLoading(true);

    getArticuloById(itemId)
      .then(res => {
        if (isMounted && res.success) {
          setItem(res.articulo);
          setHistory(res.historial_movimientos || []);
          setFormData({
            articulo_nombre: res.articulo.articulo_nombre || '',
            categoria: res.articulo.categoria || '',
            marca_modelo: res.articulo.marca_modelo || '',
            tipo_caracteristicas: res.articulo.tipo_caracteristicas || '',
            serie_imei: res.articulo.serie_imei || '',
            propietario: res.articulo.propietario || 'INGMELEC',
            asignado_a: res.articulo.asignado_a || '',
            cantidad_num: res.articulo.cantidad_num !== null ? res.articulo.cantidad_num : '',
            unidad_medida: res.articulo.unidad_medida || 'Unidad',
            estado_fisico: res.articulo.estado_fisico || 'Bueno',
            ubicacion_nombre: res.articulo.ubicacion_nombre || '',
            zona_estante: res.articulo.zona_estante || '',
            observaciones: res.articulo.observaciones || ''
          });
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [itemId, getArticuloById]);

  const canEdit = currentRole === 'admin' || currentRole === 'almacen' || currentRole === 'supervisor' || currentRole === 'developer';

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...formData,
        cantidad_num: formData.cantidad_num === '' ? null : Number(formData.cantidad_num)
      };
      const res = await updateArticulo(item.id, payload);
      if (res.success) {
        setIsEditing(false);
        // Refresh item data
        const refreshed = await getArticuloById(item.id);
        if (refreshed.success) {
          setItem(refreshed.articulo);
          setHistory(refreshed.historial_movimientos || []);
        }
        if (onUpdated) onUpdated();
      }
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Bueno':
        return <span className="px-3 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-xs font-semibold">Bueno (Operativo)</span>;
      case 'Regular':
        return <span className="px-3 py-1 bg-amber-100 text-amber-800 border border-amber-300 rounded-full text-xs font-semibold">Regular (Desgaste)</span>;
      case 'Dañado':
        return <span className="px-3 py-1 bg-rose-100 text-rose-800 border border-rose-300 rounded-full text-xs font-semibold">Dañado (Requiere Atención)</span>;
      case 'Fuera de servicio':
        return <span className="px-3 py-1 bg-red-100 text-red-900 border border-red-300 rounded-full text-xs font-semibold">Fuera de Servicio / Pérdida</span>;
      default:
        return <span className="px-3 py-1 bg-slate-100 text-slate-700 border border-slate-300 rounded-full text-xs font-semibold">Pendiente de Verificación</span>;
    }
  };

  if (!itemId) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">

        {/* Header */}
        <div className="bg-slate-900 text-white p-6 flex items-start justify-between relative">
          <div className="flex-1 pr-6">
            <div className="flex items-center space-x-3 mb-2">
              <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-[#F28524] text-white">
                {item?.codigo_original || 'SIN-CÓDIGO'}
              </span>
              <span className="text-xs uppercase tracking-wider text-slate-300 font-semibold">
                Área: {item?.area}
              </span>
              {item && getStatusBadge(item.estado_fisico)}
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              {item?.articulo_nombre || 'Cargando detalle...'}
            </h2>
            <p className="text-xs text-slate-400 mt-1 flex items-center space-x-4">
              <span className="flex items-center"><MapPin className="w-3.5 h-3.5 mr-1 text-[#F28524]" /> {item?.ubicacion_nombre}</span>
              {item?.zona_estante && <span className="text-slate-400 font-mono">Estante: {item.zona_estante}</span>}
              <span className="flex items-center"><User className="w-3.5 h-3.5 mr-1 text-slate-300" /> Custodio: {item?.asignado_a || 'Sin asignar'}</span>
            </p>
          </div>

          <div className="flex items-center space-x-2">
            {canEdit && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-[#F28524] text-white text-xs font-medium flex items-center space-x-1.5 transition-colors border border-slate-700 hover:border-[#F28524]"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Editar Bien</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 flex space-x-6 text-sm font-medium">
          <button
            onClick={() => setActiveTab('detalle')}
            className={`py-3 border-b-2 flex items-center space-x-2 transition-colors ${
              activeTab === 'detalle'
                ? 'border-[#F28524] text-[#F28524] font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Tag className="w-4 h-4" />
            <span>Ficha Técnica y Atributos</span>
          </button>
          <button
            onClick={() => setActiveTab('origen')}
            className={`py-3 border-b-2 flex items-center space-x-2 transition-colors ${
              activeTab === 'origen'
                ? 'border-[#F28524] text-[#F28524] font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Trazabilidad de Origen Excel</span>
          </button>
          <button
            onClick={() => setActiveTab('movimientos')}
            className={`py-3 border-b-2 flex items-center space-x-2 transition-colors ${
              activeTab === 'movimientos'
                ? 'border-[#F28524] text-[#F28524] font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Historial de Movimientos ({history.length})</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
              <div className="w-8 h-8 border-4 border-[#F28524] border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm">Consultando ficha en la base de datos MySQL...</p>
            </div>
          ) : isEditing ? (
            /* Edit Form */
            <form onSubmit={handleSave} className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-600" />
                <span>
                  Modificar la ubicación o el custodio registrará automáticamente una entrada en la bitácora de movimientos y auditoría.
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Descripción / Nombre del Bien</label>
                  <input
                    type="text"
                    required
                    value={formData.articulo_nombre}
                    onChange={e => setFormData({ ...formData, articulo_nombre: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Categoría</label>
                  <input
                    type="text"
                    value={formData.categoria}
                    onChange={e => setFormData({ ...formData, categoria: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Marca / Modelo</label>
                  <input
                    type="text"
                    value={formData.marca_modelo}
                    onChange={e => setFormData({ ...formData, marca_modelo: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Número de Serie o IMEI</label>
                  <input
                    type="text"
                    value={formData.serie_imei}
                    onChange={e => setFormData({ ...formData, serie_imei: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cantidad Física</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.cantidad_num}
                    onChange={e => setFormData({ ...formData, cantidad_num: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                    placeholder="Cantidad numérica verificada"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Unidad de Medida</label>
                  <select
                    value={formData.unidad_medida}
                    onChange={e => setFormData({ ...formData, unidad_medida: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                  >
                    <option value="Unidad">Unidad</option>
                    <option value="Rollo">Rollo</option>
                    <option value="Paquete">Paquete</option>
                    <option value="Juego">Juego</option>
                    <option value="Caja">Caja</option>
                    <option value="Metro">Metro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Estado Físico</label>
                  <select
                    value={formData.estado_fisico}
                    onChange={e => setFormData({ ...formData, estado_fisico: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none font-medium"
                  >
                    <option value="Bueno">Bueno</option>
                    <option value="Regular">Regular</option>
                    <option value="Dañado">Dañado</option>
                    <option value="Fuera de servicio">Fuera de servicio</option>
                    <option value="Pendiente de verificación">Pendiente de verificación</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Ubicación / Campamento</label>
                  <input
                    type="text"
                    required
                    value={formData.ubicacion_nombre}
                    onChange={e => setFormData({ ...formData, ubicacion_nombre: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Zona / Estante</label>
                  <input
                    type="text"
                    value={formData.zona_estante}
                    onChange={e => setFormData({ ...formData, zona_estante: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Custodio o Responsable Asignado</label>
                  <input
                    type="text"
                    value={formData.asignado_a}
                    onChange={e => setFormData({ ...formData, asignado_a: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Propietario Legal</label>
                  <input
                    type="text"
                    value={formData.propietario}
                    onChange={e => setFormData({ ...formData, propietario: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Observaciones / Notas de Levantamiento</label>
                <textarea
                  rows={3}
                  value={formData.observaciones}
                  onChange={e => setFormData({ ...formData, observaciones: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                  placeholder="Detalles sobre estado, componentes faltantes o justificación..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-[#F28524] hover:bg-[#d87019] text-white rounded-lg text-sm font-medium shadow-md transition-colors flex items-center space-x-2"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Guardando en MySQL...' : 'Guardar Cambios'}</span>
                </button>
              </div>
            </form>
          ) : activeTab === 'detalle' ? (
            /* Technical Specs Tab */
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="text-xs text-slate-400 uppercase font-semibold">Cantidad y Unidad</div>
                  <div className="text-2xl font-black text-slate-800 mt-1">
                    {item.cantidad_num !== null ? item.cantidad_num : item.cantidad_texto}
                    <span className="text-xs font-normal text-slate-500 ml-1.5">{item.unidad_medida}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {item.cantidad_verificada ? (
                      <span className="text-emerald-700 font-medium flex items-center">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Cantidad física verificada
                      </span>
                    ) : (
                      <span className="text-amber-700 font-medium flex items-center">
                        <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Pendiente de comprobación física
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="text-xs text-slate-400 uppercase font-semibold">Identificación Técnica</div>
                  <div className="text-sm font-bold text-slate-800 mt-1 truncate">
                    {item.marca_modelo || 'Sin marca/modelo'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 font-mono truncate">
                    Serial/IMEI: {item.serie_imei || 'No registrado'}
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="text-xs text-slate-400 uppercase font-semibold">Propietario vs Custodio</div>
                  <div className="text-xs text-slate-700 mt-1">
                    <span className="font-semibold text-slate-900">Propietario:</span> {item.propietario}
                  </div>
                  <div className="text-xs text-slate-700 mt-0.5">
                    <span className="font-semibold text-slate-900">Custodio:</span> {item.asignado_a || 'Sin asignar'}
                  </div>
                </div>
              </div>

              {/* Complete Observaciones */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center space-x-1.5">
                  <AlertTriangle className="w-4 h-4 text-[#F28524]" />
                  <span>Observaciones y Notas Originales del Levantamiento</span>
                </h4>
                {item.observaciones ? (
                  <p className="text-sm text-slate-800 whitespace-pre-line leading-relaxed bg-white p-3 rounded-lg border border-slate-200 font-mono">
                    "{item.observaciones}"
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 italic">No se registraron observaciones adicionales para este activo.</p>
                )}
              </div>

              {/* Additional Specs */}
              <div className="border border-slate-100 rounded-xl overflow-hidden text-xs">
                <table className="w-full">
                  <tbody>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <td className="py-2.5 px-4 font-semibold text-slate-500 w-1/3">Categoría</td>
                      <td className="py-2.5 px-4 font-medium text-slate-800">{item.categoria}</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="py-2.5 px-4 font-semibold text-slate-500">Características / Tipo</td>
                      <td className="py-2.5 px-4 text-slate-800">{item.tipo_caracteristicas || 'Estándar'}</td>
                    </tr>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <td className="py-2.5 px-4 font-semibold text-slate-500">Ubicación Actual</td>
                      <td className="py-2.5 px-4 font-medium text-slate-800">{item.ubicacion_nombre}</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="py-2.5 px-4 font-semibold text-slate-500">Zona / Estante</td>
                      <td className="py-2.5 px-4 text-slate-800">{item.zona_estante || 'No especificado'}</td>
                    </tr>
                    <tr className="bg-slate-50/50">
                      <td className="py-2.5 px-4 font-semibold text-slate-500">Fecha de Revisión</td>
                      <td className="py-2.5 px-4 text-slate-800">{item.fecha_revision ? new Date(item.fecha_revision).toLocaleDateString('es-DO') : '16/10/2026 (Levantamiento Inicial)'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === 'origen' ? (
            /* Excel Origin Tab */
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-900 leading-relaxed">
                <p className="font-bold mb-1 flex items-center">
                  <ShieldCheck className="w-4 h-4 mr-1.5 text-blue-600" />
                  Inmutabilidad y Trazabilidad de Origen
                </p>
                Este registro fue extraído íntegramente del archivo maestro
                <span className="font-mono font-semibold ml-1">Ingmelec_Levantamiento_Sencillo_2026-10-16.xlsx</span>.
                Se garantiza que cada valor de fila original se preserva para auditorías regulatorias y contables.
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-xs text-slate-400 block font-semibold">Hoja de Origen</span>
                  <span className="text-base font-bold text-slate-800 mt-1 block font-mono">{item.hoja_origen}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-xs text-slate-400 block font-semibold">Fila en Excel</span>
                  <span className="text-base font-bold text-slate-800 mt-1 block font-mono">#{item.fila_origen}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-xs text-slate-400 block font-semibold">Código Original</span>
                  <span className="text-base font-bold text-slate-800 mt-1 block font-mono">{item.codigo_original || '(Sin código)'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-xs text-slate-400 block font-semibold">ID Autoincremental</span>
                  <span className="text-base font-bold text-slate-800 mt-1 block font-mono">INV-{String(item.id).padStart(4, '0')}</span>
                </div>
              </div>
            </div>
          ) : (
            /* Movement History Tab */
            <div className="space-y-3">
              {history.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No se registran movimientos operacionales adicionales desde el alta inicial.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((mov) => (
                    <div key={mov.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-start space-x-3">
                      <div className="p-2 rounded-lg bg-white border border-slate-200 text-[#F28524] mt-0.5">
                        <ArrowRightLeft className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 uppercase tracking-wider">{mov.tipo_movimiento}</span>
                          <span className="text-slate-400">{new Date(mov.fecha_movimiento).toLocaleString('es-DO')}</span>
                        </div>
                        <div className="text-slate-600 mt-1">
                          Motivo: <span className="font-semibold text-slate-800">{mov.motivo}</span>
                        </div>
                        {mov.ubicacion_origen && mov.ubicacion_destino && (
                          <div className="text-slate-500 mt-0.5">
                            De: {mov.ubicacion_origen} → A: {mov.ubicacion_destino}
                          </div>
                        )}
                        {mov.observaciones && (
                          <div className="text-slate-500 italic mt-1 bg-white p-2 rounded border border-slate-100">
                            "{mov.observaciones}"
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500">
          <span>Última modificación: {item?.fecha_actualizacion ? new Date(item.fecha_actualizacion).toLocaleString('es-DO') : 'Sin registro'}</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium transition-colors"
          >
            Cerrar Ficha
          </button>
        </div>

      </div>
    </div>
  );
}
