import React, { useState, useEffect, useCallback } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';

// Enterprise Inventory Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import InventarioGeneralPage from './pages/InventarioGeneralPage';
import InformaticaPage from './pages/InformaticaPage';
import OficinasPage from './pages/OficinasPage';
import CocinaPage from './pages/CocinaPage';
import AlmacenPage from './pages/AlmacenPage';
import LevantamientosPage from './pages/LevantamientosPage';
import UbicacionesPage from './pages/UbicacionesPage';
import MovimientosPage from './pages/MovimientosPage';
import ReportesPage from './pages/ReportesPage';
import AuditoriaPage from './pages/AuditoriaPage';
import UsuariosPage from './pages/UsuariosPage';

const AppContent = () => {
  const { currentUser, currentRole } = useApp();

  // Navigation State & URL parameters
  const [activePage, setActivePage] = useState('dashboard');
  const [pageParams, setPageParams] = useState({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Sync state from URL
  const syncFromUrl = useCallback(() => {
    const path = window.location.pathname.replace(/^\//, '').toLowerCase();
    const searchParams = new URLSearchParams(window.location.search);
    const params = {};
    for (const [key, value] of searchParams.entries()) {
      params[key] = value;
    }

    const validPages = [
      'dashboard', 'inventario', 'informatica', 'oficinas',
      'cocina', 'almacen', 'levantamientos', 'ubicaciones', 'movimientos',
      'reportes', 'auditoria', 'usuarios'
    ];

    const targetPage = validPages.includes(path) ? path : 'dashboard';
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

  // Navigate function that pushes URL with search parameters
  const navigateTo = (page, params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && v !== 'TODOS') {
        query.append(k, v);
      }
    });
    const queryString = query.toString();
    const newUrl = `/${page}${queryString ? `?${queryString}` : ''}`;
    window.history.pushState({ page, params }, '', newUrl);
    setActivePage(page);
    setPageParams(params);
  };

  // If not authenticated, display enterprise LoginPage
  if (!currentUser) {
    return <LoginPage />;
  }

  // Active view router with gated role access
  const renderActivePage = () => {
    switch (activePage) {
      case 'dashboard':
        return (
          <DashboardPage
            setActivePage={setActivePage}
            navigateTo={navigateTo}
          />
        );
      case 'inventario':
        return (
          <InventarioGeneralPage
            initialFilters={pageParams}
            onNavigateBack={() => navigateTo('dashboard')}
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
        if (currentRole !== 'developer' && currentUser?.es_developer !== 1 && currentRole !== 'admin' && currentRole !== 'auditor' && currentRole !== 'gerencia') {
          return <DashboardPage setActivePage={setActivePage} navigateTo={navigateTo} />;
        }
        return <AuditoriaPage />;
      case 'usuarios':
        if (currentRole !== 'developer' && currentUser?.es_developer !== 1) {
          return <DashboardPage setActivePage={setActivePage} navigateTo={navigateTo} />;
        }
        return <UsuariosPage />;
      default:
        return <DashboardPage setActivePage={setActivePage} navigateTo={navigateTo} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex relative text-slate-800 font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        activePage={activePage}
        setActivePage={(page) => navigateTo(page)}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
      />

      {/* Main Container */}
      <div
        className={`flex-grow min-h-screen flex flex-col transition-all duration-300 ${
          sidebarCollapsed ? 'pl-20' : 'pl-64'
        }`}
      >
        <Topbar
          activePage={activePage}
          setActivePage={(page) => navigateTo(page)}
        />

        {/* Workspace Canvas */}
        <main className="p-4 sm:p-6 lg:p-8 flex-grow bg-transparent relative z-10 max-w-7xl w-full mx-auto">
          {renderActivePage()}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
