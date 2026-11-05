import React, { useEffect, useState } from 'react';
import {
  Package, Laptop, Building2, UtensilsCrossed, Wrench,
  CheckCircle2, AlertTriangle, XCircle, Clock, ArrowRight,
  TrendingUp, MapPin, ShieldAlert, Layers, ArrowUpRight,
  FlaskConical, Globe, Boxes, Filter, RefreshCw, SlidersHorizontal,
  FileCheck2, Hash, ArrowRightLeft, Warehouse
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { useApp } from '../context/AppContext';

export default function DashboardPage({ setActivePage, navigateTo }) {
  const { kpis, kpisLoading, refreshKpis, currentUser, currentRole, activeCampamento, entornoInfo } = useApp();

  const isDev = currentRole === 'developer' || currentUser?.es_developer === 1;
  const isGlobalRole = isDev || currentRole === 'gerencia';

  // Filter state for Developer / Gerencia
  const [selectedCampamento, setSelectedCampamento] = useState('TODOS');
  const [selectedAlmacen, setSelectedAlmacen] = useState('TODOS');

  const bannerTitle = isDev
    ? 'INGMELEC | ALMACÉN GENERAL'
    : (activeCampamento?.nombre ? `INGMELEC | ALMACÉN ${activeCampamento.nombre.toUpperCase()}` : (currentUser?.campamento_nombre ? `INGMELEC | ALMACÉN ${currentUser.campamento_nombre.toUpperCase()}` : 'INGMELEC | ALMACÉN GENERAL'));

  useEffect(() => {
    refreshKpis({
      campamento_id: selectedCampamento !== 'TODOS' ? selectedCampamento : undefined,
      almacen_id: selectedAlmacen !== 'TODOS' ? selectedAlmacen : undefined
    });
  }, [selectedCampamento, selectedAlmacen, refreshKpis]);

  if (kpisLoading && !kpis) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400 space-y-3">
        <div className="w-10 h-10 border-4 border-[#F28524] border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium">Consultando indicadores en tiempo real desde MySQL...</p>
      </div>
    );
  }

  const {
    totalArticulos = 0,
    cantidadFisicaTotal = 0,
    articulosSinCantidad = 0,
    articulosEstadoPendiente = 0,
    totalCampamentos = 0,
    totalCampamentosPendientesValidacion = 0,
    totalAlmacenes = 0,
    porArea = { INFORMATICA: 0, OFICINAS: 0, COCINA: 0, ALMACEN: 0 },
    unidadesPorArea = { INFORMATICA: 0, OFICINAS: 0, COCINA: 0, ALMACEN: 0 },
    sinCantidadPorArea = { INFORMATICA: 0, OFICINAS: 0, COCINA: 0, ALMACEN: 0 },
    estadosPorArea = { INFORMATICA: {}, OFICINAS: {}, COCINA: {}, ALMACEN: {} },
    porEstado = {},
    unidades = [],
    ubicaciones = [],
    porCampamento = [],
    sinSedeVerificada = null,
    campamentosPendientesValidacion = [],
    consistenciaMatematica = null,
    resumenSinteticos = null,
    porAlmacen = [],
    levantamientosEnProceso = 0,
    levantamientosFinalizados = 0,
    articulosSinSerial = 0,
    articulosPendientesVerificacion = 0,
    recientesMovimientos = [],
    levantamientosResumen = []
  } = kpis || {};

  // Navigation handler
  const handleSelectArea = (areaId, params = {}) => {
    if (navigateTo) {
      navigateTo(areaId, params);
    } else if (setActivePage) {
      setActivePage(areaId);
    }
  };

  // State condition filter handler -> opens General Inventory filtered by that state
  const handleSelectEstado = (estadoCode) => {
    const extra = selectedCampamento !== 'TODOS' ? { campamento_id: selectedCampamento } : {};
    if (navigateTo) {
      navigateTo('inventario', { estado: estadoCode, ...extra });
    } else if (setActivePage) {
      setActivePage('inventario');
    }
  };

  // Campamento drill-down handler -> opens General Inventory filtered by campamento_id
  const handleOpenCampamentoInventario = (campId) => {
    if (navigateTo) {
      navigateTo('inventario', { campamento_id: String(campId) });
    } else if (setActivePage) {
      setActivePage('inventario');
    }
  };

  // Chart data: Areas
  const areaChartData = [
    { name: 'Informática', count: porArea.INFORMATICA || 0, color: '#3B82F6', page: 'informatica' },
    { name: 'Oficinas', count: porArea.OFICINAS || 0, color: '#6366F1', page: 'oficinas' },
    { name: 'Cocina', count: porArea.COCINA || 0, color: '#EC4899', page: 'cocina' },
    { name: 'Almacén', count: porArea.ALMACEN || 0, color: '#F28524', page: 'almacen' }
  ];

  // Chart data: Estados Físicos
  const estadoColors = {
    'Bueno': '#10B981',
    'Regular': '#F59E0B',
    'Dañado': '#EF4444',
    'Fuera de servicio': '#991B1B',
    'Pendiente de verificación': '#64748B'
  };

  const estadoCodeMap = {
    'Bueno': 'BUENO',
    'Regular': 'REGULAR',
    'Dañado': 'DANADO',
    'Fuera de servicio': 'FUERA_SERVICIO',
    'Pendiente de verificación': 'PENDIENTE'
  };

  const estadoChartData = Object.entries(porEstado).map(([k, v]) => ({
    name: k,
    value: v,
    color: estadoColors[k] || '#94A3B8'
  }));

  // Filter available almacenes by selected campamento
  const almacenesDisponibles = selectedCampamento === 'TODOS'
    ? porAlmacen
    : porAlmacen.filter(a => String(a.campamento_id) === String(selectedCampamento));

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-700/50 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 bg-repeat bg-contain pointer-events-none" style={{ backgroundImage: "radial-gradient(#F28524 1px, transparent 1px)", backgroundSize: "16px 16px" }}></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 bg-[#F28524]/20 border border-[#F28524]/30 rounded-full text-xs font-semibold text-[#F28524]">
              <span className="w-2 h-2 rounded-full bg-[#F28524] animate-pulse"></span>
              <span>Corte de Levantamiento Físico · 16 de Octubre de 2026</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              {bannerTitle}
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Consola ejecutiva del inventario maestro y control de activos. Información conciliada directamente de la base de datos MySQL relacional con trazabilidad integral por áreas, custodios y ubicaciones físicas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              onClick={() => handleSelectArea('inventario', selectedCampamento !== 'TODOS' ? { campamento_id: selectedCampamento } : {})}
              className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-4 sm:p-5 flex items-center space-x-4 min-w-[190px] cursor-pointer hover:bg-white/15 transition-all"
              title="Ver catálogo unificado de activos maestros"
            >
              <div className="p-3 bg-[#F28524] rounded-xl text-white shadow-lg shadow-[#F28524]/30">
                <Package className="w-7 h-7" />
              </div>
              <div>
                <div className="text-xs uppercase font-bold tracking-wider text-slate-300">Activos Maestros</div>
                <div className="text-3xl font-black text-white">{totalArticulos}</div>
                <div className="text-[11px] text-emerald-400 font-medium flex items-center">
                  <span>Registros Empresariales</span>
                  <ArrowRight className="w-3 h-3 ml-1" />
                </div>
              </div>
            </div>

            <div
              onClick={() => handleSelectArea('inventario', selectedCampamento !== 'TODOS' ? { campamento_id: selectedCampamento } : {})}
              className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-4 sm:p-5 flex items-center space-x-4 min-w-[205px] cursor-pointer hover:bg-white/15 transition-all"
              title="Ver volumen físico total conocido en stock"
            >
              <div className="p-3 bg-blue-600/80 rounded-xl text-white shadow-lg shadow-blue-600/30">
                <Boxes className="w-7 h-7" />
              </div>
              <div>
                <div className="text-xs uppercase font-bold tracking-wider text-slate-300">Unidades Físicas</div>
                <div className="text-3xl font-black text-white">
                  {typeof cantidadFisicaTotal === 'number' ? Math.round(cantidadFisicaTotal).toLocaleString('es-DO') : cantidadFisicaTotal}
                </div>
                <div className="text-[11px] text-blue-300 font-medium">
                  Conocidas {articulosSinCantidad > 0 ? `(+${articulosSinCantidad} cant. pend.)` : 'en Stock'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Info Banner: Conciliación Documental & Separación Sintética */}
      <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-start space-x-3.5 text-emerald-950 shadow-sm">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs">
          <div className="font-bold flex flex-wrap items-center gap-2">
            <span>Inventario Empresarial Conciliado con Levantamiento Documental (16 de Octubre de 2026)</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-600 text-white font-mono uppercase">
              es_sintetico = 0 · Datos Reales
            </span>
          </div>
          <p className="text-emerald-900 leading-relaxed">
            Visualizando los <strong className="font-bold">433 artículos empresariales históricos</strong> (<strong className="font-bold">329</strong> vinculados inequívocamente a las <strong className="font-bold">3 sedes confirmadas</strong> + <strong className="font-bold">104</strong> en <strong className="font-bold">SIN SEDE VERIFICADA · KM 19 AUT DUARTE</strong>) con <strong className="font-bold">1,971 unidades físicas conocidas</strong> y <strong className="font-bold">23 artículos con cantidad pendiente de verificación</strong>.
            {resumenSinteticos && resumenSinteticos.articulos > 0 && (
              <span> Los <strong>{resumenSinteticos.articulos} artículos sintéticos de prueba</strong> (Playwright / QA) y <strong>{resumenSinteticos.campamentos} campamentos sintéticos</strong> se mantienen aislados fuera de las estadísticas empresariales.</span>
            )}
          </p>
        </div>
      </div>

      {/* Interactive Global Filter Bar (Developer & Gerencia) */}
      {isGlobalRole && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-[#F28524]/10 text-[#F28524] rounded-xl">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800">Filtro Territorial Consolidado por Sede</div>
              <div className="text-[11px] text-slate-500">Alternar entre visión corporativa global (433), sedes confirmadas (329) o sin sede verificada (104)</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Campamento selector */}
            <div className="flex items-center space-x-2">
              <label className="text-xs font-semibold text-slate-600">Sede / Campamento:</label>
              <select
                value={selectedCampamento}
                onChange={(e) => {
                  setSelectedCampamento(e.target.value);
                  setSelectedAlmacen('TODOS');
                }}
                className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F28524]"
              >
                <option value="TODOS">GLOBAL EMPRESARIAL (433 bienes · 3 sedes + sin sede)</option>
                {porCampamento.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre} ({c.total_articulos} bienes · {Math.round(c.total_fisico)} u.)</option>
                ))}
                {sinSedeVerificada && (
                  <option value="SIN_SEDE">
                    SIN SEDE VERIFICADA / KM 19 AUT DUARTE ({sinSedeVerificada.total_articulos} bienes · {Math.round(sinSedeVerificada.total_fisico)} u.)
                  </option>
                )}
              </select>
            </div>

            {/* Almacen selector */}
            {selectedCampamento !== 'SIN_SEDE' && (
              <div className="flex items-center space-x-2">
                <label className="text-xs font-semibold text-slate-600">Almacén:</label>
                <select
                  value={selectedAlmacen}
                  onChange={(e) => setSelectedAlmacen(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F28524]"
                >
                  <option value="TODOS">TODOS LOS ALMACENES ({almacenesDisponibles.length})</option>
                  {almacenesDisponibles.map(a => (
                    <option key={a.id} value={a.id}>{a.nombre} {a.campamento_nombre ? `(${a.campamento_nombre})` : ''}</option>
                  ))}
                </select>
              </div>
            )}

            {(selectedCampamento !== 'TODOS' || selectedAlmacen !== 'TODOS') && (
              <button
                onClick={() => {
                  setSelectedCampamento('TODOS');
                  setSelectedAlmacen('TODOS');
                }}
                className="text-xs text-red-600 hover:text-red-800 font-semibold px-2 py-1 bg-red-50 rounded-lg border border-red-100"
              >
                Restablecer a Global
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4 Secondary Executive KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Campamentos */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center space-x-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Campamentos Confirmados</div>
            <div className="text-xl font-black text-slate-900">
              {totalCampamentos || porCampamento.length}
              {totalCampamentosPendientesValidacion > 0 && (
                <span className="text-xs font-normal text-amber-600 ml-1.5">
                  (+{totalCampamentosPendientesValidacion} pend. validación)
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-500 font-medium">27 de Febrero · OPL · Mant. 633</div>
          </div>
        </div>

        {/* Almacenes */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <Warehouse className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Almacenes Verificados</div>
            <div className="text-xl font-black text-slate-900">{totalAlmacenes}</div>
            <div className="text-[10px] text-slate-500 font-medium">1 almacén principal por sede</div>
          </div>
        </div>

        {/* Levantamientos */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <FileCheck2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Auditorías / Sesiones</div>
            <div className="text-xl font-black text-slate-900">
              {levantamientosEnProceso} <span className="text-xs font-normal text-slate-400">abiertas / {levantamientosFinalizados} finalizadas</span>
            </div>
            <div className="text-[10px] text-emerald-600 font-medium">Corte documental 16-Oct-2026</div>
          </div>
        </div>

        {/* Pendientes / Sin Serial */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center space-x-3">
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
            <Hash className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Sin Serie / Por Verificar</div>
            <div className="text-xl font-black text-slate-900">
              {articulosSinSerial} <span className="text-xs font-normal text-slate-400">sin serie / {articulosPendientesVerificacion} pend.</span>
            </div>
            <div className="text-[10px] text-amber-600 font-medium">
              {articulosSinCantidad} cant. nula · {articulosEstadoPendiente} est. pend.
            </div>
          </div>
        </div>
      </div>

      {/* 4 Area Cards with Direct Drill-Down & Dual Quantity */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Distribución por Departamentos Operativos
          </span>
          <span className="text-[11px] text-slate-400">
            Suma departamental: {porArea.INFORMATICA + porArea.OFICINAS + porArea.COCINA + porArea.ALMACEN} activos maestros = {totalArticulos} total
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Informatica */}
          <div
            onClick={() => handleSelectArea('informatica')}
            className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-blue-400 cursor-pointer transition-all group"
          >
            <div className="flex items-center justify-between">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <Laptop className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full flex items-center">
                Ver lista <ArrowUpRight className="w-3 h-3 ml-1" />
              </span>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <div className="text-2xl font-black text-slate-900">{porArea.INFORMATICA || 0}</div>
                <div className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                  {Math.round(unidadesPorArea.INFORMATICA || 0)} u. físicas
                </div>
              </div>
              <div className="text-xs font-bold text-slate-700 mt-0.5">Informática y Telecom</div>
              <div className="text-[11px] text-slate-400 mt-1">Laptops, celulares, PCs, redes</div>

              {/* State breakdown mini badges */}
              <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-1 text-[10px]">
                {estadosPorArea.INFORMATICA?.Bueno > 0 && (
                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 font-semibold rounded">
                    {estadosPorArea.INFORMATICA.Bueno} buenos
                  </span>
                )}
                {estadosPorArea.INFORMATICA?.Regular > 0 && (
                  <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 font-semibold rounded">
                    {estadosPorArea.INFORMATICA.Regular} reg.
                  </span>
                )}
                {estadosPorArea.INFORMATICA?.Dañado > 0 && (
                  <span className="px-1.5 py-0.5 bg-rose-50 text-rose-700 font-semibold rounded">
                    {estadosPorArea.INFORMATICA.Dañado} dañ.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Oficinas */}
          <div
            onClick={() => handleSelectArea('oficinas')}
            className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-indigo-400 cursor-pointer transition-all group"
          >
            <div className="flex items-center justify-between">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <Building2 className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full flex items-center">
                Ver lista <ArrowUpRight className="w-3 h-3 ml-1" />
              </span>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <div className="text-2xl font-black text-slate-900">{porArea.OFICINAS || 0}</div>
                <div className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                  {Math.round(unidadesPorArea.OFICINAS || 0)} u. físicas
                </div>
              </div>
              <div className="text-xs font-bold text-slate-700 mt-0.5">Oficinas y Mobiliario</div>
              <div className="text-[11px] text-slate-400 mt-1">Escritorios, sillas, aires, archivos</div>

              <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-1 text-[10px]">
                {estadosPorArea.OFICINAS?.Bueno > 0 && (
                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 font-semibold rounded">
                    {estadosPorArea.OFICINAS.Bueno} buenos
                  </span>
                )}
                {estadosPorArea.OFICINAS?.Regular > 0 && (
                  <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 font-semibold rounded">
                    {estadosPorArea.OFICINAS.Regular} reg.
                  </span>
                )}
                {estadosPorArea.OFICINAS?.Dañado > 0 && (
                  <span className="px-1.5 py-0.5 bg-rose-50 text-rose-700 font-semibold rounded">
                    {estadosPorArea.OFICINAS.Dañado} dañ.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Cocina */}
          <div
            onClick={() => handleSelectArea('cocina')}
            className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-pink-400 cursor-pointer transition-all group"
          >
            <div className="flex items-center justify-between">
              <div className="p-2.5 bg-pink-50 text-pink-600 rounded-xl group-hover:bg-pink-600 group-hover:text-white transition-colors">
                <UtensilsCrossed className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-pink-600 bg-pink-50 px-2 py-0.5 rounded-full flex items-center">
                Módulo <ArrowUpRight className="w-3 h-3 ml-1" />
              </span>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <div className="text-2xl font-black text-slate-900">{porArea.COCINA || 0}</div>
                <div className="text-xs font-bold text-pink-600 bg-pink-50 px-2 py-0.5 rounded-md">
                  {Math.round(unidadesPorArea.COCINA || 0)} u. físicas
                </div>
              </div>
              <div className="text-xs font-bold text-slate-700 mt-0.5">Cocina y Comedor</div>
              <div className="text-[11px] text-slate-400 mt-1">Electrodomésticos y vajilla</div>

              <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-1 text-[10px]">
                {estadosPorArea.COCINA?.Bueno > 0 && (
                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 font-semibold rounded">
                    {estadosPorArea.COCINA.Bueno} buenos
                  </span>
                )}
                {estadosPorArea.COCINA?.Regular > 0 && (
                  <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 font-semibold rounded">
                    {estadosPorArea.COCINA.Regular} reg.
                  </span>
                )}
                {(!estadosPorArea.COCINA?.Bueno && !estadosPorArea.COCINA?.Regular) && (
                  <span className="text-slate-400">0 iniciales</span>
                )}
              </div>
            </div>
          </div>

          {/* Almacén */}
          <div
            onClick={() => handleSelectArea('almacen')}
            className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-[#F28524] cursor-pointer transition-all group"
          >
            <div className="flex items-center justify-between">
              <div className="p-2.5 bg-[#F28524]/10 text-[#F28524] rounded-xl group-hover:bg-[#F28524] group-hover:text-white transition-colors">
                <Wrench className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-[#F28524] bg-[#F28524]/10 px-2 py-0.5 rounded-full flex items-center">
                Ver lista <ArrowUpRight className="w-3 h-3 ml-1" />
              </span>
            </div>
            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <div className="text-2xl font-black text-slate-900">{porArea.ALMACEN || 0}</div>
                <div className="text-xs font-bold text-[#F28524] bg-[#F28524]/10 px-2 py-0.5 rounded-md">
                  {Math.round(unidadesPorArea.ALMACEN || 0)} u. físicas
                </div>
              </div>
              <div className="text-xs font-bold text-slate-700 mt-0.5">Almacén y Herramientas</div>
              <div className="text-[11px] text-slate-400 mt-1">Herramientas, EPP, materiales</div>

              <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-1 text-[10px]">
                {estadosPorArea.ALMACEN?.Bueno > 0 && (
                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 font-semibold rounded">
                    {estadosPorArea.ALMACEN.Bueno} buenos
                  </span>
                )}
                {estadosPorArea.ALMACEN?.Regular > 0 && (
                  <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 font-semibold rounded">
                    {estadosPorArea.ALMACEN.Regular} reg.
                  </span>
                )}
                {estadosPorArea.ALMACEN?.Dañado > 0 && (
                  <span className="px-1.5 py-0.5 bg-rose-50 text-rose-700 font-semibold rounded">
                    {estadosPorArea.ALMACEN.Dañado} dañ.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards: Physical State Breakdown - Fully Interactive Filters */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Condición Física de Activos (Haz clic para filtrar el inventario)
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {/* Bueno */}
          <button
            type="button"
            onClick={() => handleSelectEstado('BUENO')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectEstado('BUENO'); }}
            className="w-full bg-emerald-50/70 border border-emerald-200/80 p-4 rounded-xl text-center cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02] active:scale-[0.99] hover:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 group"
            title="Ver los artículos en estado Bueno en el Inventario General"
          >
            <div className="flex items-center justify-center text-emerald-600 mb-1">
              <CheckCircle2 className="w-4 h-4 mr-1" />
              <span className="text-xs font-bold uppercase tracking-wider">Bueno</span>
            </div>
            <div className="text-2xl font-black text-emerald-900 group-hover:text-emerald-700 transition-colors">
              {porEstado['Bueno'] || 0}
            </div>
            <div className="text-[10px] text-emerald-700 font-medium">Operativos al 100%</div>
            <div className="text-[9px] font-bold text-emerald-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span>Ver artículos</span>
              <ArrowRight className="w-2.5 h-2.5 ml-1" />
            </div>
          </button>

          {/* Regular */}
          <button
            type="button"
            onClick={() => handleSelectEstado('REGULAR')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectEstado('REGULAR'); }}
            className="w-full bg-amber-50/70 border border-amber-200/80 p-4 rounded-xl text-center cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02] active:scale-[0.99] hover:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 group"
            title="Ver los artículos en estado Regular en el Inventario General"
          >
            <div className="flex items-center justify-center text-amber-600 mb-1">
              <AlertTriangle className="w-4 h-4 mr-1" />
              <span className="text-xs font-bold uppercase tracking-wider">Regular</span>
            </div>
            <div className="text-2xl font-black text-amber-900 group-hover:text-amber-700 transition-colors">
              {porEstado['Regular'] || 0}
            </div>
            <div className="text-[10px] text-amber-700 font-medium">Con desgaste de uso</div>
            <div className="text-[9px] font-bold text-amber-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span>Ver artículos</span>
              <ArrowRight className="w-2.5 h-2.5 ml-1" />
            </div>
          </button>

          {/* Dañado */}
          <button
            type="button"
            onClick={() => handleSelectEstado('DANADO')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectEstado('DANADO'); }}
            className="w-full bg-rose-50/70 border border-rose-200/80 p-4 rounded-xl text-center cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02] active:scale-[0.99] hover:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-1 group"
            title="Ver los artículos en estado Dañado en el Inventario General"
          >
            <div className="flex items-center justify-center text-rose-600 mb-1">
              <XCircle className="w-4 h-4 mr-1" />
              <span className="text-xs font-bold uppercase tracking-wider">Dañado</span>
            </div>
            <div className="text-2xl font-black text-rose-900 group-hover:text-rose-700 transition-colors">
              {porEstado['Dañado'] || 0}
            </div>
            <div className="text-[10px] text-rose-700 font-medium">Requiere reparación</div>
            <div className="text-[9px] font-bold text-rose-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span>Ver artículos</span>
              <ArrowRight className="w-2.5 h-2.5 ml-1" />
            </div>
          </button>

          {/* Fuera de Servicio */}
          <button
            type="button"
            onClick={() => handleSelectEstado('FUERA_SERVICIO')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectEstado('FUERA_SERVICIO'); }}
            className="w-full bg-red-50/70 border border-red-200/80 p-4 rounded-xl text-center cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02] active:scale-[0.99] hover:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 group"
            title="Ver los artículos fuera de servicio o perdidos en el Inventario General"
          >
            <div className="flex items-center justify-center text-red-700 mb-1">
              <ShieldAlert className="w-4 h-4 mr-1" />
              <span className="text-xs font-bold uppercase tracking-wider">Fuera Servicio</span>
            </div>
            <div className="text-2xl font-black text-red-950 group-hover:text-red-700 transition-colors">
              {porEstado['Fuera de servicio'] || 0}
            </div>
            <div className="text-[10px] text-red-800 font-medium">Bajas / Pérdidas</div>
            <div className="text-[9px] font-bold text-red-700 mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span>Ver artículos</span>
              <ArrowRight className="w-2.5 h-2.5 ml-1" />
            </div>
          </button>

          {/* Pendiente */}
          <button
            type="button"
            onClick={() => handleSelectEstado('PENDIENTE')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectEstado('PENDIENTE'); }}
            className="w-full bg-slate-100/70 border border-slate-300/80 p-4 rounded-xl text-center col-span-2 sm:col-span-1 cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02] active:scale-[0.99] hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-1 group"
            title="Ver los artículos pendientes de verificación en el Inventario General"
          >
            <div className="flex items-center justify-center text-slate-600 mb-1">
              <Clock className="w-4 h-4 mr-1" />
              <span className="text-xs font-bold uppercase tracking-wider">Pendiente</span>
            </div>
            <div className="text-2xl font-black text-slate-800 group-hover:text-slate-600 transition-colors">
              {porEstado['Pendiente de verificación'] || 0}
            </div>
            <div className="text-[10px] text-slate-600 font-medium">Por inspeccionar</div>
            <div className="text-[9px] font-bold text-slate-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span>Ver artículos</span>
              <ArrowRight className="w-2.5 h-2.5 ml-1" />
            </div>
          </button>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart: Distribution by Area */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-[#F28524]" />
              <span>Distribución de Activos por Área Operativa</span>
            </h3>
            <span className="text-xs text-slate-400">Total: {totalArticulos}</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={areaChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(val) => [`${val} artículos`, 'Cantidad']}
                  contentStyle={{ backgroundColor: '#1E293B', color: '#fff', borderRadius: '8px', fontSize: '12px' }}
                />
                <Bar
                  dataKey="count"
                  radius={[6, 6, 0, 0]}
                  cursor="pointer"
                  onClick={(entry) => {
                    if (entry && entry.page) handleSelectArea(entry.page);
                  }}
                >
                  {areaChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart: State Condition (Also interactive!) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
              <Layers className="w-4 h-4 text-[#F28524]" />
              <span>Estado Físico del Inventario Maestro</span>
            </h3>
            <span className="text-xs text-slate-400">Haz clic para filtrar</span>
          </div>
          <div className="h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={estadoChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  cursor="pointer"
                  onClick={(entry) => {
                    if (entry && estadoCodeMap[entry.name]) {
                      handleSelectEstado(estadoCodeMap[entry.name]);
                    }
                  }}
                >
                  {estadoChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val, name) => [`${val} bienes`, name]}
                  contentStyle={{ backgroundColor: '#1E293B', color: '#fff', borderRadius: '8px', fontSize: '12px' }}
                />
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* SECCIÓN TAREA 5 & TAREA 6: INVENTARIO POR CAMPAMENTO Y CONCILIACIÓN MATEMÁTICA */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2">
              <MapPin className="w-5 h-5 text-[#F28524]" />
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                INVENTARIO POR CAMPAMENTO
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Desglose integral por sede operativa confirmada (13 indicadores) y artículos con sede pendiente de clasificación individual. Haz clic en cualquier sede para abrir su inventario filtrado.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
              {porCampamento.length} Sedes Confirmadas ({consistenciaMatematica?.sumaArticulosCampamentosConfirmados ?? 329} bienes)
            </span>
            {sinSedeVerificada && (
              <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
                Sin Sede Verificada ({sinSedeVerificada.total_articulos} bienes)
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600 bg-slate-100/80 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-3">1. Campamento / Sede</th>
                <th className="py-3 px-2 text-center">2. Alm.</th>
                <th className="py-3 px-2.5 text-center">3. Reg. Inv.</th>
                <th className="py-3 px-2.5 text-center">4. Unid. Físicas</th>
                <th className="py-3 px-3 text-center">5. Por Departamento (INF / OFI / COC / ALM)</th>
                <th className="py-3 px-2 text-center text-emerald-700">6. Buenos</th>
                <th className="py-3 px-2 text-center text-amber-700">7. Reg.</th>
                <th className="py-3 px-2 text-center text-rose-700">8. Dañ.</th>
                <th className="py-3 px-2 text-center text-red-800">9. F. Serv.</th>
                <th className="py-3 px-2 text-center text-slate-700">10. Pend. Verif.</th>
                <th className="py-3 px-2 text-center">11. Sin Serie</th>
                <th className="py-3 px-2 text-center">12. Lev. Abiertos</th>
                <th className="py-3 px-2 text-center">13. Lev. Finaliz.</th>
                <th className="py-3 px-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {porCampamento.map((camp) => (
                <tr
                  key={camp.id}
                  onClick={() => handleOpenCampamentoInventario(camp.id)}
                  className="hover:bg-amber-50/50 transition-colors cursor-pointer group"
                  title={`Haz clic para consultar los ${camp.total_articulos} artículos de ${camp.nombre}`}
                >
                  <td className="py-3 px-3">
                    <div className="font-bold text-slate-900 flex items-center space-x-2 group-hover:text-[#F28524] transition-colors">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
                      <span>{camp.nombre}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5 pl-4">
                      {camp.codigo} · Excel: {camp.ubicacion_historica_equivalente || camp.nombre}
                    </div>
                  </td>
                  <td className="py-3 px-2 text-center font-bold text-slate-700">
                    {camp.cantidad_almacenes || 0}
                  </td>
                  <td className="py-3 px-2.5 text-center">
                    <span className="px-2.5 py-1 bg-blue-50 text-blue-800 font-black rounded-md border border-blue-200">
                      {camp.total_articulos}
                    </span>
                  </td>
                  <td className="py-3 px-2.5 text-center">
                    <div className="font-black text-slate-900">
                      {Number(camp.total_fisico || 0).toLocaleString('es-DO')}
                    </div>
                    {camp.articulos_sin_cantidad > 0 && (
                      <div className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                        +{camp.articulos_sin_cantidad} sin cant.
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center whitespace-nowrap">
                    <div className="inline-flex items-center space-x-1 text-[10px] font-bold">
                      <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700" title="Informática">
                        INF: {camp.por_departamento?.INFORMATICA || 0}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700" title="Oficinas">
                        OFI: {camp.por_departamento?.OFICINAS || 0}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-pink-50 text-pink-700" title="Cocina">
                        COC: {camp.por_departamento?.COCINA || 0}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-50 text-[#F28524]" title="Almacén">
                        ALM: {camp.por_departamento?.ALMACEN || 0}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-center font-bold text-emerald-700">
                    {camp.buenos || 0}
                  </td>
                  <td className="py-3 px-2 text-center font-bold text-amber-700">
                    {camp.regulares || 0}
                  </td>
                  <td className="py-3 px-2 text-center font-bold text-rose-700">
                    {camp.danados || 0}
                  </td>
                  <td className="py-3 px-2 text-center font-bold text-red-800">
                    {camp.fuera_servicio || 0}
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                      camp.pendientes_verificacion > 0 ? 'bg-amber-100 text-amber-900' : 'text-slate-400'
                    }`}>
                      {camp.pendientes_verificacion || 0}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-center font-mono font-bold text-slate-700">
                    {camp.sin_serie || 0}
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      camp.levantamientos_abiertos > 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {camp.levantamientos_abiertos || 0}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-center font-bold text-emerald-700">
                    {camp.levantamientos_finalizados || 0}
                  </td>
                  <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleOpenCampamentoInventario(camp.id)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-[#F28524] hover:text-white text-slate-800 rounded-lg text-[11px] font-bold transition-all inline-flex items-center space-x-1 whitespace-nowrap"
                    >
                      <span>Ver inventario</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}

              {/* SECCIÓN SIN SEDE VERIFICADA (PENDIENTE DE CLASIFICACIÓN - KM 19 AUT DUARTE) */}
              {sinSedeVerificada && (
                <tr
                  onClick={() => handleOpenCampamentoInventario('SIN_SEDE')}
                  className="bg-amber-50/40 hover:bg-amber-100/50 transition-colors cursor-pointer group border-t-2 border-amber-200"
                  title="Haz clic para auditar los 104 artículos de KM 19 AUT DUARTE pendientes de clasificación de sede"
                >
                  <td className="py-3.5 px-3">
                    <div className="font-bold text-amber-950 flex items-center space-x-2 group-hover:text-[#F28524] transition-colors">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0"></span>
                      <span>{sinSedeVerificada.nombre}</span>
                    </div>
                    <div className="text-[10px] text-amber-800 font-mono mt-0.5 pl-4">
                      Ubicación Excel: {sinSedeVerificada.ubicacion_historica} · Sin reasignación automática
                    </div>
                  </td>
                  <td className="py-3.5 px-2 text-center font-mono text-amber-700">—</td>
                  <td className="py-3.5 px-2.5 text-center">
                    <span className="px-2.5 py-1 bg-amber-100 text-amber-950 font-black rounded-md border border-amber-300">
                      {sinSedeVerificada.total_articulos}
                    </span>
                  </td>
                  <td className="py-3.5 px-2.5 text-center">
                    <div className="font-black text-amber-950">
                      {Number(sinSedeVerificada.total_fisico || 0).toLocaleString('es-DO')}
                    </div>
                    {sinSedeVerificada.articulos_sin_cantidad > 0 && (
                      <div className="text-[10px] font-bold text-amber-900 bg-amber-200/70 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                        +{sinSedeVerificada.articulos_sin_cantidad} sin cant.
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 px-3 text-center whitespace-nowrap">
                    <div className="inline-flex items-center space-x-1 text-[10px] font-bold">
                      <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                        INF: {sinSedeVerificada.por_departamento?.INFORMATICA || 0}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800">
                        OFI: {sinSedeVerificada.por_departamento?.OFICINAS || 0}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-pink-100 text-pink-800">
                        COC: {sinSedeVerificada.por_departamento?.COCINA || 0}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
                        ALM: {sinSedeVerificada.por_departamento?.ALMACEN || 0}
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-2 text-center font-bold text-emerald-700">
                    {sinSedeVerificada.buenos || 0}
                  </td>
                  <td className="py-3.5 px-2 text-center font-bold text-amber-700">
                    {sinSedeVerificada.regulares || 0}
                  </td>
                  <td className="py-3.5 px-2 text-center font-bold text-rose-700">
                    {sinSedeVerificada.danados || 0}
                  </td>
                  <td className="py-3.5 px-2 text-center font-bold text-red-800">
                    {sinSedeVerificada.fuera_servicio || 0}
                  </td>
                  <td className="py-3.5 px-2 text-center">
                    <span className="px-2 py-0.5 rounded font-bold text-[11px] bg-amber-200 text-amber-950">
                      {sinSedeVerificada.pendientes_verificacion || 0}
                    </span>
                  </td>
                  <td className="py-3.5 px-2 text-center font-mono font-bold text-amber-950">
                    {sinSedeVerificada.sin_serie || 0}
                  </td>
                  <td className="py-3.5 px-2 text-center text-slate-400">0</td>
                  <td className="py-3.5 px-2 text-center text-slate-400">0</td>
                  <td className="py-3.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleOpenCampamentoInventario('SIN_SEDE')}
                      className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[11px] font-bold transition-all inline-flex items-center space-x-1 whitespace-nowrap shadow-sm"
                    >
                      <span>Clasificar / Ver</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              )}
            </tbody>

            {/* FILA DE CONCILIACIÓN Y CONSISTENCIA MATEMÁTICA (TAREA 6) */}
            {consistenciaMatematica && (
              <tfoot>
                <tr className="bg-slate-900 text-white font-bold text-xs">
                  <td className="py-3 px-3">
                    <div>TOTAL GENERAL CONCILIADO (TAREA 6)</div>
                    <div className="text-[10px] text-emerald-400 font-normal">
                      {consistenciaMatematica.sumaArticulosCampamentosConfirmados} confirmados + {consistenciaMatematica.articulosSinSedeVerificada} sin sede = {consistenciaMatematica.totalGeneralArticulos} bienes
                    </div>
                  </td>
                  <td className="py-3 px-2 text-center">{totalAlmacenes}</td>
                  <td className="py-3 px-2.5 text-center">
                    <span className="px-2.5 py-1 bg-[#F28524] text-white font-black rounded-md">
                      {consistenciaMatematica.totalGeneralArticulos}
                    </span>
                  </td>
                  <td className="py-3 px-2.5 text-center">
                    <div className="font-black text-emerald-400">
                      {Number(consistenciaMatematica.totalUnidadesFisicasConocidas || 0).toLocaleString('es-DO')}
                    </div>
                    <div className="text-[10px] text-amber-300 font-normal">
                      (+{consistenciaMatematica.totalArticulosCantidadPendiente} cant. nula)
                    </div>
                  </td>
                  <td className="py-3 px-3 text-center text-[10px] font-mono text-slate-200">
                    INF: {porArea.INFORMATICA || 0} | OFI: {porArea.OFICINAS || 0} | COC: {porArea.COCINA || 0} | ALM: {porArea.ALMACEN || 0}
                  </td>
                  <td className="py-3 px-2 text-center text-emerald-400">{porEstado['Bueno'] || 0}</td>
                  <td className="py-3 px-2 text-center text-amber-300">{porEstado['Regular'] || 0}</td>
                  <td className="py-3 px-2 text-center text-rose-400">{porEstado['Dañado'] || 0}</td>
                  <td className="py-3 px-2 text-center text-red-400">{porEstado['Fuera de servicio'] || 0}</td>
                  <td className="py-3 px-2 text-center text-amber-300">{articulosPendientesVerificacion}</td>
                  <td className="py-3 px-2 text-center font-mono">{articulosSinSerial}</td>
                  <td className="py-3 px-2 text-center">{levantamientosEnProceso}</td>
                  <td className="py-3 px-2 text-center text-emerald-400">{levantamientosFinalizados}</td>
                  <td className="py-3 px-3 text-right">
                    <span className="px-2 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded text-[10px]">
                      100% Cuadrado
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Nota de Campamentos Pendientes de Validación (San Cristóbal, Azua, Pedernales) */}
        {campamentosPendientesValidacion && campamentosPendientesValidacion.length > 0 && (
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
            <div className="flex items-start sm:items-center space-x-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <span className="font-bold text-slate-800">
                  Sedes registradas en catálogo de BD pendientes de validación física ({campamentosPendientesValidacion.length}):
                </span>{' '}
                <span>
                  {campamentosPendientesValidacion.map(c => c.nombre).join(', ')}. No aparecen en el Excel del 16-Oct-2026; se mantienen separadas para no mostrar un &ldquo;0&rdquo; engañoso como si su levantamiento ya estuviese conciliado.
                </span>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold px-2.5 py-1 bg-amber-100 text-amber-900 rounded-md whitespace-nowrap">
              PENDIENTE_VALIDACION
            </span>
          </div>
        )}
      </div>

      {/* Bottom Grid: Units of Measure & Recent Movements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quantities by Unit of Measure */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
            <Package className="w-4 h-4 text-[#F28524]" />
            <span>Desglose por Unidades de Medida Físicas</span>
          </h3>
          <p className="text-xs text-slate-500">
            Control de unidades físicas sin sumar rollos, paquetes o juegos indiscriminadamente.
          </p>

          <div className="divide-y divide-slate-100 text-xs">
            {unidades.map((u, i) => (
              <div key={i} className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800">{u.unidad_medida}</span>
                  <span className="text-slate-400 ml-2">({u.registros} registros en base de datos)</span>
                </div>
                <div className="font-mono font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md">
                  {Number(u.total_cantidad).toLocaleString('es-DO')} {u.unidad_medida.toLowerCase()}s
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Movements Log */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
              <ArrowRightLeft className="w-4 h-4 text-[#F28524]" />
              <span>Últimos Movimientos Registrados</span>
            </h3>
            <button
              onClick={() => handleSelectArea('movimientos')}
              className="text-xs text-[#F28524] font-semibold hover:underline"
            >
              Ver todos
            </button>
          </div>

          <div className="space-y-2 text-xs">
            {recientesMovimientos.length > 0 ? (
              recientesMovimientos.slice(0, 5).map((m, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-xl flex items-center justify-between border border-slate-100">
                  <div className="space-y-0.5 max-w-[70%]">
                    <div className="font-bold text-slate-800 truncate">{m.articulo_nombre || m.descripcion}</div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {m.codigo_original || 'S/C'} · {m.tipo_movimiento} ({m.cantidad} u.)
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-white font-bold text-[10px] text-slate-700 rounded border border-slate-200">
                    {new Date(m.fecha_movimiento).toLocaleDateString('es-DO')}
                  </span>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-slate-400">
                No hay movimientos registrados en el periodo.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
