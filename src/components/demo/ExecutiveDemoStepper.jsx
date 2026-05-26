import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  Play, 
  ArrowRight, 
  CheckCircle2, 
  Sparkles, 
  UserPlus, 
  ShieldAlert, 
  FileText, 
  ShieldCheck, 
  TrendingUp, 
  CheckCircle,
  X,
  Zap,
  Film,
  Activity,
  Server
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const DEMO_STEPS = [
  {
    step: 1,
    title: "1. Telemetría en Lote 4",
    page: "dashboard",
    icon: Sparkles,
    description: "Inspecciona el Dashboard centralizado del Lote 4. Aquí se monitorean las brigadas activas, técnicos y el inventario crítico de almacén en tiempo real.",
    actionText: "Ir al Dashboard",
    spotlight: { top: '80px', left: '16px', width: '220px', height: '140px', label: "Centro de Telemetría: Analizando KPIs globales de despacho." }
  },
  {
    step: 2,
    title: "2. Registrar Técnico",
    page: "personal",
    icon: UserPlus,
    description: "Inicia el registro de un nuevo colaborador técnico dominicano con cédula y habilitación SIE para operaciones críticas en líneas energizadas.",
    actionText: "Abrir Registro",
    spotlight: { top: '80px', right: '16px', width: '250px', height: '60px', label: "Drawer de Roster: Iniciando expediente de nuevo técnico." }
  },
  {
    step: 3,
    title: "3. Cargar EPP Automático",
    page: "personal",
    icon: ShieldAlert,
    description: "Carga el kit estándar sugerido de TCT (Casco, Guantes, Pértiga, etc.) y evalúa los semáforos de disponibilidad física del Almacén Central.",
    actionText: "Cargar Kit TCT",
    spotlight: { top: '300px', left: '260px', width: '480px', height: '220px', label: "Asignación Kárdex: Cruzando stocks físicos contra recomendación SST." }
  },
  {
    step: 4,
    title: "4. Generar Acta de Entrega",
    page: "actas",
    icon: FileText,
    description: "Procesa el registro del colaborador en SQLite. Esto genera de manera instantánea el Acta oficial de entrega de herramientas en estado Pendiente.",
    actionText: "Generar Acta",
    spotlight: { top: '150px', left: '240px', width: '600px', height: '120px', label: "Protocolo de Entrega: Acta ACT-2026 en estado pendiente registrada." }
  },
  {
    step: 5,
    title: "5. Sellar y Firmar Digital",
    page: "actas",
    icon: ShieldCheck,
    description: "Abre el acta, simula una firma digital manuscrita en los pads y sella el documento de forma irreversible aplicando código digital SHA-256.",
    actionText: "Firmar Digitalmente",
    spotlight: { top: '320px', left: '280px', width: '560px', height: '260px', label: "Sello Criptográfico: Aplicando hashes PBKDF2 y firma manuscrita." }
  },
  {
    step: 6,
    title: "6. Auditoría Criptográfica",
    page: "auditoria",
    icon: ShieldAlert,
    description: "Inspecciona el registro histórico inmutable de auditoría. Cada modificación genera una huella persistente con visor de diferencias JSON (Diff).",
    actionText: "Ver Auditoría",
    spotlight: { top: '200px', left: '280px', width: '560px', height: '260px', label: "Huella Digital: JSON Diff de control interno validado." }
  }
];

const ExecutiveDemoStepper = ({ activePage, setActivePage, onClose, onTriggerDemoAction }) => {
  const { currentRole } = useApp();
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [autoplayActive, setAutoplayActive] = useState(false);
  const currentStep = DEMO_STEPS[currentStepIdx];
  const Icon = currentStep.icon;

  // Auto transition page on step change
  useEffect(() => {
    // If the step restricts page, redirect
    if (currentStep.page === 'auditoria' && currentRole !== 'Developer') {
      // Skip auditoria if not developer or show message
    } else {
      setActivePage(currentStep.page);
    }
  }, [currentStepIdx, currentRole, setActivePage]);

  // Autoplay loop timer
  useEffect(() => {
    if (!autoplayActive) return;

    // Trigger action for current step
    onTriggerDemoAction(currentStep.step);

    const timer = setTimeout(() => {
      if (currentStepIdx < DEMO_STEPS.length - 1) {
        setCurrentStepIdx(prev => prev + 1);
      } else {
        // Complete Autoplay
        setAutoplayActive(false);
        setActivePage('dashboard');
        alert('🎉 ¡Tour Cinematográfico Autoplay Completado! La simulación del flujo de GridOps Enterprise v2 ha finalizado con éxito.');
      }
    }, 5500); // 5.5 seconds per step highlight

    return () => clearTimeout(timer);
  }, [autoplayActive, currentStepIdx, onTriggerDemoAction, setActivePage]);

  const handleNext = () => {
    if (currentStepIdx < DEMO_STEPS.length - 1) {
      setCurrentStepIdx(currentStepIdx + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStepIdx > 0) {
      setCurrentStepIdx(currentStepIdx - 1);
    }
  };

  const executeAction = async () => {
    onTriggerDemoAction(currentStep.step);
  };

  const triggerAutoplay = () => {
    setCurrentStepIdx(0);
    setAutoplayActive(true);
  };

  return (
    <>
      {/* -------------------- CINEMATIC SPOTLIGHT OVERLAY -------------------- */}
      <AnimatePresence>
        {autoplayActive && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-45 bg-black/80 pointer-events-none flex items-center justify-center select-none"
          >
            {/* Spotlight Hole indicator ring */}
            {currentStep.spotlight && (
              <div 
                className="absolute border-2 border-industrial-cyan rounded-lg shadow-[0_0_30px_rgba(0,240,255,0.4)] transition-all duration-1000 bg-industrial-cyan bg-opacity-5 animate-pulse"
                style={{
                  top: currentStep.spotlight.top || 'auto',
                  left: currentStep.spotlight.left || 'auto',
                  right: currentStep.spotlight.right || 'auto',
                  width: currentStep.spotlight.width,
                  height: currentStep.spotlight.height
                }}
              >
                {/* Floating cyberpunk spotlight tooltip tag */}
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-industrial-panel border border-industrial-cyan text-industrial-cyan text-[8px] font-mono tracking-widest px-2.5 py-1 rounded shadow-cyan-glow uppercase leading-none font-bold">
                  {currentStep.spotlight.label}
                </div>
              </div>
            )}

            {/* Central Holographic Dialog Info Panel */}
            <div 
              className="bg-industrial-panel border-2 border-purple-500/40 p-6 rounded-lg text-center max-w-sm text-xs font-semibold space-y-3 shadow-[0_0_35px_rgba(168,85,247,0.2)]"
              style={{ background: 'rgba(13, 21, 39, 0.96)', backdropFilter: 'blur(8px)' }}
            >
              <div className="flex justify-center items-center space-x-1.5 text-purple-400">
                <Film className="animate-spin text-purple-400" size={16} />
                <span className="font-extrabold uppercase tracking-widest text-[9px]">Autoplay Cinematográfico Activo</span>
              </div>
              <div className="flex justify-center my-2 text-industrial-cyan animate-pulse">
                <Icon size={24} />
              </div>
              <h4 className="text-white text-xs uppercase tracking-wider">{currentStep.title}</h4>
              <p className="text-industrial-gray leading-relaxed text-[11px]">
                {currentStep.description}
              </p>
              <div className="pt-2 flex justify-between items-center text-[9px] text-industrial-gray font-mono border-t border-industrial-border/60">
                <span>Paso {currentStepIdx + 1} de {DEMO_STEPS.length}</span>
                <span className="text-industrial-cyan animate-pulse">Autoejecutando...</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* -------------------- STEPPER CONTROL PANEL -------------------- */}
      <div 
        className="fixed bottom-6 right-6 z-50 w-96 glass-panel rounded-lg p-5 border-neon-cyan shadow-panel-glow text-xs text-white"
        style={{ background: 'rgba(13, 21, 39, 0.97)', backdropFilter: 'blur(12px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-industrial-border pb-2.5 mb-3">
          <div className="flex items-center space-x-1.5">
            <Zap size={14} className="text-industrial-cyan animate-pulse" />
            <span className="font-extrabold uppercase tracking-widest text-[10px] text-industrial-cyan">Modo Demo Ejecutiva</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded hover:bg-industrial-border text-industrial-gray hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Progress indicators */}
        <div className="flex justify-between items-center mb-3">
          {DEMO_STEPS.map((s, idx) => (
            <div key={s.step} className="flex items-center flex-grow">
              <div 
                className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] border transition-all ${
                  idx === currentStepIdx 
                    ? 'bg-industrial-cyan border-industrial-cyan text-industrial-bg scale-110 shadow-cyan-glow'
                    : idx < currentStepIdx
                    ? 'bg-industrial-green/20 border-industrial-green text-industrial-green'
                    : 'bg-industrial-bg border-industrial-border text-industrial-gray'
                }`}
                title={s.title}
              >
                {idx < currentStepIdx ? <CheckCircle2 size={10} /> : s.step}
              </div>
              {idx < DEMO_STEPS.length - 1 && (
                <div className={`h-[1px] flex-grow mx-1 ${idx < currentStepIdx ? 'bg-industrial-green' : 'bg-industrial-border'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Card Content */}
        <div className="bg-industrial-bg bg-opacity-50 border border-industrial-border rounded p-3 mb-4 space-y-2">
          <div className="flex items-center space-x-2 text-white font-bold">
            <div className="p-1 rounded bg-industrial-cyan bg-opacity-10 text-industrial-cyan">
              <Icon size={16} />
            </div>
            <h4 className="text-xs uppercase tracking-wide">{currentStep.title}</h4>
          </div>
          <p className="text-industrial-gray font-medium text-[11px] leading-relaxed">
            {currentStep.description}
          </p>

          {currentStep.step === 6 && currentRole !== 'Developer' && (
            <div className="p-2 bg-industrial-orange bg-opacity-10 border border-industrial-orange/30 rounded text-[10px] text-industrial-orange font-bold animate-pulse">
              ⚠️ Nota: Para ver la Auditoría, debes simular el rol "Developer" en la barra superior.
            </div>
          )}
        </div>

        {/* Action triggers */}
        <div className="flex flex-col space-y-2">
          <div className="flex space-x-2">
            <button
              onClick={executeAction}
              className="w-1/2 py-2 rounded bg-gradient-to-r from-industrial-cyan to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-industrial-bg font-extrabold text-[10px] uppercase tracking-wider flex items-center justify-center space-x-1.5 transition-all shadow-cyan-glow"
            >
              <Play size={10} />
              <span>{currentStep.actionText}</span>
            </button>

            <div className="w-1/2 flex space-x-1.5">
              {currentStepIdx > 0 && (
                <button
                  onClick={handlePrev}
                  className="w-1/2 py-2 rounded bg-industrial-border hover:bg-opacity-60 text-white font-extrabold text-[9px] uppercase tracking-wider animate-fade-in"
                >
                  Atrás
                </button>
              )}
              <button
                onClick={handleNext}
                className={`py-2 rounded bg-industrial-cyan text-industrial-bg hover:bg-cyan-400 font-extrabold text-[9px] uppercase tracking-wider ${
                  currentStepIdx > 0 ? 'w-1/2' : 'w-full'
                } flex items-center justify-center space-x-1`}
              >
                <span>{currentStepIdx === DEMO_STEPS.length - 1 ? 'Terminar' : 'Siguiente'}</span>
                <ArrowRight size={10} />
              </button>
            </div>
          </div>

          {/* Autoplay tour button */}
          <button
            onClick={triggerAutoplay}
            className="w-full py-2.5 rounded bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 text-white font-extrabold text-[9px] uppercase tracking-widest flex items-center justify-center space-x-1.5 transition-all shadow-[0_0_15px_rgba(168,85,247,0.3)] animate-pulse"
          >
            <Film size={11} />
            <span>Tour Cinematográfico Autoplay</span>
          </button>
        </div>

      </div>
    </>
  );
};

export default ExecutiveDemoStepper;
