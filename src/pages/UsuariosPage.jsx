import React, { useState, useEffect } from 'react';
import {
  Users, UserPlus, Shield, CheckCircle2, XCircle, Clock, Mail, X,
  Edit3, KeyRound, MapPin, CheckSquare, Square, ShieldAlert, History, Filter
} from 'lucide-react';
import { useApp } from '../context/AppContext';

const AVAILABLE_PERMISSIONS = [
  {
    categoria: 'Inventario de Activos',
    items: [
      { key: 'inv:ver', label: 'Ver catálogo de activos' },
      { key: 'inv:crear', label: 'Registrar nuevos activos' },
      { key: 'inv:editar', label: 'Modificar datos de activos' },
      { key: 'inv:movimientos_registrar', label: 'Registrar movimientos de stock' },
      { key: 'inv:movimientos_ver', label: 'Consultar historial de movimientos' },
      { key: 'inv:eliminar', label: 'Desactivar / retirar activos' }
    ]
  },
  {
    categoria: 'Levantamientos y Auditorías en Campo',
    items: [
      { key: 'lev:ver', label: 'Ver levantamientos de su campamento' },
      { key: 'lev:crear', label: 'Crear nuevas sesiones de levantamiento' },
      { key: 'lev:capturar', label: 'Capturar artículos en levantamiento' },
      { key: 'lev:editar', label: 'Modificar artículos de la auditoría' },
      { key: 'lev:importar', label: 'Importar lotes desde Excel' },
      { key: 'lev:consolidar', label: 'Consolidar levantamiento al maestro' }
    ]
  },
  {
    categoria: 'Reportes y Exportación',
    items: [
      { key: 'rep:ver', label: 'Ver reportes consolidados' },
      { key: 'rep:exportar', label: 'Exportar datos a Excel / CSV' },
      { key: 'rep:imprimir', label: 'Generar impresiones y etiquetas' }
    ]
  },
  {
    categoria: 'Campamentos y Sedes Operativas',
    items: [
      { key: 'camp:ver', label: 'Ver listado de campamentos autorizados' },
      { key: 'camp:stock', label: 'Ver balances y stock de campamento' },
      { key: 'camp:operar', label: 'Gestionar almacenes y bodegas' }
    ]
  }
];

const DEFAULT_ROLE_PERMISSIONS = {
  admin: [
    'inv:ver', 'inv:crear', 'inv:editar', 'inv:movimientos_registrar', 'inv:movimientos_ver',
    'lev:ver', 'lev:crear', 'lev:capturar', 'lev:editar', 'lev:importar', 'lev:consolidar',
    'rep:ver', 'rep:exportar', 'rep:imprimir',
    'camp:ver', 'camp:stock', 'camp:operar'
  ],
  almacen: [
    'inv:ver', 'inv:crear', 'inv:movimientos_registrar', 'inv:movimientos_ver',
    'lev:ver', 'lev:crear', 'lev:capturar',
    'camp:ver', 'camp:stock'
  ],
  supervisor: [
    'inv:ver', 'inv:crear', 'inv:editar', 'inv:movimientos_ver',
    'lev:ver', 'lev:crear', 'lev:capturar', 'lev:editar', 'lev:importar', 'lev:consolidar',
    'rep:ver', 'rep:exportar',
    'camp:ver', 'camp:stock'
  ],
  auditor: [
    'inv:ver', 'inv:movimientos_ver',
    'lev:ver',
    'rep:ver', 'rep:exportar', 'rep:imprimir',
    'camp:ver', 'camp:stock'
  ],
  gerencia: [
    'inv:ver', 'inv:movimientos_ver',
    'lev:ver',
    'rep:ver', 'rep:exportar', 'rep:imprimir',
    'camp:ver', 'camp:stock'
  ]
};

export default function UsuariosPage() {
  const {
    currentUser, currentRole, fetchUsuarios, createUsuario,
    updateUsuario, updateUsuarioEstado, updateUsuarioPermisos,
    recoverUsuarioPassword, fetchUsuariosAuditoria, fetchCampamentos, showToast
  } = useApp();

  const isDeveloper = currentRole === 'developer' || currentUser?.es_developer === 1;

  const [usuarios, setUsuarios] = useState([]);
  const [campamentos, setCampamentos] = useState([]);
  const [auditorias, setAuditorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('usuarios'); // 'usuarios' | 'auditoria'

  // Modal Crear / Editar Usuario
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [userFormData, setUserFormData] = useState({
    nombre: '',
    email: '',
    password: '',
    rol: 'almacen',
    cargo: '',
    area: 'Almacén',
    campamento_id: '',
    campamentos_adicionales: [],
    permisos: []
  });
  const [submittingUser, setSubmittingUser] = useState(false);

  // Modal Restablecer Contraseña
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordUserId, setPasswordUserId] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [submittingPassword, setSubmittingPassword] = useState(false);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [uRes, cRes] = await Promise.all([
        fetchUsuarios(),
        fetchCampamentos()
      ]);
      if (uRes.success) setUsuarios(uRes.usuarios || []);
      if (cRes.success) setCampamentos(cRes.campamentos || []);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAuditorias = async () => {
    try {
      const res = await fetchUsuariosAuditoria();
      if (res.success) setAuditorias(res.logs || []);
    } catch (err) {
      console.error('Error loading auditorias:', err);
    }
  };

  useEffect(() => {
    if (isDeveloper) {
      loadAllData();
    }
  }, [isDeveloper]);

  useEffect(() => {
    if (activeTab === 'auditoria') {
      loadAuditorias();
    }
  }, [activeTab]);

  // Si no es developer, acceso denegado total
  if (!isDeveloper) {
    return (
      <div className="bg-white rounded-3xl p-10 border border-slate-200 shadow-sm text-center max-w-xl mx-auto my-12 space-y-4">
        <div className="w-16 h-16 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-center text-rose-600 mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-900">Acceso Exclusivo Reservado</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          La administración centralizada de usuarios, asignación de campamentos y configuración de matriz de permisos está restringida exclusivamente para el <span className="font-bold text-slate-800">Desarrollador Principal</span> de INGMELEC.
        </p>
      </div>
    );
  }

  const handleOpenCreateModal = () => {
    setEditingUserId(null);
    setUserFormData({
      nombre: '',
      email: '',
      password: '',
      rol: 'almacen',
      cargo: '',
      area: 'Almacén',
      campamento_id: campamentos.length > 0 ? String(campamentos[0].id) : '',
      campamentos_adicionales: [],
      permisos: DEFAULT_ROLE_PERMISSIONS.almacen || []
    });
    setShowUserModal(true);
  };

  const handleOpenEditModal = (u) => {
    setEditingUserId(u.id);
    const assignedIds = (u.campamentos || []).map(c => c.id);
    const principalId = u.campamento_id ? String(u.campamento_id) : (assignedIds.length > 0 ? String(assignedIds[0]) : '');
    const additionalIds = assignedIds.filter(id => String(id) !== principalId);

    setUserFormData({
      nombre: u.nombre || '',
      email: u.email || '',
      password: '', // Dejar en blanco para no modificar
      rol: u.rol || 'almacen',
      cargo: u.cargo || '',
      area: u.area || 'Almacén',
      campamento_id: principalId,
      campamentos_adicionales: additionalIds,
      permisos: Array.isArray(u.permisos) ? u.permisos : (DEFAULT_ROLE_PERMISSIONS[u.rol] || [])
    });
    setShowUserModal(true);
  };

  const handleRoleChange = (newRole) => {
    const suggestedPerms = DEFAULT_ROLE_PERMISSIONS[newRole] || [];
    setUserFormData(prev => ({
      ...prev,
      rol: newRole,
      permisos: suggestedPerms
    }));
  };

  const togglePermission = (permKey) => {
    setUserFormData(prev => {
      const exists = prev.permisos.includes(permKey);
      return {
        ...prev,
        permisos: exists
          ? prev.permisos.filter(p => p !== permKey)
          : [...prev.permisos, permKey]
      };
    });
  };

  const selectAllPermissions = () => {
    const all = [];
    AVAILABLE_PERMISSIONS.forEach(cat => cat.items.forEach(i => all.push(i.key)));
    setUserFormData(prev => ({ ...prev, permisos: all }));
  };

  const toggleAdditionalCampamento = (cId) => {
    setUserFormData(prev => {
      const exists = prev.campamentos_adicionales.includes(cId);
      return {
        ...prev,
        campamentos_adicionales: exists
          ? prev.campamentos_adicionales.filter(id => id !== cId)
          : [...prev.campamentos_adicionales, cId]
      };
    });
  };

  const handleSubmitUser = async (e) => {
    e.preventDefault();
    setSubmittingUser(true);
    try {
      const allCampamentos = [];
      if (userFormData.campamento_id) {
        allCampamentos.push(parseInt(userFormData.campamento_id));
      }
      userFormData.campamentos_adicionales.forEach(id => {
        if (!allCampamentos.includes(id)) allCampamentos.push(id);
      });

      const payload = {
        nombre: userFormData.nombre.trim(),
        email: userFormData.email.trim().toLowerCase(),
        rol: userFormData.rol,
        cargo: userFormData.cargo.trim(),
        area: userFormData.area.trim(),
        campamento_id: userFormData.campamento_id ? parseInt(userFormData.campamento_id) : null,
        campamentos: allCampamentos,
        permisos: userFormData.permisos
      };

      if (!editingUserId) {
        payload.password = userFormData.password;
        const res = await createUsuario(payload);
        if (res.success) {
          setShowUserModal(false);
          loadAllData();
        }
      } else {
        const res = await updateUsuario(editingUserId, payload);
        if (res.success) {
          setShowUserModal(false);
          loadAllData();
        }
      }
    } finally {
      setSubmittingUser(false);
    }
  };

  const handleToggleEstado = async (u) => {
    const nuevoEstado = u.activo === 1 ? 0 : 1;
    const res = await updateUsuarioEstado(u.id, nuevoEstado);
    if (res.success) {
      loadAllData();
    }
  };

  const handleOpenPasswordReset = (u) => {
    setPasswordUserId(u.id);
    setNewPassword('');
    setShowPasswordModal(true);
  };

  const handleSubmitPasswordReset = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      showToast('La nueva contraseña debe tener mínimo 8 caracteres.', 'error');
      return;
    }
    setSubmittingPassword(true);
    try {
      const res = await recoverUsuarioPassword(passwordUserId, newPassword);
      if (res.success) {
        setShowPasswordModal(false);
      }
    } finally {
      setSubmittingPassword(false);
    }
  };

  const getRoleBadge = (rol) => {
    switch (rol) {
      case 'developer':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/10 text-amber-700 border border-amber-500/30 uppercase">Developer</span>;
      case 'admin':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">Admin Operativo</span>;
      case 'almacen':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#F28524]/20 text-[#F28524] border border-[#F28524]/30">Almacén</span>;
      case 'supervisor':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">Supervisor</span>;
      case 'gerencia':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">Gerencia</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">Auditor</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center space-x-2 px-3 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded-full text-[11px] font-bold text-amber-400 uppercase tracking-wider">
            <span>Control Exclusivo del Desarrollador Principal</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center space-x-2">
            <Users className="w-6 h-6 text-[#F28524]" />
            <span>Administración Central de Usuarios y Multi-Almacén</span>
          </h1>
          <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
            Gestión integral de credenciales, roles operativos, asignación territorial por campamentos y matriz granular de permisos para INGMELEC ALMACÉN GENERAL.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2.5 bg-[#F28524] hover:bg-[#d87019] text-white rounded-xl text-xs font-bold shadow-lg shadow-[#F28524]/25 flex items-center space-x-2 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            <span>Crear Nuevo Usuario</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('usuarios')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
            activeTab === 'usuarios'
              ? 'bg-[#F28524] text-white shadow-md shadow-[#F28524]/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Usuarios Activos ({usuarios.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('auditoria')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
            activeTab === 'auditoria'
              ? 'bg-[#F28524] text-white shadow-md shadow-[#F28524]/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Bitácora de Modificaciones de Acceso</span>
        </button>
      </div>

      {/* Main Tab: Usuarios List */}
      {activeTab === 'usuarios' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-600 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Usuario / Cargo</th>
                  <th className="py-3 px-4">Correo Institucional</th>
                  <th className="py-3 px-4">Rol Operativo</th>
                  <th className="py-3 px-4">Campamentos Asignados</th>
                  <th className="py-3 px-4 text-center">Permisos</th>
                  <th className="py-3 px-4 text-center">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan="7" className="py-12 text-center text-slate-400">
                      Cargando listado de usuarios...
                    </td>
                  </tr>
                ) : usuarios.map(u => (
                  <tr key={u.id} className={`hover:bg-slate-50/70 transition-colors ${u.activo === 0 ? 'bg-slate-50/50 opacity-60' : ''}`}>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 flex items-center space-x-1.5">
                        <span>{u.nombre}</span>
                        {u.es_developer === 1 && (
                          <span className="text-[10px] bg-amber-500 text-white font-mono px-1.5 py-0.2 rounded font-bold">DEV</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">{u.cargo || 'Funcionario'}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-mono text-[11px]">
                      {u.email}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {getRoleBadge(u.rol)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {u.es_developer === 1 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            Acceso Global a Todas las Sedes
                          </span>
                        ) : (u.campamentos && u.campamentos.length > 0) ? (
                          u.campamentos.map(c => (
                            <span
                              key={c.id}
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                                c.es_principal
                                  ? 'bg-[#F28524]/10 text-[#F28524] border-[#F28524]/30 font-bold'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              <MapPin className="w-2.5 h-2.5 mr-0.5" />
                              {c.nombre} {c.es_principal ? '(Principal)' : ''}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Sin sede asignada</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {u.permisos?.includes('*') ? 'TOTAL (*)' : `${(u.permisos || []).length} asignados`}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {u.es_developer === 1 ? (
                        <span className="inline-flex items-center text-emerald-700 font-bold text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Activo Permanente
                        </span>
                      ) : (
                        <button
                          onClick={() => handleToggleEstado(u)}
                          title={`Click para ${u.activo === 1 ? 'desactivar' : 'activar'} cuenta`}
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold transition-all border ${
                            u.activo === 1
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
                          }`}
                        >
                          {u.activo === 1 ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Activo
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3 mr-1" /> Inactivo
                            </>
                          )}
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => handleOpenPasswordReset(u)}
                          title="Restablecer Contraseña"
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(u)}
                          title="Editar Datos y Permisos"
                          className="p-1.5 text-slate-500 hover:text-[#F28524] hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Auditoria de Usuarios */}
      {activeTab === 'auditoria' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-600">
              Registro Trazable de Operaciones de Administración
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">Últimas {auditorias.length} entradas</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-600 font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-4">Fecha / Hora</th>
                  <th className="py-2.5 px-4">Ejecutado Por</th>
                  <th className="py-2.5 px-4">Acción</th>
                  <th className="py-2.5 px-4">Usuario Afectado</th>
                  <th className="py-2.5 px-4">Detalles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {auditorias.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-slate-400">
                      No hay registros recientes en la bitácora de usuarios.
                    </td>
                  </tr>
                ) : auditorias.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 text-slate-500">
                      {new Date(log.fecha).toLocaleString('es-DO')}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-slate-800">
                      {log.usuario_nombre}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        {log.accion}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">
                      ID #{log.entidad_id}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 max-w-md truncate font-sans text-xs">
                      {log.detalles_nuevos || log.detalles_previos || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Crear / Editar Usuario */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200 my-8">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base flex items-center space-x-2">
                  <Shield className="w-5 h-5 text-[#F28524]" />
                  <span>{editingUserId ? 'Modificar Usuario y Permisos Granulares' : 'Alta de Nuevo Usuario'}</span>
                </h3>
                <p className="text-xs text-slate-400">Configuración territorial y matriz de privilegios en MySQL</p>
              </div>
              <button onClick={() => setShowUserModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitUser} className="p-6 space-y-6 text-xs max-h-[80vh] overflow-y-auto">
              {/* Sección 1: Datos Básicos */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-1">
                  1. Datos de Cuenta y Perfil
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Nombre Completo *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Ing. Rafael Mejía"
                      value={userFormData.nombre}
                      onChange={e => setUserFormData({ ...userFormData, nombre: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Correo Electrónico *</label>
                    <input
                      type="email"
                      required
                      placeholder="usuario@ingmelec.com"
                      value={userFormData.email}
                      onChange={e => setUserFormData({ ...userFormData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                    />
                  </div>

                  {!editingUserId && (
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Contraseña Inicial *</label>
                      <input
                        type="password"
                        required
                        placeholder="Mínimo 8 caracteres..."
                        value={userFormData.password}
                        onChange={e => setUserFormData({ ...userFormData, password: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Rol Operativo *</label>
                    <select
                      value={userFormData.rol}
                      onChange={e => handleRoleChange(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#F28524] focus:outline-none font-semibold text-slate-800"
                    >
                      <option value="almacen">Almacén (Encargado de inventario)</option>
                      <option value="supervisor">Supervisor de Operaciones</option>
                      <option value="admin">Administrador Operativo (Sin gestión de usuarios)</option>
                      <option value="auditor">Auditor de Control Interno</option>
                      <option value="gerencia">Gerencia General</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Cargo Institucional</label>
                    <input
                      type="text"
                      placeholder="Ej. Encargado Almacén San Cristóbal"
                      value={userFormData.cargo}
                      onChange={e => setUserFormData({ ...userFormData, cargo: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Área Funcional</label>
                    <input
                      type="text"
                      placeholder="Ej. Almacén Central, Logística..."
                      value={userFormData.area}
                      onChange={e => setUserFormData({ ...userFormData, area: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Sección 2: Asignación de Campamentos */}
              <div className="space-y-4 pt-2">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-1">
                  2. Asignación Territorial de Campamentos
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Campamento Principal *</label>
                    <select
                      value={userFormData.campamento_id}
                      onChange={e => setUserFormData({ ...userFormData, campamento_id: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#F28524] focus:outline-none font-medium"
                    >
                      <option value="">-- Seleccionar Sede Principal --</option>
                      {campamentos.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} ({c.provincia || 'Sede'})
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">Sede predeterminada al iniciar sesión.</p>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Sedes Autorizadas Adicionales</label>
                    <div className="p-3 border border-slate-200 rounded-xl space-y-2 max-h-32 overflow-y-auto bg-slate-50/50">
                      {campamentos
                        .filter(c => String(c.id) !== String(userFormData.campamento_id))
                        .map(c => {
                          const isChecked = userFormData.campamentos_adicionales.includes(c.id);
                          return (
                            <label key={c.id} className="flex items-center space-x-2 cursor-pointer text-slate-700 hover:text-slate-900">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleAdditionalCampamento(c.id)}
                                className="rounded text-[#F28524] focus:ring-[#F28524]"
                              />
                              <span className="font-medium">{c.nombre}</span>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sección 3: Matriz de Permisos */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    3. Matriz Granular de Privilegios (Mínimo Privilegio)
                  </h4>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => handleRoleChange(userFormData.rol)}
                      className="text-[11px] text-[#F28524] hover:underline font-semibold"
                    >
                      Restaurar valores del rol
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={selectAllPermissions}
                      className="text-[11px] text-slate-600 hover:text-slate-900 font-semibold"
                    >
                      Seleccionar todos
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {AVAILABLE_PERMISSIONS.map(cat => (
                    <div key={cat.categoria} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="font-bold text-slate-800 text-[11px] flex items-center space-x-1">
                        <CheckSquare className="w-3.5 h-3.5 text-[#F28524]" />
                        <span>{cat.categoria}</span>
                      </div>
                      <div className="space-y-1 pl-1">
                        {cat.items.map(item => {
                          const isChecked = userFormData.permisos.includes(item.key) || userFormData.permisos.includes('*');
                          return (
                            <label key={item.key} className="flex items-center space-x-2 cursor-pointer text-slate-700 hover:text-slate-900 text-[11px]">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => togglePermission(item.key)}
                                className="rounded text-[#F28524] focus:ring-[#F28524]"
                              />
                              <span className="font-mono text-[10px] text-slate-400">{item.key}</span>
                              <span>·</span>
                              <span>{item.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingUser}
                  className="px-6 py-2 bg-[#F28524] hover:bg-[#d87019] text-white rounded-xl font-bold shadow-md shadow-[#F28524]/20"
                >
                  {submittingUser ? 'Guardando en MySQL...' : (editingUserId ? 'Guardar Cambios' : 'Crear Usuario')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Restablecer Contraseña */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center space-x-2">
                <KeyRound className="w-4 h-4 text-[#F28524]" />
                <span>Restablecer Contraseña Directa</span>
              </h3>
              <button onClick={() => setShowPasswordModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitPasswordReset} className="p-5 space-y-4 text-xs">
              <p className="text-slate-500 text-[11px]">
                Introduzca la nueva contraseña institucional. El hash PBKDF2 se generará de manera segura en MariaDB.
              </p>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nueva Contraseña *</label>
                <input
                  type="password"
                  required
                  placeholder="Mínimo 8 caracteres..."
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#F28524] focus:outline-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="px-3 py-1.5 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingPassword}
                  className="px-4 py-1.5 bg-[#F28524] hover:bg-[#d87019] text-white rounded-lg font-bold shadow"
                >
                  {submittingPassword ? 'Aplicando...' : 'Aplicar Nueva Clave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
