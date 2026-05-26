import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  UserCheck, 
  Search, 
  Phone, 
  FileBadge, 
  Calendar, 
  Trash2, 
  X, 
  ShieldCheck, 
  SlidersHorizontal,
  ChevronRight,
  ShieldAlert,
  Info,
  Award,
  BookOpen,
  History,
  Scale,
  QrCode
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const TecnicosPage = ({ selectedTechId, setSelectedTechId }) => {
  const { 
    currentRole,
    getFilteredTecnicos, 
    brigadas,
    supervisores,
    brigadaHerramientas,
    darDeBajaColaborador,
    actas
  } = useApp();

  const filteredTecnicosList = getFilteredTecnicos();

  // States
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [confirmBajaTech, setConfirmBajaTech] = useState(null);
  const [dossierTab, setDossierTab] = useState('base'); // 'base', 'historial', 'certificaciones', 'disciplina'

  // Active Technician File
  const activeTechId = selectedTechId || (filteredTecnicosList.length > 0 ? filteredTecnicosList[0].id : null);
  const activeTech = filteredTecnicosList.find(t => t.id === activeTechId);

  // Filtered List
  const searchedTecnicos = filteredTecnicosList.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          t.codigoEmpleado.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.cedula.includes(searchTerm);
    const matchesStatus = statusFilter === '' || t.estado === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDarDeBaja = (tech) => {
    setConfirmBajaTech(tech);
  };

  const handleConfirmBaja = () => {
    if (!confirmBajaTech) return;
    darDeBajaColaborador(confirmBajaTech.id);
    setConfirmBajaTech(null);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Activo': return 'bg-industrial-green/10 border-industrial-green/30 text-industrial-green';
      case 'Suspendido': return 'bg-industrial-yellow/10 border-industrial-yellow/30 text-industrial-yellow';
      case 'Desvinculado': return 'bg-industrial-red/10 border-industrial-red/30 text-industrial-red';
      case 'Inactivo': return 'bg-slate-500/10 border-slate-500/30 text-slate-400';
      default: return 'bg-slate-500/10 border-slate-500/30 text-slate-400';
    }
  };

  const getSieBadge = (sie) => {
    switch (sie) {
      case 'Válido': return 'bg-industrial-green/10 border-industrial-green/30 text-industrial-green';
      case 'Por Vencer': return 'bg-industrial-yellow/10 border-industrial-yellow/30 text-industrial-yellow';
      case 'Expirado': return 'bg-industrial-red/10 border-industrial-red/30 text-industrial-red';
      default: return 'bg-slate-500/10 border-slate-500/30 text-slate-400';
    }
  };

  // Find active gear allocated to technician's brigade
  const activeTechGear = activeTech ? brigadaHerramientas.filter(bh => bh.brigadaId === activeTech.brigadaId) : [];

  // Filtered actas for this technician
  const activeTechActas = activeTech ? actas.filter(a => a.destino.includes(activeTech.name)) : [];

  // Render highly-realistic vector QR code containing cryptographic metadata
  const renderMockQRCode = (tech) => {
    if (!tech) return null;
    const metadata = `GRIDOPS-ID:${tech.codigoEmpleado}|CED:${tech.cedula}|SIE:${tech.sie}`;
    return (
      <div className="flex flex-col items-center space-y-1" title={metadata}>
        <svg className="w-16 h-16 bg-white p-1 rounded border border-industrial-border" viewBox="0 0 29 29">
          <path d="M0,0 h7 v7 h-7 z M2,2 h3 v3 h-3 z M0,9 h1 v1 h-1 z M4,9 h2 v1 h-2 z M0,12 h2 v2 h-2 z" fill="#0d1527" />
          <path d="M22,0 h7 v7 h-7 z M24,2 h3 v3 h-3 z M22,9 h2 v1 h-2 z M27,10 h2 v2 h-2 z" fill="#0d1527" />
          <path d="M0,22 h7 v7 h-7 z M2,24 h3 v3 h-3 z M8,22 h2 v2 h-2 z M9,26 h2 v2 h-2 z" fill="#0d1527" />
          <path d="M9,9 h2 v2 h-2 z M14,14 h2 v2 h-2 z M18,18 h2 v2 h-2 z" fill="#0d1527" />
          <path d="M12,0 h2 v2 h-2 z M15,4 h2 v2 h-2 z M18,0 h2 v2 h-2 z" fill="#0d1527" />
          <path d="M0,15 h2 v2 h-2 z M12,18 h2 v2 h-2 z M24,15 h2 v2 h-2 z" fill="#0d1527" />
          <path d="M14,9 h2 v2 h-2 z M20,11 h2 v2 h-2 z M15,22 h3 v2 h-3 z" fill="#0d1527" />
        </svg>
        <span className="font-mono text-[7px] text-industrial-gray leading-none">ID DIGITAL SECURE</span>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs text-white">
      
      {/* -------------------- LEFT SIDEBAR: DIRECTORY -------------------- */}
      <div className="lg:col-span-4 space-y-4">
        
        {/* Search & Filters */}
        <div className="glass-panel p-4 rounded-lg space-y-3">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-industrial-gray">
              <Search size={14} />
            </span>
            <input
              type="text"
              placeholder="Buscar técnico por nombre, cédula..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-industrial-bg bg-opacity-70 border border-industrial-border rounded px-3 py-1.5 pl-9 text-xs text-white focus:outline-none focus:border-industrial-cyan"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-industrial-bg border border-industrial-border text-xs text-white px-3 py-1.5 rounded focus:outline-none focus:border-industrial-cyan font-semibold"
          >
            <option value="">Todos los Estados</option>
            <option value="Activo">Activo</option>
            <option value="Suspendido">Suspendido</option>
            <option value="Inactivo">Inactivo</option>
            <option value="Desvinculado">Desvinculado</option>
          </select>
        </div>

        {/* Technical Roster Grid list */}
        <div className="glass-panel rounded-lg overflow-y-auto max-h-[calc(100vh-260px)] divide-y divide-industrial-border">
          {searchedTecnicos.length === 0 ? (
            <div className="p-8 text-center text-xs text-industrial-gray font-semibold">
              No se encontraron técnicos con los filtros indicados.
            </div>
          ) : (
            searchedTecnicos.map((t) => {
              const isActive = t.id === activeTechId;
              return (
                <div 
                  key={t.id}
                  onClick={() => setSelectedTechId(t.id)}
                  className={`p-3 cursor-pointer flex items-center justify-between transition-all group ${
                    isActive 
                      ? 'bg-industrial-border/60 border-l-4 border-l-industrial-cyan shadow-cyan-glow' 
                      : 'hover:bg-industrial-border/20 border-l-4 border-l-transparent'
                  }`}
                >
                  <div className="truncate pr-3">
                    <div className={`text-xs font-bold transition-colors ${isActive ? 'text-industrial-cyan' : 'text-white'}`}>
                      {t.name}
                    </div>
                    <div className="text-[10px] text-industrial-gray font-semibold mt-0.5">
                      {t.codigoEmpleado} • {t.brigadaId || 'Sin Brigada'}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className={`px-1.5 py-0.2 rounded text-[8px] font-extrabold uppercase border ${getStatusColor(t.estado)}`}>
                      {t.estado}
                    </span>
                    <ChevronRight size={14} className={`text-industrial-gray group-hover:translate-x-0.5 transition-transform ${isActive ? 'text-industrial-cyan' : ''}`} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* -------------------- RIGHT DETAILS: EXPEDIENTE TÉCNICO -------------------- */}
      <div className="lg:col-span-8">
        {activeTech ? (
          <div className="glass-panel rounded-lg p-6 border-neon-cyan relative overflow-hidden flex flex-col justify-between min-h-[calc(100vh-180px)]">
            
            {/* Header profile background glow */}
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-industrial-cyan/5 filter blur-3xl pointer-events-none" />

            <div>
              {/* Profile Card Intro */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-industrial-border gap-4">
                <div className="flex items-center space-x-4">
                  {/* Photo frame placeholder with neon outline */}
                  <div className="w-16 h-16 rounded border-2 border-industrial-cyan p-0.5 bg-industrial-bg flex-shrink-0 flex items-center justify-center relative overflow-hidden shadow-cyan-glow">
                    <div className="absolute inset-0 bg-gradient-to-tr from-industrial-panelHeader to-transparent opacity-60" />
                    {/* Simulated vector outline avatar */}
                    <svg className="w-12 h-12 text-industrial-cyan/70 opacity-95" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                    <div className="absolute bottom-0 inset-x-0 bg-industrial-cyan bg-opacity-10 py-0.5 text-center text-[7px] text-industrial-cyan font-mono tracking-widest uppercase">LOTE 4</div>
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-base font-black text-white leading-none">{activeTech.name}</h3>
                      <span className={`px-2 py-0.5 border rounded text-[9px] uppercase font-bold tracking-wider ${getStatusColor(activeTech.estado)}`}>
                        {activeTech.estado}
                      </span>
                    </div>
                    <p className="text-xs text-industrial-cyan font-bold tracking-wider mt-1">{activeTech.codigoEmpleado} | Técnico Liniero de Alta Tensión</p>
                  </div>
                </div>

                {/* Secure QR render */}
                <div className="flex items-center space-x-4">
                  {renderMockQRCode(activeTech)}
                  {activeTech.estado !== 'Desvinculado' && (currentRole === 'Developer' || currentRole === 'Gerente') && (
                    <button
                      onClick={() => handleDarDeBaja(activeTech)}
                      className="flex items-center space-x-2 px-3 py-2 rounded bg-industrial-red/10 hover:bg-industrial-red/20 text-industrial-red border border-industrial-red/30 text-xs font-bold uppercase transition-colors"
                    >
                      <Trash2 size={12} />
                      <span>Dar de Baja</span>
                    </button>
                  )}
                </div>
              </div>

              {/* PROFILE TAB BUTTONS */}
              <div className="flex space-x-2 border-b border-industrial-border pb-px mt-4">
                <button
                  onClick={() => setDossierTab('base')}
                  className={`pb-2 px-3 font-extrabold uppercase text-[10px] tracking-wider border-b-2 transition-all flex items-center space-x-1.5 ${
                    dossierTab === 'base' ? 'border-industrial-cyan text-industrial-cyan' : 'border-transparent text-industrial-gray hover:text-white'
                  }`}
                >
                  <Award size={12} />
                  <span>Expediente Base</span>
                </button>
                <button
                  onClick={() => setDossierTab('certificaciones')}
                  className={`pb-2 px-3 font-extrabold uppercase text-[10px] tracking-wider border-b-2 transition-all flex items-center space-x-1.5 ${
                    dossierTab === 'certificaciones' ? 'border-industrial-cyan text-industrial-cyan' : 'border-transparent text-industrial-gray hover:text-white'
                  }`}
                >
                  <BookOpen size={12} />
                  <span>Habilitaciones SST</span>
                </button>
                <button
                  onClick={() => setDossierTab('historial')}
                  className={`pb-2 px-3 font-extrabold uppercase text-[10px] tracking-wider border-b-2 transition-all flex items-center space-x-1.5 ${
                    dossierTab === 'historial' ? 'border-industrial-cyan text-industrial-cyan' : 'border-transparent text-industrial-gray hover:text-white'
                  }`}
                >
                  <History size={12} />
                  <span>Historial Operativo</span>
                </button>
                <button
                  onClick={() => setDossierTab('disciplina')}
                  className={`pb-2 px-3 font-extrabold uppercase text-[10px] tracking-wider border-b-2 transition-all flex items-center space-x-1.5 ${
                    dossierTab === 'disciplina' ? 'border-industrial-cyan text-industrial-cyan' : 'border-transparent text-industrial-gray hover:text-white'
                  }`}
                >
                  <Scale size={12} />
                  <span>Ledger Disciplinario</span>
                </button>
              </div>

              {/* Dossier Contents wrap */}
              <div className="py-6 min-h-[220px]">
                
                {/* TAB 1: BASE DATA */}
                {dossierTab === 'base' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-semibold">
                      <div>
                        <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-0.5">Cédula Identidad</span>
                        <span className="text-white text-[11px] font-mono">{activeTech.cedula}</span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-0.5">Teléfono Movil</span>
                        <span className="text-white text-[11px] flex items-center space-x-1">
                          <Phone size={10} className="text-industrial-gray" />
                          <span>{activeTech.telefono}</span>
                        </span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-0.5">Grupo Sanguíneo</span>
                        <span className="text-industrial-red text-[11px] font-extrabold">{activeTech.tipoSangre}</span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-0.5">Fecha Ingreso</span>
                        <span className="text-white text-[11px] font-mono">{activeTech.fechaIngreso}</span>
                      </div>
                    </div>

                    <div className="border-t border-industrial-border/40 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 font-semibold">
                      <div>
                        <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-0.5">Licencia Conducir</span>
                        <span className="text-white text-[11px]">{activeTech.licencia}</span>
                        <span className="block text-[8px] text-industrial-gray font-mono">Vence: {activeTech.vigenciaLicencia}</span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-0.5">Camisa</span>
                        <span className="text-white text-[11px] font-bold bg-industrial-bg bg-opacity-40 px-2 py-0.5 border border-industrial-border rounded inline-block mt-0.5">{activeTech.tallaCamisa}</span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-0.5">Botas Dieléctricas</span>
                        <span className="text-white text-[11px] font-bold bg-industrial-bg bg-opacity-40 px-2 py-0.5 border border-industrial-border rounded inline-block mt-0.5">{activeTech.tallaBota} (Calzado)</span>
                      </div>
                    </div>

                    {/* Section 4: Current Gear Possession */}
                    <div className="border-t border-industrial-border/40 pt-4">
                      <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-3">Equipo en Posesión Activa (Vía Roster)</span>
                      {activeTech.brigadaId ? (
                        <div>
                          <div className="text-[10px] text-industrial-gray font-semibold mb-2">
                            Historial asignado de forma colectiva bajo la Brigada <span className="text-industrial-cyan font-bold">{activeTech.brigadaId}</span>:
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            {activeTechGear.map(item => (
                              <div key={item.itemCode} className="p-2 bg-industrial-bg bg-opacity-40 rounded border border-industrial-border flex items-center justify-between">
                                <div>
                                  <span className="text-white font-semibold text-[11px] block">{item.name}</span>
                                  <span className="text-[9px] text-industrial-gray font-mono">{item.itemCode}</span>
                                </div>
                                <span className={`px-1 rounded text-[8px] font-bold uppercase border ${
                                  item.estado === 'Entregado' ? 'bg-industrial-green/10 text-industrial-green border-industrial-green/20' :
                                  item.estado === 'Dañado' ? 'bg-industrial-red/10 text-industrial-red border-industrial-red/20' :
                                  'bg-industrial-yellow/10 text-industrial-yellow border-industrial-yellow/20'
                                }`}>
                                  {item.estado}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-industrial-bg bg-opacity-40 rounded border border-dashed border-industrial-border text-center text-xs text-industrial-gray font-semibold">
                          El técnico no se encuentra asignado a ninguna brigada activa. Sin EPP ni herramientas registradas en posesión.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 2: HABILITACIONES SST */}
                {dossierTab === 'certificaciones' && (
                  <div className="space-y-4 font-semibold">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-3 bg-industrial-bg bg-opacity-40 rounded border border-industrial-border space-y-2">
                        <span className="block text-[8px] text-industrial-cyan uppercase font-black tracking-widest">Habilitación de Tensión SIE</span>
                        <div className="flex justify-between items-center text-xs">
                          <span>Certificado Registro: <span className="font-mono text-white">{activeTech.sie}</span></span>
                          <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold uppercase border ${getSieBadge(activeTech.licenciaSie)}`}>
                            {activeTech.licenciaSie}
                          </span>
                        </div>
                        <p className="text-industrial-gray text-[9px] leading-relaxed">Avalado por la Superintendencia de Electricidad (SIE) para el tendido de media y alta tensión activa en líneas vivas.</p>
                      </div>

                      <div className="p-3 bg-industrial-bg bg-opacity-40 rounded border border-industrial-border space-y-2">
                        <span className="block text-[8px] text-industrial-cyan uppercase font-black tracking-widest">Capacitaciones SST Obligatorias</span>
                        <div className="space-y-1.5 text-[10px] text-white">
                          <div className="flex justify-between items-center">
                            <span>Curso Pértiga de Operación 23KV</span>
                            <span className="text-industrial-green font-bold flex items-center space-x-1">
                              <ShieldCheck size={10} />
                              <span>Aprobado</span>
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Rescate en Altura y Postes (TCT)</span>
                            <span className="text-industrial-green font-bold flex items-center space-x-1">
                              <ShieldCheck size={10} />
                              <span>Aprobado</span>
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Primeros Auxilios y RCP</span>
                            <span className="text-industrial-green font-bold flex items-center space-x-1">
                              <ShieldCheck size={10} />
                              <span>Aprobado</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-3.5 bg-industrial-bg bg-opacity-40 border border-industrial-border rounded-lg space-y-2">
                      <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest">Evaluación Aptitud Física Operativa</span>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[10px]">
                        <div>
                          <span className="text-industrial-gray block">Aptitud Altura:</span>
                          <span className="text-white font-bold">100% APTO (Clase A)</span>
                        </div>
                        <div>
                          <span className="text-industrial-gray block">Último Examen:</span>
                          <span className="text-white font-mono">2026-04-12</span>
                        </div>
                        <div>
                          <span className="text-industrial-gray block">Capacidad Reflejos:</span>
                          <span className="text-industrial-green font-bold">Excelente (98ms)</span>
                        </div>
                        <div>
                          <span className="text-industrial-gray block">Estatus Médico:</span>
                          <span className="text-industrial-green font-bold">CONFORME</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: OPERATIONAL TIMELINE HISTORY */}
                {dossierTab === 'historial' && (
                  <div className="space-y-3 max-h-64 overflow-y-auto scrollbar-thin">
                    <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Historial de Despachos y Actas de Entrega</span>
                    {activeTechActas.length === 0 ? (
                      <p className="text-[10px] text-industrial-gray italic p-4 text-center">No hay actas firmadas o pendientes a nombre de este colaborador.</p>
                    ) : (
                      activeTechActas.map((act) => (
                        <div key={act.id} className="p-2.5 bg-industrial-bg bg-opacity-50 border border-industrial-border rounded flex items-center justify-between hover:border-industrial-cyan/20 transition-all">
                          <div>
                            <span className="font-extrabold text-white text-[11px] block">{act.id} ({act.tipo})</span>
                            <span className="text-[9px] font-mono text-industrial-cyan">Fecha: {act.fecha} • Resp: @{act.responsable}</span>
                          </div>
                          <span className={`px-2 py-0.5 border rounded text-[8px] font-black uppercase tracking-widest ${
                            act.estado === 'Firmada' ? 'bg-industrial-green/10 border-industrial-green/30 text-industrial-green' : 'bg-industrial-yellow/10 border-industrial-yellow/30 text-industrial-yellow animate-pulse'
                          }`}>
                            {act.estado}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* TAB 4: DISCIPLINARY LEDGER */}
                {dossierTab === 'disciplina' && (
                  <div className="space-y-4 font-semibold">
                    <div className="p-3 bg-industrial-bg bg-opacity-40 border border-industrial-border rounded-lg space-y-2">
                      <span className="block text-[8px] text-industrial-cyan uppercase font-black tracking-widest">Registro de Reportes Operativos e Incidencias</span>
                      <div className="space-y-2 text-[10px]">
                        <div className="p-2 bg-industrial-bg rounded border border-industrial-border/60 flex justify-between items-start gap-2">
                          <div>
                            <span className="text-white font-bold block">Pérdida de herramienta reportada</span>
                            <span className="text-industrial-gray text-[9px] block">Motivo: Daño en poste de alta tensión. Repuesta.</span>
                          </div>
                          <span className="px-1.5 py-0.2 rounded text-[8px] font-bold bg-industrial-yellow/10 border border-industrial-yellow/30 text-industrial-yellow">Resuelto</span>
                        </div>

                        <div className="p-2 bg-industrial-bg rounded border border-industrial-border/60 flex justify-between items-start gap-2">
                          <div>
                            <span className="text-white font-bold block">Uso adecuado de EPP reglamentario</span>
                            <span className="text-industrial-gray text-[9px] block">Inspección de campo por William: Excelente apego a las normas SST.</span>
                          </div>
                          <span className="px-1.5 py-0.2 rounded text-[8px] font-bold bg-industrial-green/10 border border-industrial-green/30 text-industrial-green">Felicitación</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-industrial-bg bg-opacity-40 border border-industrial-border rounded-lg text-[10px]">
                      <span>Historial Disciplinario Acumulado:</span>
                      <span className="text-industrial-green font-bold flex items-center space-x-1">
                        <ShieldCheck size={12} />
                        <span>SIN AMONESTACIONES VIGENTES</span>
                      </span>
                    </div>
                  </div>
                )}

              </div>

            </div>

            {/* Bottom context block */}
            <div className="border-t border-industrial-border pt-4 mt-4 flex items-center justify-between text-[10px] text-industrial-gray font-semibold">
              <span>Coordinador Responsable: <span className="text-white">William (COORD-001)</span></span>
              <span>Supervisor a Cargo: <span className="text-white">
                {supervisores.find(s => s.id === activeTech.supervisorId)?.name || 'Sin Asignar'}
              </span></span>
            </div>

          </div>
        ) : (
          <div className="glass-panel rounded-lg p-12 text-center text-xs text-industrial-gray font-semibold min-h-[400px] flex flex-col justify-center items-center">
            Selecciona un colaborador de la lista para inspeccionar su expediente completo.
          </div>
        )}
      </div>

      {/* -------------------- DEACTIVATION WARNING MODAL -------------------- */}
      {confirmBajaTech && (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div 
            className="w-full max-w-md glass-panel rounded-lg p-6 border-neon-red"
            style={{ background: 'rgba(13, 21, 39, 0.95)' }}
          >
            <div className="flex items-center space-x-2 text-industrial-red border-b border-industrial-border pb-3 mb-4">
              <ShieldAlert size={20} />
              <h3 className="font-extrabold text-sm uppercase tracking-wider">CONFIRMACIÓN DE BAJA OPERATIVA</h3>
            </div>

            <div className="space-y-4 text-xs font-semibold">
              <p className="text-white leading-relaxed">
                ¿Está seguro de que desea dar de baja al colaborador <span className="text-industrial-red font-black">{confirmBajaTech.name}</span> ({confirmBajaTech.codigoEmpleado})?
              </p>

              {/* Dynamic compliance alert box */}
              <div className="p-3 bg-industrial-orange bg-opacity-10 border border-industrial-orange rounded flex items-start space-x-2">
                <Info size={16} className="text-industrial-orange flex-shrink-0 mt-0.5" />
                <p className="text-industrial-orange leading-relaxed text-[11px] font-bold">
                  “Esta acción no elimina el historial del colaborador.”
                </p>
              </div>

              <p className="text-industrial-gray leading-relaxed text-[10px]">
                El estado cambiará permanentemente a <span className="text-white font-bold">Desvinculado</span>. Su registro de roster se limpiará, pero su historial de entregas de EPP, reposiciones pasadas y logs de auditoría se preservarán en los registros históricos del ERP.
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

export default TecnicosPage;
