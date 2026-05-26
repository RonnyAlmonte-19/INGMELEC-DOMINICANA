import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Users, 
  Wrench, 
  Edit3, 
  UserPlus, 
  Eye, 
  Search, 
  SlidersHorizontal,
  X,
  Save,
  CheckCircle,
  Truck,
  Plus,
  Boxes
} from 'lucide-react';

const BrigadasPage = ({ setActivePage, setSelectedTechId }) => {
  const { 
    currentUser,
    currentRole,
    supervisores,
    getFilteredBrigadas, 
    tecnicos,
    inventario,
    brigadaHerramientas,
    updateToolState,
    assignTecnicosToBrigada,
    saveBrigada,
    saveBrigadaTools,
    getFilteredSupervisores
  } = useApp();

  const activeBrigades = getFilteredBrigadas();

  // Search and Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Modals States
  const [inspectToolsBrigade, setInspectToolsBrigade] = useState(null);
  const [assignRosterBrigade, setAssignRosterBrigade] = useState(null);
  const [editBrigadeData, setEditBrigadeData] = useState(null);

  // Dynamic tools kit editor states
  const [modalTools, setModalTools] = useState([]);
  const [overrideStockChoice, setOverrideStockChoice] = useState(false);
  const [deficitsList, setDeficitsList] = useState([]);

  // Tools editing state
  const [editingTool, setEditingTool] = useState(null);
  const [toolStateInput, setToolStateInput] = useState('Entregado');
  const [toolObsInput, setToolObsInput] = useState('');

  // Roster check state
  const [selectedTechs, setSelectedTechs] = useState([]);

  // Filtered List
  const filteredBrigades = activeBrigades.filter(b => {
    const matchesSearch = b.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          b.vehiculo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === '' || b.tipo === typeFilter;
    return matchesSearch && matchesType;
  });

  // Open Tools Inspector
  const handleOpenTools = (bId) => {
    const tools = brigadaHerramientas.filter(bh => bh.brigadaId === bId);
    setInspectToolsBrigade({ brigadeId: bId, tools });
  };

  const handleEditTool = (tool) => {
    setEditingTool(tool);
    setToolStateInput(tool.estado);
    setToolObsInput(tool.obs || '');
  };

  const handleSaveToolStatus = () => {
    if (!inspectToolsBrigade || !editingTool) return;
    updateToolState(inspectToolsBrigade.code || inspectToolsBrigade.brigadeId, editingTool.itemCode, toolStateInput, toolObsInput);
    
    // Refresh modal tools list
    const updatedTools = brigadaHerramientas.filter(bh => bh.brigadaId === inspectToolsBrigade.brigadeId);
    setInspectToolsBrigade(prev => ({ ...prev, tools: updatedTools }));
    setEditingTool(null);
  };

  // Open Roster Editor
  const handleOpenRoster = (b) => {
    setAssignRosterBrigade(b);
    // Find technicians currently in this brigade
    const currentCrew = tecnicos.filter(t => t.brigadaId === b.id && t.estado === 'Activo').map(t => t.id);
    setSelectedTechs(currentCrew);
  };

  const handleSaveRoster = () => {
    if (!assignRosterBrigade) return;
    assignTecnicosToBrigada(assignRosterBrigade.id, selectedTechs);
    setAssignRosterBrigade(null);
  };

  const handleToggleTechInRoster = (tId) => {
    setSelectedTechs(prev => 
      prev.includes(tId) ? prev.filter(id => id !== tId) : [...prev, tId]
    );
  };

  const handleOpenCreateBrigade = () => {
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

    setEditBrigadeData({
      id: '',
      vehiculo: '',
      tipo: 'TCT',
      supervisorId: defaultSupId,
      zone: 'Noroeste Lote 4',
      campamento: 'Mantenimiento Noroeste',
      estado: 'Activo',
      isNew: true
    });
    setModalTools([]);
    setDeficitsList([]);
    setOverrideStockChoice(false);
  };

  const handleEditBrigade = async (b) => {
    setEditBrigadeData({ ...b });
    setDeficitsList([]);
    setOverrideStockChoice(false);
    try {
      const response = await fetch(`/api/brigadas/${b.id}/herramientas`);
      const res = await response.json();
      if (res.success) {
        setModalTools(res.tools);
      } else {
        setModalTools([]);
      }
    } catch (e) {
      console.error(e);
      setModalTools([]);
    }
  };

  const handleLoadKitSuggested = async () => {
    if (!editBrigadeData) return;
    const dept = editBrigadeData.tipo;
    const code = editBrigadeData.id || 'NUEVA';
    try {
      const response = await fetch(`/api/brigadas/${code}/cargar-kit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departamento: dept })
      });
      const res = await response.json();
      if (res.success) {
        setModalTools(res.tools);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateModalTool = (itemCode, field, value) => {
    setModalTools(prev => prev.map(t => 
      t.itemCode === itemCode ? { ...t, [field]: value } : t
    ));
  };

  const handleAddCustomTool = (itemCode) => {
    const invItem = inventario.find(i => i.code === itemCode);
    if (!invItem) return;
    setModalTools(prev => {
      if (prev.some(t => t.itemCode === itemCode)) return prev;
      return [...prev, {
        brigadaId: editBrigadeData.id,
        itemCode: invItem.code,
        name: invItem.name,
        reqQty: 1,
        delQty: Math.min(1, invItem.stock),
        category: invItem.category,
        estado: 'Entregado',
        obs: 'Agregada manualmente',
        obligatorio: false,
        stockBodega: invItem.stock
      }];
    });
  };

  const handleRemoveModalTool = (itemCode) => {
    setModalTools(prev => prev.filter(t => t.itemCode !== itemCode));
  };

  const handleSaveBrigade = async (e) => {
    e.preventDefault();
    if (!editBrigadeData) return;

    const code = editBrigadeData.id.toUpperCase().trim();
    if (!code) {
      alert('Por favor ingrese el código de la brigada.');
      return;
    }

    await saveBrigada(editBrigadeData);

    const res = await saveBrigadaTools(code, modalTools, overrideStockChoice);
    if (res.success) {
      setEditBrigadeData(null);
      setModalTools([]);
      setDeficitsList([]);
      setOverrideStockChoice(false);
    } else {
      if (res.deficits) {
        setDeficitsList(res.deficits);
        alert(`Stock insuficiente en almacén central para completar la asignación.`);
      } else {
        alert('Error: ' + res.message);
      }
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Activo': return 'bg-industrial-green bg-opacity-15 text-industrial-green border-industrial-green/30';
      case 'Mantenimiento': return 'bg-industrial-yellow bg-opacity-15 text-industrial-yellow border-industrial-yellow/30';
      case 'Baja': return 'bg-industrial-red bg-opacity-15 text-industrial-red border-industrial-red/30';
      default: return 'bg-industrial-gray bg-opacity-15 text-industrial-gray border-industrial-border';
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Search and Filters */}
      <div className="glass-panel p-4 rounded-lg flex flex-col md:flex-row gap-4 justify-between items-center">
        
        {/* Search */}
        <div className="relative w-full md:w-80">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-industrial-gray">
            <Search size={14} />
          </span>
          <input
            type="text"
            placeholder="Buscar por código de brigada o vehículo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-industrial-bg bg-opacity-70 border border-industrial-border rounded px-3 py-1.5 pl-9 text-xs text-white focus:outline-none focus:border-industrial-cyan"
          />
        </div>

        {/* Filter items */}
        <div className="flex space-x-2 w-full md:w-auto justify-end">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-industrial-bg border border-industrial-border text-xs text-white px-3 py-1.5 rounded focus:outline-none focus:border-industrial-cyan font-semibold"
          >
            <option value="">Todos los Tipos</option>
            <option value="Canasto">Canasto</option>
            <option value="Luminaria">Luminaria</option>
            <option value="Grúa Poste">Grúa Poste</option>
            <option value="Transformadores">Transformadores</option>
            <option value="TCT">TCT</option>
          </select>

          {(currentRole === 'Developer' || currentRole === 'Gerente' || currentRole === 'Coordinador' || currentRole?.startsWith('Supervisor')) && (
            <button
              onClick={handleOpenCreateBrigade}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-gradient-to-r from-industrial-cyan to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-industrial-bg text-xs font-extrabold uppercase tracking-wider transition-all shadow-cyan-glow"
            >
              <Plus size={12} />
              <span>Nueva Brigada</span>
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
                <th className="p-4">Código / Tipo</th>
                <th className="p-4">Técnicos Asignados</th>
                <th className="p-4">Vehículo</th>
                <th className="p-4">Supervisor / Coordinador</th>
                <th className="p-4">Zona / Campamento</th>
                <th className="p-4 text-center">Equipo</th>
                <th className="p-4">Estado</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-border">
              {filteredBrigades.map((b) => {
                const crew = tecnicos.filter(t => t.brigadaId === b.id && t.estado === 'Activo');
                const sup = supervisores.find(s => s.id === b.supervisorId);
                const toolsCount = brigadaHerramientas.filter(bh => bh.brigadaId === b.id).length;

                return (
                  <tr key={b.id} className="hover:bg-industrial-border hover:bg-opacity-20 transition-all font-semibold">
                    <td className="p-4">
                      <div className="font-bold text-white text-sm">{b.id}</div>
                      <div className="text-[10px] text-industrial-cyan font-bold uppercase tracking-wider">{b.tipo}</div>
                    </td>
                    <td className="p-4">
                      {crew.length === 0 ? (
                        <span className="text-industrial-red text-[11px] font-bold">Sin Técnicos Asignados</span>
                      ) : (
                        <div className="flex flex-col space-y-0.5 max-w-xs">
                          {crew.map(member => (
                            <button
                              key={member.id}
                              onClick={() => {
                                setSelectedTechId(member.id);
                                setActivePage('tecnicos');
                              }}
                              className="text-left text-industrial-cyan hover:underline text-[11px] font-semibold truncate flex items-center space-x-1"
                            >
                              <span>• {member.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <span className="font-mono text-white text-[11px] flex items-center space-x-1">
                        <Truck size={12} className="text-industrial-gray" />
                        <span>{b.vehiculo}</span>
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="text-white text-[11px]">{sup?.name || 'Desconocido'}</div>
                      <div className="text-[9px] text-industrial-gray uppercase font-bold tracking-widest mt-0.5">William (COORD)</div>
                    </td>
                    <td className="p-4">
                      <div className="text-white text-[11px]">{b.zone}</div>
                      <div className="text-[9px] text-industrial-gray uppercase font-bold tracking-widest mt-0.5">{b.campamento}</div>
                    </td>
                    <td className="p-4 text-center">
                      <span className="font-mono bg-industrial-cyan bg-opacity-10 border border-industrial-cyan border-opacity-35 text-industrial-cyan text-[10px] font-bold px-2 py-0.5 rounded">
                        {toolsCount} ítems
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 border rounded text-[10px] uppercase font-bold tracking-wider ${getStatusColor(b.estado)}`}>
                        {b.estado}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => handleOpenTools(b.id)}
                          className="p-1 rounded bg-industrial-cyan bg-opacity-10 hover:bg-opacity-20 text-industrial-cyan border border-industrial-cyan border-opacity-20 transition-all"
                          title="Inspeccionar Herramientas"
                        >
                          <Wrench size={14} />
                        </button>
                        
                        {(currentRole === 'Developer' || currentRole === 'Coordinador' || currentRole?.startsWith('Supervisor')) && (
                          <button
                            onClick={() => handleOpenRoster(b)}
                            className="p-1 rounded bg-industrial-orange bg-opacity-10 hover:bg-opacity-20 text-industrial-orange border border-industrial-orange border-opacity-20 transition-all"
                            title="Modificar Crew"
                          >
                            <UserPlus size={14} />
                          </button>
                        )}

                        <button
                          onClick={() => handleEditBrigade(b)}
                          className="p-1 rounded bg-industrial-border hover:bg-opacity-50 text-white transition-all border border-industrial-border"
                          title="Editar Brigada"
                        >
                          <Edit3 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* -------------------- MODAL 1: VER HERRAMIENTAS -------------------- */}
      {inspectToolsBrigade && (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div 
            className="w-full max-w-3xl glass-panel rounded-lg p-6 border-neon-cyan max-h-[90vh] overflow-y-auto"
            style={{ background: 'rgba(13, 21, 39, 0.95)' }}
          >
            <div className="flex items-center justify-between border-b border-industrial-border pb-3 mb-4">
              <div className="flex items-center space-x-2 text-industrial-cyan">
                <Wrench size={18} />
                <h3 className="font-extrabold text-sm uppercase tracking-wider">Inspección de Herramientas y EPP: Brigada {inspectToolsBrigade.brigadeId}</h3>
              </div>
              <button onClick={() => { setInspectToolsBrigade(null); setEditingTool(null); }} className="text-industrial-gray hover:text-white">
                <X size={18} />
              </button>
            </div>

            {/* List and editor */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              
              {/* Left Column: Tools Table */}
              <div className="md:col-span-8 overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-industrial-bg text-industrial-gray uppercase font-bold tracking-wider border-b border-industrial-border text-[9px]">
                      <th className="p-2">Ítem / Categoría</th>
                      <th className="p-2 text-center">Req / Del</th>
                      <th className="p-2">Estado</th>
                      <th className="p-2 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-industrial-border">
                    {inspectToolsBrigade.tools.map((t) => (
                      <tr key={t.itemCode} className="hover:bg-industrial-bg hover:bg-opacity-50">
                        <td className="p-2 font-semibold">
                          <div className="text-white text-[11px]">{t.name}</div>
                          <div className="text-[9px] text-industrial-gray font-mono">{t.itemCode}</div>
                        </td>
                        <td className="p-2 text-center font-bold text-white">{t.reqQty} / {t.delQty}</td>
                        <td className="p-2">
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider border ${
                            t.estado === 'Entregado' ? 'bg-industrial-green/10 border-industrial-green/30 text-industrial-green' :
                            t.estado === 'Dañado' ? 'bg-industrial-red/10 border-industrial-red/30 text-industrial-red' :
                            t.estado === 'Pendiente' ? 'bg-industrial-yellow/10 border-industrial-yellow/30 text-industrial-yellow' :
                            'bg-industrial-cyan/10 border-industrial-cyan/30 text-industrial-cyan'
                          }`}>
                            {t.estado}
                          </span>
                          {t.obs && <span className="block text-[8px] text-industrial-gray truncate max-w-[120px]">{t.obs}</span>}
                        </td>
                        <td className="p-2 text-right">
                          <button
                            onClick={() => handleEditTool(t)}
                            className="text-[10px] text-industrial-cyan hover:underline font-extrabold"
                          >
                            Modificar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Right Column: Mini Editor Panel */}
              <div className="md:col-span-4 bg-industrial-bg bg-opacity-40 p-4 rounded border border-industrial-border flex flex-col justify-between">
                {editingTool ? (
                  <div className="space-y-4">
                    <div className="border-b border-industrial-border pb-2">
                      <span className="text-[9px] text-industrial-gray uppercase font-bold tracking-widest">Editando Ítem</span>
                      <h4 className="font-bold text-xs text-white leading-normal mt-0.5">{editingTool.name}</h4>
                    </div>

                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Estado Físico</label>
                      <select
                        value={toolStateInput}
                        onChange={(e) => setToolStateInput(e.target.value)}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-1.5 focus:outline-none focus:border-industrial-cyan"
                      >
                        <option value="Pendiente">Pendiente</option>
                        <option value="Entregado">Entregado</option>
                        <option value="Dañado">Dañado</option>
                        <option value="No entregado">No entregado</option>
                        <option value="Repuesto">Repuesto</option>
                        <option value="Cambiado">Cambiado</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Observaciones</label>
                      <textarea
                        value={toolObsInput}
                        onChange={(e) => setToolObsInput(e.target.value)}
                        placeholder="Registrar daños, fallas o reparaciones realizadas..."
                        rows={3}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-1.5 focus:outline-none focus:border-industrial-cyan placeholder-industrial-border"
                      />
                    </div>

                    <button
                      onClick={handleSaveToolStatus}
                      className="w-full py-1.5 rounded bg-industrial-cyan text-industrial-bg hover:bg-cyan-400 font-extrabold text-[10px] uppercase tracking-wider flex items-center justify-center space-x-1.5"
                    >
                      <Save size={12} />
                      <span>Guardar Estado</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center text-industrial-gray py-8 space-y-2">
                    <Wrench size={24} className="text-industrial-border" />
                    <p className="text-[10px] font-semibold leading-relaxed">Selecciona un ítem de la tabla para modificar su estado operativo o agregar observaciones.</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* -------------------- MODAL 2: ASIGNAR ROSTER (TÉCNICOS) -------------------- */}
      {assignRosterBrigade && (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div 
            className="w-full max-w-md glass-panel rounded-lg p-6 border-neon-orange"
            style={{ background: 'rgba(13, 21, 39, 0.95)' }}
          >
            <div className="flex items-center justify-between border-b border-industrial-border pb-3 mb-4">
              <div className="flex items-center space-x-2 text-industrial-orange">
                <UserPlus size={18} />
                <h3 className="font-extrabold text-sm uppercase tracking-wider">Asignación de Personal: Brigada {assignRosterBrigade.id}</h3>
              </div>
              <button onClick={() => setAssignRosterBrigade(null)} className="text-industrial-gray hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <span className="text-[9px] text-industrial-gray uppercase font-bold tracking-widest">
                Técnicos Disponibles en Lote 4
              </span>
              
              <div className="space-y-2 max-h-60 overflow-y-auto bg-industrial-bg bg-opacity-40 p-2.5 rounded border border-industrial-border">
                {tecnicos
                  .filter(t => t.estado === 'Activo' && (t.brigadaId === '' || t.brigadaId === assignRosterBrigade.id))
                  .map((t) => {
                    const isChecked = selectedTechs.includes(t.id);
                    return (
                      <div 
                        key={t.id} 
                        onClick={() => handleToggleTechInRoster(t.id)}
                        className={`flex items-center justify-between p-2 rounded border cursor-pointer select-none transition-all ${
                          isChecked 
                            ? 'bg-industrial-orange/5 border-industrial-orange/40 text-white' 
                            : 'bg-transparent border-industrial-border text-industrial-gray hover:text-white'
                        }`}
                      >
                        <div>
                          <div className="text-[11px] font-bold">{t.name}</div>
                          <div className="text-[8px] text-industrial-gray mt-0.5">{t.codigoEmpleado} | SIE: {t.sie}</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // Handled by onClick of parent
                          className="rounded border-industrial-border text-industrial-orange focus:ring-industrial-orange"
                        />
                      </div>
                    );
                  })}
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  onClick={() => setAssignRosterBrigade(null)}
                  className="w-1/2 py-2 rounded bg-industrial-border hover:bg-opacity-60 text-white font-extrabold text-[10px] uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveRoster}
                  className="w-1/2 py-2 rounded bg-industrial-orange text-industrial-bg hover:bg-orange-400 font-extrabold text-[10px] uppercase tracking-wider flex items-center justify-center space-x-1"
                >
                  <CheckCircle size={12} />
                  <span>Guardar Roster</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------- MODAL 3: EDITAR BRIGADA -------------------- */}
      {editBrigadeData && (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div 
            className="w-full max-w-5xl glass-panel rounded-lg p-6 border-industrial-cyan border-opacity-40 max-h-[90vh] overflow-y-auto"
            style={{ background: 'rgba(13, 21, 39, 0.96)', boxShadow: '0 0 25px rgba(6, 182, 212, 0.15)' }}
          >
            <div className="flex items-center justify-between border-b border-industrial-border pb-3 mb-4">
              <div className="flex items-center space-x-2 text-white">
                <Edit3 size={18} className="text-industrial-cyan animate-pulse" />
                <h3 className="font-extrabold text-sm uppercase tracking-wider">
                  {editBrigadeData.isNew ? 'Registro de Brigada y Equipamiento' : `Configuración Operativa: Brigada ${editBrigadeData.id}`}
                </h3>
              </div>
              <button onClick={() => setEditBrigadeData(null)} className="text-industrial-gray hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveBrigade} className="space-y-4 text-xs font-semibold">
              
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* COL-1: PARAMETERS */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="text-[10px] text-industrial-cyan uppercase font-black tracking-widest border-b border-industrial-cyan border-opacity-20 pb-1">
                    1. Parámetros de Brigada
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Código Brigada *</label>
                      <input
                        type="text"
                        placeholder="Ej. TCT-01"
                        value={editBrigadeData.id}
                        onChange={(e) => setEditBrigadeData({ ...editBrigadeData, id: e.target.value })}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan font-mono"
                        required
                        readOnly={!editBrigadeData.isNew}
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Departamento / Tipo *</label>
                      <select
                        value={editBrigadeData.tipo}
                        onChange={(e) => setEditBrigadeData({ ...editBrigadeData, tipo: e.target.value })}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan font-bold"
                        required
                      >
                        <option value="TCT">TCT (Alta Tensión)</option>
                        <option value="Redes">Redes (Telecomunicaciones)</option>
                        <option value="Mantenimiento">Mantenimiento Central</option>
                        <option value="Averías">Atención Averías</option>
                        <option value="Corte/Reconexion">Corte y Reconexión</option>
                        <option value="Canasto">Canasto</option>
                        <option value="Luminaria">Luminaria</option>
                        <option value="Grúa Poste">Grúa Poste</option>
                        <option value="Transformadores">Transformadores</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Vehículo Asignado *</label>
                      <input
                        type="text"
                        placeholder="Ej. L535228"
                        value={editBrigadeData.vehiculo}
                        onChange={(e) => setEditBrigadeData({ ...editBrigadeData, vehiculo: e.target.value })}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Estado Operativo</label>
                      <select
                        value={editBrigadeData.estado}
                        onChange={(e) => setEditBrigadeData({ ...editBrigadeData, estado: e.target.value })}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan"
                      >
                        <option value="Activo">Activo</option>
                        <option value="Mantenimiento">Mantenimiento</option>
                        <option value="Baja">Baja</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Supervisor Responsable *</label>
                    <select
                      value={editBrigadeData.supervisorId}
                      onChange={(e) => setEditBrigadeData({ ...editBrigadeData, supervisorId: e.target.value })}
                      className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan"
                    >
                      {getFilteredSupervisores().map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.cargo})</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Zona Operativa</label>
                      <input
                        type="text"
                        value={editBrigadeData.zone}
                        onChange={(e) => setEditBrigadeData({ ...editBrigadeData, zone: e.target.value })}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Campamento / Sector</label>
                      <input
                        type="text"
                        value={editBrigadeData.campamento}
                        onChange={(e) => setEditBrigadeData({ ...editBrigadeData, campamento: e.target.value })}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan"
                      />
                    </div>
                  </div>

                  {/* LOAD SUGGESTED KIT TRIGGER */}
                  <div className="pt-4 border-t border-industrial-border bg-industrial-panel bg-opacity-20 p-3 rounded">
                    <span className="block text-[9px] text-industrial-gray uppercase font-black tracking-widest mb-1">Cargar Equipamiento Inicial</span>
                    <p className="text-[10px] text-industrial-gray leading-normal mb-3">Haga clic abajo para cargar la dotación estándar sugerida para brigadas de tipo <span className="text-industrial-cyan font-bold">{editBrigadeData.tipo}</span>.</p>
                    <button
                      type="button"
                      onClick={handleLoadKitSuggested}
                      className="w-full py-2 rounded bg-gradient-to-r from-industrial-cyan to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-industrial-bg font-extrabold text-[10px] uppercase tracking-widest transition-all shadow-cyan-glow flex items-center justify-center space-x-1.5"
                    >
                      <Boxes size={12} />
                      <span>Cargar Kit Sugerido de {editBrigadeData.tipo}</span>
                    </button>
                  </div>
                </div>

                {/* COL-2: TOOLS KIT EDITOR */}
                <div className="lg:col-span-7 space-y-4 flex flex-col justify-between">
                  <div>
                    <div className="text-[10px] text-industrial-cyan uppercase font-black tracking-widest border-b border-industrial-cyan border-opacity-20 pb-1 mb-2 flex items-center justify-between">
                      <span>2. Kit de Equipos Asignados</span>
                      <span className="text-[9px] text-industrial-gray font-semibold tracking-normal lowercase">{modalTools.length} ítems en lista</span>
                    </div>

                    {/* Deficits alerts */}
                    {deficitsList.length > 0 && (
                      <div className="p-3 bg-industrial-orange bg-opacity-10 border border-industrial-orange rounded text-[11px] font-bold text-industrial-orange leading-relaxed space-y-1 mb-3 animate-pulse">
                        <p>⚠️ Existencias insuficientes en Almacén Central para las siguientes asignaciones:</p>
                        <div className="text-[10px] font-mono pl-3 text-white">
                          {deficitsList.map(d => (
                            <div key={d.code}>• {d.name} ({d.code}): Solicitado {d.needed} | Disponible en Bodega: {d.stock}</div>
                          ))}
                        </div>
                        {(currentRole === 'Developer' || currentRole === 'Gerente') && (
                          <div className="flex items-center space-x-2 pt-2 border-t border-industrial-orange/30 mt-2">
                            <input 
                              type="checkbox"
                              id="overrideStockCheck"
                              checked={overrideStockChoice}
                              onChange={(e) => setOverrideStockChoice(e.target.checked)}
                              className="rounded border-industrial-orange text-industrial-orange focus:ring-industrial-orange"
                            />
                            <label htmlFor="overrideStockCheck" className="text-white text-[10px] font-black uppercase cursor-pointer select-none">
                              Autorizar Sobregiro de Inventario (Developer/Gerente)
                            </label>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Table of tools */}
                    <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1 bg-industrial-bg bg-opacity-30 border border-industrial-border rounded p-2.5">
                      {modalTools.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center text-industrial-gray space-y-2">
                          <Boxes size={24} className="text-industrial-border" />
                          <p className="text-[10px] font-bold uppercase tracking-wider">Sin Equipos Asignados</p>
                          <p className="text-[9px] leading-relaxed max-w-xs">Cargue el kit estándar usando el botón de la izquierda o agregue herramientas de forma individual.</p>
                        </div>
                      ) : (
                        <table className="w-full text-left text-[11px] border-collapse">
                          <thead>
                            <tr className="text-industrial-gray text-[9px] uppercase font-bold tracking-wider border-b border-industrial-border pb-1">
                              <th className="pb-2">Ítem</th>
                              <th className="pb-2 text-center">Req / Asig</th>
                              <th className="pb-2">Estado / Observación</th>
                              <th className="pb-2 text-right">Quitar</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-industrial-border/40">
                            {modalTools.map((t) => {
                              const isMissingStock = t.stockBodega < t.delQty;
                              return (
                                <tr key={t.itemCode} className="hover:bg-industrial-bg hover:bg-opacity-40">
                                  <td className="py-2.5 pr-2">
                                    <div className="font-bold text-white flex items-center space-x-1">
                                      <span>{t.name}</span>
                                      {t.obligatorio && (
                                        <span className="text-[8px] bg-industrial-red/20 border border-industrial-red/40 text-industrial-red font-black uppercase px-1 rounded scale-90">Oblig</span>
                                      )}
                                    </div>
                                    <div className="text-[9px] text-industrial-gray font-mono font-semibold flex items-center space-x-1.5 mt-0.5">
                                      <span>{t.itemCode}</span>
                                      <span className={`text-[8px] px-1 rounded ${isMissingStock ? 'bg-industrial-red/10 text-industrial-red font-bold' : 'bg-industrial-green/10 text-industrial-green font-bold'}`}>
                                        Almacén: {t.stockBodega} disp.
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2 text-center">
                                    <div className="flex items-center justify-center space-x-1">
                                      <input 
                                        type="number"
                                        min={0}
                                        value={t.reqQty}
                                        onChange={(e) => handleUpdateModalTool(t.itemCode, 'reqQty', parseInt(e.target.value) || 0)}
                                        className="w-10 text-center bg-industrial-bg border border-industrial-border text-white text-[10px] rounded p-0.5 font-mono"
                                        title="Cantidad Requerida"
                                      />
                                      <span className="text-industrial-gray font-mono text-[9px]">/</span>
                                      <input 
                                        type="number"
                                        min={0}
                                        value={t.delQty}
                                        onChange={(e) => handleUpdateModalTool(t.itemCode, 'delQty', parseInt(e.target.value) || 0)}
                                        className={`w-10 text-center bg-industrial-bg border text-[10px] rounded p-0.5 font-mono ${isMissingStock ? 'border-industrial-red text-industrial-red font-black' : 'border-industrial-border text-white'}`}
                                        title="Cantidad Entregada"
                                      />
                                    </div>
                                  </td>
                                  <td className="py-2 pr-2">
                                    <select
                                      value={t.estado || 'Entregado'}
                                      onChange={(e) => handleUpdateModalTool(t.itemCode, 'estado', e.target.value)}
                                      className="w-full bg-industrial-bg border border-industrial-border text-[10px] text-white rounded p-0.5 focus:outline-none focus:border-industrial-cyan mb-1"
                                    >
                                      <option value="Entregado">Entregado</option>
                                      <option value="Pendiente">Pendiente</option>
                                      <option value="Dañado">Dañado</option>
                                      <option value="Perdido">Perdido</option>
                                      <option value="En reparación">En reparación</option>
                                    </select>
                                    <input 
                                      type="text"
                                      placeholder="Obs..."
                                      value={t.obs || ''}
                                      onChange={(e) => handleUpdateModalTool(t.itemCode, 'obs', e.target.value)}
                                      className="w-full bg-transparent border-b border-industrial-border/60 text-[9px] text-white focus:outline-none focus:border-industrial-cyan font-medium"
                                    />
                                  </td>
                                  <td className="py-2 text-right">
                                    <button 
                                      type="button"
                                      onClick={() => handleRemoveModalTool(t.itemCode)}
                                      className="p-1 rounded bg-industrial-red/10 hover:bg-industrial-red/20 text-industrial-red border border-industrial-red/20 transition-all"
                                      title="Quitar de Brigada"
                                      disabled={t.obligatorio}
                                      style={{ opacity: t.obligatorio ? 0.4 : 1 }}
                                    >
                                      <X size={10} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                  {/* ADD CUSTOM GEAR DROPDOWN */}
                  <div className="bg-industrial-bg bg-opacity-40 p-3 rounded border border-industrial-border">
                    <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1.5">Agregar Herramienta o Material adicional</label>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAddCustomTool(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-1.5 focus:outline-none focus:border-industrial-cyan"
                    >
                      <option value="">-- Seleccionar equipo del Almacén Central --</option>
                      {inventario
                        .filter(inv => !modalTools.some(t => t.itemCode === inv.code))
                        .map(inv => (
                          <option key={inv.code} value={inv.code}>
                            {inv.name} ({inv.code}) | Bodega: {inv.stock} disp.
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* CONTROLS */}
                  <div className="flex space-x-2 pt-4 border-t border-industrial-border">
                    <button
                      type="button"
                      onClick={() => setEditBrigadeData(null)}
                      className="w-1/2 py-2.5 rounded bg-industrial-border hover:bg-opacity-60 text-white font-extrabold text-[10px] uppercase tracking-wider transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="w-1/2 py-2.5 rounded bg-industrial-cyan text-industrial-bg hover:bg-cyan-400 font-extrabold text-[10px] uppercase tracking-wider flex items-center justify-center space-x-1 transition-all shadow-cyan-glow"
                    >
                      <Save size={12} />
                      <span>{editBrigadeData.isNew ? 'Registrar Brigada' : 'Guardar Parámetros'}</span>
                    </button>
                  </div>
                </div>

              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default BrigadasPage;
