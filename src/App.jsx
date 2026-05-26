import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';

// Page Imports
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import BrigadasPage from './pages/BrigadasPage';
import TecnicosPage from './pages/TecnicosPage';
import PersonalPage from './pages/PersonalPage';
import InventarioPage from './pages/InventarioPage';
import ActasPage from './pages/ActasPage';
import ReposicionesPage from './pages/ReposicionesPage';
import SwapsPage from './pages/SwapsPage';
import DevolucionesPage from './pages/DevolucionesPage';
import UsuariosPage from './pages/UsuariosPage';
import AuditoriaPage from './pages/AuditoriaPage';
import ReportesPage from './pages/ReportesPage';
import SecurityCenterPage from './pages/SecurityCenterPage';
import ExecutiveDemoStepper from './components/demo/ExecutiveDemoStepper';
import ErrorBoundary from './components/common/ErrorBoundary';


const AppContent = () => {
  const { currentUser, currentRole } = useApp();
  
  // Navigation states
  const [activePage, setActivePage] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [demoModeActive, setDemoModeActive] = useState(false);

  // Cross-linking parameter: when clicking a tech, we load their profile
  const [selectedTechId, setSelectedTechId] = useState(null);

  // Reset active page to dashboard when user session changes to prevent session state leaks
  React.useEffect(() => {
    setActivePage('dashboard');
    setSelectedTechId(null);
  }, [currentUser?.username]);

  // If no user is authenticated, lock under LoginPage
  if (!currentUser) {
    return <LoginPage />;
  }

  // Active view router with robust Gated Role Access checks
  const renderActivePage = () => {
    switch (activePage) {
      case 'dashboard':
        return <DashboardPage setActivePage={setActivePage} />;
      case 'security-center':
        return <SecurityCenterPage />;
      case 'brigadas':
        return (
          <BrigadasPage 
            setActivePage={setActivePage} 
            setSelectedTechId={setSelectedTechId} 
          />
        );
      case 'tecnicos':
        return (
          <TecnicosPage 
            selectedTechId={selectedTechId} 
            setSelectedTechId={setSelectedTechId} 
          />
        );
      case 'personal':
        // Gated: only Developer, Gerente, Coordinador, Supervisor
        if (currentRole !== 'Developer' && currentRole !== 'Gerente' && currentRole !== 'Coordinador' && !currentRole?.startsWith('Supervisor')) {
          return <DashboardPage setActivePage={setActivePage} />;
        }
        return (
          <PersonalPage 
            setActivePage={setActivePage} 
            setSelectedTechId={setSelectedTechId} 
          />
        );
      case 'inventario':
        return <InventarioPage />;
      case 'actas':
        return <ActasPage />;
      case 'reposiciones':
        return <ReposicionesPage />;
      case 'swaps':
        return <SwapsPage />;
      case 'devoluciones':
        return <DevolucionesPage />;
      case 'usuarios':
        // Gated: only Developer, Gerente, Coordinador
        if (currentRole !== 'Developer' && currentRole !== 'Gerente' && currentRole !== 'Coordinador') {
          return <DashboardPage setActivePage={setActivePage} />;
        }
        return <UsuariosPage />;
      case 'auditoria':
        // Gated: only Developer
        if (currentRole !== 'Developer') {
          return <DashboardPage setActivePage={setActivePage} />;
        }
        return <AuditoriaPage />;
      case 'reportes':
        // Gated: only Developer, Gerente
        if (currentRole !== 'Developer' && currentRole !== 'Gerente') {
          return <DashboardPage setActivePage={setActivePage} />;
        }
        return <ReportesPage />;
      default:
        return <DashboardPage setActivePage={setActivePage} />;
    }
  };

  return (
    <div className="min-h-screen bg-industrial-bg flex relative">
      
      {/* Sidebar navigation */}
      <Sidebar 
        activePage={activePage} 
        setActivePage={(page) => {
          // If we navigate to technical files, keep selection or clear it
          if (page !== 'tecnicos') {
            setSelectedTechId(null);
          }
          setActivePage(page);
        }} 
        collapsed={sidebarCollapsed} 
        setCollapsed={setSidebarCollapsed} 
      />

      {/* Main workspace frame */}
      <div 
        className={`flex-grow min-h-screen flex flex-col transition-all duration-300 ${
          sidebarCollapsed ? 'pl-20' : 'pl-64'
        }`}
      >
        <Topbar 
          activePage={activePage} 
          demoModeActive={demoModeActive}
          onToggleDemoMode={() => setDemoModeActive(!demoModeActive)}
        />
        
        {/* Page contents wrap */}
        <main className="p-6 flex-grow bg-transparent relative z-10">
          {renderActivePage()}
        </main>
      </div>

      {demoModeActive && (
        <ExecutiveDemoStepper 
          activePage={activePage}
          setActivePage={setActivePage}
          onClose={() => setDemoModeActive(false)}
          onTriggerDemoAction={(step) => {
            window.dispatchEvent(new CustomEvent('demo-step-trigger', { detail: { step } }));
          }}
        />
      )}

    </div>
  );
};

const App = () => {
  return (
    <AppProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </AppProvider>
  );
};

export default App;
