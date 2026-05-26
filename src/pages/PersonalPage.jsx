import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Users, 
  Search, 
  Trash2, 
  Edit3, 
  Eye, 
  X, 
  Save, 
  ShieldAlert, 
  Info,
  UserPlus,
  ShieldCheck
} from 'lucide-react';

// Master EPP/Tool kits matching active warehouse stock codes
const OPERATIONAL_KITS = {
  TCT: [
    { code: 'EPP-CASDI', name: 'Casco dieléctrico', qty: 1, category: 'EPP' },
    { code: 'EPP-GUAIS', name: 'Guantes dieléctricos', qty: 2, category: 'EPP' },
    { code: 'EPC-MANAI', name: 'Mangas aislantes', qty: 2, category: 'EPC' },
    { code: 'EPP-BOTDI', name: 'Botas dieléctricas', qty: 1, category: 'EPP' },
    { code: 'EPP-ARNES', name: 'Arnés de seguridad', qty: 1, category: 'EPP' },
    { code: 'HER-PTAIS', name: 'Pértiga aislada extensible', qty: 1, category: 'Herramientas' },
    { code: 'HER-DETTE', name: 'Detector de tensión personal', qty: 1, category: 'Herramientas' },
    { code: 'EPP-PROFA', name: 'Protector facial dieléctrico', qty: 1, category: 'EPP' },
    { code: 'EPP-LENSE', name: 'Gafas de seguridad', qty: 1, category: 'EPP' }
  ],
  Comercial: [
    { code: 'HER-TABLE', name: 'Tablet corporativo', qty: 1, category: 'Tech' },
    { code: 'EPP-CASDI', name: 'Casco de protección básico', qty: 1, category: 'EPP' },
    { code: 'EPP-BOTDI', name: 'Botas de seguridad básica', qty: 1, category: 'EPP' },
    { code: 'EPP-CHARE', name: 'Uniforme comercial reflectivo', qty: 1, category: 'EPP' }
  ],
  Motorizada: [
    { code: 'EPP-CASDI', name: 'Casco protector motorizado', qty: 1, category: 'EPP' },
    { code: 'EPP-CHARE', name: 'Chaleco reflectivo motorizado', qty: 1, category: 'EPP' },
    { code: 'EPP-BOTDI', name: 'Botas dieléctricas reforzadas', qty: 1, category: 'EPP' },
    { code: 'EPP-GUAIS', name: 'Guantes de moto reforzados', qty: 1, category: 'EPP' },
    { code: 'HER-TABLE', name: 'Celular corporativo robusto', qty: 1, category: 'Tech' }
  ],
  Averías: [
    { code: 'HER-MULTI', name: 'Multímetro digital autorango', qty: 1, category: 'Herramientas' },
    { code: 'HER-PINZA', name: 'Pinza amperimétrica True RMS', qty: 1, category: 'Herramientas' },
    { code: 'HER-DETTE', name: 'Detector de tensión personal', qty: 1, category: 'Herramientas' },
    { code: 'EPP-GUAIS', name: 'Guantes dieléctricos de faena', qty: 2, category: 'EPP' },
    { code: 'EPP-CASDI', name: 'Casco dieléctrico de faena', qty: 1, category: 'EPP' },
    { code: 'EPP-BOTDI', name: 'Botas dieléctricas de protección', qty: 1, category: 'EPP' }
  ],
  Redes: [
    { code: 'HER-TESTE', name: 'Tester de red digital LCD', qty: 1, category: 'Herramientas' },
    { code: 'HER-CRIMP', name: 'Crimpadora de red profesional', qty: 1, category: 'Herramientas' },
    { code: 'HER-LAPTO', name: 'Laptop/Tablet diagnóstico redes', qty: 1, category: 'Tech' },
    { code: 'EPP-CASDI', name: 'Casco de protección básico', qty: 1, category: 'EPP' },
    { code: 'EPP-BOTDI', name: 'Botas dieléctricas', qty: 1, category: 'EPP' },
    { code: 'EPP-CHARE', name: 'Chaleco reflectivo', qty: 1, category: 'EPP' }
  ],
  Corte: [
    { code: 'HER-ALICA', name: 'Alicate universal aislado 1000V', qty: 1, category: 'Herramientas' },
    { code: 'HER-PONCH', name: 'Pinzas de corte y ponchado', qty: 1, category: 'Herramientas' },
    { code: 'HER-SELLO', name: 'Sellos de seguridad candado', qty: 1, category: 'Herramientas' },
    { code: 'EPP-GUAIS', name: 'Guantes dieléctricos 1000V', qty: 1, category: 'EPP' },
    { code: 'EPP-CASDI', name: 'Casco dieléctrico de protección', qty: 1, category: 'EPP' },
    { code: 'EPP-BOTDI', name: 'Botas dieléctricas', qty: 1, category: 'EPP' },
    { code: 'HER-TABLE', name: 'Tablet Android de registro TCT', qty: 1, category: 'Tech' }
  ]
};

const PersonalPage = ({ setActivePage, setSelectedTechId }) => {
  const { 
    currentUser,
    currentRole,
    tecnicos, 
    supervisores, 
    coordinadores, 
    inventario,
    darDeBajaColaborador,
    saveTecnico,
    createActa,
    getFilteredTecnicos,
    getFilteredSupervisores
  } = useApp();

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [supervisorFilter, setSupervisorFilter] = useState('');

  // Modals / Drawer Editing
  const [editingPersonal, setEditingPersonal] = useState(null);
  const [confirmBajaTech, setConfirmBajaTech] = useState(null);

  // EPP Auto Allocation internal states
  const [selectedKitDept, setSelectedKitDept] = useState('');
  const [customKitItems, setCustomKitItems] = useState([]); // [{code, name, category, qty, checked}]

  // Filtered List
  const filteredPersonal = getFilteredTecnicos().filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          t.codigoEmpleado.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === '' || t.estado === statusFilter;
    const matchesSupervisor = supervisorFilter === '' || t.supervisorId === supervisorFilter;
    return matchesSearch && matchesStatus && matchesSupervisor;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'Activo': return 'bg-industrial-green/10 border-industrial-green/30 text-industrial-green';
      case 'Suspendido': return 'bg-industrial-yellow/10 border-industrial-yellow/30 text-industrial-yellow';
      case 'Desvinculado': return 'bg-industrial-red/10 border-industrial-red/30 text-industrial-red';
      case 'Inactivo': return 'bg-slate-500/10 border-slate-500/30 text-slate-400';
      default: return 'bg-slate-500/10 border-slate-500/30 text-slate-400';
    }
  };

  const handleOpenEdit = (colaborador) => {
    setEditingPersonal({ ...colaborador });
    setSelectedKitDept('');
    setCustomKitItems([]);
  };

  const handleOpenCreateColaborador = (isDemo = false) => {
    // Find matching supervisor dynamically for the logged-in supervisor user
    let defaultSupId = 'SUP-001';
    if (currentRole?.startsWith('Supervisor')) {
      const matchedSup = (supervisores || []).find(s => {
        if (!s || !s.name || !currentUser || !currentUser.username) return false;
        const sNameLower = s.name.toLowerCase();
        const userLower = currentUser.username.toLowerCase();
        const sFirstWord = s.name.split(' ')[0]?.toLowerCase() || '';
        return sNameLower.includes(userLower) || userLower.includes(sFirstWord);
      });
      if (matchedSup) {
        defaultSupId = matchedSup.id;
      }
    }

    setEditingPersonal({
      id: '',
      name: isDemo ? 'Ing. Ramón Antonio Valdez' : '',
      cedula: isDemo ? '402-2837482-9' : '',
      codigoEmpleado: isDemo ? `DEMO-${Math.floor(1000 + Math.random() * 9000)}` : `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
      telefono: isDemo ? '809-555-9876' : '',
      tipoSangre: 'O+',
      licencia: isDemo ? 'Categoría 3' : 'Categoría 2',
      vigenciaLicencia: isDemo ? '2030-05-25' : '2029-12-31',
      sie: isDemo ? 'CERT-SIE-9988' : `CERT-SIE-${Math.floor(1000 + Math.random() * 9000)}`,
      licenciaSie: 'Válido',
      tallaCamisa: isDemo ? 'XL' : 'L',
      tallaPantalon: isDemo ? '36' : '34',
      tallaBota: isDemo ? '43' : '42',
      brigadaId: isDemo ? 'MRC04-001' : '',
      supervisorId: defaultSupId,
      coordinatorId: 'COORD-001',
      estado: 'Activo',
      isNew: true
    });
    setSelectedKitDept('');
    setCustomKitItems([]);
  };

  const handleDeptKitChange = (dept) => {
    setSelectedKitDept(dept);
    if (!dept) {
      setCustomKitItems([]);
      return;
    }
    const kit = OPERATIONAL_KITS[dept] || [];
    const items = kit.map(k => {
      const invItem = inventario.find(i => i.code === k.code);
      return {
        code: k.code,
        name: k.name,
        category: k.category,
        qty: k.qty,
        checked: true,
        stockBodega: invItem ? invItem.stock : 0
      };
    });
    setCustomKitItems(items);
  };

  const handleAddCustomItem = (itemCode) => {
    const invItem = inventario.find(i => i.code === itemCode);
    if (!invItem) return;
    setCustomKitItems(prev => {
      if (prev.some(t => t.code === itemCode)) return prev;
      return [...prev, {
        code: invItem.code,
        name: invItem.name,
        category: invItem.category,
        qty: 1,
        checked: true,
        stockBodega: invItem.stock
      }];
    });
  };

  const handleRemoveCustomItem = (itemCode) => {
    setCustomKitItems(prev => prev.filter(t => t.code !== itemCode));
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingPersonal) return;
    
    // Save technician in SQLite
    await saveTecnico(editingPersonal);

    // If new collaborator and has active items checked in EPP selector, trigger Acta
    if (editingPersonal.isNew && customKitItems.length > 0) {
      const activeEPPs = customKitItems.filter(i => i.checked && i.qty > 0);
      if (activeEPPs.length > 0) {
        const dateStr = new Date().toISOString().slice(0, 10);
        
        // Auto compile the Delivery protocol
        const newActa = {
          tipo: `Entrega EPP Inicial (${selectedKitDept || 'Personalizado'})`,
          destino: `Técnico: ${editingPersonal.name}`,
          responsable: currentUser?.name || 'Sistema Central (ERP)',
          fecha: dateStr,
          estado: 'Pendiente', // Will require signatures on the Actas tab
          firmado: false,
          signatureData: null,
          items: activeEPPs.map(item => {
            return {
              code: item.code,
              name: `${item.name} - Nuevo`,
              qty: item.qty,
              category: item.category
            };
          })
        };
        await createActa(newActa);
      }
    }

    setEditingPersonal(null);
  };

  // Listen for custom automated demo events
  useEffect(() => {
    const handleDemoStep = async (e) => {
      const step = e.detail.step;
      if (step === 2) {
        // Step 2: Automatically open registration drawer with pre-filled mock profile
        handleOpenCreateColaborador(true);
      } else if (step === 3) {
        // Step 3: Invoke the suggested TCT kit load and auto-submit after a small delay
        handleDeptKitChange('TCT');
        
        // Save the collaborator automatically after the kit is visualised
        setTimeout(() => {
          const saveBtn = document.querySelector('button[type="submit"]');
          if (saveBtn) {
            saveBtn.click();
          }
        }, 1000);
      }
    };

    window.addEventListener('demo-step-trigger', handleDemoStep);
    return () => window.removeEventListener('demo-step-trigger', handleDemoStep);
  }, [editingPersonal, customKitItems, selectedKitDept, currentUser, supervisores, currentRole]);

  const handleOpenBaja = (colaborador) => {
    setConfirmBajaTech(colaborador);
  };

  const handleConfirmBaja = () => {
    if (!confirmBajaTech) return;
    darDeBajaColaborador(confirmBajaTech.id);
    setConfirmBajaTech(null);
  };

  return (
    <div className="space-y-6">
      
      {/* Search and Filters */}
      <div className="glass-panel p-4 rounded-lg flex flex-col md:flex-row gap-4 justify-between items-center border-opacity-40">
        
        {/* Search */}
        <div className="relative w-full md:w-80">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-industrial-gray">
            <Search size={14} />
          </span>
          <input
            type="text"
            placeholder="Buscar colaborador por nombre, código..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-industrial-bg bg-opacity-70 border border-industrial-border rounded px-3 py-1.5 pl-9 text-xs text-white focus:outline-none focus:border-industrial-cyan"
          />
        </div>

        {/* Filters */}
        <div className="flex space-x-2 w-full md:w-auto justify-end">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-industrial-bg border border-industrial-border text-xs text-white px-3 py-1.5 rounded focus:outline-none focus:border-industrial-cyan font-semibold"
          >
            <option value="">Todos los Estados</option>
            <option value="Activo">Activo</option>
            <option value="Suspendido">Suspendido</option>
            <option value="Inactivo">Inactivo</option>
            <option value="Desvinculado">Desvinculado</option>
          </select>

          <select
            value={supervisorFilter}
            onChange={(e) => setSupervisorFilter(e.target.value)}
            className="bg-industrial-bg border border-industrial-border text-xs text-white px-3 py-1.5 rounded focus:outline-none focus:border-industrial-cyan font-semibold"
          >
            <option value="">Todos los Supervisores</option>
            {(getFilteredSupervisores() || []).map(s => {
              if (!s) return null;
              const nameFirst = s.name ? s.name.split(' ')[0] : 'Supervisor';
              const cargoSecond = s.cargo ? (s.cargo.split(' ')[1] || s.cargo) : 'Sup';
              return (
                <option key={s.id} value={s.id}>{nameFirst} ({cargoSecond})</option>
              );
            })}
          </select>

          {(currentRole === 'Developer' || currentRole === 'Gerente' || currentRole === 'Coordinador' || currentRole?.startsWith('Supervisor')) && (
            <button
              onClick={handleOpenCreateColaborador}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-gradient-to-r from-industrial-cyan to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-industrial-bg text-xs font-extrabold uppercase tracking-wider transition-all shadow-cyan-glow"
            >
              <UserPlus size={12} />
              <span>Nuevo Colaborador</span>
            </button>
          )}
        </div>

      </div>

      {/* Main Datatable */}
      <div className="glass-panel rounded-lg overflow-hidden border-opacity-40">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-industrial-bg bg-opacity-80 text-industrial-gray font-bold uppercase tracking-wider border-b border-industrial-border text-[10px]">
                <th className="p-4">Colaborador / Código</th>
                <th className="p-4">Cargo Operativo</th>
                <th className="p-4">Supervisor / Coordinador</th>
                <th className="p-4">Zona / Lote</th>
                <th className="p-4">Campamento / Sector</th>
                <th className="p-4">Fecha Ingreso</th>
                <th className="p-4">Estado</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-border">
              {filteredPersonal.map((colab) => {
                const sup = supervisores.find(s => s.id === colab.supervisorId);
                const coord = coordinadores.find(c => c.id === colab.coordinatorId);

                return (
                  <tr key={colab.id} className="hover:bg-industrial-border hover:bg-opacity-20 transition-all font-semibold">
                    <td className="p-4">
                      <div className="font-bold text-white text-sm">{colab.name}</div>
                      <div className="text-[10px] text-industrial-cyan font-mono font-bold mt-0.5">{colab.codigoEmpleado}</div>
                    </td>
                    <td className="p-4">
                      <div className="text-white font-bold text-[11px]">Técnico Especialista</div>
                      <div className="text-[9px] text-industrial-gray font-bold uppercase mt-0.5">SIE: {colab.sie}</div>
                    </td>
                    <td className="p-4">
                      <div className="text-white text-[11px]">{sup?.name || 'Ninguno'}</div>
                      <div className="text-[9px] text-industrial-gray uppercase font-bold tracking-widest mt-0.5">{coord?.name || 'William'}</div>
                    </td>
                    <td className="p-4">
                      <div className="text-white text-[11px]">{coord?.zone || 'Noroeste Lote 4'}</div>
                      <div className="text-[9px] text-industrial-gray uppercase font-bold tracking-widest mt-0.5 font-black">LOTE 4</div>
                    </td>
                    <td className="p-4">
                      <div className="text-white text-[11px]">{coord?.campamento || 'Mantenimiento Noroeste'}</div>
                      <div className="text-[9px] text-industrial-gray uppercase font-bold tracking-widest mt-0.5">Sector Canastos</div>
                    </td>
                    <td className="p-4">
                      <span className="font-mono text-white text-[11px]">{colab.fechaIngreso}</span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 border rounded text-[10px] uppercase font-bold tracking-wider ${getStatusColor(colab.estado)}`}>
                        {colab.estado}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => {
                            setSelectedTechId(colab.id);
                            setActivePage('tecnicos');
                          }}
                          className="p-1 rounded bg-industrial-cyan bg-opacity-10 hover:bg-opacity-20 text-industrial-cyan border border-industrial-cyan border-opacity-20 transition-all"
                          title="Ver Expediente"
                        >
                          <Eye size={14} />
                        </button>
                        
                        {(currentRole === 'Developer' || currentRole === 'Gerente' || currentRole === 'Coordinador' || currentRole?.startsWith('Supervisor')) && (
                          <>
                            <button
                              onClick={() => handleOpenEdit(colab)}
                              className="p-1 rounded bg-industrial-border hover:bg-opacity-50 text-white transition-all border border-industrial-border"
                              title="Editar Perfil"
                            >
                              <Edit3 size={14} />
                            </button>
                            {colab.estado !== 'Desvinculado' && (
                              <button
                                onClick={() => handleOpenBaja(colab)}
                                className="p-1 rounded bg-industrial-red/10 hover:bg-industrial-red/20 text-industrial-red border border-industrial-red/20 transition-all"
                                title="Dar de Baja"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* -------------------- EDIT DRAWER / MODAL -------------------- */}
      {editingPersonal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div 
            className="w-full max-w-2xl glass-panel rounded-lg p-6 border-industrial-cyan border-opacity-40"
            style={{ background: 'rgba(13, 21, 39, 0.96)', boxShadow: '0 0 25px rgba(6, 182, 212, 0.15)' }}
          >
            <div className="flex items-center justify-between border-b border-industrial-border pb-3 mb-4">
              <div className="flex items-center space-x-2 text-white">
                <Edit3 size={18} className="text-industrial-cyan animate-pulse" />
                <h3 className="font-extrabold text-sm uppercase tracking-wider">
                  {editingPersonal.isNew ? 'Registrar Nuevo Técnico Operador' : `Modificar Expediente: ${editingPersonal.name}`}
                </h3>
              </div>
              <button onClick={() => setEditingPersonal(null)} className="text-industrial-gray hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs font-semibold">
              <div className="max-h-[70vh] overflow-y-auto pr-2 space-y-5 scrollbar-thin">
                
                {/* SECTION 1: DATOS PERSONALES */}
                <div>
                  <div className="text-[10px] text-industrial-cyan uppercase font-black tracking-widest mb-2 border-b border-industrial-cyan border-opacity-20 pb-1">
                    1. Identificación y Contacto
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Nombre Completo *</label>
                      <input
                        type="text"
                        required
                        value={editingPersonal.name}
                        onChange={(e) => setEditingPersonal({ ...editingPersonal, name: e.target.value })}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan"
                        placeholder="Ej. Juan Carlos Almonte"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Código Empleado *</label>
                      <input
                        type="text"
                        required
                        value={editingPersonal.codigoEmpleado}
                        onChange={(e) => setEditingPersonal({ ...editingPersonal, codigoEmpleado: e.target.value })}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan font-mono"
                        placeholder="Ej. EMP-1002"
                        readOnly={!editingPersonal.isNew}
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Cédula Dominicana *</label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. 001-1823945-8"
                        value={editingPersonal.cedula}
                        onChange={(e) => setEditingPersonal({ ...editingPersonal, cedula: e.target.value })}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Teléfono Móvil</label>
                      <input
                        type="text"
                        placeholder="Ej. 809-555-0199"
                        value={editingPersonal.telefono || ''}
                        onChange={(e) => setEditingPersonal({ ...editingPersonal, telefono: e.target.value })}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* SECTION 2: PERFILES TÉCNICOS Y CERTIFICACIONES */}
                <div>
                  <div className="text-[10px] text-industrial-cyan uppercase font-black tracking-widest mb-2 border-b border-industrial-cyan border-opacity-20 pb-1">
                    2. Habilitaciones y Certificaciones
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Tipo de Sangre</label>
                      <select
                        value={editingPersonal.tipoSangre || 'O+'}
                        onChange={(e) => setEditingPersonal({ ...editingPersonal, tipoSangre: e.target.value })}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan"
                      >
                        <option value="O+">O Positivo (O+)</option>
                        <option value="O-">O Negativo (O-)</option>
                        <option value="A+">A Positivo (A+)</option>
                        <option value="A-">A Negativo (A-)</option>
                        <option value="B+">B Positivo (B+)</option>
                        <option value="B-">B Negativo (B-)</option>
                        <option value="AB+">AB Positivo (AB+)</option>
                        <option value="AB-">AB Negativo (AB-)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Licencia de Conducir</label>
                      <select
                        value={editingPersonal.licencia || 'Categoría 2'}
                        onChange={(e) => setEditingPersonal({ ...editingPersonal, licencia: e.target.value })}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan"
                      >
                        <option value="Ninguna">Ninguna / No Conduce</option>
                        <option value="Categoría 1">Categoría 1 (Motocicletas)</option>
                        <option value="Categoría 2">Categoría 2 (Vehículos Livianos)</option>
                        <option value="Categoría 3">Categoría 3 (Vehículos Pesados)</option>
                        <option value="Categoría 4">Categoría 4 (Vehículos Especiales)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Vigencia de Licencia</label>
                      <input
                        type="date"
                        value={editingPersonal.vigenciaLicencia || ''}
                        onChange={(e) => setEditingPersonal({ ...editingPersonal, vigenciaLicencia: e.target.value })}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Certificación SIE</label>
                      <input
                        type="text"
                        placeholder="Ej. CERT-SIE-2834"
                        value={editingPersonal.sie || ''}
                        onChange={(e) => setEditingPersonal({ ...editingPersonal, sie: e.target.value })}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Estado Certificación SIE</label>
                      <select
                        value={editingPersonal.licenciaSie || 'Válido'}
                        onChange={(e) => setEditingPersonal({ ...editingPersonal, licenciaSie: e.target.value })}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan"
                      >
                        <option value="Válido">Válido / Vigente</option>
                        <option value="Por Vencer">Por Vencer (&lt; 30 días)</option>
                        <option value="Expirado">Expirado / Vencido</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Asignar a Brigada (Opcional)</label>
                      <input
                        type="text"
                        placeholder="Ej. MRC04-097 o vacío"
                        value={editingPersonal.brigadaId || ''}
                        onChange={(e) => setEditingPersonal({ ...editingPersonal, brigadaId: e.target.value })}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* SECTION 3: TALLAS EPP */}
                <div>
                  <div className="text-[10px] text-industrial-cyan uppercase font-black tracking-widest mb-2 border-b border-industrial-cyan border-opacity-20 pb-1">
                    3. Dimensiones y Tallas de Dotación (EPP)
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Camisa</label>
                      <select
                        value={editingPersonal.tallaCamisa || 'L'}
                        onChange={(e) => setEditingPersonal({ ...editingPersonal, tallaCamisa: e.target.value })}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan font-bold"
                      >
                        <option value="S">S (Small)</option>
                        <option value="M">M (Medium)</option>
                        <option value="L">L (Large)</option>
                        <option value="XL">XL (Extra Large)</option>
                        <option value="XXL">XXL (Doble XL)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Pantalón</label>
                      <select
                        value={editingPersonal.tallaPantalon || '34'}
                        onChange={(e) => setEditingPersonal({ ...editingPersonal, tallaPantalon: e.target.value })}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan font-bold"
                      >
                        <option value="28">28</option>
                        <option value="30">30</option>
                        <option value="32">32</option>
                        <option value="34">34</option>
                        <option value="36">36</option>
                        <option value="38">38</option>
                        <option value="40">40</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Calzado / Bota</label>
                      <select
                        value={editingPersonal.tallaBota || '42'}
                        onChange={(e) => setEditingPersonal({ ...editingPersonal, tallaBota: e.target.value })}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan font-bold"
                      >
                        <option value="38">38</option>
                        <option value="39">39</option>
                        <option value="40">40</option>
                        <option value="41">41</option>
                        <option value="42">42</option>
                        <option value="43">43</option>
                        <option value="44">44</option>
                        <option value="45">45</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* SECTION 4: OPERACIÓN */}
                <div>
                  <div className="text-[10px] text-industrial-cyan uppercase font-black tracking-widest mb-2 border-b border-industrial-cyan border-opacity-20 pb-1">
                    4. Estado y Jerarquía
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Estado Administrativo</label>
                      <select
                        value={editingPersonal.estado}
                        onChange={(e) => setEditingPersonal({ ...editingPersonal, estado: e.target.value })}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan"
                      >
                        <option value="Activo">Activo</option>
                        <option value="Suspendido">Suspendido</option>
                        <option value="Inactivo">Inactivo</option>
                        <option value="Desvinculado">Desvinculado</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Supervisor Directo *</label>
                      <select
                        value={editingPersonal.supervisorId}
                        onChange={(e) => setEditingPersonal({ ...editingPersonal, supervisorId: e.target.value })}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan"
                      >
                        {(getFilteredSupervisores() || []).map(s => {
                          if (!s) return null;
                          return (
                            <option key={s.id} value={s.id}>{s.name || 'Supervisor'} ({s.cargo || 'Sup'})</option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                </div>

                {/* SECTION 5: DYNAMIC EPP & INITIAL EQUIPMENT ALLOCATION */}
                {editingPersonal.isNew && (
                  <div>
                    <div className="text-[10px] text-industrial-cyan uppercase font-black tracking-widest mb-2 border-b border-industrial-cyan border-opacity-20 pb-1 mt-4">
                      5. Asignación de EPP e Instrumentos del Almacén Central
                    </div>
                    
                    <div className="space-y-4">
                      {/* Selection templates */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1.5">Seleccionar Kit de EPP por Especialidad</label>
                          <select
                            value={selectedKitDept}
                            onChange={(e) => handleDeptKitChange(e.target.value)}
                            className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan font-bold"
                          >
                            <option value="">-- No asignar kit inicial --</option>
                            <option value="TCT">Kit TCT (Alta Tensión)</option>
                            <option value="Comercial">Kit Comercial</option>
                            <option value="Motorizada">Kit Técnico Motorizado</option>
                            <option value="Averías">Kit Averías e Incidencias</option>
                            <option value="Redes">Kit Redes y Telecom</option>
                            <option value="Corte">Kit Corte y Reconexión</option>
                          </select>
                        </div>

                        {/* Search and add custom warehouse item */}
                        <div>
                          <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1.5">Agregar Herramienta/EPP Individual</label>
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value) {
                                handleAddCustomItem(e.target.value);
                                e.target.value = "";
                              }
                            }}
                            className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan"
                          >
                            <option value="">-- Seleccionar del Almacén Central --</option>
                            {inventario
                              .filter(inv => !customKitItems.some(item => item.code === inv.code))
                              .map(inv => (
                                <option key={inv.code} value={inv.code}>
                                  {inv.name} ({inv.code}) | Bodega: {inv.stock} disp.
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>

                      {customKitItems.length > 0 && (
                        <div className="bg-industrial-bg bg-opacity-40 p-3 rounded border border-industrial-border space-y-2">
                          <span className="block text-[8px] text-industrial-cyan uppercase font-black tracking-widest flex items-center space-x-1">
                            <ShieldCheck size={10} />
                            <span>Equipos a Asignar en Acta de Entrega Inicial ({customKitItems.length} ítems)</span>
                          </span>
                          
                          <div className="space-y-1.5 max-h-48 overflow-y-auto divide-y divide-industrial-border/30 pr-1 scrollbar-thin">
                            {customKitItems.map((item) => {
                              const isMissingStock = item.stockBodega < item.qty;
                              return (
                                <div key={item.code} className="flex items-center justify-between py-1.5 hover:bg-industrial-border hover:bg-opacity-10 px-1 rounded transition-colors">
                                  <div className="flex items-center space-x-2">
                                    <input 
                                      type="checkbox"
                                      checked={item.checked}
                                      onChange={(e) => setCustomKitItems(prev => prev.map(i => i.code === item.code ? { ...i, checked: e.target.checked } : i))}
                                      className="rounded border-industrial-border text-industrial-cyan focus:ring-industrial-cyan"
                                    />
                                    <div>
                                      <span className="text-white text-[11px] font-bold block leading-none">{item.name}</span>
                                      <div className="text-[8px] text-industrial-gray font-mono flex items-center space-x-1.5 mt-0.5">
                                        <span>{item.code} ({item.category})</span>
                                        <span className={`text-[8px] px-1 rounded ${isMissingStock ? 'bg-industrial-red/10 text-industrial-red font-bold' : 'bg-industrial-green/10 text-industrial-green font-bold'}`}>
                                          Almacén: {item.stockBodega} disp.
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center space-x-2">
                                    <div className="flex items-center space-x-1">
                                      <span className="text-[9px] text-industrial-gray">Cant:</span>
                                      <input 
                                        type="number"
                                        min={1}
                                        value={item.qty}
                                        onChange={(e) => setCustomKitItems(prev => prev.map(i => i.code === item.code ? { ...i, qty: Math.max(1, parseInt(e.target.value) || 1) } : i))}
                                        className={`w-10 text-center bg-industrial-bg border text-[10px] rounded p-0.5 font-mono ${isMissingStock ? 'border-industrial-red text-industrial-red font-bold animate-pulse' : 'border-industrial-border text-white'}`}
                                      />
                                    </div>

                                    <button 
                                      type="button"
                                      onClick={() => handleRemoveCustomItem(item.code)}
                                      className="p-1 rounded bg-industrial-red/10 hover:bg-industrial-red/20 text-industrial-red border border-industrial-red/20 transition-all ml-1"
                                      title="Quitar ítem"
                                    >
                                      <Trash2 size={10} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>

              <div className="flex space-x-2 pt-4 border-t border-industrial-border">
                <button
                  type="button"
                  onClick={() => setEditingPersonal(null)}
                  className="w-1/2 py-2.5 rounded bg-industrial-border hover:bg-opacity-60 text-white font-extrabold text-[10px] uppercase tracking-wider transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 rounded bg-industrial-cyan text-industrial-bg hover:bg-cyan-400 font-extrabold text-[10px] uppercase tracking-wider flex items-center justify-center space-x-1 transition-all shadow-cyan-glow"
                >
                  <Save size={12} />
                  <span>{editingPersonal.isNew ? 'Registrar Técnico' : 'Guardar Cambios'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------- DEACTIVATION CONFIRMATION MODAL -------------------- */}
      {confirmBajaTech && (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div 
            className="w-full max-w-md glass-panel rounded-lg p-6 border-neon-red"
            style={{ background: 'rgba(13, 21, 39, 0.95)' }}
          >
            <div className="flex items-center space-x-2 text-industrial-red border-b border-industrial-border pb-3 mb-4">
              <ShieldAlert size={20} />
              <h3 className="font-extrabold text-sm uppercase tracking-wider font-extrabold">DAR DE BAJA AL COLABORADOR</h3>
            </div>

            <div className="space-y-4 text-xs font-semibold">
              <p className="text-white leading-relaxed">
                ¿Está seguro de que desea retirar del cargo activo a <span className="text-industrial-red font-black">{confirmBajaTech.name}</span> ({confirmBajaTech.codigoEmpleado})?
              </p>

              {/* REQUIRED COMPLIANCE WARNING */}
              <div className="p-3 bg-industrial-orange bg-opacity-10 border border-industrial-orange rounded flex items-start space-x-2">
                <Info size={16} className="text-industrial-orange flex-shrink-0 mt-0.5" />
                <p className="text-industrial-orange leading-relaxed text-[11px] font-bold">
                  “Esta acción no elimina el historial del colaborador.”
                </p>
              </div>

              <p className="text-industrial-gray leading-relaxed text-[10px]">
                Esta acción actualizará su estado operativo a desvinculado de forma inmediata en las brigadas. Sin embargo, todos sus registros históricos, firmas de actas previas, swaps de equipos e incidencias se mantendrán archivados.
              </p>

              <div className="flex space-x-2 pt-2">
                <button
                  onClick={() => setConfirmBajaTech(null)}
                  className="w-1/2 py-2 rounded bg-industrial-border hover:bg-opacity-60 text-white font-extrabold text-[10px] uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmBaja}
                  className="w-1/2 py-2 rounded bg-industrial-red text-white hover:bg-red-600 font-extrabold text-[10px] uppercase tracking-wider flex items-center justify-center space-x-1"
                >
                  <Trash2 size={12} />
                  <span>Confirmar Baja</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default PersonalPage;
