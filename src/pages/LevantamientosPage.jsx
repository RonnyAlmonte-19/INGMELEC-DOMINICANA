import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardCheck, Plus, Building2, MapPin, Search, Filter,
  Calendar, CheckCircle2, Clock, AlertCircle, ArrowRight,
  Layers, Package, ShieldCheck, X, RefreshCw, Warehouse
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import LevantamientoWorkspace from '../components/levantamientos/LevantamientoWorkspace';

export default function LevantamientosPage({ navigateTo, pageParams }) {
  const {
    fetchLevantamientos,
    fetchCampamentos,
    createCampamento,
    createAlmacen,
    createLevantamiento,
    currentRole,
    currentUser,
    showToast
  } = useApp();

  // Active view: null (list) or levantamientoId (workspace)
  const [activeLevantamientoId, setActiveLevantamientoId] = useState(() => {
    return pageParams?.id ? parseInt(pageParams.id, 10) : null;
  });

  // Data states
  const [levantamientos, setLevantamientos] = useState([]);
  const [campamentos, setCampamentos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sync workspace with URL query param ?id=...
  useEffect(() => {
    if (pageParams?.id) {
      const parsed = parseInt(pageParams.id, 10);
      if (!isNaN(parsed) && parsed !== activeLevantamientoId) {
        setActiveLevantamientoId(parsed);
      }
    } else if (!pageParams?.id && activeLevantamientoId) {
      setActiveLevantamientoId(null);
    }
  }, [pageParams?.id]);

  const handleOpenWorkspace = (id) => {
    setActiveLevantamientoId(id);
    if (navigateTo) {
      navigateTo('levantamientos', { id });
    }
  };

  const handleCloseWorkspace = () => {
    setActiveLevantamientoId(null);
    if (navigateTo) {
      navigateTo('levantamientos');
    }
    loadData();
  };

  // Filters
  const [estadoFilter, setEstadoFilter] = useState('TODOS');
  const [campamentoFilter, setCampamentoFilter] = useState('TODOS');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showNuevoModal, setShowNuevoModal] = useState(false);
  const [showCampsModal, setShowCampsModal] = useState(false);

  // New Levantamiento Form State
  const [nuevoForm, setNuevoForm] = useState({
    titulo: '',
    campamento_id: '',
    almacen_id: '',
    fecha_inicio: new Date().toISOString().split('T')[0],
    responsable_levantamiento: currentUser?.nombre || '',
    equipo_auditor: '',
    notas: ''
  });
  const [creatingLev, setCreatingLev] = useState(false);

  // New Campamento Form State
  const [nuevoCampForm, setNuevoCampForm] = useState({
    nombre: '',
    codigo: '',
    provincia: '',
    direccion: '',
    responsable: '',
    telefono: '',
    almacen_inicial: 'Almacén Central'
  });
  const [creatingCamp, setCreatingCamp] = useState(false);

  // New Almacen Form State
  const [nuevoAlmForm, setNuevoAlmForm] = useState({
    campamento_id: '',
    nombre: '',
    tipo: 'Principal',
    encargado: '',
    descripcion: ''
  });
  const [creatingAlm, setCreatingAlm] = useState(false);

  // Tab inside Camps modal
  const [campsModalTab, setCampsModalTab] = useState('list'); // 'list' | 'new_camp' | 'new_alm'

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [levRes, campRes] = await Promise.all([
        fetchLevantamientos(),
        fetchCampamentos()
      ]);

      if (levRes.success) {
        setLevantamientos(levRes.levantamientos || []);
      }
      if (campRes.success) {
        setCampamentos(campRes.campamentos || []);
      }
    } catch (err) {
      console.error(err);
      showToast('Error cargando información de levantamientos.', 'error');
    } finally {
      setLoading(false);
    }
  }, [fetchLevantamientos, fetchCampamentos, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // KPIs calculation
  const kpis = useMemo(() => {
    const total = levantamientos.length;
    const enProceso = levantamientos.filter(l => l.estado === 'En proceso').length;
    const enPreparacion = levantamientos.filter(l => l.estado === 'En preparación').length;
    const finalizados = levantamientos.filter(l => l.estado === 'Finalizado').length;
    const totalArticulos = levantamientos.reduce((acc, curr) => acc + (Number(curr.total_items_capturados) || 0), 0);
    const totalCamps = campamentos.length;

    return { total, enProceso, enPreparacion, finalizados, totalArticulos, totalCamps };
  }, [levantamientos, campamentos]);

  // Filtered Levantamientos
  const filteredLevantamientos = useMemo(() => {
    return levantamientos.filter(l => {
      const matchEstado = estadoFilter === 'TODOS' || l.estado === estadoFilter;
      const matchCamp = campamentoFilter === 'TODOS' || String(l.campamento_id) === String(campamentoFilter);
      const query = searchQuery.toLowerCase().trim();
      const matchQuery = !query ||
        (l.titulo && l.titulo.toLowerCase().includes(query)) ||
        (l.codigo_levantamiento && l.codigo_levantamiento.toLowerCase().includes(query)) ||
        (l.campamento_nombre && l.campamento_nombre.toLowerCase().includes(query)) ||
        (l.responsable_levantamiento && l.responsable_levantamiento.toLowerCase().includes(query));

      return matchEstado && matchCamp && matchQuery;
    });
  }, [levantamientos, estadoFilter, campamentoFilter, searchQuery]);

  // Warehouses available for selected camp in new survey form
  const availableWarehouses = useMemo(() => {
    if (!nuevoForm.campamento_id) return [];
    const selected = campamentos.find(c => String(c.id) === String(nuevoForm.campamento_id));
    return selected?.almacenes || [];
  }, [campamentos, nuevoForm.campamento_id]);

  // Handle Create Survey
  const handleCreateLevantamiento = async (e) => {
    e.preventDefault();
    if (!nuevoForm.titulo.trim() || !nuevoForm.campamento_id) {
      showToast('El título y campamento son obligatorios.', 'error');
      return;
    }

    try {
      setCreatingLev(true);
      const res = await createLevantamiento(nuevoForm);
      if (res.success) {
        setShowNuevoModal(false);
        setNuevoForm({
          titulo: '',
          campamento_id: '',
          almacen_id: '',
          fecha_inicio: new Date().toISOString().split('T')[0],
          responsable_levantamiento: currentUser?.nombre || '',
          equipo_auditor: '',
          notas: ''
        });
        await loadData();
        // Open the workspace immediately for fast capture!
        if (res.id) {
          handleOpenWorkspace(res.id);
        }
      }
    } catch (err) {
      showToast('Error al iniciar levantamiento.', 'error');
    } finally {
      setCreatingLev(false);
    }
  };

  // Handle Create Campamento (e.g. San Cristóbal)
  const handleCreateCampamento = async (e) => {
    e.preventDefault();
    if (!nuevoCampForm.nombre.trim()) {
      showToast('El nombre del campamento es obligatorio.', 'error');
      return;
    }

    try {
      setCreatingCamp(true);
      const payload = {
        ...nuevoCampForm,
        almacenes: nuevoCampForm.almacen_inicial ? [nuevoCampForm.almacen_inicial] : ['Almacén Central']
      };
      const res = await createCampamento(payload);
      if (res.success) {
        setNuevoCampForm({
          nombre: '',
          codigo: '',
          provincia: '',
          direccion: '',
          responsable: '',
          telefono: '',
          almacen_inicial: 'Almacén Central'
        });
        setCampsModalTab('list');
        await loadData();
      }
    } catch (err) {
      showToast('Error registrando campamento.', 'error');
    } finally {
      setCreatingCamp(false);
    }
  };

  // Handle Create Almacen
  const handleCreateAlmacen = async (e) => {
    e.preventDefault();
    if (!nuevoAlmForm.campamento_id || !nuevoAlmForm.nombre.trim()) {
      showToast('Seleccione campamento y nombre de almacén.', 'error');
      return;
    }

    try {
      setCreatingAlm(true);
      const res = await createAlmacen(nuevoAlmForm.campamento_id, nuevoAlmForm);
      if (res.success) {
        setNuevoAlmForm({
          campamento_id: '',
          nombre: '',
          tipo: 'Principal',
          encargado: '',
          descripcion: ''
        });
        setCampsModalTab('list');
        await loadData();
      }
    } catch (err) {
      showToast('Error registrando almacén.', 'error');
    } finally {
      setCreatingAlm(false);
    }
  };

  // If user selected a specific survey to work on, render LevantamientoWorkspace
  if (activeLevantamientoId) {
    return (
      <LevantamientoWorkspace
        levantamientoId={activeLevantamientoId}
        onBack={handleCloseWorkspace}
        onConsolidated={handleCloseWorkspace}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Title & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <ClipboardCheck className="w-6 h-6 text-[#F28524]" />
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Levantamientos Físicos y Auditorías
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Gestión de inventarios físicos en campo, campamentos operativos y auditorías de control de activos.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2.5 flex-wrap">
          <button
            onClick={() => {
              setCampsModalTab('list');
              setShowCampsModal(true);
            }}
            className="inline-flex items-center space-x-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
          >
            <Building2 className="w-4 h-4 text-slate-600" />
            <span>Campamentos y Almacenes</span>
          </button>

          {['admin', 'supervisor', 'almacen', 'auditor', 'developer'].includes(currentRole) && (
            <button
              onClick={() => setShowNuevoModal(true)}
              className="inline-flex items-center space-x-2 px-4 py-2.5 bg-[#F28524] hover:bg-[#d9731b] text-white text-xs font-bold rounded-xl shadow-lg shadow-[#F28524]/25 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Levantamiento</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Sesiones</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{kpis.total}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">auditorías creadas</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/20 shadow-sm">
          <div className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">En Proceso</div>
          <div className="text-2xl font-black text-blue-700 mt-1">{kpis.enProceso}</div>
          <div className="text-[10px] text-blue-600 mt-0.5">captura activa</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-sm">
          <div className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">En Preparación</div>
          <div className="text-2xl font-black text-amber-700 mt-1">{kpis.enPreparacion}</div>
          <div className="text-[10px] text-amber-600 mt-0.5">previo a inicio</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-sm">
          <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Finalizados</div>
          <div className="text-2xl font-black text-emerald-700 mt-1">{kpis.finalizados}</div>
          <div className="text-[10px] text-emerald-600 mt-0.5">consolidados en MySQL</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Bienes Levantados</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{kpis.totalArticulos}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">artículos contados</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-bold text-[#F28524] uppercase tracking-wider">Campamentos</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{kpis.totalCamps}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">sedes operativas</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por código, título, campamento..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F28524]"
          />
        </div>

        {/* Dropdowns */}
        <div className="flex items-center space-x-2.5 w-full md:w-auto overflow-x-auto">
          {/* Campamento Filter */}
          <div className="flex items-center space-x-1.5 text-xs">
            <span className="font-bold text-slate-500 whitespace-nowrap">Campamento:</span>
            <select
              value={campamentoFilter}
              onChange={(e) => setCampamentoFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F28524]"
            >
              <option value="TODOS">Todos los Campamentos</option>
              {campamentos.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>

          {/* Estado Filter */}
          <div className="flex items-center space-x-1.5 text-xs">
            <span className="font-bold text-slate-500 whitespace-nowrap">Estado:</span>
            <select
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F28524]"
            >
              <option value="TODOS">Todos los Estados</option>
              <option value="En proceso">En proceso</option>
              <option value="En preparación">En preparación</option>
              <option value="Pendiente de revisión">Pendiente de revisión</option>
              <option value="Finalizado">Finalizado</option>
            </select>
          </div>
        </div>
      </div>

      {/* Levantamientos Cards & Table List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <RefreshCw className="w-8 h-8 text-[#F28524] animate-spin" />
          <p className="text-xs font-semibold text-slate-500">Cargando levantamientos...</p>
        </div>
      ) : filteredLevantamientos.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center max-w-md mx-auto">
          <ClipboardCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800">No hay levantamientos registrados</h3>
          <p className="text-xs text-slate-500 mt-1 mb-5">
            {searchQuery || estadoFilter !== 'TODOS' || campamentoFilter !== 'TODOS'
              ? 'No se encontraron resultados con los filtros aplicados.'
              : 'Comience creando una nueva sesión de auditoría para su campamento o almacén.'}
          </p>
          {['admin', 'supervisor', 'almacen', 'auditor', 'developer'].includes(currentRole) && (
            <button
              onClick={() => setShowNuevoModal(true)}
              className="px-4 py-2 bg-[#F28524] text-white text-xs font-bold rounded-xl hover:bg-[#d9731b]"
            >
              Iniciar Primer Levantamiento
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLevantamientos.map(lev => {
            const isDone = lev.estado === 'Finalizado';
            return (
              <div
                key={lev.id}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[11px] font-black text-[#F28524] bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                      {lev.codigo_levantamiento}
                    </span>
                    <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                      isDone
                        ? 'bg-emerald-100 text-emerald-800'
                        : lev.estado === 'En proceso'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {lev.estado}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 text-sm line-clamp-2">
                    {lev.titulo}
                  </h3>

                  <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center space-x-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-medium text-slate-800">{lev.campamento_nombre || 'N/A'}</span>
                      {lev.almacen_nombre && <span className="text-slate-400">({lev.almacen_nombre})</span>}
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                      <span>Auditor: <strong className="text-slate-700">{lev.responsable_levantamiento}</strong></span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>Inicio: {new Date(lev.fecha_inicio).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Artículos</span>
                    <div className="text-base font-black text-slate-900">
                      {lev.total_items_capturados || 0}
                    </div>
                  </div>

                  <button
                    onClick={() => handleOpenWorkspace(lev.id)}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-slate-900 hover:bg-[#F28524] text-white text-xs font-bold rounded-xl transition-all shadow-sm"
                  >
                    <span>{isDone ? 'Ver Auditoría' : 'Entrar a Captura'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: NUEVO LEVANTAMIENTO */}
      {showNuevoModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <ClipboardCheck className="w-5 h-5 text-[#F28524]" />
                <h3 className="text-sm font-bold text-slate-900">Iniciar Nuevo Levantamiento Físico</h3>
              </div>
              <button onClick={() => setShowNuevoModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateLevantamiento} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Título de la Auditoría <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={nuevoForm.titulo}
                  onChange={(e) => setNuevoForm({ ...nuevoForm, titulo: e.target.value })}
                  placeholder="Ej: Levantamiento Físico Campamento San Cristóbal 2026"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-[#F28524]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Campamento <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={nuevoForm.campamento_id}
                    onChange={(e) => setNuevoForm({ ...nuevoForm, campamento_id: e.target.value, almacen_id: '' })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-[#F28524]"
                  >
                    <option value="">-- Seleccione Campamento --</option>
                    {campamentos.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Almacén / Bodega (Opcional)
                  </label>
                  <select
                    value={nuevoForm.almacen_id}
                    onChange={(e) => setNuevoForm({ ...nuevoForm, almacen_id: e.target.value })}
                    disabled={!nuevoForm.campamento_id}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-[#F28524] disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="">General / Todos los almacenes</option>
                    {availableWarehouses.map(a => (
                      <option key={a.id} value={a.id}>{a.nombre} ({a.tipo})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Responsable del Levantamiento <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={nuevoForm.responsable_levantamiento}
                    onChange={(e) => setNuevoForm({ ...nuevoForm, responsable_levantamiento: e.target.value })}
                    placeholder="Nombre del auditor principal"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-[#F28524]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Equipo Auditor / Acompañantes
                  </label>
                  <input
                    type="text"
                    value={nuevoForm.equipo_auditor}
                    onChange={(e) => setNuevoForm({ ...nuevoForm, equipo_auditor: e.target.value })}
                    placeholder="Ej: Ing. M. Castillo, Téc. R. Pérez"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-[#F28524]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Notas u Objetivos del Levantamiento
                </label>
                <textarea
                  rows="2"
                  value={nuevoForm.notas}
                  onChange={(e) => setNuevoForm({ ...nuevoForm, notas: e.target.value })}
                  placeholder="Detalles sobre las áreas a inspeccionar, contingencias o alcance..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-[#F28524]"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNuevoModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingLev}
                  className="px-4 py-2 bg-[#F28524] text-white text-xs font-bold rounded-xl hover:bg-[#d9731b] shadow-md shadow-[#F28524]/20"
                >
                  {creatingLev ? 'Iniciando...' : 'Iniciar Levantamiento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: GESTIONAR CAMPAMENTOS Y ALMACENES */}
      {showCampsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-[#F28524]" />
                <h3 className="text-sm font-bold text-slate-900">Gestión de Campamentos y Almacenes</h3>
              </div>
              <button onClick={() => setShowCampsModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sub-tabs */}
            <div className="flex items-center space-x-2 border-b border-slate-100 pb-2 text-xs">
              <button
                onClick={() => setCampsModalTab('list')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  campsModalTab === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Campamentos ({campamentos.length})
              </button>
              <button
                onClick={() => setCampsModalTab('new_camp')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  campsModalTab === 'new_camp' ? 'bg-[#F28524] text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                + Registrar Campamento
              </button>
              <button
                onClick={() => setCampsModalTab('new_alm')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  campsModalTab === 'new_alm' ? 'bg-[#F28524] text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                + Añadir Almacén
              </button>
            </div>

            {/* TAB CONTENT: LIST */}
            {campsModalTab === 'list' && (
              <div className="overflow-y-auto flex-1 space-y-3 pr-1 text-xs">
                {campamentos.map(camp => (
                  <div key={camp.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-black text-slate-900 text-sm flex items-center space-x-2">
                        <span>{camp.nombre}</span>
                        <span className="font-mono text-[10px] text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                          {camp.codigo}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        {camp.almacenes?.length || 0} almacén(es)
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 grid grid-cols-2 gap-2">
                      <div>Provincia: <strong>{camp.provincia || 'N/A'}</strong></div>
                      <div>Responsable: <strong>{camp.responsable || 'No asignado'}</strong></div>
                    </div>

                    {camp.almacenes && camp.almacenes.length > 0 && (
                      <div className="pt-2 border-t border-slate-200/60">
                        <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">Almacenes / Bodegas:</div>
                        <div className="flex flex-wrap gap-1.5">
                          {camp.almacenes.map(alm => (
                            <span key={alm.id} className="px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-medium text-slate-700">
                              {alm.nombre} <span className="text-slate-400 text-[10px]">({alm.tipo})</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* TAB CONTENT: NEW CAMP */}
            {campsModalTab === 'new_camp' && (
              <form onSubmit={handleCreateCampamento} className="space-y-3 text-xs overflow-y-auto flex-1 pr-1">
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">Nombre del Campamento *</label>
                    <input
                      type="text"
                      required
                      value={nuevoCampForm.nombre}
                      onChange={(e) => setNuevoCampForm({ ...nuevoCampForm, nombre: e.target.value })}
                      placeholder="Ej: SAN CRISTÓBAL"
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Código (Opcional)</label>
                    <input
                      type="text"
                      value={nuevoCampForm.codigo}
                      onChange={(e) => setNuevoCampForm({ ...nuevoCampForm, codigo: e.target.value })}
                      placeholder="Ej: SC"
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-mono uppercase"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Provincia</label>
                    <input
                      type="text"
                      value={nuevoCampForm.provincia}
                      onChange={(e) => setNuevoCampForm({ ...nuevoCampForm, provincia: e.target.value })}
                      placeholder="Ej: San Cristóbal"
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Almacén Inicial</label>
                    <input
                      type="text"
                      value={nuevoCampForm.almacen_inicial}
                      onChange={(e) => setNuevoCampForm({ ...nuevoCampForm, almacen_inicial: e.target.value })}
                      placeholder="Ej: Almacén Central San Cristóbal"
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Responsable</label>
                    <input
                      type="text"
                      value={nuevoCampForm.responsable}
                      onChange={(e) => setNuevoCampForm({ ...nuevoCampForm, responsable: e.target.value })}
                      placeholder="Encargado de sede"
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Teléfono</label>
                    <input
                      type="text"
                      value={nuevoCampForm.telefono}
                      onChange={(e) => setNuevoCampForm({ ...nuevoCampForm, telefono: e.target.value })}
                      placeholder="809-xxx-xxxx"
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Dirección / Ubicación Física</label>
                  <input
                    type="text"
                    value={nuevoCampForm.direccion}
                    onChange={(e) => setNuevoCampForm({ ...nuevoCampForm, direccion: e.target.value })}
                    placeholder="Carretera Sánchez, Nave 3..."
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setCampsModalTab('list')}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                  >
                    Volver
                  </button>
                  <button
                    type="submit"
                    disabled={creatingCamp}
                    className="px-4 py-2 bg-[#F28524] text-white rounded-xl font-bold hover:bg-[#d9731b]"
                  >
                    {creatingCamp ? 'Guardando...' : 'Crear Campamento'}
                  </button>
                </div>
              </form>
            )}

            {/* TAB CONTENT: NEW ALMACEN */}
            {campsModalTab === 'new_alm' && (
              <form onSubmit={handleCreateAlmacen} className="space-y-3 text-xs overflow-y-auto flex-1 pr-1">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Campamento Perteneciente *</label>
                  <select
                    required
                    value={nuevoAlmForm.campamento_id}
                    onChange={(e) => setNuevoAlmForm({ ...nuevoAlmForm, campamento_id: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                  >
                    <option value="">-- Seleccionar Campamento --</option>
                    {campamentos.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Nombre del Almacén / Bodega *</label>
                    <input
                      type="text"
                      required
                      value={nuevoAlmForm.nombre}
                      onChange={(e) => setNuevoAlmForm({ ...nuevoAlmForm, nombre: e.target.value })}
                      placeholder="Ej: Bodega B - Herramientas Pesadas"
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Tipo</label>
                    <select
                      value={nuevoAlmForm.tipo}
                      onChange={(e) => setNuevoAlmForm({ ...nuevoAlmForm, tipo: e.target.value })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                    >
                      <option value="Principal">Principal</option>
                      <option value="Secundario">Secundario</option>
                      <option value="Contenedor">Contenedor / Móvil</option>
                      <option value="Taller">Taller / Reparaciones</option>
                      <option value="Patio">Patio Exterior</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Encargado</label>
                  <input
                    type="text"
                    value={nuevoAlmForm.encargado}
                    onChange={(e) => setNuevoAlmForm({ ...nuevoAlmForm, encargado: e.target.value })}
                    placeholder="Nombre del bodeguero o custodio"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Descripción</label>
                  <input
                    type="text"
                    value={nuevoAlmForm.descripcion}
                    onChange={(e) => setNuevoAlmForm({ ...nuevoAlmForm, descripcion: e.target.value })}
                    placeholder="Detalles sobre este espacio físico"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setCampsModalTab('list')}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                  >
                    Volver
                  </button>
                  <button
                    type="submit"
                    disabled={creatingAlm}
                    className="px-4 py-2 bg-[#F28524] text-white rounded-xl font-bold hover:bg-[#d9731b]"
                  >
                    {creatingAlm ? 'Guardando...' : 'Guardar Almacén'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
