import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  RotateCcw, 
  Search, 
  Check, 
  AlertTriangle, 
  FileCheck2, 
  ChevronRight, 
  Save, 
  X 
} from 'lucide-react';

const DevolucionesPage = () => {
  const { 
    currentRole,
    devoluciones, 
    checkoutReturn 
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Editing state
  const [confirmReturnItem, setConfirmReturnItem] = useState(null);
  const [returnedQty, setReturnedQty] = useState(1);
  const [returnStatus, setReturnStatus] = useState('Devuelto');
  const [returnObs, setReturnObs] = useState('');

  // Use the reactive list from context directly to prevent stale data
  const filteredDevoluciones = (devoluciones || []).filter(d => {
    const matchesSearch = d.colaborador.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          d.brigadaId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          d.item.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === '' || d.estado === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'Devuelto': return 'bg-industrial-green/10 border-industrial-green/30 text-industrial-green';
      case 'Parcial': return 'bg-industrial-yellow/10 border-industrial-yellow/30 text-industrial-yellow';
      case 'Pendiente': return 'bg-industrial-yellow/20 border-industrial-yellow/45 text-industrial-yellow animate-pulse';
      case 'Faltante': return 'bg-industrial-red/10 border-industrial-red/30 text-industrial-red border-dashed';
      case 'Descontar': return 'bg-purple-500/10 border-purple-500/30 text-purple-400';
      default: return 'bg-slate-500/10 border-slate-500/30 text-slate-400';
    }
  };

  const handleOpenConfirm = (dev) => {
    setConfirmReturnItem(dev);
    setReturnedQty(dev.cantEsperada);
    setReturnStatus('Devuelto');
    setReturnObs(dev.observacion || '');
  };

  const handleSaveReturn = async (e) => {
    e.preventDefault();
    if (!confirmReturnItem) return;

    await checkoutReturn(
      confirmReturnItem.id,
      returnedQty,
      returnStatus,
      returnObs
    );

    setConfirmReturnItem(null);
  };

  return (
    <div className="space-y-6">
      
      {/* Search and Filters */}
      <div className="glass-panel p-4 rounded-lg flex flex-col sm:flex-row gap-4 justify-between items-center border-opacity-40">
        
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-industrial-gray">
            <Search size={14} />
          </span>
          <input
            type="text"
            placeholder="Buscar por colaborador, brigada o ítem..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-industrial-bg bg-opacity-70 border border-industrial-border rounded px-3 py-1.5 pl-9 text-xs text-white focus:outline-none focus:border-industrial-cyan"
          />
        </div>

        {/* Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-48 bg-industrial-bg border border-industrial-border text-xs text-white px-3 py-1.5 rounded focus:outline-none focus:border-industrial-cyan font-semibold"
        >
          <option value="">Cualquier Estado</option>
          <option value="Devuelto">Devuelto</option>
          <option value="Parcial">Parcial</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Faltante">Faltante</option>
          <option value="Descontar">Descuento Nómina</option>
        </select>

      </div>

      {/* Main Datatable */}
      <div className="glass-panel rounded-lg overflow-hidden border-opacity-40">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-industrial-bg bg-opacity-80 text-industrial-gray font-bold uppercase tracking-wider border-b border-industrial-border text-[10px]">
                <th className="p-4">ID Ticket</th>
                <th className="p-4">Colaborador Técnico</th>
                <th className="p-4">Brigada Origen</th>
                <th className="p-4">Artículo a Retornar</th>
                <th className="p-4 text-center">Cant. Esperada</th>
                <th className="p-4 text-center">Cant. Devuelta</th>
                <th className="p-4">Observaciones Checkout</th>
                <th className="p-4">Estado</th>
                <th className="p-4 text-right">Acción Checkout</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-border font-semibold">
              {filteredDevoluciones.map((d) => (
                <tr key={d.id} className="hover:bg-industrial-border hover:bg-opacity-20 transition-all">
                  <td className="p-4 font-bold text-white text-sm font-mono">{d.id}</td>
                  <td className="p-4 text-white text-sm">{d.colaborador}</td>
                  <td className="p-4 font-bold text-industrial-cyan">{d.brigadaId}</td>
                  <td className="p-4 text-white text-[11px]">{d.item}</td>
                  <td className="p-4 text-center font-mono text-white text-sm font-extrabold">{d.cantEsperada}</td>
                  <td className="p-4 text-center font-mono text-white text-sm font-extrabold">{d.cantDevuelta}</td>
                  <td className="p-4 text-industrial-gray text-[10px] truncate max-w-xs">{d.observacion || 'Sin comentarios'}</td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 border rounded text-[9px] uppercase font-bold tracking-wider ${getStatusColor(d.estado)}`}>
                      {d.estado}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    {d.estado === 'Pendiente' || d.estado === 'Parcial' ? (
                      <button
                        onClick={() => handleOpenConfirm(d)}
                        className="px-2.5 py-1 rounded bg-industrial-cyan text-industrial-bg hover:bg-cyan-400 font-extrabold text-[9px] uppercase tracking-wider transition-colors inline-flex items-center space-x-1"
                      >
                        <span>Check-In</span>
                        <ChevronRight size={10} />
                      </button>
                    ) : (
                      <span className="text-[10px] text-industrial-gray font-semibold flex items-center justify-end space-x-1">
                        <Check size={12} className="text-industrial-green" />
                        <span>Verificado</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* -------------------- MODAL: CHECK-IN VERIFIER FORM -------------------- */}
      {confirmReturnItem && (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div 
            className="w-full max-w-md glass-panel rounded-lg p-6 border-neon-cyan"
            style={{ background: 'rgba(13, 21, 39, 0.95)' }}
          >
            <div className="flex items-center justify-between border-b border-industrial-border pb-3 mb-4">
              <div className="flex items-center space-x-2 text-white">
                <RotateCcw size={18} className="text-industrial-cyan" />
                <h3 className="font-extrabold text-sm uppercase tracking-wider">Checkout y Retorno de Materiales</h3>
              </div>
              <button onClick={() => setConfirmReturnItem(null)} className="text-industrial-gray hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveReturn} className="space-y-4 text-xs font-semibold">
              
              <div className="bg-industrial-bg bg-opacity-60 p-3 rounded border border-industrial-border">
                <span className="text-[9px] text-industrial-gray uppercase font-bold tracking-widest">Colaborador Técnico</span>
                <h4 className="font-bold text-sm text-white mt-0.5">{confirmReturnItem.colaborador}</h4>
                <p className="text-[10px] text-industrial-cyan font-bold mt-0.5">Brigada: {confirmReturnItem.brigadaId} | Ítem: {confirmReturnItem.item}</p>
                <div className="text-[10px] text-industrial-gray uppercase font-bold mt-2">
                  Cantidad Esperada en Inventario: <span className="text-white font-extrabold">{confirmReturnItem.cantEsperada}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1.5">Cantidad Devuelta *</label>
                  <input
                    type="number"
                    value={returnedQty}
                    onChange={(e) => setReturnedQty(parseInt(e.target.value) || 0)}
                    min={0}
                    max={confirmReturnItem.cantEsperada}
                    className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1.5">Validación de Estado *</label>
                  <select
                    value={returnStatus}
                    onChange={(e) => setReturnStatus(e.target.value)}
                    className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan font-bold"
                    required
                  >
                    <option value="Devuelto">Devuelto Total</option>
                    <option value="Parcial">Devolución Parcial</option>
                    <option value="Faltante">Faltante / Extravío</option>
                    <option value="Descontar">Deducir de Nómina</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1.5">Observación del Check-In</label>
                <textarea
                  value={returnObs}
                  onChange={(e) => setReturnObs(e.target.value)}
                  placeholder="Detallar condiciones físicas del equipo (ej. desgaste en mango, pintura rayada, cables pelados o pérdida completa en obra)..."
                  rows={3}
                  className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan placeholder-industrial-border"
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmReturnItem(null)}
                  className="w-1/2 py-2 rounded bg-industrial-border hover:bg-opacity-60 text-white font-extrabold text-[10px] uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2 rounded bg-industrial-cyan text-industrial-bg hover:bg-cyan-400 font-extrabold text-[10px] uppercase tracking-wider flex items-center justify-center space-x-1"
                >
                  <Save size={12} />
                  <span>Registrar Retorno</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default DevolucionesPage;
