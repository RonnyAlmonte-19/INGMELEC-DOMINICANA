import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search, Filter, Eye, Download, Plus, ChevronLeft,
  ChevronRight, Package, RefreshCw, X, ArrowLeft, RotateCcw,
  Sparkles, Lock, Unlock, AlertTriangle, FileSpreadsheet
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { mapParamToEstado, mapEstadoToParam } from '../../utils/statusMapper';
import { toSafeDisplayString } from '../../utils/jsonFormat';
import { userHasPermission, isDeveloperUser } from '../../utils/permissions';
import {
  downloadCsvFile,
  downloadXlsxWorkbook,
  INVENTARIO_EXPORT_HEADERS,
  INVENTARIO_EXPORT_WIDTHS,
  mapArticulosToExportRows
} from '../../utils/exportUtils';
import ItemDetailModal from './ItemDetailModal';
import AgotadoBadge from './AgotadoBadge';
import DateRangeFilter, { EMPTY_DATE_RANGE, dateRangeParams } from './DateRangeFilter';
import SearchableSelect from './SearchableSelect';

function normalizeLookupText(val) {
  return toSafeDisplayString(val, '').trim().toUpperCase();
}

function resolveCampamentoIdForUbicacion(ubicName, ubicList = [], campamentosCatalog = [], activeCampamento = null) {
  const needle = normalizeLookupText(ubicName);
  if (!needle) return null;

  const matchedOpt = (Array.isArray(ubicList) ? ubicList : []).find(
    u => normalizeLookupText(u?.value || u?.nombre) === needle
  );
  if (matchedOpt?.campamento_id) {
    return Number(matchedOpt.campamento_id);
  }

  const catalog = Array.isArray(campamentosCatalog) ? campamentosCatalog : [];
  const matchedCamp = catalog.find(c => {
    if (!c || c.es_sintetico) return false;
    if (
      normalizeLookupText(c.nombre) === needle ||
      normalizeLookupText(c.codigo) === needle ||
      normalizeLookupText(c.ubicacion_historica_equivalente) === needle
    ) {
      return true;
    }
    if (Array.isArray(c.aliases)) {
      return c.aliases.some(
        al =>
          al?.requiere_revision_historica !== 1 &&
          (normalizeLookupText(al?.alias_original) === needle || normalizeLookupText(al?.alias_normalizado) === needle)
      );
    }
    return false;
  });
  if (matchedCamp?.id) {
    return Number(matchedCamp.id);
  }

  if (
    activeCampamento?.id &&
    (normalizeLookupText(activeCampamento.nombre) === needle ||
      normalizeLookupText(activeCampamento.ubicacion_historica_equivalente) === needle)
  ) {
    return Number(activeCampamento.id);
  }

  return null;
}

export default function InventoryTable({
  fixedArea = null,
  title,
  subtitle,
  allowCreate = true,
  initialFilters = {},
  onNavigateBack = null,
  defaultEmptyMessage = 'No se encontraron artículos con los criterios seleccionados.'
}) {
  const { fetchArticulos, currentRole, currentUser, campamentosCatalog, kpis, activeCampamento, showToast } = useApp();

  const getUrlParam = (key) => {
    if (typeof window === 'undefined' || !window.location) return null;
    return new URLSearchParams(window.location.search).get(key);
  };

  const [loading, setLoading] = useState(true);
  const [fechaRango, setFechaRango] = useState(EMPTY_DATE_RANGE); // v2.2: filtro por fecha de registro
  const [exporting, setExporting] = useState(false);
  const [articulos, setArticulos] = useState([]);
  const [resumen, setResumen] = useState({ totalRegistros: 0, totalUnidadesFisicas: 0, articulosSinCantidad: 0 });
  const [pagination, setPagination] = useState(() => ({
    total: 0,
    page: Math.max(1, parseInt(getUrlParam('page') || '1', 10) || 1),
    limit: [25, 50, 100, 500].includes(parseInt(getUrlParam('limit') || '25', 10))
      ? parseInt(getUrlParam('limit') || '25', 10)
      : 25,
    totalPages: 1
  }));

  // Filters State (con persistencia URL M08 y propagación activeCampamento C08)
  const [search, setSearch] = useState(() => initialFilters?.search || getUrlParam('search') || '');
  const [areaFilter, setAreaFilter] = useState(() => (initialFilters?.area || getUrlParam('area') || 'TODAS').toUpperCase());
  const [campamentoFilter, setCampamentoFilter] = useState(() => {
    if (initialFilters?.campamento_id) {
      return String(initialFilters.campamento_id);
    }
    const urlParam = getUrlParam('campamento_id');
    if (urlParam) return String(urlParam);
    return activeCampamento?.id ? String(activeCampamento.id) : 'TODOS';
  });
  const [estado, setEstado] = useState(() => {
    if (initialFilters?.estado) {
      return mapParamToEstado(initialFilters.estado);
    }
    const urlParam = getUrlParam('estado');
    return urlParam ? mapParamToEstado(urlParam) : 'TODOS';
  });
  const [ubicacion, setUbicacion] = useState(() => initialFilters?.ubicacion || getUrlParam('ubicacion') || 'TODAS');
  const [categoria, setCategoria] = useState(() => initialFilters?.categoria || getUrlParam('categoria') || 'TODAS');
  const [sinSerial, setSinSerial] = useState(() => (initialFilters?.sinSerial || getUrlParam('sinSerial')) === 'true');
  const [sinCantidad, setSinCantidad] = useState(() => (initialFilters?.sinCantidad || getUrlParam('sinCantidad')) === 'true');
  const [sortBy, setSortBy] = useState(() => initialFilters?.sortBy || getUrlParam('sortBy') || 'id');
  const [sortOrder, setSortOrder] = useState(() => (initialFilters?.sortOrder || getUrlParam('sortOrder') || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC');

  const prevActiveCampIdRef = useRef(activeCampamento?.id ? String(activeCampamento.id) : 'TODOS');

  // Sincronización cuando cambia el selector global de sede en Topbar (C08)
  useEffect(() => {
    const nextGlobalId = activeCampamento?.id ? String(activeCampamento.id) : 'TODOS';
    if (prevActiveCampIdRef.current !== nextGlobalId) {
      prevActiveCampIdRef.current = nextGlobalId;
      setCampamentoFilter(nextGlobalId);
      setPagination(p => ({ ...p, page: 1 }));
    }
  }, [activeCampamento]);

  // Modal detail & create
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Available filter options
  const [availableUbicaciones, setAvailableUbicaciones] = useState([]);
  const [availableCategorias, setAvailableCategorias] = useState([]);
  // v2.2: contadores calculados por el backend (opción elegida + resto de filtros) y totales de contexto
  const [facetas, setFacetas] = useState(null);

  // Detect and update when initialFilters / popstate URL params change (M08)
  useEffect(() => {
    if (initialFilters?.estado !== undefined) {
      const mapped = initialFilters.estado ? mapParamToEstado(initialFilters.estado) : 'TODOS';
      setEstado(mapped);
    }
    if (initialFilters?.campamento_id !== undefined) {
      setCampamentoFilter(initialFilters.campamento_id ? String(initialFilters.campamento_id) : 'TODOS');
    }
    if (initialFilters?.area !== undefined) {
      setAreaFilter(initialFilters.area ? String(initialFilters.area).toUpperCase() : 'TODAS');
    }
    if (initialFilters?.search !== undefined) {
      setSearch(String(initialFilters.search || ''));
    }
    if (initialFilters?.sortBy !== undefined) {
      setSortBy(initialFilters.sortBy || 'id');
    }
    if (initialFilters?.sortOrder !== undefined) {
      setSortOrder(String(initialFilters.sortOrder || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC');
    }
  }, [
    initialFilters?.estado,
    initialFilters?.campamento_id,
    initialFilters?.area,
    initialFilters?.search,
    initialFilters?.sortBy,
    initialFilters?.sortOrder
  ]);

  // Sync URL in General Inventory (incluye todos los filtros, ordenación y página M08)
  useEffect(() => {
    if (fixedArea === null && typeof window !== 'undefined' && window.history?.replaceState) {
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
      if (ubicacion && ubicacion !== 'TODAS') {
        params.append('ubicacion', ubicacion);
      }
      if (categoria && categoria !== 'TODAS') {
        params.append('categoria', categoria);
      }
      if (sinSerial) {
        params.append('sinSerial', 'true');
      }
      if (sinCantidad) {
        params.append('sinCantidad', 'true');
      }
      if (search && search.trim() !== '') {
        params.append('search', search.trim());
      }
      if (sortBy && sortBy !== 'id') {
        params.append('sortBy', sortBy);
      }
      if (sortOrder && sortOrder !== 'ASC') {
        params.append('sortOrder', sortOrder);
      }
      if (pagination.page > 1) {
        params.append('page', String(pagination.page));
      }
      const q = params.toString();
      const newUrl = `/inventario${q ? `?${q}` : ''}`;
      window.history.replaceState({ estado, search, areaFilter, campamento_id: campamentoFilter, sortBy, sortOrder }, '', newUrl);
    }
  }, [estado, campamentoFilter, areaFilter, ubicacion, categoria, sinSerial, sinCantidad, search, sortBy, sortOrder, pagination.page, fixedArea]);

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
        ...dateRangeParams(fechaRango),
        facetas: 'true',
        page: pagination.page,
        limit: pagination.limit,
        sortBy,
        sortOrder
      });

      if (res.success) {
        setArticulos(res.articulos);
        setPagination(res.pagination);
        setFacetas(res.facetas || null);
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
  }, [fixedArea, areaFilter, campamentoFilter, search, estado, ubicacion, categoria, sinSerial, sinCantidad, fechaRango, pagination.page, pagination.limit, sortBy, sortOrder, fetchArticulos]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset all filters
  // v2.2: limpia los filtros pero CONSERVA la búsqueda del usuario (se quita con la ✕ del cuadro de búsqueda)
  const handleClearFilters = () => {
    setEstado('TODOS');
    setCampamentoFilter('TODOS');
    setAreaFilter('TODAS');
    setUbicacion('TODAS');
    setCategoria('TODAS');
    setSinSerial(false);
    setSinCantidad(false);
    setFechaRango(EMPTY_DATE_RANGE);
    setSortBy('id');
    setSortOrder('ASC');
    setPagination(p => ({ ...p, page: 1 }));
    if (fixedArea === null && typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState({}, '', '/inventario');
    }
  };

  const handleSortColumn = (colKey) => {
    if (sortBy === colKey) {
      setSortOrder(prev => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(colKey);
      setSortOrder('ASC');
    }
    setPagination(p => ({ ...p, page: 1 }));
  };

  // Exportar universo filtrado completo (todas las páginas, CSV con neutralización de fórmulas o Excel .xlsx A08/A11)
  const handleExportFiltered = async (format = 'csv') => {
    if (pagination.total === 0 && articulos.length === 0) return;
    try {
      setExporting(true);
      const query = new URLSearchParams();
      const activeArea = fixedArea || (areaFilter !== 'TODAS' ? areaFilter : undefined);
      if (activeArea) query.append('area', activeArea);
      if (campamentoFilter !== 'TODOS') query.append('campamento_id', campamentoFilter);
      if (estado !== 'TODOS') query.append('estado', estado);
      if (ubicacion !== 'TODAS') query.append('ubicacion', ubicacion);
      if (categoria !== 'TODAS') query.append('categoria', categoria);
      if (sinSerial) query.append('sinSerial', 'true');
      if (sinCantidad) query.append('sinCantidad', 'true');
      if (search.trim()) query.append('search', search.trim());
      Object.entries(dateRangeParams(fechaRango)).forEach(([k, v]) => query.append(k, v));
      query.append('sortBy', sortBy);
      query.append('sortOrder', sortOrder);

      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('ingmelec_token') : null;
      const res = await fetch(`/api/v2/reportes/exportar?${query.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const json = await res.json();
      if (!res.ok || !json?.success || !Array.isArray(json.data)) {
        if (showToast) showToast(json?.message || 'Error al exportar inventario completo.', 'error');
        return;
      }

      const rows = mapArticulosToExportRows(json.data);
      const baseFilename = `inventario_${fixedArea || 'general'}_${estado !== 'TODOS' ? estado : 'completo'}_${new Date().toISOString().slice(0, 10)}`;

      if (format === 'xlsx') {
        await downloadXlsxWorkbook(`${baseFilename}.xlsx`, [
          {
            sheetName: 'Inventario Filtrado',
            headers: INVENTARIO_EXPORT_HEADERS,
            rows,
            columnWidths: INVENTARIO_EXPORT_WIDTHS
          }
        ]);
      } else {
        downloadCsvFile(`${baseFilename}.csv`, INVENTARIO_EXPORT_HEADERS, rows);
      }
      if (showToast) {
        showToast(`Exportación ${format.toUpperCase()} generada (${json.data.length} registros).`, 'success');
      }
    } catch (err) {
      console.error('Export filtered inventory error:', err);
      if (showToast) showToast('No se pudo completar la exportación del inventario.', 'error');
    } finally {
      setExporting(false);
    }
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
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">{toSafeDisplayString(area, 'Sin área')}</span>;
    }
  };

  const hasFiltersWithoutSearch = estado !== 'TODOS' || campamentoFilter !== 'TODOS' || areaFilter !== 'TODAS' || ubicacion !== 'TODAS' || categoria !== 'TODAS' || sinSerial || sinCantidad || Boolean(fechaRango.desde || fechaRango.hasta);
  const hasActiveFilters = hasFiltersWithoutSearch || search.trim() !== '';

  const isGlobalRole = isDeveloperUser(currentUser) || currentRole === 'gerencia';
  const canCreate = userHasPermission(currentUser, 'inv:crear');
  const canExport = userHasPermission(currentUser, 'rep:exportar');

  const campamentoSelectOptions = useMemo(() => {
    const kpiPorCamp = Array.isArray(kpis?.porCampamento) ? kpis.porCampamento : [];
    const kpiById = new Map(kpiPorCamp.map(c => [String(c.id), c]));
    const catalogList = Array.isArray(campamentosCatalog)
      ? campamentosCatalog.filter(c => !c?.es_sintetico && c?.activo !== 0)
      : [];

    const sourceList = catalogList.length > 0 ? catalogList : kpiPorCamp;
    return sourceList.map(c => {
      const idStr = String(c.id);
      const kpiMatch = kpiById.get(idStr);
      const nombre = toSafeDisplayString(c.nombre || kpiMatch?.nombre, `Sede #${idStr}`);
      const rawCount = c.total_articulos ?? kpiMatch?.total_articulos;
      const count = typeof rawCount === 'number'
        ? rawCount
        : (rawCount !== undefined && rawCount !== null ? Number(rawCount) : null);
      return {
        value: idStr,
        nombre,
        count: Number.isFinite(count) ? count : null
      };
    });
  }, [campamentosCatalog, kpis]);

  const sinSedeOption = useMemo(() => {
    const sinSede = kpis?.sinSedeVerificada || null;
    if (!sinSede && !isGlobalRole && campamentoFilter !== 'SIN_SEDE') {
      return null;
    }
    const nombre = toSafeDisplayString(sinSede?.nombre, 'SIN SEDE VERIFICADA');
    const historica = sinSede?.ubicacion_historica
      ? toSafeDisplayString(sinSede.ubicacion_historica, '')
      : '';
    const rawCount = sinSede?.total_articulos;
    const count = typeof rawCount === 'number'
      ? rawCount
      : (rawCount !== undefined && rawCount !== null ? Number(rawCount) : null);
    return {
      value: 'SIN_SEDE',
      nombre,
      historica,
      count: Number.isFinite(count) ? count : null
    };
  }, [kpis, isGlobalRole, campamentoFilter]);

  const campamentoLabelMap = useMemo(() => {
    const map = {};
    campamentoSelectOptions.forEach(opt => {
      map[opt.value] = opt.nombre;
    });
    if (sinSedeOption) {
      map.SIN_SEDE = sinSedeOption.historica
        ? `${sinSedeOption.nombre} (PENDIENTE DE CLASIFICACIÓN · ${sinSedeOption.historica})`
        : `${sinSedeOption.nombre} (PENDIENTE DE CLASIFICACIÓN)`;
    }
    return map;
  }, [campamentoSelectOptions, sinSedeOption]);

  // v2.2: contadores del backend. Cada cifra = artículos que habría al elegir esa opción manteniendo los demás filtros.
  const facetaCampamentos = useMemo(() => {
    if (!facetas?.campamentos) return null;
    const map = {};
    let todos = 0;
    facetas.campamentos.forEach((c) => {
      const key = c.campamento_id === null || c.campamento_id === undefined ? 'SIN_SEDE' : String(c.campamento_id);
      map[key] = (map[key] || 0) + c.total;
      todos += c.total;
    });
    return { map, todos };
  }, [facetas]);

  const categoriaOptions = useMemo(() => {
    const lista = facetas?.categorias
      ? facetas.categorias.map((c) => ({ valor: toSafeDisplayString(c.valor, ''), total: c.total }))
      : availableCategorias.map((c) => ({ valor: toSafeDisplayString(c, ''), total: null }));
    if (categoria && categoria !== 'TODAS' && !lista.some((c) => c.valor === categoria)) {
      lista.unshift({ valor: categoria, total: facetas ? 0 : null });
    }
    return lista;
  }, [facetas, availableCategorias, categoria]);

  const ubicacionFilterOptions = useMemo(() => {
    if (facetas?.ubicaciones) {
      const lista = facetas.ubicaciones
        .map((u) => ({ valor: toSafeDisplayString(u.valor, ''), total: u.total }))
        .filter((u) => u.valor && u.valor !== '—');
      if (ubicacion && ubicacion !== 'TODAS' && !lista.some((u) => u.valor === ubicacion)) {
        lista.unshift({ valor: ubicacion, total: 0 });
      }
      return lista;
    }
    const set = new Set();
    if (Array.isArray(kpis?.ubicaciones)) {
      kpis.ubicaciones.forEach(u => {
        const name = toSafeDisplayString(u?.ubicacion_nombre, '');
        if (name && name !== '—') set.add(name);
      });
    }
    availableUbicaciones.forEach(u => {
      const name = toSafeDisplayString(u, '');
      if (name && name !== '—') set.add(name);
    });
    if (ubicacion && ubicacion !== 'TODAS') {
      set.add(ubicacion);
    }
    return Array.from(set).map((valor) => ({ valor, total: null }));
  }, [kpis, availableUbicaciones, ubicacion, facetas]);

  const AREA_LABELS = { INFORMATICA: 'Informática', OFICINAS: 'Oficinas y Mobiliario', COCINA: 'Cocina y Comedor', ALMACEN: 'Almacén y Herramientas' };
  const formatAreaOpt = (label, areaKey) => {
    if (facetas?.areas) return `${label} (${Number(facetas.areas[areaKey] ?? 0)})`;
    const porArea = kpis?.porArea;
    if (porArea && porArea[areaKey] !== undefined && porArea[areaKey] !== null) {
      return `${label} (${Number(porArea[areaKey])})`;
    }
    return label;
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
            <h1 className="text-xl font-black text-slate-900 tracking-tight">{toSafeDisplayString(title, 'Inventario')}</h1>
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
          {subtitle && <p className="text-xs text-slate-500 mt-1">{toSafeDisplayString(subtitle, '')}</p>}
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

          {canExport && (
            <>
              <button
                type="button"
                onClick={() => handleExportFiltered('csv')}
                disabled={(pagination.total === 0 && articulos.length === 0) || exporting}
                className="px-3.5 py-2 border border-slate-200 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-50 text-xs font-semibold flex items-center space-x-1.5 transition-colors disabled:opacity-50 no-print"
              >
                <Download className="w-4 h-4" />
                <span>{exporting ? 'Exportando...' : 'Exportar CSV'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportFiltered('xlsx')}
                disabled={(pagination.total === 0 && articulos.length === 0) || exporting}
                className="px-3.5 py-2 border border-emerald-200 bg-emerald-50/70 rounded-xl text-emerald-800 hover:bg-emerald-100 text-xs font-semibold flex items-center space-x-1.5 transition-colors disabled:opacity-50 no-print"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Excel (.xlsx)</span>
              </button>
            </>
          )}

          {allowCreate && canCreate && (
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
                    Sede / Campamento: <span className="text-[#F28524] font-extrabold underline decoration-2 underline-offset-2">{toSafeDisplayString(campamentoLabelMap[campamentoFilter] || `Sede #${campamentoFilter}`, '—')}</span>
                  </span>
                )}
                {estado !== 'TODOS' && (
                  <span>
                    Condición Física: <span className="text-[#F28524] font-extrabold underline decoration-2 underline-offset-2">{toSafeDisplayString(estado, '—')}</span>
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
                onClick={() => { setSearch(''); setPagination(p => ({ ...p, page: 1 })); }}
                aria-label="Quitar búsqueda"
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
              <option value="TODOS">
                {facetaCampamentos
                  ? `Todos los Campamentos (${facetaCampamentos.todos})`
                  : (typeof kpis?.totalArticulos === 'number'
                    ? `Todos los Campamentos (${kpis.totalArticulos})`
                    : 'Todos los Campamentos')}
              </option>
              {campamentoSelectOptions.map(opt => {
                const cuenta = facetaCampamentos ? (facetaCampamentos.map[opt.value] ?? 0) : opt.count;
                return (
                  <option key={opt.value} value={opt.value}>
                    {cuenta !== null ? `${opt.nombre} (${cuenta})` : opt.nombre}
                  </option>
                );
              })}
              {campamentoFilter !== 'TODOS' &&
                campamentoFilter !== 'SIN_SEDE' &&
                !campamentoSelectOptions.some(opt => opt.value === campamentoFilter) && (
                  <option value={campamentoFilter}>Sede #{campamentoFilter}</option>
                )}
              {sinSedeOption && (
                <option value="SIN_SEDE">
                  {sinSedeOption.historica
                    ? `${sinSedeOption.nombre} · ${sinSedeOption.historica}`
                    : sinSedeOption.nombre}
                  {(facetaCampamentos ? (facetaCampamentos.map.SIN_SEDE ?? 0) : sinSedeOption.count) !== null
                    ? ` (${facetaCampamentos ? (facetaCampamentos.map.SIN_SEDE ?? 0) : sinSedeOption.count})`
                    : ''}
                </option>
              )}
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
                <option value="INFORMATICA">{formatAreaOpt('Informática', 'INFORMATICA')}</option>
                <option value="OFICINAS">{formatAreaOpt('Oficinas y Mobiliario', 'OFICINAS')}</option>
                <option value="COCINA">{formatAreaOpt('Cocina y Comedor', 'COCINA')}</option>
                <option value="ALMACEN">{formatAreaOpt('Almacén y Herramientas', 'ALMACEN')}</option>
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
                {categoriaOptions.map((c) => (
                  <option key={c.valor} value={c.valor}>{c.total !== null ? `${c.valor} (${c.total})` : c.valor}</option>
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
              {ubicacionFilterOptions.map((ub) => (
                <option key={ub.valor} value={ub.valor}>{ub.total !== null ? `${ub.valor} (${ub.total})` : ub.valor}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick toggles & Clear filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 pt-1 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-4">
            <DateRangeFilter
              value={fechaRango}
              onChange={(r) => { setFechaRango(r); setPagination(p => ({ ...p, page: 1 })); }}
              label="Filtrar por fecha de registro"
              hint="Fecha en que el artículo fue registrado en el sistema."
            />

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

            {hasFiltersWithoutSearch && (
              <button
                onClick={handleClearFilters}
                title="Quita los filtros y conserva el texto de búsqueda"
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

      {/* v2.2: resumen claro de resultados (totales calculados por el backend, no por las filas cargadas) */}
      <div data-testid="resumen-resultados" className="bg-white px-4 py-3 rounded-2xl shadow-sm border border-slate-200/80 text-xs text-slate-600 flex flex-wrap items-center gap-x-5 gap-y-1">
        <span className="font-bold text-slate-900">
          {loading
            ? 'Buscando…'
            : `${Number(pagination.total || 0).toLocaleString('es-DO')} ${pagination.total === 1 ? 'artículo encontrado' : 'artículos encontrados'}${hasActiveFilters ? ' con los filtros activos' : ''}`}
        </span>
        {facetas?.totales && (
          <>
            <span>Total existente en su alcance: <strong className="text-slate-800">{Number(facetas.totales.alcance).toLocaleString('es-DO')}</strong></span>
            {facetas.totales.area !== null && (
              <span>Dentro del área {AREA_LABELS[fixedArea || areaFilter] || fixedArea || areaFilter}: <strong className="text-slate-800">{Number(facetas.totales.area).toLocaleString('es-DO')}</strong></span>
            )}
            {facetas.totales.categoria !== null && (
              <span>Dentro de la categoría {categoria}: <strong className="text-slate-800">{Number(facetas.totales.categoria).toLocaleString('es-DO')}</strong></span>
            )}
          </>
        )}
        <span className="text-[11px] text-slate-400 basis-full">
          Los números entre paréntesis de los desplegables indican cuántos artículos habría al elegir esa opción, manteniendo los demás filtros activos.
        </span>
      </div>

      {/* Main Table Container */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider">
                {[
                  { key: 'codigo_original', label: 'Código' },
                  { key: 'articulo_nombre', label: 'Bien / Descripción' },
                  { key: 'area', label: 'Área / Cat.' },
                  { key: 'marca_modelo', label: 'Marca / Modelo' }
                ].map(col => (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={sortBy === col.key ? (sortOrder === 'ASC' ? 'ascending' : 'descending') : 'none'}
                    className="py-3 px-4"
                  >
                    <button
                      type="button"
                      onClick={() => handleSortColumn(col.key)}
                      className="inline-flex items-center space-x-1 font-bold uppercase tracking-wider hover:text-[#F28524] transition-colors"
                    >
                      <span>{col.label}</span>
                      <span className="text-[10px] font-mono">{sortBy === col.key ? (sortOrder === 'ASC' ? '↑' : '↓') : '↕'}</span>
                    </button>
                  </th>
                ))}
                <th scope="col" className="py-3 px-4">Serie / IMEI</th>
                <th
                  scope="col"
                  aria-sort={sortBy === 'cantidad_num' ? (sortOrder === 'ASC' ? 'ascending' : 'descending') : 'none'}
                  className="py-3 px-4 text-center"
                >
                  <button
                    type="button"
                    onClick={() => handleSortColumn('cantidad_num')}
                    className="inline-flex items-center justify-center space-x-1 font-bold uppercase tracking-wider hover:text-[#F28524] transition-colors"
                  >
                    <span>Cant. Física</span>
                    <span className="text-[10px] font-mono">{sortBy === 'cantidad_num' ? (sortOrder === 'ASC' ? '↑' : '↓') : '↕'}</span>
                  </button>
                </th>
                <th
                  scope="col"
                  aria-sort={sortBy === 'estado_fisico' ? (sortOrder === 'ASC' ? 'ascending' : 'descending') : 'none'}
                  className="py-3 px-4"
                >
                  <button
                    type="button"
                    onClick={() => handleSortColumn('estado_fisico')}
                    className="inline-flex items-center space-x-1 font-bold uppercase tracking-wider hover:text-[#F28524] transition-colors"
                  >
                    <span>Estado</span>
                    <span className="text-[10px] font-mono">{sortBy === 'estado_fisico' ? (sortOrder === 'ASC' ? '↑' : '↓') : '↕'}</span>
                  </button>
                </th>
                <th
                  scope="col"
                  aria-sort={sortBy === 'campamento_id' ? (sortOrder === 'ASC' ? 'ascending' : 'descending') : 'none'}
                  className="py-3 px-4"
                >
                  <button
                    type="button"
                    onClick={() => handleSortColumn('campamento_id')}
                    className="inline-flex items-center space-x-1 font-bold uppercase tracking-wider hover:text-[#F28524] transition-colors"
                  >
                    <span>Sede / Ubicación Excel</span>
                    <span className="text-[10px] font-mono">{sortBy === 'campamento_id' ? (sortOrder === 'ASC' ? '↑' : '↓') : '↕'}</span>
                  </button>
                </th>
                <th scope="col" className="py-3 px-4">Propietario / Custodio</th>
                <th scope="col" className="py-3 px-4">Observaciones del Excel</th>
                <th scope="col" className="py-3 px-4 text-center">Acciones</th>
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
                    <p className="font-semibold text-slate-600">
                      {hasActiveFilters
                        ? 'No se encontraron artículos con los filtros seleccionados'
                        : toSafeDisplayString(defaultEmptyMessage, 'No se encontraron artículos.')}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {hasActiveFilters && facetas?.totales
                        ? `Existen ${Number(facetas.totales.alcance).toLocaleString('es-DO')} artículos en su alcance, pero ninguno cumple TODOS los filtros activos a la vez.`
                        : 'Verifica los filtros seleccionados o limpia la búsqueda.'}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                      {hasFiltersWithoutSearch && (
                        <button
                          onClick={handleClearFilters}
                          className="px-4 py-1.5 bg-[#F28524] text-white rounded-xl text-xs font-bold shadow hover:bg-[#d87019] transition-all inline-flex items-center space-x-1.5"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Limpiar filtros{search.trim() ? ' (conserva su búsqueda)' : ''}</span>
                        </button>
                      )}
                      {search.trim() !== '' && (
                        <button
                          onClick={() => { setSearch(''); setPagination(p => ({ ...p, page: 1 })); }}
                          className="px-4 py-1.5 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all inline-flex items-center space-x-1.5"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Quitar búsqueda</span>
                        </button>
                      )}
                    </div>
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
                          <AgotadoBadge articulo={art} className="ml-2" />
                        </>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300" title="Cantidad vacía o '--' en Excel original; no convertida a 0 ni 1">
                          Pend. verificación {art.cantidad_texto ? `(${toSafeDisplayString(art.cantidad_texto, '')})` : ''}
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
                            {toSafeDisplayString(art.campamento_nombre, `Sede #${art.campamento_id}`)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
                            SIN SEDE VERIFICADA
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1" title={toSafeDisplayString(art.ubicacion_nombre, '')}>
                        Excel: {toSafeDisplayString(art.ubicacion_nombre, 'Sin ubicación')}
                      </div>
                      {art.zona_estante && (
                        <div className="text-[10px] text-slate-400 line-clamp-1 font-mono">
                          Estante: {toSafeDisplayString(art.zona_estante, '')}
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
                        <div className="text-slate-600 line-clamp-2 italic text-[11px] bg-slate-50 p-1.5 rounded border border-slate-100" title={toSafeDisplayString(art.observaciones, '')}>
                          "{toSafeDisplayString(art.observaciones, '')}"
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
    createCampamento,
    activeCampamento,
    campamentosCatalog,
    currentUser
  } = useApp();

  const canOperateCampamentos = userHasPermission(currentUser, 'camp:operar');

  const [formData, setFormData] = useState(() => {
    const initialUbic = activeCampamento?.ubicacion_historica_equivalente || activeCampamento?.nombre || '';
    return {
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
      ubicacion_nombre: initialUbic,
      campamento_id: activeCampamento?.id ? Number(activeCampamento.id) : null,
      zona_estante: '',
      observaciones: ''
    };
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
  const hasTouchedUbicacionRef = useRef(false);

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
          if (ubicRes.success && Array.isArray(ubicRes.ubicaciones)) {
            const mappedUbics = ubicRes.ubicaciones
              .map(u => {
                const resolvedCampId = u.campamento_id
                  ? Number(u.campamento_id)
                  : (String(u.tipo || '').toLowerCase() === 'campamento' && u.id ? Number(u.id) : null);
                const nombre = toSafeDisplayString(u.nombre, '');
                return {
                  label: nombre,
                  value: nombre,
                  sublabel: u.provincia
                    ? `${toSafeDisplayString(u.tipo, 'Sede')} • ${toSafeDisplayString(u.provincia, '')}`
                    : toSafeDisplayString(u.tipo, 'Sede'),
                  campamento_id: resolvedCampId
                };
              })
              .filter(u => u.value && u.value !== '—');

            setUbicaciones(mappedUbics);
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

  // Initialize default ubicacion & sync campamento_id once ubicaciones/catalog load
  useEffect(() => {
    setFormData(prev => {
      let nextUbic = prev.ubicacion_nombre;
      if (!nextUbic && !hasTouchedUbicacionRef.current && ubicaciones.length > 0) {
        nextUbic = ubicaciones[0].value;
      }
      if (!nextUbic) return prev;

      const matchedId = prev.campamento_id ?? resolveCampamentoIdForUbicacion(
        nextUbic,
        ubicaciones,
        campamentosCatalog,
        activeCampamento
      );
      if (nextUbic === prev.ubicacion_nombre && matchedId === prev.campamento_id) {
        return prev;
      }
      return {
        ...prev,
        ubicacion_nombre: nextUbic,
        campamento_id: matchedId
      };
    });
  }, [ubicaciones, campamentosCatalog, activeCampamento]);

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
    if (!canOperateCampamentos) return;
    try {
      const res = await createCampamento({ nombre: newUbicName, provincia: 'República Dominicana' });
      if (res.success) {
        const newCampId = res.campamento?.id ?? res.id ?? null;
        setUbicaciones(prev => [...prev, {
          label: newUbicName,
          value: newUbicName,
          sublabel: 'Nuevo Campamento',
          campamento_id: newCampId ? Number(newCampId) : null
        }]);
        setFormData(prev => ({
          ...prev,
          ubicacion_nombre: newUbicName,
          campamento_id: newCampId ? Number(newCampId) : null
        }));
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
      const resolvedCampId = formData.campamento_id ?? resolveCampamentoIdForUbicacion(
        formData.ubicacion_nombre,
        ubicaciones,
        campamentosCatalog,
        activeCampamento
      );
      const payload = { ...formData };
      if (resolvedCampId) {
        payload.campamento_id = Number(resolvedCampId);
      } else {
        delete payload.campamento_id;
      }

      const res = await createArticulo(payload);
      if (res.success) {
        onCreated();
      } else {
        setErrorMessage(toSafeDisplayString(res.message || res.error, 'Error al guardar el artículo.'));
      }
    } catch (err) {
      setErrorMessage(toSafeDisplayString(err?.message || err, 'Error de comunicación con el servidor.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-crear-activo-title"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden border border-slate-200 flex flex-col">
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-2">
            <Plus className="w-5 h-5 text-[#F28524]" />
            <h3 id="modal-crear-activo-title" className="font-bold text-base">Registrar Nuevo Activo en MySQL</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar modal de registro" className="text-slate-300 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="bg-rose-50 border-b border-rose-200 px-6 py-3 flex items-center space-x-3 text-xs text-rose-800">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span className="font-semibold">{toSafeDisplayString(errorMessage, '')}</span>
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
                onChange={val => {
                  hasTouchedUbicacionRef.current = true;
                  const matchedCampId = resolveCampamentoIdForUbicacion(
                    val,
                    ubicaciones,
                    campamentosCatalog,
                    activeCampamento
                  );
                  setFormData(prev => ({
                    ...prev,
                    ubicacion_nombre: val,
                    campamento_id: matchedCampId
                  }));
                }}
                allowCreate={canOperateCampamentos}
                onCreateNew={canOperateCampamentos ? handleCreateUbicacion : undefined}
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
