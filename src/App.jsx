import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Compass, Home, ShieldAlert, ArrowLeft, LogOut } from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import ErrorBoundary from './components/common/ErrorBoundary';
import { canAccessModule, getFirstAuthorizedPage } from './utils/permissions';

// Enterprise Inventory Pages (code-split vía React.lazy para optimizar bundle B03)
import LoginPage from './pages/LoginPage';
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const InventarioGeneralPage = lazy(() => import('./pages/InventarioGeneralPage'));
const InformaticaPage = lazy(() => import('./pages/InformaticaPage'));
const OficinasPage = lazy(() => import('./pages/OficinasPage'));
const CocinaPage = lazy(() => import('./pages/CocinaPage'));
const AlmacenPage = lazy(() => import('./pages/AlmacenPage'));
const LevantamientosPage = lazy(() => import('./pages/LevantamientosPage'));
const UbicacionesPage = lazy(() => import('./pages/UbicacionesPage'));
const MovimientosPage = lazy(() => import('./pages/MovimientosPage'));
const ReportesPage = lazy(() => import('./pages/ReportesPage'));
const AuditoriaPage = lazy(() => import('./pages/AuditoriaPage'));
const UsuariosPage = lazy(() => import('./pages/UsuariosPage'));

const PageLoadingFallback = () => (
  <div className="flex flex-col items-center justify-center py-20 text-slate-600 space-y-3" role="status" aria-live="polite">
    <div className="w-8 h-8 border-4 border-[#F28524] border-t-transparent rounded-full animate-spin" />
    <span className="text-xs font-medium">Cargando módulo...</span>
  </div>
);

const ROUTE_TO_PAGE = {
  '': 'dashboard',
  dashboard: 'dashboard',
  inventario: 'inventario',
  informatica: 'informatica',
  oficinas: 'oficinas',
  cocina: 'cocina',
  almacen: 'almacen',
  levantamientos: 'levantamientos',
  ubicaciones: 'ubicaciones',
  movimientos: 'movimientos',
  reportes: 'reportes',
  auditoria: 'auditoria',
  usuarios: 'usuarios'
};

const MODULE_LABELS = {
  dashboard: 'Dashboard General',
  inventario: 'Inventario Maestro',
  informatica: 'Informática y Telecom',
  oficinas: 'Oficinas y Mobiliario',
  cocina: 'Cocina y Comedor',
  almacen: 'Almacén y Herramientas',
  levantamientos: 'Levantamientos y Auditorías',
  ubicaciones: 'Sedes y Campamentos',
  movimientos: 'Movimientos de Stock',
  reportes: 'Centro de Reportes',
  auditoria: 'Bitácora de Auditoría',
  usuarios: 'Usuarios y Permisos'
};

const readRouteFromLocation = () => {
  if (typeof window === 'undefined' || !window.location) {
    return { targetPage: 'dashboard', params: {}, shouldReplaceTrailing: false, normalizedPath: '' };
  }
  const rawPathname = window.location.pathname || '/';
  const normalizedPath = rawPathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  const searchParams = new URLSearchParams(window.location.search || '');
  const params = {};
  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }
  const isKnownRoute = Object.prototype.hasOwnProperty.call(ROUTE_TO_PAGE, normalizedPath);
  return {
    targetPage: isKnownRoute ? ROUTE_TO_PAGE[normalizedPath] : 'not_found',
    params,
    shouldReplaceTrailing: isKnownRoute && rawPathname.length > 1 && rawPathname.endsWith('/'),
    normalizedPath
  };
};

const AppContent = () => {
  const { currentUser, logout } = useApp();

  // Navigation State & URL parameters (inicialización síncrona desde URL para evitar flash de módulo no autorizado)
  const [activePage, setActivePage] = useState(() => readRouteFromLocation().targetPage);
  const [pageParams, setPageParams] = useState(() => readRouteFromLocation().params);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [mobileMenuOpen]);

  const firstAuthorizedPage = getFirstAuthorizedPage(currentUser);

  // Sync state from URL with trailing-slash normalization and strict 404 fallback
  const syncFromUrl = useCallback(() => {
    const { targetPage, params, shouldReplaceTrailing, normalizedPath } = readRouteFromLocation();
    if (shouldReplaceTrailing) {
      window.history.replaceState(
        window.history.state,
        '',
        `/${normalizedPath}${window.location.search}`
      );
    }

    setActivePage(targetPage);
    setPageParams(params);
  }, []);

  useEffect(() => {
    syncFromUrl();
    const handlePopState = () => {
      syncFromUrl();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [syncFromUrl]);

  // En entrada raíz '/' sin permiso de Dashboard, redirigir al primer módulo autorizado (o vista sin acceso)
  useEffect(() => {
    if (!currentUser) return;
    const rawNormalized = (window.location.pathname || '/').replace(/^\/+|\/+$/g, '').toLowerCase();
    if (rawNormalized === '' && !canAccessModule(currentUser, 'dashboard')) {
      if (firstAuthorizedPage !== 'sin_acceso') {
        window.history.replaceState({ page: firstAuthorizedPage, params: {} }, '', `/${firstAuthorizedPage}`);
        setActivePage(firstAuthorizedPage);
        setPageParams({});
      } else {
        setActivePage('sin_acceso');
        setPageParams({});
      }
    }
  }, [currentUser, firstAuthorizedPage]);

  // Navigate function that pushes URL with search parameters
  const navigateTo = useCallback((page, params = {}) => {
    if (page === 'sin_acceso') {
      setActivePage('sin_acceso');
      setPageParams({});
      return;
    }
    const targetPage = Object.prototype.hasOwnProperty.call(ROUTE_TO_PAGE, page)
      ? ROUTE_TO_PAGE[page]
      : 'not_found';
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && v !== 'TODOS') {
        query.append(k, v);
      }
    });
    const queryString = query.toString();
    const pathSegment = targetPage === 'dashboard' ? 'dashboard' : targetPage;
    const newUrl = `/${pathSegment}${queryString ? `?${queryString}` : ''}`;
    window.history.pushState({ page: targetPage, params }, '', newUrl);
    setActivePage(targetPage);
    setPageParams(params);
  }, []);

  // If not authenticated, display enterprise LoginPage
  if (!currentUser) {
    return <LoginPage />;
  }

  const renderAccessDenied = (deniedPageId) => {
    const hasAnyAuthorized = firstAuthorizedPage && firstAuthorizedPage !== 'sin_acceso';
    const moduleTitle = MODULE_LABELS[deniedPageId] || 'este módulo';
    return (
      <div
        role="alert"
        className="bg-white rounded-3xl p-8 sm:p-12 border border-rose-200 shadow-sm max-w-xl mx-auto my-10 text-center space-y-5"
      >
        <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-1.5">
          <span className="inline-block px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-widest bg-rose-600 text-white">
            Acceso Restringido · 403
          </span>
          <h1 className="text-2xl font-black text-[#0F172A] tracking-tight pt-1">
            {deniedPageId === 'sin_acceso'
              ? 'Cuenta sin módulos autorizados'
              : 'Acceso Denegado al Módulo'}
          </h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            {deniedPageId === 'sin_acceso' ? (
              <>
                Su usuario no posee permisos de acceso activos en <span className="font-semibold text-slate-800">INGMELEC | ALMACÉN GENERAL</span>. Solicite al Desarrollador Principal la asignación de sus permisos y sedes operativas.
              </>
            ) : (
              <>
                No dispone de permisos para acceder a <span className="font-semibold text-slate-800">{moduleTitle}</span>. Esta restricción aplica tanto en la navegación como en acceso directo por URL.
              </>
            )}
          </p>
        </div>
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          {hasAnyAuthorized && (
            <button
              type="button"
              onClick={() => navigateTo(firstAuthorizedPage)}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#F28524] hover:bg-[#d87019] text-white text-xs font-bold shadow-md shadow-[#F28524]/25 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Ir a {MODULE_LABELS[firstAuthorizedPage] || 'Módulo Autorizado'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </div>
    );
  };

  // Active view router with strict permission gating & 404 screen
  const renderActivePage = () => {
    if (activePage === 'not_found') {
      return (
        <div className="bg-white rounded-3xl p-8 sm:p-12 border border-slate-200/90 shadow-sm max-w-xl mx-auto my-10 text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-[#F28524]/10 border border-[#F28524]/30 flex items-center justify-center text-[#F28524] mx-auto">
            <Compass className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <span className="inline-block px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-widest bg-[#0F172A] text-white">
              Error 404
            </span>
            <h1 className="text-2xl font-black text-[#0F172A] tracking-tight pt-1">
              404 — Ruta no encontrada
            </h1>
            <p className="text-xs text-slate-500 leading-relaxed">
              La ruta <span className="font-mono font-semibold text-slate-700">{window.location.pathname}</span> no corresponde a ningún módulo válido en <span className="font-semibold text-slate-700">INGMELEC | ALMACÉN GENERAL</span>.
            </p>
          </div>
          <div className="pt-2">
            {firstAuthorizedPage !== 'sin_acceso' ? (
              <button
                type="button"
                onClick={() => navigateTo(firstAuthorizedPage)}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#F28524] hover:bg-[#d87019] text-white text-xs font-bold shadow-md shadow-[#F28524]/25 transition-all"
              >
                <Home className="w-4 h-4" />
                <span>Ir a {MODULE_LABELS[firstAuthorizedPage] || 'Inicio'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all"
              >
                <LogOut className="w-4 h-4" />
                <span>Cerrar Sesión</span>
              </button>
            )}
          </div>
        </div>
      );
    }

    if (activePage === 'sin_acceso' || !canAccessModule(currentUser, activePage)) {
      return renderAccessDenied(activePage);
    }

    switch (activePage) {
      case 'dashboard':
        return (
          <DashboardPage
            setActivePage={(p) => navigateTo(p)}
            navigateTo={navigateTo}
          />
        );
      case 'inventario':
        return (
          <InventarioGeneralPage
            initialFilters={pageParams}
            onNavigateBack={canAccessModule(currentUser, 'dashboard') ? () => navigateTo('dashboard') : null}
          />
        );
      case 'informatica':
        return <InformaticaPage />;
      case 'oficinas':
        return <OficinasPage />;
      case 'cocina':
        return <CocinaPage />;
      case 'almacen':
        return <AlmacenPage />;
      case 'levantamientos':
        return <LevantamientosPage navigateTo={navigateTo} pageParams={pageParams} />;
      case 'ubicaciones':
        return <UbicacionesPage />;
      case 'movimientos':
        return <MovimientosPage />;
      case 'reportes':
        return <ReportesPage />;
      case 'auditoria':
        return <AuditoriaPage />;
      case 'usuarios':
        return <UsuariosPage />;
      default:
        return renderAccessDenied('sin_acceso');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex relative text-slate-800 font-sans">
      {/* Sidebar Navigation (Drawer responsive A09) */}
      <Sidebar
        activePage={activePage}
        setActivePage={(page) => navigateTo(page)}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main Container (sin pl-64 fijo en pantallas móviles) */}
      <div
        className={`flex-grow min-w-0 min-h-screen flex flex-col transition-all duration-300 pl-0 ${
          sidebarCollapsed ? 'md:pl-20' : 'md:pl-64'
        }`}
      >
        <Topbar activePage={activePage} onOpenMobileMenu={() => setMobileMenuOpen(true)} />

        {/* Workspace Canvas */}
        <main className="p-4 sm:p-6 lg:p-8 flex-grow bg-transparent relative z-10 max-w-7xl w-full mx-auto">
          <ErrorBoundary
            resetKey={activePage}
            scoped
            onGoHome={() => {
              if (firstAuthorizedPage !== 'sin_acceso') {
                navigateTo(firstAuthorizedPage);
              } else {
                navigateTo('sin_acceso');
              }
            }}
          >
            <Suspense fallback={<PageLoadingFallback />}>
              {renderActivePage()}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ErrorBoundary>
  );
}
