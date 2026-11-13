import React from 'react';
import {
  LayoutDashboard, Package, Laptop, Building2, UtensilsCrossed,
  Wrench, MapPin, ArrowRightLeft, ClipboardCheck, BarChart3, ShieldCheck,
  Users, ChevronLeft, ChevronRight, LogOut, Lock, X
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import IngmelecLogo from '../common/IngmelecLogo';
import { canAccessModule, isDeveloperUser } from '../../utils/permissions';
import { toSafeDisplayString } from '../../utils/jsonFormat';

export default function Sidebar({ activePage, setActivePage, collapsed, setCollapsed, mobileOpen = false, onCloseMobile = () => {} }) {
  const { logout, currentUser, kpis, activeCampamento } = useApp();

  const isDev = isDeveloperUser(currentUser);
  const subtitle = isDev
    ? 'Almacén General'
    : (activeCampamento?.nombre
      ? `Almacén ${toSafeDisplayString(activeCampamento.nombre, 'General')}`
      : (currentUser?.campamento_nombre
        ? `Almacén ${toSafeDisplayString(currentUser.campamento_nombre, 'General')}`
        : 'Almacén General'));

  const navigationItems = [
    { id: 'dashboard', label: 'Dashboard General', icon: LayoutDashboard, section: 'PRINCIPAL' },
    { id: 'inventario', label: 'Inventario Maestro', icon: Package, badge: kpis?.totalArticulos != null ? String(kpis.totalArticulos) : null, section: 'CATÁLOGO' },
    { id: 'informatica', label: 'Informática y Telecom', icon: Laptop, badge: kpis?.porArea?.INFORMATICA != null ? String(kpis.porArea.INFORMATICA) : null, section: 'CATÁLOGO' },
    { id: 'oficinas', label: 'Oficinas y Mobiliario', icon: Building2, badge: kpis?.porArea?.OFICINAS != null ? String(kpis.porArea.OFICINAS) : null, section: 'CATÁLOGO' },
    { id: 'cocina', label: 'Cocina y Comedor', icon: UtensilsCrossed, badge: kpis?.porArea?.COCINA != null ? String(kpis.porArea.COCINA) : null, section: 'CATÁLOGO' },
    { id: 'almacen', label: 'Almacén y Herramientas', icon: Wrench, badge: kpis?.porArea?.ALMACEN != null ? String(kpis.porArea.ALMACEN) : null, section: 'CATÁLOGO' },
    { id: 'levantamientos', label: 'Levantamientos y Auditorías', icon: ClipboardCheck, section: 'OPERACIONES' },
    { id: 'ubicaciones', label: 'Sedes y Campamentos', icon: MapPin, section: 'OPERACIONES' },
    { id: 'movimientos', label: 'Movimientos de Stock', icon: ArrowRightLeft, section: 'OPERACIONES' },
    { id: 'reportes', label: 'Centro de Reportes', icon: BarChart3, section: 'GESTIÓN' },
    { id: 'auditoria', label: 'Bitácora de Auditoría', icon: ShieldCheck, section: 'GESTIÓN' },
    { id: 'usuarios', label: 'Usuarios y Permisos', icon: Users, section: 'ADMINISTRACIÓN' }
  ];

  const filteredItems = navigationItems.filter((item) => canAccessModule(currentUser, item.id));

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm md:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        aria-label="Navegación principal"
        className={`fixed left-0 top-0 bottom-0 z-50 bg-slate-900 text-white flex flex-col transition-all duration-300 border-r border-slate-800 ${
          collapsed ? 'md:w-20' : 'md:w-64'
        } w-64 transform ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          {!collapsed ? (
            <div className="flex flex-col min-w-0">
              <IngmelecLogo className="h-10 w-auto" variant="light" />
              <span className="text-[10px] font-black tracking-widest text-[#F28524] uppercase mt-1 pl-1 truncate">
                {subtitle}
              </span>
            </div>
          ) : (
            <div className="mx-auto font-black text-xl text-[#F28524]">
              ING
            </div>
          )}

          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Cerrar menú lateral"
              className="md:hidden p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              className="hidden md:inline-flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
              aria-label={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Navigation List */}
        <nav aria-label="Módulos del sistema" className="flex-1 py-4 px-3 overflow-y-auto space-y-1">
        {filteredItems.length === 0 ? (
          !collapsed ? (
            <div
              data-testid="sidebar-no-modules"
              className="mx-1 mt-2 p-3 rounded-xl bg-slate-800/70 border border-slate-700/80 text-slate-300 space-y-1.5"
            >
              <div className="flex items-center space-x-2 text-xs font-bold text-[#F28524]">
                <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Sin módulos asignados</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Tu perfil aún no tiene módulos habilitados. Solicita acceso al Desarrollador Principal.
              </p>
            </div>
          ) : (
            <div
              data-testid="sidebar-no-modules"
              title="Sin módulos asignados"
              className="flex justify-center py-4 text-slate-500"
            >
              <Lock className="w-4 h-4" />
            </div>
          )
        ) : (
          filteredItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            const showSection = !collapsed && (index === 0 || filteredItems[index - 1]?.section !== item.section);

            return (
              <React.Fragment key={item.id}>
                {showSection && (
                  <div className="px-3 pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    {item.section}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setActivePage(item.id);
                    onCloseMobile();
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[#F28524] text-white shadow-lg shadow-[#F28524]/20'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center space-x-3 truncate">
                    <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </div>

                  {!collapsed && item.badge && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold font-mono ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              </React.Fragment>
            );
          })
        )}
        </nav>

        {/* User profile & Logout */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/50">
        {!collapsed ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5 truncate">
              <div className="w-8 h-8 rounded-xl bg-[#F28524]/20 border border-[#F28524]/40 flex items-center justify-center font-bold text-xs text-[#F28524] uppercase">
                {currentUser?.nombre ? toSafeDisplayString(currentUser.nombre, 'US').substring(0, 2) : 'US'}
              </div>
              <div className="truncate">
                <div className="font-bold text-xs text-white truncate">{toSafeDisplayString(currentUser?.nombre, 'Usuario')}</div>
                <div className="text-[10px] text-slate-400 capitalize">{toSafeDisplayString(currentUser?.rol, '')}</div>
              </div>
            </div>

            <button
              onClick={logout}
              title="Cerrar sesión"
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={logout}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="w-full py-2 flex justify-center text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </aside>
    </>
  );
}
