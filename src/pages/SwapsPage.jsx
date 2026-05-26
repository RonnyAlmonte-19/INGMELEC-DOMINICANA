import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  ArrowLeftRight, 
  Search, 
  Plus, 
  X, 
  Save, 
  CheckCircle, 
  Truck,
  Wrench
} from 'lucide-react';

const SwapsPage = () => {
  const { 
    swaps, 
    brigadas, 
    tecnicos, 
    inventario, 
    registerSwap 
  } = useApp();

  // Search
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewSwapModal, setShowNewSwapModal] = useState(false);

  // Form states
  const [selectedBrigada, setSelectedBrigada] = useState('');
  const [selectedTecnico, setSelectedTecnico] = useState('');
  const [oldToolName, setOldToolName] = useState('');
  const [newToolName, setNewToolName] = useState('');
  const [swapReason, setSwapReason] = useState('');

  const filteredSwaps = swaps.filter(s => {
    return s.herramientaAnterior.toLowerCase().includes(searchTerm.toLowerCase()) ||
           s.herramientaNueva.toLowerCase().includes(searchTerm.toLowerCase()) ||
           s.tecnico.toLowerCase().includes(searchTerm.toLowerCase()) ||
           s.brigadaId.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleBrigadaChange = (bId) => {
    setSelectedBrigada(bId);
    // Auto-select first technician in this brigade
    const members = tecnicos.filter(t => t.brigadaId === bId && t.estado === 'Activo');
    if (members.length > 0) {
      setSelectedTecnico(members[0].name);
    } else {
      setSelectedTecnico('');
    }
  };

  const handleCreateSwap = (e) => {
    e.preventDefault();
    if (!selectedBrigada || !oldToolName || !newToolName || !swapReason) {
      alert('Por favor complete todos los campos obligatorios del swap.');
      return;
    }

    const swapObj = {
      herramientaAnterior: oldToolName,
      herramientaNueva: newToolName,
      brigadaId: selectedBrigada,
      tecnico: selectedTecnico || 'Técnico General',
      motivo: swapReason
    };

    registerSwap(swapObj);
    setShowNewSwapModal(false);
    
    // Clear form
    setSelectedBrigada('');
    setSelectedTecnico('');
    setOldToolName('');
    setNewToolName('');
    setSwapReason('');
  };

  return (
    <div className="space-y-6">
      
      {/* Search and New Swap CTA */}
      <div className="glass-panel p-4 rounded-lg flex flex-col sm:flex-row gap-4 justify-between items-center border-opacity-40">
        
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-industrial-gray">
            <Search size={14} />
          </span>
          <input
            type="text"
            placeholder="Buscar por herramienta, brigada o técnico..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-industrial-bg bg-opacity-70 border border-industrial-border rounded px-3 py-1.5 pl-9 text-xs text-white focus:outline-none focus:border-industrial-cyan"
          />
        </div>

        {/* CTA */}
        <button
          onClick={() => setShowNewSwapModal(true)}
          className="flex items-center space-x-1.5 px-4 py-1.5 rounded bg-gradient-to-r from-industrial-cyan to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-industrial-bg text-xs font-extrabold uppercase tracking-wider transition-all shadow-cyan-glow w-full sm:w-auto justify-center"
        >
          <Plus size={14} />
          <span>Registrar Nuevo Swap</span>
        </button>

      </div>

      {/* Main Datatable */}
      <div className="glass-panel rounded-lg overflow-hidden border-opacity-40">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-industrial-bg bg-opacity-80 text-industrial-gray font-bold uppercase tracking-wider border-b border-industrial-border text-[10px]">
                <th className="p-4">ID Swap</th>
                <th className="p-4">Herramienta Anterior</th>
                <th className="p-4">Herramienta de Reemplazo</th>
                <th className="p-4">Brigada / Operario Roster</th>
                <th className="p-4">Motivo del Cambio</th>
                <th className="p-4">Fecha Operación</th>
                <th className="p-4">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-border font-semibold">
              {filteredSwaps.map((s) => (
                <tr key={s.id} className="hover:bg-industrial-border hover:bg-opacity-20 transition-all">
                  <td className="p-4 font-bold text-white text-sm font-mono">{s.id}</td>
                  <td className="p-4">
                    <span className="text-industrial-red text-[11px] font-bold block">{s.herramientaAnterior}</span>
                    <span className="text-[8px] text-industrial-gray uppercase font-bold tracking-widest">Baja Operativa</span>
                  </td>
                  <td className="p-4">
                    <span className="text-industrial-green text-[11px] font-bold block">{s.herramientaNueva}</span>
                    <span className="text-[8px] text-industrial-gray uppercase font-bold tracking-widest">Entrega Calibrada</span>
                  </td>
                  <td className="p-4">
                    <div className="text-white text-[11px]">Brigada: <span className="text-industrial-cyan font-bold">{s.brigadaId}</span></div>
                    <div className="text-[9px] text-industrial-gray mt-0.5">Téc: {s.tecnico}</div>
                  </td>
                  <td className="p-4 text-industrial-gray text-[11px] truncate max-w-xs">{s.motivo}</td>
                  <td className="p-4 font-mono text-white text-[11px]">{s.fecha}</td>
                  <td className="p-4">
                    <span className="px-2 py-0.5 rounded bg-industrial-green/10 border border-industrial-green/30 text-industrial-green text-[9px] font-bold uppercase tracking-wider">
                      {s.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* -------------------- MODAL: REGISTRAR NUEVO SWAP -------------------- */}
      {showNewSwapModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div 
            className="w-full max-w-md glass-panel rounded-lg p-6 border-neon-cyan"
            style={{ background: 'rgba(13, 21, 39, 0.95)' }}
          >
            <div className="flex items-center justify-between border-b border-industrial-border pb-3 mb-4">
              <div className="flex items-center space-x-2 text-white">
                <ArrowLeftRight size={18} className="text-industrial-cyan" />
                <h3 className="font-extrabold text-sm uppercase tracking-wider">REGISTRO DE SWAP DE EQUIPAMIENTO</h3>
              </div>
              <button onClick={() => setShowNewSwapModal(false)} className="text-industrial-gray hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSwap} className="space-y-4 text-xs font-semibold">
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Brigada Destinataria *</label>
                  <select
                    value={selectedBrigada}
                    onChange={(e) => handleBrigadaChange(e.target.value)}
                    className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan"
                    required
                  >
                    <option value="">Seleccione Brigada...</option>
                    {brigadas.map(b => (
                      <option key={b.id} value={b.id}>{b.id} ({b.tipo})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Técnico Roster</label>
                  <input
                    type="text"
                    value={selectedTecnico}
                    onChange={(e) => setSelectedTecnico(e.target.value)}
                    placeholder="Auto-detectado..."
                    className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan"
                    readOnly
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Herramienta Anterior (Dañada/Baja) *</label>
                <select
                  value={oldToolName}
                  onChange={(e) => setOldToolName(e.target.value)}
                  className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan"
                  required
                >
                  <option value="">Seleccione Ítem...</option>
                  {inventario
                    .filter(i => i.category === 'Herramientas')
                    .map(i => (
                      <option key={i.code} value={i.name}>{i.name}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Herramienta Nueva (Asignada Calibrada) *</label>
                <select
                  value={newToolName}
                  onChange={(e) => setNewToolName(e.target.value)}
                  className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan"
                  required
                >
                  <option value="">Seleccione Reemplazo...</option>
                  {inventario
                    .filter(i => i.category === 'Herramientas' && i.stock > 0)
                    .map(i => (
                      <option key={i.code} value={`${i.name} (SN-${Math.floor(1000 + Math.random() * 9000)})`}>{i.name}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Motivo / Causa Técnica del Swap *</label>
                <textarea
                  value={swapReason}
                  onChange={(e) => setSwapReason(e.target.value)}
                  placeholder="Escriba el informe de falla técnica (ej. cortocircuito, descalibración de perillas, ruptura de acoples)..."
                  rows={3}
                  className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan placeholder-industrial-border"
                  required
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewSwapModal(false)}
                  className="w-1/2 py-2 rounded bg-industrial-border hover:bg-opacity-60 text-white font-extrabold text-[10px] uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2 rounded bg-industrial-cyan text-industrial-bg hover:bg-cyan-400 font-extrabold text-[10px] uppercase tracking-wider flex items-center justify-center space-x-1"
                >
                  <Save size={12} />
                  <span>Aplicar Swap</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default SwapsPage;
