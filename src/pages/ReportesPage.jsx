import React, { useState, useEffect } from 'react';
import {
  BarChart3, Download, FileSpreadsheet, Printer,
  CheckCircle2, AlertTriangle, Layers, MapPin, User, ArrowRight
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function ReportesPage() {
  const { fetchReporteConsolidado } = useApp();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [selectedCampamento, setSelectedCampamento] = useState('TODOS');

  useEffect(() => {
    setLoading(true);
    fetchReporteConsolidado(selectedCampamento !== 'TODOS' ? { campamento_id: selectedCampamento } : {})
      .then(res => {
        if (res.success) {
          setData(res.reporte);
        }
      })
      .finally(() => setLoading(false));
  }, [fetchReporteConsolidado, selectedCampamento]);

  const handleExportFullCsv = async () => {
    try {
      const q = selectedCampamento !== 'TODOS' ? `?campamento_id=${encodeURIComponent(selectedCampamento)}` : '';
      const res = await fetch(`/api/v2/reportes/exportar${q}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('ingmelec_token')}` }
      });
      const json = await res.json();
      if (!json.success || !json.data) return;

      const headers = [
        'ID', 'Código', 'Campamento / Sede Verificada', 'Área', 'Categoría', 'Artículo', 'Marca/Modelo',
        'Serie/IMEI', 'Cantidad', 'Unidad', 'Estado', 'Ubicación Excel', 'Zona/Estante',
        'Propietario', 'Custodio', 'Observaciones', 'Hoja Origen', 'Fila Origen'
      ];

      const rows = json.data.map(a => [
        a.id,
        `"${a.codigo_original || ''}"`,
        `"${a.campamento_nombre || 'SIN SEDE VERIFICADA (PENDIENTE DE CLASIFICACIÓN)'}"`,
        `"${a.area || ''}"`,
        `"${a.categoria || ''}"`,
        `"${(a.articulo_nombre || '').replace(/"/g, '""')}"`,
        `"${(a.marca_modelo || '').replace(/"/g, '""')}"`,
        `"${a.serie_imei || ''}"`,
        a.cantidad_num !== null ? a.cantidad_num : `"${a.cantidad_texto || 'PENDIENTE DE VERIFICACIÓN'}"`,
        `"${a.unidad_medida || 'Unidad'}"`,
        `"${a.estado_fisico || ''}"`,
        `"${a.ubicacion_nombre || ''}"`,
        `"${a.zona_estante || ''}"`,
        `"${a.propietario || ''}"`,
        `"${a.asignado_a || ''}"`,
        `"${(a.observaciones || '').replace(/"/g, '""')}"`,
        `"${a.hoja_origen || ''}"`,
        a.fila_origen
      ]);

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `reporte_maestro_ingmelec_${selectedCampamento}_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-[#F28524]" />
            <span>Centro de Reportes y Auditoría de Gestión</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Consolidado gerencial calculado directamente desde MySQL sobre los {data?.totales?.totalArticulos ?? 433} activos empresariales ({Number(data?.totales?.totalUnidades ?? 1971).toLocaleString('es-DO')} unidades físicas conocidas + {data?.totales?.totalSinCantidad ?? 23} con cantidad pendiente).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedCampamento}
            onChange={(e) => setSelectedCampamento(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#F28524]"
          >
            <option value="TODOS">Todos los Campamentos (433)</option>
            <option value="3">ALMACÉN 27 DE FEBRERO (84)</option>
            <option value="12">OPL (136)</option>
            <option value="13">MANTENIMIENTO 633 (109)</option>
            <option value="SIN_SEDE">SIN SEDE VERIFICADA · KM 19 (104)</option>
          </select>

          <button
            onClick={handlePrint}
            className="px-3.5 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir / PDF</span>
          </button>

          <button
            onClick={handleExportFullCsv}
            className="px-4 py-2 bg-[#F28524] hover:bg-[#d87019] text-white rounded-xl text-xs font-bold shadow-md shadow-[#F28524]/20 flex items-center space-x-1.5 transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Exportar Todo a CSV</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-16 text-center text-slate-400">
          <div className="w-8 h-8 border-4 border-[#F28524] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <span>Generando agregados de base de datos...</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Table: Consolidado por Área y Estado */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-800 flex items-center space-x-2">
                <Layers className="w-4 h-4 text-[#F28524]" />
                <span>Matriz de Activos: Área Operativa vs Estado Físico</span>
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-600 font-bold uppercase">
                    <th className="py-3 px-4">Área Operativa</th>
                    <th className="py-3 px-4">Estado Físico</th>
                    <th className="py-3 px-4 text-center">Total Registros</th>
                    <th className="py-3 px-4 text-center">Unidades Físicas Sumadas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data?.areaEstado?.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-4 font-bold text-slate-800">{row.area}</td>
                      <td className="py-2.5 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          row.estado_fisico === 'Bueno' ? 'bg-emerald-50 text-emerald-700' :
                          row.estado_fisico === 'Regular' ? 'bg-amber-50 text-amber-700' :
                          row.estado_fisico === 'Dañado' ? 'bg-rose-50 text-rose-700' :
                          row.estado_fisico === 'Fuera de servicio' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {row.estado_fisico}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center font-bold text-slate-900">{row.registros}</td>
                      <td className="py-2.5 px-4 text-center font-mono text-slate-700">{row.total_unidades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Custodians */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <h3 className="font-bold text-sm text-slate-800 flex items-center space-x-2">
                  <User className="w-4 h-4 text-[#F28524]" />
                  <span>Distribución por Responsable / Custodio</span>
                </h3>
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                {data?.porCustodio?.map((c, i) => (
                  <div key={i} className="py-2.5 px-4 flex items-center justify-between hover:bg-slate-50">
                    <span className="font-medium text-slate-800">{c.custodio}</span>
                    <span className="font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md text-[11px]">
                      {c.articulos} bienes
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Distribution by Location & Area */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <h3 className="font-bold text-sm text-slate-800 flex items-center space-x-2">
                  <MapPin className="w-4 h-4 text-[#F28524]" />
                  <span>Distribución por Ubicación y Área</span>
                </h3>
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                {data?.porUbicacion?.map((u, i) => (
                  <div key={i} className="py-2.5 px-4 flex items-center justify-between hover:bg-slate-50">
                    <div className="truncate pr-2">
                      <div className="font-medium text-slate-800">{u.ubicacion_nombre}</div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase">{u.area}</div>
                    </div>
                    <span className="font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md text-[11px] whitespace-nowrap">
                      {u.registros} registros
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
