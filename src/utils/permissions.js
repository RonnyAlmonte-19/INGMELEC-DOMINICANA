/**
 * Fuente única de verdad para permisos granulares y reglas de acceso a módulos UI
 * INGMELEC | ALMACÉN GENERAL v2.1
 *
 * Reglas de seguridad:
 * - Nunca incluye '*' ni el rol 'developer' como opciones otorgables en UI.
 * - Si un usuario no posee el permiso explícito (por defecto [] o ausente), el acceso es denegado.
 */

export const PERMISSION_CATEGORIES = [
  {
    categoria: 'Dashboard y Auditoría',
    items: [
      { key: 'dash:ver', label: 'Ver Dashboard Ejecutivo e indicadores KPI' },
      { key: 'aud:ver', label: 'Ver bitácora de auditoría y cumplimiento' }
    ]
  },
  {
    categoria: 'Inventario de Activos',
    items: [
      { key: 'inv:ver', label: 'Ver catálogo de activos' },
      { key: 'inv:crear', label: 'Registrar nuevos activos' },
      { key: 'inv:editar', label: 'Modificar datos de activos' },
      { key: 'inv:movimientos_registrar', label: 'Registrar movimientos de stock' },
      { key: 'inv:movimientos_ver', label: 'Consultar historial de movimientos' },
      { key: 'inv:eliminar', label: 'Desactivar / retirar activos' }
    ]
  },
  {
    categoria: 'Levantamientos y Auditorías en Campo',
    items: [
      { key: 'lev:ver', label: 'Ver levantamientos de su campamento' },
      { key: 'lev:crear', label: 'Crear nuevas sesiones de levantamiento' },
      { key: 'lev:capturar', label: 'Capturar artículos en levantamiento' },
      { key: 'lev:editar', label: 'Modificar artículos de la auditoría' },
      { key: 'lev:importar', label: 'Importar lotes desde Excel' },
      { key: 'lev:consolidar', label: 'Consolidar levantamiento al maestro' }
    ]
  },
  {
    categoria: 'Reportes y Exportación',
    items: [
      { key: 'rep:ver', label: 'Ver reportes consolidados' },
      { key: 'rep:exportar', label: 'Exportar datos a Excel / CSV' },
      { key: 'rep:imprimir', label: 'Generar impresiones y etiquetas' }
    ]
  },
  {
    categoria: 'Campamentos y Sedes Operativas',
    items: [
      { key: 'camp:ver', label: 'Ver listado de campamentos autorizados' },
      { key: 'camp:stock', label: 'Ver balances y stock de campamento' },
      { key: 'camp:operar', label: 'Gestionar almacenes y bodegas' }
    ]
  },
  {
    categoria: 'Actas de Entrega de Herramientas',
    items: [
      { key: 'act:ver', label: 'Consultar historial de actas de entrega' },
      { key: 'act:crear', label: 'Emitir actas de entrega de herramientas' },
      { key: 'act:anular', label: 'Anular actas de entrega (con motivo y auditoría)' }
    ]
  }
];

export const DEFAULT_ROLE_PERMISSIONS = {
  admin: [
    'dash:ver', 'aud:ver',
    'inv:ver', 'inv:crear', 'inv:editar', 'inv:movimientos_registrar', 'inv:movimientos_ver',
    'lev:ver', 'lev:crear', 'lev:capturar', 'lev:editar', 'lev:importar', 'lev:consolidar',
    'rep:ver', 'rep:exportar', 'rep:imprimir',
    'camp:ver', 'camp:stock', 'camp:operar'
  ],
  almacen: [
    'dash:ver',
    'inv:ver', 'inv:crear', 'inv:movimientos_registrar', 'inv:movimientos_ver',
    'lev:ver', 'lev:crear', 'lev:capturar',
    'camp:ver', 'camp:stock'
  ],
  supervisor: [
    'dash:ver',
    'inv:ver', 'inv:crear', 'inv:editar', 'inv:movimientos_ver',
    'lev:ver', 'lev:crear', 'lev:capturar', 'lev:editar', 'lev:importar', 'lev:consolidar',
    'rep:ver', 'rep:exportar',
    'camp:ver', 'camp:stock'
  ],
  auditor: [
    'dash:ver', 'aud:ver',
    'inv:ver', 'inv:movimientos_ver',
    'lev:ver',
    'rep:ver', 'rep:exportar', 'rep:imprimir',
    'camp:ver', 'camp:stock'
  ],
  gerencia: [
    'dash:ver', 'aud:ver',
    'inv:ver', 'inv:movimientos_ver',
    'lev:ver',
    'rep:ver', 'rep:exportar', 'rep:imprimir',
    'camp:ver', 'camp:stock'
  ]
};

export const MODULE_ACCESS_RULES = {
  dashboard: 'dash:ver',
  inventario: 'inv:ver',
  informatica: 'inv:ver',
  oficinas: 'inv:ver',
  cocina: 'inv:ver',
  almacen: 'inv:ver',
  levantamientos: 'lev:ver',
  ubicaciones: 'camp:ver',
  movimientos: ['inv:movimientos_ver', 'inv:movimientos_registrar'],
  reportes: 'rep:ver',
  auditoria: 'aud:ver',
  usuarios: 'DEV_ONLY'
};

export const MODULE_PAGE_ORDER = [
  'dashboard',
  'inventario',
  'informatica',
  'oficinas',
  'cocina',
  'almacen',
  'levantamientos',
  'ubicaciones',
  'movimientos',
  'reportes',
  'auditoria',
  'usuarios'
];

function extractPermissionArray(user) {
  if (!user || typeof user !== 'object') return [];
  if (Array.isArray(user.permisos)) {
    return user.permisos.filter((p) => typeof p === 'string');
  }
  if (typeof user.permisos === 'string') {
    const trimmed = user.permisos.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.filter((p) => typeof p === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Determina si el usuario corresponde al Desarrollador Principal.
 * @param {object|null|undefined} user
 * @returns {boolean}
 */
export function isDeveloperUser(user) {
  if (!user || typeof user !== 'object') return false;
  return (
    user.rol === 'developer' ||
    user.es_developer === 1 ||
    user.es_developer === true ||
    Number(user.es_developer) === 1
  );
}

/**
 * Verifica si el usuario posee un permiso granular específico.
 * @param {object|null|undefined} user
 * @param {string} permKey
 * @returns {boolean}
 */
export function userHasPermission(user, permKey) {
  if (!user || !permKey) return false;
  if (isDeveloperUser(user)) return true;
  if (permKey === 'DEV_ONLY') return false;
  const perms = extractPermissionArray(user);
  return perms.includes(permKey);
}

/**
 * Verifica si el usuario posee al menos uno de los permisos indicados.
 * @param {object|null|undefined} user
 * @param {string[]} permKeys
 * @returns {boolean}
 */
export function userHasAnyPermission(user, permKeys) {
  if (!user) return false;
  if (isDeveloperUser(user)) return true;
  if (!Array.isArray(permKeys) || permKeys.length === 0) return false;
  return permKeys.some((permKey) => userHasPermission(user, permKey));
}

/**
 * Evalúa si el usuario está autorizado para acceder a un módulo/página UI.
 * @param {object|null|undefined} user
 * @param {string} pageId
 * @returns {boolean}
 */
export function canAccessModule(user, pageId) {
  if (!user || typeof pageId !== 'string') return false;
  const normalizedId = pageId.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(MODULE_ACCESS_RULES, normalizedId)) {
    return false;
  }
  if (isDeveloperUser(user)) return true;
  const requiredPerm = MODULE_ACCESS_RULES[normalizedId];
  if (requiredPerm === 'DEV_ONLY') return false;
  if (Array.isArray(requiredPerm)) {
    return userHasAnyPermission(user, requiredPerm);
  }
  return userHasPermission(user, requiredPerm);
}

/**
 * Retorna el primer módulo autorizado en orden canónico, o 'sin_acceso' si no tiene ninguno.
 * @param {object|null|undefined} user
 * @returns {string}
 */
export function getFirstAuthorizedPage(user) {
  if (!user) return 'sin_acceso';
  for (const pageId of MODULE_PAGE_ORDER) {
    if (canAccessModule(user, pageId)) {
      return pageId;
    }
  }
  return 'sin_acceso';
}
