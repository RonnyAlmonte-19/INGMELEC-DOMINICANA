import React from 'react';
import { useApp } from '../../context/AppContext';
import { 
  LayoutDashboard, 
  Users, 
  UserCheck, 
  Boxes, 
  FileText, 
  AlertTriangle, 
  ArrowLeftRight, 
  RotateCcw, 
  ShieldAlert, 
  Terminal, 
  BarChart3, 
  LogOut,
  ChevronLeft,
  ChevronRight,
  Settings,
  Radio,
  Lock
} from 'lucide-react';

const Sidebar = ({ activePage, setActivePage, collapsed, setCollapsed }) => {
  const { currentRole, currentUser, logoutUser } = useApp();

  if (!currentUser) return null;

  // Full set of links
  const allLinks = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['Developer', 'Gerente', 'Coordinador', 'Supervisor'] },
    { id: 'security-center', label: 'Security Center', icon: Lock, roles: ['Developer', 'Gerente', 'Coordinador', 'Supervisor'] },
    { id: 'brigadas', label: 'Brigadas', icon: Users, roles: ['Developer', 'Gerente', 'Coordinador', 'Supervisor'] },
    { id: 'tecnicos', label: 'Expediente Técnico', icon: UserCheck, roles: ['Developer', 'Gerente', 'Coordinador', 'Supervisor'] },
    { id: 'personal', label: 'Personal', icon: Users, roles: ['Developer', 'Gerente', 'Coordinador', 'Supervisor'] },
    { id: 'inventario', label: 'Almacén Central', icon: Boxes, roles: ['Developer', 'Gerente', 'Coordinador', 'Supervisor'] },
    { id: 'actas', label: 'Actas de Entrega', icon: FileText, roles: ['Developer', 'Gerente', 'Coordinador', 'Supervisor'] },
    { id: 'reposiciones', label: 'Reposiciones / Daños', icon: AlertTriangle, roles: ['Developer', 'Gerente', 'Coordinador', 'Supervisor'] },
    { id: 'swaps', label: 'Sustituciones / Swaps', icon: ArrowLeftRight, roles: ['Developer', 'Gerente', 'Coordinador', 'Supervisor'] },
    { id: 'devoluciones', label: 'Devoluciones', icon: RotateCcw, roles: ['Developer', 'Gerente', 'Coordinador', 'Supervisor'] },
    { id: 'usuarios', label: 'Usuarios y Jerarquía', icon: ShieldAlert, roles: ['Developer', 'Gerente', 'Coordinador'] },
    { id: 'auditoria', label: 'Auditoría de Sistema', icon: Terminal, roles: ['Developer'] },
    { id: 'reportes', label: 'Centro de Reportes', icon: BarChart3, roles: ['Developer', 'Gerente'] }
  ];

  // Filter links based on current role (treating roles starting with Supervisor as Supervisor)
  const visibleLinks = allLinks.filter(link => {
    return link.roles.some(r => {
      if (r === 'Supervisor' && currentRole?.startsWith('Supervisor')) {
        return true;
      }
      return r === currentRole;
    });
  });

  return (
    <aside 
      className={`fixed top-0 left-0 h-screen z-35 bg-industrial-panel border-r border-industrial-border transition-all duration-300 flex flex-col justify-between ${collapsed ? 'w-20' : 'w-64'}`}
    >
      {/* Brand Logo & Pulsar */}
      <div>
        <div className="h-16 flex items-center justify-between px-4 border-b border-industrial-border">
          {!collapsed ? (
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white shadow-sm flex-shrink-0">
                <svg viewBox="0 0 100 100" className="w-5 h-5" fill="none">
                  <circle cx="50" cy="50" r="8" fill="#f28524" />
                  <ellipse cx="50" cy="50" rx="35" ry="12" stroke="#ffffff" strokeWidth="3" transform="rotate(-30 50 50)" />
                  <ellipse cx="50" cy="50" rx="35" ry="12" stroke="#f28524" strokeWidth="3" transform="rotate(30 50 50)" />
                </svg>
              </div>
              <div>
                <span className="font-extrabold text-slate-800 tracking-tight text-sm block">Ingmelec</span>
                <span className="font-bold text-[#f28524] text-[9px] tracking-widest block -mt-1">DOMINICANA</span>
              </div>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white mx-auto shadow-sm">
              <svg viewBox="0 0 100 100" className="w-5 h-5" fill="none">
                <circle cx="50" cy="50" r="8" fill="#f28524" />
                <ellipse cx="50" cy="50" rx="35" ry="12" stroke="#ffffff" strokeWidth="3" transform="rotate(-30 50 50)" />
                <ellipse cx="50" cy="50" rx="35" ry="12" stroke="#f28524" strokeWidth="3" transform="rotate(30 50 50)" />
              </svg>
            </div>
          )}

          {/* Collapse toggle button */}
          <button 
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded bg-industrial-bg border border-industrial-border text-industrial-gray hover:text-industrial-cyan hover:border-industrial-cyan transition-colors"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Role Identity Card */}
        <div className={`p-4 border-b border-industrial-border bg-industrial-bg bg-opacity-40 ${collapsed ? 'text-center' : ''}`}>
          {!collapsed ? (
            <div>
              <p className="text-xs text-industrial-gray font-bold uppercase tracking-wider">Nivel Operativo</p>
              <div className="flex items-center space-x-2 mt-1">
                <span className={`w-2.5 h-2.5 rounded-full ${
                  currentRole === 'Developer' ? 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]' :
                  currentRole === 'Gerente' ? 'bg-industrial-green shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
                  currentRole === 'Coordinador' ? 'bg-industrial-cyan shadow-[0_0_8px_rgba(0,240,255,0.5)]' :
                  'bg-industrial-orange shadow-[0_0_8px_rgba(255,107,0,0.5)]'
                }`} />
                <span className="font-bold text-xs tracking-wide text-slate-800 uppercase">{currentRole}</span>
              </div>
              <p className="text-sm text-slate-700 font-bold mt-1 truncate">{currentUser.name}</p>
            </div>
          ) : (
            <div className="flex justify-center">
              <span className={`w-3.5 h-3.5 rounded-full ${
                currentRole === 'Developer' ? 'bg-purple-500' :
                currentRole === 'Gerente' ? 'bg-industrial-green' :
                currentRole === 'Coordinador' ? 'bg-industrial-cyan' :
                'bg-industrial-orange'
              } shadow-cyan-glow`} title={`${currentRole}: ${currentUser.name}`} />
            </div>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-260px)]">
          {visibleLinks.map((link) => {
            const Icon = link.icon;
            const isActive = activePage === link.id;

            return (
              <button
                key={link.id}
                onClick={() => setActivePage(link.id)}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-md font-bold text-sm tracking-wide transition-all group relative ${
                  isActive 
                    ? 'bg-industrial-border text-industrial-cyan shadow-sm border-l-2 border-industrial-cyan font-extrabold'
                    : 'text-industrial-gray hover:text-slate-800 hover:bg-industrial-border hover:bg-opacity-40'
                }`}
              >
                <Icon size={16} className={`flex-shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-industrial-cyan' : 'text-industrial-gray group-hover:text-slate-800'}`} />
                
                {!collapsed && <span className="truncate">{link.label}</span>}

                {/* Collapsed Tooltip */}
                {collapsed && (
                  <span className="absolute left-16 scale-0 rounded bg-industrial-panel border border-industrial-border px-2 py-1 text-xs text-slate-800 group-hover:scale-100 transition-all z-50 whitespace-nowrap shadow-panel-glow">
                    {link.label}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Profile Controls */}
      <div>
        <div className="p-3 border-t border-industrial-border">
          {/* Settings Mock Link */}
          {!collapsed ? (
            <button 
              onClick={() => alert('Parámetros avanzados de Ingmelec Dominicana configurados bajo redundancia.')}
              className="w-full flex items-center space-x-3 px-3 py-2 text-industrial-gray hover:text-industrial-cyan transition-colors rounded-md text-xs font-semibold"
            >
              <Settings size={16} className="text-industrial-gray" />
              <span>Configuración</span>
            </button>
          ) : (
            <button 
              onClick={() => alert('Parámetros avanzados de Ingmelec Dominicana configurados bajo redundancia.')}
              className="w-full flex justify-center py-2 text-industrial-gray hover:text-industrial-cyan transition-colors"
              title="Configuración"
            >
              <Settings size={16} />
            </button>
          )}

          {/* Logout Trigger */}
          <button 
            onClick={logoutUser}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 mt-2 rounded-md font-semibold text-xs tracking-wide text-industrial-red bg-red-500 bg-opacity-5 hover:bg-opacity-15 transition-all ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <LogOut size={16} />
            {!collapsed && <span>Cerrar Sesión</span>}
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
