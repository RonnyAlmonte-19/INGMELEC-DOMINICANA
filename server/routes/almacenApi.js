import express from 'express';
import crypto from 'crypto';
import { getPool } from '../database/db.js';
import { validateAndGetJwtSecret } from '../config/auth.js';

const router = express.Router();

// Centralized and strictly validated JWT secret (fails startup if missing or weak)
const SECRET_KEY = validateAndGetJwtSecret();

// Password Verification
function verifyPassword(password, stored) {
  if (!stored) return false;
  if (!stored.includes(':')) {
    return password === stored;
  }
  const [salt, hash] = stored.split(':');
  const checkHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === checkHash;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

// Canonical Physical States for INGMELEC Enterprise
export const ESTADOS_FISICOS_VALIDOS = ['Bueno', 'Regular', 'Dañado', 'Fuera de servicio', 'Pendiente de verificación'];

export function normalizeEstadoFisico(val) {
  if (!val) return 'Bueno';
  const s = String(val).trim();
  const up = s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[-_]/g, ' ');
  if (up === 'BUENO' || up === 'BUEN ESTADO' || up === 'OPERATIVO') return 'Bueno';
  if (up === 'REGULAR' || up === 'REGULAR ESTADO') return 'Regular';
  if (up.includes('DANAD') || up.includes('AVERIAD') || up.includes('DEFECTUOS')) return 'Dañado';
  if (up.includes('FUERA') || up.includes('INOPERATIV')) return 'Fuera de servicio';
  if (up.includes('PENDIENTE') || up.includes('POR VERIFICAR') || up.includes('POR REVISAR')) return 'Pendiente de verificación';
  const match = ESTADOS_FISICOS_VALIDOS.find(e => e.toLowerCase() === s.toLowerCase());
  return match || 'Bueno';
}

// Normalizer for URL status parameters (e.g., BUENO, DANADO, FUERA_SERVICIO, PENDIENTE)
function normalizeEstadoParam(param) {
  if (!param || param === 'TODOS') return null;
  return normalizeEstadoFisico(param);
}

// Token generation & verification
function generateToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const stringifiedPayload = Buffer.from(JSON.stringify({
    ...payload,
    exp: Date.now() + 48 * 60 * 60 * 1000 // 48h
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET_KEY)
    .update(`${header}.${stringifiedPayload}`)
    .digest('base64url');
  return `${header}.${stringifiedPayload}.${signature}`;
}

function verifyToken(token) {
  try {
    const [header, payload, signature] = token.split('.');
    const expectedSignature = crypto.createHmac('sha256', SECRET_KEY)
      .update(`${header}.${payload}`)
      .digest('base64url');
    if (signature !== expectedSignature) return null;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (decoded.exp < Date.now()) return null;
    return decoded;
  } catch (e) {
    return null;
  }
}

// Middleware: Authenticate JWT with Live Status & Permissions Check
async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (decoded) {
      try {
        const db = getPool();
        const [uRows] = await db.query(
          'SELECT * FROM inv_usuarios WHERE id = ?',
          [decoded.id]
        );
        if (uRows.length === 0 || !uRows[0].activo) {
          return res.status(403).json({
            success: false,
            message: 'Su cuenta ha sido desactivada o suspendida. Acceso revocado.'
          });
        }

        // Live refresh of role & permissions so changes take effect immediately
        decoded.rol = uRows[0].rol;
        decoded.es_developer = uRows[0].es_developer;
        decoded.campamento_id = uRows[0].campamento_id;
        try {
          decoded.permisos = uRows[0].permisos_json
            ? (typeof uRows[0].permisos_json === 'string' ? JSON.parse(uRows[0].permisos_json) : uRows[0].permisos_json)
            : (decoded.rol === 'developer' ? ['*'] : []);
        } catch (e) {
          decoded.permisos = decoded.rol === 'developer' ? ['*'] : [];
        }

        req.user = decoded;
        return next();
      } catch (err) {
        req.user = decoded;
        return next();
      }
    }
  }
  return res.status(401).json({
    success: false,
    message: 'Sesión no válida o expirada. Por favor inicie sesión.'
  });
}

// Middleware: Developer Role Check (Sole Administrator)
function requireDeveloper(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'No autenticado.' });
  }
  if (req.user.rol !== 'developer' && req.user.es_developer !== 1) {
    return res.status(403).json({
      success: false,
      message: 'Acceso denegado: Esta acción está reservada exclusivamente para el Desarrollador Principal.'
    });
  }
  next();
}

// Middleware: Role Check
function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'No autenticado.' });
    }
    // Developer always has role authorization
    if (req.user.rol === 'developer' || req.user.es_developer === 1) {
      return next();
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.rol)) {
      return res.status(403).json({
        success: false,
        message: `Acceso denegado. Se requiere uno de los roles: [${allowedRoles.join(', ')}].`
      });
    }
    next();
  };
}

// Middleware: Granular Permission Check
function requirePermission(permKey) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'No autenticado.' });
    }
    if (req.user.rol === 'developer' || req.user.es_developer === 1) {
      return next(); // Developer has global override
    }
    const perms = req.user.permisos || [];
    if (perms.includes('*') || perms.includes(permKey)) {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: `Acceso denegado: No dispone del permiso necesario (${permKey}).`
    });
  };
}

// Condición SQL unificada para artículos sin serie (Tarea 6: cero divergencias entre módulos)
const SQL_SIN_SERIAL_CONDITION = "(serie_imei IS NULL OR TRIM(serie_imei) = '' OR UPPER(TRIM(serie_imei)) IN ('N/A', 'S/N', 'SIN SERIAL', 'NO APLICA', 'NONE', '-'))";

// Helper: Resolve User Allowed Campamentos Scope
// Regla de Arquitectura: El perfil developer tiene acceso global automático a todos los campamentos.
// Los usuarios operativos únicamente tienen acceso a las sedes asignadas explícitamente por el desarrollador.
// El perfil gerencia puede consultar estadísticas globales según sus permisos si no está restringido a una sede.
async function getUserAllowedCampamentos(db, user) {
  if (user.rol === 'developer' || user.es_developer === 1) {
    return { isGlobal: true, campamentoIds: [], campamentoNombres: [] };
  }

  const [rows] = await db.query(`
    SELECT c.id, c.nombre, c.ubicacion_historica_equivalente
    FROM inv_usuario_campamentos uc
    JOIN inv_campamentos c ON uc.campamento_id = c.id
    WHERE uc.usuario_id = ? AND c.activo = 1
  `, [user.id]);

  let ids = rows.map(r => r.id);
  const nameSet = new Set();
  rows.forEach(r => {
    if (r.nombre) nameSet.add(r.nombre.trim());
    if (r.ubicacion_historica_equivalente) nameSet.add(r.ubicacion_historica_equivalente.trim());
  });

  if (ids.length === 0 && user.campamento_id) {
    const [cRows] = await db.query(
      'SELECT id, nombre, ubicacion_historica_equivalente FROM inv_campamentos WHERE id = ?',
      [user.campamento_id]
    );
    if (cRows.length > 0) {
      ids = [cRows[0].id];
      if (cRows[0].nombre) nameSet.add(cRows[0].nombre.trim());
      if (cRows[0].ubicacion_historica_equivalente) nameSet.add(cRows[0].ubicacion_historica_equivalente.trim());
    }
  }

  if (ids.length === 0 && user.rol === 'gerencia') {
    return { isGlobal: true, campamentoIds: [], campamentoNombres: [] };
  }

  return {
    isGlobal: false,
    campamentoIds: ids,
    campamentoNombres: Array.from(nameSet)
  };
}

// Helper: Audit Logging
async function logAudit(db, { usuario_id, usuario_nombre, accion, entidad, entidad_id, detalles_previos, detalles_nuevos, req }) {
  try {
    const ip = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1') : '127.0.0.1';
    await db.query(
      `INSERT INTO inv_auditoria (usuario_id, usuario_nombre, accion, entidad, entidad_id, detalles_previos, detalles_nuevos, ip_origen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuario_id || null,
        usuario_nombre || 'Sistema',
        accion,
        entidad || 'inv_articulos',
        entidad_id || null,
        detalles_previos ? JSON.stringify(detalles_previos) : null,
        detalles_nuevos ? JSON.stringify(detalles_nuevos) : null,
        ip
      ]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

// Rate limiting de autenticación en memoria contra ataques de fuerza bruta
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_LOGIN_ATTEMPTS = 15; // Máximo 15 intentos por IP en 1 minuto

function rateLimitLogin(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + RATE_LIMIT_WINDOW_MS;
  } else {
    record.count++;
  }
  loginAttempts.set(ip, record);

  if (record.count > MAX_LOGIN_ATTEMPTS) {
    return res.status(429).json({
      success: false,
      message: 'Demasiados intentos de autenticación. Por favor espere un minuto antes de reintentar.'
    });
  }
  next();
}

// ==========================================
// 1. AUTHENTICATION ENDPOINTS
// ==========================================

router.post('/auth/login', rateLimitLogin, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email y contraseña requeridos.' });
    }

    const db = getPool();
    const [rows] = await db.query(
      `SELECT * FROM inv_usuarios WHERE email = ?`,
      [email.trim().toLowerCase()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas.' });
    }

    const user = rows[0];
    if (!user.activo) {
      return res.status(403).json({ success: false, message: 'Su cuenta se encuentra desactivada o suspendida. Contacte al Desarrollador Principal.' });
    }

    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas.' });
    }

    await db.query('UPDATE inv_usuarios SET ultimo_acceso = NOW() WHERE id = ?', [user.id]);

    // Consultar campamentos asignados al usuario
    let userCamps = [];
    try {
      const [cRows] = await db.query(`
        SELECT c.id, c.nombre, c.codigo, c.provincia, uc.es_principal
        FROM inv_usuario_campamentos uc
        JOIN inv_campamentos c ON uc.campamento_id = c.id
        WHERE uc.usuario_id = ? AND c.activo = 1
        ORDER BY uc.es_principal DESC, c.nombre ASC
      `, [user.id]);
      userCamps = cRows;
    } catch (e) {
      userCamps = [];
    }

    if (userCamps.length === 0 && user.campamento_id) {
      const [singleCamp] = await db.query('SELECT id, nombre, codigo, provincia FROM inv_campamentos WHERE id = ?', [user.campamento_id]);
      if (singleCamp.length > 0) {
        userCamps = [{ ...singleCamp[0], es_principal: 1 }];
      }
    }

    let parsedPermisos = [];
    try {
      parsedPermisos = user.permisos_json
        ? (typeof user.permisos_json === 'string' ? JSON.parse(user.permisos_json) : user.permisos_json)
        : (user.rol === 'developer' ? ['*'] : []);
    } catch (e) {
      parsedPermisos = user.rol === 'developer' ? ['*'] : [];
    }

    const activeCampamento = user.rol === 'developer'
      ? { id: null, nombre: 'GENERAL' }
      : (userCamps.length > 0 ? { id: userCamps[0].id, nombre: userCamps[0].nombre } : { id: null, nombre: 'GENERAL' });

    const payload = {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      cargo: user.cargo,
      area: user.area,
      es_developer: user.es_developer,
      campamentos: userCamps,
      activeCampamento,
      permisos: parsedPermisos
    };

    const token = generateToken(payload);
    await logAudit(db, {
      usuario_id: user.id,
      usuario_nombre: user.nombre,
      accion: 'LOGIN_EXITOSO',
      entidad: 'inv_usuarios',
      entidad_id: user.id,
      req
    });

    res.json({
      success: true,
      message: 'Inicio de sesión exitoso.',
      token,
      user: payload
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor al autenticar.' });
  }
});

router.get('/auth/me', requireAuth, async (req, res) => {
  try {
    const db = getPool();
    const [rows] = await db.query(
      `SELECT * FROM inv_usuarios WHERE id = ?`,
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    }
    const user = rows[0];

    let userCamps = [];
    try {
      const [cRows] = await db.query(`
        SELECT c.id, c.nombre, c.codigo, c.provincia, uc.es_principal
        FROM inv_usuario_campamentos uc
        JOIN inv_campamentos c ON uc.campamento_id = c.id
        WHERE uc.usuario_id = ? AND c.activo = 1
        ORDER BY uc.es_principal DESC, c.nombre ASC
      `, [user.id]);
      userCamps = cRows;
    } catch (e) {
      userCamps = [];
    }

    if (userCamps.length === 0 && user.campamento_id) {
      const [singleCamp] = await db.query('SELECT id, nombre, codigo, provincia FROM inv_campamentos WHERE id = ?', [user.campamento_id]);
      if (singleCamp.length > 0) {
        userCamps = [{ ...singleCamp[0], es_principal: 1 }];
      }
    }

    let parsedPermisos = [];
    try {
      parsedPermisos = user.permisos_json
        ? (typeof user.permisos_json === 'string' ? JSON.parse(user.permisos_json) : user.permisos_json)
        : (user.rol === 'developer' ? ['*'] : []);
    } catch (e) {
      parsedPermisos = user.rol === 'developer' ? ['*'] : [];
    }

    const activeCampamento = user.rol === 'developer'
      ? { id: null, nombre: 'GENERAL' }
      : (userCamps.length > 0 ? { id: userCamps[0].id, nombre: userCamps[0].nombre } : { id: null, nombre: 'GENERAL' });

    res.json({
      success: true,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        cargo: user.cargo,
        area: user.area,
        es_developer: user.es_developer,
        campamentos: userCamps,
        activeCampamento,
        permisos: parsedPermisos
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error obteniendo perfil.' });
  }
});

// ==========================================
// CONFIGURACIÓN DE ENTORNO ACTIVO Y FUENTE DE DATOS (TAREA 1 Y TAREA 9)
// ==========================================
router.get('/config/entorno', (req, res) => {
  const host = process.env.DB_HOST || '';
  const port = process.env.DB_PORT || '3306';
  const esPruebas = host.includes('127.0.0.1') || host.includes('localhost') || port === '3308';
  res.json({
    success: true,
    entorno: esPruebas ? 'PRUEBAS' : 'PRODUCCION',
    etiqueta: esPruebas ? 'PRUEBAS — MariaDB Local' : 'PRODUCCIÓN — Clever Cloud',
    esPruebas,
    fuenteActiva: esPruebas
      ? 'Referencia Documental Histórica (Excel 16-Oct-2026: 433 activos reales) en MariaDB Local (:3308) con Capa Sintética Aislada (es_sintetico = 1)'
      : 'Clever Cloud MySQL Productivo',
    estadoCleverCloudReadonly: 'PENDIENTE_USUARIO_READONLY',
    aviso: esPruebas
      ? 'Base Local Aislada (MariaDB :3308): Mostrando 433 activos históricos reales del Excel del 16-Oct-2026 (18 sintéticos de prueba excluidos por defecto). La consulta en vivo de los 434 activos de Clever Cloud requiere habilitar el usuario de solo lectura ingmelec_readonly.'
      : 'Entorno de Producción Oficial conectado a Clever Cloud.'
  });
});

// ==========================================
// 2. DASHBOARD & KPIS (ESTADÍSTICAS CONCILIADAS POR CAMPAMENTO — TAREAS 5, 6, 7)
// ==========================================

router.get('/dashboard/kpis', requireAuth, async (req, res) => {
  try {
    const db = getPool();
    const scope = await getUserAllowedCampamentos(db, req.user);
    const { campamento_id, almacen_id, incluir_sinteticos, sin_sede } = req.query;
    const includeSynthetic = incluir_sinteticos === 'true';

    let whereArt = 'WHERE activo = 1';
    const paramsArt = [];

    // Regla Tarea 7: Los datos sintéticos nunca se muestran como registros empresariales por defecto
    if (!includeSynthetic) {
      whereArt += ' AND es_sintetico = 0';
    }

    if (!scope.isGlobal) {
      if (campamento_id && campamento_id !== 'TODOS') {
        if (campamento_id === 'SIN_SEDE') {
          return res.status(403).json({ success: false, message: 'Acceso denegado a registros sin sede verificada.' });
        }
        const reqCid = parseInt(campamento_id);
        if (!scope.campamentoIds.includes(reqCid)) {
          return res.status(403).json({ success: false, message: 'Acceso denegado a la sede solicitada.' });
        }
        whereArt += ' AND campamento_id = ?';
        paramsArt.push(reqCid);
      } else if (scope.campamentoIds.length > 0 && scope.campamentoNombres.length > 0) {
        whereArt += ' AND (campamento_id IN (?) OR ubicacion_nombre IN (?))';
        paramsArt.push(scope.campamentoIds, scope.campamentoNombres);
      } else if (scope.campamentoIds.length > 0) {
        whereArt += ' AND campamento_id IN (?)';
        paramsArt.push(scope.campamentoIds);
      } else if (scope.campamentoNombres.length > 0) {
        whereArt += ' AND ubicacion_nombre IN (?)';
        paramsArt.push(scope.campamentoNombres);
      } else {
        whereArt += ' AND 1 = 0';
      }
    } else {
      // Alcance Global (Developer / Gerencia): Soporte de filtrado por Campamento confirmado o SIN_SEDE
      if (sin_sede === 'true' || campamento_id === 'SIN_SEDE') {
        whereArt += ' AND campamento_id IS NULL';
      } else if (campamento_id && campamento_id !== 'TODOS') {
        const reqCid = parseInt(campamento_id);
        if (!isNaN(reqCid)) {
          whereArt += ' AND campamento_id = ?';
          paramsArt.push(reqCid);
        }
      }
      if (almacen_id && almacen_id !== 'TODOS') {
        whereArt += ' AND almacen_id = ?';
        paramsArt.push(parseInt(almacen_id));
      }
    }

    // 1. Total count, Known Physical Quantity, and Pending Quantities (Tarea 6)
    const [totalRes] = await db.query(
      `SELECT
         COUNT(*) as total,
         SUM(COALESCE(cantidad_num, 0)) as total_fisico,
         SUM(CASE WHEN cantidad_num IS NULL OR cantidad_verificada = 0 THEN 1 ELSE 0 END) as sin_cantidad,
         SUM(CASE WHEN estado_fisico = 'Pendiente de verificación' THEN 1 ELSE 0 END) as estado_pendiente
       FROM inv_articulos ${whereArt}`,
      paramsArt
    );
    const totalArticulos = totalRes[0].total || 0;
    const cantidadFisicaTotal = parseFloat(totalRes[0].total_fisico || 0);
    const articulosSinCantidad = parseInt(totalRes[0].sin_cantidad || 0);
    const articulosEstadoPendiente = parseInt(totalRes[0].estado_pendiente || 0);

    // 2. Count & Physical Units by Area
    const [areaRes] = await db.query(`
      SELECT area,
             COUNT(*) as count,
             SUM(COALESCE(cantidad_num, 0)) as total_fisico,
             SUM(CASE WHEN cantidad_num IS NULL OR cantidad_verificada = 0 THEN 1 ELSE 0 END) as sin_cantidad
      FROM inv_articulos
      ${whereArt}
      GROUP BY area
    `, paramsArt);
    const porArea = { INFORMATICA: 0, OFICINAS: 0, COCINA: 0, ALMACEN: 0 };
    const unidadesPorArea = { INFORMATICA: 0, OFICINAS: 0, COCINA: 0, ALMACEN: 0 };
    const sinCantidadPorArea = { INFORMATICA: 0, OFICINAS: 0, COCINA: 0, ALMACEN: 0 };
    areaRes.forEach(r => {
      if (r.area) {
        porArea[r.area] = r.count;
        unidadesPorArea[r.area] = parseFloat(r.total_fisico || 0);
        sinCantidadPorArea[r.area] = parseInt(r.sin_cantidad || 0);
      }
    });

    // 3. Physical State by Area breakdown
    const [areaEstadoRes] = await db.query(`
      SELECT area, estado_fisico, COUNT(*) as count
      FROM inv_articulos
      ${whereArt}
      GROUP BY area, estado_fisico
    `, paramsArt);
    const estadosPorArea = { INFORMATICA: {}, OFICINAS: {}, COCINA: {}, ALMACEN: {} };
    areaEstadoRes.forEach(r => {
      if (estadosPorArea[r.area]) {
        estadosPorArea[r.area][r.estado_fisico] = r.count;
      }
    });

    // 4. Count by Estado Físico
    const [estadoRes] = await db.query(`
      SELECT estado_fisico, COUNT(*) as count
      FROM inv_articulos
      ${whereArt}
      GROUP BY estado_fisico
    `, paramsArt);
    const porEstado = {
      'Bueno': 0,
      'Regular': 0,
      'Dañado': 0,
      'Fuera de servicio': 0,
      'Pendiente de verificación': 0
    };
    estadoRes.forEach(r => { porEstado[r.estado_fisico] = r.count; });

    // 5. Total Campamentos Confirmados, Pendientes de Validación y Sintéticos (Tareas 2 y 3)
    let totalCampamentos = 0;
    let totalCampamentosPendientesValidacion = 0;
    let totalCampamentosSinteticos = 0;
    try {
      const [tc] = await db.query(`
        SELECT
          SUM(CASE WHEN clasificacion_sede = 'CONFIRMADO' AND es_sintetico = 0 THEN 1 ELSE 0 END) as confirmados,
          SUM(CASE WHEN clasificacion_sede = 'PENDIENTE_VALIDACION' AND es_sintetico = 0 THEN 1 ELSE 0 END) as pendientes_validacion,
          SUM(CASE WHEN es_sintetico = 1 THEN 1 ELSE 0 END) as sinteticos
        FROM inv_campamentos WHERE activo = 1
      `);
      totalCampamentos = parseInt(tc[0]?.confirmados || 0);
      totalCampamentosPendientesValidacion = parseInt(tc[0]?.pendientes_validacion || 0);
      totalCampamentosSinteticos = parseInt(tc[0]?.sinteticos || 0);
    } catch (e) {
      totalCampamentos = 0;
    }

    let totalAlmacenes = 0;
    try {
      const [ta] = await db.query(`
        SELECT COUNT(*) as total FROM inv_almacenes
        WHERE activo = 1 AND es_sintetico = 0 AND estado_verificacion = 'CONFIRMADO'
      `);
      totalAlmacenes = ta[0].total;
    } catch (e) {
      totalAlmacenes = 0;
    }

    // 6. Artículos sin serial identificable (Condición SQL unificada)
    let articulosSinSerial = 0;
    try {
      const [sinSerRes] = await db.query(`
        SELECT COUNT(*) as total FROM inv_articulos
        ${whereArt} AND ${SQL_SIN_SERIAL_CONDITION}
      `, paramsArt);
      articulosSinSerial = sinSerRes[0].total;
    } catch (e) {
      articulosSinSerial = 0;
    }

    // 7. Artículos pendientes de verificación (Cantidad NULL/no verificada O Estado Pendiente)
    let articulosPendientesVerificacion = 0;
    try {
      const [pendRes] = await db.query(`
        SELECT COUNT(*) as total FROM inv_articulos
        ${whereArt} AND (cantidad_num IS NULL OR cantidad_verificada = 0 OR estado_fisico = 'Pendiente de verificación')
      `, paramsArt);
      articulosPendientesVerificacion = pendRes[0].total;
    } catch (e) {
      articulosPendientesVerificacion = 0;
    }

    // 8. Levantamientos: en proceso y finalizados (excluyendo sintéticos por defecto)
    let levantamientosEnProceso = 0;
    let levantamientosFinalizados = 0;
    try {
      const levSyntFilter = includeSynthetic ? '' : 'WHERE es_sintetico = 0';
      const [lCounts] = await db.query(`
        SELECT
          SUM(CASE WHEN estado NOT IN ('Finalizado', 'Cancelado') THEN 1 ELSE 0 END) as en_proceso,
          SUM(CASE WHEN estado = 'Finalizado' THEN 1 ELSE 0 END) as finalizados
        FROM inv_levantamientos
        ${levSyntFilter}
      `);
      levantamientosEnProceso = parseInt(lCounts[0]?.en_proceso || 0);
      levantamientosFinalizados = parseInt(lCounts[0]?.finalizados || 0);
    } catch (e) {
      levantamientosEnProceso = 0;
      levantamientosFinalizados = 0;
    }

    // 9. Quantities grouped by unit of measure
    const [unidadesRes] = await db.query(`
      SELECT unidad_medida,
             COUNT(*) as registros,
             SUM(COALESCE(cantidad_num, 0)) as total_cantidad,
             SUM(CASE WHEN cantidad_num IS NULL OR cantidad_verificada = 0 THEN 1 ELSE 0 END) as pendientes_verificacion
      FROM inv_articulos
      ${whereArt}
      GROUP BY unidad_medida
      ORDER BY registros DESC
    `, paramsArt);

    // 10. Locations summary
    const [ubicacionesRes] = await db.query(`
      SELECT ubicacion_nombre,
             COUNT(*) as count,
             SUM(COALESCE(cantidad_num, 0)) as total_fisico,
             SUM(CASE WHEN cantidad_num IS NULL OR cantidad_verificada = 0 THEN 1 ELSE 0 END) as sin_cantidad
      FROM inv_articulos
      ${whereArt}
      GROUP BY ubicacion_nombre
      ORDER BY count DESC
    `, paramsArt);

    // 11. Top categories
    const [catRes] = await db.query(`
      SELECT categoria, area, COUNT(*) as count
      FROM inv_articulos
      ${whereArt}
      GROUP BY categoria, area
      ORDER BY count DESC
      LIMIT 10
    `, paramsArt);

    // 12. Recent movements scoped (excluyendo sintéticos por defecto)
    let movQuery = `
      SELECT m.*, a.articulo_nombre, a.codigo_original, a.area
      FROM inv_movimientos m
      JOIN inv_articulos a ON m.articulo_id = a.id
    `;
    const movConds = [];
    const movParams = [];
    if (!includeSynthetic) {
      movConds.push('m.es_sintetico = 0 AND a.es_sintetico = 0');
    }
    if (!scope.isGlobal) {
      if (scope.campamentoNombres.length > 0 || scope.campamentoIds.length > 0) {
        const subConds = [];
        if (scope.campamentoIds.length > 0) {
          subConds.push('a.campamento_id IN (?)');
          movParams.push(scope.campamentoIds);
        }
        if (scope.campamentoNombres.length > 0) {
          subConds.push('m.ubicacion_origen IN (?) OR m.ubicacion_destino IN (?) OR a.ubicacion_nombre IN (?)');
          movParams.push(scope.campamentoNombres, scope.campamentoNombres, scope.campamentoNombres);
        }
        movConds.push(`(${subConds.join(' OR ')})`);
      } else {
        movConds.push('1 = 0');
      }
    }
    if (movConds.length > 0) {
      movQuery += ` WHERE ${movConds.join(' AND ')}`;
    }
    movQuery += ' ORDER BY m.fecha_movimiento DESC LIMIT 6';
    const [movsRes] = await db.query(movQuery, movParams);

    // 13. INVENTARIO POR CAMPAMENTO (TAREA 5: Los 13 indicadores obligatorios por campamento confirmado)
    let porCampamento = [];
    let sinSedeVerificada = null;
    let campamentosPendientesValidacion = [];
    let porAlmacen = [];
    let levantamientosResumen = [];

    try {
      let campWhere = "WHERE c.activo = 1 AND c.clasificacion_sede = 'CONFIRMADO'";
      if (!includeSynthetic) {
        campWhere += ' AND c.es_sintetico = 0';
      }
      const campParams = [];
      if (!scope.isGlobal) {
        if (scope.campamentoIds.length > 0) {
          campWhere += ' AND c.id IN (?)';
          campParams.push(scope.campamentoIds);
        } else {
          campWhere += ' AND 1 = 0';
        }
      }

      const artSyntJoin = includeSynthetic ? '' : 'AND a.es_sintetico = 0';
      const levSyntSub = includeSynthetic ? '' : 'AND es_sintetico = 0';

      const [cRes] = await db.query(`
        SELECT
          c.id, c.nombre, c.codigo, c.provincia, c.direccion, c.responsable,
          c.clasificacion_sede, c.ubicacion_historica_equivalente, c.origen_registro,
          (SELECT COUNT(*) FROM inv_almacenes WHERE campamento_id = c.id AND activo = 1 ${includeSynthetic ? '' : 'AND es_sintetico = 0'}) as cantidad_almacenes,
          COUNT(a.id) as total_articulos,
          SUM(COALESCE(a.cantidad_num, 0)) as total_fisico,
          SUM(CASE WHEN a.id IS NOT NULL AND (a.cantidad_num IS NULL OR a.cantidad_verificada = 0) THEN 1 ELSE 0 END) as articulos_sin_cantidad,
          SUM(CASE WHEN a.area = 'INFORMATICA' THEN 1 ELSE 0 END) as dep_informatica,
          SUM(CASE WHEN a.area = 'OFICINAS' THEN 1 ELSE 0 END) as dep_oficinas,
          SUM(CASE WHEN a.area = 'COCINA' THEN 1 ELSE 0 END) as dep_cocina,
          SUM(CASE WHEN a.area = 'ALMACEN' THEN 1 ELSE 0 END) as dep_almacen,
          SUM(CASE WHEN a.estado_fisico = 'Bueno' THEN 1 ELSE 0 END) as buenos,
          SUM(CASE WHEN a.estado_fisico = 'Regular' THEN 1 ELSE 0 END) as regulares,
          SUM(CASE WHEN a.estado_fisico = 'Dañado' THEN 1 ELSE 0 END) as danados,
          SUM(CASE WHEN a.estado_fisico = 'Fuera de servicio' THEN 1 ELSE 0 END) as fuera_servicio,
          SUM(CASE WHEN a.estado_fisico = 'Pendiente de verificación' THEN 1 ELSE 0 END) as estado_pendiente,
          SUM(CASE WHEN a.id IS NOT NULL AND (a.estado_fisico = 'Pendiente de verificación' OR a.cantidad_num IS NULL OR a.cantidad_verificada = 0) THEN 1 ELSE 0 END) as pendientes_verificacion,
          SUM(CASE WHEN a.id IS NOT NULL AND (a.serie_imei IS NULL OR TRIM(a.serie_imei) = '' OR UPPER(TRIM(a.serie_imei)) IN ('N/A', 'S/N', 'SIN SERIAL', 'NO APLICA', 'NONE', '-')) THEN 1 ELSE 0 END) as sin_serie,
          (SELECT COUNT(*) FROM inv_levantamientos WHERE campamento_id = c.id AND estado NOT IN ('Finalizado', 'Cancelado') ${levSyntSub}) as levantamientos_abiertos,
          (SELECT COUNT(*) FROM inv_levantamientos WHERE campamento_id = c.id AND estado = 'Finalizado' ${levSyntSub}) as levantamientos_finalizados
        FROM inv_campamentos c
        LEFT JOIN inv_articulos a ON a.campamento_id = c.id AND a.activo = 1 ${artSyntJoin}
        ${campWhere}
        GROUP BY c.id, c.nombre, c.codigo, c.provincia, c.direccion, c.responsable, c.clasificacion_sede, c.ubicacion_historica_equivalente, c.origen_registro
        ORDER BY c.id ASC
      `, campParams);

      porCampamento = cRes.map(r => ({
        ...r,
        cantidad_almacenes: parseInt(r.cantidad_almacenes || 0),
        total_articulos: parseInt(r.total_articulos || 0),
        total_fisico: parseFloat(r.total_fisico || 0),
        articulos_sin_cantidad: parseInt(r.articulos_sin_cantidad || 0),
        por_departamento: {
          INFORMATICA: parseInt(r.dep_informatica || 0),
          OFICINAS: parseInt(r.dep_oficinas || 0),
          COCINA: parseInt(r.dep_cocina || 0),
          ALMACEN: parseInt(r.dep_almacen || 0)
        },
        buenos: parseInt(r.buenos || 0),
        regulares: parseInt(r.regulares || 0),
        danados: parseInt(r.danados || 0),
        fuera_servicio: parseInt(r.fuera_servicio || 0),
        estado_pendiente: parseInt(r.estado_pendiente || 0),
        pendientes_verificacion: parseInt(r.pendientes_verificacion || 0),
        sin_serie: parseInt(r.sin_serie || 0),
        levantamientos_abiertos: parseInt(r.levantamientos_abiertos || 0),
        levantamientos_finalizados: parseInt(r.levantamientos_finalizados || 0)
      }));

      // 13.1. SECCIÓN SIN SEDE VERIFICADA (TAREA 5: Artículos con sede ambigua o pendiente de clasificación, ej. KM 19 AUT DUARTE)
      if (scope.isGlobal) {
        const [sinSedeRows] = await db.query(`
          SELECT
            COUNT(*) as total_articulos,
            SUM(COALESCE(cantidad_num, 0)) as total_fisico,
            SUM(CASE WHEN cantidad_num IS NULL OR cantidad_verificada = 0 THEN 1 ELSE 0 END) as articulos_sin_cantidad,
            SUM(CASE WHEN area = 'INFORMATICA' THEN 1 ELSE 0 END) as dep_informatica,
            SUM(CASE WHEN area = 'OFICINAS' THEN 1 ELSE 0 END) as dep_oficinas,
            SUM(CASE WHEN area = 'COCINA' THEN 1 ELSE 0 END) as dep_cocina,
            SUM(CASE WHEN area = 'ALMACEN' THEN 1 ELSE 0 END) as dep_almacen,
            SUM(CASE WHEN estado_fisico = 'Bueno' THEN 1 ELSE 0 END) as buenos,
            SUM(CASE WHEN estado_fisico = 'Regular' THEN 1 ELSE 0 END) as regulares,
            SUM(CASE WHEN estado_fisico = 'Dañado' THEN 1 ELSE 0 END) as danados,
            SUM(CASE WHEN estado_fisico = 'Fuera de servicio' THEN 1 ELSE 0 END) as fuera_servicio,
            SUM(CASE WHEN estado_fisico = 'Pendiente de verificación' THEN 1 ELSE 0 END) as estado_pendiente,
            SUM(CASE WHEN estado_fisico = 'Pendiente de verificación' OR cantidad_num IS NULL OR cantidad_verificada = 0 THEN 1 ELSE 0 END) as pendientes_verificacion,
            SUM(CASE WHEN ${SQL_SIN_SERIAL_CONDITION} THEN 1 ELSE 0 END) as sin_serie
          FROM inv_articulos
          WHERE activo = 1 AND campamento_id IS NULL ${includeSynthetic ? '' : 'AND es_sintetico = 0'}
        `);
        const sr = sinSedeRows[0] || {};
        sinSedeVerificada = {
          id: 'SIN_SEDE',
          nombre: 'SIN SEDE VERIFICADA (PENDIENTE DE CLASIFICACIÓN)',
          codigo: 'PEND-SEDE',
          ubicacion_historica: 'KM 19 AUT DUARTE',
          motivo: 'Ubicación histórica general en hojas INFORMATICA (61) y OFICINAS (43). Prohibido reasignar automáticamente a OPL o Mantenimiento 633 sin confirmación individual.',
          cantidad_almacenes: null,
          total_articulos: parseInt(sr.total_articulos || 0),
          total_fisico: parseFloat(sr.total_fisico || 0),
          articulos_sin_cantidad: parseInt(sr.articulos_sin_cantidad || 0),
          por_departamento: {
            INFORMATICA: parseInt(sr.dep_informatica || 0),
            OFICINAS: parseInt(sr.dep_oficinas || 0),
            COCINA: parseInt(sr.dep_cocina || 0),
            ALMACEN: parseInt(sr.dep_almacen || 0)
          },
          buenos: parseInt(sr.buenos || 0),
          regulares: parseInt(sr.regulares || 0),
          danados: parseInt(sr.danados || 0),
          fuera_servicio: parseInt(sr.fuera_servicio || 0),
          estado_pendiente: parseInt(sr.estado_pendiente || 0),
          pendientes_verificacion: parseInt(sr.pendientes_verificacion || 0),
          sin_serie: parseInt(sr.sin_serie || 0),
          levantamientos_abiertos: 0,
          levantamientos_finalizados: 0
        };

        // 13.2. Campamentos registrados en BD pero pendientes de validación (San Cristóbal, Azua, Pedernales)
        const [pendCamps] = await db.query(`
          SELECT c.id, c.nombre, c.codigo, c.provincia, c.responsable, c.clasificacion_sede, c.origen_registro,
            (SELECT COUNT(*) FROM inv_almacenes WHERE campamento_id = c.id AND activo = 1 AND es_sintetico = 0) as cantidad_almacenes
          FROM inv_campamentos c
          WHERE c.activo = 1 AND c.clasificacion_sede = 'PENDIENTE_VALIDACION' AND c.es_sintetico = 0
          ORDER BY c.id ASC
        `);
        campamentosPendientesValidacion = pendCamps.map(pc => ({
          ...pc,
          estado_inventario: 'SIN VINCULAR / PENDIENTE DE VALIDACIÓN FÍSICA (No respaldado en Excel 16-Oct-2026)'
        }));
      }
    } catch (e) {
      console.error('Error calculando inventario por campamento:', e);
      porCampamento = [];
    }

    try {
      const almSyntFilter = includeSynthetic ? '' : 'AND a.es_sintetico = 0';
      const artSyntFilter = includeSynthetic ? '' : 'AND art.es_sintetico = 0';
      const [aRes] = await db.query(`
        SELECT a.id, a.nombre, a.campamento_id, a.estado_verificacion, c.nombre as campamento_nombre,
               COUNT(art.id) as total_articulos,
               SUM(COALESCE(art.cantidad_num, 0)) as total_fisico
        FROM inv_almacenes a
        LEFT JOIN inv_campamentos c ON a.campamento_id = c.id
        LEFT JOIN inv_articulos art ON (art.almacen_id = a.id) AND art.activo = 1 ${artSyntFilter}
        WHERE a.activo = 1 ${almSyntFilter}
        GROUP BY a.id, a.nombre, a.campamento_id, a.estado_verificacion, c.nombre
        ORDER BY total_articulos DESC, a.id ASC
      `);
      porAlmacen = aRes;
    } catch (e) {
      porAlmacen = [];
    }

    try {
      const levSyntFilter = includeSynthetic ? '' : 'WHERE l.es_sintetico = 0';
      const [lRes] = await db.query(`
        SELECT l.id, l.codigo_levantamiento, l.titulo, l.estado, c.nombre as campamento_nombre,
               (SELECT COUNT(*) FROM inv_levantamiento_items WHERE levantamiento_id = l.id) as items_capturados
        FROM inv_levantamientos l
        JOIN inv_campamentos c ON l.campamento_id = c.id
        ${levSyntFilter}
        ORDER BY l.id DESC LIMIT 5
      `);
      levantamientosResumen = lRes;
    } catch (e) {
      levantamientosResumen = [];
    }

    // 14. Consistencia Matemática Global (Tarea 6)
    const sumaArticulosCampamentosConfirmados = porCampamento.reduce((acc, c) => acc + c.total_articulos, 0);
    const articulosSinSedeCount = sinSedeVerificada ? sinSedeVerificada.total_articulos : 0;
    const sumaUnidadesCampamentosConfirmados = porCampamento.reduce((acc, c) => acc + c.total_fisico, 0);
    const unidadesSinSedeCount = sinSedeVerificada ? sinSedeVerificada.total_fisico : 0;

    const consistenciaMatematica = {
      totalGeneralArticulos: sumaArticulosCampamentosConfirmados + articulosSinSedeCount,
      sumaArticulosCampamentosConfirmados,
      articulosSinSedeVerificada: articulosSinSedeCount,
      cuadraArticulos: (!campamento_id || campamento_id === 'TODOS')
        ? (totalArticulos === sumaArticulosCampamentosConfirmados + articulosSinSedeCount)
        : true,
      totalUnidadesFisicasConocidas: sumaUnidadesCampamentosConfirmados + unidadesSinSedeCount,
      sumaUnidadesCampamentosConfirmados,
      unidadesSinSedeVerificada: unidadesSinSedeCount,
      cuadraUnidades: (!campamento_id || campamento_id === 'TODOS')
        ? (Math.abs(cantidadFisicaTotal - (sumaUnidadesCampamentosConfirmados + unidadesSinSedeCount)) < 0.01)
        : true,
      totalArticulosCantidadPendiente: articulosSinCantidad,
      totalArticulosEstadoPendiente: articulosEstadoPendiente
    };

    // 15. Resumen de Capa Sintética Aislada (Tarea 7)
    let resumenSinteticos = { articulos: 0, campamentos: totalCampamentosSinteticos, almacenes: 0, levantamientos: 0 };
    try {
      const [[sArt]] = await db.query('SELECT COUNT(*) as c FROM inv_articulos WHERE activo = 1 AND es_sintetico = 1');
      const [[sAlm]] = await db.query('SELECT COUNT(*) as c FROM inv_almacenes WHERE activo = 1 AND es_sintetico = 1');
      const [[sLev]] = await db.query('SELECT COUNT(*) as c FROM inv_levantamientos WHERE es_sintetico = 1');
      resumenSinteticos = {
        articulos: sArt?.c || 0,
        campamentos: totalCampamentosSinteticos,
        almacenes: sAlm?.c || 0,
        levantamientos: sLev?.c || 0
      };
    } catch (e) {}

    res.json({
      success: true,
      kpis: {
        totalArticulos,
        cantidadFisicaTotal,
        articulosSinCantidad,
        articulosEstadoPendiente,
        totalCampamentos,
        totalCampamentosPendientesValidacion,
        totalCampamentosSinteticos,
        totalAlmacenes,
        porArea,
        unidadesPorArea,
        sinCantidadPorArea,
        estadosPorArea,
        porEstado,
        unidades: unidadesRes,
        ubicaciones: ubicacionesRes,
        topCategorias: catRes,
        recientesMovimientos: movsRes,
        porCampamento,
        sinSedeVerificada,
        campamentosPendientesValidacion,
        consistenciaMatematica,
        resumenSinteticos,
        porAlmacen,
        levantamientosEnProceso,
        levantamientosFinalizados,
        articulosSinSerial,
        articulosPendientesVerificacion,
        levantamientosResumen
      }
    });
  } catch (error) {
    console.error('Dashboard KPIs error:', error);
    res.status(500).json({ success: false, message: 'Error consultando métricas del dashboard.' });
  }
});

// ==========================================
// 3. ARTICULOS / INVENTORY ENDPOINTS
// ==========================================

const AREA_PREFIX_MAP = {
  'ALMACEN': 'HER',
  'INFORMATICA': 'INF',
  'OFICINAS': 'MOB',
  'COCINA': 'COC'
};

async function generateNextCodeForArea(db, area) {
  const normArea = (area || 'ALMACEN').toUpperCase().trim();
  const prefix = AREA_PREFIX_MAP[normArea] || 'ACT';

  // Buscar códigos existentes en inv_articulos que comiencen con el prefijo
  const [rows] = await db.query(
    'SELECT codigo_original FROM inv_articulos WHERE codigo_original LIKE ?',
    [`${prefix}%`]
  );

  let maxNum = 0;
  for (const r of rows) {
    if (!r.codigo_original) continue;
    const matches = r.codigo_original.match(/\d+/g);
    if (matches) {
      for (const m of matches) {
        const num = parseInt(m, 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  }

  // Comprobar también en levantamientos activos para evitar colisiones
  try {
    const [auditRows] = await db.query(
      'SELECT codigo_original FROM inv_levantamiento_items WHERE codigo_original LIKE ?',
      [`${prefix}%`]
    );
    for (const r of auditRows) {
      if (!r.codigo_original) continue;
      const matches = r.codigo_original.match(/\d+/g);
      if (matches) {
        for (const m of matches) {
          const num = parseInt(m, 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      }
    }
  } catch (e) {
    // Si no está disponible la tabla, continuar
  }

  let nextNum = maxNum + 1;
  let candidate = `${prefix}-${String(nextNum).padStart(3, '0')}`;

  // Verificar que el candidato no exista previamente
  while (true) {
    const [check] = await db.query(
      'SELECT id FROM inv_articulos WHERE codigo_original = ? LIMIT 1',
      [candidate]
    );
    if (check.length === 0) break;
    nextNum++;
    candidate = `${prefix}-${String(nextNum).padStart(3, '0')}`;
  }

  return {
    area: normArea,
    prefix,
    currentMax: maxNum,
    nextCode: candidate
  };
}

router.get('/articulos/next-code', requireAuth, async (req, res) => {
  try {
    const db = getPool();
    const { area } = req.query;
    if (!area) {
      return res.status(400).json({ success: false, message: 'El parámetro área es obligatorio.' });
    }
    const result = await generateNextCodeForArea(db, area);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error generando siguiente código:', error);
    res.status(500).json({ success: false, message: 'Error generando código de referencia automático.' });
  }
});

router.get('/articulos', requireAuth, requirePermission('inv:ver'), async (req, res) => {
  try {
    const db = getPool();
    const scope = await getUserAllowedCampamentos(db, req.user);
    const {
      area,
      categoria,
      estado,
      ubicacion,
      search,
      sinSerial,
      sinCantidad,
      sinSede,
      campamento_id,
      incluir_sinteticos,
      page = 1,
      limit = 50,
      sortBy = 'id',
      sortOrder = 'ASC'
    } = req.query;

    const includeSynthetic = incluir_sinteticos === 'true';
    const conditions = ['a.activo = 1'];
    if (!includeSynthetic) {
      conditions.push('a.es_sintetico = 0');
    }
    const params = [];

    // Ámbito de campamentos / sedes permitidas
    if (!scope.isGlobal) {
      if (campamento_id === 'SIN_SEDE' || sinSede === 'true') {
        return res.status(403).json({
          success: false,
          message: 'Acceso denegado: Solo el Desarrollador Principal o perfiles globales pueden consultar artículos sin sede verificada.'
        });
      }
      if (campamento_id && campamento_id !== 'TODOS') {
        const reqCid = parseInt(campamento_id);
        if (!scope.campamentoIds.includes(reqCid)) {
          return res.status(403).json({ success: false, message: 'Acceso denegado a la sede solicitada.' });
        }
        conditions.push('(a.campamento_id = ?)');
        params.push(reqCid);
      } else {
        if (scope.campamentoIds.length > 0 && scope.campamentoNombres.length > 0) {
          conditions.push('(a.campamento_id IN (?) OR a.ubicacion_nombre IN (?))');
          params.push(scope.campamentoIds, scope.campamentoNombres);
        } else if (scope.campamentoIds.length > 0) {
          conditions.push('a.campamento_id IN (?)');
          params.push(scope.campamentoIds);
        } else if (scope.campamentoNombres.length > 0) {
          conditions.push('a.ubicacion_nombre IN (?)');
          params.push(scope.campamentoNombres);
        } else {
          conditions.push('1 = 0');
        }
      }
    } else {
      if (campamento_id === 'SIN_SEDE' || sinSede === 'true') {
        conditions.push('a.campamento_id IS NULL');
      } else if (campamento_id && campamento_id !== 'TODOS') {
        conditions.push('a.campamento_id = ?');
        params.push(parseInt(campamento_id));
      }
    }

    if (area && area !== 'TODOS') {
      conditions.push('a.area = ?');
      params.push(area.toUpperCase());
    }

    if (categoria && categoria !== 'TODAS') {
      conditions.push('a.categoria = ?');
      params.push(categoria);
    }

    if (estado && estado !== 'TODOS') {
      const normEstado = normalizeEstadoParam(estado);
      if (normEstado) {
        conditions.push('a.estado_fisico = ?');
        params.push(normEstado);
      }
    }

    if (ubicacion && ubicacion !== 'TODAS') {
      conditions.push('a.ubicacion_nombre = ?');
      params.push(ubicacion);
    }

    if (sinSerial === 'true') {
      conditions.push(`(a.serie_imei IS NULL OR TRIM(a.serie_imei) = '' OR UPPER(TRIM(a.serie_imei)) IN ('N/A', 'S/N', 'SIN SERIE', 'NONE', 'NULL', '--', '-'))`);
    }

    if (sinCantidad === 'true') {
      conditions.push('(a.cantidad_num IS NULL OR a.cantidad_verificada = 0)');
    }

    if (search && search.trim() !== '') {
      const q = `%${search.trim()}%`;
      conditions.push(`(
        a.codigo_original LIKE ? OR
        a.articulo_nombre LIKE ? OR
        a.marca_modelo LIKE ? OR
        a.serie_imei LIKE ? OR
        a.asignado_a LIKE ? OR
        a.ubicacion_nombre LIKE ? OR
        a.categoria LIKE ? OR
        a.observaciones LIKE ?
      )`);
      params.push(q, q, q, q, q, q, q, q);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total Count & Summary metrics for the active filter (Tarea 6: Consistencia Matemática)
    const [countRows] = await db.query(
      `SELECT
         COUNT(*) as total,
         SUM(COALESCE(a.cantidad_num, 0)) as total_unidades_fisicas,
         SUM(CASE WHEN a.cantidad_num IS NULL OR a.cantidad_verificada = 0 THEN 1 ELSE 0 END) as articulos_sin_cantidad
       FROM inv_articulos a ${whereClause}`,
      params
    );
    const total = parseInt(countRows[0]?.total || 0);
    const totalUnidadesFisicas = parseFloat(countRows[0]?.total_unidades_fisicas || 0);
    const articulosSinCantidad = parseInt(countRows[0]?.articulos_sin_cantidad || 0);

    // Sorting safe fields
    const safeSortFields = ['id', 'codigo_original', 'articulo_nombre', 'categoria', 'area', 'estado_fisico', 'ubicacion_nombre', 'cantidad_num', 'asignado_a', 'creado_en', 'campamento_id'];
    const safeSort = safeSortFields.includes(sortBy) ? `a.${sortBy}` : 'a.id';
    const safeOrder = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // Pagination
    const numLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 500);
    const offset = (Math.max(parseInt(page) || 1, 1) - 1) * numLimit;

    const query = `
      SELECT a.*,
             COALESCE(c.nombre, 'SIN SEDE VERIFICADA (PENDIENTE DE CLASIFICACIÓN)') as campamento_nombre,
             c.codigo as campamento_codigo,
             c.clasificacion_sede as campamento_clasificacion,
             alm.nombre as almacen_nombre
      FROM inv_articulos a
      LEFT JOIN inv_campamentos c ON a.campamento_id = c.id
      LEFT JOIN inv_almacenes alm ON a.almacen_id = alm.id
      ${whereClause}
      ORDER BY ${safeSort} ${safeOrder}
      LIMIT ? OFFSET ?
    `;

    const [rows] = await db.query(query, [...params, numLimit, offset]);

    res.json({
      success: true,
      articulos: rows,
      resumen: {
        totalRegistros: total,
        totalUnidadesFisicas,
        articulosSinCantidad
      },
      pagination: {
        total,
        page: parseInt(page) || 1,
        limit: numLimit,
        totalPages: Math.ceil(total / numLimit)
      }
    });
  } catch (error) {
    console.error('List articulos error:', error);
    res.status(500).json({ success: false, message: 'Error listando artículos de inventario.' });
  }
});

router.get('/articulos/:id', requireAuth, requirePermission('inv:ver'), async (req, res) => {
  try {
    const db = getPool();
    const [rows] = await db.query('SELECT * FROM inv_articulos WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Artículo no encontrado.' });
    }
    const articulo = rows[0];

    // Verificar ámbito de campamento
    const scope = await getUserAllowedCampamentos(db, req.user);
    if (!scope.isGlobal) {
      const campMatch = articulo.campamento_id && scope.campamentoIds.includes(articulo.campamento_id);
      const nameMatch = articulo.ubicacion_nombre && scope.campamentoNombres.some(cn => articulo.ubicacion_nombre.toLowerCase().includes(cn.toLowerCase()));
      if (!campMatch && !nameMatch) {
        return res.status(403).json({
          success: false,
          message: 'Acceso denegado: El activo pertenece a otra sede o campamento no autorizado.'
        });
      }
    }

    // Get movement history
    const [movimientos] = await db.query(
      `SELECT m.*, u.nombre as usuario_nombre
       FROM inv_movimientos m
       LEFT JOIN inv_usuarios u ON m.usuario_id = u.id
       WHERE m.articulo_id = ?
       ORDER BY m.fecha_movimiento DESC`,
      [req.params.id]
    );

    res.json({
      success: true,
      articulo,
      historial_movimientos: movimientos
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error obteniendo detalle del artículo.' });
  }
});

// Helper para resolver vinculación inequívoca con campamentos confirmados (Tarea 4)
function resolveCampamentoVinculacion(campamentoIdInput, ubicacionNombreInput) {
  let cid = campamentoIdInput ? parseInt(campamentoIdInput) : null;
  let aid = null;
  let estadoVinc = 'SIN_VINCULAR';
  const uUpper = String(ubicacionNombreInput || '').trim().toUpperCase();

  if (cid === 3 || uUpper === 'ALMACÉN 27 DE FEBRERO' || uUpper === 'ALMACEN 27 DE FEBRERO' || uUpper === 'DISTRITO NACIONAL 27 DE FEBRERO' || uUpper.includes('27 DE FEBRERO')) {
    cid = 3;
    aid = 3;
    estadoVinc = 'CONFIRMADO';
  } else if (cid === 12 || uUpper === 'OPL' || uUpper === 'KM 19 AUTOPISTA DUARTE OPL' || uUpper.includes('DUARTE OPL')) {
    cid = 12;
    aid = 10;
    estadoVinc = 'CONFIRMADO';
  } else if (cid === 13 || uUpper === 'MANTENIMIENTO 633' || uUpper.includes('633')) {
    cid = 13;
    aid = 11;
    estadoVinc = 'CONFIRMADO';
  } else if (uUpper === 'KM 19 AUT DUARTE' || uUpper === 'KM 19 AUTOPISTA DUARTE') {
    cid = null;
    aid = null;
    estadoVinc = 'SEDE_AMBIGUA';
  } else if (cid) {
    estadoVinc = 'CONFIRMADO';
  }
  return { campamento_id: cid, almacen_id: aid, estado_vinculacion_sede: estadoVinc };
}

// CREATE ITEM
router.post('/articulos', requireAuth, requirePermission('inv:crear'), async (req, res) => {
  try {
    const db = getPool();
    const {
      codigo_original,
      area,
      categoria,
      articulo_nombre,
      marca_modelo,
      tipo_caracteristicas,
      serie_imei,
      propietario = 'INGMELEC',
      asignado_a,
      cantidad_num = 1,
      unidad_medida = 'Unidad',
      estado_fisico = 'Bueno',
      ubicacion_nombre,
      zona_estante,
      fecha_revision,
      observaciones,
      campamento_id,
      es_sintetico
    } = req.body;

    if (!area || !articulo_nombre || !ubicacion_nombre) {
      return res.status(400).json({
        success: false,
        message: 'Área, descripción del artículo y ubicación son obligatorios.'
      });
    }

    const vinc = resolveCampamentoVinculacion(campamento_id, ubicacion_nombre);

    // Validación de ámbito de campamento
    const scope = await getUserAllowedCampamentos(db, req.user);
    if (!scope.isGlobal) {
      const match = scope.campamentoNombres.some(cn => ubicacion_nombre.toLowerCase().includes(cn.toLowerCase())) ||
                    (vinc.campamento_id && scope.campamentoIds.includes(vinc.campamento_id));
      if (!match) {
        return res.status(403).json({
          success: false,
          message: 'Acceso denegado: No tiene autorización para registrar artículos en esta sede.'
        });
      }
    }

    let finalCodigo = (codigo_original || '').trim();

    // 1. Validación o generación segura de Código de Referencia
    if (finalCodigo !== '') {
      const [existingCode] = await db.query(
        'SELECT id, articulo_nombre FROM inv_articulos WHERE codigo_original = ? AND activo = 1 LIMIT 1',
        [finalCodigo]
      );
      if (existingCode.length > 0) {
        return res.status(409).json({
          success: false,
          message: `El código de referencia "${finalCodigo}" ya está asignado al activo "${existingCode[0].articulo_nombre}".`
        });
      }
    } else {
      // Generación automática inteligente según el área
      const autoGen = await generateNextCodeForArea(db, area);
      finalCodigo = autoGen.nextCode;
    }

    // 2. Registro dinámico de Categoría en inv_categorias si es nueva
    if (categoria && categoria.trim() !== '' && categoria.trim() !== 'General') {
      try {
        await db.query(
          'INSERT IGNORE INTO inv_categorias (area, nombre, activo) VALUES (?, ?, 1)',
          [area.toUpperCase(), categoria.trim()]
        );
      } catch (e) {
        // Ignorar si ya existe
      }
    }

    // 3. Registro dinámico de Custodio en inv_custodios si es nuevo
    if (asignado_a && asignado_a.trim() !== '' && asignado_a.trim() !== 'Sin asignar') {
      try {
        await db.query(
          'INSERT IGNORE INTO inv_custodios (nombre, activo) VALUES (?, 1)',
          [asignado_a.trim()]
        );
      } catch (e) {
        // Ignorar si ya existe
      }
    }

    const isSynt = (es_sintetico === true || es_sintetico === 1 || String(observaciones || '').includes('[REGISTRO SINTÉTICO')) ? 1 : 0;
    const parsedCant = (cantidad_num === null || cantidad_num === '' || isNaN(Number(cantidad_num))) ? null : Number(cantidad_num);
    const cantVerif = parsedCant !== null ? 1 : 0;

    const [result] = await db.query(
      `INSERT INTO inv_articulos (
        codigo_original, area, categoria, articulo_nombre, marca_modelo,
        tipo_caracteristicas, serie_imei, propietario, asignado_a,
        cantidad_num, cantidad_texto, cantidad_verificada, unidad_medida,
        estado_fisico, ubicacion_nombre, zona_estante, fecha_revision,
        observaciones, activo, hoja_origen, fila_origen, creado_por,
        campamento_id, almacen_id, es_sintetico, origen_datos, estado_vinculacion_sede
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?, ?, ?, ?, ?, ?)`,
      [
        finalCodigo,
        area.toUpperCase(),
        categoria || 'General',
        articulo_nombre,
        marca_modelo || null,
        tipo_caracteristicas || null,
        serie_imei || null,
        propietario,
        asignado_a || null,
        parsedCant,
        parsedCant !== null ? String(parsedCant) : null,
        cantVerif,
        unidad_medida,
        normalizeEstadoFisico(estado_fisico),
        ubicacion_nombre,
        zona_estante || null,
        fecha_revision || null,
        observaciones || null,
        `CREADO_MANUAL_${area.toUpperCase()}`,
        req.user.id,
        vinc.campamento_id,
        vinc.almacen_id,
        isSynt,
        isSynt ? 'SINTETICO_PRUEBA' : 'OPERATIVO_REAL',
        vinc.estado_vinculacion_sede
      ]
    );

    const newId = result.insertId;

    // Log movement ENTRADA
    await db.query(
      `INSERT INTO inv_movimientos (
        articulo_id, tipo_movimiento, cantidad, unidad_medida,
        ubicacion_destino, custodio_destino, estado_nuevo, motivo, usuario_id, es_sintetico
      ) VALUES (?, 'ENTRADA', ?, ?, ?, ?, ?, 'Alta manual de inventario', ?, ?)`,
      [newId, parsedCant || 1, unidad_medida, ubicacion_nombre, asignado_a || null, normalizeEstadoFisico(estado_fisico), req.user.id, isSynt]
    );

    // Audit
    await logAudit(db, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'ALTA_ARTICULO',
      entidad: 'inv_articulos',
      entidad_id: newId,
      detalles_nuevos: req.body,
      req
    });

    res.status(201).json({
      success: true,
      message: 'Artículo registrado correctamente.',
      id: newId,
      codigo_original: finalCodigo
    });
  } catch (error) {
    console.error('Create articulo error:', error);
    res.status(500).json({ success: false, message: 'Error registrando artículo.' });
  }
});

// UPDATE ITEM
router.put('/articulos/:id', requireAuth, requirePermission('inv:editar'), async (req, res) => {
  try {
    const db = getPool();
    const id = req.params.id;

    const [prevRows] = await db.query('SELECT * FROM inv_articulos WHERE id = ?', [id]);
    if (prevRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Artículo no encontrado.' });
    }
    const prev = prevRows[0];

    // Validación de ámbito de campamento
    const scope = await getUserAllowedCampamentos(db, req.user);
    if (!scope.isGlobal) {
      const campMatch = prev.campamento_id && scope.campamentoIds.includes(prev.campamento_id);
      const nameMatch = prev.ubicacion_nombre && scope.campamentoNombres.some(cn => prev.ubicacion_nombre.toLowerCase().includes(cn.toLowerCase()));
      if (!campMatch && !nameMatch) {
        return res.status(403).json({
          success: false,
          message: 'Acceso denegado: No puede modificar artículos de otra sede o campamento.'
        });
      }
    }

    const {
      articulo_nombre,
      categoria,
      marca_modelo,
      tipo_caracteristicas,
      serie_imei,
      propietario,
      asignado_a,
      cantidad_num,
      unidad_medida,
      estado_fisico,
      ubicacion_nombre,
      zona_estante,
      fecha_revision,
      observaciones,
      campamento_id
    } = req.body;

    const newCant = (cantidad_num !== undefined && cantidad_num !== null && cantidad_num !== '' && !isNaN(Number(cantidad_num)))
      ? Number(cantidad_num)
      : (cantidad_num === null ? null : prev.cantidad_num);
    const newCantVerif = newCant !== null ? 1 : 0;

    let finalCampId = prev.campamento_id;
    let finalAlmId = prev.almacen_id;
    let finalEstadoVinc = prev.estado_vinculacion_sede;

    if (campamento_id !== undefined || ubicacion_nombre !== undefined) {
      const vinc = resolveCampamentoVinculacion(
        campamento_id !== undefined ? campamento_id : prev.campamento_id,
        ubicacion_nombre !== undefined ? ubicacion_nombre : prev.ubicacion_nombre
      );
      finalCampId = vinc.campamento_id;
      finalAlmId = vinc.almacen_id || prev.almacen_id;
      finalEstadoVinc = vinc.estado_vinculacion_sede;
    }

    await db.query(
      `UPDATE inv_articulos SET
        articulo_nombre = COALESCE(?, articulo_nombre),
        categoria = COALESCE(?, categoria),
        marca_modelo = COALESCE(?, marca_modelo),
        tipo_caracteristicas = COALESCE(?, tipo_caracteristicas),
        serie_imei = COALESCE(?, serie_imei),
        propietario = COALESCE(?, propietario),
        asignado_a = COALESCE(?, asignado_a),
        cantidad_num = ?,
        cantidad_texto = ?,
        cantidad_verificada = ?,
        unidad_medida = COALESCE(?, unidad_medida),
        estado_fisico = COALESCE(?, estado_fisico),
        ubicacion_nombre = COALESCE(?, ubicacion_nombre),
        zona_estante = COALESCE(?, zona_estante),
        fecha_revision = COALESCE(?, fecha_revision),
        observaciones = COALESCE(?, observaciones),
        campamento_id = ?,
        almacen_id = ?,
        estado_vinculacion_sede = ?
      WHERE id = ?`,
      [
        articulo_nombre,
        categoria,
        marca_modelo,
        tipo_caracteristicas,
        serie_imei,
        propietario,
        asignado_a,
        newCant,
        newCant !== null ? String(newCant) : prev.cantidad_texto,
        newCantVerif,
        unidad_medida,
        estado_fisico ? normalizeEstadoFisico(estado_fisico) : null,
        ubicacion_nombre,
        zona_estante,
        fecha_revision,
        observaciones,
        finalCampId,
        finalAlmId,
        finalEstadoVinc,
        id
      ]
    );

    // If location changed, record movement TRASLADO
    if (ubicacion_nombre && ubicacion_nombre !== prev.ubicacion_nombre) {
      await db.query(
        `INSERT INTO inv_movimientos (
          articulo_id, tipo_movimiento, cantidad, unidad_medida,
          ubicacion_origen, ubicacion_destino, estado_previo, estado_nuevo,
          motivo, usuario_id, es_sintetico
        ) VALUES (?, 'TRASLADO', ?, ?, ?, ?, ?, ?, 'Cambio de ubicación', ?, ?)`,
        [id, newCant || 1, unidad_medida || prev.unidad_medida, prev.ubicacion_nombre, ubicacion_nombre, prev.estado_fisico, estado_fisico || prev.estado_fisico, req.user.id, prev.es_sintetico || 0]
      );
    }

    // If assignee changed, record ASIGNACION
    if (asignado_a !== undefined && asignado_a !== prev.asignado_a) {
      await db.query(
        `INSERT INTO inv_movimientos (
          articulo_id, tipo_movimiento, cantidad, unidad_medida,
          custodio_origen, custodio_destino, motivo, usuario_id, es_sintetico
        ) VALUES (?, 'ASIGNACION', ?, ?, ?, ?, 'Reasignación de custodio', ?, ?)`,
        [id, newCant || 1, unidad_medida || prev.unidad_medida, prev.asignado_a, asignado_a, req.user.id, prev.es_sintetico || 0]
      );
    }

    // Audit
    await logAudit(db, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'EDICION_ARTICULO',
      entidad: 'inv_articulos',
      entidad_id: id,
      detalles_previos: prev,
      detalles_nuevos: req.body,
      req
    });

    res.json({ success: true, message: 'Artículo actualizado exitosamente.' });
  } catch (error) {
    console.error('Update articulo error:', error);
    res.status(500).json({ success: false, message: 'Error actualizando artículo.' });
  }
});

// DELETE ITEM (Soft Delete - Exige permiso inv:eliminar)
router.delete('/articulos/:id', requireAuth, requirePermission('inv:eliminar'), async (req, res) => {
  try {
    const db = getPool();
    const id = req.params.id;

    const [rows] = await db.query('SELECT * FROM inv_articulos WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Artículo no encontrado.' });
    }

    // Verificar ámbito de campamento
    const scope = await getUserAllowedCampamentos(db, req.user);
    if (!scope.isGlobal) {
      const campMatch = rows[0].campamento_id && scope.campamentoIds.includes(rows[0].campamento_id);
      const nameMatch = rows[0].ubicacion_nombre && scope.campamentoNombres.some(cn => rows[0].ubicacion_nombre.toLowerCase().includes(cn.toLowerCase()));
      if (!campMatch && !nameMatch) {
        return res.status(403).json({
          success: false,
          message: 'Acceso denegado: No puede eliminar artículos de otra sede o campamento.'
        });
      }
    }

    await db.query('UPDATE inv_articulos SET activo = 0 WHERE id = ?', [id]);

    await logAudit(db, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'DESACTIVACION_ARTICULO',
      entidad: 'inv_articulos',
      entidad_id: id,
      detalles_previos: rows[0],
      req
    });

    res.json({ success: true, message: 'Artículo desactivado exitosamente.' });
  } catch (error) {
    console.error('Delete articulo error:', error);
    res.status(500).json({ success: false, message: 'Error eliminando artículo.' });
  }
});

// ==========================================
// 4. MOVIMIENTOS TRANSACCIONALES
// ==========================================

router.get('/movimientos', requireAuth, requirePermission('inv:movimientos_ver'), async (req, res) => {
  try {
    const db = getPool();
    const scope = await getUserAllowedCampamentos(db, req.user);
    const limit = parseInt(req.query.limit) || 100;
    const includeSynthetic = req.query.incluir_sinteticos === 'true';
    const { campamento_id } = req.query;

    let query = `
      SELECT m.*, a.articulo_nombre, a.codigo_original, a.area, a.campamento_id,
             COALESCE(c.nombre, 'SIN SEDE VERIFICADA') as campamento_nombre,
             u.nombre as usuario_nombre
      FROM inv_movimientos m
      JOIN inv_articulos a ON m.articulo_id = a.id
      LEFT JOIN inv_campamentos c ON a.campamento_id = c.id
      LEFT JOIN inv_usuarios u ON m.usuario_id = u.id
    `;
    const conds = [];
    const params = [];

    if (!includeSynthetic) {
      conds.push('m.es_sintetico = 0 AND a.es_sintetico = 0');
    }

    if (!scope.isGlobal && (scope.campamentoNombres.length > 0 || scope.campamentoIds.length > 0)) {
      const movConds = [];
      if (scope.campamentoIds.length > 0) {
        movConds.push('a.campamento_id IN (?)');
        params.push(scope.campamentoIds);
      }
      if (scope.campamentoNombres.length > 0) {
        movConds.push('m.ubicacion_origen IN (?) OR m.ubicacion_destino IN (?) OR a.ubicacion_nombre IN (?)');
        params.push(scope.campamentoNombres, scope.campamentoNombres, scope.campamentoNombres);
      }
      conds.push(`(${movConds.join(' OR ')})`);
    } else if (!scope.isGlobal) {
      conds.push('1 = 0');
    } else if (campamento_id && campamento_id !== 'TODOS') {
      if (campamento_id === 'SIN_SEDE') {
        conds.push('a.campamento_id IS NULL');
      } else {
        conds.push('a.campamento_id = ?');
        params.push(parseInt(campamento_id));
      }
    }

    if (conds.length > 0) {
      query += ` WHERE ${conds.join(' AND ')}`;
    }

    query += ' ORDER BY m.fecha_movimiento DESC LIMIT ?';
    params.push(limit);

    const [rows] = await db.query(query, params);
    res.json({ success: true, movimientos: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error consultando movimientos.' });
  }
});

const TIPOS_MOVIMIENTO_VALIDOS = ['ENTRADA', 'SALIDA', 'TRASLADO', 'ASIGNACION', 'DEVOLUCION', 'AJUSTE'];

router.post('/movimientos', requireAuth, requirePermission('inv:movimientos_registrar'), async (req, res) => {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    const {
      articulo_id,
      tipo_movimiento,
      cantidad = 1,
      ubicacion_destino,
      custodio_destino,
      estado_nuevo,
      motivo,
      observaciones
    } = req.body;

    if (!articulo_id || !tipo_movimiento || !motivo) {
      return res.status(400).json({
        success: false,
        message: 'Artículo, tipo de movimiento y motivo son obligatorios.'
      });
    }

    if (!TIPOS_MOVIMIENTO_VALIDOS.includes(tipo_movimiento)) {
      return res.status(400).json({
        success: false,
        message: `Tipo de movimiento no válido. Valores permitidos: ${TIPOS_MOVIMIENTO_VALIDOS.join(', ')}.`
      });
    }

    const cantMov = Number(cantidad);
    if (isNaN(cantMov) || !isFinite(cantMov)) {
      return res.status(400).json({
        success: false,
        message: 'La cantidad debe ser un número válido.'
      });
    }

    if (tipo_movimiento === 'AJUSTE') {
      if (cantMov < 0) {
        return res.status(400).json({
          success: false,
          message: 'La cantidad para un ajuste de inventario no puede ser negativa.'
        });
      }
    } else {
      if (cantMov <= 0) {
        return res.status(400).json({
          success: false,
          message: 'La cantidad para este movimiento debe ser estrictamente mayor a cero.'
        });
      }
    }

    // Decimal precision validation (max 2 decimals)
    if (Number(cantMov.toFixed(2)) !== cantMov) {
      return res.status(400).json({
        success: false,
        message: 'La cantidad no puede tener más de 2 cifras decimales.'
      });
    }

    const estadoNuevoNormalizado = estado_nuevo ? normalizeEstadoFisico(estado_nuevo) : null;

    await conn.beginTransaction();

    const [artRows] = await conn.query('SELECT * FROM inv_articulos WHERE id = ? FOR UPDATE', [articulo_id]);
    if (artRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Artículo no encontrado.' });
    }
    const articulo = artRows[0];

    // Verificar ámbito de campamento para el artículo
    const scope = await getUserAllowedCampamentos(conn, req.user);
    if (!scope.isGlobal) {
      const campMatch = articulo.campamento_id && scope.campamentoIds.includes(articulo.campamento_id);
      const nameMatch = articulo.ubicacion_nombre && scope.campamentoNombres.some(cn => articulo.ubicacion_nombre.toLowerCase().includes(cn.toLowerCase()));
      if (!campMatch && !nameMatch) {
        await conn.rollback();
        return res.status(403).json({
          success: false,
          message: 'Acceso denegado: El activo pertenece a otra sede o campamento no autorizado.'
        });
      }
    }

    const currentCant = articulo.cantidad_num !== null ? parseFloat(articulo.cantidad_num) : null;
    let nuevaCantidad = currentCant;

    if (tipo_movimiento === 'SALIDA') {
      if (currentCant !== null) {
        if (currentCant < cantMov) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            message: `Stock insuficiente (${currentCant} disponibles) para retirar ${cantMov}.`
          });
        }
        nuevaCantidad = Number((currentCant - cantMov).toFixed(2));
        if (nuevaCantidad < 0) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            message: 'La operación resultaría en un stock negativo.'
          });
        }
      }
    } else if (tipo_movimiento === 'ENTRADA' || tipo_movimiento === 'DEVOLUCION') {
      if (currentCant !== null) {
        nuevaCantidad = Number(((currentCant || 0) + cantMov).toFixed(2));
      } else {
        nuevaCantidad = Number(cantMov.toFixed(2));
      }
    } else if (tipo_movimiento === 'AJUSTE') {
      nuevaCantidad = Number(cantMov.toFixed(2));
    } else if (tipo_movimiento === 'TRASLADO' || tipo_movimiento === 'ASIGNACION') {
      if (currentCant !== null && currentCant < cantMov) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: `No se puede transferir/asignar más del stock disponible (${currentCant} disponibles).`
        });
      }
    }

    // Update item
    await conn.query(`
      UPDATE inv_articulos SET
        cantidad_num = ?,
        cantidad_texto = ?,
        ubicacion_nombre = COALESCE(?, ubicacion_nombre),
        asignado_a = COALESCE(?, asignado_a),
        estado_fisico = COALESCE(?, estado_fisico)
      WHERE id = ?
    `, [
      nuevaCantidad,
      nuevaCantidad !== null ? String(nuevaCantidad) : articulo.cantidad_texto,
      ubicacion_destino || null,
      custodio_destino || null,
      estadoNuevoNormalizado || null,
      articulo_id
    ]);

    // Insert movement
    await conn.query(`
      INSERT INTO inv_movimientos (
        articulo_id, tipo_movimiento, cantidad, unidad_medida,
        ubicacion_origen, ubicacion_destino, custodio_origen, custodio_destino,
        estado_previo, estado_nuevo, motivo, observaciones, usuario_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      articulo_id,
      tipo_movimiento,
      cantMov,
      articulo.unidad_medida,
      articulo.ubicacion_nombre,
      ubicacion_destino || articulo.ubicacion_nombre,
      articulo.asignado_a,
      custodio_destino || articulo.asignado_a,
      articulo.estado_fisico,
      estadoNuevoNormalizado || articulo.estado_fisico,
      motivo,
      observaciones || null,
      req.user.id
    ]);

    // Atomic Audit Log inside transaction
    await logAudit(conn, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: `MOVIMIENTO_${tipo_movimiento}`,
      entidad: 'inv_movimientos',
      entidad_id: articulo_id,
      detalles_previos: {
        cantidad_num: articulo.cantidad_num,
        ubicacion: articulo.ubicacion_nombre,
        custodio: articulo.asignado_a,
        estado: articulo.estado_fisico
      },
      detalles_nuevos: {
        tipo_movimiento,
        cantidad: cantMov,
        nueva_cantidad: nuevaCantidad,
        ubicacion_destino: ubicacion_destino || articulo.ubicacion_nombre,
        custodio_destino: custodio_destino || articulo.asignado_a,
        estado_nuevo: estadoNuevoNormalizado || articulo.estado_fisico,
        motivo
      },
      req
    });

    await conn.commit();

    res.json({
      success: true,
      message: `Movimiento de ${tipo_movimiento} registrado con éxito.`,
      nuevaCantidad
    });
  } catch (error) {
    await conn.rollback();
    console.error('Movement error:', error);
    res.status(500).json({ success: false, message: 'Error procesando movimiento transaccional.' });
  } finally {
    conn.release();
  }
});

// ==========================================
// 5. REPORTES & EXPORTACIÓN
// ==========================================

router.get('/reportes/consolidado', requireAuth, requirePermission('rep:ver'), async (req, res) => {
  try {
    const db = getPool();
    const scope = await getUserAllowedCampamentos(db, req.user);
    const includeSynthetic = req.query.incluir_sinteticos === 'true';
    const { campamento_id, area, estado } = req.query;

    let whereArt = 'WHERE a.activo = 1';
    if (!includeSynthetic) {
      whereArt += ' AND a.es_sintetico = 0';
    }
    const paramsArt = [];

    if (!scope.isGlobal) {
      if (campamento_id === 'SIN_SEDE') {
        return res.status(403).json({ success: false, message: 'Acceso denegado a artículos sin sede verificada.' });
      }
      if (campamento_id && campamento_id !== 'TODOS') {
        const reqCid = parseInt(campamento_id);
        if (!scope.campamentoIds.includes(reqCid)) {
          return res.status(403).json({ success: false, message: 'Acceso denegado a la sede solicitada.' });
        }
        whereArt += ' AND a.campamento_id = ?';
        paramsArt.push(reqCid);
      } else if (scope.campamentoIds.length > 0 && scope.campamentoNombres.length > 0) {
        whereArt += ' AND (a.campamento_id IN (?) OR a.ubicacion_nombre IN (?))';
        paramsArt.push(scope.campamentoIds, scope.campamentoNombres);
      } else if (scope.campamentoIds.length > 0) {
        whereArt += ' AND a.campamento_id IN (?)';
        paramsArt.push(scope.campamentoIds);
      } else if (scope.campamentoNombres.length > 0) {
        whereArt += ' AND a.ubicacion_nombre IN (?)';
        paramsArt.push(scope.campamentoNombres);
      } else {
        whereArt += ' AND 1 = 0';
      }
    } else if (campamento_id && campamento_id !== 'TODOS') {
      if (campamento_id === 'SIN_SEDE') {
        whereArt += ' AND a.campamento_id IS NULL';
      } else {
        whereArt += ' AND a.campamento_id = ?';
        paramsArt.push(parseInt(campamento_id));
      }
    }

    if (area && area !== 'TODOS') {
      whereArt += ' AND a.area = ?';
      paramsArt.push(area.toUpperCase());
    }

    if (estado && estado !== 'TODOS') {
      const normEstado = normalizeEstadoParam(estado);
      if (normEstado) {
        whereArt += ' AND a.estado_fisico = ?';
        paramsArt.push(normEstado);
      }
    }

    // Group by Area & Estado
    const [areaEstado] = await db.query(`
      SELECT a.area, a.estado_fisico,
             COUNT(*) as registros,
             SUM(COALESCE(a.cantidad_num, 0)) as total_unidades,
             SUM(CASE WHEN a.cantidad_num IS NULL OR a.cantidad_verificada = 0 THEN 1 ELSE 0 END) as articulos_sin_cantidad
      FROM inv_articulos a
      ${whereArt}
      GROUP BY a.area, a.estado_fisico
      ORDER BY a.area, a.estado_fisico
    `, paramsArt);

    // Group by Campamento / Sede Verificada + Ubicación Histórica
    const [porUbicacion] = await db.query(`
      SELECT COALESCE(c.nombre, 'SIN SEDE VERIFICADA (PENDIENTE DE CLASIFICACIÓN)') as campamento_nombre,
             a.campamento_id,
             a.ubicacion_nombre,
             a.area,
             COUNT(*) as registros,
             SUM(COALESCE(a.cantidad_num, 0)) as total_unidades,
             SUM(CASE WHEN a.cantidad_num IS NULL OR a.cantidad_verificada = 0 THEN 1 ELSE 0 END) as articulos_sin_cantidad
      FROM inv_articulos a
      LEFT JOIN inv_campamentos c ON a.campamento_id = c.id
      ${whereArt}
      GROUP BY campamento_nombre, a.campamento_id, a.ubicacion_nombre, a.area
      ORDER BY registros DESC
    `, paramsArt);

    // Group by Campamento Summary
    const [porCampamento] = await db.query(`
      SELECT COALESCE(c.nombre, 'SIN SEDE VERIFICADA (PENDIENTE DE CLASIFICACIÓN)') as campamento_nombre,
             COALESCE(CAST(a.campamento_id AS CHAR), 'SIN_SEDE') as campamento_id,
             COUNT(*) as registros,
             SUM(COALESCE(a.cantidad_num, 0)) as total_unidades,
             SUM(CASE WHEN a.cantidad_num IS NULL OR a.cantidad_verificada = 0 THEN 1 ELSE 0 END) as articulos_sin_cantidad
      FROM inv_articulos a
      LEFT JOIN inv_campamentos c ON a.campamento_id = c.id
      ${whereArt}
      GROUP BY campamento_nombre, a.campamento_id
      ORDER BY CASE WHEN a.campamento_id IS NULL THEN 1 ELSE 0 END ASC, a.campamento_id ASC
    `, paramsArt);

    // Group by Custodio
    const [porCustodio] = await db.query(`
      SELECT COALESCE(NULLIF(TRIM(a.asignado_a), ''), 'Sin Asignar') as custodio,
             COUNT(*) as articulos,
             SUM(COALESCE(a.cantidad_num, 0)) as total_unidades
      FROM inv_articulos a
      ${whereArt}
      GROUP BY custodio
      ORDER BY articulos DESC
      LIMIT 20
    `, paramsArt);

    const totalArticulos = porCampamento.reduce((acc, r) => acc + parseInt(r.registros || 0), 0);
    const totalUnidades = porCampamento.reduce((acc, r) => acc + parseFloat(r.total_unidades || 0), 0);
    const totalSinCantidad = porCampamento.reduce((acc, r) => acc + parseInt(r.articulos_sin_cantidad || 0), 0);

    res.json({
      success: true,
      reporte: {
        totales: {
          totalArticulos,
          totalUnidades,
          totalSinCantidad
        },
        porCampamento,
        areaEstado,
        porUbicacion,
        porCustodio
      }
    });
  } catch (error) {
    console.error('Reporte consolidado error:', error);
    res.status(500).json({ success: false, message: 'Error generando reporte consolidado.' });
  }
});

router.get('/reportes/exportar', requireAuth, requirePermission('rep:exportar'), async (req, res) => {
  try {
    const db = getPool();
    const scope = await getUserAllowedCampamentos(db, req.user);
    const { area, estado, campamento_id, sinSerial, sinCantidad, incluir_sinteticos } = req.query;
    const includeSynthetic = incluir_sinteticos === 'true';

    let query = `
      SELECT a.*,
             COALESCE(c.nombre, 'SIN SEDE VERIFICADA (PENDIENTE DE CLASIFICACIÓN)') as campamento_nombre,
             c.codigo as campamento_codigo,
             alm.nombre as almacen_nombre
      FROM inv_articulos a
      LEFT JOIN inv_campamentos c ON a.campamento_id = c.id
      LEFT JOIN inv_almacenes alm ON a.almacen_id = alm.id
      WHERE a.activo = 1
    `;
    const params = [];

    if (!includeSynthetic) {
      query += ' AND a.es_sintetico = 0';
    }

    if (!scope.isGlobal) {
      if (campamento_id === 'SIN_SEDE') {
        return res.status(403).json({ success: false, message: 'Acceso denegado a artículos sin sede verificada.' });
      }
      if (campamento_id && campamento_id !== 'TODOS') {
        const reqCid = parseInt(campamento_id);
        if (!scope.campamentoIds.includes(reqCid)) {
          return res.status(403).json({ success: false, message: 'Acceso denegado a la sede solicitada.' });
        }
        query += ' AND a.campamento_id = ?';
        params.push(reqCid);
      } else if (scope.campamentoIds.length > 0 && scope.campamentoNombres.length > 0) {
        query += ' AND (a.campamento_id IN (?) OR a.ubicacion_nombre IN (?))';
        params.push(scope.campamentoIds, scope.campamentoNombres);
      } else if (scope.campamentoIds.length > 0) {
        query += ' AND a.campamento_id IN (?)';
        params.push(scope.campamentoIds);
      } else if (scope.campamentoNombres.length > 0) {
        query += ' AND a.ubicacion_nombre IN (?)';
        params.push(scope.campamentoNombres);
      } else {
        query += ' AND 1 = 0';
      }
    } else if (campamento_id && campamento_id !== 'TODOS') {
      if (campamento_id === 'SIN_SEDE') {
        query += ' AND a.campamento_id IS NULL';
      } else {
        query += ' AND a.campamento_id = ?';
        params.push(parseInt(campamento_id));
      }
    }

    if (area && area !== 'TODOS') {
      query += ' AND a.area = ?';
      params.push(area.toUpperCase());
    }
    if (estado && estado !== 'TODOS') {
      const normEstado = normalizeEstadoParam(estado);
      if (normEstado) {
        query += ' AND a.estado_fisico = ?';
        params.push(normEstado);
      }
    }
    if (sinSerial === 'true') {
      query += ` AND (a.serie_imei IS NULL OR TRIM(a.serie_imei) = '' OR UPPER(TRIM(a.serie_imei)) IN ('N/A', 'S/N', 'SIN SERIE', 'NONE', 'NULL', '--', '-'))`;
    }
    if (sinCantidad === 'true') {
      query += ' AND (a.cantidad_num IS NULL OR a.cantidad_verificada = 0)';
    }

    query += ' ORDER BY a.id ASC';

    const [rows] = await db.query(query, params);
    const totalUnidadesFisicas = rows.reduce((acc, r) => acc + (r.cantidad_num !== null ? parseFloat(r.cantidad_num) : 0), 0);
    const articulosSinCantidad = rows.filter(r => r.cantidad_num === null || r.cantidad_verificada === 0).length;

    res.json({
      success: true,
      count: rows.length,
      resumen: {
        totalRegistros: rows.length,
        totalUnidadesFisicas,
        articulosSinCantidad
      },
      data: rows
    });
  } catch (error) {
    console.error('Reporte exportar error:', error);
    res.status(500).json({ success: false, message: 'Error exportando inventario.' });
  }
});

// ==========================================
// 6. AUDITORIA
// ==========================================

router.get('/auditoria', requireAuth, requireRole(['admin', 'auditor', 'gerencia']), async (req, res) => {
  try {
    const db = getPool();
    const limit = parseInt(req.query.limit) || 100;
    const [rows] = await db.query(
      'SELECT * FROM inv_auditoria ORDER BY fecha DESC LIMIT ?',
      [limit]
    );
    res.json({ success: true, logs: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error consultando bitácora de auditoría.' });
  }
});

// ==========================================
// 7. GESTIÓN EXCLUSIVA DE USUARIOS (SOLO DEVELOPER)
// ==========================================

router.get('/usuarios', requireAuth, requireDeveloper, async (req, res) => {
  try {
    const db = getPool();
    const [rows] = await db.query(`
      SELECT u.id, u.nombre, u.email, u.rol, u.cargo, u.area, u.activo,
             u.es_developer, u.campamento_id, u.almacen_id, u.permisos_json,
             u.ultimo_acceso, u.creado_en
      FROM inv_usuarios u
      ORDER BY u.es_developer DESC, u.id ASC
    `);

    // Consultar campamentos y almacenes asignados a cada usuario
    const [campsRows] = await db.query(`
      SELECT uc.usuario_id, c.id as campamento_id, c.nombre, c.codigo, uc.es_principal
      FROM inv_usuario_campamentos uc
      JOIN inv_campamentos c ON uc.campamento_id = c.id
      WHERE c.activo = 1
    `);

    let almsRows = [];
    try {
      const [aRows] = await db.query(`
        SELECT ua.usuario_id, a.id as almacen_id, a.nombre, a.campamento_id
        FROM inv_usuario_almacenes ua
        JOIN inv_almacenes a ON ua.almacen_id = a.id
        WHERE a.activo = 1
      `);
      almsRows = aRows;
    } catch (e) {
      almsRows = [];
    }

    const result = rows.map(u => {
      let perms = [];
      try {
        perms = u.permisos_json ? (typeof u.permisos_json === 'string' ? JSON.parse(u.permisos_json) : u.permisos_json) : (u.rol === 'developer' ? ['*'] : []);
      } catch (e) {
        perms = u.rol === 'developer' ? ['*'] : [];
      }

      return {
        ...u,
        permisos: perms,
        campamentos_asignados: campsRows.filter(c => c.usuario_id === u.id),
        almacenes_asignados: almsRows.filter(a => a.usuario_id === u.id)
      };
    });

    res.json({ success: true, usuarios: result });
  } catch (error) {
    console.error('List usuarios error:', error);
    res.status(500).json({ success: false, message: 'Error consultando usuarios.' });
  }
});

router.post('/usuarios', requireAuth, requireDeveloper, async (req, res) => {
  try {
    const db = getPool();
    const {
      nombre,
      email,
      password,
      rol = 'almacen',
      cargo,
      area,
      campamento_id,
      campamentos_adicionales = [],
      almacenes = [],
      permisos = []
    } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({ success: false, message: 'Nombre, email y contraseña son obligatorios.' });
    }

    // Regla de Seguridad Absoluta: Solo puede existir un único developer principal
    if (rol === 'developer' || req.body.es_developer) {
      return res.status(403).json({
        success: false,
        message: 'Política de seguridad estricta: No se permite crear cuentas adicionales con rol developer.'
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const [existing] = await db.query('SELECT id FROM inv_usuarios WHERE email = ?', [cleanEmail]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'El correo electrónico ya se encuentra registrado.' });
    }

    const hash = hashPassword(password);
    const permisosStr = JSON.stringify(Array.isArray(permisos) ? permisos : []);

    const [result] = await db.query(
      `INSERT INTO inv_usuarios (
        nombre, email, password_hash, rol, cargo, area, activo,
        es_developer, campamento_id, permisos_json
      ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
      [nombre.trim(), cleanEmail, hash, rol, cargo ? cargo.trim() : null, area ? area.trim() : null, campamento_id || null, permisosStr]
    );

    const newUserId = result.insertId;

    // Asignar campamentos
    const allCampsToAssign = new Set();
    if (campamento_id) allCampsToAssign.add(parseInt(campamento_id));
    if (Array.isArray(campamentos_adicionales)) {
      campamentos_adicionales.forEach(cid => allCampsToAssign.add(parseInt(cid)));
    }

    for (const cid of allCampsToAssign) {
      const isPrincipal = cid === parseInt(campamento_id) ? 1 : 0;
      await db.query(
        'INSERT IGNORE INTO inv_usuario_campamentos (usuario_id, campamento_id, es_principal) VALUES (?, ?, ?)',
        [newUserId, cid, isPrincipal]
      );
    }

    // Asignar almacenes si fueron provistos
    if (Array.isArray(almacenes)) {
      for (const aid of almacenes) {
        await db.query(
          'INSERT IGNORE INTO inv_usuario_almacenes (usuario_id, almacen_id) VALUES (?, ?)',
          [newUserId, parseInt(aid)]
        );
      }
    }

    await logAudit(db, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'CREACION_USUARIO',
      entidad: 'inv_usuarios',
      entidad_id: newUserId,
      detalles_nuevos: { nombre, email: cleanEmail, rol, cargo, campamentos: Array.from(allCampsToAssign), permisos },
      req
    });

    res.status(201).json({
      success: true,
      message: 'Usuario creado exitosamente con permisos y sedes asignadas.',
      id: newUserId
    });
  } catch (error) {
    console.error('Create usuario error:', error);
    res.status(500).json({ success: false, message: 'Error creando usuario.' });
  }
});

router.put('/usuarios/:id', requireAuth, requireDeveloper, async (req, res) => {
  try {
    const db = getPool();
    const targetId = parseInt(req.params.id);
    const {
      nombre,
      email,
      cargo,
      rol,
      campamento_id,
      campamentos_adicionales,
      almacenes,
      permisos,
      activo
    } = req.body;

    const [prevRows] = await db.query('SELECT * FROM inv_usuarios WHERE id = ?', [targetId]);
    if (prevRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    }
    const targetUser = prevRows[0];

    // Protección de la cuenta developer principal
    if (targetUser.es_developer === 1 || targetUser.rol === 'developer') {
      if (rol && rol !== 'developer') {
        return res.status(403).json({ success: false, message: 'No se puede revocar el rol de la cuenta Desarrollador Principal.' });
      }
      if (activo === 0 || activo === false) {
        return res.status(403).json({ success: false, message: 'No se puede desactivar la cuenta del Desarrollador Principal.' });
      }
    }

    // Evitar que otro usuario sea elevado a developer
    if (rol === 'developer' && targetUser.es_developer !== 1) {
      return res.status(403).json({ success: false, message: 'Política de seguridad: Solo puede existir un único Desarrollador Principal.' });
    }

    const permisosStr = permisos !== undefined ? JSON.stringify(Array.isArray(permisos) ? permisos : []) : targetUser.permisos_json;

    await db.query(`
      UPDATE inv_usuarios SET
        nombre = COALESCE(?, nombre),
        email = COALESCE(?, email),
        cargo = COALESCE(?, cargo),
        rol = COALESCE(?, rol),
        campamento_id = ?,
        permisos_json = ?,
        activo = COALESCE(?, activo)
      WHERE id = ?
    `, [
      nombre ? nombre.trim() : null,
      email ? email.toLowerCase().trim() : null,
      cargo ? cargo.trim() : null,
      rol || null,
      campamento_id !== undefined ? (campamento_id || null) : targetUser.campamento_id,
      permisosStr,
      activo !== undefined ? (activo ? 1 : 0) : targetUser.activo,
      targetId
    ]);

    // Actualizar campamentos asignados si se enviaron
    if (campamento_id !== undefined || campamentos_adicionales !== undefined) {
      await db.query('DELETE FROM inv_usuario_campamentos WHERE usuario_id = ?', [targetId]);
      const campsSet = new Set();
      if (campamento_id) campsSet.add(parseInt(campamento_id));
      if (Array.isArray(campamentos_adicionales)) {
        campamentos_adicionales.forEach(cid => campsSet.add(parseInt(cid)));
      }
      for (const cid of campsSet) {
        const isPrincipal = cid === parseInt(campamento_id) ? 1 : 0;
        await db.query(
          'INSERT IGNORE INTO inv_usuario_campamentos (usuario_id, campamento_id, es_principal) VALUES (?, ?, ?)',
          [targetId, cid, isPrincipal]
        );
      }
    }

    // Actualizar almacenes si se enviaron
    if (Array.isArray(almacenes)) {
      await db.query('DELETE FROM inv_usuario_almacenes WHERE usuario_id = ?', [targetId]);
      for (const aid of almacenes) {
        await db.query(
          'INSERT IGNORE INTO inv_usuario_almacenes (usuario_id, almacen_id) VALUES (?, ?)',
          [targetId, parseInt(aid)]
        );
      }
    }

    await logAudit(db, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'MODIFICACION_USUARIO',
      entidad: 'inv_usuarios',
      entidad_id: targetId,
      detalles_previos: { nombre: targetUser.nombre, rol: targetUser.rol, activo: targetUser.activo },
      detalles_nuevos: req.body,
      req
    });

    res.json({ success: true, message: 'Usuario actualizado exitosamente.' });
  } catch (error) {
    console.error('Update usuario error:', error);
    res.status(500).json({ success: false, message: 'Error actualizando usuario.' });
  }
});

router.patch('/usuarios/:id/estado', requireAuth, requireDeveloper, async (req, res) => {
  try {
    const db = getPool();
    const targetId = parseInt(req.params.id);
    const { activo } = req.body;

    const [prevRows] = await db.query('SELECT id, nombre, rol, es_developer, activo FROM inv_usuarios WHERE id = ?', [targetId]);
    if (prevRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    }
    const targetUser = prevRows[0];

    if (targetUser.es_developer === 1 || targetUser.rol === 'developer') {
      return res.status(403).json({ success: false, message: 'No se puede desactivar la cuenta del Desarrollador Principal.' });
    }

    const nuevoActivo = activo ? 1 : 0;
    await db.query('UPDATE inv_usuarios SET activo = ? WHERE id = ?', [nuevoActivo, targetId]);

    await logAudit(db, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'CAMBIO_ESTADO_USUARIO',
      entidad: 'inv_usuarios',
      entidad_id: targetId,
      detalles_previos: { activo: targetUser.activo },
      detalles_nuevos: { activo: nuevoActivo },
      req
    });

    res.json({
      success: true,
      message: `Cuenta de usuario ${nuevoActivo ? 'activada' : 'desactivada'} correctamente.`,
      activo: nuevoActivo
    });
  } catch (error) {
    console.error('Change status error:', error);
    res.status(500).json({ success: false, message: 'Error modificando estado del usuario.' });
  }
});

router.put('/usuarios/:id/permisos', requireAuth, requireDeveloper, async (req, res) => {
  try {
    const db = getPool();
    const targetId = parseInt(req.params.id);
    const { permisos } = req.body;

    if (!Array.isArray(permisos)) {
      return res.status(400).json({ success: false, message: 'El campo permisos debe ser un arreglo de cadenas.' });
    }

    const [prevRows] = await db.query('SELECT id, nombre, permisos_json, es_developer FROM inv_usuarios WHERE id = ?', [targetId]);
    if (prevRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    }

    const permisosStr = JSON.stringify(permisos);
    await db.query('UPDATE inv_usuarios SET permisos_json = ? WHERE id = ?', [permisosStr, targetId]);

    await logAudit(db, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'ASIGNACION_PERMISOS',
      entidad: 'inv_usuarios',
      entidad_id: targetId,
      detalles_previos: { permisos: prevRows[0].permisos_json },
      detalles_nuevos: { permisos },
      req
    });

    res.json({ success: true, message: 'Permisos actualizados correctamente.', permisos });
  } catch (error) {
    console.error('Update permisos error:', error);
    res.status(500).json({ success: false, message: 'Error actualizando permisos.' });
  }
});

router.post('/usuarios/:id/recuperar', requireAuth, requireDeveloper, async (req, res) => {
  try {
    const db = getPool();
    const targetId = parseInt(req.params.id);
    const { nuevaPassword } = req.body;

    if (!nuevaPassword || nuevaPassword.trim().length < 8) {
      return res.status(400).json({ success: false, message: 'La nueva contraseña debe tener al menos 8 caracteres.' });
    }

    const [prevRows] = await db.query('SELECT id, nombre, email FROM inv_usuarios WHERE id = ?', [targetId]);
    if (prevRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    }

    const hash = hashPassword(nuevaPassword.trim());
    await db.query('UPDATE inv_usuarios SET password_hash = ? WHERE id = ?', [hash, targetId]);

    await logAudit(db, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'RECUPERACION_ACCESO_USUARIO',
      entidad: 'inv_usuarios',
      entidad_id: targetId,
      detalles_nuevos: { recuperadoPor: req.user.nombre },
      req
    });

    res.json({ success: true, message: `Contraseña restablecida exitosamente para ${prevRows[0].email}.` });
  } catch (error) {
    console.error('Recovery error:', error);
    res.status(500).json({ success: false, message: 'Error restableciendo acceso.' });
  }
});

router.get('/usuarios/auditoria', requireAuth, requireDeveloper, async (req, res) => {
  try {
    const db = getPool();
    const [rows] = await db.query(`
      SELECT * FROM inv_auditoria
      WHERE entidad = 'inv_usuarios'
         OR accion IN ('CREACION_USUARIO', 'MODIFICACION_USUARIO', 'CAMBIO_ESTADO_USUARIO', 'ASIGNACION_PERMISOS', 'RECUPERACION_ACCESO_USUARIO')
      ORDER BY fecha DESC
      LIMIT 100
    `);
    res.json({ success: true, logs: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error consultando auditoría de usuarios.' });
  }
});

// ==========================================
// 8. CAMPAMENTOS Y ALMACENES (UBICACIONES DINÁMICAS)
// ==========================================

router.get('/campamentos', requireAuth, async (req, res) => {
  try {
    const db = getPool();
    const scope = await getUserAllowedCampamentos(db, req.user);
    const includeSynthetic = req.query.incluir_sinteticos === 'true';
    const soloConfirmados = req.query.solo_confirmados === 'true';

    let campsQuery = `
      SELECT c.*,
             (SELECT COUNT(*) FROM inv_articulos a WHERE a.campamento_id = c.id AND a.activo = 1 ${includeSynthetic ? '' : 'AND a.es_sintetico = 0'}) as total_articulos,
             (SELECT COALESCE(SUM(COALESCE(a.cantidad_num, 0)), 0) FROM inv_articulos a WHERE a.campamento_id = c.id AND a.activo = 1 ${includeSynthetic ? '' : 'AND a.es_sintetico = 0'}) as total_fisico,
             (SELECT COUNT(*) FROM inv_articulos a WHERE a.campamento_id = c.id AND a.activo = 1 AND (a.cantidad_num IS NULL OR a.cantidad_verificada = 0) ${includeSynthetic ? '' : 'AND a.es_sintetico = 0'}) as articulos_sin_cantidad
      FROM inv_campamentos c
      WHERE c.activo = 1
    `;
    if (!includeSynthetic) {
      campsQuery += ' AND c.es_sintetico = 0';
    }
    if (soloConfirmados) {
      campsQuery += " AND c.clasificacion_sede = 'CONFIRMADO'";
    }
    const campsParams = [];
    if (!scope.isGlobal) {
      if (scope.campamentoIds.length > 0) {
        campsQuery += ' AND c.id IN (?)';
        campsParams.push(scope.campamentoIds);
      } else {
        campsQuery += ' AND 1 = 0';
      }
    }
    campsQuery += " ORDER BY CASE WHEN c.clasificacion_sede = 'CONFIRMADO' THEN 0 ELSE 1 END ASC, c.id ASC";

    const [camps] = await db.query(campsQuery, campsParams);
    const [alms] = await db.query(
      `SELECT * FROM inv_almacenes WHERE activo = 1 ${includeSynthetic ? '' : 'AND es_sintetico = 0'} ORDER BY id ASC`
    );

    const result = camps.map(c => ({
      ...c,
      total_articulos: parseInt(c.total_articulos || 0),
      total_fisico: parseFloat(c.total_fisico || 0),
      articulos_sin_cantidad: parseInt(c.articulos_sin_cantidad || 0),
      almacenes: alms.filter(a => a.campamento_id === c.id)
    }));

    let sinSedeVerificada = null;
    if (scope.isGlobal) {
      const [sinSedeRows] = await db.query(`
        SELECT COUNT(*) as total_articulos,
               COALESCE(SUM(COALESCE(cantidad_num, 0)), 0) as total_fisico,
               SUM(CASE WHEN cantidad_num IS NULL OR cantidad_verificada = 0 THEN 1 ELSE 0 END) as articulos_sin_cantidad
        FROM inv_articulos
        WHERE activo = 1 AND campamento_id IS NULL ${includeSynthetic ? '' : 'AND es_sintetico = 0'}
      `);
      const sr = sinSedeRows[0] || {};
      sinSedeVerificada = {
        id: 'SIN_SEDE',
        nombre: 'SIN SEDE VERIFICADA (PENDIENTE DE CLASIFICACIÓN)',
        codigo: 'PEND-SEDE',
        ubicacion_historica: 'KM 19 AUT DUARTE',
        clasificacion_sede: 'SEDE_AMBIGUA',
        total_articulos: parseInt(sr.total_articulos || 0),
        total_fisico: parseFloat(sr.total_fisico || 0),
        articulos_sin_cantidad: parseInt(sr.articulos_sin_cantidad || 0)
      };
    }

    res.json({
      success: true,
      campamentos: result,
      sin_sede_verificada: sinSedeVerificada
    });
  } catch (error) {
    console.error('List campamentos error:', error);
    res.status(500).json({ success: false, message: 'Error consultando campamentos.' });
  }
});

router.post('/campamentos', requireAuth, requireRole(['admin', 'almacen', 'supervisor']), async (req, res) => {
  try {
    const db = getPool();
    const { nombre, codigo, provincia, direccion, responsable, telefono, almacenesIniciales } = req.body;

    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ success: false, message: 'El nombre del campamento es obligatorio.' });
    }

    const cleanNombre = nombre.trim().toUpperCase();
    const [existing] = await db.query('SELECT id FROM inv_campamentos WHERE nombre = ?', [cleanNombre]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: `Ya existe un campamento registrado como "${cleanNombre}".` });
    }

    const [resCamp] = await db.query(
      `INSERT INTO inv_campamentos (nombre, codigo, provincia, direccion, responsable, telefono, activo)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [cleanNombre, codigo || null, provincia || null, direccion || null, responsable || null, telefono || null]
    );

    const campamentoId = resCamp.insertId;

    // Create initial almacén if provided or default
    const almacenesToCreate = Array.isArray(almacenesIniciales) && almacenesIniciales.length > 0
      ? almacenesIniciales
      : [{ nombre: `Almacén Principal ${cleanNombre}`, tipo: 'General', encargado: responsable || null }];

    for (const alm of almacenesToCreate) {
      if (alm.nombre && alm.nombre.trim() !== '') {
        await db.query(
          `INSERT INTO inv_almacenes (campamento_id, nombre, tipo, encargado, descripcion, activo)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [campamentoId, alm.nombre.trim(), alm.tipo || 'General', alm.encargado || responsable || null, alm.descripcion || null]
        );
      }
    }

    await logAudit(db, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'CREACION_CAMPAMENTO',
      entidad: 'inv_campamentos',
      entidad_id: campamentoId,
      detalles_nuevos: { nombre: cleanNombre, provincia, responsable },
      req
    });

    res.status(201).json({
      success: true,
      message: `Campamento "${cleanNombre}" y sus almacenes creados exitosamente.`,
      id: campamentoId
    });
  } catch (error) {
    console.error('Create campamento error:', error);
    res.status(500).json({ success: false, message: 'Error creando campamento.' });
  }
});

router.post('/campamentos/:id/almacenes', requireAuth, requireRole(['admin', 'almacen', 'supervisor']), async (req, res) => {
  try {
    const db = getPool();
    const campamentoId = parseInt(req.params.id);
    const { nombre, tipo = 'General', encargado, descripcion } = req.body;

    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ success: false, message: 'El nombre del almacén es obligatorio.' });
    }

    const [camp] = await db.query('SELECT id, nombre FROM inv_campamentos WHERE id = ?', [campamentoId]);
    if (camp.length === 0) {
      return res.status(404).json({ success: false, message: 'Campamento no encontrado.' });
    }

    const [resAlm] = await db.query(
      `INSERT INTO inv_almacenes (campamento_id, nombre, tipo, encargado, descripcion, activo)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [campamentoId, nombre.trim(), tipo, encargado || null, descripcion || null]
    );

    res.status(201).json({
      success: true,
      message: `Almacén "${nombre}" agregado al campamento "${camp[0].nombre}".`,
      id: resAlm.insertId
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error agregando almacén.' });
  }
});

// ==========================================
// 8.1 CATÁLOGOS DINÁMICOS: CATEGORÍAS Y CUSTODIOS
// ==========================================

router.get('/catalogos/categorias', requireAuth, async (req, res) => {
  try {
    const db = getPool();
    const { area, incluir_sinteticos } = req.query;
    const includeSynthetic = incluir_sinteticos === 'true';
    const normArea = area ? area.toUpperCase().trim() : null;

    let catRows = [];
    try {
      if (normArea && normArea !== 'TODAS') {
        const [rows] = await db.query(
          `SELECT nombre FROM inv_categorias WHERE activo = 1 ${includeSynthetic ? '' : 'AND es_sintetico = 0'} AND area = ? ORDER BY nombre ASC`,
          [normArea]
        );
        catRows = rows.map(r => r.nombre);
      } else {
        const [rows] = await db.query(
          `SELECT nombre FROM inv_categorias WHERE activo = 1 ${includeSynthetic ? '' : 'AND es_sintetico = 0'} ORDER BY nombre ASC`
        );
        catRows = rows.map(r => r.nombre);
      }
    } catch (e) {
      catRows = [];
    }

    // Unificar con valores existentes en inv_articulos
    let artCatQuery = `SELECT DISTINCT categoria FROM inv_articulos WHERE activo = 1 ${includeSynthetic ? '' : 'AND es_sintetico = 0'} AND categoria IS NOT NULL AND categoria != ""`;
    const artCatParams = [];
    if (normArea && normArea !== 'TODAS') {
      artCatQuery += ' AND area = ?';
      artCatParams.push(normArea);
    }
    const [artCatRows] = await db.query(artCatQuery, artCatParams);
    const artCats = artCatRows.map(r => r.categoria);

    // Unificar y desduplicar insensible a mayúsculas/minúsculas
    const seen = new Set();
    const finalCategorias = [];
    for (const c of [...catRows, ...artCats]) {
      const clean = (c || '').trim();
      if (!clean) continue;
      const lower = clean.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        finalCategorias.push(clean);
      }
    }
    finalCategorias.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

    res.json({ success: true, categorias: finalCategorias });
  } catch (error) {
    console.error('List categorias error:', error);
    res.status(500).json({ success: false, message: 'Error consultando catálogo de categorías.' });
  }
});

router.post('/catalogos/categorias', requireAuth, requireRole(['admin', 'almacen', 'supervisor']), async (req, res) => {
  try {
    const db = getPool();
    const { area, nombre } = req.body;
    if (!area || !nombre || !nombre.trim()) {
      return res.status(400).json({ success: false, message: 'Área y nombre de categoría son obligatorios.' });
    }

    const normArea = area.toUpperCase().trim();
    const cleanNombre = nombre.trim();

    // Comprobar duplicado en la base de datos
    try {
      const [existing] = await db.query(
        'SELECT id, nombre FROM inv_categorias WHERE area = ? AND LOWER(nombre) = LOWER(?)',
        [normArea, cleanNombre]
      );
      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          message: `La categoría "${existing[0].nombre}" ya existe para el área ${normArea}.`,
          categoria: existing[0].nombre
        });
      }
    } catch (e) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS inv_categorias (
          id INT AUTO_INCREMENT PRIMARY KEY,
          area VARCHAR(50) NOT NULL,
          nombre VARCHAR(100) NOT NULL,
          activo TINYINT DEFAULT 1,
          creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_area_nombre (area, nombre)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    const [resInsert] = await db.query(
      'INSERT INTO inv_categorias (area, nombre, activo) VALUES (?, ?, 1)',
      [normArea, cleanNombre]
    );

    res.status(201).json({
      success: true,
      message: 'Categoría registrada exitosamente.',
      categoria: {
        id: resInsert.insertId,
        area: normArea,
        nombre: cleanNombre
      }
    });
  } catch (error) {
    console.error('Create categoria error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'La categoría ya existe.' });
    }
    res.status(500).json({ success: false, message: 'Error registrando categoría.' });
  }
});

router.get('/catalogos/custodios', requireAuth, async (req, res) => {
  try {
    const db = getPool();
    const { q, incluir_sinteticos } = req.query;
    const includeSynthetic = incluir_sinteticos === 'true';

    let custRows = [];
    try {
      const [rows] = await db.query(
        `SELECT id, nombre, cargo, departamento, telefono FROM inv_custodios WHERE activo = 1 ${includeSynthetic ? '' : 'AND es_sintetico = 0'} ORDER BY nombre ASC`
      );
      custRows = rows;
    } catch (e) {
      custRows = [];
    }

    // Unificar con asignados de inv_articulos
    const [artCusts] = await db.query(
      `SELECT DISTINCT asignado_a as nombre FROM inv_articulos WHERE activo = 1 ${includeSynthetic ? '' : 'AND es_sintetico = 0'} AND asignado_a IS NOT NULL AND asignado_a != ""`
    );

    // Unificar con responsables de inv_levantamiento_items
    let levCusts = [];
    try {
      const [rows] = await db.query(
        `SELECT DISTINCT responsable_custodio as nombre FROM inv_levantamiento_items WHERE responsable_custodio IS NOT NULL AND responsable_custodio != "" ${includeSynthetic ? '' : 'AND es_sintetico = 0'}`
      );
      levCusts = rows;
    } catch (e) {}

    const map = new Map();
    const addCust = (item) => {
      const name = (item.nombre || '').trim();
      if (!name || name === 'N/A' || name === 'S/C' || name === 'Sin asignar' || name === 'Sin Responsable') return;
      const lower = name.toLowerCase();
      if (!map.has(lower)) {
        map.set(lower, {
          id: item.id || null,
          nombre: name,
          cargo: item.cargo || 'Personal de Campo',
          departamento: item.departamento || null,
          telefono: item.telefono || null
        });
      }
    };

    custRows.forEach(addCust);
    artCusts.forEach(addCust);
    levCusts.forEach(addCust);

    let list = Array.from(map.values());
    if (q && q.trim()) {
      const searchLower = q.trim().toLowerCase();
      list = list.filter(c => c.nombre.toLowerCase().includes(searchLower) || (c.cargo && c.cargo.toLowerCase().includes(searchLower)));
    }

    list.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));

    res.json({ success: true, custodios: list });
  } catch (error) {
    console.error('List custodios error:', error);
    res.status(500).json({ success: false, message: 'Error consultando catálogo de custodios.' });
  }
});

router.post('/catalogos/custodios', requireAuth, requireRole(['admin', 'almacen', 'supervisor']), async (req, res) => {
  try {
    const db = getPool();
    const { nombre, cargo, departamento, telefono } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ success: false, message: 'El nombre del custodio o responsable es obligatorio.' });
    }

    const cleanNombre = nombre.trim();

    // Comprobar duplicado en la base de datos
    try {
      const [existing] = await db.query(
        'SELECT id, nombre FROM inv_custodios WHERE LOWER(nombre) = LOWER(?)',
        [cleanNombre]
      );
      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          message: `El responsable "${existing[0].nombre}" ya existe en el catálogo.`,
          custodio: existing[0]
        });
      }
    } catch (e) {
      await db.query(`
        CREATE TABLE IF NOT EXISTS inv_custodios (
          id INT AUTO_INCREMENT PRIMARY KEY,
          nombre VARCHAR(150) NOT NULL,
          cargo VARCHAR(100) NULL,
          departamento VARCHAR(100) NULL,
          telefono VARCHAR(50) NULL,
          activo TINYINT DEFAULT 1,
          creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_custodio_nombre (nombre)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    const [resInsert] = await db.query(
      'INSERT INTO inv_custodios (nombre, cargo, departamento, telefono, activo) VALUES (?, ?, ?, ?, 1)',
      [cleanNombre, cargo ? cargo.trim() : 'Personal de Campo', departamento ? departamento.trim() : null, telefono ? telefono.trim() : null]
    );

    res.status(201).json({
      success: true,
      message: 'Responsable registrado exitosamente.',
      custodio: {
        id: resInsert.insertId,
        nombre: cleanNombre,
        cargo: cargo ? cargo.trim() : 'Personal de Campo'
      }
    });
  } catch (error) {
    console.error('Create custodio error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'El responsable ya existe.' });
    }
    res.status(500).json({ success: false, message: 'Error registrando responsable.' });
  }
});

router.get('/catalogos/ubicaciones', requireAuth, async (req, res) => {
  try {
    const db = getPool();
    const includeSynthetic = req.query.incluir_sinteticos === 'true';

    // 1. Campamentos de inv_campamentos (excluyendo sintéticos por defecto)
    let campRows = [];
    try {
      const [rows] = await db.query(
        `SELECT id, nombre, codigo, provincia, responsable, clasificacion_sede
         FROM inv_campamentos
         WHERE activo = 1 ${includeSynthetic ? '' : 'AND es_sintetico = 0'}
         ORDER BY CASE WHEN clasificacion_sede = 'CONFIRMADO' THEN 0 ELSE 1 END ASC, id ASC`
      );
      campRows = rows;
    } catch (e) {
      campRows = [];
    }

    // 2. Ubicaciones históricas en inv_articulos
    let artUbicRows = [];
    try {
      const [rows] = await db.query(
        `SELECT DISTINCT ubicacion_nombre FROM inv_articulos WHERE activo = 1 ${includeSynthetic ? '' : 'AND es_sintetico = 0'} AND ubicacion_nombre IS NOT NULL AND ubicacion_nombre != ""`
      );
      artUbicRows = rows.map(r => r.ubicacion_nombre);
    } catch (e) {
      artUbicRows = [];
    }

    // Desduplicar y unificar priorizando Campamentos Confirmados
    const map = new Map();
    for (const c of campRows) {
      const clean = (c.nombre || '').trim();
      if (!clean) continue;
      const lower = clean.toLowerCase();
      map.set(lower, {
        nombre: clean,
        tipo: c.clasificacion_sede === 'CONFIRMADO' ? 'Campamento Confirmado' : 'Campamento Pendiente de Validación',
        clasificacion_sede: c.clasificacion_sede || 'CONFIRMADO',
        provincia: c.provincia || null,
        campamento_id: c.id
      });
    }

    for (const u of artUbicRows) {
      const clean = (u || '').trim();
      if (!clean) continue;
      const lower = clean.toLowerCase();
      if (!map.has(lower)) {
        const vinc = resolveCampamentoVinculacion(null, clean);
        map.set(lower, {
          nombre: clean,
          tipo: vinc.estado_vinculacion_sede === 'SEDE_AMBIGUA' ? 'Ubicación Histórica (Sede Ambigua)' : 'Ubicación Histórica Excel',
          clasificacion_sede: vinc.estado_vinculacion_sede,
          provincia: null,
          campamento_id: vinc.campamento_id
        });
      }
    }

    const list = Array.from(map.values());

    res.json({ success: true, ubicaciones: list });
  } catch (error) {
    console.error('List ubicaciones error:', error);
    res.status(500).json({ success: false, message: 'Error consultando catálogo de ubicaciones.' });
  }
});

// ==========================================
// 9. LEVANTAMIENTOS FÍSICOS (AUDITORÍAS EN CAMPO)
// ==========================================

router.get('/levantamientos', requireAuth, requirePermission('lev:ver'), async (req, res) => {
  try {
    const db = getPool();
    const scope = await getUserAllowedCampamentos(db, req.user);
    const { estado, campamento_id, incluir_sinteticos } = req.query;
    const includeSynthetic = incluir_sinteticos === 'true';

    const conditions = ['1 = 1'];
    if (!includeSynthetic) {
      conditions.push('l.es_sintetico = 0');
    }
    const params = [];

    if (!scope.isGlobal) {
      if (scope.campamentoIds.length > 0) {
        conditions.push('l.campamento_id IN (?)');
        params.push(scope.campamentoIds);
      } else {
        conditions.push('1 = 0');
      }
    }

    if (estado && estado !== 'TODOS') {
      conditions.push('l.estado = ?');
      params.push(estado);
    }

    if (campamento_id) {
      const cId = parseInt(campamento_id);
      if (!scope.isGlobal && !scope.campamentoIds.includes(cId)) {
        return res.status(403).json({ success: false, message: 'Acceso denegado al campamento solicitado.' });
      }
      conditions.push('l.campamento_id = ?');
      params.push(cId);
    }

    const query = `
      SELECT l.*,
             c.nombre as campamento_nombre,
             c.provincia as campamento_provincia,
             a.nombre as almacen_nombre,
             u.nombre as creador_nombre,
             (SELECT COUNT(*) FROM inv_levantamiento_items WHERE levantamiento_id = l.id) as total_items_actual,
             (SELECT COUNT(DISTINCT area) FROM inv_levantamiento_items WHERE levantamiento_id = l.id) as areas_con_items
      FROM inv_levantamientos l
      JOIN inv_campamentos c ON l.campamento_id = c.id
      LEFT JOIN inv_almacenes a ON l.almacen_id = a.id
      LEFT JOIN inv_usuarios u ON l.creado_por = u.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY l.creado_en DESC
    `;

    const [rows] = await db.query(query, params);
    res.json({ success: true, levantamientos: rows });
  } catch (error) {
    console.error('List levantamientos error:', error);
    res.status(500).json({ success: false, message: 'Error consultando levantamientos.' });
  }
});

router.post('/levantamientos', requireAuth, requirePermission('lev:crear'), async (req, res) => {
  try {
    const db = getPool();
    const scope = await getUserAllowedCampamentos(db, req.user);
    const {
      titulo,
      campamento_id,
      almacen_id,
      fecha_inicio,
      responsable_levantamiento,
      equipo_auditor,
      notas
    } = req.body;

    const actualFechaInicio = fecha_inicio || new Date().toISOString().split('T')[0];

    if (!titulo || !campamento_id || !responsable_levantamiento) {
      return res.status(400).json({
        success: false,
        message: 'Título, campamento y responsable son obligatorios.'
      });
    }

    const cId = parseInt(campamento_id);
    if (!scope.isGlobal && !scope.campamentoIds.includes(cId)) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: No tiene autorización para crear levantamientos en este campamento.'
      });
    }

    // Auto-generate code e.g. LEV-2026-SC-001
    const [cRows] = await db.query('SELECT codigo, nombre FROM inv_campamentos WHERE id = ?', [campamento_id]);
    const campCode = cRows.length > 0 && cRows[0].codigo ? cRows[0].codigo : 'CAMP';
    const year = new Date(actualFechaInicio).getFullYear() || 2026;
    const [countRows] = await db.query('SELECT COUNT(*) as cnt FROM inv_levantamientos');
    const nextSeq = String(countRows[0].cnt + 1).padStart(3, '0');
    const codigoLev = `LEV-${year}-${campCode}-${nextSeq}`;

    const [insertRes] = await db.query(
      `INSERT INTO inv_levantamientos (
        codigo_levantamiento, titulo, campamento_id, almacen_id, fecha_inicio,
        responsable_levantamiento, equipo_auditor, estado, notas, creado_por
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'En proceso', ?, ?)`,
      [
        codigoLev,
        titulo.trim(),
        campamento_id,
        almacen_id || null,
        actualFechaInicio,
        responsable_levantamiento.trim(),
        equipo_auditor || null,
        notas || null,
        req.user.id
      ]
    );

    await logAudit(db, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'CREACION_LEVANTAMIENTO',
      entidad: 'inv_levantamientos',
      entidad_id: insertRes.insertId,
      detalles_nuevos: { codigoLev, titulo, campamento_id },
      req
    });

    res.status(201).json({
      success: true,
      message: `Sesión de levantamiento "${codigoLev}" iniciada con éxito.`,
      id: insertRes.insertId,
      codigo: codigoLev
    });
  } catch (error) {
    console.error('Create levantamiento error:', error);
    res.status(500).json({ success: false, message: 'Error creando sesión de levantamiento.' });
  }
});

router.get('/levantamientos/:id', requireAuth, requirePermission('lev:ver'), async (req, res) => {
  try {
    const db = getPool();
    const id = parseInt(req.params.id);

    const [levs] = await db.query(`
      SELECT l.*,
             c.nombre as campamento_nombre,
             c.provincia as campamento_provincia,
             a.nombre as almacen_nombre,
             u.nombre as creador_nombre
      FROM inv_levantamientos l
      JOIN inv_campamentos c ON l.campamento_id = c.id
      LEFT JOIN inv_almacenes a ON l.almacen_id = a.id
      LEFT JOIN inv_usuarios u ON l.creado_por = u.id
      WHERE l.id = ?
    `, [id]);

    if (levs.length === 0) {
      return res.status(404).json({ success: false, message: 'Levantamiento no encontrado.' });
    }
    const lev = levs[0];

    const scope = await getUserAllowedCampamentos(db, req.user);
    if (!scope.isGlobal && !scope.campamentoIds.includes(lev.campamento_id)) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: El levantamiento pertenece a una sede o campamento no autorizado.'
      });
    }

    // Stats by Area in this levantamiento
    const [areaStats] = await db.query(`
      SELECT area, COUNT(*) as cantidad, SUM(cantidad) as total_unidades
      FROM inv_levantamiento_items
      WHERE levantamiento_id = ?
      GROUP BY area
    `, [id]);

    // Stats by Physical State
    const [stateStats] = await db.query(`
      SELECT estado_fisico, COUNT(*) as cantidad
      FROM inv_levantamiento_items
      WHERE levantamiento_id = ?
      GROUP BY estado_fisico
    `, [id]);

    res.json({
      success: true,
      levantamiento: lev,
      estadisticas: {
        porArea: areaStats,
        porEstado: stateStats
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error consultando levantamiento.' });
  }
});

const ESTADOS_LEVANTAMIENTO_VALIDOS = ['En preparación', 'En proceso', 'Pendiente de revisión', 'Finalizado', 'Cancelado'];

const TRANSICIONES_LEVANTAMIENTO = {
  'En preparación': ['En preparación', 'En proceso', 'Cancelado'],
  'En proceso': ['En proceso', 'En preparación', 'Pendiente de revisión', 'Cancelado'],
  'Pendiente de revisión': ['Pendiente de revisión', 'En proceso', 'Cancelado'],
  'Finalizado': [], // Finalizado es inmutable y no permite modificaciones
  'Cancelado': []   // Cancelado es estado terminal
};

router.put('/levantamientos/:id', requireAuth, requirePermission('lev:editar'), async (req, res) => {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    const id = parseInt(req.params.id);
    const { titulo, responsable_levantamiento, equipo_auditor, estado, notas, fecha_fin } = req.body;

    await conn.beginTransaction();

    // Bloqueo exclusivo FOR UPDATE para evitar colisiones con consolidaciones concurrentes
    const [existingRows] = await conn.query('SELECT * FROM inv_levantamientos WHERE id = ? FOR UPDATE', [id]);
    if (existingRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Levantamiento no encontrado.' });
    }
    const currentLev = existingRows[0];

    const scope = await getUserAllowedCampamentos(conn, req.user);
    if (!scope.isGlobal && !scope.campamentoIds.includes(currentLev.campamento_id)) {
      await conn.rollback();
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: No tiene autorización para modificar levantamientos de este campamento.'
      });
    }

    // SEC-10 / QA-02: Bloqueo estricto de edición para levantamientos finalizados
    if (currentLev.estado === 'Finalizado') {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        message: 'No se puede modificar una auditoría en estado Finalizado. Los registros se encuentran protegidos contra escritura.'
      });
    }

    if (currentLev.estado === 'Cancelado') {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        message: 'No se puede modificar una auditoría cancelada.'
      });
    }

    // Regla de transición: Finalizado sólo es alcanzable mediante /consolidar
    if (estado === 'Finalizado') {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: 'El estado Finalizado únicamente puede alcanzarse mediante la consolidación de la auditoría (/consolidar).'
      });
    }

    if (estado !== undefined && estado !== null) {
      if (!ESTADOS_LEVANTAMIENTO_VALIDOS.includes(estado)) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: `Estado no válido. Valores permitidos: ${ESTADOS_LEVANTAMIENTO_VALIDOS.join(', ')}.`
        });
      }

      const permitidos = TRANSICIONES_LEVANTAMIENTO[currentLev.estado] || [];
      if (!permitidos.includes(estado)) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: `Transición de estado no permitida: no se puede cambiar de "${currentLev.estado}" a "${estado}".`
        });
      }
    }

    await conn.query(`
      UPDATE inv_levantamientos SET
        titulo = COALESCE(?, titulo),
        responsable_levantamiento = COALESCE(?, responsable_levantamiento),
        equipo_auditor = COALESCE(?, equipo_auditor),
        estado = COALESCE(?, estado),
        notas = COALESCE(?, notas),
        fecha_fin = COALESCE(?, fecha_fin)
      WHERE id = ?
    `, [titulo, responsable_levantamiento, equipo_auditor, estado, notas, fecha_fin, id]);

    await logAudit(conn, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'ACTUALIZAR_LEVANTAMIENTO',
      entidad: 'inv_levantamientos',
      entidad_id: id,
      detalles_previos: {
        titulo: currentLev.titulo,
        estado: currentLev.estado,
        responsable: currentLev.responsable_levantamiento
      },
      detalles_nuevos: {
        titulo: titulo || currentLev.titulo,
        estado: estado || currentLev.estado,
        responsable: responsable_levantamiento || currentLev.responsable_levantamiento
      },
      req
    });

    await conn.commit();

    res.json({ success: true, message: 'Levantamiento actualizado con éxito.' });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ success: false, message: 'Error actualizando sesión de levantamiento.' });
  } finally {
    conn.release();
  }
});

// ==========================================
// 10. ARTÍCULOS DE LA SESIÓN DE LEVANTAMIENTO (ITEMS)
// ==========================================

router.get('/levantamientos/:id/items', requireAuth, requirePermission('lev:ver'), async (req, res) => {
  try {
    const db = getPool();
    const levId = parseInt(req.params.id);
    const { area, search, estado_fisico } = req.query;

    const [levRows] = await db.query('SELECT id, campamento_id FROM inv_levantamientos WHERE id = ?', [levId]);
    if (levRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Levantamiento no encontrado.' });
    }
    const scope = await getUserAllowedCampamentos(db, req.user);
    if (!scope.isGlobal && !scope.campamentoIds.includes(levRows[0].campamento_id)) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: El levantamiento pertenece a una sede no autorizada.'
      });
    }

    const conditions = ['levantamiento_id = ?'];
    const params = [levId];

    if (area && area !== 'TODAS') {
      conditions.push('area = ?');
      params.push(area.toUpperCase());
    }

    if (estado_fisico && estado_fisico !== 'TODOS') {
      const norm = normalizeEstadoParam(estado_fisico);
      conditions.push('estado_fisico = ?');
      params.push(norm);
    }

    if (search && search.trim() !== '') {
      const q = `%${search.trim()}%`;
      conditions.push('(articulo_nombre LIKE ? OR codigo_original LIKE ? OR serie_imei LIKE ? OR marca LIKE ? OR responsable_custodio LIKE ?)');
      params.push(q, q, q, q, q);
    }

    const [rows] = await db.query(
      `SELECT * FROM inv_levantamiento_items
       WHERE ${conditions.join(' AND ')}
       ORDER BY id DESC`,
      params
    );

    res.json({ success: true, items: rows, total: rows.length });
  } catch (error) {
    console.error('List items levantamiento error:', error);
    res.status(500).json({ success: false, message: 'Error listando artículos del levantamiento.' });
  }
});

// Fast Capture Add Item to Levantamiento (Con bloqueo concurrente FOR UPDATE)
router.post('/levantamientos/:id/items', requireAuth, requirePermission('lev:capturar'), async (req, res) => {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    const levId = parseInt(req.params.id);
    const {
      codigo_original,
      area = 'ALMACEN',
      categoria = 'General',
      articulo_nombre,
      marca,
      modelo_caracteristicas,
      serie_imei,
      cantidad = 1,
      unidad_medida = 'Unidad',
      estado_fisico = 'Bueno',
      propietario = 'INGMELEC',
      responsable_custodio,
      ubicacion_exacta,
      fecha_revision,
      observaciones,
      evidencia_foto
    } = req.body;

    if (!articulo_nombre || articulo_nombre.trim() === '') {
      return res.status(400).json({ success: false, message: 'La descripción del artículo es obligatoria.' });
    }

    await conn.beginTransaction();

    // Bloqueo FOR UPDATE sobre el levantamiento para prevenir condición de carrera con consolidación
    const [levRows] = await conn.query('SELECT id, estado, campamento_id FROM inv_levantamientos WHERE id = ? FOR UPDATE', [levId]);
    if (levRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Levantamiento no encontrado.' });
    }
    if (levRows[0].estado === 'Finalizado') {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        message: 'No se pueden registrar artículos en un levantamiento Finalizado.'
      });
    }

    const scope = await getUserAllowedCampamentos(conn, req.user);
    if (!scope.isGlobal && !scope.campamentoIds.includes(levRows[0].campamento_id)) {
      await conn.rollback();
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: No tiene autorización para agregar artículos en este campamento.'
      });
    }

    // Quantity validation
    const cantNum = Number(cantidad);
    if (isNaN(cantNum) || cantNum <= 0) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'La cantidad debe ser un número estrictamente mayor a cero.' });
    }
    if (Number(cantNum.toFixed(2)) !== cantNum) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'La cantidad no puede tener más de 2 cifras decimales.' });
    }

    // Physical status normalization
    const estadoFisicoNormalizado = normalizeEstadoFisico(estado_fisico);

    // Check potential duplicate within session or master inventory
    let advertenciaDuplicado = null;
    if (serie_imei && serie_imei.trim() !== '' && serie_imei.trim() !== 'N/A') {
      const [dupSession] = await conn.query(
        'SELECT id, articulo_nombre FROM inv_levantamiento_items WHERE levantamiento_id = ? AND serie_imei = ?',
        [levId, serie_imei.trim()]
      );
      if (dupSession.length > 0) {
        advertenciaDuplicado = `Aviso: El serial/IMEI "${serie_imei}" ya fue registrado en esta auditoría (#${dupSession[0].id} - ${dupSession[0].articulo_nombre}).`;
      } else {
        const [dupMaster] = await conn.query(
          'SELECT id, articulo_nombre, ubicacion_nombre FROM inv_articulos WHERE activo = 1 AND serie_imei = ?',
          [serie_imei.trim()]
        );
        if (dupMaster.length > 0) {
          advertenciaDuplicado = `Aviso: El serial/IMEI "${serie_imei}" ya existe en el inventario maestro (${dupMaster[0].ubicacion_nombre}).`;
        }
      }
    }

    const [insertRes] = await conn.query(
      `INSERT INTO inv_levantamiento_items (
        levantamiento_id, codigo_original, area, categoria, articulo_nombre,
        marca, modelo_caracteristicas, serie_imei, cantidad, unidad_medida,
        estado_fisico, propietario, responsable_custodio, ubicacion_exacta,
        fecha_revision, observaciones, evidencia_foto, creado_por
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        levId,
        codigo_original || null,
        area.toUpperCase(),
        categoria,
        articulo_nombre.trim(),
        marca || null,
        modelo_caracteristicas || null,
        serie_imei || null,
        cantNum,
        unidad_medida || 'Unidad',
        estadoFisicoNormalizado,
        propietario || 'INGMELEC',
        responsable_custodio || null,
        ubicacion_exacta || null,
        fecha_revision || null,
        observaciones || null,
        evidencia_foto || null,
        req.user.id
      ]
    );

    // Update item counter on session
    await conn.query(
      'UPDATE inv_levantamientos SET total_articulos_capturados = (SELECT COUNT(*) FROM inv_levantamiento_items WHERE levantamiento_id = ?) WHERE id = ?',
      [levId, levId]
    );

    // Audit trail inside transaction
    await logAudit(conn, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'CREAR_ITEM_LEVANTAMIENTO',
      entidad: 'inv_levantamiento_items',
      entidad_id: insertRes.insertId,
      detalles_nuevos: {
        levantamiento_id: levId,
        articulo_nombre: articulo_nombre.trim(),
        cantidad: cantNum,
        serie_imei: serie_imei || null,
        estado_fisico: estadoFisicoNormalizado
      },
      req
    });

    await conn.commit();

    res.status(201).json({
      success: true,
      message: 'Artículo guardado en la auditoría.',
      id: insertRes.insertId,
      advertencia: advertenciaDuplicado
    });
  } catch (error) {
    await conn.rollback();
    console.error('Insert levantamiento item error:', error);
    res.status(500).json({ success: false, message: 'Error guardando artículo en el levantamiento.' });
  } finally {
    conn.release();
  }
});

router.put('/levantamientos/:id/items/:itemId', requireAuth, requirePermission('lev:editar'), async (req, res) => {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    const { id: levId, itemId } = req.params;
    const {
      codigo_original,
      area,
      categoria,
      articulo_nombre,
      marca,
      modelo_caracteristicas,
      serie_imei,
      cantidad,
      unidad_medida,
      estado_fisico,
      propietario,
      responsable_custodio,
      ubicacion_exacta,
      observaciones
    } = req.body;

    await conn.beginTransaction();

    // Bloqueo exclusivo FOR UPDATE sobre el ítem y levantamiento para proteger contra concurrencia
    const [itemRows] = await conn.query(
      `SELECT i.*, l.estado as lev_estado, l.campamento_id
       FROM inv_levantamiento_items i
       JOIN inv_levantamientos l ON i.levantamiento_id = l.id
       WHERE i.id = ? AND i.levantamiento_id = ? FOR UPDATE`,
      [itemId, levId]
    );

    if (itemRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Artículo no encontrado en este levantamiento.' });
    }
    const currentItem = itemRows[0];

    const scope = await getUserAllowedCampamentos(conn, req.user);
    if (!scope.isGlobal && !scope.campamentoIds.includes(currentItem.campamento_id)) {
      await conn.rollback();
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: El levantamiento pertenece a una sede o campamento no autorizado.'
      });
    }

    // SEC-08 / SEC-10: Bloqueo de edición si el levantamiento está finalizado o el ítem ya fue consolidado
    if (currentItem.lev_estado === 'Finalizado') {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        message: 'No se pueden editar artículos de una auditoría Finalizada.'
      });
    }

    if (currentItem.consolidado === 1) {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        message: 'No se puede modificar un artículo que ya ha sido consolidado en el inventario maestro.'
      });
    }

    let cantNum = null;
    if (cantidad !== undefined && cantidad !== null) {
      cantNum = Number(cantidad);
      if (isNaN(cantNum) || cantNum <= 0) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'La cantidad debe ser mayor a cero.' });
      }
      if (Number(cantNum.toFixed(2)) !== cantNum) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: 'La cantidad no puede tener más de 2 cifras decimales.' });
      }
    }

    const estadoNorm = estado_fisico ? normalizeEstadoFisico(estado_fisico) : null;

    await conn.query(
      `UPDATE inv_levantamiento_items SET
        codigo_original = COALESCE(?, codigo_original),
        area = COALESCE(?, area),
        categoria = COALESCE(?, categoria),
        articulo_nombre = COALESCE(?, articulo_nombre),
        marca = COALESCE(?, marca),
        modelo_caracteristicas = COALESCE(?, modelo_caracteristicas),
        serie_imei = COALESCE(?, serie_imei),
        cantidad = COALESCE(?, cantidad),
        unidad_medida = COALESCE(?, unidad_medida),
        estado_fisico = COALESCE(?, estado_fisico),
        propietario = COALESCE(?, propietario),
        responsable_custodio = COALESCE(?, responsable_custodio),
        ubicacion_exacta = COALESCE(?, ubicacion_exacta),
        observaciones = COALESCE(?, observaciones)
      WHERE id = ? AND levantamiento_id = ?`,
      [
        codigo_original,
        area ? area.toUpperCase() : null,
        categoria,
        articulo_nombre,
        marca,
        modelo_caracteristicas,
        serie_imei,
        cantNum,
        unidad_medida,
        estadoNorm,
        propietario,
        responsable_custodio,
        ubicacion_exacta,
        observaciones,
        itemId,
        levId
      ]
    );

    // Audit trail
    await logAudit(conn, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'ACTUALIZAR_ITEM_LEVANTAMIENTO',
      entidad: 'inv_levantamiento_items',
      entidad_id: itemId,
      detalles_previos: {
        articulo_nombre: currentItem.articulo_nombre,
        cantidad: currentItem.cantidad,
        estado_fisico: currentItem.estado_fisico
      },
      detalles_nuevos: req.body,
      req
    });

    await conn.commit();

    res.json({ success: true, message: 'Artículo actualizado correctamente.' });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ success: false, message: 'Error actualizando artículo.' });
  } finally {
    conn.release();
  }
});

router.delete('/levantamientos/:id/items/:itemId', requireAuth, requirePermission('lev:editar'), async (req, res) => {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    const { id: levId, itemId } = req.params;

    await conn.beginTransaction();

    // Bloqueo exclusivo FOR UPDATE sobre el ítem y levantamiento
    const [itemRows] = await conn.query(
      `SELECT i.*, l.estado as lev_estado, l.campamento_id
       FROM inv_levantamiento_items i
       JOIN inv_levantamientos l ON i.levantamiento_id = l.id
       WHERE i.id = ? AND i.levantamiento_id = ? FOR UPDATE`,
      [itemId, levId]
    );

    if (itemRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Artículo no encontrado en este levantamiento.' });
    }
    const currentItem = itemRows[0];

    const scope = await getUserAllowedCampamentos(conn, req.user);
    if (!scope.isGlobal && !scope.campamentoIds.includes(currentItem.campamento_id)) {
      await conn.rollback();
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: El levantamiento pertenece a una sede o campamento no autorizado.'
      });
    }

    if (currentItem.lev_estado === 'Finalizado') {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        message: 'No se pueden eliminar artículos de una auditoría Finalizada.'
      });
    }

    if (currentItem.consolidado === 1) {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        message: 'No se puede eliminar un artículo que ya ha sido consolidado en el inventario maestro.'
      });
    }

    await conn.query('DELETE FROM inv_levantamiento_items WHERE id = ? AND levantamiento_id = ?', [itemId, levId]);

    // Update item counter on session
    await conn.query(
      'UPDATE inv_levantamientos SET total_articulos_capturados = (SELECT COUNT(*) FROM inv_levantamiento_items WHERE levantamiento_id = ?) WHERE id = ?',
      [levId, levId]
    );

    // Audit trail
    await logAudit(conn, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'ELIMINAR_ITEM_LEVANTAMIENTO',
      entidad: 'inv_levantamiento_items',
      entidad_id: itemId,
      detalles_previos: {
        articulo_nombre: currentItem.articulo_nombre,
        serie_imei: currentItem.serie_imei,
        cantidad: currentItem.cantidad
      },
      req
    });

    await conn.commit();

    res.json({ success: true, message: 'Artículo eliminado de la sesión de levantamiento.' });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ success: false, message: 'Error eliminando artículo.' });
  } finally {
    conn.release();
  }
});

// Import Items via Excel into Levantamiento
router.post('/levantamientos/:id/import-items', requireAuth, requirePermission('lev:importar'), async (req, res) => {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    const levId = parseInt(req.params.id);
    const { items = [] } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'No se recibieron artículos para importar.' });
    }
    if (items.length > 5000) {
      return res.status(400).json({
        success: false,
        message: 'El lote de importación excede el límite de seguridad de 5,000 artículos.'
      });
    }

    const [levRows] = await conn.query('SELECT id, estado, campamento_id FROM inv_levantamientos WHERE id = ?', [levId]);
    if (levRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Levantamiento no encontrado.' });
    }

    const scope = await getUserAllowedCampamentos(conn, req.user);
    if (!scope.isGlobal && !scope.campamentoIds.includes(levRows[0].campamento_id)) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: No tiene autorización para importar artículos a este campamento.'
      });
    }

    if (levRows[0].estado === 'Finalizado') {
      return res.status(409).json({
        success: false,
        message: 'No se pueden importar artículos a una auditoría Finalizada.'
      });
    }

    await conn.beginTransaction();

    let insertados = 0;
    const warnings = [];

    for (const item of items) {
      if (!item.articulo_nombre || String(item.articulo_nombre).trim() === '') continue;

      let cant = Number(item.cantidad) || 1;
      if (isNaN(cant) || cant <= 0) cant = 1;
      cant = Number(cant.toFixed(2));

      const estadoFis = normalizeEstadoFisico(item.estado_fisico);

      await conn.query(
        `INSERT INTO inv_levantamiento_items (
          levantamiento_id, codigo_original, area, categoria, articulo_nombre,
          marca, modelo_caracteristicas, serie_imei, cantidad, unidad_medida,
          estado_fisico, propietario, responsable_custodio, ubicacion_exacta,
          observaciones, creado_por
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          levId,
          item.codigo_original || null,
          (item.area || 'ALMACEN').toUpperCase(),
          item.categoria || 'General',
          String(item.articulo_nombre).trim(),
          item.marca || null,
          item.modelo_caracteristicas || null,
          item.serie_imei ? String(item.serie_imei).trim() : null,
          cant,
          item.unidad_medida || 'Unidad',
          estadoFis,
          item.propietario || 'INGMELEC',
          item.responsable_custodio || null,
          item.ubicacion_exacta || null,
          item.observaciones || null,
          req.user.id
        ]
      );
      insertados++;
    }

    // Update counter
    await conn.query(
      'UPDATE inv_levantamientos SET total_articulos_capturados = (SELECT COUNT(*) FROM inv_levantamiento_items WHERE levantamiento_id = ?) WHERE id = ?',
      [levId, levId]
    );

    // Audit trail inside transaction
    await logAudit(conn, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'IMPORTAR_EXCEL_LEVANTAMIENTO',
      entidad: 'inv_levantamientos',
      entidad_id: levId,
      detalles_nuevos: {
        total_importados: insertados
      },
      req
    });

    await conn.commit();

    res.json({
      success: true,
      message: `${insertados} artículos importados con éxito a la sesión de levantamiento.`,
      insertados,
      warnings
    });
  } catch (error) {
    await conn.rollback();
    console.error('Import items error:', error);
    res.status(500).json({ success: false, message: 'Error importando artículos desde Excel.' });
  } finally {
    conn.release();
  }
});

// ==========================================
// 11. CONSOLIDACIÓN AL INVENTARIO MAESTRO (APROBACIÓN FINAL)
// ==========================================

router.post('/levantamientos/:id/consolidar', requireAuth, requirePermission('lev:consolidar'), async (req, res) => {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    const levId = parseInt(req.params.id);
    const {
      resolucion_duplicados,
      autorizar_reubicacion = false,
      autorizar_cambio_custodio = false,
      autorizar_cambio_estado = false
    } = req.body || {};

    await conn.beginTransaction();

    // 1. Get Levantamiento Info
    const [levRows] = await conn.query(`
      SELECT l.*, c.nombre as campamento_nombre
       FROM inv_levantamientos l
      JOIN inv_campamentos c ON l.campamento_id = c.id
      WHERE l.id = ? FOR UPDATE
    `, [levId]);

    if (levRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Levantamiento no encontrado.' });
    }
    const lev = levRows[0];

    const scope = await getUserAllowedCampamentos(conn, req.user);
    if (!scope.isGlobal && !scope.campamentoIds.includes(lev.campamento_id)) {
      await conn.rollback();
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: No tiene autorización para consolidar levantamientos de este campamento.'
      });
    }

    if (lev.estado === 'Finalizado') {
      await conn.rollback();
      return res.status(409).json({ success: false, message: 'Este levantamiento ya fue consolidado y finalizado previamente.' });
    }

    // 2. Get all non-consolidated items in this session
    const [items] = await conn.query(
      'SELECT * FROM inv_levantamiento_items WHERE levantamiento_id = ? AND consolidado = 0 FOR UPDATE',
      [levId]
    );

    if (items.length === 0) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: 'No hay artículos pendientes de consolidar en esta sesión.' });
    }

    // SEC-09 / QA-03 / RECONCILIACIÓN SEGURA DE DUPLICADOS
    const serialsToCheck = items
      .map(it => it.serie_imei ? String(it.serie_imei).trim() : null)
      .filter(s => s && s !== '' && s.toUpperCase() !== 'N/A');

    const dupMap = new Map();

    if (serialsToCheck.length > 0) {
      const [duplicadosExistentes] = await conn.query(
        `SELECT id, codigo_original, articulo_nombre, serie_imei, ubicacion_nombre, asignado_a, estado_fisico, cantidad_num, unidad_medida
         FROM inv_articulos
         WHERE activo = 1 AND serie_imei IN (?)`,
        [serialsToCheck]
      );

      duplicadosExistentes.forEach(d => {
        dupMap.set(String(d.serie_imei).trim().toUpperCase(), d);
      });

      if (dupMap.size > 0 && resolucion_duplicados !== 'VINCULAR_EXISTENTE' && resolucion_duplicados !== 'OMITIR_DUPLICADOS') {
        await conn.rollback();
        return res.status(409).json({
          success: false,
          bloqueado_por_duplicados: true,
          message: `Se detectaron ${dupMap.size} artículo(s) cuyos seriales/IMEI ya existen en el inventario maestro. Debe seleccionar una estrategia de conciliación segura ('VINCULAR_EXISTENTE' u 'OMITIR_DUPLICADOS'). No se permite insertar activos maestros duplicados.`,
          duplicados: duplicadosExistentes.map(d => ({
            id: d.id,
            codigo_original: d.codigo_original,
            articulo_nombre: d.articulo_nombre,
            serie_imei: d.serie_imei,
            ubicacion_actual: d.ubicacion_nombre,
            custodio_actual: d.asignado_a,
            estado_actual: d.estado_fisico
          }))
        });
      }
    }

    let nuevosMaestro = 0;
    let vinculadosConciliados = 0;
    let omitidosDuplicados = 0;
    const campUbicacion = lev.campamento_nombre;

    for (const it of items) {
      const estadoFisicoNormalizado = normalizeEstadoFisico(it.estado_fisico);
      const serialKey = it.serie_imei ? String(it.serie_imei).trim().toUpperCase() : null;
      const masterExistente = serialKey && dupMap.has(serialKey) ? dupMap.get(serialKey) : null;

      if (masterExistente) {
        if (resolucion_duplicados === 'VINCULAR_EXISTENTE') {
          // REGLA FUNDAMENTAL DE INTEGRIDAD: NUNCA INSERTAR UN SEGUNDO ACTIVO CON EL MISMO SERIAL
          // Conciliación segura: vincular ítem de levantamiento al activo maestro preexistente
          // PROTECCIÓN DE INTEGRIDAD (FASE 3): No alterar automáticamente sede, custodio o estado físico sin decisión explícita y autorizada
          const masterId = masterExistente.id;

          const nuevoCampamentoId = autorizar_reubicacion ? lev.campamento_id : masterExistente.campamento_id;
          const nuevaUbicacion = autorizar_reubicacion ? campUbicacion : masterExistente.ubicacion_nombre;
          const nuevaZona = autorizar_reubicacion ? (it.ubicacion_exacta || masterExistente.zona_estante) : masterExistente.zona_estante;
          const nuevoCustodio = autorizar_cambio_custodio ? (it.responsable_custodio || masterExistente.asignado_a) : masterExistente.asignado_a;
          const nuevoEstado = autorizar_cambio_estado ? estadoFisicoNormalizado : masterExistente.estado_fisico;

          await conn.query(`
            UPDATE inv_articulos SET
              campamento_id = ?,
              ubicacion_nombre = ?,
              zona_estante = ?,
              asignado_a = ?,
              estado_fisico = ?,
              fecha_revision = COALESCE(?, NOW()),
              observaciones = CONCAT(COALESCE(observaciones, ''), '\n[Conciliado en levantamiento ', ?, ']')
            WHERE id = ?
          `, [
            nuevoCampamentoId,
            nuevaUbicacion,
            nuevaZona,
            nuevoCustodio,
            nuevoEstado,
            it.fecha_revision || null,
            lev.codigo_levantamiento,
            masterId
          ]);

          // Vincular el ítem de levantamiento al activo maestro preexistente
          await conn.query(
            'UPDATE inv_levantamiento_items SET consolidado = 1, articulo_maestro_id = ? WHERE id = ?',
            [masterId, it.id]
          );

          // Registrar movimiento en historial indicando tipo preciso según cambios autorizados
          const tipoMov = (autorizar_reubicacion && masterExistente.ubicacion_nombre !== campUbicacion)
            ? 'TRASLADO'
            : ((autorizar_cambio_custodio && it.responsable_custodio && it.responsable_custodio !== masterExistente.asignado_a)
              ? 'ASIGNACION'
              : 'AJUSTE');

          const motivoTexto = (tipoMov === 'TRASLADO')
            ? 'Conciliación por Levantamiento en Campo (Reubicación Autorizada)'
            : (tipoMov === 'ASIGNACION'
              ? 'Conciliación por Levantamiento en Campo (Cambio de Custodio Autorizado)'
              : 'Conciliación por Levantamiento en Campo (Verificación física vinculada sin alteración no autorizada)');

          await conn.query(`
            INSERT INTO inv_movimientos (
              articulo_id, tipo_movimiento, cantidad, unidad_medida,
              ubicacion_origen, ubicacion_destino,
              custodio_origen, custodio_destino,
              estado_previo, estado_nuevo,
              motivo, observaciones, usuario_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            masterId,
            tipoMov,
            it.cantidad,
            it.unidad_medida || masterExistente.unidad_medida,
            masterExistente.ubicacion_nombre,
            nuevaUbicacion,
            masterExistente.asignado_a,
            nuevoCustodio,
            masterExistente.estado_fisico,
            nuevoEstado,
            motivoTexto,
            `Sesión de auditoría: ${lev.codigo_levantamiento} (${lev.titulo}) - Serial conciliado: ${it.serie_imei}`,
            req.user.id
          ]);

          vinculadosConciliados++;
          continue;
        } else if (resolucion_duplicados === 'OMITIR_DUPLICADOS') {
          // Excepción autorizada: marcar como omitido para no alterar ni duplicar el maestro
          await conn.query(`
            UPDATE inv_levantamiento_items SET
              consolidado = 2,
              observaciones = CONCAT(COALESCE(observaciones, ''), ' [Omitido en consolidación por serial preexistente en maestro #', ?, ']')
            WHERE id = ?
          `, [masterExistente.id, it.id]);

          omitidosDuplicados++;
          continue;
        }
      }

      // ÍTEM NUEVO (SIN COLISIÓN DE SERIAL): Se incorpora como nuevo activo maestro
      const [insMaster] = await conn.query(
        `INSERT INTO inv_articulos (
          codigo_original, area, categoria, articulo_nombre, marca_modelo,
          tipo_caracteristicas, serie_imei, propietario, asignado_a,
          cantidad_num, cantidad_texto, cantidad_verificada, unidad_medida,
          estado_fisico, ubicacion_nombre, zona_estante, fecha_revision,
          observaciones, evidencia_foto, activo, hoja_origen, fila_origen, creado_por,
          campamento_id, almacen_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?, ?, ?)`,
        [
          it.codigo_original || null,
          it.area,
          it.categoria || 'General',
          it.articulo_nombre,
          it.marca ? (it.modelo_caracteristicas ? `${it.marca} ${it.modelo_caracteristicas}` : it.marca) : (it.modelo_caracteristicas || null),
          it.modelo_caracteristicas || null,
          it.serie_imei || null,
          it.propietario || 'INGMELEC',
          it.responsable_custodio || null,
          it.cantidad,
          String(it.cantidad),
          it.unidad_medida || 'Unidad',
          estadoFisicoNormalizado,
          campUbicacion,
          it.ubicacion_exacta || null,
          it.fecha_revision || new Date().toISOString().slice(0, 10),
          it.observaciones || null,
          it.evidencia_foto || null,
          `LEVANTAMIENTO_${lev.codigo_levantamiento}`,
          req.user.id,
          lev.campamento_id || null,
          lev.almacen_id || null
        ]
      );

      const masterId = insMaster.insertId;

      await conn.query(
        'UPDATE inv_levantamiento_items SET consolidado = 1, articulo_maestro_id = ? WHERE id = ?',
        [masterId, it.id]
      );

      await conn.query(
        `INSERT INTO inv_movimientos (
          articulo_id, tipo_movimiento, cantidad, unidad_medida,
          ubicacion_destino, custodio_destino, estado_nuevo, motivo, observaciones, usuario_id
        ) VALUES (?, 'ENTRADA', ?, ?, ?, ?, ?, 'Incorporación por Levantamiento en Campo', ?, ?)`,
        [
          masterId,
          it.cantidad,
          it.unidad_medida,
          campUbicacion,
          it.responsable_custodio,
          estadoFisicoNormalizado,
          `Sesión de auditoría: ${lev.codigo_levantamiento} (${lev.titulo})`,
          req.user.id
        ]
      );

      nuevosMaestro++;
    }

    // 3. Mark session as Finalizado
    await conn.query(`
      UPDATE inv_levantamientos SET
        estado = 'Finalizado',
        fecha_fin = NOW(),
        consolidado_por = ?,
        fecha_consolidacion = NOW()
      WHERE id = ?
    `, [req.user.id, levId]);

    // 4. Atomic Audit Log inside transaction
    await logAudit(conn, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'CONSOLIDACION_LEVANTAMIENTO',
      entidad: 'inv_levantamientos',
      entidad_id: levId,
      detalles_nuevos: {
        codigo: lev.codigo_levantamiento,
        campamento: campUbicacion,
        articulos_nuevos_incorporados: nuevosMaestro,
        articulos_conciliados_vinculados: vinculadosConciliados,
        articulos_omitidos: omitidosDuplicados,
        estrategia_duplicados: resolucion_duplicados || 'sin_duplicados'
      },
      req
    });

    await conn.commit();

    res.json({
      success: true,
      message: `Levantamiento consolidado exitosamente. ${nuevosMaestro} artículos nuevos incorporados, ${vinculadosConciliados} activos preexistentes vinculados/reubicados, ${omitidosDuplicados} omitidos.`,
      articulos_incorporados: nuevosMaestro,
      articulos_vinculados: vinculadosConciliados,
      articulos_omitidos: omitidosDuplicados
    });
  } catch (error) {
    await conn.rollback();
    console.error('Consolidation error:', error);
    res.status(500).json({ success: false, message: 'Error consolidando levantamiento al inventario maestro.' });
  } finally {
    conn.release();
  }
});

export default router;
