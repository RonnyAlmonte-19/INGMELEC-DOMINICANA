import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, Filter, Eye, Download, Plus, ChevronLeft,
  ChevronRight, ArrowUpDown, AlertCircle, CheckCircle2,
  Package, RefreshCw, X, ShieldAlert, ArrowLeft, RotateCcw,
  Sparkles, Lock, Unlock, AlertTriangle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { mapParamToEstado, mapEstadoToParam } from '../../utils/statusMapper';
import ItemDetailModal from './ItemDetailModal';
import SearchableSelect from './SearchableSelect';

export default function InventoryTable({
  fixedArea = null,
  title,
  subtitle,
  allowCreate = true,
  initialFilters = {},
  onNavigateBack = null,
  defaultEmptyMessage = 'No se encontraron artículos con los criterios seleccionados.'
}) {
  const { fetchArticulos, currentRole } = useApp();

  const [loading, setLoading] = useState(true);
  const [articulos, setArticulos] = useState([]);
  const [resumen, setResumen] = useState({ totalRegistros: 0, totalUnidadesFisicas: 0, articulosSinCantidad: 0 });
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 1 });

  // Filters State
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('TODAS');
  const [campamentoFilter, setCampamentoFilter] = useState(() => {
    if (initialFilters?.campamento_id) {
      return String(initialFilters.campamento_id);
    }
    const urlParam = new URLSearchParams(window.location.search).get('campamento_id');
    return urlParam ? String(urlParam) : 'TODOS';
  });
  const [estado, setEstado] = useState(() => {
    if (initialFilters?.estado) {
      return mapParamToEstado(initialFilters.estado);
    }
    const urlParam = new URLSearchParams(window.location.search).get('estado');
    return urlParam ? mapParamToEstado(urlParam) : 'TODOS';
  });
  const [ubicacion, setUbicacion] = useState('TODAS');
  const [categoria, setCategoria] = useState('TODAS');
  const [sinSerial, setSinSerial] = useState(false);
  const [sinCantidad, setSinCantidad] = useState(false);
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('ASC');

  // Modal detail & create
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Available filter options
  const [availableUbicaciones, setAvailableUbicaciones] = useState([]);
  const [availableCategorias, setAvailableCategorias] = useState([]);

  // Detect and update when initialFilters change
  useEffect(() => {
    if (initialFilters?.estado) {
      const mapped = mapParamToEstado(initialFilters.estado);
      setEstado(mapped);
      setPagination(p => ({ ...p, page: 1 }));
    }
    if (initialFilters?.campamento_id) {
      setCampamentoFilter(String(initialFilters.campamento_id));
      setPagination(p => ({ ...p, page: 1 }));
    }
  }, [initialFilters?.estado, initialFilters?.campamento_id]);

  // Sync URL in General Inventory
  useEffect(() => {
    if (fixedArea === null) {
      const params = new URLSearchParams();
      if (estado && estado !== 'TODOS') {
        params.append('estado', mapEstadoToParam(estado));
      }
      if (campamentoFilter && campamentoFilter !== 'TODOS') {
        params.append('campamento_id', campamentoFilter);
      }
      if (areaFilter && areaFilter !== 'TODAS') {
        params.append('area', areaFilter);
      }
      if (search && search.trim() !== '') {
        params.append('search', search.trim());
      }
      const q = params.toString();
      const newUrl = `/inventario${q ? `?${q}` : ''}`;
      window.history.replaceState({ estado, search, areaFilter, campamento_id: campamentoFilter }, '', newUrl);
    }
  }, [estado, campamentoFilter, areaFilter, search, fixedArea]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const activeArea = fixedArea || (areaFilter !== 'TODAS' ? areaFilter : undefined);
      const res = await fetchArticulos({
        area: activeArea,
        campamento_id: campamentoFilter !== 'TODOS' ? campamentoFilter : undefined,
        search: search.trim() || undefined,
        estado: estado !== 'TODOS' ? estado : undefined,
        ubicacion: ubicacion !== 'TODAS' ? ubicacion : undefined,
        categoria: categoria !== 'TODAS' ? categoria : undefined,
        sinSerial: sinSerial ? 'true' : undefined,
        sinCantidad: sinCantidad ? 'true' : undefined,
        page: pagination.page,
        limit: pagination.limit,
        sortBy,
        sortOrder
      });

      if (res.success) {
        setArticulos(res.articulos);
        setPagination(res.pagination);
        if (res.resumen) {
          setResumen(res.resumen);
        }

        // Dynamically collect unique filters
        const uSet = new Set(res.articulos.map(a => a.ubicacion_nombre).filter(Boolean));
        const cSet = new Set(res.articulos.map(a => a.categoria).filter(Boolean));
        setAvailableUbicaciones(Array.from(uSet));
        setAvailableCategorias(Array.from(cSet));
      }
    } catch (err) {
      console.error('Error fetching inventory:', err);
    } finally {
      setLoading(false);
    }
  }, [fixedArea, areaFilter, campamentoFilter, search, estado, ubicacion, categoria, sinSerial, sinCantidad, pagination.page, pagination.limit, sortBy, sortOrder, fetchArticulos]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset all filters
  const handleClearFilters = () => {
    setSearch('');
    setEstado('TODOS');
    setCampamentoFilter('TODOS');
    setAreaFilter('TODAS');
    setUbicacion('TODAS');
    setCategoria('TODAS');
    setSinSerial(false);
    setSinCantidad(false);
    setPagination(p => ({ ...p, page: 1 }));
    if (fixedArea === null) {
      window.history.replaceState({}, '', '/inventario');
    }
  };

  // Export current view to CSV
  const handleExportCsv = () => {
    if (articulos.length === 0) return;
    const headers = [
      'ID Interno', 'Área', 'Categoría', 'Descripción', 'Marca/Modelo',
      'Serie/IMEI', 'Cantidad', 'Unidad', 'Estado', 'Ubicación', 'Zona/Estante',
      'Propietario', 'Custodio', 'Observaciones'
    ];
    const rows = articulos.map(a => [
      `"${a.codigo_original || ''}"`,
      `"${a.area || ''}"`,
      `"${a.categoria || ''}"`,
      `"${(a.articulo_nombre || '').replace(/"/g, '""')}"`,
      `"${(a.marca_modelo || '').replace(/"/g, '""')}"`,
      `"${a.serie_imei || ''}"`,
      a.cantidad_num !== null ? a.cantidad_num : `"${a.cantidad_texto || ''}"`,
      `"${a.unidad_medida || 'Unidad'}"`,
      `"${a.estado_fisico || ''}"`,
      `"${a.ubicacion_nombre || ''}"`,
      `"${a.zona_estante || ''}"`,
      `"${a.propietario || ''}"`,
      `"${a.asignado_a || ''}"`,
      `"${(a.observaciones || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `inventario_${fixedArea || 'general'}_${estado !== 'TODOS' ? estado : 'completo'}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderBadge = (status) => {
    switch (status) {
      case 'Bueno':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Bueno</span>;
      case 'Regular':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">Regular</span>;
      case 'Dañado':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">Dañado</span>;
      case 'Fuera de servicio':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800 border border-red-300">Fuera de serv.</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">Pendiente</span>;
    }
  };

  const renderAreaBadge = (area) => {
    switch (area) {
      case 'INFORMATICA':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Informática</span>;
      case 'OFICINAS':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">Oficinas</span>;
      case 'COCINA':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-pink-50 text-pink-700 border border-pink-200">Cocina</span>;
      case 'ALMACEN':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-[#F28524] border border-amber-200">Almacén</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">{area}</span>;
    }
  };

  const hasActiveFilters = estado !== 'TODOS' || campamentoFilter !== 'TODOS' || areaFilter !== 'TODAS' || ubicacion !== 'TODAS' || categoria !== 'TODAS' || search !== '' || sinSerial || sinCantidad;

  const campamentoLabelMap = {
    '3': 'ALMACÉN 27 DE FEBRERO',
    '12': 'OPL',
    '13': 'MANTENIMIENTO 633',
    'SIN_SEDE': 'SIN SEDE VERIFICADA (PENDIENTE DE CLASIFICACIÓN · KM 19 AUT DUARTE)'
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            {onNavigateBack && (
              <button
                onClick={onNavigateBack}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
                title="Regresar al Dashboard"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h1 className="text-xl font-black text-slate-900 tracking-tight">{title}</h1>
            <span className="px-3 py-0.5 bg-[#F28524]/10 text-[#F28524] font-bold text-xs rounded-full border border-[#F28524]/20">
              {pagination.total} {pagination.total === 1 ? 'registro' : 'registros'}
            </span>
            <span className="px-3 py-0.5 bg-blue-50 text-blue-700 font-bold text-xs rounded-full border border-blue-200">
              {Number(resumen.totalUnidadesFisicas || 0).toLocaleString('es-DO')} u. físicas conocidas
            </span>
            {resumen.articulosSinCantidad > 0 && (
              <span className="px-2.5 py-0.5 bg-amber-50 text-amber-800 font-bold text-xs rounded-full border border-amber-200">
                +{resumen.articulosSinCantidad} cant. pendiente
              </span>
            )}
          </div>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>

        <div className="flex items-center space-x-2">
          {onNavigateBack && (
            <button
              onClick={onNavigateBack}
              className="px-3 py-2 border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center space-x-1.5 transition-colors hidden sm:flex"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver al Dashboard</span>
            </button>
          )}

          <button
            onClick={loadData}
            title="Recargar datos de MySQL"
            className="p-2 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#F28524]' : ''}`} />
          </button>

          <button
            onClick={handleExportCsv}
            disabled={articulos.length === 0}
            className="px-3.5 py-2 border border-slate-200 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-50 text-xs font-semibold flex items-center space-x-1.5 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>Exportar CSV</span>
          </button>

          {allowCreate && (currentRole === 'admin' || currentRole === 'almacen' || currentRole === 'supervisor' || currentRole === 'developer') && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-[#F28524] hover:bg-[#d87019] text-white rounded-xl text-xs font-bold shadow-md shadow-[#F28524]/20 flex items-center space-x-1.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Bien</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Campamento / State Filter Banner */}
      {(estado !== 'TODOS' || campamentoFilter !== 'TODOS') && (
        <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950 shadow-sm animate-in fade-in duration-150">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-xl flex-shrink-0">
              <Filter className="w-4 h-4 text-[#F28524]" />
            </div>
            <div>
              <div className="font-bold text-amber-900 text-sm flex flex-wrap items-center gap-2">
                {campamentoFilter !== 'TODOS' && (
                  <span>
                    Sede / Campamento: <span className="text-[#F28524] font-extrabold underline decoration-2 underline-offset-2">{campamentoLabelMap[campamentoFilter] || campamentoFilter}</span>
                  </span>
                )}
                {estado !== 'TODOS' && (
                  <span>
                    Condición Física: <span className="text-[#F28524] font-extrabold underline decoration-2 underline-offset-2">{estado}</span>
                  </span>
                )}
              </div>
              <div className="text-amber-800 text-[11px] mt-0.5">
                Consultando en tiempo real en MySQL: <strong>{pagination.total}</strong> registros maestros · <strong>{Number(resumen.totalUnidadesFisicas || 0).toLocaleString('es-DO')}</strong> unidades físicas conocidas{resumen.articulosSinCantidad > 0 ? ` (+${resumen.articulosSinCantidad} con cantidad pendiente de verificación)` : ''}.
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 self-end sm:self-auto">
            {onNavigateBack && (
              <button
                onClick={onNavigateBack}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-semibold flex items-center space-x-1.5 transition-all shadow-sm"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Volver al Dashboard</span>
              </button>
            )}
            <button
              onClick={handleClearFilters}
              className="px-3.5 py-1.5 bg-[#F28524] hover:bg-[#d87019] text-white rounded-xl font-bold flex items-center space-x-1.5 transition-all shadow-sm"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpiar Filtro</span>
            </button>
          </div>
        </div>
      )}

      {/* Filter toolbar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/80 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Search box */}
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 transform -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por código, descripción, serial, IMEI, custodio..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
              className="w-full pl-10 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#F28524] focus:outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Campamento / Sede Verificada filter */}
          <div>
            <select
              value={campamentoFilter}
              onChange={e => { setCampamentoFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#F28524] focus:outline-none bg-white text-slate-800 font-semibold truncate"
              title="Filtrar por Campamento Confirmado o Sin Sede Verificada"
            >
              <option value="TODOS">Todos los Campamentos (433)</option>
              <option value="3">ALMACÉN 27 DE FEBRERO (84)</option>
              <option value="12">OPL (136)</option>
              <option value="13">MANTENIMIENTO 633 (109)</option>
              <option value="SIN_SEDE">SIN SEDE VERIFICADA · KM 19 (104)</option>
            </select>
          </div>

          {/* Area filter (only if not fixedArea) */}
          {fixedArea === null ? (
            <div>
              <select
                value={areaFilter}
                onChange={e => { setAreaFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#F28524] focus:outline-none bg-white text-slate-700"
              >
                <option value="TODAS">Todas las Áreas</option>
                <option value="INFORMATICA">Informática (84)</option>
                <option value="OFICINAS">Oficinas y Mobiliario (69)</option>
                <option value="COCINA">Cocina y Comedor (0)</option>
                <option value="ALMACEN">Almacén y Herramientas (280)</option>
              </select>
            </div>
          ) : (
            <div>
              <select
                value={categoria}
                onChange={e => { setCategoria(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#F28524] focus:outline-none bg-white text-slate-700 truncate"
              >
                <option value="TODAS">Todas las Categorías</option>
                {availableCategorias.map((c, i) => (
                  <option key={i} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          {/* Estado filter */}
          <div>
            <select
              value={estado}
              onChange={e => { setEstado(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#F28524] focus:outline-none bg-white text-slate-700 font-medium"
            >
              <option value="TODOS">Todos los Estados</option>
              <option value="Bueno">Bueno (Operativo)</option>
              <option value="Regular">Regular (Desgaste)</option>
              <option value="Dañado">Dañado (Atención)</option>
              <option value="Fuera de servicio">Fuera de servicio</option>
              <option value="Pendiente de verificación">Pendiente de verificación</option>
            </select>
          </div>

          {/* Ubicacion Histórica filter */}
          <div>
            <select
              value={ubicacion}
              onChange={e => { setUbicacion(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#F28524] focus:outline-none bg-white text-slate-700 truncate"
              title="Ubicación histórica literal en Excel"
            >
              <option value="TODAS">Ubicación Excel (Todas)</option>
              <option value="DISTRITO NACIONAL 27 DE FEBRERO">DISTRITO NACIONAL 27 DE FEBRERO</option>
              <option value="KM 19 AUTOPISTA DUARTE OPL">KM 19 AUTOPISTA DUARTE OPL</option>
              <option value="MANTENIMIENTO 633">MANTENIMIENTO 633</option>
              <option value="KM 19 AUT DUARTE">KM 19 AUT DUARTE</option>
            </select>
          </div>
        </div>

        {/* Quick toggles & Clear filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 pt-1 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center space-x-1.5 cursor-pointer hover:text-slate-900">
              <input
                type="checkbox"
                checked={sinSerial}
                onChange={e => { setSinSerial(e.target.checked); setPagination(p => ({ ...p, page: 1 })); }}
                className="rounded border-slate-300 text-[#F28524] focus:ring-[#F28524]"
              />
              <span>Sin Serial / IMEI</span>
            </label>

            <label className="flex items-center space-x-1.5 cursor-pointer hover:text-slate-900">
              <input
                type="checkbox"
                checked={sinCantidad}
                onChange={e => { setSinCantidad(e.target.checked); setPagination(p => ({ ...p, page: 1 })); }}
                className="rounded border-slate-300 text-[#F28524] focus:ring-[#F28524]"
              />
              <span>Cantidad Pendiente de Comprobación</span>
            </label>

            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="text-[#F28524] hover:text-[#d87019] font-bold flex items-center space-x-1 underline decoration-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Limpiar filtros</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2 ml-auto">
            <span className="text-slate-400">Mostrar:</span>
            <select
              value={pagination.limit}
              onChange={e => setPagination(p => ({ ...p, limit: Number(e.target.value), page: 1 }))}
              className="border border-slate-200 rounded-lg text-xs px-2 py-1 focus:outline-none"
            >
              <option value="25">25 filas</option>
              <option value="50">50 filas</option>
              <option value="100">100 filas</option>
              <option value="500">500 filas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <th className="py-3 px-4">Código</th>
                <th className="py-3 px-4">Bien / Descripción</th>
                <th className="py-3 px-4">Área / Cat.</th>
                <th className="py-3 px-4">Marca / Modelo</th>
                <th className="py-3 px-4">Serie / IMEI</th>
                <th className="py-3 px-4 text-center">Cant. Física</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4">Sede / Ubicación Excel</th>
                <th className="py-3 px-4">Propietario / Custodio</th>
                <th className="py-3 px-4">Observaciones del Excel</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="11" className="py-16 text-center text-slate-400">
                    <div className="w-7 h-7 border-4 border-[#F28524] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <span>Cargando inventario desde base de datos MySQL...</span>
                  </td>
                </tr>
              ) : articulos.length === 0 ? (
                <tr>
                  <td colSpan="11" className="py-16 text-center text-slate-400">
                    <Package className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-600">{defaultEmptyMessage}</p>
                    <p className="text-xs text-slate-400 mt-1">Verifica los filtros seleccionados o limpia la búsqueda.</p>
                    {hasActiveFilters && (
                      <button
                        onClick={handleClearFilters}
                        className="mt-3 px-4 py-1.5 bg-[#F28524] text-white rounded-xl text-xs font-bold shadow hover:bg-[#d87019] transition-all inline-flex items-center space-x-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restablecer Filtros</span>
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                articulos.map((art) => (
                  <tr
                    key={art.id}
                    className="hover:bg-amber-50/40 transition-colors group cursor-pointer"
                    onClick={() => setSelectedItemId(art.id)}
                  >
                    {/* Código */}
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {art.codigo_original ? (
                        <span className="bg-slate-100 group-hover:bg-[#F28524]/10 group-hover:text-[#F28524] px-2 py-0.5 rounded border border-slate-200 transition-colors">
                          {art.codigo_original}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">(Sin código)</span>
                      )}
                    </td>

                    {/* Descripción */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800 line-clamp-1">{art.articulo_nombre}</div>
                      {art.tipo_caracteristicas && (
                        <div className="text-[10px] text-slate-400 line-clamp-1">{art.tipo_caracteristicas}</div>
                      )}
                    </td>

                    {/* Área / Categoría */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div>{renderAreaBadge(art.area)}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{art.categoria}</div>
                    </td>

                    {/* Marca / Modelo */}
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                      {art.marca_modelo || <span className="text-slate-300 italic">No indicado</span>}
                    </td>

                    {/* Serie / IMEI */}
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                      {art.serie_imei && art.serie_imei !== 'N/A' && art.serie_imei !== 'S/N' ? (
                        <span>{art.serie_imei}</span>
                      ) : (
                        <span className="text-slate-300 italic">Sin serial</span>
                      )}
                    </td>

                    {/* Cantidad Física (Tarea 6: Separar NULL/inválidas sin convertirlas a 0 o 1) */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {art.cantidad_num !== null && art.cantidad_num !== undefined ? (
                        <>
                          <span className="font-bold text-slate-900">
                            {Number(art.cantidad_num)}
                          </span>
                          <span className="text-[11px] text-slate-400 ml-1">
                            {art.unidad_medida}
                          </span>
                        </>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300" title="Cantidad vacía o '--' en Excel original; no convertida a 0 ni 1">
                          Pend. verificación {art.cantidad_texto ? `(${art.cantidad_texto})` : ''}
                        </span>
                      )}
                    </td>

                    {/* Estado */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {renderBadge(art.estado_fisico)}
                    </td>

                    {/* Sede Verificada / Ubicación Histórica */}
                    <td className="py-3 px-4">
                      <div>
                        {art.campamento_id ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {art.campamento_nombre || `Sede #${art.campamento_id}`}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
                            SIN SEDE VERIFICADA
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1" title={art.ubicacion_nombre}>
                        Excel: {art.ubicacion_nombre}
                      </div>
                      {art.zona_estante && (
                        <div className="text-[10px] text-slate-400 line-clamp-1 font-mono">
                          Estante: {art.zona_estante}
                        </div>
                      )}
                    </td>

                    {/* Propietario / Custodio */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="text-slate-800 font-medium">
                        <span className="text-slate-400 text-[10px] mr-1">Prop:</span>
                        {art.propietario}
                      </div>
                      <div className="text-slate-600 text-[11px]">
                        <span className="text-slate-400 text-[10px] mr-1">Cust:</span>
                        {art.asignado_a || 'Sin asignar'}
                      </div>
                    </td>

                    {/* Observaciones completas */}
                    <td className="py-3 px-4 max-w-xs">
                      {art.observaciones ? (
                        <div className="text-slate-600 line-clamp-2 italic text-[11px] bg-slate-50 p-1.5 rounded border border-slate-100" title={art.observaciones}>
                          "{art.observaciones}"
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Acciones */}
                    <td className="py-3 px-4 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedItemId(art.id)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-[#F28524] text-slate-700 hover:text-white rounded-lg text-xs font-medium transition-colors flex items-center space-x-1 mx-auto"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Ficha</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div>
            Mostrando <span className="font-bold text-slate-800">{articulos.length}</span> de <span className="font-bold text-slate-800">{pagination.total}</span> registros empresariales ({Number(resumen.totalUnidadesFisicas || 0).toLocaleString('es-DO')} unidades físicas conocidas)
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPagination(p => ({ ...p, page: Math.max(p.page - 1, 1) }))}
              disabled={pagination.page <= 1}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-medium text-slate-800 px-2">
              Página {pagination.page} de {pagination.totalPages || 1}
            </span>
            <button
              onClick={() => setPagination(p => ({ ...p, page: Math.min(p.page + 1, pagination.totalPages) }))}
              disabled={pagination.page >= pagination.totalPages}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Item Detail & Edit Modal */}
      {selectedItemId && (
        <ItemDetailModal
          itemId={selectedItemId}
          onClose={() => setSelectedItemId(null)}
          onUpdated={loadData}
        />
      )}

      {/* Quick Create Modal */}
      {showCreateModal && (
        <CreateItemModal
          defaultArea={fixedArea || 'ALMACEN'}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); loadData(); }}
        />
      )}
    </div>
  );
}

// Sub-component: Create Item Modal with Dynamic Catalogs & Auto-coding
function CreateItemModal({ defaultArea, onClose, onCreated }) {
  const {
    createArticulo,
    fetchNextCode,
    fetchCategorias,
    createCategoria,
    fetchCustodios,
    createCustodio,
    fetchUbicaciones,
    createCampamento
  } = useApp();

  const [formData, setFormData] = useState({
    codigo_original: '',
    area: defaultArea || 'ALMACEN',
    categoria: '',
    articulo_nombre: '',
    marca_modelo: '',
    serie_imei: '',
    propietario: 'INGMELEC',
    asignado_a: '',
    cantidad_num: 1,
    unidad_medida: 'Unidad',
    estado_fisico: 'Bueno',
    ubicacion_nombre: 'DISTRITO NACIONAL 27 DE FEBRERO',
    zona_estante: '',
    observaciones: ''
  });

  const [isManualCode, setIsManualCode] = useState(false);
  const [autoGeneratedCode, setAutoGeneratedCode] = useState('');
  const [loadingNextCode, setLoadingNextCode] = useState(false);

  const [categorias, setCategorias] = useState([]);
  const [loadingCategorias, setLoadingCategorias] = useState(false);

  const [custodios, setCustodios] = useState([]);
  const [loadingCustodios, setLoadingCustodios] = useState(false);

  const [ubicaciones, setUbicaciones] = useState([]);
  const [loadingUbicaciones, setLoadingUbicaciones] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Load next code & categories when area changes
  useEffect(() => {
    let isCancelled = false;

    const loadAreaDetails = async () => {
      setLoadingNextCode(true);
      setLoadingCategorias(true);
      try {
        // Next code
        const codeRes = await fetchNextCode(formData.area);
        if (!isCancelled && codeRes.success) {
          setAutoGeneratedCode(codeRes.nextCode);
          if (!isManualCode) {
            setFormData(prev => ({ ...prev, codigo_original: codeRes.nextCode }));
          }
        }

        // Categorias for area
        const catRes = await fetchCategorias(formData.area);
        if (!isCancelled && catRes.success) {
          setCategorias(catRes.categorias || []);
        }
      } catch (err) {
        console.error('Error fetching area catalogs:', err);
      } finally {
        if (!isCancelled) {
          setLoadingNextCode(false);
          setLoadingCategorias(false);
        }
      }
    };

    loadAreaDetails();

    return () => {
      isCancelled = true;
    };
  }, [formData.area, fetchNextCode, fetchCategorias, isManualCode]);

  // Load Custodios and Ubicaciones on mount
  useEffect(() => {
    let isCancelled = false;

    const loadGlobalCatalogs = async () => {
      setLoadingCustodios(true);
      setLoadingUbicaciones(true);
      try {
        const [custRes, ubicRes] = await Promise.all([
          fetchCustodios(),
          fetchUbicaciones()
        ]);

        if (!isCancelled) {
          if (custRes.success && custRes.custodios) {
            setCustodios(custRes.custodios.map(c => ({
              label: c.nombre,
              value: c.nombre,
              sublabel: c.cargo || c.departamento || null
            })));
          }
          if (ubicRes.success && ubicRes.ubicaciones) {
            setUbicaciones(ubicRes.ubicaciones.map(u => ({
              label: u.nombre,
              value: u.nombre,
              sublabel: u.provincia ? `${u.tipo} • ${u.provincia}` : u.tipo
            })));
          }
        }
      } catch (err) {
        console.error('Error fetching global catalogs:', err);
      } finally {
        if (!isCancelled) {
          setLoadingCustodios(false);
          setLoadingUbicaciones(false);
        }
      }
    };

    loadGlobalCatalogs();

    return () => {
      isCancelled = true;
    };
  }, [fetchCustodios, fetchUbicaciones]);

  const handleCreateCategoria = async (newCatName) => {
    try {
      const res = await createCategoria({ area: formData.area, nombre: newCatName });
      if (res.success) {
        setCategorias(prev => [...prev, newCatName]);
        setFormData(prev => ({ ...prev, categoria: newCatName }));
      }
    } catch (err) {
      console.error('Error creating categoria:', err);
    }
  };

  const handleCreateCustodio = async (newCustName) => {
    try {
      const res = await createCustodio({ nombre: newCustName, cargo: 'Personal de Campo' });
      if (res.success) {
        setCustodios(prev => [...prev, { label: newCustName, value: newCustName, sublabel: 'Personal de Campo' }]);
        setFormData(prev => ({ ...prev, asignado_a: newCustName }));
      }
    } catch (err) {
      console.error('Error creating custodio:', err);
    }
  };

  const handleCreateUbicacion = async (newUbicName) => {
    try {
      const res = await createCampamento({ nombre: newUbicName, provincia: 'República Dominicana' });
      if (res.success) {
        setUbicaciones(prev => [...prev, { label: newUbicName, value: newUbicName, sublabel: 'Nuevo Campamento' }]);
        setFormData(prev => ({ ...prev, ubicacion_nombre: newUbicName }));
      }
    } catch (err) {
      console.error('Error creating campamento:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrorMessage(null);
    try {
      const res = await createArticulo(formData);
      if (res.success) {
        onCreated();
      } else {
        setErrorMessage(res.message || 'Error al guardar el artículo.');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Error de comunicación con el servidor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200">
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Plus className="w-5 h-5 text-[#F28524]" />
            <h3 className="font-bold text-base">Registrar Nuevo Activo en MySQL</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="bg-rose-50 border-b border-rose-200 px-6 py-3 flex items-center space-x-3 text-xs text-rose-800">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span className="font-semibold">{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Área Destino */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Área Destino <span className="text-rose-500">*</span>
              </label>
              <select
                value={formData.area}
                onChange={e => setFormData({ ...formData, area: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none bg-white font-medium"
              >
                <option value="ALMACEN">Almacén y Herramientas (HER-###)</option>
                <option value="INFORMATICA">Informática y Tecnología (INF-###)</option>
                <option value="OFICINAS">Oficinas y Mobiliario (MOB-###)</option>
                <option value="COCINA">Cocina y Comedor (COC-###)</option>
              </select>
            </div>

            {/* Código de Referencia Dinámico */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                  <span>Código de Referencia</span>
                  {!isManualCode ? (
                    <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                      <Sparkles className="w-3 h-3 text-emerald-600" />
                      <span>Sugerido</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                      <Unlock className="w-3 h-3 text-amber-600" />
                      <span>Manual</span>
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (isManualCode) {
                      setIsManualCode(false);
                      setFormData(p => ({ ...p, codigo_original: autoGeneratedCode }));
                    } else {
                      setIsManualCode(true);
                    }
                  }}
                  className="text-[11px] text-[#F28524] hover:underline font-semibold flex items-center space-x-1"
                >
                  {isManualCode ? (
                    <>
                      <RotateCcw className="w-3 h-3" />
                      <span>Restaurar sugerido</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3 h-3" />
                      <span>Editar manualmente</span>
                    </>
                  )}
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder={loadingNextCode ? 'Calculando siguiente código...' : 'Ej. HER-260, INF-091...'}
                  value={formData.codigo_original}
                  readOnly={!isManualCode}
                  onChange={e => setFormData({ ...formData, codigo_original: e.target.value })}
                  className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none font-mono font-bold tracking-wider ${
                    !isManualCode
                      ? 'bg-slate-50 border-emerald-300 text-slate-800 cursor-not-allowed'
                      : 'bg-white border-amber-300 text-slate-900 focus:ring-2 focus:ring-[#F28524]'
                  }`}
                />
                {!isManualCode && (
                  <span className="absolute right-2.5 top-2.5 text-slate-400">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                {!isManualCode
                  ? 'Calculado automáticamente para evitar colisiones según el área.'
                  : 'Modo manual activado: Se validará la disponibilidad del código al registrar.'}
              </p>
            </div>

            {/* Nombre / Descripción */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nombre / Descripción del Bien <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ej. Taladro Percutor Inalámbrico 20V, Laptop Dell Latitude 5420..."
                value={formData.articulo_nombre}
                onChange={e => setFormData({ ...formData, articulo_nombre: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none font-medium shadow-sm"
              />
            </div>

            {/* Categoría Dinámica */}
            <div>
              <SearchableSelect
                label="Categoría"
                placeholder="Seleccione o busque una categoría..."
                options={categorias}
                value={formData.categoria}
                onChange={val => setFormData({ ...formData, categoria: val })}
                allowCreate={true}
                onCreateNew={handleCreateCategoria}
                loading={loadingCategorias}
                helperText={`Categorías específicas para el área ${formData.area}`}
              />
            </div>

            {/* Marca / Modelo */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Marca / Modelo</label>
              <input
                type="text"
                placeholder="Ej. Makita, Lenovo, Samsung..."
                value={formData.marca_modelo}
                onChange={e => setFormData({ ...formData, marca_modelo: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none"
              />
            </div>

            {/* Cantidad Física */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Cantidad Física</label>
              <input
                type="number"
                min="1"
                step="any"
                value={formData.cantidad_num}
                onChange={e => setFormData({ ...formData, cantidad_num: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none font-bold"
              />
            </div>

            {/* Unidad de Medida */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Unidad de Medida</label>
              <select
                value={formData.unidad_medida}
                onChange={e => setFormData({ ...formData, unidad_medida: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none"
              >
                <option value="Unidad">Unidad</option>
                <option value="Rollo">Rollo</option>
                <option value="Paquete">Paquete</option>
                <option value="Juego">Juego</option>
                <option value="Caja">Caja</option>
                <option value="Metro">Metro</option>
                <option value="Pieza">Pieza</option>
                <option value="Par">Par</option>
              </select>
            </div>

            {/* Estado Físico */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Estado Físico</label>
              <select
                value={formData.estado_fisico}
                onChange={e => setFormData({ ...formData, estado_fisico: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none font-semibold text-slate-800"
              >
                <option value="Bueno">Bueno</option>
                <option value="Regular">Regular</option>
                <option value="Dañado">Dañado</option>
                <option value="Fuera de servicio">Fuera de servicio</option>
                <option value="Pendiente de verificación">Pendiente de verificación</option>
              </select>
            </div>

            {/* Ubicación / Campamento Dinámico */}
            <div>
              <SearchableSelect
                label="Ubicación / Campamento"
                placeholder="Seleccione campamento o almacén..."
                options={ubicaciones}
                value={formData.ubicacion_nombre}
                onChange={val => setFormData({ ...formData, ubicacion_nombre: val })}
                allowCreate={true}
                onCreateNew={handleCreateUbicacion}
                loading={loadingUbicaciones}
                required={true}
                helperText="Campamentos oficiales y bodegas registradas"
              />
            </div>

            {/* Custodio / Responsable Dinámico */}
            <div>
              <SearchableSelect
                label="Custodio / Responsable"
                placeholder="Seleccione o asigne responsable..."
                options={custodios}
                value={formData.asignado_a}
                onChange={val => setFormData({ ...formData, asignado_a: val })}
                allowCreate={true}
                onCreateNew={handleCreateCustodio}
                loading={loadingCustodios}
                helperText="Cualquier persona puede ser custodio sin requerir cuenta"
              />
            </div>

            {/* Serie / IMEI */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Serie / IMEI</label>
              <input
                type="text"
                placeholder="Serial o IMEI si aplica..."
                value={formData.serie_imei}
                onChange={e => setFormData({ ...formData, serie_imei: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none font-mono"
              />
            </div>
          </div>

          {/* Observaciones */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Observaciones</label>
            <textarea
              rows={2}
              placeholder="Detalles sobre procedencia, condición o requerimientos..."
              value={formData.observaciones}
              onChange={e => setFormData({ ...formData, observaciones: e.target.value })}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F28524] focus:outline-none"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-medium hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-[#F28524] hover:bg-[#d87019] text-white rounded-xl text-xs font-bold shadow-md transition-colors disabled:opacity-50 flex items-center space-x-2"
            >
              {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{saving ? 'Guardando en MySQL...' : 'Crear Artículo'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
