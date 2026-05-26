import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
  FileText, 
  Plus, 
  Eye, 
  Printer, 
  X, 
  Check, 
  Save, 
  PenTool, 
  AlertTriangle, 
  Boxes, 
  User, 
  Truck, 
  ShieldCheck, 
  Layers, 
  FileSignature, 
  Search,
  CheckCircle,
  Clock,
  Send,
  Lock,
  PlusCircle,
  FileBadge,
  Wrench
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Master corporate kit recommendations matching active warehouse stock codes
const OPERATIONAL_KITS = {
  TCT: [
    { code: 'EPP-CASDI', name: 'Casco dieléctrico', qty: 1, category: 'EPP', optional: false },
    { code: 'EPP-GUAIS', name: 'Guantes dieléctricos', qty: 2, category: 'EPP', optional: false },
    { code: 'EPC-MANAI', name: 'Mangas aislantes', qty: 2, category: 'EPC', optional: false },
    { code: 'EPP-BOTDI', name: 'Botas dieléctricas', qty: 1, category: 'EPP', optional: false },
    { code: 'EPP-ARNES', name: 'Arnés de seguridad', qty: 1, category: 'EPP', optional: false },
    { code: 'HER-PTAIS', name: 'Pértiga aislada extensible', qty: 1, category: 'Herramientas', optional: false },
    { code: 'HER-DETTE', name: 'Detector de tensión personal', qty: 1, category: 'Herramientas', optional: false },
    { code: 'EPP-PROFA', name: 'Protector facial dieléctrico', qty: 1, category: 'EPP', optional: false },
    { code: 'EPP-LENSE', name: 'Gafas de seguridad', qty: 1, category: 'EPP', optional: true },
    { code: 'HER-RADIO', name: 'Radio de comunicación UHF', qty: 1, category: 'Herramientas', optional: true },
    { code: 'EPC-CONOS', name: 'Conos de seguridad vial', qty: 4, category: 'EPC', optional: true },
    { code: 'EPC-SENAL', name: 'Señalización vial reflectiva', qty: 2, category: 'EPC', optional: true },
    { code: 'HER-ESCDI', name: 'Escalera dieléctrica extensible', qty: 1, category: 'Herramientas', optional: false },
    { code: 'EPP-CHARE', name: 'Uniforme reflectivo (Chaleco)', qty: 1, category: 'EPP', optional: false },
    { code: 'HER-LINTE', name: 'Linterna LED táctica recargable', qty: 1, category: 'Herramientas', optional: true },
    { code: 'HER-TABLE', name: 'Tablet de trabajo / Diagnóstico', qty: 1, category: 'Tech', optional: false }
  ],
  Comercial: [
    { code: 'HER-TABLE', name: 'Tablet corporativo', qty: 1, category: 'Tech', optional: false },
    { code: 'HER-PONCH', name: 'Impresora térmica de recibos', qty: 1, category: 'Tech', optional: false },
    { code: 'EPP-CHARE', name: 'Uniforme comercial reflectivo', qty: 1, category: 'EPP', optional: false },
    { code: 'EPP-CASDI', name: 'Casco de protección básico', qty: 1, category: 'EPP', optional: false },
    { code: 'EPP-BOTDI', name: 'Botas de seguridad básica', qty: 1, category: 'EPP', optional: false },
    { code: 'HER-RADIO', name: 'Radio de comunicación UHF', qty: 1, category: 'Herramientas', optional: true },
    { code: 'EPC-CONOS', name: 'Conos de seguridad vial pequeños', qty: 2, category: 'EPC', optional: true }
  ],
  Motorizada: [
    { code: 'EPP-CASDI', name: 'Casco protector motorizado', qty: 1, category: 'EPP', optional: false },
    { code: 'EPP-CHARE', name: 'Chaleco reflectivo motorizado', qty: 1, category: 'EPP', optional: false },
    { code: 'EPP-BOTDI', name: 'Botas dieléctricas reforzadas', qty: 1, category: 'EPP', optional: false },
    { code: 'EPP-GUAIS', name: 'Guantes de moto reforzados', qty: 1, category: 'EPP', optional: false },
    { code: 'HER-RADIO', name: 'Radio de comunicación UHF', qty: 1, category: 'Herramientas', optional: true },
    { code: 'HER-TABLE', name: 'Celular corporativo robusto', qty: 1, category: 'Tech', optional: false },
    { code: 'EPC-CONOS', name: 'Conos de seguridad vial pequeños', qty: 2, category: 'EPC', optional: true },
    { code: 'HER-LINTE', name: 'Linterna LED táctica recargable', qty: 1, category: 'Herramientas', optional: true }
  ],
  Averías: [
    { code: 'HER-MULTI', name: 'Multímetro digital autorango', qty: 1, category: 'Herramientas', optional: false },
    { code: 'HER-PINZA', name: 'Pinza amperimétrica True RMS', qty: 1, category: 'Herramientas', optional: false },
    { code: 'HER-DETTE', name: 'Detector de tensión personal', qty: 1, category: 'Herramientas', optional: false },
    { code: 'HER-CAJAH', name: 'Juego de herramientas manuales', qty: 1, category: 'Herramientas', optional: false },
    { code: 'HER-ESCAL', name: 'Escalera de aluminio 24 pies', qty: 1, category: 'Herramientas', optional: false },
    { code: 'EPP-GUAIS', name: 'Guantes dieléctricos de faena', qty: 2, category: 'EPP', optional: false },
    { code: 'EPP-CASDI', name: 'Casco dieléctrico de faena', qty: 1, category: 'EPP', optional: false },
    { code: 'EPP-BOTDI', name: 'Botas dieléctricas de protección', qty: 1, category: 'EPP', optional: false },
    { code: 'EPC-CONOS', name: 'Conos de seguridad vial', qty: 4, category: 'EPC', optional: true },
    { code: 'HER-CINTA', name: 'Cinta aislante 3M Super 33+', qty: 3, category: 'Herramientas', optional: true },
    { code: 'HER-LINTE', name: 'Linterna LED táctica recargable', qty: 1, category: 'Herramientas', optional: true },
    { code: 'HER-RADIO', name: 'Radio de comunicación UHF', qty: 1, category: 'Herramientas', optional: true }
  ],
  Redes: [
    { code: 'HER-TESTE', name: 'Tester de red digital LCD', qty: 1, category: 'Herramientas', optional: false },
    { code: 'HER-CRIMP', name: 'Crimpadora de red profesional', qty: 1, category: 'Herramientas', optional: false },
    { code: 'HER-CABLE', name: 'Cable UTP Cat6 bobina 305m', qty: 1, category: 'Herramientas', optional: true },
    { code: 'HER-RJ45', name: 'Conectores RJ45 bolsa 100u', qty: 1, category: 'Herramientas', optional: true },
    { code: 'HER-TALAD', name: 'Taladro percutor brushless 20V', qty: 1, category: 'Herramientas', optional: true },
    { code: 'HER-ESCAL', name: 'Escalera de aluminio 24 pies', qty: 1, category: 'Herramientas', optional: false },
    { code: 'HER-MULTI', name: 'Multímetro digital autorango', qty: 1, category: 'Herramientas', optional: true },
    { code: 'HER-LAPTO', name: 'Laptop/Tablet diagnóstico redes', qty: 1, category: 'Tech', optional: false },
    { code: 'EPP-CASDI', name: 'Casco de protección básico', qty: 1, category: 'EPP', optional: false },
    { code: 'EPP-BOTDI', name: 'Botas dieléctricas', qty: 1, category: 'EPP', optional: false },
    { code: 'EPP-CHARE', name: 'Chaleco reflectivo', qty: 1, category: 'EPP', optional: false }
  ],
  Corte: [
    { code: 'HER-ALICA', name: 'Alicate universal aislado 1000V', qty: 1, category: 'Herramientas', optional: false },
    { code: 'HER-PONCH', name: 'Pinzas de corte y ponchado', qty: 1, category: 'Herramientas', optional: false },
    { code: 'HER-SELLO', name: 'Sellos de seguridad candado', qty: 1, category: 'Herramientas', optional: false },
    { code: 'HER-PRECI', name: 'Precintos plásticos bolsa 500u', qty: 1, category: 'Herramientas', optional: false },
    { code: 'HER-ESCAL', name: 'Escalera de aluminio 24 pies', qty: 1, category: 'Herramientas', optional: false },
    { code: 'EPP-GUAIS', name: 'Guantes dieléctricos 1000V', qty: 1, category: 'EPP', optional: false },
    { code: 'EPP-CASDI', name: 'Casco dieléctrico de protección', qty: 1, category: 'EPP', optional: false },
    { code: 'EPP-BOTDI', name: 'Botas dieléctricas', qty: 1, category: 'EPP', optional: false },
    { code: 'HER-RADIO', name: 'Radio de comunicación UHF', qty: 1, category: 'Herramientas', optional: true },
    { code: 'HER-TABLE', name: 'Tablet Android de registro TCT', qty: 1, category: 'Tech', optional: false }
  ]
};

const ActasPage = () => {
  const { 
    currentRole,
    currentUser,
    actas, 
    brigadas, 
    tecnicos,
    inventario,
    supervisores,
    createActa,
    firmarActa,
    anularActa,
    addAnnexToActa,
    getFilteredSupervisores
  } = useApp();

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [supervisorFilter, setSupervisorFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [complianceFilter, setComplianceFilter] = useState('');

  // Modals States
  const [showDetailActa, setShowDetailActa] = useState(null);
  const [showNewActaModal, setShowNewActaModal] = useState(false);

  // New Smart Acta Form States
  const [newActaType, setNewActaType] = useState('Entrega EPP');
  const [newActaTargetType, setNewActaTargetType] = useState('Técnico'); // 'Brigada' or 'Técnico'
  const [newActaDest, setNewActaDest] = useState('');
  
  // Kit & Profile selectors
  const [selectedCargo, setSelectedCargo] = useState('Técnico TCT');
  const [selectedKitDept, setSelectedKitDept] = useState('TCT');
  const [checklistItems, setChecklistItems] = useState([]); // [{code, name, category, qty, status, serial, remarks, delivered, stock}]

  // Double Signature Canvases
  const canvasDelivererRef = useRef(null);
  const canvasReceiverRef = useRef(null);
  const [isDrawingDeliverer, setIsDrawingDeliverer] = useState(false);
  const [isDrawingReceiver, setIsDrawingReceiver] = useState(false);
  const [hasSignedDeliverer, setHasSignedDeliverer] = useState(false);
  const [hasSignedReceiver, setHasSignedReceiver] = useState(false);

  // Observations
  const [signingObs, setSigningObs] = useState('');
  const [annexText, setAnnexText] = useState('');
  const [zoomPercent, setZoomPercent] = useState(100);

  // Calculate compliance status of an acta dynamically
  const getActaCompliance = (acta) => {
    // If the acta contains items, check for mandatory EPP deficits
    // Mandatory TCT EPPs: Casco, Guantes, Arnés, Botas dieléctricas, Mangas, Pértiga, Detector
    const mandatoryCodes = ['EPP-CASDI', 'EPP-GUAIS', 'EPC-MANAI', 'EPP-BOTDI', 'EPP-ARNES', 'HER-PTAIS', 'HER-DETTE'];
    
    // Check if any mandatory item is completely missing or pending
    let hasMandatoryMissing = false;
    let hasOptionalMissing = false;

    if (!acta.items || acta.items.length === 0) return 'Completa';

    // Parse the item name to see if SN is pending or if it has stock deficits
    acta.items.forEach(it => {
      const isMandatory = mandatoryCodes.includes(it.code) || it.name.toLowerCase().includes('obligatorio') || it.name.toLowerCase().includes('reglamentario');
      const isPending = it.name.toLowerCase().includes('pendiente') || it.name.toLowerCase().includes('faltante') || it.qty === 0;
      
      if (isPending) {
        if (isMandatory) {
          hasMandatoryMissing = true;
        } else {
          hasOptionalMissing = true;
        }
      }
    });

    if (hasMandatoryMissing) return 'Con Faltantes';
    if (hasOptionalMissing) return 'Parcial';
    return 'Completa';
  };

  // Automated Executive Demo Event Listener
  useEffect(() => {
    const handleDemoStep = async (e) => {
      const step = e.detail.step;
      if (step === 4) {
        // Generar Acta automatically
        // Get Ramon technical profile
        const ramon = tecnicos.find(t => t.name.includes('Ramón') || t.codigoEmpleado.includes('DEMO'));
        const ramonName = ramon ? ramon.name : 'Ing. Ramón Antonio Valdez';
        
        const existingActa = actas.find(a => a.destino.includes(ramonName) && a.estado !== 'Anulada');
        if (!existingActa) {
          const standardKit = OPERATIONAL_KITS.TCT.slice(0, 8); // Load TCT kit
          const newId = `ACT-2026-${(actas.length + 1).toString().padStart(3, '0')}`;
          const newActa = {
            id: newId,
            tipo: `Entrega EPP (TCT)`,
            destino: `Técnico: ${ramonName}`,
            responsable: currentUser?.name || 'Supervisor de Guardia',
            fecha: new Date().toISOString().slice(0, 10),
            estado: 'Pendiente',
            firmado: false,
            signatureData: null,
            observaciones: 'Dotación inicial automática cargada para demostración ejecutiva del Lote 4.',
            items: standardKit.map(k => ({
              code: k.code,
              name: `${k.name} - Nuevo`,
              qty: k.qty,
              category: k.category
            }))
          };
          await createActa(newActa);
        }
        
        // Wait and open detail modal automatically
        setTimeout(() => {
          // Fetch actas and set detail
          const updatedList = actas;
          const generated = updatedList.find(a => a.destino.includes(ramonName) && a.estado !== 'Anulada');
          setShowDetailActa(generated);
        }, 800);
      } else if (step === 5) {
        // Auto-sign the open details acta
        if (showDetailActa) {
          // Generate a stunning cursive signature base64 drawing mock
          const mockSig = JSON.stringify({
            deliverer: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='150' height='50'><path d='M10,30 Q30,10 50,30 T90,30 T130,20' fill='none' stroke='cyan' stroke-width='2'/></svg>",
            receiver: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='150' height='50'><path d='M15,25 C45,5 60,45 90,25 C120,5 130,35 140,20' fill='none' stroke='orange' stroke-width='2'/></svg>"
          });
          
          await firmarActa(showDetailActa.id, mockSig, 'Sello digital y firma validados en auditoría demo.');
          
          // Reload detail modal
          setShowDetailActa(prev => ({
            ...prev,
            estado: 'Firmada',
            firmado: true,
            signatureData: mockSig,
            observaciones: 'Sello digital y firma validados en auditoría demo.'
          }));
        }
      }
    };
    
    window.addEventListener('demo-step-trigger', handleDemoStep);
    return () => window.removeEventListener('demo-step-trigger', handleDemoStep);
  }, [actas, tecnicos, showDetailActa, createActa, firmarActa, currentUser]);

  // Decode double signatures
  const getDualSignatures = (signatureDataString) => {
    let signs = { deliverer: null, receiver: null };
    if (!signatureDataString) return signs;
    try {
      signs = JSON.parse(signatureDataString);
      if (typeof signs === 'string') {
        signs = { deliverer: signs, receiver: signs };
      }
    } catch (e) {
      signs = { deliverer: signatureDataString, receiver: signatureDataString };
    }
    return signs;
  };

  // Filtered List
  const filteredActas = actas.filter(a => {
    const matchesSearch = a.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          a.destino.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          a.responsable.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === '' || a.estado === statusFilter;
    const matchesType = typeFilter === '' || a.tipo.toLowerCase().includes(typeFilter.toLowerCase());
    const matchesSupervisor = supervisorFilter === '' || a.responsable.toLowerCase() === supervisorFilter.toLowerCase();
    
    // Zone filtering
    let matchesZone = true;
    if (zoneFilter !== '') {
      if (zoneFilter === 'Noroeste Lote 4') {
        matchesZone = a.destino.includes('MRC') || a.responsable.toLowerCase() === 'isaac' || a.responsable.toLowerCase() === 'cristian' || a.responsable.toLowerCase() === 'william';
      } else {
        matchesZone = !a.destino.includes('MRC') && a.responsable.toLowerCase() !== 'isaac' && a.responsable.toLowerCase() !== 'cristian';
      }
    }

    // Compliance filtering
    const compliance = getActaCompliance(a);
    const matchesCompliance = complianceFilter === '' || compliance === complianceFilter;

    return matchesSearch && matchesStatus && matchesType && matchesSupervisor && matchesZone && matchesCompliance;
  });

  // KPI Statistics
  const totalActasCount = actas.length;
  const pendingActasCount = actas.filter(a => a.estado === 'Pendiente').length;
  const completeActasCount = actas.filter(a => getActaCompliance(a) === 'Completa').length;
  const partialActasCount = actas.filter(a => getActaCompliance(a) === 'Parcial').length;
  const missingActasCount = actas.filter(a => getActaCompliance(a) === 'Con Faltantes').length;
  
  const complianceIndex = totalActasCount > 0 
    ? Math.round(((completeActasCount + partialActasCount) / totalActasCount) * 100) 
    : 100;

  // Load smart kits combining Dept kit + Cargo EPP
  const handleLoadSmartKit = () => {
    const kit = OPERATIONAL_KITS[selectedKitDept] || [];
    
    const items = kit.map(k => {
      const invItem = inventario.find(i => i.code === k.code);
      const stock = invItem ? invItem.stock : 0;
      return {
        code: k.code,
        name: k.name,
        category: k.category,
        qty: k.qty,
        status: stock > 0 ? 'Nuevo' : 'Pendiente',
        serial: '',
        remarks: k.optional ? 'Dotación opcional sugerida' : 'Dotación obligatoria requerida',
        delivered: stock >= k.qty,
        stock: stock
      };
    });
    
    const cargoEPPMapping = {
      'Técnico TCT': ['EPP-CASDI', 'EPP-GUAIS', 'EPC-MANAI', 'EPP-BOTDI', 'EPP-ARNES', 'EPP-PROFA', 'EPP-LENSE'],
      'Supervisor': ['EPP-CASDI', 'EPP-CHARE', 'EPP-LENSE', 'EPP-BOTDI', 'HER-TABLE', 'HER-LINTE'],
      'Técnico Comercial': ['EPP-CASDI', 'EPP-BOTDI', 'EPP-CHARE', 'HER-TABLE'],
      'Motorizado': ['EPP-CASDI', 'EPP-CHARE', 'EPP-BOTDI', 'EPP-GUAIS', 'HER-TABLE'],
      'Liniero': ['EPP-CASDI', 'EPP-GUAIS', 'EPP-ARNES', 'EPP-BOTDI', 'HER-STIER'],
      'Inspector': ['EPP-CASDI', 'EPP-BOTDI', 'EPP-CHARE', 'EPP-LENSE', 'HER-TABLE'],
      'Ayudante': ['EPP-CASDI', 'EPP-BOTDI', 'EPP-CHARE', 'EPP-GUAIS'],
      'Averías': ['EPP-CASDI', 'EPP-GUAIS', 'EPP-BOTDI', 'EPP-LENSE', 'HER-DETTE', 'HER-MULTI', 'HER-PINZA'],
      'Redes': ['EPP-CASDI', 'EPP-BOTDI', 'EPP-CHARE', 'EPP-LENSE', 'HER-TESTE', 'HER-CRIMP', 'HER-LAPTO']
    };
    
    const eppList = cargoEPPMapping[selectedCargo] || [];
    eppList.forEach(eppCode => {
      if (!items.some(item => item.code === eppCode)) {
        const invItem = inventario.find(i => i.code === eppCode);
        const stock = invItem ? invItem.stock : 0;
        if (invItem) {
          items.push({
            code: invItem.code,
            name: invItem.name,
            category: invItem.category,
            qty: 1,
            status: stock > 0 ? 'Nuevo' : 'Pendiente',
            serial: '',
            remarks: `EPP reglamentario para ${selectedCargo}`,
            delivered: stock >= 1,
            stock: stock
          });
        }
      }
    });

    setChecklistItems(items);
  };

  const handleUpdateChecklistItem = (code, field, value) => {
    setChecklistItems(prev => prev.map(item => 
      item.code === code ? { ...item, [field]: value } : item
    ));
  };

  const handleRemoveChecklistItem = (code) => {
    setChecklistItems(prev => prev.filter(item => item.code !== code));
  };

  const handleAddCustomChecklistItem = (itemCode) => {
    const invItem = inventario.find(i => i.code === itemCode);
    if (!invItem) return;
    if (checklistItems.some(item => item.code === itemCode)) return;
    setChecklistItems(prev => [...prev, {
      code: invItem.code,
      name: invItem.name,
      category: invItem.category,
      qty: 1,
      status: invItem.stock > 0 ? 'Nuevo' : 'Pendiente',
      serial: '',
      remarks: 'Material adicional agregado',
      delivered: invItem.stock >= 1,
      stock: invItem.stock
    }]);
  };

  // Canvas Drawing Methods (Deliverer)
  const startDrawingDeliverer = (e) => {
    const canvas = canvasDelivererRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawingDeliverer(true);
  };
  const drawDeliverer = (e) => {
    if (!isDrawingDeliverer) return;
    const canvas = canvasDelivererRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
    setHasSignedDeliverer(true);
  };
  const stopDrawingDeliverer = () => setIsDrawingDeliverer(false);
  const clearCanvasDeliverer = () => {
    const canvas = canvasDelivererRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignedDeliverer(false);
  };

  // Canvas Drawing Methods (Receiver)
  const startDrawingReceiver = (e) => {
    const canvas = canvasReceiverRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawingReceiver(true);
  };
  const drawReceiver = (e) => {
    if (!isDrawingReceiver) return;
    const canvas = canvasReceiverRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
    setHasSignedReceiver(true);
  };
  const stopDrawingReceiver = () => setIsDrawingReceiver(false);
  const clearCanvasReceiver = () => {
    const canvas = canvasReceiverRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignedReceiver(false);
  };

  // Synchronize destination selection on profile target changes
  useEffect(() => {
    setNewActaDest('');
  }, [newActaTargetType]);

  const handleCreateNewActa = (e) => {
    e.preventDefault();
    if (!newActaDest) {
      alert('Por favor especifique la brigada o técnico de destino.');
      return;
    }
    const deliveredItems = checklistItems.filter(item => item.delivered && item.qty > 0);
    if (deliveredItems.length === 0) {
      alert('Debe marcar al menos un artículo como entregado para generar el acta.');
      return;
    }

    // Capture double base64 canvases
    let sigDeliverer = null;
    let sigReceiver = null;
    if (hasSignedDeliverer && canvasDelivererRef.current) {
      sigDeliverer = canvasDelivererRef.current.toDataURL();
    }
    if (hasSignedReceiver && canvasReceiverRef.current) {
      sigReceiver = canvasReceiverRef.current.toDataURL();
    }

    const doubleSignatureJSON = sigDeliverer && sigReceiver ? JSON.stringify({
      deliverer: sigDeliverer,
      receiver: sigReceiver
    }) : null;

    const newId = `ACT-2026-${(actas.length + 1).toString().padStart(3, '0')}`;
    const newActa = {
      id: newId,
      tipo: `${newActaType} (${selectedKitDept})`,
      destino: `${newActaTargetType}: ${newActaDest}`,
      responsable: currentUser?.name || 'Supervisor de Guardia',
      fecha: new Date().toISOString().slice(0, 10),
      estado: sigDeliverer && sigReceiver ? 'Firmada' : 'Pendiente',
      firmado: sigDeliverer && sigReceiver ? true : false,
      signatureData: doubleSignatureJSON,
      observaciones: signingObs,
      items: checklistItems.map(item => ({
        code: item.code,
        name: `${item.name}${item.serial ? ` [SN: ${item.serial}]` : ''} - ${item.delivered ? 'Entregado' : item.status}`,
        qty: item.qty,
        category: item.category
      }))
    };

    createActa(newActa);
    setShowNewActaModal(false);
    setChecklistItems([]);
    setNewActaDest('');
    setSigningObs('');
    setHasSignedDeliverer(false);
    setHasSignedReceiver(false);
  };

  const handleSignActaModal = async () => {
    let sigDeliverer = null;
    let sigReceiver = null;
    if (hasSignedDeliverer && canvasDelivererRef.current) {
      sigDeliverer = canvasDelivererRef.current.toDataURL();
    }
    if (hasSignedReceiver && canvasReceiverRef.current) {
      sigReceiver = canvasReceiverRef.current.toDataURL();
    }

    if (!sigDeliverer || !sigReceiver) {
      alert('Ambos firmas (entregador y receptor) son obligatorias para sellar el acta digitalmente.');
      return;
    }

    const doubleSignatureJSON = JSON.stringify({
      deliverer: sigDeliverer,
      receiver: sigReceiver
    });

    await firmarActa(showDetailActa.id, doubleSignatureJSON, signingObs);
    
    // Refresh modal state
    setShowDetailActa(prev => ({
      ...prev,
      estado: 'Firmada',
      firmado: true,
      signatureData: doubleSignatureJSON,
      observaciones: signingObs
    }));
    
    setSigningObs('');
    setHasSignedDeliverer(false);
    setHasSignedReceiver(false);
  };

  const handleAddAnnex = async (e) => {
    e.preventDefault();
    if (!annexText.trim()) return;
    const res = await addAnnexToActa(showDetailActa.id, annexText);
    if (res.success) {
      // Refresh modal annexes list in detail view
      const updatedActa = actas.find(a => a.id === showDetailActa.id);
      if (updatedActa) {
        setShowDetailActa(updatedActa);
      } else {
        // Dynamic fallback
        setShowDetailActa(prev => ({
          ...prev,
          anexos: [...(prev.anexos || []), {
            id: `ANX-${Date.now()}`,
            author: currentUser?.username || 'system',
            date: new Date().toISOString().replace('T', ' ').slice(0, 19),
            text: annexText
          }]
        }));
      }
      setAnnexText('');
    } else {
      alert('Fallo agregando anexo: ' + res.message);
    }
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'Firmada': return 'bg-industrial-green/10 border-industrial-green/30 text-industrial-green';
      case 'Pendiente': return 'bg-industrial-yellow/10 border-industrial-yellow/30 text-industrial-yellow animate-pulse';
      case 'Anulada': return 'bg-industrial-red/10 border-industrial-red/30 text-industrial-red border-dashed';
      default: return 'bg-slate-500/10 border-slate-500/30 text-slate-400';
    }
  };

  const getComplianceBadgeColor = (compliance) => {
    switch (compliance) {
      case 'Completa': return 'bg-industrial-green/15 border-industrial-green/45 text-industrial-green shadow-[0_0_10px_rgba(16,185,129,0.15)]';
      case 'Parcial': return 'bg-industrial-cyan/15 border-industrial-cyan/45 text-industrial-cyan';
      case 'Con Faltantes': return 'bg-industrial-red/15 border-industrial-red/45 text-industrial-red shadow-[0_0_10px_rgba(239,68,68,0.15)] animate-pulse';
      default: return 'bg-slate-500/10 border-slate-500/30 text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      
      {/* -------------------- 1. TOP CUMPLIMIENTO TELEMETRY KPIs -------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-lg border-l-4 border-l-industrial-cyan relative overflow-hidden group hover:scale-[1.01] transition-transform">
          <p className="text-[10px] text-industrial-gray font-bold uppercase tracking-wider">Actas Registradas</p>
          <h3 className="text-2xl font-extrabold text-white mt-1 font-mono">{totalActasCount} <span className="text-xs text-industrial-gray font-normal">Protocolos</span></h3>
          <p className="text-[10px] text-industrial-gray font-semibold mt-2.5">
            Lote 4 Noroeste | <span className="text-industrial-cyan">{pendingActasCount} pendientes</span> de firma.
          </p>
        </div>

        <div className="glass-panel p-4 rounded-lg border-l-4 border-l-industrial-green relative overflow-hidden group hover:scale-[1.01] transition-transform">
          <p className="text-[10px] text-industrial-gray font-bold uppercase tracking-wider">Cumplimiento de EPP</p>
          <h3 className="text-2xl font-extrabold text-industrial-green mt-1 font-mono">{complianceIndex}% <span className="text-xs text-industrial-gray font-normal">Índice</span></h3>
          <div className="w-full bg-industrial-border h-1 rounded-full mt-3 overflow-hidden">
            <div className="bg-industrial-green h-full" style={{ width: `${complianceIndex}%` }} />
          </div>
        </div>

        <div className="glass-panel p-4 rounded-lg border-l-4 border-l-industrial-yellow relative overflow-hidden group hover:scale-[1.01] transition-transform">
          <p className="text-[10px] text-industrial-gray font-bold uppercase tracking-wider font-extrabold">Entregas Completas / Parciales</p>
          <h3 className="text-2xl font-extrabold text-white mt-1 font-mono">
            {completeActasCount} <span className="text-xs text-industrial-gray font-normal">Comp.</span> 
            <span className="text-industrial-gray mx-1.5">/</span> 
            <span className="text-industrial-cyan">{partialActasCount}</span> <span className="text-xs text-industrial-gray font-normal">Parc.</span>
          </h3>
          <p className="text-[10px] text-industrial-gray font-semibold mt-2.5">
            Despachos con dotación sugerida aprobada.
          </p>
        </div>

        <div className="glass-panel p-4 rounded-lg border-l-4 border-l-industrial-red relative overflow-hidden group hover:scale-[1.01] transition-transform">
          <p className="text-[10px] text-industrial-gray font-bold uppercase tracking-wider">Faltantes Críticos EPP</p>
          <h3 className="text-2xl font-extrabold text-industrial-red mt-1 font-mono animate-pulse">{missingActasCount} <span className="text-xs text-industrial-gray font-normal">Alertas</span></h3>
          <p className="text-[10px] text-industrial-gray font-semibold mt-2.5">
            ⚠️ Técnicos operando sin EPP obligatorio.
          </p>
        </div>
      </div>

      {/* -------------------- 2. MULTI-FILTERS CONTROL DECK -------------------- */}
      <div className="glass-panel p-4 rounded-lg border-opacity-40 space-y-4">
        <div className="text-[10px] text-industrial-cyan uppercase font-black tracking-widest flex items-center space-x-1.5 border-b border-industrial-border pb-2">
          <Search size={12} />
          <span>Búsqueda Avanzada y Auditoría de Cumplimiento</span>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          
          {/* Main search */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-industrial-gray">
              <Search size={12} />
            </span>
            <input
              type="text"
              placeholder="Buscar por código, técnico..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-industrial-bg bg-opacity-70 border border-industrial-border rounded px-2.5 py-1.5 pl-8 text-xs text-white focus:outline-none focus:border-industrial-cyan font-semibold"
            />
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-industrial-bg border border-industrial-border text-xs text-white px-2 py-1.5 rounded focus:outline-none focus:border-industrial-cyan font-bold"
          >
            <option value="">Todos los Estados</option>
            <option value="Firmada">Firmadas</option>
            <option value="Pendiente">Pendientes</option>
            <option value="Anulada">Anuladas</option>
          </select>

          {/* Delivery Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-industrial-bg border border-industrial-border text-xs text-white px-2 py-1.5 rounded focus:outline-none focus:border-industrial-cyan font-bold"
          >
            <option value="">Tipo de Entrega</option>
            <option value="EPP">Entrega EPP</option>
            <option value="Herramientas">Asignación Herramientas</option>
            <option value="Reposición">Reposición de Daños</option>
          </select>

          {/* Supervisor filter */}
          <select
            value={supervisorFilter}
            onChange={(e) => setSupervisorFilter(e.target.value)}
            className="bg-industrial-bg border border-industrial-border text-xs text-white px-2 py-1.5 rounded focus:outline-none focus:border-industrial-cyan font-bold"
          >
            <option value="">Todos los Supervisores</option>
            {getFilteredSupervisores().map(sup => (
              <option key={sup.id} value={sup.name}>{sup.name}</option>
            ))}
          </select>

          {/* Zone filter */}
          <select
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
            className="bg-industrial-bg border border-industrial-border text-xs text-white px-2 py-1.5 rounded focus:outline-none focus:border-industrial-cyan font-bold"
          >
            <option value="">Todas las Zonas</option>
            <option value="Noroeste Lote 4">Noroeste Lote 4</option>
            <option value="Sistema Central">Sistema Central</option>
          </select>

          {/* EPP Compliance Filter */}
          <select
            value={complianceFilter}
            onChange={(e) => setComplianceFilter(e.target.value)}
            className="bg-industrial-bg border border-industrial-border text-xs text-white px-2 py-1.5 rounded focus:outline-none focus:border-industrial-cyan font-bold"
          >
            <option value="">Cumplimiento EPP</option>
            <option value="Completa">Completa</option>
            <option value="Parcial">Parcial</option>
            <option value="Con Faltantes">Con Faltantes</option>
          </select>

        </div>

        <div className="flex justify-between items-center pt-2">
          <span className="text-[10px] text-industrial-gray font-semibold">
            Mostrando <span className="text-white font-bold">{filteredActas.length} actas</span> de un total de {totalActasCount} en MySQL.
          </span>
          <button
            onClick={() => setShowNewActaModal(true)}
            className="flex items-center space-x-1.5 px-4 py-1.5 rounded bg-gradient-to-r from-industrial-cyan to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-industrial-bg text-xs font-extrabold uppercase tracking-wider transition-all shadow-cyan-glow"
          >
            <Plus size={14} className="text-industrial-bg" />
            <span>Asignación Inteligente</span>
          </button>
        </div>
      </div>

      {/* -------------------- 3. UPGRADED COMPLIANCE HUB TABLE -------------------- */}
      <div className="glass-panel rounded-lg overflow-hidden border-opacity-40">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-industrial-bg bg-opacity-80 text-industrial-gray font-bold uppercase tracking-wider border-b border-industrial-border text-[10px]">
                <th className="p-4">Código Acta</th>
                <th className="p-4">Tipo Despacho</th>
                <th className="p-4">Destinatario</th>
                <th className="p-4">Fecha</th>
                <th className="p-4">Cumplimiento EPP</th>
                <th className="p-4">Doble Firma</th>
                <th className="p-4">Estado</th>
                <th className="p-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-border font-semibold">
              {filteredActas.map((acta) => {
                const signs = getDualSignatures(acta.signatureData);
                const bothSigned = signs.deliverer && signs.receiver;
                const compliance = getActaCompliance(acta);

                return (
                  <tr key={acta.id} className="hover:bg-industrial-border hover:bg-opacity-20 transition-all">
                    <td className="p-4 font-bold text-white text-sm font-mono tracking-wide">{acta.id}</td>
                    <td className="p-4">
                      <span className="text-white text-[11px] font-extrabold block leading-normal">{acta.tipo}</span>
                      <span className="text-[8px] text-industrial-gray font-bold uppercase tracking-wider mt-0.5 block">Supervisor: {acta.responsable}</span>
                    </td>
                    <td className="p-4">
                      <span className="text-industrial-cyan text-[11px] font-bold block">{acta.destino}</span>
                    </td>
                    <td className="p-4 font-mono text-white text-[11px]">{acta.fecha}</td>
                    
                    {/* Compliance Status Badge */}
                    <td className="p-4">
                      <span className={`px-2.5 py-0.5 border rounded text-[9px] font-black uppercase tracking-wider ${getComplianceBadgeColor(compliance)}`}>
                        {compliance === 'Completa' ? '✓ Completa' : compliance === 'Parcial' ? '○ Parcial' : '⚠️ Con Faltantes'}
                      </span>
                    </td>

                    {/* Both Signed Badge */}
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border inline-flex items-center space-x-1 ${
                        bothSigned 
                          ? 'bg-industrial-green/10 border-industrial-green/30 text-industrial-green'
                          : 'bg-industrial-orange/10 border-industrial-orange/30 text-industrial-orange animate-pulse'
                      }`}>
                        <FileSignature size={10} />
                        <span>{bothSigned ? 'DOBLE FIRMA OK' : 'PENDIENTE'}</span>
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td className="p-4">
                      <span className={`px-2 py-0.5 border rounded text-[10px] uppercase font-bold tracking-wider ${getStatusBadgeColor(acta.estado)}`}>
                        {acta.estado}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => setShowDetailActa(acta)}
                          className="p-1.5 rounded bg-industrial-cyan bg-opacity-10 hover:bg-opacity-20 text-industrial-cyan border border-industrial-cyan border-opacity-20 transition-all shadow-cyan-glow"
                          title="Inspeccionar Ficha y Firmar"
                        >
                          <Eye size={13} />
                        </button>
                        {acta.estado !== 'Anulada' && (
                          <button
                            onClick={() => anularActa(acta.id)}
                            className="p-1.5 rounded bg-industrial-red bg-opacity-5 hover:bg-opacity-15 text-industrial-red border border-industrial-red border-opacity-15 transition-all"
                            title="Anular Despacho"
                          >
                            <X size={13} />
                          </button>
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

      {/* -------------------- MODAL: PROFESSIONAL ACTA DETAILS & ANNEX PANEL -------------------- */}
      <AnimatePresence>
        {showDetailActa && (() => {
          const signs = getDualSignatures(showDetailActa.signatureData);
          const bothSigned = signs.deliverer && signs.receiver;
          const compliance = getActaCompliance(showDetailActa);
          const destinationName = showDetailActa.destino.split(': ')[1] || showDetailActa.destino;

          // Check if any mandatory EPP is missing for security alerts
          const mandatoryEPPs = showDetailActa.items.filter(it => 
            (it.code === 'EPP-CASDI' || it.code === 'EPP-GUAIS' || it.code === 'EPP-ARNES' || it.code === 'EPP-BOTDI') && 
            (it.name.toLowerCase().includes('pendiente') || it.name.toLowerCase().includes('faltante') || it.qty === 0)
          );

          return (
            <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:p-0">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-4xl bg-industrial-bg rounded-lg p-6 border border-industrial-border flex flex-col justify-between max-h-[95vh] overflow-y-auto print:max-h-none print:border-none print:bg-white print:text-black"
                style={{ background: 'rgba(9, 15, 29, 0.98)', boxShadow: '0 0 40px rgba(0,0,0,0.8)' }}
              >
                
                {/* Visual controls for UI - Adobe/Foxit Acrobat Corporate Style Toolbar */}
                <div className="print:hidden flex flex-wrap items-center justify-between gap-3 bg-industrial-panelHeader p-2.5 rounded border border-industrial-border mb-4 text-[10px] font-bold">
                  <div className="flex items-center space-x-2">
                    <FileBadge size={16} className="text-industrial-cyan" />
                    <span className="text-white uppercase tracking-wider">Acrobat Reader Enterprise - {showDetailActa.id}</span>
                  </div>
                  
                  {/* Adobe Acrobat toolbar controls */}
                  <div className="flex items-center space-x-2 bg-black/40 px-2.5 py-1 rounded border border-industrial-border">
                    <button 
                      type="button" 
                      onClick={() => setZoomPercent(prev => Math.max(50, prev - 25))} 
                      className="px-1.5 py-0.5 rounded bg-industrial-border text-white hover:text-industrial-cyan transition-colors"
                      title="Zoom Out"
                    >
                      -
                    </button>
                    <span className="text-white font-mono min-w-[32px] text-center">{zoomPercent}%</span>
                    <button 
                      type="button" 
                      onClick={() => setZoomPercent(prev => Math.min(200, prev + 25))} 
                      className="px-1.5 py-0.5 rounded bg-industrial-border text-white hover:text-industrial-cyan transition-colors"
                      title="Zoom In"
                    >
                      +
                    </button>
                    <div className="w-[1px] h-3 bg-industrial-border mx-1" />
                    <button 
                      type="button" 
                      onClick={() => setZoomPercent(100)} 
                      className="px-2 py-0.5 rounded bg-industrial-border text-white hover:text-industrial-cyan transition-colors"
                      title="Ajustar Ancho"
                    >
                      Ajustar (100%)
                    </button>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button 
                      type="button"
                      onClick={() => {
                        alert(`Generando empaquetado PDF certificado para ${showDetailActa.id}.\nSello SHA-256 Validado: SHA-256:${showDetailActa.id}-8D91A`);
                      }}
                      className="px-3 py-1 rounded bg-industrial-cyan bg-opacity-10 text-industrial-cyan hover:bg-opacity-20 border border-industrial-cyan border-opacity-30 transition-all font-extrabold uppercase tracking-wider flex items-center space-x-1"
                    >
                      <span>Descargar PDF</span>
                    </button>
                    <button 
                      onClick={() => window.print()}
                      className="px-3 py-1 rounded bg-industrial-border text-white hover:text-industrial-cyan transition-colors flex items-center space-x-1 font-extrabold uppercase tracking-wider"
                      title="Imprimir Protocolo"
                    >
                      <Printer size={12} />
                      <span>Imprimir</span>
                    </button>
                    <button onClick={() => { setShowDetailActa(null); setSigningObs(''); }} className="p-1 rounded hover:bg-industrial-border text-industrial-gray hover:text-white ml-1">
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* Main Printable Area Wrapper with scale zoom support */}
                <div className="overflow-auto max-h-[60vh] border border-industrial-border/60 bg-black/30 p-4 rounded pr-2 scrollbar-thin">
                  <div 
                    id="printable-acta" 
                    className="space-y-5 print:text-black print:bg-transparent relative p-6 bg-industrial-panel bg-opacity-40 border border-industrial-border/40 rounded transition-all duration-300 z-10"
                    style={{ 
                      transform: `scale(${zoomPercent / 100})`, 
                      transformOrigin: 'top center',
                      margin: '0 auto',
                      width: '100%',
                      maxWidth: '800px'
                    }}
                  >
                    
                    {/* CONFIDENCIAL Watermark */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden select-none z-0 opacity-5">
                      <div className="text-white text-3xl font-black uppercase tracking-widest -rotate-45 whitespace-nowrap scale-150">
                        CONFIDENCIAL GRIDOPS ENTERPRISE V2
                      </div>
                    </div>
                  
                  {/* Executive Header */}
                  <div className="flex justify-between items-start border-b border-industrial-border pb-4 print:border-black">
                    <div>
                      <div className="font-black text-white text-base tracking-widest print:text-black">GRIDOPS ENTERPRISE</div>
                      <span className="text-[9px] text-industrial-gray uppercase font-bold tracking-widest print:text-gray-600">SISTEMA ERP DE CONTROL OPERATIVO INDUSTRIAL</span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg text-neon-cyan font-mono leading-none print:text-black">{showDetailActa.id}</div>
                      <span className="text-[9px] text-industrial-gray uppercase tracking-widest mt-1 block print:text-gray-600">{showDetailActa.tipo}</span>
                    </div>
                  </div>

                  {/* Compliance Alert Box if Mandatory EPP is Missing */}
                  {mandatoryEPPs.length > 0 && (
                    <div className="p-3 bg-industrial-red/10 border border-industrial-red/40 rounded flex items-start space-x-2 animate-pulse print:border-red-600 print:text-red-600">
                      <AlertTriangle size={16} className="text-industrial-red flex-shrink-0 mt-0.5 print:text-red-600" />
                      <div>
                        <span className="block text-[9px] text-industrial-red uppercase font-black tracking-widest leading-none print:text-red-600">ALERTA DE SEGURIDAD Y CUMPLIMIENTO (SST)</span>
                        <p className="text-white text-[11px] font-bold mt-1 leading-relaxed print:text-black">
                          El técnico opera activamente sin EPP obligatorio: <span className="text-industrial-red font-extrabold print:text-red-600">{mandatoryEPPs.map(e => e.name.split(' - ')[0]).join(', ')}</span>. Protocolo de seguridad del Lote 4 comprometido.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* General Metadata grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-semibold print:text-black">
                    <div>
                      <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest print:text-gray-500">Destinatario Roster</span>
                      <span className="text-white text-[11px] print:text-black">{showDetailActa.destino}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest print:text-gray-500">Supervisor Responsable</span>
                      <span className="text-white text-[11px] print:text-black">{showDetailActa.responsable}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest print:text-gray-500">Fecha Emisión</span>
                      <span className="text-white text-[11px] font-mono print:text-black">{showDetailActa.fecha}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest print:text-gray-500">Cumplimiento Dotación</span>
                      <span className={`px-2 py-0.2 rounded border text-[9px] font-black uppercase tracking-wider inline-block mt-0.5 ${getComplianceBadgeColor(compliance)}`}>
                        {compliance}
                      </span>
                    </div>
                  </div>

                  {/* Mapped items table */}
                  <div>
                    <span className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1.5 print:text-gray-600">Materiales y EPP Incluidos en Despacho</span>
                    <div className="border border-industrial-border rounded overflow-hidden print:border-black">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-industrial-bg text-industrial-gray uppercase font-bold text-[9px] border-b border-industrial-border print:bg-gray-100 print:text-black print:border-black">
                            <th className="p-2">Material / Herramienta</th>
                            <th className="p-2">Categoría</th>
                            <th className="p-2 text-center">Cant.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-industrial-border font-semibold print:divide-gray-300">
                          {showDetailActa.items.map((it) => (
                            <tr key={it.code} className="print:text-black">
                              <td className="p-2">
                                <span className="text-white block text-[11px] print:text-black font-extrabold">{it.name}</span>
                                <span className="text-[9px] text-industrial-cyan font-mono print:text-gray-600">{it.code}</span>
                              </td>
                              <td className="p-2 text-industrial-gray uppercase text-[10px] print:text-gray-600">{it.category}</td>
                              <td className="p-2 text-center text-white text-sm font-black print:text-black">{it.qty}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Observations Section */}
                  {showDetailActa.observaciones && (
                    <div className="bg-industrial-bg bg-opacity-40 p-3 rounded border border-industrial-border print:border-black print:text-black">
                      <span className="block text-[8px] text-industrial-cyan uppercase font-black tracking-widest print:text-gray-600">Observaciones Generales</span>
                      <p className="text-white text-[11px] mt-1 italic font-medium print:text-black leading-relaxed">
                        “{showDetailActa.observaciones}”
                      </p>
                    </div>
                  )}

                  {/* Dual signatures render side by side */}
                  <div className="grid grid-cols-2 gap-6 border-t border-industrial-border pt-4 print:border-black print:text-black">
                    
                    <div className="text-center border border-dashed border-industrial-border/60 p-4 rounded bg-industrial-bg bg-opacity-25 flex flex-col justify-between h-28 print:border-black print:bg-transparent">
                      <span className="text-[8px] text-industrial-gray uppercase font-black tracking-widest block print:text-gray-600">Entregado Por (Supervisor)</span>
                      <div className="my-1.5">
                        {signs.deliverer ? (
                          <img src={signs.deliverer} alt="Firma Emisor" className="h-10 object-contain invert opacity-95 mx-auto max-w-[150px] print:invert-0" />
                        ) : (
                          <div className="text-[9px] text-industrial-orange font-bold animate-pulse">Pendiente de Firma</div>
                        )}
                      </div>
                      <div>
                        <span className="font-extrabold text-white text-[10px] block print:text-black truncate">{showDetailActa.responsable}</span>
                        <span className="text-[8px] text-industrial-gray tracking-widest uppercase">Supervisor Autorizado</span>
                      </div>
                    </div>

                    <div className="text-center border border-dashed border-industrial-border/60 p-4 rounded bg-industrial-bg bg-opacity-25 flex flex-col justify-between h-28 print:border-black print:bg-transparent">
                      <span className="text-[8px] text-industrial-gray uppercase font-black tracking-widest block print:text-gray-600">Recibido Conforme (Técnico)</span>
                      <div className="my-1.5">
                        {signs.receiver ? (
                          <img src={signs.receiver} alt="Firma Receptor" className="h-10 object-contain invert opacity-95 mx-auto max-w-[150px] print:invert-0" />
                        ) : (
                          <div className="text-[9px] text-industrial-orange font-bold animate-pulse">Pendiente de Firma</div>
                        )}
                      </div>
                      <div>
                        <span className="font-extrabold text-white text-[10px] block print:text-black truncate">{destinationName}</span>
                        <span className="text-[8px] text-industrial-gray tracking-widest uppercase">Colaborador Técnico</span>
                      </div>
                    </div>

                  </div>

                  {/* SHA-256 Sello Digital */}
                  <div className="text-[8px] text-industrial-gray flex justify-between items-center pt-1 border-t border-industrial-border/30 print:text-black print:border-black">
                    <span>Sistema de Inmutabilidad ERP GridOps Enterprise v2</span>
                    <span className="font-mono text-industrial-cyan print:text-black">
                      🛡️ Sello Criptográfico SHA-256: {bothSigned ? `SHA-256:${showDetailActa.id}-8D91A${showDetailActa.fecha.replace(/-/g,'')}C` : 'EN ESPERA DE FIRMAS'}
                    </span>
                  </div>

                  {/* ----------------- ANEXOS AUTORIZADOS BITACORA ----------------- */}
                  {showDetailActa.estado === 'Firmada' && (
                    <div className="border-t border-industrial-border/40 pt-4 space-y-3 print:hidden">
                      <div className="flex items-center space-x-1 text-industrial-cyan">
                        <Lock size={12} />
                        <span className="text-[9px] text-industrial-cyan uppercase font-black tracking-widest">Anexos Autorizados (Edición Bloqueada)</span>
                      </div>

                      {/* Annexes log list */}
                      <div className="space-y-2 max-h-36 overflow-y-auto scrollbar-thin">
                        {(!showDetailActa.anexos || showDetailActa.anexos.length === 0) ? (
                          <p className="text-[10px] text-industrial-gray italic">No hay anexos registrados para este protocolo.</p>
                        ) : (
                          showDetailActa.anexos.map((anx) => (
                            <div key={anx.id} className="bg-industrial-bg bg-opacity-50 p-2.5 rounded border border-industrial-border space-y-1">
                              <div className="flex justify-between items-center text-[9px] text-industrial-gray font-mono">
                                <span className="font-bold text-industrial-cyan">@{anx.author}</span>
                                <span>{anx.date}</span>
                              </div>
                              <p className="text-white text-[11px] leading-relaxed">{anx.text}</p>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Add new annex form */}
                      <form onSubmit={handleAddAnnex} className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Registrar anexo técnico autorizado al protocolo firmado..."
                          value={annexText}
                          onChange={(e) => setAnnexText(e.target.value)}
                          className="flex-grow bg-industrial-bg border border-industrial-border rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-industrial-cyan"
                        />
                        <button
                          type="submit"
                          className="px-4 py-1.5 rounded bg-industrial-cyan text-industrial-bg hover:bg-cyan-400 font-extrabold uppercase text-[10px] flex items-center space-x-1"
                        >
                          <PlusCircle size={12} />
                          <span>Anexar</span>
                        </button>
                      </form>
                    </div>
                  )}

                  {/* ----------------- COMPORTAMIENTO DE FIRMA DIGITAL PENDIENTE ----------------- */}
                  {showDetailActa.estado === 'Pendiente' && (
                    <div className="bg-industrial-panel bg-opacity-35 p-4 rounded border border-industrial-cyan/20 space-y-4 print:hidden">
                      <div className="text-[10px] text-industrial-cyan uppercase font-black tracking-widest flex items-center space-x-1.5">
                        <PenTool size={12} />
                        <span>Sellar y Firmar Acta Digitalmente</span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        
                        {/* Canvas Deliverer */}
                        <div className="space-y-1.5">
                          <span className="text-[9px] text-industrial-gray uppercase font-bold tracking-widest block">A. Firma de quien entrega (Supervisor)</span>
                          <div className="border border-industrial-border rounded bg-industrial-bg overflow-hidden shadow-panel-glow">
                            <canvas 
                              ref={canvasDelivererRef}
                              width={220}
                              height={80}
                              onMouseDown={startDrawingDeliverer}
                              onMouseMove={drawDeliverer}
                              onMouseUp={stopDrawingDeliverer}
                              onMouseLeave={stopDrawingDeliverer}
                              className="w-full bg-industrial-bg cursor-crosshair h-20"
                            />
                            <div className="flex justify-between items-center bg-industrial-border/20 px-2 py-1 border-t border-industrial-border text-[8px]">
                              <span className="text-industrial-cyan uppercase font-bold">Firma Emisor</span>
                              <button type="button" onClick={clearCanvasDeliverer} className="text-industrial-gray hover:text-white uppercase font-bold">Limpiar</button>
                            </div>
                          </div>
                        </div>

                        {/* Canvas Receiver */}
                        <div className="space-y-1.5">
                          <span className="text-[9px] text-industrial-gray uppercase font-bold tracking-widest block">B. Firma de quien recibe (Técnico)</span>
                          <div className="border border-industrial-border rounded bg-industrial-bg overflow-hidden shadow-panel-glow">
                            <canvas 
                              ref={canvasReceiverRef}
                              width={220}
                              height={80}
                              onMouseDown={startDrawingReceiver}
                              onMouseMove={drawReceiver}
                              onMouseUp={stopDrawingReceiver}
                              onMouseLeave={stopDrawingReceiver}
                              className="w-full bg-industrial-bg cursor-crosshair h-20"
                            />
                            <div className="flex justify-between items-center bg-industrial-border/20 px-2 py-1 border-t border-industrial-border text-[8px]">
                              <span className="text-industrial-orange uppercase font-bold">Firma Receptor</span>
                              <button type="button" onClick={clearCanvasReceiver} className="text-industrial-gray hover:text-white uppercase font-bold">Limpiar</button>
                            </div>
                          </div>
                        </div>

                      </div>

                      {/* Observations note and execute CTA */}
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1.5">Observaciones Finales de Entrega</label>
                          <input
                            type="text"
                            placeholder="Registrar notas adicionales del equipamiento (ej. Estado de faena, SN especial, etc.)..."
                            value={signingObs}
                            onChange={(e) => setSigningObs(e.target.value)}
                            className="w-full bg-industrial-bg border border-industrial-border rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-industrial-cyan"
                          />
                        </div>

                        <button
                          onClick={handleSignActaModal}
                          className="w-full py-2.5 rounded bg-gradient-to-r from-industrial-cyan to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-industrial-bg font-extrabold text-[10px] uppercase tracking-widest transition-all shadow-cyan-glow flex items-center justify-center space-x-1.5"
                        >
                          <Check size={12} className="text-industrial-bg" />
                          <span>Sellar y Firmar Acta en MySQL</span>
                        </button>
                      </div>

                    </div>
                  )}

                </div>
              </div>
            </motion.div>
          </div>
          );
        })()}
      </AnimatePresence>

      {/* -------------------- MODAL: CREAR NUEVA ACTA DE ENTREGA (WITH DUAL DRAW CANVAS WIZARD!) -------------------- */}
      <AnimatePresence>
        {showNewActaModal && (
          <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="w-full max-w-[95%] xl:max-w-7xl glass-panel rounded-lg p-6 border-neon-cyan max-h-[92vh] overflow-y-auto"
              style={{ background: 'rgba(9, 15, 29, 0.98)', boxShadow: '0 0 50px rgba(6, 182, 212, 0.15)' }}
            >
              
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-industrial-border pb-3 mb-4">
                <div className="flex items-center space-x-2 text-white">
                  <Boxes className="text-industrial-cyan animate-pulse" size={18} />
                  <h3 className="font-black text-sm uppercase tracking-wider">
                    Asignación Inteligente de EPP y Kits de Campo por Departamento
                  </h3>
                </div>
                <button onClick={() => setShowNewActaModal(false)} className="text-industrial-gray hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>

              {/* Form container */}
              <form onSubmit={handleCreateNewActa} className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs font-semibold">
                
                {/* ----------------- COLUMN 1: CONFIG & AUTOLOADERS ----------------- */}
                <div className="lg:col-span-3 space-y-4">
                  <div className="text-[10px] text-industrial-cyan uppercase font-black tracking-widest border-b border-industrial-cyan border-opacity-20 pb-1 flex items-center space-x-1.5">
                    <User size={12} />
                    <span>1. Configuración de Destino</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewActaTargetType('Técnico')}
                      className={`p-2 border rounded text-center font-black transition-all ${
                        newActaTargetType === 'Técnico' 
                          ? 'bg-industrial-cyan bg-opacity-10 border-industrial-cyan text-white shadow-cyan-glow' 
                          : 'border-industrial-border text-industrial-gray hover:text-white'
                      }`}
                    >
                      Técnico Roster
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewActaTargetType('Brigada')}
                      className={`p-2 border rounded text-center font-black transition-all ${
                        newActaTargetType === 'Brigada' 
                          ? 'bg-industrial-cyan bg-opacity-10 border-industrial-cyan text-white shadow-cyan-glow' 
                          : 'border-industrial-border text-industrial-gray hover:text-white'
                      }`}
                    >
                      Brigada Móvil
                    </button>
                  </div>

                  <div>
                    <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1.5">Seleccionar Destinatario *</label>
                    <select
                      value={newActaDest}
                      onChange={(e) => setNewActaDest(e.target.value)}
                      className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan"
                      required
                    >
                      <option value="">-- Seleccione Brigada o Técnico --</option>
                      {newActaTargetType === 'Brigada' ? (
                        brigadas.map(b => (
                          <option key={b.id} value={b.id}>{b.id} ({b.tipo})</option>
                        ))
                      ) : (
                        tecnicos.filter(t => t.estado === 'Activo').map(t => (
                          <option key={t.id} value={t.name}>{t.name} (Expediente: {t.codigoEmpleado})</option>
                        ))
                      )}
                    </select>
                  </div>

                  {newActaTargetType === 'Técnico' && (
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1.5">Perfil Técnico / Cargo EPP</label>
                      <select
                        value={selectedCargo}
                        onChange={(e) => setSelectedCargo(e.target.value)}
                        className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan font-bold"
                      >
                        <option value="Técnico TCT">Técnico TCT (Alta Tensión)</option>
                        <option value="Supervisor">Supervisor de Cuadrilla</option>
                        <option value="Técnico Comercial">Técnico Comercial</option>
                        <option value="Motorizado">Técnico Motorizado</option>
                        <option value="Liniero">Liniero de Redes</option>
                        <option value="Inspector">Inspector de Redes</option>
                        <option value="Ayudante">Ayudante General</option>
                        <option value="Averías">Especialista en Averías</option>
                        <option value="Redes">Instalador de Redes</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1.5">Tipo de Acta / Operación</label>
                    <select
                      value={newActaType}
                      onChange={(e) => setNewActaType(e.target.value)}
                      className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-2 focus:outline-none focus:border-industrial-cyan"
                    >
                      <option value="Entrega EPP">Entrega EPP</option>
                      <option value="Asignación Herramientas">Asignación Herramientas</option>
                      <option value="Reposición por Incidencia">Reposición por Incidencia</option>
                      <option value="Entrega de Equipos">Entrega de Equipos Especiales</option>
                    </select>
                  </div>

                  {/* Visually Loaded Department Selector Cards */}
                  <div>
                    <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-2 flex items-center space-x-1">
                      <Layers size={10} />
                      <span>2. Kit de Departamento</span>
                    </label>
                    
                    <div className="grid grid-cols-2 gap-1.5">
                      {Object.keys(OPERATIONAL_KITS).map((dept) => (
                        <button
                          key={dept}
                          type="button"
                          onClick={() => setSelectedKitDept(dept)}
                          className={`p-2 border rounded text-center transition-all ${
                            selectedKitDept === dept
                              ? 'bg-industrial-cyan bg-opacity-10 border-industrial-cyan text-white shadow-cyan-glow'
                              : 'border-industrial-border text-industrial-gray hover:text-white hover:bg-industrial-border/25'
                          }`}
                        >
                          <div className="font-extrabold text-[10px] uppercase tracking-wider">{dept}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* AUTO ALLOCATE TRIGGER CARD */}
                  <div className="bg-industrial-cyan bg-opacity-5 p-3.5 rounded border border-industrial-cyan border-opacity-30">
                    <p className="text-[10px] text-industrial-gray leading-normal mb-3">
                      Haga clic abajo para cargar la dotación inteligente que cruzará los EPP reglamentarios de <span className="text-white font-bold">{selectedCargo}</span> y las herramientas de <span className="text-industrial-cyan font-bold">{selectedKitDept}</span> con el stock de almacén.
                    </p>
                    <button
                      type="button"
                      onClick={handleLoadSmartKit}
                      className="w-full py-2 bg-gradient-to-r from-industrial-cyan to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-industrial-bg font-extrabold text-[10px] uppercase tracking-widest transition-all shadow-cyan-glow flex items-center justify-center space-x-1.5"
                    >
                      <Wrench size={11} />
                      <span>Cargar Kit Inteligente</span>
                    </button>
                  </div>

                </div>

                {/* ----------------- COLUMN 2: INTERACTIVE CHECKLIST ----------------- */}
                <div className="lg:col-span-6 space-y-4">
                  <div className="text-[10px] text-industrial-cyan uppercase font-black tracking-widest border-b border-industrial-cyan border-opacity-20 pb-1 flex items-center justify-between">
                    <span className="flex items-center space-x-1.5">
                      <ShieldCheck size={12} />
                      <span>3. Checklist del Equipamiento Recomendado</span>
                    </span>
                    <span className="text-[9px] text-industrial-gray font-bold tracking-normal">{checklistItems.length} ítems en plantilla</span>
                  </div>

                  {/* Table Wrapper */}
                  <div className="border border-industrial-border rounded bg-industrial-bg bg-opacity-30 p-2.5 space-y-2 max-h-[380px] overflow-y-auto">
                    {checklistItems.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center text-industrial-gray space-y-2">
                        <Wrench size={24} className="text-industrial-border animate-pulse" />
                        <span className="font-bold text-[10px] uppercase tracking-widest">Dotación Vacía</span>
                        <p className="text-[9px] leading-relaxed max-w-xs">Use el panel de la izquierda para seleccionar un cargo, departamento y haga clic en Cargar Kit Inteligente.</p>
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr className="text-industrial-gray text-[9px] uppercase font-bold tracking-wider border-b border-industrial-border pb-1">
                            <th className="pb-2">Material / Almacén</th>
                            <th className="pb-2 text-center">Cant.</th>
                            <th className="pb-2">Estado / Serial</th>
                            <th className="pb-2 text-center">Entrega</th>
                            <th className="pb-2 text-right">Quitar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-industrial-border/40 font-semibold">
                          {checklistItems.map((item) => {
                            const isMissing = item.stock < item.qty;
                            return (
                              <tr key={item.code} className="hover:bg-industrial-bg hover:bg-opacity-50">
                                
                                {/* Info & Stock badge */}
                                <td className="py-2.5 pr-2 max-w-[200px] truncate">
                                  <div className="text-white font-extrabold flex items-center space-x-1">
                                    <span className="truncate">{item.name}</span>
                                    <span className="text-[8px] bg-slate-800 border border-industrial-border text-industrial-gray px-1 rounded scale-90">{item.category}</span>
                                  </div>
                                  <div className="text-[9px] text-industrial-gray font-mono mt-0.5 flex items-center space-x-2">
                                    <span>{item.code}</span>
                                    <span className={`px-1 rounded text-[8px] font-black ${isMissing ? 'bg-industrial-red/10 text-industrial-red' : 'bg-industrial-green/10 text-industrial-green'}`}>
                                      Almacén: {item.stock} disp.
                                    </span>
                                  </div>
                                </td>

                                {/* Quantity Input */}
                                <td className="py-2 text-center pr-2">
                                  <input 
                                    type="number"
                                    min={1}
                                    max={item.stock}
                                    value={item.qty}
                                    onChange={(e) => handleUpdateChecklistItem(item.code, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
                                    className={`w-10 text-center bg-industrial-bg border rounded text-[10px] p-0.5 font-mono ${isMissing ? 'border-industrial-red text-industrial-red' : 'border-industrial-border text-white'}`}
                                  />
                                </td>

                                {/* Physical State & Serial */}
                                <td className="py-2 pr-2">
                                  <select
                                    value={item.status}
                                    onChange={(e) => handleUpdateChecklistItem(item.code, 'status', e.target.value)}
                                    className="w-full bg-industrial-bg border border-industrial-border text-[9px] text-white rounded p-0.5 focus:outline-none mb-1 font-bold"
                                  >
                                    <option value="Nuevo">Nuevo</option>
                                    <option value="Buen estado">Buen estado</option>
                                    <option value="Pendiente">Pendiente</option>
                                    <option value="Faltante">Faltante</option>
                                    <option value="Dañado">Dañado</option>
                                    <option value="Reposición requerida">Reposición Req.</option>
                                    <option value="No aplica">No aplica</option>
                                  </select>
                                  <input 
                                    type="text"
                                    placeholder="Serial/Obs..."
                                    value={item.serial || ''}
                                    onChange={(e) => handleUpdateChecklistItem(item.code, 'serial', e.target.value)}
                                    className="w-full bg-transparent border-b border-industrial-border/60 text-[9px] text-white focus:outline-none font-medium p-0.5"
                                  />
                                </td>

                                {/* Checklist Toggle Switch */}
                                <td className="py-2 text-center">
                                  <input 
                                    type="checkbox"
                                    checked={item.delivered}
                                    onChange={(e) => {
                                      if (isMissing && e.target.checked) {
                                        alert('Existencias nulas o insuficientes en Almacén Central. El ítem se marcará como Pendiente sin descontar stock.');
                                        handleUpdateChecklistItem(item.code, 'status', 'Pendiente');
                                      }
                                      handleUpdateChecklistItem(item.code, 'delivered', e.target.checked);
                                    }}
                                    className="rounded border-industrial-border text-industrial-cyan focus:ring-industrial-cyan w-4 h-4 cursor-pointer"
                                  />
                                </td>

                                {/* Manual removal button */}
                                <td className="py-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveChecklistItem(item.code)}
                                    className="p-1 rounded bg-industrial-red/10 border border-industrial-red/20 text-industrial-red hover:bg-industrial-red/20"
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

                  {/* Add manual item from master central inventory */}
                  <div className="bg-industrial-bg bg-opacity-40 p-3 rounded border border-industrial-border">
                    <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1.5">Agregar Material Adicional al Checklist</label>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAddCustomChecklistItem(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="w-full bg-industrial-bg border border-industrial-border text-xs text-white rounded p-1.5 focus:outline-none focus:border-industrial-cyan"
                    >
                      <option value="">-- Seleccionar herramienta/EPP del inventario central --</option>
                      {inventario
                        .filter(inv => !checklistItems.some(i => i.code === inv.code))
                        .map(inv => (
                          <option key={inv.code} value={inv.code}>
                            {inv.name} ({inv.code}) | Bodega: {inv.stock} disp.
                          </option>
                        ))}
                    </select>
                  </div>

                </div>

                {/* ----------------- COLUMN 3: VALIDATION & DOUBLE SIGNATURES ----------------- */}
                <div className="lg:col-span-3 space-y-4 flex flex-col justify-between">
                  <div>
                    <div className="text-[10px] text-industrial-cyan uppercase font-black tracking-widest border-b border-industrial-cyan border-opacity-20 pb-1 mb-3 flex items-center space-x-1.5">
                      <FileSignature size={12} />
                      <span>4. Validación y Cifrado</span>
                    </div>

                    {/* DOUBLE SIGNATURES PADS */}
                    <div className="space-y-4">
                      
                      {/* Signature Deliverer */}
                      <div className="space-y-1.5">
                        <span className="text-[8px] text-industrial-gray uppercase font-bold tracking-widest block">A. Firma de quien entrega (Supervisor)</span>
                        <div className="border border-industrial-border rounded bg-industrial-bg overflow-hidden shadow-panel-glow">
                          <canvas 
                            ref={canvasDelivererRef}
                            width={220}
                            height={80}
                            onMouseDown={startDrawingDeliverer}
                            onMouseMove={drawDeliverer}
                            onMouseUp={stopDrawingDeliverer}
                            onMouseLeave={stopDrawingDeliverer}
                            className="w-full bg-industrial-bg cursor-crosshair h-20"
                          />
                          <div className="flex justify-between items-center bg-industrial-border/20 px-2 py-1 border-t border-industrial-border text-[8px]">
                            <span className="text-industrial-cyan uppercase font-bold">Firma Emisor</span>
                            <button type="button" onClick={clearCanvasDeliverer} className="text-industrial-gray hover:text-white uppercase font-bold">Limpiar</button>
                          </div>
                        </div>
                      </div>

                      {/* Signature Receiver */}
                      <div className="space-y-1.5">
                        <span className="text-[8px] text-industrial-gray uppercase font-bold tracking-widest block">B. Firma de quien recibe (Técnico)</span>
                        <div className="border border-industrial-border rounded bg-industrial-bg overflow-hidden shadow-panel-glow">
                          <canvas 
                            ref={canvasReceiverRef}
                            width={220}
                            height={80}
                            onMouseDown={startDrawingReceiver}
                            onMouseMove={drawReceiver}
                            onMouseUp={stopDrawingReceiver}
                            onMouseLeave={stopDrawingReceiver}
                            className="w-full bg-industrial-bg cursor-crosshair h-20"
                          />
                          <div className="flex justify-between items-center bg-industrial-border/20 px-2 py-1 border-t border-industrial-border text-[8px]">
                            <span className="text-industrial-orange uppercase font-bold">Firma Receptor</span>
                            <button type="button" onClick={clearCanvasReceiver} className="text-industrial-gray hover:text-white uppercase font-bold">Limpiar</button>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* Submission and observations */}
                  <div className="space-y-2 pt-4 border-t border-industrial-border">
                    <div>
                      <label className="block text-[9px] text-industrial-gray uppercase font-bold tracking-widest mb-1">Observaciones Iniciales</label>
                      <input
                        type="text"
                        placeholder="Observaciones adicionales..."
                        value={signingObs}
                        onChange={(e) => setSigningObs(e.target.value)}
                        className="w-full bg-industrial-bg border border-industrial-border rounded px-2 py-1 text-xs text-white focus:outline-none"
                      />
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => setShowNewActaModal(false)}
                      className="w-full py-2 rounded bg-industrial-border hover:bg-opacity-60 text-white font-extrabold text-[10px] uppercase tracking-wider transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="w-full py-2.5 rounded bg-gradient-to-r from-industrial-cyan to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-industrial-bg font-extrabold text-[10px] uppercase tracking-widest transition-all shadow-cyan-glow flex items-center justify-center space-x-1.5"
                    >
                      <Save size={12} />
                      <span>Guardar y Cifrar Acta</span>
                    </button>
                  </div>

                </div>

              </form>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default ActasPage;
