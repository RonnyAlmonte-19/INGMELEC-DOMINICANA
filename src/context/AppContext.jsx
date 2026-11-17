import { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { toSafeDisplayString } from '../utils/jsonFormat';
import {
  isDeveloperUser,
  userHasPermission,
  userHasAnyPermission,
  canAccessModule as checkModuleAccess
} from '../utils/permissions';

const AppContext = createContext();

export const useApp = () => useContext(AppContext);

const API_V2 = '/api/v2';

export const AppProvider = ({ children }) => {
  // Session State
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('ingmelec_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [authToken, setAuthToken] = useState(() => {
    return localStorage.getItem('ingmelec_token') || null;
  });

  const [activeCampamento, setActiveCampamentoState] = useState(() => {
    try {
      const saved = localStorage.getItem('ingmelec_active_campamento');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const setActiveCampamento = useCallback((camp) => {
    setActiveCampamentoState(camp || null);
    if (camp) {
      localStorage.setItem('ingmelec_active_campamento', JSON.stringify(camp));
    } else {
      localStorage.removeItem('ingmelec_active_campamento');
    }
  }, []);

  const hasPermission = useCallback((permKey) => {
    return userHasPermission(currentUser, permKey);
  }, [currentUser]);

  const hasAnyPermission = useCallback((permKeys) => {
    return userHasAnyPermission(currentUser, permKeys);
  }, [currentUser]);

  const canAccessModule = useCallback((pageId) => {
    return checkModuleAccess(currentUser, pageId);
  }, [currentUser]);

  const [kpis, setKpis] = useState(null);
  const [kpisLoading, setKpisLoading] = useState(false);
  const [campamentosCatalog, setCampamentosCatalog] = useState([]);
  const [entornoInfo, setEntornoInfo] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    const safeMessage = toSafeDisplayString(message, 'Operación completada.');
    setToast({ id: Date.now(), message: safeMessage, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  }, []);

  // Helper for authenticated requests
  const apiFetch = useCallback(async (endpoint, options = {}) => {
    const token = localStorage.getItem('ingmelec_token') || authToken;
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    const res = await fetch(`${API_V2}${endpoint}`, {
      ...options,
      headers
    });

    if (res.status === 401) {
      // Auto logout on unauthorized
      localStorage.removeItem('ingmelec_token');
      localStorage.removeItem('ingmelec_user');
      setAuthToken(null);
      setCurrentUser(null);
      throw new Error('Sesión expirada o no autorizada.');
    }

    const data = await res.json();
    return data;
  }, [authToken]);

  // Login action
  const login = async (email, password) => {
    try {
      const res = await fetch(`${API_V2}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Error al iniciar sesión');
      }

      localStorage.setItem('ingmelec_token', data.token);
      localStorage.setItem('ingmelec_user', JSON.stringify(data.user));
      setAuthToken(data.token);
      setCurrentUser(data.user);

      if (!isDeveloperUser(data.user) && data.user.campamentos && data.user.campamentos.length > 0) {
        const principal = data.user.campamentos.find(c => c.es_principal) || data.user.campamentos[0];
        setActiveCampamento(principal);
      } else {
        setActiveCampamento(null);
      }

      showToast(`¡Bienvenido de nuevo, ${data.user.nombre}!`, 'success');
      return { success: true };
    } catch (err) {
      showToast(err.message, 'error');
      return { success: false, message: err.message };
    }
  };

  // Logout action: notifica al servidor antes de limpiar credenciales locales
  const logout = async () => {
    const token = localStorage.getItem('ingmelec_token') || authToken;
    if (token) {
      let timeoutId = null;
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        if (controller) {
          timeoutId = setTimeout(() => controller.abort(), 3000);
        }
        await fetch(`${API_V2}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          ...(controller ? { signal: controller.signal } : {})
        });
      } catch {
        // Silenciar errores de red/API para nunca bloquear el logout local
      } finally {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
      }
    }

    localStorage.removeItem('ingmelec_token');
    localStorage.removeItem('ingmelec_user');
    localStorage.removeItem('ingmelec_active_campamento');
    setAuthToken(null);
    setCurrentUser(null);
    setActiveCampamento(null);
    setKpis(null);
    setCampamentosCatalog([]);
    setEntornoInfo(null);
    showToast('Sesión cerrada correctamente.', 'info');
  };

  const activeCampamentoId = activeCampamento ? activeCampamento.id : null;

  // Fetch Dashboard KPIs (soporta filtros campamento_id / almacen_id y propagación desde activeCampamento)
  const refreshKpis = useCallback(async (params) => {
    if (!currentUser || !userHasPermission(currentUser, 'dash:ver')) {
      setKpis(null);
      return;
    }
    const isExplicitFilterObj =
      params &&
      typeof params === 'object' &&
      !('nativeEvent' in params) &&
      !('target' in params);

    const effectiveParams = isExplicitFilterObj
      ? {
          campamento_id: params.campamento_id,
          almacen_id: params.almacen_id
        }
      : (activeCampamentoId ? { campamento_id: String(activeCampamentoId) } : {});

    const qsParams = new URLSearchParams();
    if (effectiveParams.campamento_id && effectiveParams.campamento_id !== 'TODOS') {
      qsParams.append('campamento_id', String(effectiveParams.campamento_id));
    }
    if (effectiveParams.almacen_id && effectiveParams.almacen_id !== 'TODOS') {
      qsParams.append('almacen_id', String(effectiveParams.almacen_id));
    }
    const qs = qsParams.toString();

    try {
      setKpisLoading(true);
      const data = await apiFetch(`/dashboard/kpis${qs ? `?${qs}` : ''}`);
      if (data.success) {
        setKpis(data.kpis);
      }
    } catch (err) {
      console.error('Error refreshing KPIs:', err);
    } finally {
      setKpisLoading(false);
    }
  }, [currentUser, activeCampamentoId, apiFetch]);

  // Fetch Campamentos Catalog (sedes reales, almacenes y aliases)
  const refreshCampamentosCatalog = useCallback(async () => {
    if (!currentUser || !userHasPermission(currentUser, 'camp:ver')) {
      setCampamentosCatalog([]);
      return [];
    }
    try {
      const data = await apiFetch('/campamentos');
      if (data?.success && Array.isArray(data.campamentos)) {
        setCampamentosCatalog(data.campamentos);
        return data.campamentos;
      }
      return [];
    } catch (err) {
      console.error('Error refreshing campamentos catalog:', err);
      return [];
    }
  }, [currentUser, apiFetch]);

  // Fetch Entorno Info (PRUEBAS vs PRODUCCIÓN)
  const fetchEntorno = useCallback(async () => {
    if (!currentUser) return;
    try {
      const data = await apiFetch('/config/entorno');
      if (data.success) {
        setEntornoInfo(data);
      }
    } catch (err) {
      console.error('Error fetching entorno info:', err);
    }
  }, [currentUser, apiFetch]);

  useEffect(() => {
    if (currentUser) {
      fetchEntorno();
      refreshCampamentosCatalog();
    }
  }, [currentUser, fetchEntorno, refreshCampamentosCatalog]);

  useEffect(() => {
    if (currentUser) {
      refreshKpis(activeCampamentoId ? { campamento_id: activeCampamentoId } : {});
    }
  }, [currentUser, activeCampamentoId, refreshKpis]);

  // Fetch items with filters and pagination
  const fetchArticulos = useCallback(async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        params.append(k, v);
      }
    });
    return await apiFetch(`/articulos?${params.toString()}`);
  }, [apiFetch]);

  // Get item by ID with full details & movements
  const getArticuloById = useCallback(async (id) => {
    return await apiFetch(`/articulos/${id}`);
  }, [apiFetch]);

  // Update item
  const updateArticulo = useCallback(async (id, data) => {
    const res = await apiFetch(`/articulos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    if (res.success) {
      showToast('Artículo actualizado correctamente.', 'success');
      refreshKpis();
    } else {
      showToast(res.message || 'Error al actualizar', 'error');
    }
    return res;
  }, [apiFetch, refreshKpis, showToast]);

  // Create item
  const createArticulo = useCallback(async (data) => {
    const res = await apiFetch('/articulos', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (res.success) {
      showToast('Artículo registrado exitosamente en MySQL.', 'success');
      refreshKpis();
    } else {
      showToast(res.message || 'Error al registrar', 'error');
    }
    return res;
  }, [apiFetch, refreshKpis, showToast]);

  // Delete/Deactivate item
  const deleteArticulo = useCallback(async (id) => {
    const res = await apiFetch(`/articulos/${id}`, {
      method: 'DELETE'
    });
    if (res.success) {
      showToast('Artículo retirado del inventario activo.', 'info');
      refreshKpis();
    } else {
      showToast(res.message || 'Error al retirar', 'error');
    }
    return res;
  }, [apiFetch, refreshKpis, showToast]);

  // Register movement
  const registrarMovimiento = useCallback(async (movData) => {
    const res = await apiFetch('/movimientos', {
      method: 'POST',
      body: JSON.stringify(movData)
    });
    if (res.success) {
      showToast(`Movimiento de ${movData.tipo_movimiento} registrado con éxito.`, 'success');
      refreshKpis();
    } else {
      showToast(res.message || 'Error en movimiento', 'error');
    }
    return res;
  }, [apiFetch, refreshKpis, showToast]);

  // Fetch movements (acepta limit numérico o objeto { limit, campamento_id })
  const fetchMovimientos = useCallback(async (limitOrParams = 100) => {
    const query = new URLSearchParams();
    if (typeof limitOrParams === 'object' && limitOrParams !== null) {
      const lim = limitOrParams.limit ?? 100;
      query.append('limit', String(lim));
      if (limitOrParams.campamento_id && limitOrParams.campamento_id !== 'TODOS') {
        query.append('campamento_id', String(limitOrParams.campamento_id));
      }
      if (limitOrParams.fecha_desde) query.append('fecha_desde', String(limitOrParams.fecha_desde));
      if (limitOrParams.fecha_hasta) query.append('fecha_hasta', String(limitOrParams.fecha_hasta));
    } else {
      query.append('limit', String(limitOrParams || 100));
    }
    return await apiFetch(`/movimientos?${query.toString()}`);
  }, [apiFetch]);

  // Fetch reports
  const fetchReporteConsolidado = useCallback(async (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString();
    return await apiFetch(`/reportes/consolidado${qs ? `?${qs}` : ''}`);
  }, [apiFetch]);

  // Fetch audit log
  const fetchAuditoria = useCallback(async (limitOrParams = 100) => {
    if (typeof limitOrParams === 'object' && limitOrParams !== null) {
      const q = new URLSearchParams({ limit: String(limitOrParams.limit ?? 100) });
      if (limitOrParams.fecha_desde) q.append('fecha_desde', limitOrParams.fecha_desde);
      if (limitOrParams.fecha_hasta) q.append('fecha_hasta', limitOrParams.fecha_hasta);
      return await apiFetch(`/auditoria?${q.toString()}`);
    }
    return await apiFetch(`/auditoria?limit=${limitOrParams}`);
  }, [apiFetch]);

  // Users management (Exclusivo Developer)
  const fetchUsuarios = useCallback(async () => {
    return await apiFetch('/usuarios');
  }, [apiFetch]);

  const createUsuario = useCallback(async (userData) => {
    const res = await apiFetch('/usuarios', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
    if (res.success) {
      showToast('Usuario creado correctamente.', 'success');
    } else {
      showToast(res.message || 'Error creando usuario', 'error');
    }
    return res;
  }, [apiFetch, showToast]);

  const updateUsuario = useCallback(async (id, userData) => {
    const res = await apiFetch(`/usuarios/${id}`, {
      method: 'PUT',
      body: JSON.stringify(userData)
    });
    if (res.success) {
      showToast('Usuario actualizado correctamente.', 'success');
    } else {
      showToast(res.message || 'Error actualizando usuario', 'error');
    }
    return res;
  }, [apiFetch, showToast]);

  const updateUsuarioEstado = useCallback(async (id, activo) => {
    const res = await apiFetch(`/usuarios/${id}/estado`, {
      method: 'PATCH',
      body: JSON.stringify({ activo })
    });
    if (res.success) {
      showToast(`Usuario ${activo ? 'activado' : 'desactivado'} con éxito.`, 'info');
    } else {
      showToast(res.message || 'Error cambiando estado de usuario', 'error');
    }
    return res;
  }, [apiFetch, showToast]);

  const updateUsuarioPermisos = useCallback(async (id, permisos) => {
    const res = await apiFetch(`/usuarios/${id}/permisos`, {
      method: 'PUT',
      body: JSON.stringify({ permisos })
    });
    if (res.success) {
      showToast('Permisos del usuario actualizados.', 'success');
    } else {
      showToast(res.message || 'Error actualizando permisos', 'error');
    }
    return res;
  }, [apiFetch, showToast]);

  const recoverUsuarioPassword = useCallback(async (id, nuevaPassword) => {
    const res = await apiFetch(`/usuarios/${id}/recuperar`, {
      method: 'POST',
      body: JSON.stringify({ nuevaPassword })
    });
    if (res.success) {
      showToast('Contraseña restablecida exitosamente.', 'success');
    } else {
      showToast(res.message || 'Error restableciendo contraseña', 'error');
    }
    return res;
  }, [apiFetch, showToast]);

  const fetchUsuariosAuditoria = useCallback(async () => {
    return await apiFetch('/usuarios/auditoria');
  }, [apiFetch]);

  // ==========================================
  // CAMPAMENTOS, ALIASES & ALMACENES (AUDITORÍAS)
  // ==========================================
  const fetchCampamentos = useCallback(async () => {
    return await apiFetch('/campamentos');
  }, [apiFetch]);

  const createCampamento = useCallback(async (campData) => {
    const res = await apiFetch('/campamentos', {
      method: 'POST',
      body: JSON.stringify(campData)
    });
    if (res?.success) {
      showToast(toSafeDisplayString(res.message, 'Campamento registrado exitosamente.'), 'success');
      await Promise.all([refreshCampamentosCatalog(), refreshKpis()]);
    } else {
      showToast(toSafeDisplayString(res?.message || res?.error, 'Error al registrar campamento.'), 'error');
    }
    return res;
  }, [apiFetch, showToast, refreshCampamentosCatalog, refreshKpis]);

  const updateCampamento = useCallback(async (id, payload) => {
    const res = await apiFetch(`/campamentos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    if (res?.success) {
      showToast(toSafeDisplayString(res.message, 'Campamento actualizado correctamente.'), 'success');
      await Promise.all([refreshCampamentosCatalog(), refreshKpis()]);
    } else {
      showToast(toSafeDisplayString(res?.message || res?.error, 'Error al actualizar campamento.'), 'error');
    }
    return res;
  }, [apiFetch, showToast, refreshCampamentosCatalog, refreshKpis]);

  const createAlmacen = useCallback(async (campamentoId, almData) => {
    const res = await apiFetch(`/campamentos/${campamentoId}/almacenes`, {
      method: 'POST',
      body: JSON.stringify(almData)
    });
    if (res?.success) {
      showToast(toSafeDisplayString(res.message, 'Almacén/Bodega agregada correctamente.'), 'success');
      await Promise.all([refreshCampamentosCatalog(), refreshKpis()]);
    } else {
      showToast(toSafeDisplayString(res?.message || res?.error, 'Error al agregar almacén.'), 'error');
    }
    return res;
  }, [apiFetch, showToast, refreshCampamentosCatalog, refreshKpis]);

  const fetchCampamentoAliases = useCallback(async () => {
    return await apiFetch('/campamentos/alias');
  }, [apiFetch]);

  const resolverAliasCampamento = useCallback(async (payload) => {
    return await apiFetch('/campamentos/resolver-alias', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }, [apiFetch]);

  const previewReasignacionAlias = useCallback(async (payload) => {
    return await apiFetch('/campamentos/reasignaciones/preview', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }, [apiFetch]);

  const aplicarReasignacionAlias = useCallback(async (payload) => {
    const res = await apiFetch('/campamentos/reasignaciones/aplicar', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res?.success) {
      const count = Number(res.reasignados ?? 0);
      const fallbackMsg = `Reasignación completada: ${count} artículo(s) actualizados sin alterar cantidades.`;
      showToast(toSafeDisplayString(res.message, fallbackMsg), 'success');
      await Promise.all([refreshCampamentosCatalog(), refreshKpis()]);
    } else {
      showToast(toSafeDisplayString(res?.message || res?.error, 'No se pudo completar la reasignación territorial.'), 'error');
    }
    return res;
  }, [apiFetch, showToast, refreshCampamentosCatalog, refreshKpis]);

  // ==========================================
  // LEVANTAMIENTOS Y AUDITORÍAS EN CAMPO
  // ==========================================
  const fetchLevantamientos = useCallback(async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && v !== 'TODOS') {
        params.append(k, v);
      }
    });
    return await apiFetch(`/levantamientos?${params.toString()}`);
  }, [apiFetch]);

  const getLevantamientoById = useCallback(async (id) => {
    return await apiFetch(`/levantamientos/${id}`);
  }, [apiFetch]);

  const createLevantamiento = useCallback(async (data) => {
    const res = await apiFetch('/levantamientos', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (res.success) {
      showToast(`Levantamiento ${res.codigo_levantamiento || res.codigo || ''} iniciado con éxito.`, 'success');
    } else {
      showToast(res.message || 'Error al crear levantamiento.', 'error');
    }
    return res;
  }, [apiFetch, showToast]);

  const updateLevantamiento = useCallback(async (id, data) => {
    const res = await apiFetch(`/levantamientos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    if (res.success) {
      showToast('Datos del levantamiento actualizados.', 'success');
    } else {
      showToast(res.message || 'Error al actualizar levantamiento.', 'error');
    }
    return res;
  }, [apiFetch, showToast]);

  const fetchLevantamientoItems = useCallback(async (levId, filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && v !== 'TODOS') {
        params.append(k, v);
      }
    });
    return await apiFetch(`/levantamientos/${levId}/items?${params.toString()}`);
  }, [apiFetch]);

  const addLevantamientoItem = useCallback(async (levId, itemData) => {
    const res = await apiFetch(`/levantamientos/${levId}/items`, {
      method: 'POST',
      body: JSON.stringify(itemData)
    });
    if (res.success) {
      const rawWarning = res.warning_duplicado || res.advertencia;
      if (rawWarning) {
        const warningText = toSafeDisplayString(rawWarning.mensaje || rawWarning, '');
        showToast(`Artículo guardado con advertencia: ${warningText}`, 'info');
      } else {
        showToast('Artículo registrado en el levantamiento.', 'success');
      }
    } else {
      showToast(res.message || 'Error al registrar artículo.', 'error');
    }
    return res;
  }, [apiFetch, showToast]);

  const updateLevantamientoItem = useCallback(async (levId, itemId, itemData) => {
    const res = await apiFetch(`/levantamientos/${levId}/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(itemData)
    });
    if (res.success) {
      showToast('Artículo actualizado correctamente.', 'success');
    } else {
      showToast(res.message || 'Error al actualizar artículo.', 'error');
    }
    return res;
  }, [apiFetch, showToast]);

  const deleteLevantamientoItem = useCallback(async (levId, itemId) => {
    const res = await apiFetch(`/levantamientos/${levId}/items/${itemId}`, {
      method: 'DELETE'
    });
    if (res.success) {
      showToast('Artículo eliminado del levantamiento.', 'info');
    } else {
      showToast(res.message || 'Error al eliminar artículo.', 'error');
    }
    return res;
  }, [apiFetch, showToast]);

  const importLevantamientoItems = useCallback(async (levId, items) => {
    const res = await apiFetch(`/levantamientos/${levId}/import-items`, {
      method: 'POST',
      body: JSON.stringify({ items })
    });
    if (res.success) {
      showToast(res.message || `${items.length} artículos importados.`, 'success');
    } else {
      showToast(res.message || 'Error al importar artículos.', 'error');
    }
    return res;
  }, [apiFetch, showToast]);

  const consolidarLevantamiento = useCallback(async (levId, payload = {}) => {
    const res = await apiFetch(`/levantamientos/${levId}/consolidar`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res.success) {
      showToast(`¡Consolidación exitosa! ${res.articulos_incorporados} artículos agregados al inventario maestro.`, 'success');
      refreshKpis();
    } else {
      showToast(res.message || 'Error al consolidar levantamiento.', 'error');
    }
    return res;
  }, [apiFetch, refreshKpis, showToast]);

  const fetchLevantamientoConciliacion = useCallback(async (levId) => {
    return await apiFetch(`/levantamientos/${levId}/conciliacion`);
  }, [apiFetch]);

  // Dynamic Catalogs & Auto-coding
  const fetchNextCode = useCallback(async (area) => {
    return await apiFetch(`/articulos/next-code?area=${encodeURIComponent(area || 'ALMACEN')}`);
  }, [apiFetch]);

  const fetchCategorias = useCallback(async (area) => {
    return await apiFetch(`/catalogos/categorias${area ? `?area=${encodeURIComponent(area)}` : ''}`);
  }, [apiFetch]);

  const createCategoria = useCallback(async (payload) => {
    const res = await apiFetch('/catalogos/categorias', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res.success) {
      showToast(`Categoría "${payload.nombre}" agregada al catálogo.`, 'success');
    } else {
      showToast(res.message || 'Error registrando categoría.', 'error');
    }
    return res;
  }, [apiFetch, showToast]);

  const fetchCustodios = useCallback(async (q) => {
    return await apiFetch(`/catalogos/custodios${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  }, [apiFetch]);

  const createCustodio = useCallback(async (payload) => {
    const res = await apiFetch('/catalogos/custodios', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res.success) {
      showToast(`Responsable "${payload.nombre}" agregado al catálogo.`, 'success');
    } else {
      showToast(res.message || 'Error registrando responsable.', 'error');
    }
    return res;
  }, [apiFetch, showToast]);

  const fetchUbicaciones = useCallback(async () => {
    return await apiFetch('/catalogos/ubicaciones');
  }, [apiFetch]);

  // ==========================================
  // v2.2 ACTAS DE ENTREGA DE HERRAMIENTAS
  // ==========================================
  const fetchActasDisponible = useCallback(async () => {
    try {
      const res = await apiFetch('/actas/disponible');
      return Boolean(res?.success && res.enabled);
    } catch {
      return false;
    }
  }, [apiFetch]);

  const crearActaEntrega = useCallback(async (payload) => {
    const res = await apiFetch('/actas', { method: 'POST', body: JSON.stringify(payload) });
    if (res.success) {
      showToast(res.message || 'Acta registrada.', 'success');
      refreshKpis();
    } else {
      showToast(res.message || 'No se pudo registrar el acta.', 'error');
    }
    return res;
  }, [apiFetch, refreshKpis, showToast]);

  const fetchActas = useCallback(async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.append(k, v);
    });
    return await apiFetch(`/actas?${params.toString()}`);
  }, [apiFetch]);

  const fetchActaOpciones = useCallback(async () => apiFetch('/actas/opciones'), [apiFetch]);

  const fetchActaById = useCallback(async (id) => apiFetch(`/actas/${id}`), [apiFetch]);

  const anularActaEntrega = useCallback(async (id, motivo) => {
    const res = await apiFetch(`/actas/${id}/anular`, { method: 'POST', body: JSON.stringify({ motivo }) });
    showToast(res.message || (res.success ? 'Acta anulada.' : 'No se pudo anular el acta.'), res.success ? 'success' : 'error');
    return res;
  }, [apiFetch, showToast]);

  const registrarImpresionActa = useCallback(async (id) => {
    try { return await apiFetch(`/actas/${id}/impresion`, { method: 'POST' }); } catch { return null; }
  }, [apiFetch]);

  return (
    <AppContext.Provider
      value={{
        fetchActasDisponible,
        crearActaEntrega,
        fetchActas,
        fetchActaOpciones,
        fetchActaById,
        anularActaEntrega,
        registrarImpresionActa,
        currentUser,
        currentRole: currentUser?.rol,
        authToken,
        login,
        logout,
        kpis,
        kpisLoading,
        refreshKpis,
        entornoInfo,
        fetchEntorno,
        fetchArticulos,
        getArticuloById,
        updateArticulo,
        createArticulo,
        deleteArticulo,
        registrarMovimiento,
        fetchMovimientos,
        fetchReporteConsolidado,
        fetchAuditoria,
        fetchUsuarios,
        createUsuario,
        updateUsuario,
        updateUsuarioEstado,
        updateUsuarioPermisos,
        recoverUsuarioPassword,
        fetchUsuariosAuditoria,
        activeCampamento,
        setActiveCampamento,
        hasPermission,
        hasAnyPermission,
        canAccessModule,
        isDeveloper: isDeveloperUser(currentUser),
        // Levantamientos & Campamentos
        campamentosCatalog,
        refreshCampamentosCatalog,
        fetchCampamentos,
        createCampamento,
        updateCampamento,
        createAlmacen,
        fetchCampamentoAliases,
        resolverAliasCampamento,
        previewReasignacionAlias,
        aplicarReasignacionAlias,
        fetchLevantamientos,
        getLevantamientoById,
        createLevantamiento,
        updateLevantamiento,
        fetchLevantamientoItems,
        addLevantamientoItem,
        updateLevantamientoItem,
        deleteLevantamientoItem,
        importLevantamientoItems,
        consolidarLevantamiento,
        fetchLevantamientoConciliacion,
        // Dynamic Catalogs & Codes
        fetchNextCode,
        fetchCategorias,
        createCategoria,
        fetchCustodios,
        createCustodio,
        fetchUbicaciones,
        showToast
      }}
    >
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center space-x-3 text-sm font-medium transition-all duration-300 transform translate-y-0 ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white'
              : toast.type === 'error'
              ? 'bg-rose-600 text-white'
              : 'bg-slate-800 text-white'
          }`}
        >
          <span>{toSafeDisplayString(toast.message, 'Operación completada.')}</span>
        </div>
      )}
    </AppContext.Provider>
  );
};
