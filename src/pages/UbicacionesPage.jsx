import React, { useState, useEffect } from 'react';
import { MapPin, Building, Package, User, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function UbicacionesPage() {
  const { kpis, fetchArticulos } = useApp();
  const [selectedUbicacion, setSelectedUbicacion] = useState('DISTRITO NACIONAL 27 DE FEBRERO');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const campamentosIndependientes = kpis?.porCampamento || [];
  const sinSedeVerificada = kpis?.sinSedeVerificada || null;
  const campamentosPendientes = kpis?.campamentosPendientesValidacion || [];
  const ubicacionesList = kpis?.ubicaciones || [];

  useEffect(() => {
    if (!selectedUbicacion && ubicacionesList.length > 0) {
      setSelectedUbicacion(ubicacionesList[0].ubicacion_nombre);
    }
  }, [ubicacionesList, selectedUbicacion]);

  useEffect(() => {
    if (!selectedUbicacion) return;
    setLoading(true);
    fetchArticulos({ ubicacion: selectedUbicacion, limit: 100 })
      .then(res => {
        if (res.success) setItems(res.articulos);
      })
      .finally(() => setLoading(false));
  }, [selectedUbicacion, fetchArticulos]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <MapPin className="w-5 h-5 text-[#F28524]" />
            <span>Sedes, Campamentos y Ubicaciones Operativas</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Distribución física del inventario de INGMELEC en campamentos centrales y zonas de mantenimiento en República Dominicana.
          </p>
        </div>
      </div>

      {/* Campamentos Independientes Confirmados + Sin Sede Verificada */}
      {campamentosIndependientes.length > 0 && (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Campamentos y Sedes Operativas Confirmadas ({campamentosIndependientes.length}) + Sin Sede Verificada
              </h2>
              <p className="text-xs text-slate-500">
                Conciliación exacta: 329 artículos en 3 sedes independientes confirmadas + 104 artículos en SIN SEDE VERIFICADA (KM 19 AUT DUARTE) = 433 bienes empresariales.
              </p>
            </div>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
              Total Conciliado: 433 bienes · 1,971 u. físicas
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {campamentosIndependientes.map((camp) => (
              <div
                key={camp.id}
                onClick={() => setSelectedUbicacion(camp.ubicacion_historica_equivalente || camp.nombre)}
                className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:border-[#F28524] transition-all cursor-pointer flex flex-col justify-between gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                      {camp.codigo || `SEDE-${camp.id}`}
                    </span>
                    <h3 className="font-bold text-sm text-slate-900 mt-1">{camp.nombre}</h3>
                    <div className="text-[10px] text-slate-500 font-mono">
                      Excel: {camp.ubicacion_historica_equivalente || camp.nombre}
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                    Confirmado
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/60 text-[11px] text-slate-600">
                  <div>
                    <span className="block text-[10px] text-slate-400">Almacenes</span>
                    <strong className="text-slate-800">{camp.cantidad_almacenes || 0}</strong>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">Artículos</span>
                    <strong className="text-blue-700">{camp.total_articulos || 0}</strong>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">Unid. Fís.</span>
                    <strong className="text-slate-800">
                      {Number(camp.total_fisico || 0).toLocaleString('es-DO')}
                    </strong>
                  </div>
                </div>
              </div>
            ))}

            {sinSedeVerificada && (
              <div
                onClick={() => setSelectedUbicacion('KM 19 AUT DUARTE')}
                className="p-4 rounded-xl border border-amber-300 bg-amber-50/60 hover:border-amber-500 transition-all cursor-pointer flex flex-col justify-between gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-200 text-amber-950">
                      PEND-SEDE
                    </span>
                    <h3 className="font-bold text-sm text-amber-950 mt-1">SIN SEDE VERIFICADA</h3>
                    <div className="text-[10px] text-amber-800 font-mono">
                      Excel: KM 19 AUT DUARTE
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap">
                    Por Clasificar
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-amber-200 text-[11px] text-amber-900">
                  <div>
                    <span className="block text-[10px] text-amber-700">INF / OFI</span>
                    <strong>61 / 43</strong>
                  </div>
                  <div>
                    <span className="block text-[10px] text-amber-700">Artículos</span>
                    <strong className="text-amber-950">{sinSedeVerificada.total_articulos}</strong>
                  </div>
                  <div>
                    <span className="block text-[10px] text-amber-700">Unid. Fís.</span>
                    <strong className="text-amber-950">
                      {Number(sinSedeVerificada.total_fisico || 0).toLocaleString('es-DO')}
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          {campamentosPendientes.length > 0 && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center justify-between">
              <div>
                <strong className="text-slate-800">Campamentos en catálogo pendientes de validación ({campamentosPendientes.length}):</strong>{' '}
                {campamentosPendientes.map(c => c.nombre).join(', ')} (sin registros en el Excel del 16-Oct-2026).
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-200 text-slate-700 rounded">
                PENDIENTE_VALIDACION
              </span>
            </div>
          )}
        </div>
      )}

      {/* Ubicaciones Cards (Ubicaciones Históricas en Inventario) */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 px-1">
          Ubicaciones Históricas Registradas en Inventario (Sin Reasignación Automática)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {ubicacionesList.map((ub, idx) => {
            const isSelected = selectedUbicacion === ub.ubicacion_nombre;
            return (
              <div
                key={idx}
                onClick={() => setSelectedUbicacion(ub.ubicacion_nombre)}
                className={`p-5 rounded-2xl border transition-all cursor-pointer shadow-sm ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-[#F28524]'
                    : 'bg-white text-slate-800 border-slate-200/80 hover:border-slate-300 hover:shadow'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-xl ${isSelected ? 'bg-[#F28524] text-white' : 'bg-slate-100 text-slate-700'}`}>
                    <Building className="w-4 h-4" />
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-800'
                  }`}>
                    {ub.count} bienes
                  </span>
                </div>
                <h3 className="font-bold text-sm tracking-tight line-clamp-2">
                  {ub.ubicacion_nombre}
                </h3>
                <p className={`text-[11px] mt-2 flex items-center ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                  <span>Consultar inventario</span>
                  <ArrowRight className="w-3 h-3 ml-1" />
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Inventory List in Selected Location */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-800">
              Inventario Activo en: <span className="text-[#F28524]">{selectedUbicacion}</span>
            </h3>
            <span className="text-xs text-slate-400">
              {items.length} activos listados
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-600 font-bold uppercase">
                <th className="py-3 px-4">Código</th>
                <th className="py-3 px-4">Área</th>
                <th className="py-3 px-4">Artículo</th>
                <th className="py-3 px-4">Marca / Serie</th>
                <th className="py-3 px-4 text-center">Cantidad</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4">Custodio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-400">
                    Cargando bienes de la sede...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-400">
                    No hay artículos registrados para esta ubicación.
                  </td>
                </tr>
              ) : (
                items.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {item.codigo_original || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        {item.area}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {item.articulo_nombre}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <div>{item.marca_modelo || 'Genérico'}</div>
                      {item.serie_imei && <div className="font-mono text-[10px] text-slate-400">S/N: {item.serie_imei}</div>}
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-slate-900">
                      {item.cantidad_num !== null ? item.cantidad_num : item.cantidad_texto} {item.unidad_medida}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.estado_fisico === 'Bueno' ? 'bg-emerald-50 text-emerald-700' :
                        item.estado_fisico === 'Regular' ? 'bg-amber-50 text-amber-700' :
                        item.estado_fisico === 'Dañado' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {item.estado_fisico}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {item.asignado_a || 'Sin asignar'}
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
