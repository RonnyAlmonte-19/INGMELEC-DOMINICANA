import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Boxes, 
  Search, 
  Wrench, 
  ShieldCheck, 
  AlertOctagon, 
  TrendingDown, 
  DollarSign,
  MapPin,
  Edit2,
  X,
  Save,
  CheckCircle,
  Clock
} from 'lucide-react';

const InventarioPage = () => {
  const { 
    currentRole,
    inventario, 
    adjustStockItem,
    auditoria 
  } = useApp();

  // Tabs: 'Herramientas' | 'EPP' | 'EPC' | 'Stock' | 'Movimientos'
  const [activeTab, setActiveTab] = useState('Herramientas');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Editing Stock State
  const [editingItem, setEditingItem] = useState(null);
  const [adjustQtyInput, setAdjustQtyInput] = useState(0);
  const [adjustStatusInput, setAdjustStatusInput] = useState('Disponible');

  // Filtered List
  const filteredInventario = inventario.filter(i => {
    // Search
    const matchesSearch = i.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          i.code.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Status
    const matchesStatus = statusFilter === '' || i.status === statusFilter;

    // Tab category matching
    let matchesTab = true;
    if (activeTab === 'Herramientas') {
      matchesTab = i.category === 'Herramientas';
    } else if (activeTab === 'EPP') {
      matchesTab = i.category === 'EPP';
    } else if (activeTab === 'EPC') {
      matchesTab = i.category === 'EPC';
    } // 'Stock' tab shows all, no filter

    return matchesSearch && matchesStatus && matchesTab;
  });

  // Calculate critical KPIs
  const totalValue = inventario.reduce((acc, curr) => acc + (curr.stock * (parseFloat(curr.value) || 0)), 0);
  const lowStockCount = inventario.filter(i => i.stock <= i.min).length;
  const damagedCount = inventario.filter(i => i.status === 'Dañado').length;

  const handleOpenAdjust = (item) => {
    setEditingItem({ ...item });
    setAdjustQtyInput(0);
    setAdjustStatusInput(item.status);
  };

  const handleSaveAdjustment = (e) => {
    e.preventDefault();
    if (!editingItem) return;
    adjustStockItem(editingItem.code, adjustQtyInput, adjustStatusInput);
    setEditingItem(null);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Disponible': return 'bg-industrial-green/10 border-industrial-green/30 text-industrial-green';
      case 'Asignado': return 'bg-industrial-cyan/10 border-industrial-cyan/30 text-industrial-cyan';
      case 'Dañado': return 'bg-industrial-red/10 border-industrial-red/30 text-industrial-red';
      case 'Perdido': return 'bg-industrial-red/10 border-industrial-red/30 text-industrial-red border-dashed';
      case 'En reparación': return 'bg-industrial-yellow/10 border-industrial-yellow/30 text-industrial-yellow';
      case 'Bajo mínimo': return 'bg-industrial-yellow/20 border-industrial-yellow/45 text-industrial-yellow animate-pulse';
      default: return 'bg-slate-500/10 border-slate-500/30 text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      
      {/* -------------------- 1. OVERALL WAREHOUSE STATS -------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="glass-panel p-4 rounded-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest">Valorización de Bodega</span>
              <h4 className="text-xl font-extrabold text-white mt-1">${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[10px] text-industrial-gray font-normal">USD</span></h4>
            </div>
            <div className="w-9 h-9 rounded bg-industrial-cyan bg-opacity-10 flex items-center justify-center text-industrial-cyan">
              <DollarSign size={18} />
            </div>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-lg relative overflow-hidden border-l-2 border-l-industrial-orange">
          <div className="flex items-center justify-between">
            <div>
              <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest">Críticos Bajo Mínimo</span>
              <h4 className="text-xl font-extrabold text-industrial-orange mt-1">{lowStockCount} <span className="text-[10px] text-industrial-gray font-normal">Ítems</span></h4>
            </div>
            <div className="w-9 h-9 rounded bg-industrial-orange bg-opacity-10 flex items-center justify-center text-industrial-orange">
              <TrendingDown size={18} />
            </div>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest">Material Disponible</span>
              <h4 className="text-xl font-extrabold text-white mt-1">{inventario.reduce((acc, curr) => acc + (curr.status === 'Disponible' ? curr.stock : 0), 0)} <span className="text-[10px] text-industrial-gray font-normal">Unidades</span></h4>
            </div>
            <div className="w-9 h-9 rounded bg-industrial-green bg-opacity-10 flex items-center justify-center text-industrial-green">
              <ShieldCheck size={18} />
            </div>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-lg relative overflow-hidden border-l-2 border-l-industrial-red">
          <div className="flex items-center justify-between">
            <div>
              <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest">Bajas por Daño</span>
              <h4 className="text-xl font-extrabold text-industrial-red mt-1">{damagedCount} <span className="text-[10px] text-industrial-gray font-normal">Equipos</span></h4>
            </div>
            <div className="w-9 h-9 rounded bg-industrial-red bg-opacity-10 flex items-center justify-center text-industrial-red">
              <AlertOctagon size={18} />
            </div>
          </div>
        </div>

      </div>

      {/* -------------------- 2. CATEGORY TABS & FILTERS -------------------- */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-industrial-border pb-4">
        
        {/* Category Selector Toggles */}
        <div className="flex space-x-1 p-1 bg-industrial-bg bg-opacity-70 rounded border border-industrial-border self-start font-semibold">
          {['Herramientas', 'EPP', 'EPC', 'Stock Completo', 'Movimientos'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded text-xs tracking-wider uppercase transition-all ${
                activeTab === tab 
                  ? 'bg-industrial-cyan text-industrial-bg font-extrabold'
                  : 'text-industrial-gray hover:text-white'
              }`}
            >
              {tab === 'Stock Completo' ? 'Stock Completo' : tab}
            </button>
          ))}
        </div>

        {/* Filters and search (hidden in movements tab) */}
        {activeTab !== 'Movimientos' && (
          <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
            <div className="relative w-full sm:w-64">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-industrial-gray">
                <Search size={12} />
              </span>
              <input
                type="text"
                placeholder="Buscar por código o nombre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-industrial-bg bg-opacity-70 border border-industrial-border rounded px-3 py-1 text-xs text-white focus:outline-none focus:border-industrial-cyan"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-industrial-bg border border-industrial-border text-xs text-white px-3 py-1 rounded focus:outline-none focus:border-industrial-cyan font-semibold"
            >
              <option value="">Cualquier Estado</option>
              <option value="Disponible">Disponible</option>
              <option value="Asignado">Asignado</option>
              <option value="Dañado">Dañado</option>
              <option value="En reparación">En reparación</option>
              <option value="Bajo mínimo">Bajo Mínimo</option>
            </select>
          </div>
        )}

      </div>

      {/* -------------------- 3. GRID CONTENT TABLES -------------------- */}
      {activeTab === 'Movimientos' ? (
        
        /* MOVIMIENTO LOG VISTA (FROM AUDIT TRAIL) */
        <div className="glass-panel rounded-lg p-5">
          <div className="flex items-center space-x-2 mb-4">
            <Clock size={16} className="text-industrial-cyan" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Historial de Kárdex y Movimientos de Inventario</h4>
          </div>
          
          <div className="space-y-3">
            {auditoria
              .filter(a => a.accion.includes('STOCK') || a.accion.includes('INVENTARIO') || a.accion.includes('ACTA'))
              .map(log => (
                <div key={log.id} className="p-3 bg-industrial-bg bg-opacity-40 border border-industrial-border rounded flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-semibold">
                  <div>
                    <span className="text-industrial-cyan font-bold">{log.entidad}</span>
                    <span className="text-[9px] bg-industrial-border px-1.5 py-0.2 rounded text-industrial-gray font-mono uppercase ml-2">
                      {log.accion}
                    </span>
                    <div className="text-[10px] text-white mt-1 leading-normal font-medium">{log.despues}</div>
                  </div>
                  <div className="text-right text-[10px] text-industrial-gray flex items-center space-x-3 sm:space-x-0 sm:flex-col sm:justify-center">
                    <span className="text-white font-bold">@{log.usuario}</span>
                    <span className="font-mono text-[9px] text-industrial-cyan sm:mt-0.5">{log.fecha}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>

      ) : (

        /* CORE PRODUCTS DATATABLE */
        <div className="glass-panel rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-industrial-bg bg-opacity-80 text-industrial-gray font-bold uppercase tracking-wider border-b border-industrial-border text-[9px]">
                  <th className="p-4">Código / Ítem</th>
                  <th className="p-4">Categoría</th>
                  <th className="p-4 text-center">Stock Actual</th>
                  <th className="p-4 text-center">Umbral Mínimo</th>
                  <th className="p-4">Ubicación Bodega</th>
                  <th className="p-4">Valor Referencial</th>
                  <th className="p-4">Estado</th>
                  {(currentRole === 'Developer' || currentRole === 'Gerente') && <th className="p-4 text-right">Ajuste</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-industrial-border">
                {filteredInventario.map((item) => {
                  const isUnderMin = item.stock <= item.min;
                  
                  return (
                    <tr key={item.id} className="hover:bg-industrial-border hover:bg-opacity-20 transition-all font-semibold">
                      <td className="p-4">
                        <div className="font-extrabold text-white text-sm">{item.name}</div>
                        <div className="text-[10px] text-industrial-cyan font-mono font-bold mt-0.5">{item.code}</div>
                      </td>
                      <td className="p-4">
                        <span className="bg-industrial-border px-2 py-0.5 rounded text-[10px] text-white uppercase tracking-wider">
                          {item.category}
                        </span>
                      </td>
                      <td className={`p-4 text-center text-sm font-extrabold ${isUnderMin ? 'text-industrial-red font-black' : 'text-white'}`}>
                        {item.stock}
                      </td>
                      <td className="p-4 text-center font-mono text-industrial-gray">
                        {item.min}
                      </td>
                      <td className="p-4">
                        <span className="text-white text-[11px] flex items-center space-x-1">
                          <MapPin size={11} className="text-industrial-gray" />
                          <span>{item.location}</span>
                        </span>
                      </td>
                      <td className="p-4 font-mono text-white text-[11px]">
                        ${(parseFloat(item.value) || 0).toFixed(2)} USD
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 border rounded text-[9px] uppercase font-bold tracking-wider ${
                          isUnderMin ? getStatusColor('Bajo mínimo') : getStatusColor(item.status)
                        }`}>
                          {isUnderMin ? 'Bajo Mínimo' : item.status}
                        </span>
                      </td>
                      {(currentRole === 'Developer' || currentRole === 'Gerente') && (
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleOpenAdjust(item)}
                            className="p-1 rounded bg-industrial-cyan bg-opacity-10 hover:bg-opacity-20 border border-industrial-cyan border-opacity-20 text-industrial-cyan transition-all"
                            title="Ajustar Bodega"
                          >
                            <Edit2 size={13} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      )}

      {/* -------------------- MODAL: STOCK ADJUSTMENT FORM -------------------- */}
      {editingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div 
            className="w-full max-w-md glass-panel rounded-lg p-6 border-neon-cyan"
            style={{ background: 'rgba(13, 21, 39, 0.95)' }}
          >
            <div className="flex items-center justify-between border-b border-industrial-border pb-3 mb-4">
              <div className="flex items-center space-x-2 text-white">
                <Boxes size={18} className="text-industrial-cyan" />
                <h3 className="font-extrabold text-sm uppercase tracking-wider">Ajuste de Stock y Kárdex Almacén</h3>
              </div>
              <button onClick={() => setEditingItem(null)} className="text-industrial-gray hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment} className="space-y-4 text-xs font-semibold">
              
              <div className="bg-industrial-bg bg-opacity-60 p-3 rounded border border-industrial-border">
                <span className="text-[9px] text-industrial-gray uppercase font-bold tracking-widest">Artículo Seleccionado</span>
                <h4 className="font-bold text-sm text-white mt-0.5">{editingItem.name}</h4>
                <p className="font-mono text-[10px] text-industrial-cyan mt-0.5">{editingItem.code}</p>
                <div className="grid grid-cols-2 gap-2 mt-3 text-[10px] text-industrial-gray font-bold uppercase">
                  <div>Stock Actual: <span className="text-white font-extrabold">{editingItem.stock}</span></div>
                  <div>Mínimo: <span className="text-white font-extrabold">{editingItem.min}</span></div>
                </div>
              </div>

              <div>
                <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1.5">Variar Stock (Incremento/Decremento)</label>
                <div className="flex items-center space-x-3">
                  <button 
                    type="button" 
                    onClick={() => setAdjustQtyInput(prev => prev - 1)}
                    className="w-9 h-9 rounded bg-industrial-border text-white text-lg font-bold hover:bg-opacity-70 transition-all flex items-center justify-center"
                  >
                    -
                  </button>
                  
                  <input
                    type="number"
                    value={adjustQtyInput}
                    onChange={(e) => setAdjustQtyInput(parseInt(e.target.value) || 0)}
                    className="w-20 text-center bg-industrial-bg border border-industrial-border text-base text-white rounded p-1.5 focus:outline-none focus:border-industrial-cyan font-mono"
                  />
                  
                  <button 
                    type="button" 
                    onClick={() => setAdjustQtyInput(prev => prev + 1)}
                    className="w-9 h-9 rounded bg-industrial-border text-white text-lg font-bold hover:bg-opacity-70 transition-all flex items-center justify-center"
                  >
                    +
                  </button>

                  <span className="text-[10px] text-industrial-gray font-semibold">
                    (Nuevo Stock: <span className="text-white font-bold">{Math.max(0, editingItem.stock + adjustQtyInput)}</span>)
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1.5">Estado Operativo del Ítem</label>
                <select
                  value={adjustStatusInput}
                  onChange={(e) => setAdjustStatusInput(e.target.value)}
                  className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan"
                >
                  <option value="Disponible">Disponible</option>
                  <option value="Asignado">Asignado</option>
                  <option value="Dañado">Dañado</option>
                  <option value="Perdido">Perdido</option>
                  <option value="En reparación">En reparación</option>
                </select>
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="w-1/2 py-2 rounded bg-industrial-border hover:bg-opacity-60 text-white font-extrabold text-[10px] uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2 rounded bg-industrial-cyan text-industrial-bg hover:bg-cyan-400 font-extrabold text-[10px] uppercase tracking-wider flex items-center justify-center space-x-1"
                >
                  <Save size={12} />
                  <span>Aplicar Ajuste</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default InventarioPage;
