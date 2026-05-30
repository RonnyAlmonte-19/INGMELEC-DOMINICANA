import React, { createContext, useState, useContext, useEffect } from 'react';

const AppContext = createContext();

export const useApp = () => useContext(AppContext);

const API_BASE = '/api';

export const AppProvider = ({ children }) => {
  // Session State
  const [currentUser, setCurrentUser] = useState(null);
  const [currentRole, setCurrentRole] = useState(null); // 'Developer', 'Gerente', 'Coordinador', 'Supervisor'
  const [authToken, setAuthToken] = useState(localStorage.getItem('gridops_auth_token') || null);

  // DB States
  const [coordinadores, setCoordinadores] = useState([]);
  const [supervisores, setSupervisores] = useState([]);
  const [brigadas, setBrigadas] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [inventario, setInventario] = useState([]);
  const [brigadaHerramientas, setBrigadaHerramientas] = useState([]);
  const [actas, setActas] = useState([]);
  const [reposiciones, setReposiciones] = useState([]);
  const [swaps, setSwaps] = useState([]);
  const [devoluciones, setDevoluciones] = useState([]);
  const [auditoria, setAuditoria] = useState([]);
  const [kits, setKits] = useState([]);
  const [usuarios, setUsuarios] = useState([]);

  // Telemetry status
  const [loading, setLoading] = useState(true);

  // System Notifications
  const [notifications, setNotifications] = useState([
    { id: 'nt-1', type: 'critical', text: 'Pértiga aislada en Lote 4 reporta nivel crítico de desgaste.', time: 'Hace 10 min', unread: true },
    { id: 'nt-2', type: 'pending', text: 'Acta ACT-2026-003 requiere firma digital por Supervisor Isaac.', time: 'Hace 1 hora', unread: true },
    { id: 'nt-3', type: 'stock', text: 'EPP: Chaleco reflectivo stock bajo el mínimo en Bodega D5.', time: 'Hace 4 horas', unread: false }
  ]);

  // Load all tables from REST API
  const loadAllData = async (userHeader = null, roleHeader = null) => {
    try {
      const username = userHeader || currentUser?.username || 'anonymous';
      const role = roleHeader || currentRole || 'Guest';

      const headers = {
        'x-username': username,
        'x-user-role': role,
        'Content-Type': 'application/json'
      };

      const token = localStorage.getItem('gridops_auth_token') || authToken;
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Fetch all tables parallel
      const [
        resTecnicos,
        resBrigadas,
        resInventario,
        resTools,
        resActas,
        resReposiciones,
        resSwaps,
        resDevoluciones,
        resAuditoria,
        resKits,
        resUsuarios,
        resSupervisores
      ] = await Promise.all([
        fetch(`${API_BASE}/tecnicos`, { headers }),
        fetch(`${API_BASE}/brigadas`, { headers }),
        fetch(`${API_BASE}/inventario`, { headers }),
        fetch(`${API_BASE}/brigadas/herramientas/todas`, { headers }),
        fetch(`${API_BASE}/actas`, { headers }),
        fetch(`${API_BASE}/reposiciones`, { headers }),
        fetch(`${API_BASE}/swaps`, { headers }),
        fetch(`${API_BASE}/devoluciones`, { headers }),
        fetch(`${API_BASE}/auditoria`, { headers }),
        fetch(`${API_BASE}/kits`, { headers }),
        fetch(`${API_BASE}/usuarios`, { headers }),
        fetch(`${API_BASE}/supervisores`, { headers })
      ]);

      const dataTecnicos = await resTecnicos.json();
      const dataBrigadas = await resBrigadas.json();
      const dataInventario = await resInventario.json();
      const dataTools = await resTools.json();
      const dataActas = await resActas.json();
      const dataReposiciones = await resReposiciones.json();
      const dataSwaps = await resSwaps.json();
      const dataDevoluciones = await resDevoluciones.json();
      const dataAuditoria = await resAuditoria.json();
      const dataKits = await resKits.json();
      const dataUsuarios = await resUsuarios.json();
      const dataSupervisores = await resSupervisores.json();

      if (dataTecnicos.success) setTecnicos(dataTecnicos.tecnicos);
      if (dataBrigadas.success) setBrigadas(dataBrigadas.brigadas);
      if (dataInventario.success) setInventario(dataInventario.inventario);
      if (dataTools.success) setBrigadaHerramientas(dataTools.tools);
      if (dataActas.success) setActas(dataActas.actas);
      if (dataReposiciones.success) setReposiciones(dataReposiciones.reposiciones);
      if (dataSwaps.success) setSwaps(dataSwaps.swaps);
      if (dataDevoluciones.success) setDevoluciones(dataDevoluciones.devoluciones);
      if (dataAuditoria.success) setAuditoria(dataAuditoria.auditoria);
      if (dataKits.success) setKits(dataKits.kits);
      if (dataUsuarios.success) setUsuarios(dataUsuarios.users);
      if (dataSupervisores.success) setSupervisores(dataSupervisores.supervisores);

      // Hardcode relations statically for supervisor tree views
      setCoordinadores([
        { id: 'COORD-001', name: 'William', zone: 'Noroeste Lote 4', campamento: 'Mantenimiento Noroeste' }
      ]);

    } catch (e) {
      console.error('❌ ERROR SINCRONIZANDO CON BASE DE DATOS SQLITE:', e);
    } finally {
      setLoading(false);
    }
  };


  const getHeaders = () => {
    const headers = {
      'Content-Type': 'application/json',
      'x-username': currentUser?.username || 'anonymous',
      'x-user-role': currentRole || 'Guest'
    };
    const token = localStorage.getItem('gridops_auth_token') || authToken;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const readApiResponse = async (response) => {
    let payload = {};
    try {
      payload = await response.json();
    } catch (e) {
      payload = {};
    }

    if (!response.ok || !payload.success) {
      return {
        success: false,
        message: payload.message || `Error HTTP ${response.status}: la operacion no pudo completarse.`
      };
    }

    return payload;
  };

  // Authentication Actions (REST POST)
  const loginUser = async (username, password) => {
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const result = await response.json();
      if (result.success) {
        setAuthToken(result.token);
        localStorage.setItem('gridops_auth_token', result.token);
        setCurrentUser(result.user);
        setCurrentRole(result.user.role);
        // Load initial SQL data
        await loadAllData(result.user.username, result.user.role);
        return true;
      }
      return false;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const logoutUser = async () => {
    try {
      await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ logout: true })
      });
    } catch (e) {}
    setAuthToken(null);
    localStorage.removeItem('gridops_auth_token');
    setCurrentUser(null);
    setCurrentRole(null);
  };

  const changeRole = async (newRole) => {
    setCurrentRole(newRole);
    // Refresh databases matching role authorization levels
    await loadAllData(currentUser?.username, newRole);
  };

  // Deactivate Colaborador (Dar de Baja - SQL UPDATE)
  const darDeBajaColaborador = async (id) => {
    try {
      const response = await fetch(`${API_BASE}/tecnicos/${id}/baja`, {
        method: 'POST',
        headers: getHeaders()
      });
      const res = await readApiResponse(response);
      if (res.success) {
        await loadAllData();
        
        // Push notification
        setNotifications(prev => [
          { id: `nt-${Date.now()}`, type: 'critical', text: `Baja efectuada con éxito en base de datos. Historial conservado.`, time: 'Ahora', unread: true },
          ...prev
        ]);
      }
      return res;
    } catch (e) {
      console.error(e);
      return { success: false, message: e.message };
    }
  };

  // Add / Edit Technical Expediente
  const saveTecnico = async (tech) => {
    try {
      const isNew = !tech.id || tech.id.startsWith('new') || !tecnicos.some(t => t.id === tech.id);
      const url = isNew ? `${API_BASE}/tecnicos` : `${API_BASE}/tecnicos/${tech.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(tech)
      });
      const res = await readApiResponse(response);
      if (res.success) {
        await loadAllData();
      }
      return res;
    } catch (e) {
      console.error(e);
      return { success: false, message: e.message };
    }
  };

  // Assign technicians crew to squad brigade (SQL UPDATE)
  const assignTecnicosToBrigada = async (brigadaCode, selectedTechIds) => {
    try {
      // Map tech primary key IDs to actual integers
      const numericIds = selectedTechIds.map(id => parseInt(id) || id);

      const response = await fetch(`${API_BASE}/brigadas/${brigadaCode}/roster`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ selectedTechIds: numericIds })
      });
      const res = await readApiResponse(response);
      if (res.success) {
        await loadAllData();
      }
      return res;
    } catch (e) {
      console.error(e);
      return { success: false, message: e.message };
    }
  };

  // Modify squad vehicle parameter
  const saveBrigada = async (bData) => {
    try {
      const isNew = bData.isNew || !brigadas.some(b => b.id === bData.id);
      const url = isNew ? `${API_BASE}/brigadas` : `${API_BASE}/brigadas/${bData.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(bData)
      });
      const res = await readApiResponse(response);
      if (res.success) {
        await loadAllData();
      }
      return res;
    } catch (e) {
      console.error(e);
      return { success: false, message: e.message };
    }
  };

  const saveBrigadaTools = async (brigadaCode, toolsList, overrideStock = false) => {
    try {
      const response = await fetch(`${API_BASE}/brigadas/${brigadaCode}/herramientas`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ toolsList, overrideStock })
      });
      const res = await readApiResponse(response);
      if (res.success) {
        await loadAllData();
        return { success: true, message: res.message };
      } else {
        return { success: false, message: res.message, deficits: res.deficits };
      }
    } catch (e) {
      console.error(e);
      return { success: false, message: e.message };
    }
  };

  // Update specific tools state on active squad
  const updateToolState = async (brigadaId, itemCode, newState, observation) => {
    try {
      const response = await fetch(`${API_BASE}/brigadas/${brigadaId}/tools/${itemCode}/state`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ newState, observation })
      });
      const res = await readApiResponse(response);
      if (res.success) {
        await loadAllData();
      }
      return res;
    } catch (e) {
      console.error(e);
      return { success: false, message: e.message };
    }
  };

  // Modify warehouse stock levels (Kárdex adjust)
  const adjustStockItem = async (code, qty, adjustStatus = null) => {
    try {
      const response = await fetch(`${API_BASE}/inventario/adjust`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ code, adjustQty: qty, newStatus: adjustStatus })
      });
      const res = await readApiResponse(response);
      if (res.success) {
        await loadAllData();
      }
      return res;
    } catch (e) {
      console.error(e);
      return { success: false, message: e.message };
    }
  };

  // Create delivery act
  const createActa = async (newActa) => {
    try {
      // Map items structure
      const itemsMap = newActa.items.map(it => ({
        code: it.code,
        qty: it.qty
      }));

      // Extract brigade or tech name
      const destName = newActa.destino.split(': ')[1] || newActa.destino;

      const response = await fetch(`${API_BASE}/actas`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          tipo: newActa.tipo,
          destino: destName,
          items: itemsMap,
          firmado: newActa.firmado,
          signatureData: newActa.signatureData || null
        })
      });
      const res = await readApiResponse(response);
      if (res.success) {
        await loadAllData();
      }
      return res;
    } catch (e) {
      console.error(e);
      return { success: false, message: e.message };
    }
  };

  const firmarActa = async (code, signatureData = null, observaciones = '') => {
    try {
      const response = await fetch(`${API_BASE}/actas/${code}/firmar`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ signatureData, observaciones })
      });
      const res = await readApiResponse(response);
      if (res.success) {
        await loadAllData();
      }
      return res;
    } catch (e) {
      console.error(e);
      return { success: false, message: e.message };
    }
  };

  const addAnnexToActa = async (code, text) => {
    try {
      const response = await fetch(`${API_BASE}/actas/${code}/anexos`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ text })
      });
      const res = await readApiResponse(response);
      if (res.success) {
        await loadAllData();
        return { success: true, message: res.message };
      }
      return { success: false, message: res.message };
    } catch (e) {
      console.error(e);
      return { success: false, message: e.message };
    }
  };

  const anularActa = async (code) => {
    try {
      const response = await fetch(`${API_BASE}/actas/${code}/anular`, {
        method: 'POST',
        headers: getHeaders()
      });
      const res = await readApiResponse(response);
      if (res.success) {
        await loadAllData();
      }
      return res;
    } catch (e) {
      console.error(e);
      return { success: false, message: e.message };
    }
  };

  // Solve replacements tickets
  const resolveReposicion = async (code, decision) => {
    try {
      const response = await fetch(`${API_BASE}/reposiciones/${code}/resolve`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ decision })
      });
      const res = await readApiResponse(response);
      if (res.success) {
        await loadAllData();
      }
      return res;
    } catch (e) {
      console.error(e);
      return { success: false, message: e.message };
    }
  };

  // Swap field tools
  const registerSwap = async (swapData) => {
    try {
      const response = await fetch(`${API_BASE}/swaps`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(swapData)
      });
      const res = await readApiResponse(response);
      if (res.success) {
        await loadAllData();
      }
      return res;
    } catch (e) {
      console.error(e);
      return { success: false, message: e.message };
    }
  };

  // Checkout returns
  const checkoutReturn = async (code, returnedQty, estado, observacion) => {
    try {
      const response = await fetch(`${API_BASE}/devoluciones/${code}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ cantDevuelta: returnedQty, estado, observacion })
      });
      const res = await readApiResponse(response);
      if (res.success) {
        await loadAllData();
      }
      return res;
    } catch (e) {
      console.error(e);
      return { success: false, message: e.message };
    }
  };

  const saveUsuario = async (uData) => {
    // Standard secure profiles manager endpoint helper
    try {
      const response = await fetch(`${API_BASE}/usuarios`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(uData)
      });
      const res = await readApiResponse(response);
      if (res.success) {
        await loadAllData();
      }
      return res;
    } catch (e) {
      console.error(e);
      return { success: false, message: e.message };
    }
  };

  const toggleUsuarioStatus = async (id) => {
    try {
      const response = await fetch(`${API_BASE}/usuarios/${id}/status`, {
        method: 'POST',
        headers: getHeaders()
      });
      const res = await readApiResponse(response);
      if (res.success) {
        await loadAllData();
      }
      return res;
    } catch (e) {
      console.error(e);
      return { success: false, message: e.message };
    }
  };

  const clearNotifications = () => {
    setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
  };

  // Role Filtering selectors based on Hierarchy Rules
  // Developer: ve todo
  // Gerente: ve todo
  // Coordinador (William): ve solo sus supervisores, brigadas, técnicos, zona Lote 4.
  // Supervisor: ve solo sus brigadas, técnicos, herramientas asignadas.
  
  const getFilteredBrigadas = () => {
    if (currentRole === 'Developer' || currentRole === 'Gerente') {
      return brigadas || [];
    }
    if (currentRole === 'Coordinador') {
      return (brigadas || []).filter(b => b && b.zone === 'Noroeste Lote 4');
    }
    if (currentRole?.startsWith('Supervisor')) {
      const matchedSup = (supervisores || []).find(s => {
        if (!s || !s.name || !currentUser || !currentUser.username) return false;
        const sNameLower = s.name.toLowerCase();
        const userLower = currentUser.username.toLowerCase();
        const sFirstWord = s.name.split(' ')[0]?.toLowerCase() || '';
        return sNameLower.includes(userLower) || userLower.includes(sFirstWord);
      });
      const supCode = matchedSup ? matchedSup.id : 'SUP-001';
      return (brigadas || []).filter(b => b && b.supervisorId === supCode);
    }
    return [];
  };

  const getFilteredTecnicos = () => {
    if (currentRole === 'Developer' || currentRole === 'Gerente') {
      return tecnicos || [];
    }
    if (currentRole === 'Coordinador') {
      return (tecnicos || []).filter(t => t && t.coordinatorId === 'COORD-001');
    }
    if (currentRole?.startsWith('Supervisor')) {
      const matchedSup = (supervisores || []).find(s => {
        if (!s || !s.name || !currentUser || !currentUser.username) return false;
        const sNameLower = s.name.toLowerCase();
        const userLower = currentUser.username.toLowerCase();
        const sFirstWord = s.name.split(' ')[0]?.toLowerCase() || '';
        return sNameLower.includes(userLower) || userLower.includes(sFirstWord);
      });
      const supCode = matchedSup ? matchedSup.id : 'SUP-001';
      return (tecnicos || []).filter(t => t && t.supervisorId === supCode);
    }
    return [];
  };

  const getFilteredSupervisores = () => {
    if (currentRole === 'Developer' || currentRole === 'Gerente') {
      return supervisores || [];
    }
    if (currentRole === 'Coordinador') {
      return (supervisores || []).filter(s => s && s.coordinatorId === 'COORD-001');
    }
    if (currentRole?.startsWith('Supervisor')) {
      const matchedSup = (supervisores || []).find(s => {
        if (!s || !s.name || !currentUser || !currentUser.username) return false;
        const sNameLower = s.name.toLowerCase();
        const userLower = currentUser.username.toLowerCase();
        const sFirstWord = s.name.split(' ')[0]?.toLowerCase() || '';
        return sNameLower.includes(userLower) || userLower.includes(sFirstWord);
      });
      const supCode = matchedSup ? matchedSup.id : 'SUP-001';
      return (supervisores || []).filter(s => s && s.id === supCode);
    }
    return [];
  };

  const getFilteredReposiciones = () => {
    if (currentRole === 'Developer' || currentRole === 'Gerente') {
      return reposiciones || [];
    }
    if (currentRole === 'Coordinador') {
      return (reposiciones || []).filter(r => r && r.coordinatorId === 'COORD-001');
    }
    if (currentRole?.startsWith('Supervisor')) {
      const isIsaac = currentUser?.username?.toLowerCase() === 'isaac';
      const matchedSup = (supervisores || []).find(s => {
        if (!s || !s.name || !currentUser || !currentUser.username) return false;
        const sNameLower = s.name.toLowerCase();
        const userLower = currentUser.username.toLowerCase();
        const sFirstWord = s.name.split(' ')[0]?.toLowerCase() || '';
        return sNameLower.includes(userLower) || userLower.includes(sFirstWord);
      });
      const supCode = matchedSup ? matchedSup.id : (isIsaac ? 'SUP-001' : 'SUP-002');
      return (reposiciones || []).filter(r => r && r.supervisorId === supCode);
    }
    return [];
  };

  return (
    <AppContext.Provider value={{
      currentUser,
      currentRole,
      loginUser,
      logoutUser,
      changeRole,
      
      coordinadores,
      supervisores,
      brigadas,
      tecnicos,
      inventario,
      brigadaHerramientas,
      actas,
      reposiciones,
      swaps,
      devoluciones,
      auditoria,
      kits,
      usuarios,
      notifications,
      loading,
      
      clearNotifications,
      darDeBajaColaborador,
      saveTecnico,
      assignTecnicosToBrigada,
      saveBrigada,
      saveBrigadaTools,
      updateToolState,
      adjustStockItem,
      createActa,
      firmarActa,
      anularActa,
      addAnnexToActa,
      resolveReposicion,
      registerSwap,
      checkoutReturn,
      saveUsuario,
      toggleUsuarioStatus,
      
      getFilteredBrigadas,
      getFilteredTecnicos,
      getFilteredSupervisores,
      getFilteredReposiciones
    }}>
      {children}
    </AppContext.Provider>
  );
};
