import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  ShieldCheck, 
  Search, 
  Plus, 
  X, 
  Save, 
  Check, 
  UserX, 
  UserCheck, 
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  GitMerge,
  Users
} from 'lucide-react';

const UsuariosPage = () => {
  const { 
    currentRole,
    supervisores,
    coordinadores,
    brigadas,
    tecnicos,
    usuarios,
    saveUsuario,
    toggleUsuarioStatus
  } = useApp();

  // Search
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [operationError, setOperationError] = useState('');
  const [operationSuccess, setOperationSuccess] = useState('');
  const [savingUser, setSavingUser] = useState(false);
  const [activeTab, setActiveTab] = useState('Tabla'); // 'Tabla' | 'Jerarquía'

  // Read users directly from MySQL backend via context
  const systemUsers = usuarios || [];

  // Form states
  const [newUsername, setNewUsername] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('Supervisor');
  const [newZone, setNewZone] = useState('Noroeste Lote 4');

  const filteredUsers = systemUsers.filter(u => {
    return (u.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
           (u.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
           (u.role || '').toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleToggleUserStatus = (userId) => {
    toggleUsuarioStatus(userId);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setOperationError('');
    setOperationSuccess('');
    if (!newUsername || !newName) {
      setOperationError('Por favor complete todos los datos del operador.');
      return;
    }

    setSavingUser(true);
    const result = await saveUsuario({
      username: newUsername.toLowerCase().trim(),
      name: newName,
      role: newRole,
      zone: newZone
    });

    setSavingUser(false);
    if (!result?.success) {
      setOperationError(result?.message || 'No se pudo crear el operador en MySQL.');
      return;
    }

    setOperationSuccess(result.message || 'Operador creado correctamente en MySQL.');
    setShowNewUserModal(false);

    // Clear form
    setNewUsername('');
    setNewName('');
    setNewRole('Supervisor');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Activo': return 'bg-industrial-green/10 border-industrial-green/30 text-industrial-green';
      case 'Suspendido': return 'bg-industrial-red/10 border-industrial-red/30 text-industrial-red border-dashed animate-pulse';
      default: return 'bg-slate-500/10 border-slate-500/30 text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      {(operationError || operationSuccess) && (
        <div className={`glass-panel rounded-lg p-3 border text-xs font-bold ${
          operationError
            ? 'border-industrial-red text-industrial-red bg-industrial-red/5'
            : 'border-industrial-green text-industrial-green bg-industrial-green/5'
        }`}>
          {operationError || operationSuccess}
        </div>
      )}
      
      {/* Tab Selectors & Search bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between border-b border-industrial-border pb-4">
        
        {/* Toggle between hierarchy view and list view */}
        <div className="flex space-x-1 p-1 bg-industrial-bg bg-opacity-70 rounded border border-industrial-border font-semibold self-start">
          <button
            onClick={() => setActiveTab('Tabla')}
            className={`px-4 py-1.5 rounded text-xs tracking-wider uppercase transition-all ${
              activeTab === 'Tabla' 
                ? 'bg-industrial-cyan text-industrial-bg font-extrabold'
                : 'text-industrial-gray hover:text-white'
            }`}
          >
            Usuarios y Seguridad
          </button>
          <button
            onClick={() => setActiveTab('Jerarquía')}
            className={`px-4 py-1.5 rounded text-xs tracking-wider uppercase transition-all ${
              activeTab === 'Jerarquía' 
                ? 'bg-industrial-cyan text-industrial-bg font-extrabold'
                : 'text-industrial-gray hover:text-white'
            }`}
          >
            Visor Jerárquico
          </button>
        </div>

        {activeTab === 'Tabla' && (
          <div className="flex space-x-2 w-full md:w-auto justify-end">
            <div className="relative w-full sm:w-64">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-industrial-gray">
                <Search size={12} />
              </span>
              <input
                type="text"
                placeholder="Buscar operador por nombre o rol..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-industrial-bg bg-opacity-70 border border-industrial-border rounded px-3 py-1 text-xs text-white focus:outline-none focus:border-industrial-cyan"
              />
            </div>

            <button
              onClick={() => setShowNewUserModal(true)}
              className="flex items-center space-x-1 px-3 py-1 rounded bg-gradient-to-r from-industrial-cyan to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-industrial-bg text-xs font-extrabold uppercase tracking-wider transition-all shadow-cyan-glow"
            >
              <Plus size={12} />
              <span>Crear</span>
            </button>
          </div>
        )}

      </div>

      {/* Tab 1: Access List */}
      {activeTab === 'Tabla' ? (
        <div className="glass-panel rounded-lg overflow-hidden border-opacity-40">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-industrial-bg bg-opacity-80 text-industrial-gray font-bold uppercase tracking-wider border-b border-industrial-border text-[9px]">
                  <th className="p-4">Código Operador / Nombre</th>
                  <th className="p-4">Rol en Sistema</th>
                  <th className="p-4">Lote / Zona Asignada</th>
                  <th className="p-4">Seguridad Acceso</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-industrial-border font-semibold">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-industrial-border hover:bg-opacity-20 transition-all">
                    <td className="p-4">
                      <div className="font-bold text-white text-sm">@{u.username}</div>
                      <div className="text-[10px] text-industrial-gray font-bold uppercase tracking-wider mt-0.5">{u.name}</div>
                    </td>
                    <td className="p-4">
                      <span className="bg-industrial-border px-2 py-0.5 rounded text-[10px] text-industrial-cyan uppercase tracking-wider">
                        {u.role}
                      </span>
                    </td>
                    <td className="p-4 text-white text-[11px]">{u.zone}</td>
                    <td className="p-4">
                      <span className="text-[10px] text-industrial-gray font-semibold">Cifrado de Sesión: SHA-256</span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 border rounded text-[9px] uppercase font-bold tracking-wider ${getStatusColor(u.status)}`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      {(currentRole === 'Developer' || currentRole === 'Gerente') && u.username !== 'dev' ? (
                        <button
                          onClick={() => handleToggleUserStatus(u.id)}
                          className={`px-2 py-1 rounded text-[9px] font-extrabold uppercase tracking-wider transition-colors inline-flex items-center space-x-1 ${
                            u.status === 'Activo' 
                              ? 'bg-industrial-red/10 border border-industrial-red/35 text-industrial-red hover:bg-industrial-red/20' 
                              : 'bg-industrial-green/10 border border-industrial-green/35 text-industrial-green hover:bg-industrial-green/20'
                          }`}
                        >
                          {u.status === 'Activo' ? <UserX size={10} /> : <UserCheck size={10} />}
                          <span>{u.status === 'Activo' ? 'Suspender' : 'Activar'}</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-industrial-gray font-semibold">Bloqueado</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        
        /* Tab 2: Visual hierarchical operational tree visualizer */
        <div className="glass-panel rounded-lg p-8 space-y-8 relative overflow-hidden border-opacity-40">
          
          <div className="flex items-center justify-between border-b border-industrial-border pb-3 mb-6">
            <div className="flex items-center space-x-2 text-industrial-cyan">
              <GitMerge size={16} />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Esquema Jerárquico de Control Operativo Lote 4</h4>
            </div>
            <span className="text-[9px] text-industrial-gray font-semibold">Actualizado: En Vivo</span>
          </div>

          {/* Hierarchy Roots */}
          <div className="space-y-6 max-w-2xl mx-auto font-semibold">
            
            {/* Level 1: Coordinador William */}
            <div className="p-4 bg-industrial-cyan bg-opacity-5 border border-industrial-cyan rounded-lg shadow-cyan-glow flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-industrial-cyan flex items-center justify-center font-bold text-sm text-industrial-bg">
                  W
                </div>
                <div>
                  <h5 className="font-extrabold text-sm text-white leading-none">Coordinador William</h5>
                  <span className="text-[9px] text-industrial-gray uppercase font-bold mt-1 block">Roster General Lote 4 Noroeste</span>
                </div>
              </div>
              <span className="text-[9px] bg-industrial-border px-2 py-0.5 rounded text-white font-bold uppercase tracking-wider">Nivel 2 Jerárquico</span>
            </div>

            {/* Down Connector branch */}
            <div className="w-0.5 h-6 bg-gradient-to-b from-industrial-cyan to-industrial-orange ml-8" />

            {/* Level 2: Supervisors branch Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pl-4">
              
              {/* Supervisor 1 Branch: Isaac */}
              <div className="space-y-4">
                <div className="p-3 bg-industrial-orange bg-opacity-5 border border-industrial-orange rounded-lg shadow-orange-glow flex items-center space-x-3">
                  <div className="w-7 h-7 rounded-full bg-industrial-orange flex items-center justify-center font-bold text-xs text-industrial-bg">
                    I
                  </div>
                  <div>
                    <h5 className="font-extrabold text-xs text-white leading-none">Supervisor Isaac G.</h5>
                    <span className="text-[8px] text-industrial-gray uppercase font-bold mt-0.5 block">Supervisor TCT</span>
                  </div>
                </div>

                {/* Connectors to Brigades */}
                <div className="pl-6 space-y-2 border-l border-industrial-orange/30 ml-4 py-2">
                  {brigadas
                    .filter(b => b.supervisorId === 'SUP-001')
                    .map(b => (
                      <div key={b.id} className="p-2 bg-industrial-bg bg-opacity-40 border border-industrial-border rounded flex items-center justify-between text-[11px] hover:border-industrial-orange transition-colors">
                        <div>
                          <span className="text-white font-bold block">{b.id}</span>
                          <span className="text-[8px] text-industrial-gray uppercase font-semibold">{b.tipo} | Veh: {b.vehiculo}</span>
                        </div>
                        <span className="text-[9px] text-industrial-orange font-bold uppercase tracking-wider">Roster Ok</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Supervisor 2 Branch: Cristian */}
              <div className="space-y-4">
                <div className="p-3 bg-industrial-orange bg-opacity-5 border border-industrial-orange rounded-lg shadow-orange-glow flex items-center space-x-3">
                  <div className="w-7 h-7 rounded-full bg-industrial-orange flex items-center justify-center font-bold text-xs text-industrial-bg">
                    C
                  </div>
                  <div>
                    <h5 className="font-extrabold text-xs text-white leading-none">Supervisor Cristian P.</h5>
                    <span className="text-[8px] text-industrial-gray uppercase font-bold mt-0.5 block">Supervisor Mantenimiento</span>
                  </div>
                </div>

                {/* Connectors to Brigades */}
                <div className="pl-6 space-y-2 border-l border-industrial-orange/30 ml-4 py-2">
                  {brigadas
                    .filter(b => b.supervisorId === 'SUP-002')
                    .map(b => (
                      <div key={b.id} className="p-2 bg-industrial-bg bg-opacity-40 border border-industrial-border rounded flex items-center justify-between text-[11px] hover:border-industrial-orange transition-colors">
                        <div>
                          <span className="text-white font-bold block">{b.id}</span>
                          <span className="text-[8px] text-industrial-gray uppercase font-semibold">{b.tipo} | Veh: {b.vehiculo}</span>
                        </div>
                        <span className="text-[9px] text-industrial-orange font-bold uppercase tracking-wider">Roster Ok</span>
                      </div>
                    ))}
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* -------------------- MODAL: CREAR NUEVO OPERADOR -------------------- */}
      {showNewUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div 
            className="w-full max-w-md glass-panel rounded-lg p-6 border-neon-cyan"
            style={{ background: 'rgba(13, 21, 39, 0.95)' }}
          >
            <div className="flex items-center justify-between border-b border-industrial-border pb-3 mb-4">
              <div className="flex items-center space-x-2 text-white">
                <ShieldCheck size={18} className="text-industrial-cyan" />
                <h3 className="font-extrabold text-sm uppercase tracking-wider">CREAR NUEVO OPERADOR DE ERP</h3>
              </div>
              <button onClick={() => setShowNewUserModal(false)} className="text-industrial-gray hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4 text-xs font-semibold">
              {operationError && (
                <div className="p-3 rounded border border-industrial-red bg-industrial-red/10 text-industrial-red font-bold">
                  {operationError}
                </div>
              )}
              
              <div>
                <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Nombre Completo del Operador *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ej. Manuel Alejandro Santos..."
                  className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Código de Usuario *</label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="Ej. manuel..."
                    className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Rol Operacional *</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan"
                    required
                  >
                    <option value="Coordinador">Coordinador de Lote</option>
                    <option value="Supervisor TCT">Supervisor TCT</option>
                    <option value="Supervisor Mantenimiento">Supervisor Mantenimiento</option>
                    <option value="Gerente">Gerente Administrativo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Lote / Zona Asignada</label>
                <input
                  type="text"
                  value={newZone}
                  onChange={(e) => setNewZone(e.target.value)}
                  className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan"
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewUserModal(false)}
                  className="w-1/2 py-2 rounded bg-industrial-border hover:bg-opacity-60 text-white font-extrabold text-[10px] uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="w-1/2 py-2 rounded bg-industrial-cyan text-industrial-bg hover:bg-cyan-400 font-extrabold text-[10px] uppercase tracking-wider flex items-center justify-center space-x-1"
                >
                  <Save size={12} />
                  <span>{savingUser ? 'Creando...' : 'Crear Operador'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default UsuariosPage;
