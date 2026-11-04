import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ArrowLeft, Plus, Save, Trash2, Edit3, Search, UploadCloud,
  CheckCircle2, AlertTriangle, FileSpreadsheet, Eye, X,
  RotateCcw, Sparkles, ShieldAlert, Check, RefreshCw
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import SearchableSelect from '../common/SearchableSelect';
import * as XLSX from 'xlsx';

const ESTADOS_FISICOS = ['Bueno', 'Regular', 'Dañado', 'Fuera de servicio', 'Pendiente de verificación'];
const AREAS = ['ALMACEN', 'INFORMATICA', 'OFICINAS', 'COCINA', 'OTRA'];
const UNIDADES = ['Unidad', 'Juego', 'Par', 'Metro', 'Rollo', 'Caja', 'Pieza', 'Kit', 'Litro'];

export default function LevantamientoWorkspace({ levantamientoId, onBack, onConsolidated }) {
  const {
    getLevantamientoById,
    updateLevantamiento,
    fetchLevantamientoItems,
    addLevantamientoItem,
    updateLevantamientoItem,
    deleteLevantamientoItem,
    importLevantamientoItems,
    consolidarLevantamiento,
    fetchArticulos,
    fetchCategorias,
    createCategoria,
    fetchCustodios,
    createCustodio,
    currentRole,
    currentUser,
    showToast
  } = useApp();

  // Session data
  const [levantamiento, setLevantamiento] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resumen, setResumen] = useState({ areas: [], estados: [] });

  // Filter & Search in live table
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAreaTab, setSelectedAreaTab] = useState('TODAS');

  // Fast Capture Form State
  const initialFormState = {
    area: 'ALMACEN',
    articulo_nombre: '',
    categoria: '',
    marca: '',
    modelo_caracteristicas: '',
    serie_imei: '',
    cantidad: 1,
    unidad_medida: 'Unidad',
    estado_fisico: 'Bueno',
    propietario: 'INGMELEC',
    responsable_custodio: '',
    ubicacion_exacta: '',
    observaciones: '',
    codigo_original: ''
  };

  const [formData, setFormData] = useState(initialFormState);
  const [keepStickyFields, setKeepStickyFields] = useState(true);
  const [savingItem, setSavingItem] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null);

  // Existing Master Catalog Search for Autocomplete
  const [masterSearchQuery, setMasterSearchQuery] = useState('');
  const [masterSearchResults, setMasterSearchResults] = useState([]);
  const [isSearchingMaster, setIsSearchingMaster] = useState(false);
  const [showMasterDropdown, setShowMasterDropdown] = useState(false);

  // Edit item modal state
  const [editingItem, setEditingItem] = useState(null);
  const [editFormData, setEditFormData] = useState({});

  // Delete item modal state
  const [deletingItem, setDeletingItem] = useState(null);

  // Excel Import modal state
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [excelSheets, setExcelSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [parsedWorkbook, setParsedWorkbook] = useState(null);
  const [previewItems, setPreviewItems] = useState([]);
  const [importingExcel, setImportingExcel] = useState(false);

  // Consolidation modal state
  const [showConsolidarModal, setShowConsolidarModal] = useState(false);
  const [confirmConsolidarChecked, setConfirmConsolidarChecked] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [duplicadosDetectados, setDuplicadosDetectados] = useState(null);
  const [autorizarReubicacion, setAutorizarReubicacion] = useState(false);
  const [autorizarCambioCustodio, setAutorizarCambioCustodio] = useState(false);
  const [autorizarCambioEstado, setAutorizarCambioEstado] = useState(false);

  // Refs for keyboard focus
  const nombreInputRef = useRef(null);

  // Dynamic Catalogs State
  const [categorias, setCategorias] = useState([]);
  const [loadingCategorias, setLoadingCategorias] = useState(false);
  const [custodios, setCustodios] = useState([]);
  const [loadingCustodios, setLoadingCustodios] = useState(false);

  // Load Categories on area change
  useEffect(() => {
    let isCancelled = false;
    setLoadingCategorias(true);
    fetchCategorias(formData.area).then(res => {
      if (!isCancelled && res.success) {
        setCategorias(res.categorias || []);
      }
    }).catch(console.error).finally(() => {
      if (!isCancelled) setLoadingCategorias(false);
    });
    return () => { isCancelled = true; };
  }, [formData.area, fetchCategorias]);

  // Load Custodios on mount
  useEffect(() => {
    let isCancelled = false;
    setLoadingCustodios(true);
    fetchCustodios().then(res => {
      if (!isCancelled && res.success && res.custodios) {
        setCustodios(res.custodios.map(c => ({
          label: c.nombre,
          value: c.nombre,
          sublabel: c.cargo || c.departamento || null
        })));
      }
    }).catch(console.error).finally(() => {
      if (!isCancelled) setLoadingCustodios(false);
    });
    return () => { isCancelled = true; };
  }, [fetchCustodios]);

  // Load session and items
  const loadSession = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getLevantamientoById(levantamientoId);
      if (res.success) {
        setLevantamiento(res.levantamiento);
        setResumen(res.resumen || { areas: [], estados: [] });
      }

      const itemsRes = await fetchLevantamientoItems(levantamientoId);
      if (itemsRes.success) {
        setItems(itemsRes.items || []);
      }
    } catch (err) {
      showToast('Error cargando levantamiento.', 'error');
    } finally {
      setLoading(false);
    }
  }, [levantamientoId, getLevantamientoById, fetchLevantamientoItems, showToast]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Master articles search with debouncing
  useEffect(() => {
    if (!masterSearchQuery || masterSearchQuery.trim().length < 2) {
      setMasterSearchResults([]);
      setShowMasterDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearchingMaster(true);
        const res = await fetchArticulos({ search: masterSearchQuery, limit: 6 });
        if (res.success && res.articulos) {
          setMasterSearchResults(res.articulos);
          setShowMasterDropdown(true);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearchingMaster(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [masterSearchQuery, fetchArticulos]);

  // Check duplicate serial/IMEI locally against currently loaded items
  const checkDuplicateSerial = (serial) => {
    if (!serial || !serial.trim()) {
      setDuplicateWarning(null);
      return;
    }
    const clean = serial.trim().toLowerCase();
    const found = items.find(it => it.serie_imei && it.serie_imei.trim().toLowerCase() === clean);
    if (found) {
      setDuplicateWarning({
        tipo: 'LOCAL_SESSION',
        mensaje: `¡Atención! La serie/IMEI "${serial}" ya fue registrada en este levantamiento para "${found.articulo_nombre}".`
      });
    } else {
      setDuplicateWarning(null);
    }
  };

  // Select item from master autocomplete to prefill form
  const handleSelectMaster = (art) => {
    setFormData(prev => ({
      ...prev,
      articulo_nombre: art.articulo_nombre || '',
      categoria: art.categoria || prev.categoria,
      marca: art.marca || prev.marca,
      modelo_caracteristicas: art.modelo_caracteristicas || prev.modelo_caracteristicas,
      area: art.area ? art.area.toUpperCase() : prev.area,
      unidad_medida: art.unidad_medida || prev.unidad_medida,
      propietario: art.propietario || prev.propietario,
      responsable_custodio: art.responsable_custodio || prev.responsable_custodio
    }));
    setMasterSearchQuery('');
    setShowMasterDropdown(false);
    showToast(`Datos precargados desde "${art.articulo_nombre}"`, 'info');
    if (nombreInputRef.current) {
      nombreInputRef.current.focus();
    }
  };

  // Submit item handler
  const handleSaveItem = async (e, addAnother = true) => {
    if (e) e.preventDefault();

    if (!formData.articulo_nombre.trim()) {
      showToast('El nombre o descripción del artículo es obligatorio.', 'error');
      if (nombreInputRef.current) nombreInputRef.current.focus();
      return;
    }

    try {
      setSavingItem(true);
      const res = await addLevantamientoItem(levantamientoId, formData);

      if (res.success) {
        // Refresh items list
        const itemsRes = await fetchLevantamientoItems(levantamientoId);
        if (itemsRes.success) {
          setItems(itemsRes.items || []);
        }

        // Keep sticky fields if requested
        if (keepStickyFields) {
          setFormData(prev => ({
            ...initialFormState,
            area: prev.area,
            responsable_custodio: prev.responsable_custodio,
            ubicacion_exacta: prev.ubicacion_exacta,
            propietario: prev.propietario,
            estado_fisico: prev.estado_fisico
          }));
        } else {
          setFormData(initialFormState);
        }

        setDuplicateWarning(null);

        // Keep focus on nombre input for fast laptop typing
        if (addAnother && nombreInputRef.current) {
          nombreInputRef.current.focus();
        }
      }
    } catch (err) {
      showToast('Error al registrar el artículo.', 'error');
    } finally {
      setSavingItem(false);
    }
  };

  // Keyboard shortcut: Ctrl + Enter to submit and add another
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSaveItem(null, true);
    }
  };

  // Edit item action
  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setEditFormData({ ...item });
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    try {
      const res = await updateLevantamientoItem(levantamientoId, editingItem.id, editFormData);
      if (res.success) {
        setItems(prev => prev.map(it => it.id === editingItem.id ? { ...it, ...editFormData } : it));
        setEditingItem(null);
      }
    } catch (err) {
      showToast('Error actualizando artículo.', 'error');
    }
  };

  // Delete item action
  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    try {
      const res = await deleteLevantamientoItem(levantamientoId, deletingItem.id);
      if (res.success) {
        setItems(prev => prev.filter(it => it.id !== deletingItem.id));
        setDeletingItem(null);
      }
    } catch (err) {
      showToast('Error eliminando artículo.', 'error');
    }
  };

  // Excel File Upload & Client Parsing
  const handleExcelFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        setParsedWorkbook(wb);
        setExcelSheets(wb.SheetNames);
        if (wb.SheetNames.length > 0) {
          // Select first sheet or sheet matching current area
          const matchAreaSheet = wb.SheetNames.find(s => s.toUpperCase() === formData.area) || wb.SheetNames[0];
          setSelectedSheet(matchAreaSheet);
          parseSheetRows(wb, matchAreaSheet);
        }
      } catch (err) {
        showToast('Error leyendo el archivo Excel.', 'error');
      }
    };
    reader.readAsBinaryString(file);
  };

  const parseSheetRows = (wb, sheetName) => {
    const ws = wb.Sheets[sheetName];
    if (!ws) return;

    const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!rawRows || rawRows.length === 0) {
      setPreviewItems([]);
      return;
    }

    // Auto-detect and normalize columns
    const normalized = rawRows.map(row => {
      const getVal = (patterns) => {
        for (const k of Object.keys(row)) {
          const lower = k.toLowerCase().trim();
          if (patterns.some(p => lower.includes(p))) {
            return String(row[k] || '').trim();
          }
        }
        return '';
      };

      const nombre = getVal(['articulo', 'artículo', 'descripcion', 'descripción', 'nombre', 'equipo', 'bien']);
      const codigo = getVal(['codigo', 'código', 'cod', 'id']);
      const marca = getVal(['marca', 'fabricante']);
      const modelo = getVal(['modelo', 'caracteristicas', 'especificaciones']);
      const serie = getVal(['serie', 'serial', 'imei']);
      const cantidad = parseInt(getVal(['cantidad', 'cant', 'qty']) || '1', 10) || 1;
      const estado = getVal(['estado', 'condicion', 'condición']) || 'Bueno';
      const responsable = getVal(['responsable', 'custodio', 'asignado', 'tecnico']);
      const ubicacion = getVal(['ubicacion', 'ubicación', 'lugar', 'deposito', 'estante']);
      const obs = getVal(['observacion', 'observaciones', 'nota', 'comentario']);

      let cleanArea = sheetName.toUpperCase();
      if (!AREAS.includes(cleanArea)) {
        cleanArea = 'ALMACEN';
      }

      return {
        area: cleanArea,
        codigo_original: codigo,
        articulo_nombre: nombre || 'Sin descripción',
        marca,
        modelo_caracteristicas: modelo,
        serie_imei: serie,
        cantidad,
        unidad_medida: 'Unidad',
        estado_fisico: estado,
        propietario: 'INGMELEC',
        responsable_custodio: responsable,
        ubicacion_exacta: ubicacion,
        observaciones: obs
      };
    }).filter(it => it.articulo_nombre && it.articulo_nombre !== 'Sin descripción');

    setPreviewItems(normalized);
  };

  const handleExecuteImportExcel = async () => {
    if (!previewItems || previewItems.length === 0) {
      showToast('No hay artículos válidos para importar.', 'error');
      return;
    }

    try {
      setImportingExcel(true);
      const res = await importLevantamientoItems(levantamientoId, previewItems);
      if (res.success) {
        setShowExcelModal(false);
        setPreviewItems([]);
        setParsedWorkbook(null);
        await loadSession();
      }
    } catch (err) {
      showToast('Error al importar archivo.', 'error');
    } finally {
      setImportingExcel(false);
    }
  };

  // Consolidation Action
  const handleExecuteConsolidar = async (strategy = null) => {
    if (!confirmConsolidarChecked) {
      showToast('Debe marcar la casilla de confirmación para proceder.', 'error');
      return;
    }

    try {
      setConsolidating(true);
      const payload = strategy ? {
        resolucion_duplicados: strategy,
        autorizar_reubicacion: autorizarReubicacion,
        autorizar_cambio_custodio: autorizarCambioCustodio,
        autorizar_cambio_estado: autorizarCambioEstado
      } : {};
      const res = await consolidarLevantamiento(levantamientoId, payload);
      if (res.success) {
        setShowConsolidarModal(false);
        setDuplicadosDetectados(null);
        await loadSession();
        if (onConsolidated) onConsolidated();
      } else if (res.bloqueado_por_duplicados) {
        setDuplicadosDetectados(res.duplicados || []);
      }
    } catch (err) {
      showToast('Error al consolidar levantamiento.', 'error');
    } finally {
      setConsolidating(false);
    }
  };

  // Change Session Status
  const handleChangeStatus = async (newStatus) => {
    try {
      const res = await updateLevantamiento(levantamientoId, { estado: newStatus });
      if (res.success) {
        setLevantamiento(prev => ({ ...prev, estado: newStatus }));
      }
    } catch (e) {
      showToast('Error cambiando estado.', 'error');
    }
  };

  // Filtered items list
  const filteredItems = useMemo(() => {
    return items.filter(it => {
      const matchArea = selectedAreaTab === 'TODAS' || it.area === selectedAreaTab;
      const matchSearch = !searchTerm ||
        (it.articulo_nombre && it.articulo_nombre.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (it.marca && it.marca.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (it.serie_imei && it.serie_imei.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (it.codigo_original && it.codigo_original.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (it.responsable_custodio && it.responsable_custodio.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchArea && matchSearch;
    });
  }, [items, selectedAreaTab, searchTerm]);

  // Calculate live stats
  const stats = useMemo(() => {
    const total = items.length;
    const areasCount = {};
    const estadosCount = {};
    items.forEach(it => {
      const a = it.area || 'OTRA';
      areasCount[a] = (areasCount[a] || 0) + (Number(it.cantidad) || 1);
      const e = it.estado_fisico || 'BUENO';
      estadosCount[e] = (estadosCount[e] || 0) + (Number(it.cantidad) || 1);
    });
    return { total, areasCount, estadosCount };
  }, [items]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <RefreshCw className="w-8 h-8 text-[#F28524] animate-spin" />
        <p className="text-sm font-semibold text-slate-500">Cargando sesión de levantamiento...</p>
      </div>
    );
  }

  if (!levantamiento) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center max-w-lg mx-auto mt-12">
        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-800">Levantamiento no encontrado</h3>
        <p className="text-sm text-slate-500 mt-1 mb-6">No se pudo cargar la información de esta auditoría.</p>
        <button
          onClick={onBack}
          className="px-5 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800"
        >
          Volver a Levantamientos
        </button>
      </div>
    );
  }

  const isFinalizado = levantamiento.estado === 'Finalizado';

  return (
    <div className="space-y-6 pb-16">
      {/* Top Bar with Navigation & Actions */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-start sm:items-center space-x-3.5">
          <button
            onClick={onBack}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            title="Volver al listado"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center space-x-2.5 flex-wrap">
              <span className="font-mono text-xs font-black text-[#F28524] bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-200">
                {levantamiento.codigo_levantamiento}
              </span>
              <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                {levantamiento.titulo}
              </h1>
              <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full ${
                isFinalizado
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : levantamiento.estado === 'En proceso'
                  ? 'bg-blue-100 text-blue-800 border border-blue-300'
                  : 'bg-amber-100 text-amber-800 border border-amber-300'
              }`}>
                {levantamiento.estado}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center space-x-3 flex-wrap">
              <span>Campamento: <strong className="text-slate-700">{levantamiento.campamento_nombre || 'N/A'}</strong></span>
              <span>•</span>
              <span>Almacén: <strong className="text-slate-700">{levantamiento.almacen_nombre || 'General'}</strong></span>
              <span>•</span>
              <span>Responsable: <strong className="text-slate-700">{levantamiento.responsable_levantamiento}</strong></span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2.5 flex-wrap">
          {/* Status Select */}
          {!isFinalizado && (
            <select
              value={levantamiento.estado}
              onChange={(e) => handleChangeStatus(e.target.value)}
              className="text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F28524]"
            >
              <option value="En preparación">Estado: En preparación</option>
              <option value="En proceso">Estado: En proceso</option>
              <option value="Pendiente de revisión">Estado: Pendiente de revisión</option>
            </select>
          )}

          {/* Import Excel */}
          {!isFinalizado && (
            <button
              onClick={() => setShowExcelModal(true)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold rounded-xl transition-all"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Importar Excel</span>
            </button>
          )}

          {/* Consolidate Button */}
          {!isFinalizado && ['admin', 'supervisor', 'almacen', 'developer'].includes(currentRole) && (
            <button
              onClick={() => {
                setConfirmConsolidarChecked(false);
                setShowConsolidarModal(true);
              }}
              disabled={items.length === 0}
              className={`inline-flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-xl transition-all shadow-md ${
                items.length > 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Consolidar e Incorporar ({items.length})</span>
            </button>
          )}

          {isFinalizado && (
            <div className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl">
              <Check className="w-4 h-4" />
              <span>Consolidado en Inventario Maestro</span>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards / Progress Tracker */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Capturado</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{stats.total}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">ítems registrados</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold text-amber-500 uppercase tracking-wider">Almacén</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{stats.areasCount['ALMACEN'] || 0}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">herramientas / equipos</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold text-blue-500 uppercase tracking-wider">Informática</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{stats.areasCount['INFORMATICA'] || 0}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">tecnología / telecom</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold text-purple-500 uppercase tracking-wider">Oficinas</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{stats.areasCount['OFICINAS'] || 0}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">mobiliario / enseres</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold text-rose-500 uppercase tracking-wider">Cocina / Otra</div>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {(stats.areasCount['COCINA'] || 0) + (stats.areasCount['OTRA'] || 0)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">electro / comedor</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Condición Óptima</div>
          <div className="text-2xl font-black text-emerald-600 mt-1">
            {stats.estadosCount['BUENO'] || 0}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">en estado bueno</div>
        </div>
      </div>

      {/* Main Workspace Layout: Fast Capture Form & Live Session Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (5 cols): Fast Capture Form for Laptop Typing */}
        {!isFinalizado ? (
          <div className="lg:col-span-5 bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[#F28524]" />
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Captura Rápida de Campo
                </h2>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                Tab: Navegar | Ctrl+Enter: Guardar
              </span>
            </div>

            {/* Quick Master Catalog Search / Autocomplete Box */}
            <div className="relative mb-4">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Autocompletar desde Inventario Maestro (Opcional):
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={masterSearchQuery}
                  onChange={(e) => setMasterSearchQuery(e.target.value)}
                  placeholder="Escriba ej: Taladro, Laptop Dell, Multímetro..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F28524]"
                />
                {isSearchingMaster && (
                  <RefreshCw className="w-3.5 h-3.5 text-[#F28524] animate-spin absolute right-3 top-2.5" />
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {showMasterDropdown && masterSearchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto">
                  <div className="p-1.5 text-[10px] font-bold text-slate-400 uppercase bg-slate-50 border-b border-slate-100">
                    Artículos existentes encontrados
                  </div>
                  {masterSearchResults.map(art => (
                    <button
                      key={art.id}
                      type="button"
                      onClick={() => handleSelectMaster(art)}
                      className="w-full text-left p-2 hover:bg-orange-50 border-b border-slate-100 last:border-0 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-800">{art.articulo_nombre}</div>
                        <div className="text-[10px] text-slate-500">
                          {art.categoria} • {art.marca || 'S/M'} {art.modelo_caracteristicas ? `(${art.modelo_caracteristicas})` : ''}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                        {art.codigo_interno}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Duplicate warning notification */}
            {duplicateWarning && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-start space-x-2 text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>{duplicateWarning.mensaje}</span>
              </div>
            )}

            {/* Form Fields */}
            <form onSubmit={(e) => handleSaveItem(e, true)} onKeyDown={handleKeyDown} className="space-y-3 flex-1 flex flex-col justify-between">
              <div className="space-y-3">
                {/* Area & Código Original */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Área <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formData.area}
                      onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F28524]"
                    >
                      {AREAS.map(a => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Código / Placa Física
                    </label>
                    <input
                      type="text"
                      value={formData.codigo_original}
                      onChange={(e) => setFormData({ ...formData, codigo_original: e.target.value })}
                      placeholder="Ej: ACT-0042 o Nº placa"
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F28524]"
                    />
                  </div>
                </div>

                {/* Nombre / Descripción (Primary field) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Descripción del Artículo <span className="text-rose-500">*</span>
                  </label>
                  <input
                    ref={nombreInputRef}
                    type="text"
                    required
                    value={formData.articulo_nombre}
                    onChange={(e) => setFormData({ ...formData, articulo_nombre: e.target.value })}
                    placeholder="Ej: Taladro Percutor Inalámbrico 20V"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-[#F28524] shadow-sm"
                  />
                </div>

                {/* Categoría & Marca */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <SearchableSelect
                      label="Categoría"
                      placeholder="Ej: Herramientas..."
                      options={categorias}
                      value={formData.categoria}
                      onChange={(val) => setFormData(p => ({ ...p, categoria: val }))}
                      allowCreate={true}
                      onCreateNew={async (newCat) => {
                        const res = await createCategoria({ area: formData.area, nombre: newCat });
                        if (res.success) {
                          setCategorias(prev => [...prev, newCat]);
                          setFormData(p => ({ ...p, categoria: newCat }));
                        }
                      }}
                      loading={loadingCategorias}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Marca
                    </label>
                    <input
                      type="text"
                      value={formData.marca}
                      onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                      placeholder="Ej: DeWalt, Bosch, Dell"
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F28524]"
                    />
                  </div>
                </div>

                {/* Modelo & Serie/IMEI */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Modelo / Características
                    </label>
                    <input
                      type="text"
                      value={formData.modelo_caracteristicas}
                      onChange={(e) => setFormData({ ...formData, modelo_caracteristicas: e.target.value })}
                      placeholder="Ej: DCD791B / 1/2 pulgada"
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F28524]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Serie / IMEI
                    </label>
                    <input
                      type="text"
                      value={formData.serie_imei}
                      onChange={(e) => {
                        setFormData({ ...formData, serie_imei: e.target.value });
                        checkDuplicateSerial(e.target.value);
                      }}
                      placeholder="N/S o IMEI"
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-[#F28524]"
                    />
                  </div>
                </div>

                {/* Cantidad, Unidad & Estado Físico */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Cantidad
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.cantidad}
                      onChange={(e) => setFormData({ ...formData, cantidad: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-[#F28524]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Unidad
                    </label>
                    <select
                      value={formData.unidad_medida}
                      onChange={(e) => setFormData({ ...formData, unidad_medida: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F28524]"
                    >
                      {UNIDADES.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Estado
                    </label>
                    <select
                      value={formData.estado_fisico}
                      onChange={(e) => setFormData({ ...formData, estado_fisico: e.target.value })}
                      className={`w-full px-2 py-1.5 text-xs font-bold rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#F28524] ${
                        formData.estado_fisico === 'BUENO' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
                        formData.estado_fisico === 'REGULAR' ? 'bg-amber-50 text-amber-800 border-amber-300' :
                        formData.estado_fisico === 'DAÑADO' ? 'bg-rose-50 text-rose-800 border-rose-300' :
                        'bg-slate-50 text-slate-800 border-slate-300'
                      }`}
                    >
                      {ESTADOS_FISICOS.map(st => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Responsable & Ubicación Exacta */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <SearchableSelect
                      label="Responsable / Custodio"
                      placeholder="Ej: Juan Pérez..."
                      options={custodios}
                      value={formData.responsable_custodio}
                      onChange={(val) => setFormData(p => ({ ...p, responsable_custodio: val }))}
                      allowCreate={true}
                      onCreateNew={async (newCust) => {
                        const res = await createCustodio({ nombre: newCust, cargo: 'Personal de Campo' });
                        if (res.success) {
                          setCustodios(prev => [...prev, { label: newCust, value: newCust, sublabel: 'Personal de Campo' }]);
                          setFormData(p => ({ ...p, responsable_custodio: newCust }));
                        }
                      }}
                      loading={loadingCustodios}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Ubicación Exacta
                    </label>
                    <input
                      type="text"
                      value={formData.ubicacion_exacta}
                      onChange={(e) => setFormData({ ...formData, ubicacion_exacta: e.target.value })}
                      placeholder="Ej: Estante B-3, Contenedor"
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F28524]"
                    />
                  </div>
                </div>

                {/* Observaciones */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Observaciones y Comentarios
                  </label>
                  <input
                    type="text"
                    value={formData.observaciones}
                    onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                    placeholder="Ej: Con estuche y cargador original, sin rayones"
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F28524]"
                  />
                </div>
              </div>

              {/* Sticky Settings & Submit Buttons */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <label className="flex items-center space-x-2 text-xs text-slate-600 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={keepStickyFields}
                    onChange={(e) => setKeepStickyFields(e.target.checked)}
                    className="rounded text-[#F28524] focus:ring-[#F28524] h-4 w-4"
                  />
                  <span>Mantener Área, Custodio y Ubicación para el siguiente artículo</span>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="submit"
                    disabled={savingItem}
                    className="w-full py-2.5 px-3 bg-[#F28524] hover:bg-[#d9731b] text-white text-xs font-black rounded-xl shadow-md shadow-[#F28524]/20 flex items-center justify-center space-x-1.5 transition-all"
                  >
                    <Save className="w-4 h-4" />
                    <span>{savingItem ? 'Guardando...' : 'Guardar y Otro (Ctrl+↵)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleSaveItem(e, false)}
                    disabled={savingItem}
                    className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-900 text-white text-xs font-black rounded-xl transition-all flex items-center justify-center space-x-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Guardar y Terminar</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        ) : (
          <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-emerald-200 shadow-sm flex flex-col justify-center items-center text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h3 className="text-base font-black text-slate-900">Auditoría Finalizada y Consolidada</h3>
            <p className="text-xs text-slate-500 max-w-sm">
              Esta sesión de levantamiento físico ha sido consolidada exitosamente en el inventario maestro de INGMELEC. Los registros ya no se pueden modificar.
            </p>
          </div>
        )}

        {/* Right Column (7 cols): Live Table of Captured Items */}
        <div className={`${isFinalizado ? 'lg:col-span-12' : 'lg:col-span-7'} bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col`}>
          {/* Header of Table */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 mb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Artículos Levantados en Sesión ({filteredItems.length})
              </h2>
              <p className="text-[11px] text-slate-500">
                Visualice, filtre y audite los artículos antes de la consolidación final.
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar artículo, serie, responsable..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F28524]"
              />
            </div>
          </div>

          {/* Area Filter Tabs */}
          <div className="flex items-center space-x-1 overflow-x-auto pb-2 mb-3 text-xs border-b border-slate-100">
            <button
              onClick={() => setSelectedAreaTab('TODAS')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap ${
                selectedAreaTab === 'TODAS'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Todas ({items.length})
            </button>
            {AREAS.map(ar => {
              const count = items.filter(it => it.area === ar).length;
              return (
                <button
                  key={ar}
                  onClick={() => setSelectedAreaTab(ar)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap ${
                    selectedAreaTab === ar
                      ? 'bg-[#F28524] text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {ar} ({count})
                </button>
              );
            })}
          </div>

          {/* Live Table */}
          <div className="overflow-x-auto flex-1 max-h-[560px]">
            {filteredItems.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <FileSpreadsheet className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-xs font-semibold">No hay artículos registrados para esta selección.</p>
                <p className="text-[10px] mt-1">Utilice el formulario de la izquierda o importe un archivo Excel.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] uppercase font-bold text-slate-500">
                    <th className="py-2.5 px-3">Artículo / Descripción</th>
                    <th className="py-2.5 px-2">Área</th>
                    <th className="py-2.5 px-2">Serie / IMEI</th>
                    <th className="py-2.5 px-2 text-center">Cant</th>
                    <th className="py-2.5 px-2">Estado</th>
                    <th className="py-2.5 px-2">Responsable / Ubicación</th>
                    {!isFinalizado && <th className="py-2.5 px-2 text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-800">{item.articulo_nombre}</div>
                        <div className="text-[10px] text-slate-400 flex items-center space-x-2">
                          {item.marca && <span>{item.marca}</span>}
                          {item.modelo_caracteristicas && <span>• {item.modelo_caracteristicas}</span>}
                          {item.codigo_original && <span className="font-mono text-slate-500 bg-slate-100 px-1 rounded">{item.codigo_original}</span>}
                        </div>
                      </td>
                      <td className="py-2.5 px-2">
                        <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                          {item.area}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 font-mono text-[11px] text-slate-600">
                        {item.serie_imei || <span className="text-slate-300 italic">S/N</span>}
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold text-slate-800">
                        {item.cantidad}
                      </td>
                      <td className="py-2.5 px-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          item.estado_fisico === 'BUENO' ? 'bg-emerald-100 text-emerald-800' :
                          item.estado_fisico === 'REGULAR' ? 'bg-amber-100 text-amber-800' :
                          item.estado_fisico === 'DAÑADO' ? 'bg-rose-100 text-rose-800' :
                          'bg-slate-100 text-slate-800'
                        }`}>
                          {item.estado_fisico}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-[11px] text-slate-600">
                        <div className="font-medium truncate max-w-[140px]">{item.responsable_custodio || 'N/A'}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[140px]">{item.ubicacion_exacta || 'Sin especificar'}</div>
                      </td>
                      {!isFinalizado && (
                        <td className="py-2.5 px-2 text-right">
                          <div className="flex items-center justify-end space-x-1">
                            <button
                              onClick={() => handleOpenEdit(item)}
                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                              title="Editar artículo"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeletingItem(item)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                              title="Eliminar artículo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: EDIT ITEM */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Editar Artículo del Levantamiento</h3>
              <button onClick={() => setEditingItem(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nombre / Descripción</label>
                <input
                  type="text"
                  value={editFormData.articulo_nombre || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, articulo_nombre: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Área</label>
                  <select
                    value={editFormData.area || 'ALMACEN'}
                    onChange={(e) => setEditFormData({ ...editFormData, area: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl"
                  >
                    {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Estado Físico</label>
                  <select
                    value={editFormData.estado_fisico || 'BUENO'}
                    onChange={(e) => setEditFormData({ ...editFormData, estado_fisico: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl"
                  >
                    {ESTADOS_FISICOS.map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Marca</label>
                  <input
                    type="text"
                    value={editFormData.marca || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, marca: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Serie / IMEI</label>
                  <input
                    type="text"
                    value={editFormData.serie_imei || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, serie_imei: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    value={editFormData.cantidad || 1}
                    onChange={(e) => setEditFormData({ ...editFormData, cantidad: parseInt(e.target.value) || 1 })}
                    className="w-full p-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Responsable</label>
                  <input
                    type="text"
                    value={editFormData.responsable_custodio || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, responsable_custodio: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Observaciones</label>
                <input
                  type="text"
                  value={editFormData.observaciones || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, observaciones: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-[#F28524] text-white text-xs font-bold rounded-xl hover:bg-[#d9731b]"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONFIRMATION */}
      {deletingItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">¿Eliminar este artículo?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Se eliminará "<strong>{deletingItem.articulo_nombre}</strong>" de esta sesión de levantamiento.
              </p>
            </div>
            <div className="flex space-x-2 pt-2">
              <button
                onClick={() => setDeletingItem(null)}
                className="flex-1 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 py-2 bg-rose-600 text-white text-xs font-bold rounded-xl hover:bg-rose-700"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EXCEL IMPORT */}
      {showExcelModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">Importar Artículos desde Archivo Excel</h3>
              </div>
              <button onClick={() => setShowExcelModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <p className="text-slate-500">
                Seleccione un libro Excel (.xlsx, .xls) o CSV con el formato del levantamiento físico (soporta hojas de Informática, Oficinas, Almacén, Cocina).
              </p>

              {/* File Input */}
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50 cursor-pointer">
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleExcelFileUpload}
                  className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#F28524] file:text-white hover:file:bg-[#d9731b]"
                />
              </div>

              {/* Sheet Selector */}
              {excelSheets.length > 0 && (
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-slate-700">Hoja a importar:</span>
                  <select
                    value={selectedSheet}
                    onChange={(e) => {
                      setSelectedSheet(e.target.value);
                      if (parsedWorkbook) parseSheetRows(parsedWorkbook, e.target.value);
                    }}
                    className="p-1.5 border border-slate-300 rounded-lg text-xs"
                  >
                    {excelSheets.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <span className="text-slate-400">({previewItems.length} filas detectadas)</span>
                </div>
              )}

              {/* Preview Table */}
              {previewItems.length > 0 && (
                <div className="border border-slate-200 rounded-xl max-h-48 overflow-y-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 font-bold text-slate-600">
                      <tr>
                        <th className="p-2">Artículo</th>
                        <th className="p-2">Área</th>
                        <th className="p-2">Serie</th>
                        <th className="p-2">Cant</th>
                        <th className="p-2">Estado</th>
                        <th className="p-2">Responsable</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewItems.slice(0, 50).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2 font-medium">{row.articulo_nombre}</td>
                          <td className="p-2">{row.area}</td>
                          <td className="p-2 font-mono">{row.serie_imei || '—'}</td>
                          <td className="p-2">{row.cantidad}</td>
                          <td className="p-2">{row.estado_fisico}</td>
                          <td className="p-2">{row.responsable_custodio || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {previewItems.length > 50 && (
                    <div className="p-2 text-center text-[10px] text-slate-400 bg-slate-50 border-t border-slate-100">
                      Mostrando las primeras 50 filas de {previewItems.length} en total.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowExcelModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200"
              >
                Cancelar
              </button>
              <button
                onClick={handleExecuteImportExcel}
                disabled={previewItems.length === 0 || importingExcel}
                className={`px-4 py-2 text-white text-xs font-bold rounded-xl ${
                  previewItems.length > 0 && !importingExcel
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-slate-300 cursor-not-allowed'
                }`}
              >
                {importingExcel ? 'Importando...' : `Importar ${previewItems.length} Artículos`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONSOLIDATION CONFIRMATION */}
      {showConsolidarModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-slate-900">
                Consolidar Auditoría e Incorporar al Inventario Maestro
              </h3>
              <p className="text-xs text-slate-500 mt-2">
                Esta operación incorporará formalmente todos los <strong>{items.length} artículos</strong> levantados en la tabla maestra <code>inv_articulos</code> y generará los correspondientes movimientos de auditoría de entrada.
              </p>
            </div>

            {/* Impact Details Box */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5 text-slate-700">
              <div className="font-bold text-slate-900">Impacto de la Consolidación:</div>
              <div>• Artículos a incorporar: <strong>{items.length}</strong></div>
              <div>• Campamento destino: <strong>{levantamiento.campamento_nombre}</strong></div>
              <div>• Estado de la sesión: Pasará a <strong>Finalizado</strong></div>
              <div>• Movimientos generados: <strong>ENTRADA / LEVANTAMIENTO_INICIAL</strong></div>
            </div>

            {/* Duplicates Warning Box if duplicate serials detected */}
            {duplicadosDetectados && duplicadosDetectados.length > 0 && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-300 text-xs space-y-2 text-amber-900">
                <div className="flex items-center space-x-1.5 font-bold text-amber-950">
                  <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span>Aviso de Seriales Preexistentes ({duplicadosDetectados.length})</span>
                </div>
                <p className="text-[11px] text-amber-800">
                  Se detectaron artículos con número de serie/IMEI que ya figuran activos en el inventario maestro:
                </p>
                <div className="max-h-24 overflow-y-auto space-y-1 pr-1 font-mono text-[10px]">
                  {duplicadosDetectados.map((d, idx) => (
                    <div key={idx} className="bg-white/80 p-1.5 rounded border border-amber-200">
                      <strong>{d.serie_imei}</strong> — {d.articulo_nombre} ({d.ubicacion_actual || d.ubicacion_nombre})
                    </div>
                  ))}
                </div>
                <p className="text-[11px] font-semibold text-amber-950 bg-amber-100/70 p-1.5 rounded">
                  🛡️ <strong>Regla Enterprise:</strong> No se crearán activos maestros duplicados. Vincule el activo existente o marque omitir. Para proteger la trazabilidad, las actualizaciones de sede, custodio o estado sólo se aplicarán si las autoriza explícitamente abajo.
                </p>

                {/* Explicit Authorization Switches for Master Updates */}
                <div className="bg-white/90 p-2.5 rounded-lg border border-amber-200 space-y-1.5 text-[11px] text-slate-800">
                  <div className="font-bold text-amber-950 text-xs">Autorizaciones de Actualización del Activo Maestro:</div>
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autorizarReubicacion}
                      onChange={(e) => setAutorizarReubicacion(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <span>Reubicar activo a la sede del levantamiento ({levantamiento?.campamento_nombre || 'Sede actual'})</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autorizarCambioCustodio}
                      onChange={(e) => setAutorizarCambioCustodio(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <span>Actualizar custodio con el responsable capturado en campo</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autorizarCambioEstado}
                      onChange={(e) => setAutorizarCambioEstado(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <span>Actualizar condición física con la observada en auditoría</span>
                  </label>
                  <div className="text-[10px] text-slate-500 italic">
                    * Si no marca estas opciones, el activo conservará su sede, custodio y estado originales de forma intacta.
                  </div>
                </div>
              </div>
            )}

            {/* Explicit Confirmation Checkbox */}
            <label className="flex items-start space-x-2 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmConsolidarChecked}
                onChange={(e) => setConfirmConsolidarChecked(e.target.checked)}
                className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                He verificado los registros y autorizo la consolidación de estos artículos.
              </span>
            </label>

            <div className="space-y-2 pt-2">
              {duplicadosDetectados && duplicadosDetectados.length > 0 ? (
                <div className="space-y-2">
                  <button
                    onClick={() => handleExecuteConsolidar('VINCULAR_EXISTENTE')}
                    disabled={!confirmConsolidarChecked || consolidating}
                    className={`w-full py-2.5 text-white text-xs font-bold rounded-xl transition-all shadow-md ${
                      confirmConsolidarChecked && !consolidating
                        ? 'bg-[#F28524] hover:bg-[#d9731b] shadow-orange-500/20'
                        : 'bg-slate-300 cursor-not-allowed'
                    }`}
                  >
                    {consolidating ? 'Procesando...' : 'Vincular y Reubicar Activos Existentes (Recomendado)'}
                  </button>
                  <button
                    onClick={() => handleExecuteConsolidar('OMITIR_DUPLICADOS')}
                    disabled={!confirmConsolidarChecked || consolidating}
                    className={`w-full py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-all ${
                      !confirmConsolidarChecked || consolidating ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    Omitir Artículos Duplicados
                  </button>
                  <button
                    onClick={() => {
                      setShowConsolidarModal(false);
                      setDuplicadosDetectados(null);
                    }}
                    className="w-full py-2 bg-slate-100 text-slate-600 text-xs font-semibold rounded-xl hover:bg-slate-200"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      setShowConsolidarModal(false);
                      setDuplicadosDetectados(null);
                    }}
                    className="flex-1 py-2.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleExecuteConsolidar()}
                    disabled={!confirmConsolidarChecked || consolidating}
                    className={`flex-1 py-2.5 text-white text-xs font-bold rounded-xl ${
                      confirmConsolidarChecked && !consolidating
                        ? 'bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20'
                        : 'bg-slate-300 cursor-not-allowed'
                    }`}
                  >
                    {consolidating ? 'Consolidando...' : 'Confirmar Consolidación'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
