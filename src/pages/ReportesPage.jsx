import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3, Download, Printer,
  Layers, MapPin, User, FileSpreadsheet, AlertTriangle
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { toSafeDisplayString } from '../utils/jsonFormat';
import { userHasPermission } from '../utils/permissions';
import {
  downloadCsvFile,
  downloadXlsxWorkbook,
  INVENTARIO_EXPORT_HEADERS,
  INVENTARIO_EXPORT_WIDTHS,
  mapArticulosToExportRows
} from '../utils/exportUtils';

export default function ReportesPage() {
  const { fetchReporteConsolidado, campamentosCatalog, kpis, activeCampamento, currentUser, showToast } = useApp();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [reportError, setReportError] = useState('');
  const [data, setData] = useState(null);
  const activeCampIdStr = activeCampamento?.id ? String(activeCampamento.id) : 'TODOS';
  const [selectedCampamento, setSelectedCampamento] = useState(activeCampIdStr);

  useEffect(() => {
    setSelectedCampamento(activeCampIdStr);
  }, [activeCampIdStr]);

  const canPrintReport = userHasPermission(currentUser, 'rep:imprimir');
  const canExportReport = userHasPermission(currentUser, 'rep:exportar');

  const campamentoOptions = useMemo(() => {
    const kpiPorCamp = Array.isArray(kpis?.porCampamento) ? kpis.porCampamento : [];
    const kpiById = new Map(kpiPorCamp.map(c => [String(c.id), c]));
    const catalogList = Array.isArray(campamentosCatalog)
      ? campamentosCatalog.filter(c => !c?.es_sintetico && c?.activo !== 0)
      : [];

    const sourceList = catalogList.length > 0 ? catalogList : kpiPorCamp;
    return sourceList.map(c => {
      const idStr = String(c.id);
      const kpiMatch = kpiById.get(idStr);
      const rawCount = c.total_articulos ?? kpiMatch?.total_articulos;
      const count = typeof rawCount === 'number'
        ? rawCount
        : (rawCount !== undefined && rawCount !== null ? Number(rawCount) : null);
      return {
        id: idStr,
        nombre: toSafeDisplayString(c.nombre || kpiMatch?.nombre, `Sede #${idStr}`),
        count: Number.isFinite(count) ? count : null
      };
    });
  }, [campamentosCatalog, kpis]);

  useEffect(() => {
    setLoading(true);
    setReportError('');
    fetchReporteConsolidado(selectedCampamento !== 'TODOS' ? { campamento_id: selectedCampamento } : {})
      .then(res => {
        if (res?.success) {
          setData(res.reporte);
        } else {
          setReportError(res?.message || 'No se pudo generar el reporte consolidado.');
        }
      })
      .catch(() => {
        setReportError('Error de conexión al consultar reportes consolidados.');
      })
      .finally(() => setLoading(false));
  }, [fetchReporteConsolidado, selectedCampamento]);

  const handleExportFull = async (format = 'csv') => {
    try {
      setExporting(true);
      setReportError('');
      const q = selectedCampamento !== 'TODOS' ? `?campamento_id=${encodeURIComponent(selectedCampamento)}` : '';
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('ingmelec_token') : null;
      const res = await fetch(`/api/v2/reportes/exportar${q}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const json = await res.json();
      if (!res.ok || !json?.success || !Array.isArray(json.data)) {
        const msg = json?.message || 'Error exportando el inventario desde el servidor.';
        setReportError(msg);
        if (showToast) showToast(msg, 'error');
        return;
      }

      const rows = mapArticulosToExportRows(json.data);
      const baseFilename = `reporte_maestro_ingmelec_${selectedCampamento}_${new Date().toISOString().slice(0, 10)}`;

      if (format === 'xlsx') {
        await downloadXlsxWorkbook(`${baseFilename}.xlsx`, [
          {
            sheetName: 'Reporte Maestro',
            headers: INVENTARIO_EXPORT_HEADERS,
            rows,
            columnWidths: INVENTARIO_EXPORT_WIDTHS
          }
        ]);
      } else {
        downloadCsvFile(`${baseFilename}.csv`, INVENTARIO_EXPORT_HEADERS, rows);
      }

      if (showToast) {
        showToast(`Reporte ${format.toUpperCase()} descargado (${json.data.length} activos).`, 'success');
      }
    } catch (err) {
      console.error('Export error:', err);
      const msg = 'No se pudo completar la descarga del reporte.';
      setReportError(msg);
      if (showToast) showToast(msg, 'error');
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const totalArticulos = Number(data?.totales?.totalArticulos ?? 0);
  const totalUnidades = Number(data?.totales?.totalUnidades ?? 0).toLocaleString('es-DO');
  const totalSinCantidad = Number(data?.totales?.totalSinCantidad ?? 0);

  return (
    <div className="space-y-6 print-container">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-[#F28524]" />
            <span>Centro de Reportes y Auditoría de Gestión</span>
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Consolidado gerencial calculado directamente desde MySQL sobre {totalArticulos} activos empresariales ({totalUnidades} unidades físicas conocidas + {totalSinCantidad} con cantidad pendiente).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <select
            aria-label="Filtrar reporte por campamento o sede"
            value={selectedCampamento}
            onChange={(e) => setSelectedCampamento(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#F28524]"
          >
            <option value="TODOS">
              {typeof kpis?.totalArticulos === 'number'
                ? `Todos los Campamentos (${kpis.totalArticulos})`
                : 'Todos los Campamentos'}
            </option>
            {campamentoOptions.map(opt => (
              <option key={opt.id} value={opt.id}>
                {opt.count !== null ? `${opt.nombre} (${opt.count})` : opt.nombre}
              </option>
            ))}
            {selectedCampamento !== 'TODOS' &&
              selectedCampamento !== 'SIN_SEDE' &&
              !campamentoOptions.some(opt => opt.id === selectedCampamento) && (
                <option value={selectedCampamento}>
                  {toSafeDisplayString(activeCampamento?.nombre, `Sede #${selectedCampamento}`)}
                </option>
              )}
            {(kpis?.sinSedeVerificada || selectedCampamento === 'SIN_SEDE') && (
              <option value="SIN_SEDE">
                {toSafeDisplayString(kpis?.sinSedeVerificada?.nombre, 'SIN SEDE VERIFICADA')}
                {kpis?.sinSedeVerificada?.ubicacion_historica
                  ? ` · ${toSafeDisplayString(kpis.sinSedeVerificada.ubicacion_historica, '')}`
                  : ''}
                {typeof kpis?.sinSedeVerificada?.total_articulos === 'number'
                  ? ` (${kpis.sinSedeVerificada.total_articulos})`
                  : ''}
              </option>
            )}
          </select>

          {canPrintReport && (
            <button
              onClick={handlePrint}
              className="px-3.5 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / PDF</span>
            </button>
          )}

          {canExportReport && (
            <>
              <button
                type="button"
                onClick={() => handleExportFull('xlsx')}
                disabled={exporting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center space-x-1.5 transition-all"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>{exporting ? 'Exportando...' : 'Exportar Excel (.xlsx)'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportFull('csv')}
                disabled={exporting}
                className="px-4 py-2 bg-[#F28524] hover:bg-[#d87019] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-[#F28524]/20 flex items-center space-x-1.5 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Exportar Todo a CSV</span>
              </button>
            </>
          )}
        </div>
      </div>

      {reportError && (
        <div
          role="alert"
          className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-2 text-xs text-rose-800 font-semibold"
        >
          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>{reportError}</span>
        </div>
      )}

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
                      <td className="py-2.5 px-4 font-bold text-slate-800">{toSafeDisplayString(row.area, '—')}</td>
                      <td className="py-2.5 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          row.estado_fisico === 'Bueno' ? 'bg-emerald-50 text-emerald-700' :
                          row.estado_fisico === 'Regular' ? 'bg-amber-50 text-amber-700' :
                          row.estado_fisico === 'Dañado' ? 'bg-rose-50 text-rose-700' :
                          row.estado_fisico === 'Fuera de servicio' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {toSafeDisplayString(row.estado_fisico, 'Pendiente')}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center font-bold text-slate-900">{Number(row.registros || 0)}</td>
                      <td className="py-2.5 px-4 text-center font-mono text-slate-700">{Number(row.total_unidades || 0)}</td>
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
                    <span className="font-medium text-slate-800">{toSafeDisplayString(c.custodio, 'Sin asignar')}</span>
                    <span className="font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md text-[11px]">
                      {Number(c.articulos || 0)} bienes
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
                      <div className="font-medium text-slate-800">{toSafeDisplayString(u.ubicacion_nombre, 'Sin ubicación')}</div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase">{toSafeDisplayString(u.area, '—')}</div>
                    </div>
                    <span className="font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md text-[11px] whitespace-nowrap">
                      {Number(u.registros || 0)} registros
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
