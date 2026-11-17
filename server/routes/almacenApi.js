import express from 'express';
import crypto from 'crypto';
import argon2 from 'argon2';
import { getPool } from '../database/db.js';
import { validateAndGetJwtSecret } from '../config/auth.js';
import { applyDateRange } from '../services/dateRange.js';

const router = express.Router();

// Centralized and strictly validated JWT secret (fails startup if missing or weak)
const SECRET_KEY = validateAndGetJwtSecret();

// Configuración robusta de almacenamiento de contraseñas (Argon2id - OWASP 2023/2026)
const ARGON2_CONFIG = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,       // 3 iteraciones
  parallelism: 1     // 1 hilo para evitar saturación de CPU en servidor web
};

// Generación de hash moderno Argon2id
async function hashPassword(password) {
  return await argon2.hash(password, ARGON2_CONFIG);
}

// Verificación multi-formato con migración progresiva transparente
async function verifyPassword(password, stored) {
  if (!stored || !password) {
    return { valid: false, needsUpgrade: false };
  }

  // 1. Formato Principal: Argon2id ($argon2id$...)
  if (stored.startsWith('$argon2')) {
    try {
      const valid = await argon2.verify(stored, password);
      return { valid, needsUpgrade: false };
    } catch {
      return { valid: false, needsUpgrade: false };
    }
  }

  // 2. Formato Legado: PBKDF2-SHA512 (salt:hash)
  if (stored.includes(':')) {
    try {
      const [salt, hash] = stored.split(':');
      const checkHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
      const hashBuf = Buffer.from(hash, 'hex');
      const checkBuf = Buffer.from(checkHash, 'hex');
      const valid = hashBuf.length === checkBuf.length && crypto.timingSafeEqual(hashBuf, checkBuf);
      return { valid, needsUpgrade: valid }; // Si es válida, requiere auto-upgrade a Argon2id
    } catch {
      return { valid: false, needsUpgrade: false };
    }
  }

  // 3. Formato Legado Modular: bcrypt ($2a$, $2b$, $2y$)
  if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
    try {
      const bcryptModule = await import('bcryptjs').catch(() => import('bcrypt')).catch(() => null);
      if (bcryptModule && typeof bcryptModule.compare === 'function') {
        const valid = await bcryptModule.compare(password, stored);
        return { valid, needsUpgrade: valid };
      }
      console.warn('[AUTH] Hash bcrypt detectado pero motor bcrypt no disponible en el entorno.');
      return { valid: false, needsUpgrade: false };
    } catch {
      return { valid: false, needsUpgrade: false };
    }
  }

  // 4. Fallback Texto Plano: ESTRICTAMENTE DESHABILITADO EN PRODUCCIÓN (Defensa en Profundidad)
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_PLAIN_FALLBACK !== 'true') {
    return { valid: false, needsUpgrade: false };
  }

  // Solo permitido en pruebas sintéticas locales aisladas si se autoriza explícitamente
  const passBuf = Buffer.from(password);
  const storedBuf = Buffer.from(stored);
  const valid = passBuf.length === storedBuf.length && crypto.timingSafeEqual(passBuf, storedBuf);
  return { valid, needsUpgrade: valid };
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

// Helpers de sanitización de parámetros y trazabilidad
function getJwtTtlMs() {
  const raw = process.env.JWT_TTL_HOURS;
  const parsed = raw !== undefined && raw !== '' ? Number(raw) : 12;
  const hours = Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
  return hours * 60 * 60 * 1000;
}

export const VALID_OPERATIONAL_ROLES = ['admin', 'almacen', 'supervisor', 'auditor', 'gerencia'];

export const KNOWN_PERMISSION_KEYS = [
  'dash:ver',
  'inv:ver',
  'inv:crear',
  'inv:editar',
  'inv:movimientos_registrar',
  'inv:movimientos_ver',
  'inv:eliminar',
  'lev:ver',
  'lev:crear',
  'lev:capturar',
  'lev:editar',
  'lev:importar',
  'lev:consolidar',
  'rep:ver',
  'rep:exportar',
  'rep:imprimir',
  'camp:ver',
  'camp:stock',
  'camp:operar',
  'aud:ver',
  // v2.2 Actas de Entrega (no forman parte de ningún rol por defecto)
  'act:ver',
  'act:crear',
  'act:anular'
];

const KNOWN_PERMISSION_SET = new Set(KNOWN_PERMISSION_KEYS);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isTruthyFlag(val) {
  if (val === undefined || val === null || val === false || val === 0) return false;
  if (typeof val === 'string') {
    const norm = val.trim().toLowerCase();
    return norm !== '' && norm !== 'false' && norm !== '0' && norm !== 'no';
  }
  return Boolean(val);
}

function isValidEmailFormat(email) {
  return typeof email === 'string' && EMAIL_REGEX.test(email.trim());
}

function validateStrongPassword(password) {
  if (typeof password !== 'string') {
    return {
      valid: false,
      message: 'La contraseña debe tener al menos 8 caracteres combinando letras y números.'
    };
  }
  const trimmed = password.trim();
  if (trimmed.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return {
      valid: false,
      message: 'La contraseña debe tener al menos 8 caracteres combinando letras y números.'
    };
  }
  return { valid: true };
}

export function parsePermisosJson(raw, rol, esDeveloper = 0) {
  const isDeveloper = rol === 'developer' && Number(esDeveloper) === 1;
  const defaultPerms = isDeveloper ? ['*'] : [];

  if (raw === null || raw === undefined || raw === '') {
    return defaultPerms;
  }

  let current = Buffer.isBuffer(raw) ? raw.toString('utf8') : raw;
  if (typeof current === 'string') {
    const trimmed = current.trim();
    if (!trimmed) return defaultPerms;
    try {
      current = JSON.parse(trimmed);
      if (typeof current === 'string') {
        current = JSON.parse(current);
      }
    } catch {
      return defaultPerms;
    }
  }

  if (!Array.isArray(current)) {
    return defaultPerms;
  }

  const seen = new Set();
  const sanitized = [];
  for (const item of current) {
    if (typeof item !== 'string') continue;
    const key = item.trim();
    if (!key) continue;
    if (key === '*' && !isDeveloper) continue;
    if (!seen.has(key)) {
      seen.add(key);
      sanitized.push(key);
    }
  }

  if (isDeveloper && sanitized.length === 0) {
    return ['*'];
  }
  return sanitized;
}

export function validateAndSanitizePermissions(rawPermisos, targetIsDeveloper = false) {
  if (!Array.isArray(rawPermisos)) {
    return {
      errorStatus: 400,
      errorMessage: 'El campo permisos debe ser un arreglo de cadenas.'
    };
  }

  for (const rawItem of rawPermisos) {
    if (typeof rawItem === 'string' && rawItem.trim() === '*' && !targetIsDeveloper) {
      return {
        errorStatus: 403,
        errorMessage: 'Política de seguridad: No se permite otorgar acceso comodín (*) ni privilegios developer a cuentas operativas.'
      };
    }
  }

  const seen = new Set();
  const sanitized = [];
  for (const rawItem of rawPermisos) {
    if (typeof rawItem !== 'string') {
      return {
        errorStatus: 400,
        errorMessage: 'Cada permiso debe ser una cadena de texto válida.'
      };
    }
    const key = rawItem.trim();
    if (!key) {
      return {
        errorStatus: 400,
        errorMessage: 'No se permiten claves de permiso vacías.'
      };
    }
    if (key !== '*' && !KNOWN_PERMISSION_SET.has(key)) {
      return {
        errorStatus: 400,
        errorMessage: `Clave de permiso desconocida o no autorizada: "${key}".`
      };
    }
    if (!seen.has(key)) {
      seen.add(key);
      sanitized.push(key);
    }
  }

  return { permisos: sanitized };
}

export async function parseUserCampamentoSelection(db, body = {}) {
  const { campamento_id, campamentos_adicionales, campamentos } = body || {};
  const hasSelection =
    campamento_id !== undefined ||
    campamentos_adicionales !== undefined ||
    campamentos !== undefined;

  let explicitMainId = null;
  if (campamento_id !== undefined && campamento_id !== null && String(campamento_id).trim() !== '') {
    explicitMainId = parsePositiveInt(campamento_id);
    if (!explicitMainId) {
      return {
        errorStatus: 400,
        errorMessage: 'El campo campamento_id debe ser un ID de campamento válido.'
      };
    }
  }

  const seen = new Set();
  const campamentoIds = [];
  if (explicitMainId) {
    seen.add(explicitMainId);
    campamentoIds.push(explicitMainId);
  }

  for (const [fieldName, rawList] of [
    ['campamentos_adicionales', campamentos_adicionales],
    ['campamentos', campamentos]
  ]) {
    if (rawList === undefined || rawList === null) continue;
    if (!Array.isArray(rawList)) {
      return {
        errorStatus: 400,
        errorMessage: `El campo ${fieldName} debe ser un arreglo de IDs de campamento.`
      };
    }
    for (const rawItem of rawList) {
      const candidate = rawItem && typeof rawItem === 'object' && !Array.isArray(rawItem)
        ? (rawItem.campamento_id ?? rawItem.id)
        : rawItem;
      const cid = parsePositiveInt(candidate);
      if (!cid) {
        return {
          errorStatus: 400,
          errorMessage: `Todos los elementos de ${fieldName} deben ser IDs de campamento válidos.`
        };
      }
      if (!seen.has(cid)) {
        seen.add(cid);
        campamentoIds.push(cid);
      }
    }
  }

  if (campamentoIds.length > 0) {
    const [validRows] = await db.query(
      'SELECT id FROM inv_campamentos WHERE id IN (?) AND activo = 1',
      [campamentoIds]
    );
    const validSet = new Set(validRows.map((r) => Number(r.id)));
    const invalidIds = campamentoIds.filter((id) => !validSet.has(id));
    if (invalidIds.length > 0) {
      return {
        errorStatus: 400,
        errorMessage: `Uno o más campamentos seleccionados no existen o están inactivos (IDs: ${invalidIds.join(', ')}).`
      };
    }
  }

  const principalCampId = explicitMainId ?? (campamento_id === undefined && campamentoIds.length > 0 ? campamentoIds[0] : null);
  return {
    hasSelection,
    principalCampId,
    campamentoIds
  };
}

function parsePositiveInt(rawVal) {
  if (typeof rawVal !== 'string' && typeof rawVal !== 'number') return null;
  const str = String(rawVal).trim();
  if (!/^\d+$/.test(str)) return null;
  const parsed = Number.parseInt(str, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function sanitizeLimit(rawLimit, defaultVal = 50, maxVal = 1000) {
  if (typeof rawLimit !== 'string' && typeof rawLimit !== 'number') return defaultVal;
  const parsed = Number.parseInt(String(rawLimit).trim(), 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return defaultVal;
  return Math.min(Math.max(parsed, 1), maxVal);
}

function sanitizePage(rawPage) {
  if (typeof rawPage !== 'string' && typeof rawPage !== 'number') return 1;
  const parsed = Number.parseInt(String(rawPage).trim(), 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 1) return 1;
  return parsed;
}

function asNonEmptyString(val) {
  return typeof val === 'string' && val.trim() !== '' ? val.trim() : null;
}

function getClientIp(req) {
  if (!req) return '127.0.0.1';
  const rawIp = req.ip || req.socket?.remoteAddress || '127.0.0.1';
  return String(rawIp).replace(/^::ffff:/i, '').slice(0, 45);
}

// Token generation & verification (HS256 + timingSafeEqual + exp/alg/typ/tv)
function generateToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Date.now();
  const tokenVersion = Number.isInteger(Number(payload?.tv)) && Number(payload.tv) > 0
    ? Number(payload.tv)
    : 1;
  const stringifiedPayload = Buffer.from(JSON.stringify({
    ...payload,
    tv: tokenVersion,
    iat: now,
    exp: now + getJwtTtlMs()
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET_KEY)
    .update(`${header}.${stringifiedPayload}`)
    .digest('base64url');
  return `${header}.${stringifiedPayload}.${signature}`;
}

function verifyToken(token) {
  try {
    if (typeof token !== 'string' || !token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    if (!header || !payload || !signature) return null;

    const parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
    if (!parsedHeader || typeof parsedHeader !== 'object' || parsedHeader.alg !== 'HS256' || parsedHeader.typ !== 'JWT') {
      return null;
    }

    const expectedSignature = crypto.createHmac('sha256', SECRET_KEY)
      .update(`${header}.${payload}`)
      .digest('base64url');
    const sigBuf = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
    if (typeof decoded.exp !== 'number' || !Number.isFinite(decoded.exp) || decoded.exp <= Date.now()) {
      return null;
    }
    const uid = Number(decoded.id);
    if (!Number.isInteger(uid) || uid <= 0) return null;
    return decoded;
  } catch {
    return null;
  }
}

async function bumpUserTokenVersion(dbOrConn, userId) {
  try {
    await dbOrConn.query(
      'UPDATE inv_usuarios SET token_version = COALESCE(token_version, 1) + 1 WHERE id = ?',
      [userId]
    );
    return true;
  } catch (err) {
    if (err?.code === 'ER_BAD_FIELD_ERROR' || String(err?.message || '').includes('token_version')) {
      return false;
    }
    throw err;
  }
}

// Middleware: Authenticate JWT with Live Status, Token Version & Fail-Closed DB Check
async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
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

        const userRow = uRows[0];
        const hasTokenVersionCol = Object.prototype.hasOwnProperty.call(userRow, 'token_version')
          && userRow.token_version !== null
          && userRow.token_version !== undefined;

        if (hasTokenVersionCol) {
          const dbTokenVersion = Number(userRow.token_version);
          if (decoded.tv !== undefined) {
            if (!Number.isInteger(decoded.tv) || decoded.tv !== dbTokenVersion) {
              return res.status(401).json({
                success: false,
                message: 'Sesión revocada o expirada. Por favor inicie sesión nuevamente.'
              });
            }
          } else if (dbTokenVersion !== 1) {
            return res.status(401).json({
              success: false,
              message: 'Sesión revocada o expirada. Por favor inicie sesión nuevamente.'
            });
          }
        } else if (decoded.tv !== undefined && (!Number.isInteger(decoded.tv) || decoded.tv !== 1)) {
          return res.status(401).json({
            success: false,
            message: 'Sesión revocada o expirada. Por favor inicie sesión nuevamente.'
          });
        }

        // Live refresh of identity, role & permissions so changes take effect immediately
        decoded.nombre = userRow.nombre;
        decoded.email = userRow.email;
        decoded.rol = userRow.rol;
        decoded.es_developer = userRow.es_developer;
        decoded.campamento_id = userRow.campamento_id;
        decoded.permisos = parsePermisosJson(userRow.permisos_json, userRow.rol, userRow.es_developer);

        req.user = decoded;
        return next();
      } catch (err) {
        console.error('[AUTH] Error verificando sesión en BD (fail-closed):', err?.message || err);
        return res.status(503).json({
          success: false,
          message: 'Servicio de verificación de autenticación temporalmente no disponible.'
        });
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
export function requireRole(allowedRoles = []) {
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

function requireAnyPermission(permKeys = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'No autenticado.' });
    }
    if (req.user.rol === 'developer' || req.user.es_developer === 1) {
      return next();
    }
    const perms = req.user.permisos || [];
    if (perms.includes('*') || permKeys.some((k) => perms.includes(k))) {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: 'Acceso denegado: No dispone de los permisos necesarios para consultar este recurso.'
    });
  };
}

// Condición SQL unificada para artículos sin serie (M01: cero divergencias entre Dashboard, Inventario y Reportes)
const PLACEHOLDER_SERIAL_VALUES = new Set([
  'N/A', 'S/N', 'S/S', 'SIN SERIAL', 'SIN SERIE', 'NO APLICA', 'NO TIENE', 'NONE', 'NULL', '--', '-'
]);
const SQL_SIN_SERIAL_VALUES_SQL = "('N/A', 'S/N', 'S/S', 'SIN SERIAL', 'SIN SERIE', 'NO APLICA', 'NO TIENE', 'NONE', 'NULL', '--', '-')";
const buildSqlSinSerialCondition = (col = 'serie_imei') =>
  `(${col} IS NULL OR TRIM(${col}) = '' OR UPPER(TRIM(${col})) IN ${SQL_SIN_SERIAL_VALUES_SQL})`;
const SQL_SIN_SERIAL_CONDITION = buildSqlSinSerialCondition('serie_imei');
const VALID_INVENTARIO_AREAS = ['INFORMATICA', 'OFICINAS', 'COCINA', 'ALMACEN', 'OTRA'];

function sanitizeListArticleRow(row) {
  if (!row || typeof row !== 'object') return row;
  const rawFoto = row.evidencia_foto;
  const hasFoto = Boolean(typeof rawFoto === 'string' && rawFoto.trim() !== '');
  const isHeavyFoto = typeof rawFoto === 'string' && (rawFoto.trim().startsWith('data:') || rawFoto.length > 255);
  const cleaned = {
    ...row,
    tiene_foto: hasFoto ? 1 : 0
  };
  if (isHeavyFoto) {
    cleaned.evidencia_foto = null;
  }
  if (Object.hasOwn(cleaned, 'foto_base64')) {
    delete cleaned.foto_base64;
  }
  if (Object.hasOwn(cleaned, 'imagen_base64')) {
    delete cleaned.imagen_base64;
  }
  return cleaned;
}

export function normalizeSerialKey(rawSerial) {
  if (typeof rawSerial !== 'string' && typeof rawSerial !== 'number') return null;
  const cleaned = String(rawSerial).trim();
  if (!cleaned) return null;
  const upper = cleaned.toUpperCase();
  if (PLACEHOLDER_SERIAL_VALUES.has(upper)) return null;
  return upper;
}

function normalizeExactLocation(value) {
  return String(value || '').trim().toUpperCase();
}

function hasExactLocationMatch(scope, ubicacionNombre) {
  const target = normalizeExactLocation(ubicacionNombre);
  if (!target) return false;
  return (scope.campamentoNombres || []).some((cn) => normalizeExactLocation(cn) === target);
}

function canAccessArticle(scope, article) {
  if (!article) return false;
  if (scope.isGlobal) return true;
  if (article.campamento_id !== null && article.campamento_id !== undefined) {
    return scope.campamentoIds.includes(Number(article.campamento_id));
  }
  return hasExactLocationMatch(scope, article.ubicacion_nombre);
}

function canTargetCampamento(scope, campamentoId, ubicacionNombre) {
  if (scope.isGlobal) return true;
  const hasCampId = campamentoId !== undefined && campamentoId !== null && String(campamentoId).trim() !== '';
  if (hasCampId) {
    const parsedId = parsePositiveInt(campamentoId);
    if (!parsedId || !scope.campamentoIds.includes(parsedId)) {
      return false;
    }
    if (ubicacionNombre !== undefined && ubicacionNombre !== null && String(ubicacionNombre).trim() !== '') {
      return hasExactLocationMatch(scope, ubicacionNombre);
    }
    return true;
  }
  return hasExactLocationMatch(scope, ubicacionNombre);
}

function buildArticleScopeFilter(scope, alias = 'a') {
  const colCamp = alias ? `${alias}.campamento_id` : 'campamento_id';
  const colUbic = alias ? `${alias}.ubicacion_nombre` : 'ubicacion_nombre';
  const upperNames = (scope.campamentoNombres || [])
    .map((n) => normalizeExactLocation(n))
    .filter(Boolean);

  if (scope.campamentoIds.length > 0 && upperNames.length > 0) {
    return {
      sql: `(${colCamp} IN (?) OR (${colCamp} IS NULL AND UPPER(TRIM(${colUbic})) IN (?)))`,
      params: [scope.campamentoIds, upperNames]
    };
  }
  if (scope.campamentoIds.length > 0) {
    return {
      sql: `${colCamp} IN (?)`,
      params: [scope.campamentoIds]
    };
  }
  if (upperNames.length > 0) {
    return {
      sql: `(${colCamp} IS NULL AND UPPER(TRIM(${colUbic})) IN (?))`,
      params: [upperNames]
    };
  }
  return { sql: '1 = 0', params: [] };
}

// Helper: Resolve User Allowed Campamentos Scope
// Regla de Seguridad: Solo developer (rol === 'developer' / es_developer === 1) o usuarios con permiso '*' tienen acceso global.
// Todo usuario operativo/gerencial sin sedes explícitas inicia con ámbito vacío (fail-closed).
async function getUserAllowedCampamentos(db, user) {
  const perms = Array.isArray(user?.permisos) ? user.permisos : [];
  if (user.rol === 'developer' || user.es_developer === 1 || perms.includes('*')) {
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
      'SELECT id, nombre, ubicacion_historica_equivalente FROM inv_campamentos WHERE id = ? AND activo = 1',
      [user.campamento_id]
    );
    if (cRows.length > 0) {
      ids = [cRows[0].id];
      if (cRows[0].nombre) nameSet.add(cRows[0].nombre.trim());
      if (cRows[0].ubicacion_historica_equivalente) nameSet.add(cRows[0].ubicacion_historica_equivalente.trim());
    }
  }

  return {
    isGlobal: false,
    campamentoIds: ids,
    campamentoNombres: Array.from(nameSet)
  };
}

// Helpers de resiliencia BD, introspección cacheada de esquema MySQL 8 / MariaDB y normalización JSON
const DB_UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ECONNRESET',
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
  'ER_CON_COUNT_ERROR',
  'POOL_CLOSED'
]);

function isDbUnavailableError(error, conn = undefined) {
  if (conn === null) return true;
  const code = error?.code || '';
  return DB_UNAVAILABLE_CODES.has(code);
}

async function safeRollback(conn) {
  if (!conn || typeof conn.rollback !== 'function') return;
  try {
    await conn.rollback();
  } catch (rbErr) {
    console.error('Rollback error:', rbErr?.message || rbErr);
  }
}

function safeRelease(conn) {
  if (!conn || typeof conn.release !== 'function') return;
  try {
    conn.release();
  } catch (relErr) {
    console.error('Connection release error:', relErr?.message || relErr);
  }
}

function parseEnumValues(columnType) {
  const str = String(columnType || '');
  if (!/^enum\(/i.test(str)) return [];
  const values = [];
  const regex = /'((?:[^'\\]|\\.|'')*)'/g;
  let match;
  while ((match = regex.exec(str)) !== null) {
    values.push(match[1].replace(/''/g, "'"));
  }
  return values;
}

const SCHEMA_CACHE_TTL_MS = 30 * 1000;
const schemaCapabilitiesCache = new WeakMap();

export function resetSchemaCapabilitiesCache(poolRef = null) {
  if (poolRef && typeof poolRef === 'object') {
    schemaCapabilitiesCache.delete(poolRef);
  }
}

function getDefaultSchemaCapabilities() {
  return {
    articulos: {
      exists: true,
      createdCol: 'fecha_creacion',
      brandCol: 'marca_modelo',
      specCol: 'tipo_caracteristicas',
      cols: new Set(['fecha_creacion', 'marca_modelo', 'tipo_caracteristicas'])
    },
    almacenes: {
      exists: true,
      hasEstadoVerificacion: false,
      hasEsSintetico: true
    },
    campamentos: {
      exists: true,
      hasClasificacionSede: true,
      hasEsSintetico: true,
      clasificacionValues: ['CONFIRMADO', 'PROPUESTO', 'SINTETICO_PRUEBA', 'HISTORICO_NO_HOMOLOGADO', 'DUPLICADO_EQUIVALENTE']
    },
    custodios: {
      exists: true,
      hasDepartamento: false,
      hasTelefono: false,
      hasEsSintetico: true
    },
    categorias: {
      exists: true,
      hasEsSintetico: true
    },
    levantamientos: {
      exists: true,
      hasEsSintetico: true,
      estadoValues: ['En preparación', 'En proceso', 'Pendiente de revisión', 'Finalizado', 'Cancelado']
    },
    campamentoAlias: {
      exists: false,
      cols: new Set(),
      tipoAliasValues: [],
      estadoValidacionValues: []
    }
  };
}

async function getSchemaCapabilities(db) {
  const cacheKey = typeof db === 'object' && db !== null ? db : null;
  const now = Date.now();
  if (cacheKey && schemaCapabilitiesCache.has(cacheKey)) {
    const cached = schemaCapabilitiesCache.get(cacheKey);
    if (now - cached.loadedAt < SCHEMA_CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const defaults = getDefaultSchemaCapabilities();

  try {
    const [rows] = await db.query(
      `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, COLUMN_TYPE AS column_type
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('inv_articulos', 'inv_almacenes', 'inv_campamentos', 'inv_custodios', 'inv_categorias', 'inv_levantamientos', 'inv_campamento_alias')`
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return defaults;
    }

    const byTable = new Map();
    for (const row of rows) {
      const tName = String(row.table_name || row.TABLE_NAME || '').toLowerCase();
      const cName = String(row.column_name || row.COLUMN_NAME || '').toLowerCase();
      const cType = String(row.column_type || row.COLUMN_TYPE || '');
      if (!tName || !cName) continue;
      if (!byTable.has(tName)) {
        byTable.set(tName, new Map());
      }
      byTable.get(tName).set(cName, cType);
    }

    const artCols = byTable.get('inv_articulos');
    const almCols = byTable.get('inv_almacenes');
    const campCols = byTable.get('inv_campamentos');
    const custCols = byTable.get('inv_custodios');
    const catCols = byTable.get('inv_categorias');
    const levCols = byTable.get('inv_levantamientos');
    const aliasCols = byTable.get('inv_campamento_alias');

    const capabilities = {
      articulos: {
        exists: Boolean(artCols && artCols.size > 0),
        createdCol: artCols?.has('fecha_creacion')
          ? 'fecha_creacion'
          : (artCols?.has('creado_en') ? 'creado_en' : 'id'),
        brandCol: artCols?.has('marca_modelo')
          ? 'marca_modelo'
          : (artCols?.has('marca') ? 'marca' : 'marca_modelo'),
        specCol: artCols?.has('tipo_caracteristicas')
          ? 'tipo_caracteristicas'
          : (artCols?.has('modelo_caracteristicas') ? 'modelo_caracteristicas' : 'tipo_caracteristicas'),
        cols: artCols ? new Set(artCols.keys()) : defaults.articulos.cols
      },
      almacenes: {
        exists: Boolean(almCols && almCols.size > 0),
        hasEstadoVerificacion: Boolean(almCols?.has('estado_verificacion')),
        hasEsSintetico: Boolean(almCols?.has('es_sintetico'))
      },
      campamentos: {
        exists: Boolean(campCols && campCols.size > 0),
        hasClasificacionSede: Boolean(campCols?.has('clasificacion_sede')),
        hasEsSintetico: Boolean(campCols?.has('es_sintetico')),
        clasificacionValues: campCols?.has('clasificacion_sede')
          ? parseEnumValues(campCols.get('clasificacion_sede'))
          : []
      },
      custodios: {
        exists: Boolean(custCols && custCols.size > 0),
        hasDepartamento: Boolean(custCols?.has('departamento')),
        hasTelefono: Boolean(custCols?.has('telefono')),
        hasEsSintetico: Boolean(custCols?.has('es_sintetico'))
      },
      categorias: {
        exists: Boolean(catCols && catCols.size > 0),
        hasEsSintetico: Boolean(catCols?.has('es_sintetico'))
      },
      levantamientos: {
        exists: Boolean(levCols && levCols.size > 0),
        hasEsSintetico: Boolean(levCols?.has('es_sintetico')),
        estadoValues: levCols?.has('estado')
          ? parseEnumValues(levCols.get('estado'))
          : []
      },
      campamentoAlias: {
        exists: Boolean(aliasCols && aliasCols.size > 0),
        cols: aliasCols ? new Set(aliasCols.keys()) : new Set(),
        tipoAliasValues: aliasCols?.has('tipo_alias')
          ? parseEnumValues(aliasCols.get('tipo_alias'))
          : [],
        estadoValidacionValues: aliasCols?.has('estado_validacion')
          ? parseEnumValues(aliasCols.get('estado_validacion'))
          : []
      }
    };

    if (cacheKey) {
      schemaCapabilitiesCache.set(cacheKey, { loadedAt: now, data: capabilities });
    }
    return capabilities;
  } catch (err) {
    if (isDbUnavailableError(err)) {
      throw err;
    }
    console.warn('[SCHEMA] No se pudo inspeccionar information_schema.COLUMNS; usando perfil por defecto:', err?.message || err);
    return defaults;
  }
}

function normalizeAuditJsonField(val) {
  if (val === null || val === undefined) return null;
  const current = Buffer.isBuffer(val) ? val.toString('utf8') : val;
  if (typeof current === 'string') {
    const trimmed = current.trim();
    if (trimmed === '') return null;
    try {
      let parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') {
        const inner = parsed.trim();
        if ((inner.startsWith('{') && inner.endsWith('}')) || (inner.startsWith('[') && inner.endsWith(']'))) {
          try {
            parsed = JSON.parse(inner);
          } catch {
            return parsed;
          }
        }
      }
      return parsed;
    } catch {
      return current;
    }
  }
  return current;
}

export function normalizeAuditLogRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    return {
      ...row,
      detalles_previos: normalizeAuditJsonField(row.detalles_previos),
      detalles_nuevos: normalizeAuditJsonField(row.detalles_nuevos)
    };
  });
}

function serializeAuditPayload(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed !== null && typeof parsed === 'object') {
        return trimmed;
      }
    } catch {
      return JSON.stringify(val);
    }
    return JSON.stringify(val);
  }
  return JSON.stringify(val);
}

// Helper: Audit Logging
async function logAudit(db, { usuario_id, usuario_nombre, accion, entidad, entidad_id, detalles_previos, detalles_nuevos, req }) {
  try {
    const ip = getClientIp(req);
    await db.query(
      `INSERT INTO inv_auditoria (usuario_id, usuario_nombre, accion, entidad, entidad_id, detalles_previos, detalles_nuevos, ip_origen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuario_id || null,
        usuario_nombre || 'Sistema',
        accion,
        entidad || 'inv_articulos',
        entidad_id || null,
        serializeAuditPayload(detalles_previos),
        serializeAuditPayload(detalles_nuevos),
        ip
      ]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

// Rate limiting de autenticación en memoria acotado contra ataques de fuerza bruta y DoS
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_LOGIN_ATTEMPTS = 15; // Máximo 15 intentos por IP en 1 minuto
const MAX_LOGIN_ATTEMPTS_PAIR = 10; // Máximo 10 intentos por par ip|email en 1 minuto
const MAX_LOGIN_ATTEMPTS_EMAIL = 25; // Máximo 25 intentos por cuenta ante fuerza bruta distribuida
const MAX_RATE_LIMIT_ENTRIES = 5000;
let lastRateLimitSweep = 0;

function purgeRateLimitEntries(now) {
  for (const [key, entry] of loginAttempts.entries()) {
    if (!entry || now > entry.resetAt) {
      loginAttempts.delete(key);
    }
  }
  while (loginAttempts.size >= MAX_RATE_LIMIT_ENTRIES) {
    const oldestKey = loginAttempts.keys().next().value;
    if (oldestKey === undefined) break;
    loginAttempts.delete(oldestKey);
  }
}

function incrementRateLimitKey(key, now) {
  if (loginAttempts.size >= MAX_RATE_LIMIT_ENTRIES || now - lastRateLimitSweep > RATE_LIMIT_WINDOW_MS) {
    lastRateLimitSweep = now;
    purgeRateLimitEntries(now);
  }
  const existing = loginAttempts.get(key);
  if (!existing || now > existing.resetAt) {
    const fresh = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    loginAttempts.set(key, fresh);
    return fresh;
  }
  existing.count += 1;
  return existing;
}

function rateLimitLogin(req, res, next) {
  const ip = getClientIp(req);
  const emailNorm = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const now = Date.now();

  const ipRecord = incrementRateLimitKey(`ip:${ip}`, now);
  const pairRecord = emailNorm ? incrementRateLimitKey(`pair:${ip}|${emailNorm}`, now) : null;
  const emailRecord = emailNorm ? incrementRateLimitKey(`email:${emailNorm}`, now) : null;

  if (
    ipRecord.count > MAX_LOGIN_ATTEMPTS ||
    (pairRecord && pairRecord.count > MAX_LOGIN_ATTEMPTS_PAIR) ||
    (emailRecord && emailRecord.count > MAX_LOGIN_ATTEMPTS_EMAIL)
  ) {
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
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
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

    const authCheck = await verifyPassword(password, user.password_hash);
    if (!authCheck.valid) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas.' });
    }

    // Migración progresiva transparente a Argon2id en inicio de sesión exitoso
    if (authCheck.needsUpgrade) {
      try {
        const upgradedHash = await hashPassword(password);
        await db.query('UPDATE inv_usuarios SET password_hash = ? WHERE id = ?', [upgradedHash, user.id]);
        console.log(`[AUTH-MIGRATION] Contraseña del usuario ID ${user.id} migrada transparentemente a Argon2id.`);
      } catch (upgradeErr) {
        console.error('[AUTH-MIGRATION] Advertencia: Error en auto-actualización a Argon2id:', upgradeErr.message);
      }
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
    } catch (campErr) {
      if (campErr?.code !== 'ER_NO_SUCH_TABLE') {
        console.warn('[AUTH] Error consultando inv_usuario_campamentos en login:', campErr?.message || campErr);
      }
      userCamps = [];
    }

    if (userCamps.length === 0 && user.campamento_id) {
      const [singleCamp] = await db.query(
        'SELECT id, nombre, codigo, provincia FROM inv_campamentos WHERE id = ? AND activo = 1',
        [user.campamento_id]
      );
      if (singleCamp.length > 0) {
        userCamps = [{ ...singleCamp[0], es_principal: 1 }];
      }
    }

    const parsedPermisos = parsePermisosJson(user.permisos_json, user.rol, user.es_developer);

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

    const tokenVersion = Number.isInteger(Number(user.token_version)) && Number(user.token_version) > 0
      ? Number(user.token_version)
      : 1;
    const token = generateToken({ ...payload, tv: tokenVersion });

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

router.post('/auth/logout', requireAuth, async (req, res) => {
  try {
    const db = getPool();
    await bumpUserTokenVersion(db, req.user.id);
    await logAudit(db, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'LOGOUT_USUARIO',
      entidad: 'inv_usuarios',
      entidad_id: req.user.id,
      req
    });
    res.json({ success: true, message: 'Sesión cerrada y token revocado correctamente.' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, message: 'Error cerrando sesión.' });
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
    } catch (campErr) {
      if (campErr?.code !== 'ER_NO_SUCH_TABLE') {
        console.warn('[AUTH] Error consultando inv_usuario_campamentos en login:', campErr?.message || campErr);
      }
      userCamps = [];
    }

    if (userCamps.length === 0 && user.campamento_id) {
      const [singleCamp] = await db.query(
        'SELECT id, nombre, codigo, provincia FROM inv_campamentos WHERE id = ? AND activo = 1',
        [user.campamento_id]
      );
      if (singleCamp.length > 0) {
        userCamps = [{ ...singleCamp[0], es_principal: 1 }];
      }
    }

    const parsedPermisos = parsePermisosJson(user.permisos_json, user.rol, user.es_developer);

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
    console.error('Auth /me error:', error);
    const status = isDbUnavailableError(error) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error obteniendo perfil.' });
  }
});

// ==========================================
// CONFIGURACIÓN DE ENTORNO ACTIVO Y FUENTE DE DATOS (TAREA 1 Y TAREA 9)
// ==========================================
router.get('/config/entorno', requireAuth, (req, res) => {
  const host = (process.env.DB_HOST || '').toLowerCase();
  const port = String(process.env.DB_PORT || '3306');
  const isProd = process.env.NODE_ENV === 'production';
  const esPruebas = !isProd && (
    host.includes('127.0.0.1') ||
    host.includes('localhost') ||
    process.env.ENVIRONMENT === 'isolated_test' ||
    process.env.ISOLATED_LOCAL_ONLY === 'true' ||
    port !== '3306'
  );

  const basePayload = {
    success: true,
    entorno: esPruebas ? 'PRUEBAS' : 'PRODUCCION',
    etiqueta: esPruebas ? 'PRUEBAS — Entorno Local' : 'PRODUCCIÓN — Sistema Corporativo',
    esPruebas
  };

  const isDeveloper = req.user.rol === 'developer' || req.user.es_developer === 1;
  if (!isDeveloper) {
    return res.json(basePayload);
  }

  return res.json({
    ...basePayload,
    fuenteActiva: esPruebas
      ? 'Base de Datos Local Aislada (capa sintética controlada por es_sintetico)'
      : 'Base de Datos Productiva Oficial',
    aviso: esPruebas
      ? 'Entorno local de pruebas activo con aislamiento de registros sintéticos.'
      : 'Entorno de producción oficial activo.'
  });
});

// ==========================================
// HELPERS CANÓNICOS DE CAMPAMENTOS, ALIAS Y REASIGNACIÓN SEGURA (ETAPA 4)
// ==========================================

const NON_IDENTIFIABLE_SERIALS = new Set([
  '',
  'N/A',
  'S/N',
  'SIN SERIAL',
  'SIN SERIE',
  'NO APLICA',
  'NONE',
  'NULL',
  '--',
  '-'
]);

export function normalizeAliasKey(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function normalizeIdentifiableSerial(val) {
  const norm = String(val ?? '').trim().toUpperCase();
  if (!norm || NON_IDENTIFIABLE_SERIALS.has(norm)) return null;
  return norm;
}

function normalizeCodeKey(val) {
  const norm = String(val ?? '').trim().toUpperCase();
  return norm || null;
}

async function lookupFirstActiveAlmacenId(db, campamentoId, schemaCaps, options = {}) {
  if (options.skipAlmacenLookup || !campamentoId) return null;
  if (schemaCaps?.almacenes && !schemaCaps.almacenes.exists) return null;
  const [almRows] = await db.query(
    'SELECT id FROM inv_almacenes WHERE campamento_id = ? AND activo = 1 ORDER BY id ASC LIMIT 1',
    [campamentoId]
  );
  return almRows.length > 0 ? almRows[0].id : null;
}

// Helper canónico para resolver vinculación inequívoca con campamentos confirmados (sin IDs numéricos fijos)
export async function resolveCampamentoVinculacion(db, campamentoIdInput, ubicacionNombreInput, options = {}) {
  const hasExplicitCampId = campamentoIdInput !== undefined
    && campamentoIdInput !== null
    && String(campamentoIdInput).trim() !== '';

  if (hasExplicitCampId) {
    const cid = parsePositiveInt(campamentoIdInput);
    if (!cid) {
      return {
        campamento_id: null,
        almacen_id: null,
        estado_vinculacion_sede: 'SIN_SEDE',
        campamento_invalido: true,
        fuente_resolucion: 'CAMPAMENTO_INEXISTENTE',
        requiere_revision_historica: false,
        alias_match: null
      };
    }

    const [campRows] = await db.query(
      'SELECT id, codigo, nombre, clasificacion_sede, activo FROM inv_campamentos WHERE id = ? AND activo = 1 LIMIT 1',
      [cid]
    );
    if (campRows.length === 0) {
      return {
        campamento_id: null,
        almacen_id: null,
        estado_vinculacion_sede: 'SIN_SEDE',
        campamento_invalido: true,
        fuente_resolucion: 'CAMPAMENTO_INEXISTENTE',
        requiere_revision_historica: false,
        alias_match: null
      };
    }

    const campRow = campRows[0];
    const schemaCaps = await getSchemaCapabilities(db);
    const firstAlmId = await lookupFirstActiveAlmacenId(db, campRow.id, schemaCaps, options);
    return {
      campamento_id: campRow.id,
      codigo_campamento: campRow.codigo || null,
      nombre_campamento: campRow.nombre,
      almacen_id: firstAlmId,
      estado_vinculacion_sede: 'CONFIRMADO',
      campamento_invalido: false,
      fuente_resolucion: 'CAMPAMENTO_ID',
      requiere_revision_historica: false,
      alias_match: null
    };
  }

  const normKey = normalizeAliasKey(ubicacionNombreInput);
  if (!normKey) {
    return {
      campamento_id: null,
      almacen_id: null,
      estado_vinculacion_sede: 'SIN_SEDE',
      fuente_resolucion: 'SIN_COINCIDENCIA',
      requiere_revision_historica: false,
      alias_match: null
    };
  }

  const schemaCaps = await getSchemaCapabilities(db);

  if (schemaCaps.campamentoAlias?.exists) {
    try {
      const [aliasRows] = await db.query(
        `SELECT ca.*,
                c.codigo AS camp_codigo,
                c.nombre AS campamento_nombre
         FROM inv_campamento_alias ca
         JOIN inv_campamentos c ON c.id = ca.campamento_id
         WHERE ca.alias_normalizado = ?
           AND ca.estado_validacion = 'CONFIRMADO'
           AND c.activo = 1
         LIMIT 1`,
        [normKey]
      );

      if (aliasRows.length > 0) {
        const row = aliasRows[0];
        const reqRevHist = Number(row.requiere_revision_historica || 0) === 1;
        const campCodigo = row.camp_codigo || row.codigo_campamento || null;
        const aliasMatch = {
          id: row.id,
          campamento_id: row.campamento_id,
          alias_original: row.alias_original,
          alias_normalizado: row.alias_normalizado,
          tipo_alias: row.tipo_alias || null,
          estado_validacion: row.estado_validacion,
          requiere_revision_historica: reqRevHist
        };

        if (!reqRevHist) {
          const firstAlmId = await lookupFirstActiveAlmacenId(db, row.campamento_id, schemaCaps, options);
          return {
            campamento_id: row.campamento_id,
            codigo_campamento: campCodigo,
            nombre_campamento: row.campamento_nombre,
            almacen_id: firstAlmId,
            estado_vinculacion_sede: 'CONFIRMADO',
            fuente_resolucion: 'ALIAS_DIRECTO',
            requiere_revision_historica: false,
            alias_match: aliasMatch
          };
        }

        if (options.permitirAliasRevisionHistorica === true) {
          const firstAlmId = await lookupFirstActiveAlmacenId(db, row.campamento_id, schemaCaps, options);
          return {
            campamento_id: row.campamento_id,
            codigo_campamento: campCodigo,
            nombre_campamento: row.campamento_nombre,
            almacen_id: firstAlmId,
            estado_vinculacion_sede: 'CONFIRMADO',
            suggested_campamento_id: row.campamento_id,
            suggested_codigo_campamento: campCodigo,
            suggested_nombre_campamento: row.campamento_nombre,
            requiere_revision_historica: true,
            fuente_resolucion: 'ALIAS_REVISION_HISTORICA',
            alias_match: aliasMatch
          };
        }

        return {
          campamento_id: null,
          almacen_id: null,
          estado_vinculacion_sede: 'SEDE_AMBIGUA',
          suggested_campamento_id: row.campamento_id,
          suggested_codigo_campamento: campCodigo,
          suggested_nombre_campamento: row.campamento_nombre,
          requiere_revision_historica: true,
          fuente_resolucion: 'ALIAS_REVISION_HISTORICA',
          alias_match: aliasMatch
        };
      }
    } catch (aliasErr) {
      if (aliasErr?.code !== 'ER_NO_SUCH_TABLE') {
        throw aliasErr;
      }
    }
  }

  const hasClasif = schemaCaps.campamentos?.hasClasificacionSede;
  const orderSql = hasClasif
    ? "ORDER BY CASE WHEN clasificacion_sede = 'CONFIRMADO' THEN 0 ELSE 1 END ASC, id ASC"
    : 'ORDER BY id ASC';
  const [campCatalogRows] = await db.query(
    `SELECT id, codigo, nombre
     FROM inv_campamentos
     WHERE activo = 1
     ${orderSql}`
  );

  const exactByCode = campCatalogRows.find((c) => normalizeAliasKey(c.codigo) === normKey);
  const exactMatch = exactByCode || campCatalogRows.find((c) => normalizeAliasKey(c.nombre) === normKey);

  if (exactMatch) {
    const firstAlmId = await lookupFirstActiveAlmacenId(db, exactMatch.id, schemaCaps, options);
    return {
      campamento_id: exactMatch.id,
      codigo_campamento: exactMatch.codigo || null,
      nombre_campamento: exactMatch.nombre,
      almacen_id: firstAlmId,
      estado_vinculacion_sede: 'CONFIRMADO',
      fuente_resolucion: 'CAMPAMENTO_CATALOGO',
      requiere_revision_historica: false,
      alias_match: null
    };
  }

  return {
    campamento_id: null,
    almacen_id: null,
    estado_vinculacion_sede: 'SIN_SEDE',
    fuente_resolucion: 'SIN_COINCIDENCIA',
    requiere_revision_historica: false,
    alias_match: null
  };
}

async function resolveRequestedCampamentoFilter(db, scope, query = {}) {
  const { campamento_id, campamento_codigo, sin_sede, sinSede } = query;
  const campamentoParam = asNonEmptyString(campamento_id);
  const codigoParam = asNonEmptyString(campamento_codigo);
  const isSinSedeByCode = Boolean(
    codigoParam && codigoParam.toUpperCase() === 'SIN_SEDE' && (!campamentoParam || campamentoParam.toUpperCase() === 'TODOS')
  );
  const isSinSedeReq = campamentoParam === 'SIN_SEDE' || sin_sede === 'true' || sinSede === 'true' || isSinSedeByCode;

  if (isSinSedeReq) {
    if (!scope.isGlobal) {
      return {
        errorStatus: 403,
        errorMessage: 'Acceso denegado a artículos sin sede verificada.'
      };
    }
    return { isSinSedeReq: true, selectedCid: null, campamentoNotFound: false };
  }

  if (campamento_id !== undefined && campamento_id !== '' && campamentoParam !== 'TODOS') {
    const reqCid = parsePositiveInt(campamento_id);
    if (!scope.isGlobal) {
      if (!reqCid || !scope.campamentoIds.includes(reqCid)) {
        return { errorStatus: 403, errorMessage: 'Acceso denegado a la sede solicitada.' };
      }
    } else if (!reqCid) {
      return { errorStatus: 400, errorMessage: 'Parámetro campamento_id inválido.' };
    }
    return { isSinSedeReq: false, selectedCid: reqCid, campamentoNotFound: false };
  }

  if (codigoParam && codigoParam.toUpperCase() !== 'TODOS') {
    const normTarget = normalizeAliasKey(codigoParam);
    const [campRows] = await db.query('SELECT id, codigo FROM inv_campamentos WHERE activo = 1 ORDER BY id ASC');
    const matched = campRows.find((c) => normalizeAliasKey(c.codigo) === normTarget);
    if (!matched) {
      if (!scope.isGlobal) {
        return { errorStatus: 403, errorMessage: 'Acceso denegado a la sede solicitada.' };
      }
      return { isSinSedeReq: false, selectedCid: -1, campamentoNotFound: true };
    }
    if (!scope.isGlobal && !scope.campamentoIds.includes(matched.id)) {
      return { errorStatus: 403, errorMessage: 'Acceso denegado a la sede solicitada.' };
    }
    return { isSinSedeReq: false, selectedCid: matched.id, campamentoNotFound: false };
  }

  return { isSinSedeReq: false, selectedCid: null, campamentoNotFound: false };
}

async function buildSinSedeSummary(db, includeSynthetic = false) {
  const syntFilter = includeSynthetic ? '' : 'AND es_sintetico = 0';
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
    WHERE activo = 1 AND campamento_id IS NULL ${syntFilter}
  `);

  const [ubicRows] = await db.query(`
    SELECT COALESCE(NULLIF(TRIM(ubicacion_nombre), ''), 'Sin especificar') AS ubicacion_label,
           COUNT(*) AS total
    FROM inv_articulos
    WHERE activo = 1 AND campamento_id IS NULL ${syntFilter}
    GROUP BY ubicacion_label
    ORDER BY total DESC, ubicacion_label ASC
  `);

  const sr = sinSedeRows[0] || {};
  const totalArticulos = parseInt(sr.total_articulos || 0);
  const porDepartamento = {
    INFORMATICA: parseInt(sr.dep_informatica || 0),
    OFICINAS: parseInt(sr.dep_oficinas || 0),
    COCINA: parseInt(sr.dep_cocina || 0),
    ALMACEN: parseInt(sr.dep_almacen || 0)
  };

  const ubicacionesPendientes = ubicRows.map((u) => ({
    ubicacion_nombre: u.ubicacion_label,
    total: parseInt(u.total || 0)
  }));

  const ubicacionHistorica = ubicacionesPendientes.length > 0
    ? ubicacionesPendientes.map((u) => `${u.ubicacion_nombre} (${u.total})`).join(', ')
    : 'Sin registros pendientes';

  const deptParts = Object.entries(porDepartamento)
    .filter(([, count]) => count > 0)
    .map(([dept, count]) => `${dept} (${count})`);

  const motivo = totalArticulos === 0 || deptParts.length === 0
    ? 'No existen artículos pendientes de vinculación a sede.'
    : `Ubicaciones históricas pendientes de homologación en ${deptParts.join(', ')}. Requiere vista previa y confirmación individual antes de reasignar a una sede.`;

  return {
    id: 'SIN_SEDE',
    nombre: 'SIN SEDE VERIFICADA (PENDIENTE DE CLASIFICACIÓN)',
    codigo: 'PEND-SEDE',
    ubicacion_historica: ubicacionHistorica,
    ubicaciones_pendientes: ubicacionesPendientes,
    motivo,
    clasificacion_sede: 'SEDE_AMBIGUA',
    cantidad_almacenes: null,
    total_articulos: totalArticulos,
    total_fisico: parseFloat(sr.total_fisico || 0),
    articulos_sin_cantidad: parseInt(sr.articulos_sin_cantidad || 0),
    por_departamento: porDepartamento,
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
}

function isAmbiguousRelatedToDestino(normUbic, destCamp, destAliases = []) {
  if (!normUbic) return false;
  const destCode = normalizeAliasKey(destCamp?.codigo);
  const destName = normalizeAliasKey(destCamp?.nombre);
  const aliasKeys = destAliases.map((a) => normalizeAliasKey(a.alias_normalizado || a.alias_original));
  const destContext = [destCode, destName, ...aliasKeys].join(' ');

  if (destContext.includes('OPL') || destContext.includes('KM 19') || destContext.includes('KM19')) {
    if (normUbic.includes('KM 19') || normUbic.includes('KM19') || normUbic.includes('DUARTE') || normUbic.includes('OPL')) {
      return true;
    }
  }
  if (destContext.includes('633') || destContext.includes('M633') || destContext.includes('MANTENIMIENTO')) {
    if (normUbic.includes('MANTENIMIENTO') || normUbic.includes('633')) {
      return true;
    }
  }
  if (destContext.includes('27 DE FEBRERO') || destContext.includes('27FEB')) {
    if (normUbic.includes('27 DE FEBRERO') || normUbic.includes('27FEB') || normUbic.includes('DISTRITO NACIONAL')) {
      return true;
    }
  }
  if (destCode && destCode.length >= 4 && normUbic.includes(destCode)) {
    return true;
  }
  return false;
}

async function resolveDestinoCampamentoYAlmacen(db, {
  campamento_destino_id,
  campamento_destino_codigo,
  almacen_destino_id
}) {
  const hasDestId = campamento_destino_id !== undefined
    && campamento_destino_id !== null
    && String(campamento_destino_id).trim() !== '';
  const destCodeStr = asNonEmptyString(campamento_destino_codigo);

  if (!hasDestId && !destCodeStr) {
    return {
      errorStatus: 400,
      errorMessage: 'Debe especificar campamento_destino_id o campamento_destino_codigo.'
    };
  }

  let destCamp;
  if (hasDestId) {
    const destId = parsePositiveInt(campamento_destino_id);
    if (!destId) {
      return { errorStatus: 400, errorMessage: 'ID de campamento destino inválido.' };
    }
    const [cRows] = await db.query(
      'SELECT * FROM inv_campamentos WHERE id = ? AND activo = 1 LIMIT 1',
      [destId]
    );
    destCamp = cRows[0] || null;
  } else {
    const normCode = normalizeAliasKey(destCodeStr);
    const [cRows] = await db.query('SELECT * FROM inv_campamentos WHERE activo = 1 ORDER BY id ASC');
    destCamp = cRows.find((c) => normalizeAliasKey(c.codigo) === normCode) || null;
  }

  if (!destCamp) {
    return { errorStatus: 404, errorMessage: 'Campamento destino no encontrado o inactivo.' };
  }

  let destAlm;
  const hasAlmId = almacen_destino_id !== undefined
    && almacen_destino_id !== null
    && String(almacen_destino_id).trim() !== '';

  if (hasAlmId) {
    const almId = parsePositiveInt(almacen_destino_id);
    if (!almId) {
      return { errorStatus: 400, errorMessage: 'ID de almacén destino inválido.' };
    }
    const [aRows] = await db.query(
      'SELECT * FROM inv_almacenes WHERE id = ? AND campamento_id = ? AND activo = 1 LIMIT 1',
      [almId, destCamp.id]
    );
    if (aRows.length === 0) {
      return {
        errorStatus: 400,
        errorMessage: 'El almacén destino no existe, está inactivo o no pertenece al campamento destino.'
      };
    }
    destAlm = aRows[0];
  } else {
    const [aRows] = await db.query(
      'SELECT * FROM inv_almacenes WHERE campamento_id = ? AND activo = 1 ORDER BY id ASC LIMIT 1',
      [destCamp.id]
    );
    destAlm = aRows[0] || null;
  }

  return { destCamp, destAlm };
}

async function evaluateReasignacionCandidatos(db, candidateRows, destCamp, destAliases, includeSynthetic = false) {
  if (!Array.isArray(candidateRows) || candidateRows.length === 0) {
    return [];
  }

  const destAliasMap = new Map();
  for (const al of destAliases) {
    const k = normalizeAliasKey(al.alias_normalizado || al.alias_original);
    if (k && !destAliasMap.has(k)) {
      destAliasMap.set(k, al);
    }
  }

  const syntFilter = includeSynthetic ? '' : 'AND es_sintetico = 0';
  const candidateCodes = Array.from(
    new Set(candidateRows.map((r) => normalizeCodeKey(r.codigo_original)).filter(Boolean))
  );
  const candidateSerials = Array.from(
    new Set(candidateRows.map((r) => normalizeIdentifiableSerial(r.serie_imei)).filter(Boolean))
  );

  const codeGroups = new Map();
  if (candidateCodes.length > 0) {
    const [codePeers] = await db.query(
      `SELECT id, codigo_original, articulo_nombre, area, ubicacion_nombre, campamento_id, almacen_id, estado_fisico, cantidad_num
       FROM inv_articulos
       WHERE activo = 1 ${syntFilter} AND UPPER(TRIM(codigo_original)) IN (?)`,
      [candidateCodes]
    );
    for (const p of codePeers) {
      const k = normalizeCodeKey(p.codigo_original);
      if (!k) continue;
      if (!codeGroups.has(k)) codeGroups.set(k, []);
      codeGroups.get(k).push(p);
    }
  }

  const serialGroups = new Map();
  if (candidateSerials.length > 0) {
    const [serialPeers] = await db.query(
      `SELECT id, codigo_original, articulo_nombre, area, ubicacion_nombre, serie_imei, campamento_id, almacen_id, estado_fisico, cantidad_num
       FROM inv_articulos
       WHERE activo = 1 ${syntFilter} AND UPPER(TRIM(serie_imei)) IN (?)`,
      [candidateSerials]
    );
    for (const p of serialPeers) {
      const k = normalizeIdentifiableSerial(p.serie_imei);
      if (!k) continue;
      if (!serialGroups.has(k)) serialGroups.set(k, []);
      serialGroups.get(k).push(p);
    }
  }

  return candidateRows.map((row) => {
    const normUbic = normalizeAliasKey(row.ubicacion_nombre);
    const aliasMatch = normUbic ? (destAliasMap.get(normUbic) || null) : null;
    const esUbicacionNoHomologada = !aliasMatch;

    const codeKey = normalizeCodeKey(row.codigo_original);
    const allCodeMatches = codeKey ? (codeGroups.get(codeKey) || []) : [];
    const duplicadoCodigoDetectado = Boolean(codeKey && allCodeMatches.length > 1);
    const conflictosCodigo = duplicadoCodigoDetectado
      ? allCodeMatches
        .filter((p) => p.id !== row.id)
        .map((p) => ({
          id: p.id,
          codigo_original: p.codigo_original,
          articulo_nombre: p.articulo_nombre,
          area: p.area,
          ubicacion_nombre: p.ubicacion_nombre,
          campamento_id: p.campamento_id
        }))
      : [];

    const serialKey = normalizeIdentifiableSerial(row.serie_imei);
    const allSerialMatches = serialKey ? (serialGroups.get(serialKey) || []) : [];
    const duplicadoSerieDetectado = Boolean(serialKey && allSerialMatches.length > 1);
    const conflictosSerie = duplicadoSerieDetectado
      ? allSerialMatches
        .filter((p) => p.id !== row.id)
        .map((p) => ({
          id: p.id,
          codigo_original: p.codigo_original,
          serie_imei: p.serie_imei,
          articulo_nombre: p.articulo_nombre,
          area: p.area,
          ubicacion_nombre: p.ubicacion_nombre,
          campamento_id: p.campamento_id
        }))
      : [];

    const yaAsignadoSede = row.campamento_id !== null && row.campamento_id !== undefined;
    const requiereConfirmacionIndividual = Boolean(
      duplicadoCodigoDetectado || duplicadoSerieDetectado || esUbicacionNoHomologada || yaAsignadoSede
    );

    const motivosBloqueo = [];
    if (duplicadoCodigoDetectado) {
      motivosBloqueo.push(`Código de referencia duplicado en inventario activo (${row.codigo_original}).`);
    }
    if (duplicadoSerieDetectado) {
      motivosBloqueo.push(`Serial/IMEI duplicado en inventario activo (${row.serie_imei}).`);
    }
    if (esUbicacionNoHomologada) {
      motivosBloqueo.push(
        `Ubicación histórica "${row.ubicacion_nombre || 'Sin especificar'}" no homologada como alias confirmado de ${destCamp.codigo || destCamp.nombre}.`
      );
    }
    if (yaAsignadoSede) {
      motivosBloqueo.push(
        Number(row.campamento_id) === Number(destCamp.id)
          ? `Artículo ya asignado previamente a la sede destino (#${row.campamento_id}).`
          : `Artículo ya asignado a otra sede (#${row.campamento_id}).`
      );
    }

    let clasificacion = 'ELEGIBLE_ALIAS_DIRECTO';
    if (requiereConfirmacionIndividual) {
      clasificacion = 'BLOQUEADO_REVISION_INDIVIDUAL';
    } else if (aliasMatch && Number(aliasMatch.requiere_revision_historica || 0) === 1) {
      clasificacion = 'ELEGIBLE_EQUIVALENCIA_APROBADA';
    }

    return {
      ...row,
      ubicacion_normalizada: normUbic,
      alias_match: aliasMatch
        ? {
            id: aliasMatch.id,
            alias_original: aliasMatch.alias_original,
            alias_normalizado: aliasMatch.alias_normalizado,
            tipo_alias: aliasMatch.tipo_alias || null,
            requiere_revision_historica: Number(aliasMatch.requiere_revision_historica || 0) === 1
          }
        : null,
      duplicado_codigo_detectado: duplicadoCodigoDetectado,
      duplicado_serie_detectado: duplicadoSerieDetectado,
      es_ubicacion_no_homologada: esUbicacionNoHomologada,
      ya_asignado_sede: yaAsignadoSede,
      requiere_confirmacion_individual: requiereConfirmacionIndividual,
      clasificacion,
      conflictos_codigo: conflictosCodigo,
      conflictos_serie: conflictosSerie,
      motivos_bloqueo: motivosBloqueo
    };
  });
}

// ==========================================
// 2. DASHBOARD & KPIS (ESTADÍSTICAS CONCILIADAS POR CAMPAMENTO — TAREAS 5, 6, 7)
// ==========================================

router.get('/dashboard/kpis', requireAuth, requirePermission('dash:ver'), async (req, res) => {
  try {
    const db = getPool();
    const schemaCaps = await getSchemaCapabilities(db);
    const pendingClasificaciones = ['PENDIENTE_VALIDACION', 'PROPUESTO'].filter((v) =>
      schemaCaps.campamentos.clasificacionValues.includes(v)
    );
    const levOpenCond = schemaCaps.levantamientos.estadoValues.includes('Cancelado')
      ? "estado NOT IN ('Finalizado', 'Cancelado')"
      : "estado <> 'Finalizado'";
    const scope = await getUserAllowedCampamentos(db, req.user);
    const { almacen_id, incluir_sinteticos } = req.query;
    const includeSynthetic = incluir_sinteticos === 'true';

    const campFilter = await resolveRequestedCampamentoFilter(db, scope, req.query);
    if (campFilter.errorStatus) {
      return res.status(campFilter.errorStatus).json({ success: false, message: campFilter.errorMessage });
    }
    const { isSinSedeReq, selectedCid } = campFilter;
    const almacenParam = asNonEmptyString(almacen_id);

    let reqAlmId = null;
    if (almacen_id !== undefined && almacen_id !== '' && almacenParam !== 'TODOS') {
      reqAlmId = parsePositiveInt(almacen_id);
      if (!reqAlmId) {
        return res.status(400).json({ success: false, message: 'Parámetro almacen_id inválido.' });
      }
      if (!scope.isGlobal) {
        const [almRows] = await db.query(
          'SELECT campamento_id FROM inv_almacenes WHERE id = ? AND activo = 1',
          [reqAlmId]
        );
        if (almRows.length === 0 || !scope.campamentoIds.includes(almRows[0].campamento_id)) {
          return res.status(403).json({ success: false, message: 'Acceso denegado al almacén solicitado.' });
        }
      }
    }

    const isSinSedeFilter = scope.isGlobal && isSinSedeReq;
    const effectiveCampIds = !scope.isGlobal
      ? (selectedCid !== null ? [selectedCid] : scope.campamentoIds)
      : (selectedCid !== null ? [selectedCid] : null);

    let whereArt = 'WHERE activo = 1';
    const paramsArt = [];

    // Regla Tarea 7: Los datos sintéticos nunca se muestran como registros empresariales por defecto
    if (!includeSynthetic) {
      whereArt += ' AND es_sintetico = 0';
    }

    if (!scope.isGlobal) {
      if (selectedCid) {
        whereArt += ' AND campamento_id = ?';
        paramsArt.push(selectedCid);
      } else {
        const scopeFilter = buildArticleScopeFilter(scope, '');
        whereArt += ` AND ${scopeFilter.sql}`;
        paramsArt.push(...scopeFilter.params);
      }
    } else {
      if (isSinSedeFilter) {
        whereArt += ' AND campamento_id IS NULL';
      } else if (selectedCid) {
        whereArt += ' AND campamento_id = ?';
        paramsArt.push(selectedCid);
      }
    }

    if (reqAlmId) {
      whereArt += ' AND almacen_id = ?';
      paramsArt.push(reqAlmId);
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

    // 5. Total Campamentos Confirmados, Pendientes de Validación y Sintéticos (acotado por scope)
    let totalCampamentos = 0;
    let totalCampamentosPendientesValidacion = 0;
    let totalCampamentosSinteticos = 0;
    if (schemaCaps.campamentos.exists && !isSinSedeFilter && (effectiveCampIds === null || effectiveCampIds.length > 0)) {
      try {
        const campCountConds = ['activo = 1'];
        const campCountParams = [];
        if (effectiveCampIds !== null) {
          campCountConds.push('id IN (?)');
          campCountParams.push(effectiveCampIds);
        }
        const selectConfirmados = schemaCaps.campamentos.hasClasificacionSede
          ? `SUM(CASE WHEN clasificacion_sede = 'CONFIRMADO' ${schemaCaps.campamentos.hasEsSintetico ? 'AND es_sintetico = 0' : ''} THEN 1 ELSE 0 END)`
          : `SUM(CASE WHEN ${schemaCaps.campamentos.hasEsSintetico ? 'es_sintetico = 0' : '1 = 1'} THEN 1 ELSE 0 END)`;
        let selectPendientes = '0';
        const selectPendParams = [];
        if (schemaCaps.campamentos.hasClasificacionSede && pendingClasificaciones.length > 0) {
          selectPendientes = `SUM(CASE WHEN clasificacion_sede IN (?) ${schemaCaps.campamentos.hasEsSintetico ? 'AND es_sintetico = 0' : ''} THEN 1 ELSE 0 END)`;
          selectPendParams.push(pendingClasificaciones);
        }
        const selectSinteticos = schemaCaps.campamentos.hasEsSintetico
          ? 'SUM(CASE WHEN es_sintetico = 1 THEN 1 ELSE 0 END)'
          : '0';

        const [tc] = await db.query(`
          SELECT
            ${selectConfirmados} as confirmados,
            ${selectPendientes} as pendientes_validacion,
            ${selectSinteticos} as sinteticos
          FROM inv_campamentos WHERE ${campCountConds.join(' AND ')}
        `, [...selectPendParams, ...campCountParams]);
        totalCampamentos = parseInt(tc[0]?.confirmados || 0);
        totalCampamentosPendientesValidacion = scope.isGlobal ? parseInt(tc[0]?.pendientes_validacion || 0) : 0;
        totalCampamentosSinteticos = scope.isGlobal ? parseInt(tc[0]?.sinteticos || 0) : 0;
      } catch (campErr) {
        console.error('KPI campamentos error:', campErr?.message || campErr);
        totalCampamentos = 0;
      }
    }

    let totalAlmacenes = 0;
    if (schemaCaps.almacenes.exists && !isSinSedeFilter && (effectiveCampIds === null || effectiveCampIds.length > 0)) {
      try {
        const almCountConds = ['activo = 1'];
        const almCountParams = [];
        if (schemaCaps.almacenes.hasEsSintetico) {
          almCountConds.push('es_sintetico = 0');
        }
        if (schemaCaps.almacenes.hasEstadoVerificacion) {
          almCountConds.push("estado_verificacion = 'CONFIRMADO'");
        }
        if (effectiveCampIds !== null) {
          almCountConds.push('campamento_id IN (?)');
          almCountParams.push(effectiveCampIds);
        }
        if (reqAlmId) {
          almCountConds.push('id = ?');
          almCountParams.push(reqAlmId);
        }
        const [ta] = await db.query(
          `SELECT COUNT(*) as total FROM inv_almacenes WHERE ${almCountConds.join(' AND ')}`,
          almCountParams
        );
        totalAlmacenes = Number(ta[0]?.total || 0);
      } catch (almErr) {
        console.error('KPI totalAlmacenes error:', almErr?.message || almErr);
        totalAlmacenes = 0;
      }
    }

    // 6. Artículos sin serial identificable (Condición SQL unificada)
    let articulosSinSerial = 0;
    try {
      const [sinSerRes] = await db.query(`
        SELECT COUNT(*) as total FROM inv_articulos
        ${whereArt} AND ${SQL_SIN_SERIAL_CONDITION}
      `, paramsArt);
      articulosSinSerial = Number(sinSerRes[0]?.total || 0);
    } catch (sinSerErr) {
      console.error('KPI articulosSinSerial error:', sinSerErr?.message || sinSerErr);
      articulosSinSerial = 0;
    }

    // 7. Artículos pendientes de verificación (Cantidad NULL/no verificada O Estado Pendiente)
    let articulosPendientesVerificacion = 0;
    try {
      const [pendRes] = await db.query(`
        SELECT COUNT(*) as total FROM inv_articulos
        ${whereArt} AND (cantidad_num IS NULL OR cantidad_verificada = 0 OR estado_fisico = 'Pendiente de verificación')
      `, paramsArt);
      articulosPendientesVerificacion = Number(pendRes[0]?.total || 0);
    } catch (pendErr) {
      console.error('KPI articulosPendientesVerificacion error:', pendErr?.message || pendErr);
      articulosPendientesVerificacion = 0;
    }

    // 8. Levantamientos: en proceso y finalizados (acotado por scope y filtro territorial)
    let levantamientosEnProceso = 0;
    let levantamientosFinalizados = 0;
    if (schemaCaps.levantamientos.exists && !isSinSedeFilter && (effectiveCampIds === null || effectiveCampIds.length > 0)) {
      try {
        const levConds = [];
        const levParams = [];
        if (!includeSynthetic && schemaCaps.levantamientos.hasEsSintetico) levConds.push('es_sintetico = 0');
        if (effectiveCampIds !== null) {
          levConds.push('campamento_id IN (?)');
          levParams.push(effectiveCampIds);
        }
        if (reqAlmId) {
          levConds.push('almacen_id = ?');
          levParams.push(reqAlmId);
        }
        const levWhere = levConds.length > 0 ? `WHERE ${levConds.join(' AND ')}` : '';
        const [lCounts] = await db.query(`
          SELECT
            SUM(CASE WHEN ${levOpenCond} THEN 1 ELSE 0 END) as en_proceso,
            SUM(CASE WHEN estado = 'Finalizado' THEN 1 ELSE 0 END) as finalizados
          FROM inv_levantamientos
          ${levWhere}
        `, levParams);
        levantamientosEnProceso = parseInt(lCounts[0]?.en_proceso || 0);
        levantamientosFinalizados = parseInt(lCounts[0]?.finalizados || 0);
      } catch (levErr) {
        console.error('KPI levantamientos count error:', levErr?.message || levErr);
        levantamientosEnProceso = 0;
        levantamientosFinalizados = 0;
      }
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
    const movConds = ['a.activo = 1'];
    const movParams = [];
    if (!includeSynthetic) {
      movConds.push('m.es_sintetico = 0 AND a.es_sintetico = 0');
    }
    if (!scope.isGlobal) {
      if (selectedCid) {
        movConds.push('a.campamento_id = ?');
        movParams.push(selectedCid);
      } else {
        const movScope = buildArticleScopeFilter(scope, 'a');
        movConds.push(movScope.sql);
        movParams.push(...movScope.params);
      }
    } else if (isSinSedeFilter) {
      movConds.push('a.campamento_id IS NULL');
    } else if (selectedCid) {
      movConds.push('a.campamento_id = ?');
      movParams.push(selectedCid);
    }
    if (reqAlmId) {
      movConds.push('a.almacen_id = ?');
      movParams.push(reqAlmId);
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
      const campConds = ['c.activo = 1'];
      if (schemaCaps.campamentos.hasClasificacionSede) {
        campConds.push("c.clasificacion_sede = 'CONFIRMADO'");
      }
      if (!includeSynthetic && schemaCaps.campamentos.hasEsSintetico) {
        campConds.push('c.es_sintetico = 0');
      }
      const campParams = [];
      if (isSinSedeFilter) {
        campConds.push('1 = 0');
      } else if (effectiveCampIds !== null) {
        if (effectiveCampIds.length > 0) {
          campConds.push('c.id IN (?)');
          campParams.push(effectiveCampIds);
        } else {
          campConds.push('1 = 0');
        }
      }
      const campWhere = `WHERE ${campConds.join(' AND ')}`;

      const artSyntJoin = includeSynthetic ? '' : 'AND a.es_sintetico = 0';
      const almSyntSub = (!includeSynthetic && schemaCaps.almacenes.hasEsSintetico) ? 'AND es_sintetico = 0' : '';
      const levSyntSub = (!includeSynthetic && schemaCaps.levantamientos.hasEsSintetico) ? 'AND es_sintetico = 0' : '';

      const [cRes] = await db.query(`
        SELECT
          c.id, c.nombre, c.codigo, c.provincia, c.direccion, c.responsable,
          c.clasificacion_sede, c.ubicacion_historica_equivalente, c.origen_registro,
          (SELECT COUNT(*) FROM inv_almacenes WHERE campamento_id = c.id AND activo = 1 ${almSyntSub}) as cantidad_almacenes,
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
          (SELECT COUNT(*) FROM inv_levantamientos WHERE campamento_id = c.id AND ${levOpenCond} ${levSyntSub}) as levantamientos_abiertos,
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

      // 13.1. SECCIÓN SIN SEDE VERIFICADA (solo global, calculado dinámicamente desde inv_articulos)
      if (scope.isGlobal) {
        sinSedeVerificada = await buildSinSedeSummary(db, includeSynthetic);

        // 13.2. Campamentos registrados en BD pero pendientes de validación (San Cristóbal, Azua, Pedernales)
        if (schemaCaps.campamentos.hasClasificacionSede && pendingClasificaciones.length > 0) {
          const [pendCamps] = await db.query(`
            SELECT c.id, c.nombre, c.codigo, c.provincia, c.responsable, c.clasificacion_sede, c.origen_registro,
              (SELECT COUNT(*) FROM inv_almacenes WHERE campamento_id = c.id AND activo = 1 ${schemaCaps.almacenes.hasEsSintetico ? 'AND es_sintetico = 0' : ''}) as cantidad_almacenes
            FROM inv_campamentos c
            WHERE c.activo = 1 AND c.clasificacion_sede IN (?) ${schemaCaps.campamentos.hasEsSintetico ? 'AND c.es_sintetico = 0' : ''}
            ORDER BY c.id ASC
          `, [pendingClasificaciones]);
          campamentosPendientesValidacion = pendCamps.map(pc => ({
            ...pc,
            estado_inventario: 'SIN VINCULAR / PENDIENTE DE VALIDACIÓN FÍSICA (No respaldado en Excel 16-Oct-2026)'
          }));
        }
      }
    } catch (e) {
      console.error('Error calculando inventario por campamento:', e);
      porCampamento = [];
    }

    if (schemaCaps.almacenes.exists && !isSinSedeFilter && (effectiveCampIds === null || effectiveCampIds.length > 0)) {
      try {
        const artSyntFilter = includeSynthetic ? '' : 'AND art.es_sintetico = 0';
        const almWhereConds = ['a.activo = 1'];
        const almWhereParams = [];
        if (!includeSynthetic && schemaCaps.almacenes.hasEsSintetico) almWhereConds.push('a.es_sintetico = 0');
        if (effectiveCampIds !== null) {
          almWhereConds.push('a.campamento_id IN (?)');
          almWhereParams.push(effectiveCampIds);
        }
        if (reqAlmId) {
          almWhereConds.push('a.id = ?');
          almWhereParams.push(reqAlmId);
        }
        const almEstadoSelect = schemaCaps.almacenes.hasEstadoVerificacion
          ? 'a.estado_verificacion'
          : "'CONFIRMADO' as estado_verificacion";
        const almEstadoGroup = schemaCaps.almacenes.hasEstadoVerificacion
          ? ', a.estado_verificacion'
          : '';
        const [aRes] = await db.query(`
          SELECT a.id, a.nombre, a.campamento_id, ${almEstadoSelect}, c.nombre as campamento_nombre,
                 COUNT(art.id) as total_articulos,
                 SUM(COALESCE(art.cantidad_num, 0)) as total_fisico
          FROM inv_almacenes a
          LEFT JOIN inv_campamentos c ON a.campamento_id = c.id
          LEFT JOIN inv_articulos art ON (art.almacen_id = a.id) AND art.activo = 1 ${artSyntFilter}
          WHERE ${almWhereConds.join(' AND ')}
          GROUP BY a.id, a.nombre, a.campamento_id${almEstadoGroup}, c.nombre
          ORDER BY total_articulos DESC, a.id ASC
        `, almWhereParams);
        porAlmacen = aRes;
      } catch (almListErr) {
        console.error('KPI porAlmacen error:', almListErr?.message || almListErr);
        porAlmacen = [];
      }
    }

    if (schemaCaps.levantamientos.exists && !isSinSedeFilter && (effectiveCampIds === null || effectiveCampIds.length > 0)) {
      try {
        const levSumConds = [];
        const levSumParams = [];
        if (!includeSynthetic && schemaCaps.levantamientos.hasEsSintetico) levSumConds.push('l.es_sintetico = 0');
        if (effectiveCampIds !== null) {
          levSumConds.push('l.campamento_id IN (?)');
          levSumParams.push(effectiveCampIds);
        }
        if (reqAlmId) {
          levSumConds.push('l.almacen_id = ?');
          levSumParams.push(reqAlmId);
        }
        const levSumWhere = levSumConds.length > 0 ? `WHERE ${levSumConds.join(' AND ')}` : '';
        const [lRes] = await db.query(`
          SELECT l.id, l.codigo_levantamiento, l.titulo, l.estado, c.nombre as campamento_nombre,
                 (SELECT COUNT(*) FROM inv_levantamiento_items WHERE levantamiento_id = l.id) as items_capturados
          FROM inv_levantamientos l
          JOIN inv_campamentos c ON l.campamento_id = c.id
          ${levSumWhere}
          ORDER BY l.id DESC LIMIT 5
        `, levSumParams);
        levantamientosResumen = lRes;
      } catch (levListErr) {
        console.error('KPI levantamientosResumen error:', levListErr?.message || levListErr);
        levantamientosResumen = [];
      }
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
      cuadraArticulos: (selectedCid === null && !isSinSedeFilter)
        ? (totalArticulos === sumaArticulosCampamentosConfirmados + articulosSinSedeCount)
        : true,
      totalUnidadesFisicasConocidas: sumaUnidadesCampamentosConfirmados + unidadesSinSedeCount,
      sumaUnidadesCampamentosConfirmados,
      unidadesSinSedeVerificada: unidadesSinSedeCount,
      cuadraUnidades: (selectedCid === null && !isSinSedeFilter)
        ? (Math.abs(cantidadFisicaTotal - (sumaUnidadesCampamentosConfirmados + unidadesSinSedeCount)) < 0.01)
        : true,
      totalArticulosCantidadPendiente: articulosSinCantidad,
      totalArticulosEstadoPendiente: articulosEstadoPendiente
    };

    // 15. Resumen de Capa Sintética Aislada (acotado por scope)
    let resumenSinteticos = { articulos: 0, campamentos: totalCampamentosSinteticos, almacenes: 0, levantamientos: 0 };
    if (!isSinSedeFilter && (effectiveCampIds === null || effectiveCampIds.length > 0)) {
      try {
        if (scope.isGlobal && effectiveCampIds === null) {
          const [[sArt]] = await db.query('SELECT COUNT(*) as c FROM inv_articulos WHERE activo = 1 AND es_sintetico = 1');
          const sAlm = (schemaCaps.almacenes.exists && schemaCaps.almacenes.hasEsSintetico)
            ? (await db.query('SELECT COUNT(*) as c FROM inv_almacenes WHERE activo = 1 AND es_sintetico = 1'))[0][0]
            : { c: 0 };
          const sLev = (schemaCaps.levantamientos.exists && schemaCaps.levantamientos.hasEsSintetico)
            ? (await db.query('SELECT COUNT(*) as c FROM inv_levantamientos WHERE es_sintetico = 1'))[0][0]
            : { c: 0 };
          resumenSinteticos = {
            articulos: sArt?.c || 0,
            campamentos: totalCampamentosSinteticos,
            almacenes: sAlm?.c || 0,
            levantamientos: sLev?.c || 0
          };
        } else if (effectiveCampIds && effectiveCampIds.length > 0) {
          const [[sArt]] = await db.query(
            'SELECT COUNT(*) as c FROM inv_articulos WHERE activo = 1 AND es_sintetico = 1 AND campamento_id IN (?)',
            [effectiveCampIds]
          );
          const sAlm = (schemaCaps.almacenes.exists && schemaCaps.almacenes.hasEsSintetico)
            ? (await db.query('SELECT COUNT(*) as c FROM inv_almacenes WHERE activo = 1 AND es_sintetico = 1 AND campamento_id IN (?)', [effectiveCampIds]))[0][0]
            : { c: 0 };
          const sLev = (schemaCaps.levantamientos.exists && schemaCaps.levantamientos.hasEsSintetico)
            ? (await db.query('SELECT COUNT(*) as c FROM inv_levantamientos WHERE es_sintetico = 1 AND campamento_id IN (?)', [effectiveCampIds]))[0][0]
            : { c: 0 };
          resumenSinteticos = {
            articulos: sArt?.c || 0,
            campamentos: totalCampamentosSinteticos,
            almacenes: sAlm?.c || 0,
            levantamientos: sLev?.c || 0
          };
        }
      } catch (synthErr) {
        console.error('KPI resumenSinteticos error:', synthErr?.message || synthErr);
        resumenSinteticos = { articulos: 0, campamentos: totalCampamentosSinteticos, almacenes: 0, levantamientos: 0 };
      }
    }

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

async function generateNextCodeForArea(dbOrConn, area, options = {}) {
  const { forUpdate = false } = options;
  const lockSuffix = forUpdate ? ' FOR UPDATE' : '';
  const normArea = (area || 'ALMACEN').toUpperCase().trim();
  const prefix = AREA_PREFIX_MAP[normArea] || 'ACT';

  // Buscar códigos existentes en inv_articulos que comiencen con el prefijo
  const [rows] = await dbOrConn.query(
    `SELECT codigo_original FROM inv_articulos WHERE codigo_original LIKE ?${lockSuffix}`,
    [`${prefix}%`]
  );

  let maxNum = 0;
  for (const r of rows) {
    if (!r.codigo_original) continue;
    const matches = String(r.codigo_original).match(/\d+/g);
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
    const [auditRows] = await dbOrConn.query(
      `SELECT codigo_original FROM inv_levantamiento_items WHERE codigo_original LIKE ?${lockSuffix}`,
      [`${prefix}%`]
    );
    for (const r of auditRows) {
      if (!r.codigo_original) continue;
      const matches = String(r.codigo_original).match(/\d+/g);
      if (matches) {
        for (const m of matches) {
          const num = parseInt(m, 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      }
    }
  } catch (err) {
    if (err?.code !== 'ER_NO_SUCH_TABLE') {
      console.warn('[CODES] Error consultando inv_levantamiento_items:', err?.message || err);
    }
  }

  let nextNum = maxNum + 1;
  let candidate = `${prefix}-${String(nextNum).padStart(3, '0')}`;

  // Verificar que el candidato no exista previamente ni en maestro ni en levantamientos
  while (true) {
    const [checkMaster] = await dbOrConn.query(
      `SELECT id FROM inv_articulos WHERE UPPER(TRIM(codigo_original)) = ? LIMIT 1${lockSuffix}`,
      [candidate.toUpperCase()]
    );
    const [checkLev] = await dbOrConn.query(
      `SELECT id FROM inv_levantamiento_items WHERE UPPER(TRIM(codigo_original)) = ? LIMIT 1${lockSuffix}`,
      [candidate.toUpperCase()]
    );
    if (checkMaster.length === 0 && checkLev.length === 0) break;
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

router.get('/articulos/next-code', requireAuth, requirePermission('inv:crear'), async (req, res) => {
  try {
    const db = getPool();
    const area = asNonEmptyString(req.query.area);
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

// v2.2 — Contadores "facetados" del inventario (solo lectura). Cada contador responde:
// "¿cuántos artículos habría si el usuario eligiera esta opción, manteniendo TODOS los demás filtros?".
// Reutiliza las mismas condiciones del listado (sin duplicar lógica) y respeta siempre el alcance por sede.
async function computeArticuloFacetas(db, { conditions, params, segs, scope, baseCount, areaValue, categoriaValue }) {
  const sinSeg = (tag) => {
    const s = segs[tag];
    let cs = [...conditions];
    let ps = [...params];
    if (s) {
      cs = conditions.filter((_, i) => i < s.c0 || i >= s.c1);
      ps = params.filter((_, i) => i < s.p0 || i >= s.p1);
    }
    // Al quitar el filtro de sede, un usuario con alcance limitado conserva SIEMPRE su alcance.
    if (tag === 'campamento' && !scope.isGlobal) {
      const sf = buildArticleScopeFilter(scope, 'a');
      cs.push(sf.sql);
      ps.push(...sf.params);
    }
    return { where: cs.join(' AND '), params: ps };
  };
  const agrupar = async (tag, col, { texto = false } = {}) => {
    const { where, params: ps } = sinSeg(tag);
    const extra = texto ? ` AND ${col} IS NOT NULL AND TRIM(${col}) <> ''` : '';
    const [rows] = await db.query(
      `SELECT ${col} AS valor, COUNT(*) AS total FROM inv_articulos a WHERE ${where}${extra} GROUP BY ${col} ORDER BY total DESC LIMIT 300`,
      ps
    );
    return rows.map((r) => ({ valor: r.valor, total: Number(r.total) }));
  };

  const areasRows = await agrupar('area', 'a.area');
  const categorias = (await agrupar('categoria', 'a.categoria', { texto: true })).sort((x, y) => String(x.valor).localeCompare(String(y.valor), 'es'));
  const ubicaciones = (await agrupar('ubicacion', 'a.ubicacion_nombre', { texto: true })).sort((x, y) => String(x.valor).localeCompare(String(y.valor), 'es'));
  const campamentos = (await agrupar('campamento', 'a.campamento_id')).map((c) => ({ campamento_id: c.valor, total: c.total }));

  // Totales de contexto: alcance del usuario sin ningún filtro, y dentro del área / de la categoría elegidas.
  const base = conditions.slice(0, baseCount);
  const scopeConds = [];
  const scopeParams = [];
  if (!scope.isGlobal) {
    const sf = buildArticleScopeFilter(scope, 'a');
    scopeConds.push(sf.sql);
    scopeParams.push(...sf.params);
  }
  const contar = async (extraConds, extraParams) => {
    const w = [...base, ...scopeConds, ...extraConds].join(' AND ');
    const [[r]] = await db.query(`SELECT COUNT(*) AS n FROM inv_articulos a WHERE ${w}`, [...scopeParams, ...extraParams]);
    return Number(r.n);
  };
  const totales = { alcance: await contar([], []), area: null, categoria: null };
  if (areaValue) totales.area = await contar(['a.area = ?'], [areaValue]);
  // Totales independientes entre sí (cada uno = alcance + ese único filtro), para que nunca se confundan
  // con el resultado de la combinación completa.
  if (categoriaValue) totales.categoria = await contar(['a.categoria = ?'], [categoriaValue]);

  return {
    areas: Object.fromEntries(areasRows.map((r) => [r.valor, r.total])),
    categorias,
    ubicaciones,
    campamentos,
    totales
  };
}

router.get('/articulos', requireAuth, requirePermission('inv:ver'), async (req, res) => {
  try {
    const db = getPool();
    const schemaCaps = await getSchemaCapabilities(db);
    const scope = await getUserAllowedCampamentos(db, req.user);
    const {
      area,
      categoria,
      estado,
      ubicacion,
      search,
      sinSerial,
      sinCantidad,
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

    const campFilter = await resolveRequestedCampamentoFilter(db, scope, req.query);
    if (campFilter.errorStatus) {
      return res.status(campFilter.errorStatus).json({ success: false, message: campFilter.errorMessage });
    }
    const { isSinSedeReq, selectedCid } = campFilter;

    // v2.2: se registra en qué posiciones de (conditions, params) vive cada filtro para poder calcular
    // contadores "facetados" (opción elegida + resto de filtros) sin duplicar la lógica de filtrado.
    const segs = {};
    const track = (tag) => {
      const c0 = conditions.length;
      const p0 = params.length;
      return () => { segs[tag] = { c0, c1: conditions.length, p0, p1: params.length }; };
    };

    // Ámbito de campamentos / sedes permitidas
    const endCamp = track('campamento');
    if (!scope.isGlobal) {
      if (selectedCid !== null) {
        conditions.push('(a.campamento_id = ?)');
        params.push(selectedCid);
      } else {
        const scopeFilter = buildArticleScopeFilter(scope, 'a');
        conditions.push(scopeFilter.sql);
        params.push(...scopeFilter.params);
      }
    } else if (isSinSedeReq) {
      conditions.push('a.campamento_id IS NULL');
    } else if (selectedCid !== null) {
      conditions.push('a.campamento_id = ?');
      params.push(selectedCid);
    }
    endCamp();

    const endArea = track('area');
    const areaParam = asNonEmptyString(area);
    if (areaParam && areaParam.toUpperCase() !== 'TODOS') {
      conditions.push('a.area = ?');
      params.push(areaParam.toUpperCase());
    }
    endArea();

    const endCat = track('categoria');
    const categoriaParam = asNonEmptyString(categoria);
    if (categoriaParam && categoriaParam.toUpperCase() !== 'TODAS') {
      conditions.push('a.categoria = ?');
      params.push(categoriaParam);
    }
    endCat();

    const estadoParam = asNonEmptyString(estado);
    if (estadoParam && estadoParam.toUpperCase() !== 'TODOS') {
      const normEstado = normalizeEstadoParam(estadoParam);
      if (normEstado) {
        conditions.push('a.estado_fisico = ?');
        params.push(normEstado);
      }
    }

    const endUbic = track('ubicacion');
    const ubicacionParam = asNonEmptyString(ubicacion);
    if (ubicacionParam && ubicacionParam.toUpperCase() !== 'TODAS') {
      conditions.push('a.ubicacion_nombre = ?');
      params.push(ubicacionParam);
    }
    endUbic();

    if (sinSerial === 'true') {
      conditions.push(buildSqlSinSerialCondition('a.serie_imei'));
    }

    if (sinCantidad === 'true') {
      conditions.push('(a.cantidad_num IS NULL OR a.cantidad_verificada = 0)');
    }

    const searchParam = asNonEmptyString(search);
    if (searchParam) {
      const q = `%${searchParam}%`;
      conditions.push(`(
        a.codigo_original LIKE ? OR
        a.articulo_nombre LIKE ? OR
        a.${schemaCaps.articulos.brandCol} LIKE ? OR
        a.serie_imei LIKE ? OR
        a.asignado_a LIKE ? OR
        a.ubicacion_nombre LIKE ? OR
        a.categoria LIKE ? OR
        a.observaciones LIKE ?
      )`);
      params.push(q, q, q, q, q, q, q, q);
    }

    // v2.2: filtro por fecha de registro (fecha_creacion/creado_en); sin parámetros no cambia nada
    if (schemaCaps.articulos.createdCol !== 'id') {
      if (!applyDateRange(req, res, conditions, params, `a.${schemaCaps.articulos.createdCol}`)) return;
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

    // Sorting safe fields (mapeo compatible MySQL 8 / respaldos históricos: fecha_creacion vs creado_en)
    const sortColumnMap = {
      id: 'a.id',
      codigo_original: 'a.codigo_original',
      articulo_nombre: 'a.articulo_nombre',
      categoria: 'a.categoria',
      area: 'a.area',
      estado_fisico: 'a.estado_fisico',
      ubicacion_nombre: 'a.ubicacion_nombre',
      cantidad_num: 'a.cantidad_num',
      asignado_a: 'a.asignado_a',
      campamento_id: 'a.campamento_id',
      fecha_creacion: `a.${schemaCaps.articulos.createdCol}`,
      creado_en: `a.${schemaCaps.articulos.createdCol}`,
      marca_modelo: `a.${schemaCaps.articulos.brandCol}`,
      marca: `a.${schemaCaps.articulos.brandCol}`,
      tipo_caracteristicas: `a.${schemaCaps.articulos.specCol}`,
      modelo_caracteristicas: `a.${schemaCaps.articulos.specCol}`
    };
    const safeSort = (typeof sortBy === 'string' && Object.hasOwn(sortColumnMap, sortBy))
      ? sortColumnMap[sortBy]
      : 'a.id';
    const safeOrder = typeof sortOrder === 'string' && sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const extraAliases = [];
    if (schemaCaps.articulos.brandCol !== 'marca_modelo') {
      extraAliases.push(`a.${schemaCaps.articulos.brandCol} as marca_modelo`);
    }
    if (schemaCaps.articulos.specCol !== 'tipo_caracteristicas') {
      extraAliases.push(`a.${schemaCaps.articulos.specCol} as tipo_caracteristicas`);
    }
    if (schemaCaps.articulos.createdCol !== 'fecha_creacion' && schemaCaps.articulos.createdCol !== 'id') {
      extraAliases.push(`a.${schemaCaps.articulos.createdCol} as fecha_creacion`);
    }
    const extraAliasSql = extraAliases.length > 0 ? `,\n             ${extraAliases.join(',\n             ')}` : '';

    // Pagination
    const numLimit = sanitizeLimit(limit, 50, 500);
    const numPage = sanitizePage(page);
    const offset = (numPage - 1) * numLimit;

    const query = `
      SELECT a.*${extraAliasSql},
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
    const sanitizedRows = rows.map(sanitizeListArticleRow);

    // v2.2: contadores facetados solo si se piden (?facetas=true); sin el parámetro la respuesta es idéntica a la anterior
    let facetas;
    if (req.query.facetas === 'true') {
      facetas = await computeArticuloFacetas(db, {
        conditions,
        params,
        segs,
        scope,
        baseCount: includeSynthetic ? 1 : 2,
        areaValue: areaParam && areaParam.toUpperCase() !== 'TODOS' ? areaParam.toUpperCase() : null,
        categoriaValue: categoriaParam && categoriaParam.toUpperCase() !== 'TODAS' ? categoriaParam : null
      });
    }

    res.json({
      success: true,
      articulos: sanitizedRows,
      resumen: {
        totalRegistros: total,
        totalUnidadesFisicas,
        articulosSinCantidad
      },
      pagination: {
        total,
        page: numPage,
        limit: numLimit,
        totalPages: Math.ceil(total / numLimit)
      },
      ...(facetas ? { facetas } : {})
    });
  } catch (error) {
    console.error('List articulos error:', error);
    res.status(500).json({ success: false, message: 'Error listando artículos de inventario.' });
  }
});

router.get('/articulos/:id', requireAuth, requirePermission('inv:ver'), async (req, res) => {
  try {
    const db = getPool();
    const artId = parsePositiveInt(req.params.id);
    if (!artId) {
      return res.status(400).json({ success: false, message: 'ID de artículo inválido.' });
    }

    const [rows] = await db.query('SELECT * FROM inv_articulos WHERE id = ?', [artId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Artículo no encontrado.' });
    }
    const articulo = rows[0];

    const perms = Array.isArray(req.user?.permisos) ? req.user.permisos : [];
    const canSeeInactive = (
      req.user.rol === 'developer' ||
      req.user.es_developer === 1 ||
      perms.includes('*') ||
      perms.includes('aud:ver')
    ) && req.query.incluir_inactivos === 'true';
    if (articulo.activo !== 1 && !canSeeInactive) {
      return res.status(404).json({ success: false, message: 'Artículo no encontrado.' });
    }

    // Verificar ámbito de campamento sin coincidencia parcial (.includes)
    const scope = await getUserAllowedCampamentos(db, req.user);
    if (!canAccessArticle(scope, articulo)) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: El activo pertenece a otra sede o campamento no autorizado.'
      });
    }

    // Get movement history
    const [movimientos] = await db.query(
      `SELECT m.*, u.nombre as usuario_nombre
       FROM inv_movimientos m
       LEFT JOIN inv_usuarios u ON m.usuario_id = u.id
       WHERE m.articulo_id = ?
       ORDER BY m.fecha_movimiento DESC`,
      [artId]
    );

    res.json({
      success: true,
      articulo,
      historial_movimientos: movimientos
    });
  } catch (error) {
    console.error('Get articulo detail error:', error);
    const status = isDbUnavailableError(error) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error obteniendo detalle del artículo.' });
  }
});

// CREATE ITEM
router.post('/articulos', requireAuth, requirePermission('inv:crear'), async (req, res) => {
  const pool = getPool();
  let conn = null;
  let inTransaction = false;
  try {
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
    } = req.body || {};

    if (
      typeof area !== 'string' || !area.trim() ||
      typeof articulo_nombre !== 'string' || !articulo_nombre.trim() ||
      typeof ubicacion_nombre !== 'string' || !ubicacion_nombre.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: 'Área, descripción del artículo y ubicación son obligatorios.'
      });
    }

    const normArea = area.trim().toUpperCase();
    if (!VALID_INVENTARIO_AREAS.includes(normArea)) {
      return res.status(400).json({
        success: false,
        message: `Área inválida. Valores permitidos: ${VALID_INVENTARIO_AREAS.join(', ')}.`
      });
    }

    if (campamento_id !== undefined && campamento_id !== null && String(campamento_id).trim() !== '' && !parsePositiveInt(campamento_id)) {
      return res.status(400).json({ success: false, message: 'ID de campamento inválido.' });
    }

    let parsedCant = null;
    if (cantidad_num !== undefined && cantidad_num !== null && String(cantidad_num).trim() !== '') {
      const candidateCant = Number(cantidad_num);
      if (!Number.isFinite(candidateCant) || candidateCant < 0) {
        return res.status(400).json({ success: false, message: 'La cantidad debe ser un número válido mayor o igual a cero.' });
      }
      if (Number(candidateCant.toFixed(2)) !== candidateCant) {
        return res.status(400).json({ success: false, message: 'La cantidad no puede tener más de 2 cifras decimales.' });
      }
      parsedCant = candidateCant;
    }

    conn = await pool.getConnection();
    if (!conn) {
      return res.status(503).json({ success: false, message: 'Servicio de base de datos no disponible temporalmente.' });
    }
    await conn.beginTransaction();
    inTransaction = true;

    // Validación estricta de ámbito de campamento destino (sin coincidencia parcial .includes)
    const scope = await getUserAllowedCampamentos(conn, req.user);
    if (!canTargetCampamento(scope, campamento_id, ubicacion_nombre)) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: No tiene autorización para registrar artículos en esta sede.'
      });
    }

    const vinc = await resolveCampamentoVinculacion(conn, campamento_id, ubicacion_nombre);
    if (vinc.campamento_invalido) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(400).json({
        success: false,
        message: 'El campamento seleccionado no existe o está inactivo.'
      });
    }

    let finalCodigo = (typeof codigo_original === 'string' ? codigo_original : '').trim();

    // 1. Validación o generación atómica FOR UPDATE de Código de Referencia (M07)
    if (finalCodigo !== '') {
      const [existingCode] = await conn.query(
        'SELECT id, articulo_nombre FROM inv_articulos WHERE UPPER(TRIM(codigo_original)) = ? AND activo = 1 LIMIT 1 FOR UPDATE',
        [finalCodigo.toUpperCase()]
      );
      if (existingCode.length > 0) {
        inTransaction = false;
        await safeRollback(conn);
        return res.status(409).json({
          success: false,
          message: `El código de referencia "${finalCodigo}" ya está asignado al activo "${existingCode[0].articulo_nombre}".`
        });
      }
    } else {
      const autoGen = await generateNextCodeForArea(conn, normArea, { forUpdate: true });
      finalCodigo = autoGen.nextCode;
    }

    // 2. Validación estricta de unicidad de Serie / IMEI real (excluye placeholders S/N, N/A, -, etc.)
    const cleanSerie = typeof serie_imei === 'string' && serie_imei.trim() !== '' ? serie_imei.trim() : null;
    const serialKey = normalizeSerialKey(cleanSerie);
    if (serialKey) {
      const [existingSerial] = await conn.query(
        'SELECT id, codigo_original, articulo_nombre FROM inv_articulos WHERE activo = 1 AND UPPER(TRIM(serie_imei)) = ? LIMIT 1 FOR UPDATE',
        [serialKey]
      );
      if (existingSerial.length > 0) {
        inTransaction = false;
        await safeRollback(conn);
        return res.status(409).json({
          success: false,
          message: `El serial/IMEI "${cleanSerie}" ya se encuentra asignado al activo activo "${existingSerial[0].articulo_nombre}" (${existingSerial[0].codigo_original || `#${existingSerial[0].id}`}).`
        });
      }
    }

    // 3. Registro dinámico de Categoría en inv_categorias si es nueva
    if (typeof categoria === 'string' && categoria.trim() !== '' && categoria.trim() !== 'General') {
      try {
        await conn.query(
          'INSERT IGNORE INTO inv_categorias (area, nombre, activo) VALUES (?, ?, 1)',
          [normArea, categoria.trim()]
        );
      } catch (catErr) {
        if (catErr?.code !== 'ER_NO_SUCH_TABLE') {
          console.warn('[CATALOGOS] Error registrando categoría dinámica:', catErr?.message || catErr);
        }
      }
    }

    // 4. Registro dinámico de Custodio en inv_custodios si es nuevo
    if (typeof asignado_a === 'string' && asignado_a.trim() !== '' && asignado_a.trim() !== 'Sin asignar') {
      try {
        await conn.query(
          'INSERT IGNORE INTO inv_custodios (nombre, activo) VALUES (?, 1)',
          [asignado_a.trim()]
        );
      } catch (custErr) {
        if (custErr?.code !== 'ER_NO_SUCH_TABLE') {
          console.warn('[CATALOGOS] Error registrando custodio dinámico:', custErr?.message || custErr);
        }
      }
    }

    const schemaCaps = await getSchemaCapabilities(conn);
    const isSynt = (es_sintetico === true || es_sintetico === 1 || String(observaciones || '').includes('[REGISTRO SINTÉTICO')) ? 1 : 0;
    const cantVerif = parsedCant !== null ? 1 : 0;
    const estadoCantidad = parsedCant !== null ? 'VERIFICADO' : 'PENDIENTE_VERIFICACION';
    const estadoNormalizado = normalizeEstadoFisico(estado_fisico);
    const cleanUbic = ubicacion_nombre.trim();

    const [result] = await conn.query(
      `INSERT INTO inv_articulos (
        codigo_original, area, categoria, articulo_nombre, ${schemaCaps.articulos.brandCol},
        ${schemaCaps.articulos.specCol}, serie_imei, propietario, asignado_a,
        cantidad_num, cantidad_texto, cantidad_verificada, estado_cantidad, unidad_medida,
        estado_fisico, ubicacion_nombre, zona_estante, fecha_revision,
        observaciones, activo, hoja_origen, fila_origen, creado_por,
        campamento_id, almacen_id, es_sintetico, origen_datos, estado_vinculacion_sede
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?, ?, ?, ?, ?, ?)`,
      [
        finalCodigo,
        normArea,
        typeof categoria === 'string' && categoria.trim() ? categoria.trim() : 'General',
        articulo_nombre.trim(),
        marca_modelo || null,
        tipo_caracteristicas || null,
        cleanSerie,
        propietario || 'INGMELEC',
        typeof asignado_a === 'string' && asignado_a.trim() ? asignado_a.trim() : null,
        parsedCant,
        parsedCant !== null ? String(parsedCant) : null,
        cantVerif,
        estadoCantidad,
        unidad_medida || 'Unidad',
        estadoNormalizado,
        cleanUbic,
        zona_estante || null,
        fecha_revision || null,
        observaciones || null,
        `CREADO_MANUAL_${normArea}`,
        req.user.id,
        vinc.campamento_id,
        vinc.almacen_id,
        isSynt,
        isSynt ? 'SINTETICO_PRUEBA' : 'OPERATIVO_REAL',
        vinc.estado_vinculacion_sede
      ]
    );

    const newId = result.insertId;

    // Registrar movimiento ENTRADA respetando 0/NULL (A06: no fabricar 1 unidad cuando no existe)
    await conn.query(
      `INSERT INTO inv_movimientos (
        articulo_id, tipo_movimiento, cantidad, unidad_medida,
        ubicacion_destino, custodio_destino, estado_nuevo, motivo, usuario_id, es_sintetico
      ) VALUES (?, 'ENTRADA', ?, ?, ?, ?, ?, 'Alta manual de inventario', ?, ?)`,
      [
        newId,
        parsedCant !== null ? parsedCant : 0,
        unidad_medida || 'Unidad',
        cleanUbic,
        typeof asignado_a === 'string' && asignado_a.trim() ? asignado_a.trim() : null,
        estadoNormalizado,
        req.user.id,
        isSynt
      ]
    );

    // Audit inside transaction
    await logAudit(conn, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'ALTA_ARTICULO',
      entidad: 'inv_articulos',
      entidad_id: newId,
      detalles_nuevos: {
        ...(req.body || {}),
        codigo_original: finalCodigo,
        area: normArea,
        campamento_id: vinc.campamento_id,
        almacen_id: vinc.almacen_id
      },
      req
    });

    await conn.commit();
    inTransaction = false;

    res.status(201).json({
      success: true,
      message: 'Artículo registrado correctamente.',
      id: newId,
      codigo_original: finalCodigo,
      campamento_id: vinc.campamento_id,
      almacen_id: vinc.almacen_id,
      estado_vinculacion_sede: vinc.estado_vinculacion_sede
    });
  } catch (error) {
    if (conn && inTransaction) {
      await safeRollback(conn);
    }
    console.error('Create articulo error:', error);
    const status = isDbUnavailableError(error, conn) ? 503 : 500;
    res.status(status).json({
      success: false,
      message: status === 503
        ? 'Base de datos temporalmente no disponible. Intente nuevamente.'
        : 'Error registrando artículo.'
    });
  } finally {
    safeRelease(conn);
  }
});

// UPDATE ITEM
router.put('/articulos/:id', requireAuth, requirePermission('inv:editar'), async (req, res) => {
  const pool = getPool();
  let conn = null;
  let inTransaction = false;
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'ID de artículo inválido.' });
    }

    const {
      codigo_original,
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
    } = req.body || {};

    if (articulo_nombre !== undefined && (typeof articulo_nombre !== 'string' || !articulo_nombre.trim())) {
      return res.status(400).json({ success: false, message: 'La descripción del artículo no puede estar vacía.' });
    }

    if (cantidad_num !== undefined && cantidad_num !== null && String(cantidad_num).trim() !== '') {
      const checkCant = Number(cantidad_num);
      if (!Number.isFinite(checkCant) || checkCant < 0) {
        return res.status(400).json({ success: false, message: 'La cantidad debe ser un número válido mayor o igual a cero.' });
      }
      if (Number(checkCant.toFixed(2)) !== checkCant) {
        return res.status(400).json({ success: false, message: 'La cantidad no puede tener más de 2 cifras decimales.' });
      }
    }

    conn = await pool.getConnection();
    if (!conn) {
      return res.status(503).json({ success: false, message: 'Servicio de base de datos no disponible temporalmente.' });
    }
    await conn.beginTransaction();
    inTransaction = true;

    const [prevRows] = await conn.query('SELECT * FROM inv_articulos WHERE id = ? AND activo = 1 FOR UPDATE', [id]);
    if (prevRows.length === 0) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(404).json({ success: false, message: 'Artículo no encontrado.' });
    }
    const prev = prevRows[0];

    // Validación estricta de ámbito de campamento origen (sin coincidencia parcial .includes)
    const scope = await getUserAllowedCampamentos(conn, req.user);
    if (!canAccessArticle(scope, prev)) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: No puede modificar artículos de otra sede o campamento.'
      });
    }

    // Validar unicidad de codigo_original y serie_imei si fueron modificados (M07)
    let nextCodigoOriginal = prev.codigo_original;
    if (codigo_original !== undefined && typeof codigo_original === 'string' && codigo_original.trim() !== '') {
      const candidateCode = codigo_original.trim();
      if (candidateCode.toUpperCase() !== String(prev.codigo_original || '').trim().toUpperCase()) {
        const [dupCodeRows] = await conn.query(
          'SELECT id, articulo_nombre FROM inv_articulos WHERE activo = 1 AND UPPER(TRIM(codigo_original)) = ? AND id <> ? LIMIT 1 FOR UPDATE',
          [candidateCode.toUpperCase(), id]
        );
        if (dupCodeRows.length > 0) {
          inTransaction = false;
          await safeRollback(conn);
          return res.status(409).json({
            success: false,
            message: `El código de referencia "${candidateCode}" ya está asignado al activo "${dupCodeRows[0].articulo_nombre}".`
          });
        }
      }
      nextCodigoOriginal = candidateCode;
    }

    let nextSerieImei = prev.serie_imei;
    if (serie_imei !== undefined) {
      const cleanSerie = typeof serie_imei === 'string' && serie_imei.trim() !== '' ? serie_imei.trim() : null;
      const serialKey = normalizeSerialKey(cleanSerie);
      if (serialKey) {
        const [dupSerRows] = await conn.query(
          'SELECT id, articulo_nombre FROM inv_articulos WHERE activo = 1 AND UPPER(TRIM(serie_imei)) = ? AND id <> ? LIMIT 1 FOR UPDATE',
          [serialKey, id]
        );
        if (dupSerRows.length > 0) {
          inTransaction = false;
          await safeRollback(conn);
          return res.status(409).json({
            success: false,
            message: `El serial/IMEI "${cleanSerie}" ya pertenece a otro activo activo ("${dupSerRows[0].articulo_nombre}").`
          });
        }
      }
      nextSerieImei = cleanSerie;
    }

    // Validar que el destino (campamento_id / ubicacion_nombre) pertenezca también al ámbito autorizado
    if (!scope.isGlobal && (campamento_id !== undefined || ubicacion_nombre !== undefined)) {
      if (campamento_id !== undefined && (campamento_id === null || String(campamento_id).trim() === '')) {
        inTransaction = false;
        await safeRollback(conn);
        return res.status(403).json({
          success: false,
          message: 'Acceso denegado: Solo perfiles globales pueden desvincular un artículo de su sede.'
        });
      }
      const campChanged = campamento_id !== undefined && Number(campamento_id) !== Number(prev.campamento_id);
      const hasNewUbic = typeof ubicacion_nombre === 'string' && ubicacion_nombre.trim() !== '';
      const ubicChanged = hasNewUbic && normalizeExactLocation(ubicacion_nombre) !== normalizeExactLocation(prev.ubicacion_nombre);

      if (campChanged || ubicChanged) {
        const targetCampId = campamento_id !== undefined ? campamento_id : prev.campamento_id;
        const targetUbic = hasNewUbic ? ubicacion_nombre : prev.ubicacion_nombre;
        if (!canTargetCampamento(scope, targetCampId, targetUbic)) {
          inTransaction = false;
          await safeRollback(conn);
          return res.status(403).json({
            success: false,
            message: 'Acceso denegado: No tiene autorización para trasladar o reasignar el artículo a otra sede o campamento.'
          });
        }
      }
    }

    let newCant = prev.cantidad_num !== null ? Number(prev.cantidad_num) : null;
    if (cantidad_num !== undefined) {
      newCant = (cantidad_num === null || String(cantidad_num).trim() === '') ? null : Number(cantidad_num);
    }
    const newCantVerif = newCant !== null ? 1 : 0;
    const newEstadoCantidad = newCant !== null ? 'VERIFICADO' : 'PENDIENTE_VERIFICACION';

    let finalCampId = prev.campamento_id;
    let finalAlmId = prev.almacen_id;
    let finalEstadoVinc = prev.estado_vinculacion_sede;

    if (campamento_id !== undefined) {
      if (campamento_id === null || String(campamento_id).trim() === '') {
        finalCampId = null;
        finalAlmId = null;
        finalEstadoVinc = 'SIN_SEDE';
      } else {
        const parsedCampId = parsePositiveInt(campamento_id);
        if (!parsedCampId) {
          inTransaction = false;
          await safeRollback(conn);
          return res.status(400).json({ success: false, message: 'ID de campamento inválido.' });
        }
        if (!scope.isGlobal && !scope.campamentoIds.includes(parsedCampId)) {
          inTransaction = false;
          await safeRollback(conn);
          return res.status(403).json({
            success: false,
            message: 'Acceso denegado: No tiene autorización para trasladar o reasignar el artículo a otra sede o campamento.'
          });
        }
        const vinc = await resolveCampamentoVinculacion(conn, parsedCampId, null);
        if (vinc.campamento_invalido) {
          inTransaction = false;
          await safeRollback(conn);
          return res.status(400).json({
            success: false,
            message: 'El campamento seleccionado no existe o está inactivo.'
          });
        }
        finalCampId = vinc.campamento_id;
        finalAlmId = (prev.campamento_id !== null && Number(prev.campamento_id) === Number(vinc.campamento_id))
          ? (prev.almacen_id ?? vinc.almacen_id)
          : vinc.almacen_id;
        finalEstadoVinc = vinc.estado_vinculacion_sede;
      }
    } else if (ubicacion_nombre !== undefined) {
      const hasNewUbic = typeof ubicacion_nombre === 'string' && ubicacion_nombre.trim() !== '';
      if (hasNewUbic) {
        const vinc = await resolveCampamentoVinculacion(conn, null, ubicacion_nombre);
        if (vinc.estado_vinculacion_sede === 'CONFIRMADO') {
          if (!scope.isGlobal && !scope.campamentoIds.includes(vinc.campamento_id)) {
            inTransaction = false;
            await safeRollback(conn);
            return res.status(403).json({
              success: false,
              message: 'Acceso denegado: No tiene autorización para trasladar o reasignar el artículo a otra sede o campamento.'
            });
          }
          finalCampId = vinc.campamento_id;
          finalAlmId = (prev.campamento_id !== null && Number(prev.campamento_id) === Number(vinc.campamento_id))
            ? (prev.almacen_id ?? vinc.almacen_id)
            : vinc.almacen_id;
          finalEstadoVinc = 'CONFIRMADO';
        } else if (vinc.estado_vinculacion_sede === 'SEDE_AMBIGUA') {
          if (!scope.isGlobal) {
            inTransaction = false;
            await safeRollback(conn);
            return res.status(403).json({
              success: false,
              message: 'Acceso denegado: No tiene autorización para trasladar o reasignar el artículo a una sede ambigua.'
            });
          }
          finalCampId = null;
          finalAlmId = null;
          finalEstadoVinc = 'SEDE_AMBIGUA';
        }
      }
    }

    const schemaCaps = await getSchemaCapabilities(conn);
    const nextNombre = articulo_nombre !== undefined ? articulo_nombre.trim() : prev.articulo_nombre;
    const nextCategoria = categoria !== undefined ? (asNonEmptyString(categoria) || prev.categoria) : prev.categoria;
    const nextMarca = marca_modelo !== undefined ? (asNonEmptyString(marca_modelo)) : prev[schemaCaps.articulos.brandCol];
    const nextSpec = tipo_caracteristicas !== undefined ? (asNonEmptyString(tipo_caracteristicas)) : prev[schemaCaps.articulos.specCol];
    const nextProp = propietario !== undefined ? (asNonEmptyString(propietario) || prev.propietario) : prev.propietario;
    const nextAsignado = asignado_a !== undefined ? asNonEmptyString(asignado_a) : prev.asignado_a;
    const nextUnidad = unidad_medida !== undefined ? (asNonEmptyString(unidad_medida) || prev.unidad_medida) : prev.unidad_medida;
    const nextEstado = estado_fisico !== undefined ? normalizeEstadoFisico(estado_fisico) : prev.estado_fisico;
    const nextUbic = (ubicacion_nombre !== undefined && typeof ubicacion_nombre === 'string' && ubicacion_nombre.trim())
      ? ubicacion_nombre.trim()
      : prev.ubicacion_nombre;
    const nextZona = zona_estante !== undefined ? asNonEmptyString(zona_estante) : prev.zona_estante;
    const nextFechaRev = fecha_revision !== undefined ? (fecha_revision || null) : prev.fecha_revision;
    const nextObs = observaciones !== undefined ? asNonEmptyString(observaciones) : prev.observaciones;

    await conn.query(
      `UPDATE inv_articulos SET
        codigo_original = ?,
        articulo_nombre = ?,
        categoria = ?,
        ${schemaCaps.articulos.brandCol} = ?,
        ${schemaCaps.articulos.specCol} = ?,
        serie_imei = ?,
        propietario = ?,
        asignado_a = ?,
        cantidad_num = ?,
        cantidad_texto = ?,
        cantidad_verificada = ?,
        estado_cantidad = ?,
        unidad_medida = ?,
        estado_fisico = ?,
        ubicacion_nombre = ?,
        zona_estante = ?,
        fecha_revision = ?,
        observaciones = ?,
        campamento_id = ?,
        almacen_id = ?,
        estado_vinculacion_sede = ?
      WHERE id = ?`,
      [
        nextCodigoOriginal,
        nextNombre,
        nextCategoria,
        nextMarca,
        nextSpec,
        nextSerieImei,
        nextProp,
        nextAsignado,
        newCant,
        newCant !== null ? String(newCant) : null,
        newCantVerif,
        newEstadoCantidad,
        nextUnidad,
        nextEstado,
        nextUbic,
        nextZona,
        nextFechaRev,
        nextObs,
        finalCampId,
        finalAlmId,
        finalEstadoVinc,
        id
      ]
    );

    const movCant = newCant !== null ? newCant : 0;

    // If location changed, record movement TRASLADO
    if (nextUbic !== prev.ubicacion_nombre) {
      await conn.query(
        `INSERT INTO inv_movimientos (
          articulo_id, tipo_movimiento, cantidad, unidad_medida,
          ubicacion_origen, ubicacion_destino, estado_previo, estado_nuevo,
          motivo, usuario_id, es_sintetico
        ) VALUES (?, 'TRASLADO', ?, ?, ?, ?, ?, ?, 'Cambio de ubicación', ?, ?)`,
        [id, movCant, nextUnidad, prev.ubicacion_nombre, nextUbic, prev.estado_fisico, nextEstado, req.user.id, prev.es_sintetico || 0]
      );
    }

    // If assignee changed, record ASIGNACION
    if (asignado_a !== undefined && nextAsignado !== prev.asignado_a) {
      await conn.query(
        `INSERT INTO inv_movimientos (
          articulo_id, tipo_movimiento, cantidad, unidad_medida,
          custodio_origen, custodio_destino, motivo, usuario_id, es_sintetico
        ) VALUES (?, 'ASIGNACION', ?, ?, ?, ?, 'Reasignación de custodio', ?, ?)`,
        [id, movCant, nextUnidad, prev.asignado_a, nextAsignado, req.user.id, prev.es_sintetico || 0]
      );
    }

    // Audit inside transaction
    await logAudit(conn, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'EDICION_ARTICULO',
      entidad: 'inv_articulos',
      entidad_id: id,
      detalles_previos: prev,
      detalles_nuevos: req.body,
      req
    });

    await conn.commit();
    inTransaction = false;

    res.json({ success: true, message: 'Artículo actualizado exitosamente.' });
  } catch (error) {
    if (conn && inTransaction) {
      await safeRollback(conn);
    }
    console.error('Update articulo error:', error);
    const status = isDbUnavailableError(error, conn) ? 503 : 500;
    res.status(status).json({
      success: false,
      message: status === 503
        ? 'Base de datos temporalmente no disponible. Intente nuevamente.'
        : 'Error actualizando artículo.'
    });
  } finally {
    safeRelease(conn);
  }
});

// DELETE ITEM (Soft Delete - Exige permiso inv:eliminar)
router.delete('/articulos/:id', requireAuth, requirePermission('inv:eliminar'), async (req, res) => {
  const pool = getPool();
  let conn = null;
  let inTransaction = false;
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'ID de artículo inválido.' });
    }

    conn = await pool.getConnection();
    if (!conn) {
      return res.status(503).json({ success: false, message: 'Servicio de base de datos no disponible temporalmente.' });
    }
    await conn.beginTransaction();
    inTransaction = true;

    const [rows] = await conn.query('SELECT * FROM inv_articulos WHERE id = ? AND activo = 1 FOR UPDATE', [id]);
    if (rows.length === 0) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(404).json({ success: false, message: 'Artículo no encontrado.' });
    }

    // Verificar ámbito de campamento sin coincidencia parcial (.includes)
    const scope = await getUserAllowedCampamentos(conn, req.user);
    if (!canAccessArticle(scope, rows[0])) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: No puede eliminar artículos de otra sede o campamento.'
      });
    }

    await conn.query('UPDATE inv_articulos SET activo = 0 WHERE id = ?', [id]);

    await logAudit(conn, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'DESACTIVACION_ARTICULO',
      entidad: 'inv_articulos',
      entidad_id: id,
      detalles_previos: rows[0],
      req
    });

    await conn.commit();
    inTransaction = false;

    res.json({ success: true, message: 'Artículo desactivado exitosamente.' });
  } catch (error) {
    if (conn && inTransaction) {
      await safeRollback(conn);
    }
    console.error('Delete articulo error:', error);
    const status = isDbUnavailableError(error, conn) ? 503 : 500;
    res.status(status).json({
      success: false,
      message: status === 503
        ? 'Base de datos temporalmente no disponible. Intente nuevamente.'
        : 'Error eliminando artículo.'
    });
  } finally {
    safeRelease(conn);
  }
});

// ==========================================
// 4. MOVIMIENTOS TRANSACCIONALES
// ==========================================

router.get('/movimientos', requireAuth, requirePermission('inv:movimientos_ver'), async (req, res) => {
  try {
    const db = getPool();
    const scope = await getUserAllowedCampamentos(db, req.user);
    const limit = sanitizeLimit(req.query.limit, 100, 1000);
    const includeSynthetic = req.query.incluir_sinteticos === 'true';
    const { campamento_id, sin_sede, sinSede } = req.query;
    const campamentoParam = asNonEmptyString(campamento_id);
    const isSinSedeReq = campamentoParam === 'SIN_SEDE' || sin_sede === 'true' || sinSede === 'true';

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

    if (!scope.isGlobal) {
      if (isSinSedeReq) {
        return res.status(403).json({ success: false, message: 'Acceso denegado a movimientos sin sede verificada.' });
      }
      if (campamento_id !== undefined && campamento_id !== '' && campamentoParam !== 'TODOS') {
        const reqCid = parsePositiveInt(campamento_id);
        if (!reqCid || !scope.campamentoIds.includes(reqCid)) {
          return res.status(403).json({ success: false, message: 'Acceso denegado a la sede solicitada.' });
        }
        conds.push('a.campamento_id = ?');
        params.push(reqCid);
      } else {
        const scopeFilter = buildArticleScopeFilter(scope, 'a');
        conds.push(scopeFilter.sql);
        params.push(...scopeFilter.params);
      }
    } else if (isSinSedeReq) {
      conds.push('a.campamento_id IS NULL');
    } else if (campamento_id !== undefined && campamento_id !== '' && campamentoParam !== 'TODOS') {
      const reqCid = parsePositiveInt(campamento_id);
      if (!reqCid) {
        return res.status(400).json({ success: false, message: 'Parámetro campamento_id inválido.' });
      }
      conds.push('a.campamento_id = ?');
      params.push(reqCid);
    }

    // v2.2: filtro por fecha del movimiento (solo lectura)
    if (!applyDateRange(req, res, conds, params, 'm.fecha_movimiento')) return;

    if (conds.length > 0) {
      query += ` WHERE ${conds.join(' AND ')}`;
    }

    query += ' ORDER BY m.fecha_movimiento DESC LIMIT ?';
    params.push(limit);

    const [rows] = await db.query(query, params);
    res.json({ success: true, movimientos: rows });
  } catch (error) {
    console.error('List movimientos error:', error);
    const status = isDbUnavailableError(error) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error consultando movimientos.' });
  }
});

const TIPOS_MOVIMIENTO_VALIDOS = ['ENTRADA', 'SALIDA', 'TRASLADO', 'ASIGNACION', 'DEVOLUCION', 'AJUSTE'];

router.post('/movimientos', requireAuth, requirePermission('inv:movimientos_registrar'), async (req, res) => {
  const pool = getPool();
  let conn = null;
  let inTransaction = false;
  try {
    const {
      articulo_id,
      tipo_movimiento,
      cantidad = 1,
      ubicacion_destino,
      custodio_destino,
      estado_nuevo,
      motivo,
      observaciones,
      campamento_id: campamentoIdBody,
      campamento_destino_id: campamentoDestinoIdBody
    } = req.body || {};
    const campamentoDestinoId =
      campamentoDestinoIdBody !== undefined && campamentoDestinoIdBody !== null && String(campamentoDestinoIdBody).trim() !== ''
        ? campamentoDestinoIdBody
        : campamentoIdBody;

    if (!articulo_id || !tipo_movimiento || typeof motivo !== 'string' || !motivo.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Artículo, tipo de movimiento y motivo son obligatorios.'
      });
    }

    const artId = parsePositiveInt(articulo_id);
    if (!artId) {
      return res.status(400).json({ success: false, message: 'ID de artículo inválido.' });
    }

    if (!TIPOS_MOVIMIENTO_VALIDOS.includes(tipo_movimiento)) {
      return res.status(400).json({
        success: false,
        message: `Tipo de movimiento no válido. Valores permitidos: ${TIPOS_MOVIMIENTO_VALIDOS.join(', ')}.`
      });
    }

    if (ubicacion_destino !== undefined && ubicacion_destino !== null && typeof ubicacion_destino !== 'string') {
      return res.status(400).json({ success: false, message: 'Ubicación destino inválida.' });
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

    conn = await pool.getConnection();
    await conn.beginTransaction();
    inTransaction = true;

    const [artRows] = await conn.query('SELECT * FROM inv_articulos WHERE id = ? AND activo = 1 FOR UPDATE', [artId]);
    if (artRows.length === 0) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(404).json({ success: false, message: 'Artículo no encontrado.' });
    }
    const articulo = artRows[0];

    // Verificar ámbito de campamento origen y destino sin coincidencia parcial (.includes)
    const scope = await getUserAllowedCampamentos(conn, req.user);
    if (!canAccessArticle(scope, articulo)) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: El activo pertenece a otra sede o campamento no autorizado.'
      });
    }

    const hasDestUbic = typeof ubicacion_destino === 'string' && ubicacion_destino.trim() !== '';
    const hasDestCamp = campamentoDestinoId !== undefined && campamentoDestinoId !== null && String(campamentoDestinoId).trim() !== '';
    if (hasDestCamp && !parsePositiveInt(campamentoDestinoId)) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(400).json({ success: false, message: 'ID de campamento destino inválido.' });
    }

    if (tipo_movimiento === 'TRASLADO' && !hasDestUbic && !hasDestCamp) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(400).json({
        success: false,
        message: 'Para registrar un TRASLADO debe especificar un campamento o ubicación de destino.'
      });
    }

    if (!scope.isGlobal && (hasDestUbic || hasDestCamp)) {
      const sameAsArticleLocation = hasDestUbic && !hasDestCamp &&
        normalizeExactLocation(ubicacion_destino) === normalizeExactLocation(articulo.ubicacion_nombre);
      if (!sameAsArticleLocation && !canTargetCampamento(scope, campamentoDestinoId, ubicacion_destino)) {
        inTransaction = false;
        await safeRollback(conn);
        return res.status(403).json({
          success: false,
          message: 'Acceso denegado: No tiene autorización para mover artículos hacia una sede o campamento externo.'
        });
      }
    }

    const currentCant = articulo.cantidad_num !== null ? parseFloat(articulo.cantidad_num) : null;
    const isVerified = currentCant !== null && Number(articulo.cantidad_verificada) !== 0;

    if ((tipo_movimiento === 'SALIDA' || tipo_movimiento === 'TRASLADO' || tipo_movimiento === 'ASIGNACION') && !isVerified) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(409).json({
        success: false,
        message: 'Stock no verificado (cantidad pendiente o NULL). Registre primero una ENTRADA o AJUSTE físico antes de realizar SALIDA, TRASLADO o ASIGNACION.'
      });
    }

    let nuevaCantidad = currentCant;
    let nextCantidadVerificada = Number(articulo.cantidad_verificada) || 0;
    let nextEstadoCantidad = articulo.estado_cantidad || (isVerified ? 'VERIFICADO' : 'PENDIENTE_VERIFICACION');

    if (tipo_movimiento === 'SALIDA') {
      if (currentCant < cantMov) {
        inTransaction = false;
        await safeRollback(conn);
        return res.status(400).json({
          success: false,
          message: `Stock insuficiente (${currentCant} disponibles) para retirar ${cantMov}.`
        });
      }
      nuevaCantidad = Number((currentCant - cantMov).toFixed(2));
      if (nuevaCantidad < 0) {
        inTransaction = false;
        await safeRollback(conn);
        return res.status(400).json({
          success: false,
          message: 'La operación resultaría en un stock negativo.'
        });
      }
    } else if (tipo_movimiento === 'ENTRADA' || tipo_movimiento === 'DEVOLUCION') {
      nuevaCantidad = currentCant !== null
        ? Number(((currentCant || 0) + cantMov).toFixed(2))
        : Number(cantMov.toFixed(2));
      nextCantidadVerificada = 1;
      nextEstadoCantidad = 'VERIFICADO';
    } else if (tipo_movimiento === 'AJUSTE') {
      nuevaCantidad = Number(cantMov.toFixed(2));
      nextCantidadVerificada = 1;
      nextEstadoCantidad = 'VERIFICADO';
    } else if (tipo_movimiento === 'TRASLADO' || tipo_movimiento === 'ASIGNACION') {
      if (currentCant < cantMov) {
        inTransaction = false;
        await safeRollback(conn);
        return res.status(400).json({
          success: false,
          message: `No se puede transferir/asignar más del stock disponible (${currentCant} disponibles).`
        });
      }
    }

    // Resolver vinculación territorial destino para TRASLADO o si se especifica destino explícito
    let nextCampamentoId = articulo.campamento_id ?? null;
    let nextAlmacenId = articulo.almacen_id ?? null;
    let nextEstadoVinc = articulo.estado_vinculacion_sede || (nextCampamentoId ? 'CONFIRMADO' : 'SIN_SEDE');
    let nextUbicacionNombre = hasDestUbic ? ubicacion_destino.trim() : articulo.ubicacion_nombre;

    if (tipo_movimiento === 'TRASLADO' || hasDestCamp || (hasDestUbic && normalizeExactLocation(ubicacion_destino) !== normalizeExactLocation(articulo.ubicacion_nombre))) {
      const destVinc = await resolveCampamentoVinculacion(
        conn,
        hasDestCamp ? parsePositiveInt(campamentoDestinoId) : null,
        hasDestUbic ? ubicacion_destino.trim() : null
      );
      if (destVinc.campamento_invalido) {
        inTransaction = false;
        await safeRollback(conn);
        return res.status(400).json({
          success: false,
          message: 'El campamento de destino seleccionado no existe o está inactivo.'
        });
      }

      if (!hasDestUbic && destVinc.campamento_id) {
        const [destCampRows] = await conn.query('SELECT nombre FROM inv_campamentos WHERE id = ? LIMIT 1', [destVinc.campamento_id]);
        if (destCampRows.length > 0 && destCampRows[0].nombre) {
          nextUbicacionNombre = destCampRows[0].nombre;
        }
      }

      if (!scope.isGlobal && !canTargetCampamento(scope, destVinc.campamento_id, nextUbicacionNombre)) {
        inTransaction = false;
        await safeRollback(conn);
        return res.status(403).json({
          success: false,
          message: 'Acceso denegado: No tiene autorización para trasladar activos a esa sede.'
        });
      }

      if (tipo_movimiento === 'TRASLADO' || destVinc.estado_vinculacion_sede === 'CONFIRMADO') {
        nextCampamentoId = destVinc.campamento_id;
        nextAlmacenId = (articulo.campamento_id !== null && Number(articulo.campamento_id) === Number(destVinc.campamento_id))
          ? (articulo.almacen_id ?? destVinc.almacen_id)
          : destVinc.almacen_id;
        nextEstadoVinc = destVinc.estado_vinculacion_sede;
      } else if (destVinc.estado_vinculacion_sede === 'SEDE_AMBIGUA') {
        if (!scope.isGlobal) {
          inTransaction = false;
          await safeRollback(conn);
          return res.status(403).json({
            success: false,
            message: 'Acceso denegado: La ubicación destino es ambigua.'
          });
        }
        nextCampamentoId = null;
        nextAlmacenId = null;
        nextEstadoVinc = 'SEDE_AMBIGUA';
      }
    }

    const nextCustodio = (typeof custodio_destino === 'string' && custodio_destino.trim() !== '')
      ? custodio_destino.trim()
      : articulo.asignado_a;
    const nextEstadoFisico = estadoNuevoNormalizado || articulo.estado_fisico;
    const artEsSintetico = Number(articulo.es_sintetico) === 1 ? 1 : 0;

    // Update item
    await conn.query(`
      UPDATE inv_articulos SET
        cantidad_num = ?,
        cantidad_texto = ?,
        cantidad_verificada = ?,
        estado_cantidad = ?,
        ubicacion_nombre = ?,
        campamento_id = ?,
        almacen_id = ?,
        estado_vinculacion_sede = ?,
        asignado_a = ?,
        estado_fisico = ?
      WHERE id = ?
    `, [
      nuevaCantidad,
      nuevaCantidad !== null ? String(nuevaCantidad) : articulo.cantidad_texto,
      nextCantidadVerificada,
      nextEstadoCantidad,
      nextUbicacionNombre,
      nextCampamentoId,
      nextAlmacenId,
      nextEstadoVinc,
      nextCustodio,
      nextEstadoFisico,
      artId
    ]);

    // Insert movement (propagando es_sintetico desde inv_articulos)
    const [movInsertRes] = await conn.query(`
      INSERT INTO inv_movimientos (
        articulo_id, tipo_movimiento, cantidad, unidad_medida,
        ubicacion_origen, ubicacion_destino, custodio_origen, custodio_destino,
        estado_previo, estado_nuevo, motivo, observaciones, usuario_id, es_sintetico
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      artId,
      tipo_movimiento,
      cantMov,
      articulo.unidad_medida,
      articulo.ubicacion_nombre,
      nextUbicacionNombre,
      articulo.asignado_a,
      nextCustodio,
      articulo.estado_fisico,
      nextEstadoFisico,
      motivo.trim(),
      observaciones || null,
      req.user.id,
      artEsSintetico
    ]);

    // Atomic Audit Log inside transaction
    await logAudit(conn, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: `MOVIMIENTO_${tipo_movimiento}`,
      entidad: 'inv_movimientos',
      entidad_id: artId,
      detalles_previos: {
        cantidad_num: articulo.cantidad_num,
        cantidad_verificada: articulo.cantidad_verificada,
        ubicacion: articulo.ubicacion_nombre,
        campamento_id: articulo.campamento_id,
        almacen_id: articulo.almacen_id,
        custodio: articulo.asignado_a,
        estado: articulo.estado_fisico
      },
      detalles_nuevos: {
        tipo_movimiento,
        cantidad: cantMov,
        nueva_cantidad: nuevaCantidad,
        cantidad_verificada: nextCantidadVerificada,
        ubicacion_destino: nextUbicacionNombre,
        campamento_id_destino: nextCampamentoId,
        almacen_id_destino: nextAlmacenId,
        custodio_destino: nextCustodio,
        estado_nuevo: nextEstadoFisico,
        motivo: motivo.trim()
      },
      req
    });

    await conn.commit();
    inTransaction = false;

    res.json({
      success: true,
      message: `Movimiento de ${tipo_movimiento} registrado con éxito.`,
      movimiento_id: movInsertRes.insertId,
      nuevaCantidad,
      campamento_id: nextCampamentoId,
      almacen_id: nextAlmacenId,
      estado_vinculacion_sede: nextEstadoVinc
    });
  } catch (error) {
    if (conn && inTransaction) {
      await safeRollback(conn);
    }
    console.error('Movement error:', error);
    const status = isDbUnavailableError(error, conn) ? 503 : 500;
    res.status(status).json({
      success: false,
      message: status === 503
        ? 'Base de datos temporalmente no disponible. Intente nuevamente.'
        : 'Error procesando movimiento transaccional.'
    });
  } finally {
    safeRelease(conn);
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
    const { area, estado } = req.query;

    const campFilter = await resolveRequestedCampamentoFilter(db, scope, req.query);
    if (campFilter.errorStatus) {
      return res.status(campFilter.errorStatus).json({ success: false, message: campFilter.errorMessage });
    }
    const { isSinSedeReq, selectedCid } = campFilter;

    let whereArt = 'WHERE a.activo = 1';
    if (!includeSynthetic) {
      whereArt += ' AND a.es_sintetico = 0';
    }
    const paramsArt = [];

    if (!scope.isGlobal) {
      if (selectedCid !== null) {
        whereArt += ' AND a.campamento_id = ?';
        paramsArt.push(selectedCid);
      } else {
        const scopeFilter = buildArticleScopeFilter(scope, 'a');
        whereArt += ` AND ${scopeFilter.sql}`;
        paramsArt.push(...scopeFilter.params);
      }
    } else if (isSinSedeReq) {
      whereArt += ' AND a.campamento_id IS NULL';
    } else if (selectedCid !== null) {
      whereArt += ' AND a.campamento_id = ?';
      paramsArt.push(selectedCid);
    }

    const areaParam = asNonEmptyString(area);
    if (areaParam && areaParam.toUpperCase() !== 'TODOS') {
      whereArt += ' AND a.area = ?';
      paramsArt.push(areaParam.toUpperCase());
    }

    const estadoParam = asNonEmptyString(estado);
    if (estadoParam && estadoParam.toUpperCase() !== 'TODOS') {
      const normEstado = normalizeEstadoParam(estadoParam);
      if (normEstado) {
        whereArt += ' AND a.estado_fisico = ?';
        paramsArt.push(normEstado);
      }
    }

    // v2.2: período = artículos registrados en el rango (fecha_creacion/creado_en); sin parámetros no cambia nada
    const capsFecha = await getSchemaCapabilities(db);
    if (capsFecha.articulos.createdCol !== 'id') {
      const dateConds = [];
      if (!applyDateRange(req, res, dateConds, paramsArt, `a.${capsFecha.articulos.createdCol}`)) return;
      whereArt += dateConds.map((c) => ` AND ${c}`).join('');
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
    const schemaCaps = await getSchemaCapabilities(db);
    const scope = await getUserAllowedCampamentos(db, req.user);
    const { area, categoria, estado, ubicacion, search, sinSerial, sinCantidad, sortBy = 'id', sortOrder = 'ASC', incluir_sinteticos } = req.query;
    const includeSynthetic = incluir_sinteticos === 'true';

    const campFilter = await resolveRequestedCampamentoFilter(db, scope, req.query);
    if (campFilter.errorStatus) {
      return res.status(campFilter.errorStatus).json({ success: false, message: campFilter.errorMessage });
    }
    const { isSinSedeReq, selectedCid } = campFilter;

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
      if (selectedCid !== null) {
        query += ' AND a.campamento_id = ?';
        params.push(selectedCid);
      } else {
        const scopeFilter = buildArticleScopeFilter(scope, 'a');
        query += ` AND ${scopeFilter.sql}`;
        params.push(...scopeFilter.params);
      }
    } else if (isSinSedeReq) {
      query += ' AND a.campamento_id IS NULL';
    } else if (selectedCid !== null) {
      query += ' AND a.campamento_id = ?';
      params.push(selectedCid);
    }

    const areaParam = asNonEmptyString(area);
    if (areaParam && areaParam.toUpperCase() !== 'TODOS') {
      query += ' AND a.area = ?';
      params.push(areaParam.toUpperCase());
    }
    const categoriaParam = asNonEmptyString(categoria);
    if (categoriaParam && categoriaParam.toUpperCase() !== 'TODAS') {
      query += ' AND a.categoria = ?';
      params.push(categoriaParam);
    }
    const ubicacionParam = asNonEmptyString(ubicacion);
    if (ubicacionParam && ubicacionParam.toUpperCase() !== 'TODAS') {
      query += ' AND a.ubicacion_nombre = ?';
      params.push(ubicacionParam);
    }
    const estadoParam = asNonEmptyString(estado);
    if (estadoParam && estadoParam.toUpperCase() !== 'TODOS') {
      const normEstado = normalizeEstadoParam(estadoParam);
      if (normEstado) {
        query += ' AND a.estado_fisico = ?';
        params.push(normEstado);
      }
    }
    if (sinSerial === 'true') {
      query += ` AND ${buildSqlSinSerialCondition('a.serie_imei')}`;
    }
    if (sinCantidad === 'true') {
      query += ' AND (a.cantidad_num IS NULL OR a.cantidad_verificada = 0)';
    }
    const searchParam = asNonEmptyString(search);
    if (searchParam) {
      const q = `%${searchParam}%`;
      query += ` AND (
        a.codigo_original LIKE ? OR
        a.articulo_nombre LIKE ? OR
        a.${schemaCaps.articulos.brandCol} LIKE ? OR
        a.serie_imei LIKE ? OR
        a.asignado_a LIKE ? OR
        a.ubicacion_nombre LIKE ? OR
        a.categoria LIKE ? OR
        a.observaciones LIKE ?
      )`;
      params.push(q, q, q, q, q, q, q, q);
    }

    // v2.2: misma regla de fecha de registro que GET /articulos (exportación coherente con lo filtrado)
    if (schemaCaps.articulos.createdCol !== 'id') {
      const dateConds = [];
      if (!applyDateRange(req, res, dateConds, params, `a.${schemaCaps.articulos.createdCol}`)) return;
      query += dateConds.map((c) => ` AND ${c}`).join('');
    }

    const exportSortMap = {
      id: 'a.id',
      codigo_original: 'a.codigo_original',
      articulo_nombre: 'a.articulo_nombre',
      categoria: 'a.categoria',
      area: 'a.area',
      estado_fisico: 'a.estado_fisico',
      ubicacion_nombre: 'a.ubicacion_nombre',
      cantidad_num: 'a.cantidad_num',
      asignado_a: 'a.asignado_a',
      campamento_id: 'a.campamento_id'
    };
    const safeExportSort = (typeof sortBy === 'string' && Object.hasOwn(exportSortMap, sortBy))
      ? exportSortMap[sortBy]
      : 'a.id';
    const safeExportOrder = typeof sortOrder === 'string' && sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    query += ` ORDER BY ${safeExportSort} ${safeExportOrder}`;

    const [rows] = await db.query(query, params);
    const sanitizedRows = rows.map(sanitizeListArticleRow);
    const totalUnidadesFisicas = sanitizedRows.reduce((acc, r) => acc + (r.cantidad_num !== null ? parseFloat(r.cantidad_num) : 0), 0);
    const articulosSinCantidad = sanitizedRows.filter(r => r.cantidad_num === null || r.cantidad_verificada === 0).length;

    res.json({
      success: true,
      count: sanitizedRows.length,
      resumen: {
        totalRegistros: sanitizedRows.length,
        totalUnidadesFisicas,
        articulosSinCantidad
      },
      data: sanitizedRows
    });
  } catch (error) {
    console.error('Reporte exportar error:', error);
    res.status(500).json({ success: false, message: 'Error exportando inventario.' });
  }
});

// ==========================================
// 6. AUDITORIA
// ==========================================

function requireAuditoriaAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'No autenticado.' });
  }
  if (req.user.rol === 'developer' || req.user.es_developer === 1) {
    return next();
  }
  const perms = Array.isArray(req.user.permisos) ? req.user.permisos : [];
  if (perms.includes('*') || perms.includes('aud:ver')) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: 'Acceso denegado: No dispone de autorización para consultar la bitácora de auditoría.'
  });
}

router.get('/auditoria', requireAuth, requireAuditoriaAccess, async (req, res) => {
  try {
    const db = getPool();
    const scope = await getUserAllowedCampamentos(db, req.user);
    const limit = sanitizeLimit(req.query.limit, 100, 1000);

    // v2.2: filtro por fecha del evento (inv_auditoria.fecha); sin parámetros no cambia nada
    const fechaConds = [];
    const fechaParams = [];
    if (!applyDateRange(req, res, fechaConds, fechaParams, 'aud.fecha')) return;
    const fechaSql = fechaConds.length ? ` AND ${fechaConds.join(' AND ')}` : '';

    if (scope.isGlobal) {
      const [rows] = await db.query(
        `SELECT aud.* FROM inv_auditoria aud WHERE 1 = 1${fechaSql} ORDER BY aud.fecha DESC LIMIT ?`,
        [...fechaParams, limit]
      );
      return res.json({ success: true, logs: normalizeAuditLogRows(rows) });
    }

    if (scope.campamentoIds.length === 0) {
      return res.json({ success: true, logs: [] });
    }

    const artScope = buildArticleScopeFilter(scope, 'a');
    const [rows] = await db.query(
      `SELECT aud.*
       FROM inv_auditoria aud
       WHERE (
         (aud.entidad IN ('inv_articulos', 'inv_movimientos') AND EXISTS (
           SELECT 1 FROM inv_articulos a WHERE a.id = aud.entidad_id AND ${artScope.sql}
         ))
         OR (aud.entidad = 'inv_levantamientos' AND EXISTS (
           SELECT 1 FROM inv_levantamientos l WHERE l.id = aud.entidad_id AND l.campamento_id IN (?)
         ))
         OR (aud.entidad = 'inv_levantamiento_items' AND EXISTS (
           SELECT 1 FROM inv_levantamiento_items li
           JOIN inv_levantamientos l ON li.levantamiento_id = l.id
           WHERE li.id = aud.entidad_id AND l.campamento_id IN (?)
         ))
         OR (aud.entidad = 'inv_campamentos' AND aud.entidad_id IN (?))
       )${fechaSql}
       ORDER BY aud.fecha DESC
       LIMIT ?`,
      [...artScope.params, scope.campamentoIds, scope.campamentoIds, scope.campamentoIds, ...fechaParams, limit]
    );
    res.json({ success: true, logs: normalizeAuditLogRows(rows) });
  } catch (error) {
    console.error('List auditoria error:', error);
    const status = isDbUnavailableError(error) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error consultando bitácora de auditoría.' });
  }
});

// ==========================================
// 7. GESTIÓN EXCLUSIVA DE USUARIOS (SOLO DEVELOPER)
// ==========================================

router.get('/usuarios/permisos-catalogo', requireAuth, requireDeveloper, (req, res) => {
  res.json({
    success: true,
    roles: VALID_OPERATIONAL_ROLES,
    permisos: KNOWN_PERMISSION_KEYS
  });
});

router.get('/usuarios', requireAuth, requireDeveloper, async (req, res) => {
  try {
    const db = getPool();
    const [rows] = await db.query(`
      SELECT u.id, u.nombre, u.email, u.rol, u.cargo, u.area, u.activo,
             u.es_developer, u.campamento_id, u.almacen_id, u.permisos_json,
             u.ultimo_acceso, COALESCE(u.fecha_creacion, NOW()) as creado_en
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
    } catch (almErr) {
      if (almErr?.code !== 'ER_NO_SUCH_TABLE') {
        console.warn('[USUARIOS] Error consultando inv_usuario_almacenes:', almErr?.message || almErr);
      }
      almsRows = [];
    }

    const result = rows.map(u => {
      const perms = parsePermisosJson(u.permisos_json, u.rol, u.es_developer);

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
    const status = isDbUnavailableError(error) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error consultando usuarios.' });
  }
});

router.post('/usuarios', requireAuth, requireDeveloper, async (req, res) => {
  let conn = null;
  try {
    const db = getPool();
    const body = req.body || {};
    const {
      nombre,
      email,
      password,
      rol = 'almacen',
      cargo,
      area,
      almacenes,
      permisos = []
    } = body;

    if (
      typeof nombre !== 'string' || !nombre.trim() ||
      typeof email !== 'string' || !email.trim() ||
      typeof password !== 'string' || !password
    ) {
      return res.status(400).json({ success: false, message: 'Nombre, email y contraseña son obligatorios.' });
    }

    if (!isValidEmailFormat(email)) {
      return res.status(400).json({ success: false, message: 'El formato del correo electrónico no es válido.' });
    }

    const pwdCheck = validateStrongPassword(password);
    if (!pwdCheck.valid) {
      return res.status(400).json({ success: false, message: pwdCheck.message });
    }

    // Regla de Seguridad Absoluta: Solo puede existir un único developer principal
    if (rol === 'developer' || isTruthyFlag(body.es_developer)) {
      return res.status(403).json({
        success: false,
        message: 'Política de seguridad estricta: No se permite crear cuentas adicionales con rol developer.'
      });
    }

    if (typeof rol !== 'string' || !VALID_OPERATIONAL_ROLES.includes(rol)) {
      return res.status(400).json({
        success: false,
        message: `Rol inválido. Los roles operativos permitidos son: ${VALID_OPERATIONAL_ROLES.join(', ')}.`
      });
    }

    const permValidation = validateAndSanitizePermissions(permisos, false);
    if (permValidation.errorStatus) {
      return res.status(permValidation.errorStatus).json({
        success: false,
        message: permValidation.errorMessage
      });
    }

    if (almacenes !== undefined && almacenes !== null && !Array.isArray(almacenes)) {
      return res.status(400).json({ success: false, message: 'El campo almacenes debe ser un arreglo de IDs válidos.' });
    }

    const parsedAlmacenes = [];
    if (Array.isArray(almacenes)) {
      const seenAlm = new Set();
      for (const rawAid of almacenes) {
        const aid = parsePositiveInt(rawAid);
        if (!aid) {
          return res.status(400).json({ success: false, message: 'Todos los almacenes seleccionados deben tener un ID válido.' });
        }
        if (!seenAlm.has(aid)) {
          seenAlm.add(aid);
          parsedAlmacenes.push(aid);
        }
      }
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanArea = asNonEmptyString(area);
    const cleanCargo = asNonEmptyString(cargo);

    conn = await db.getConnection();
    if (!conn) {
      return res.status(503).json({ success: false, message: 'Servicio de base de datos no disponible temporalmente.' });
    }
    await conn.beginTransaction();

    const [existing] = await conn.query('SELECT id FROM inv_usuarios WHERE LOWER(email) = ? FOR UPDATE', [cleanEmail]);
    if (existing.length > 0) {
      await safeRollback(conn);
      return res.status(409).json({ success: false, message: 'El correo electrónico ya se encuentra registrado.' });
    }

    const campSelection = await parseUserCampamentoSelection(conn, body);
    if (campSelection.errorStatus) {
      await safeRollback(conn);
      return res.status(campSelection.errorStatus).json({
        success: false,
        message: campSelection.errorMessage
      });
    }

    if (parsedAlmacenes.length > 0) {
      const [validAlmRows] = await conn.query(
        'SELECT id FROM inv_almacenes WHERE id IN (?) AND activo = 1',
        [parsedAlmacenes]
      );
      const validAlmSet = new Set(validAlmRows.map(r => Number(r.id)));
      const invalidAlms = parsedAlmacenes.filter(aid => !validAlmSet.has(aid));
      if (invalidAlms.length > 0) {
        await safeRollback(conn);
        return res.status(400).json({
          success: false,
          message: `Uno o más almacenes seleccionados no existen o están inactivos (IDs: ${invalidAlms.join(', ')}).`
        });
      }
    }

    const hash = await hashPassword(password);
    const sanitizedPerms = permValidation.permisos;
    const permisosStr = JSON.stringify(sanitizedPerms);

    const [result] = await conn.query(
      `INSERT INTO inv_usuarios (
        nombre, email, password_hash, rol, cargo, area, activo,
        es_developer, campamento_id, permisos_json
      ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
      [nombre.trim(), cleanEmail, hash, rol, cleanCargo, cleanArea, campSelection.principalCampId, permisosStr]
    );

    const newUserId = result.insertId;

    for (const cid of campSelection.campamentoIds) {
      const isPrincipal = cid === campSelection.principalCampId ? 1 : 0;
      await conn.query(
        'INSERT IGNORE INTO inv_usuario_campamentos (usuario_id, campamento_id, es_principal) VALUES (?, ?, ?)',
        [newUserId, cid, isPrincipal]
      );
    }

    for (const aid of parsedAlmacenes) {
      await conn.query(
        'INSERT IGNORE INTO inv_usuario_almacenes (usuario_id, almacen_id) VALUES (?, ?)',
        [newUserId, aid]
      );
    }

    await logAudit(conn, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'CREACION_USUARIO',
      entidad: 'inv_usuarios',
      entidad_id: newUserId,
      detalles_nuevos: {
        nombre: nombre.trim(),
        email: cleanEmail,
        rol,
        cargo: cleanCargo,
        area: cleanArea,
        campamento_id: campSelection.principalCampId,
        campamentos: campSelection.campamentoIds,
        permisos: sanitizedPerms
      },
      req
    });

    await conn.commit();

    res.status(201).json({
      success: true,
      message: 'Usuario creado exitosamente con permisos y sedes asignadas.',
      id: newUserId
    });
  } catch (error) {
    await safeRollback(conn);
    console.error('Create usuario error:', error);
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'El correo electrónico ya se encuentra registrado.' });
    }
    const status = isDbUnavailableError(error, conn) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error creando usuario.' });
  } finally {
    safeRelease(conn);
  }
});

router.put('/usuarios/:id', requireAuth, requireDeveloper, async (req, res) => {
  let conn = null;
  try {
    const db = getPool();
    const targetId = parsePositiveInt(req.params.id);
    if (!targetId) {
      return res.status(400).json({ success: false, message: 'ID de usuario inválido.' });
    }
    const body = req.body || {};
    const {
      nombre,
      email,
      cargo,
      area,
      rol,
      almacenes,
      permisos,
      activo
    } = body;

    if (nombre !== undefined && (typeof nombre !== 'string' || !nombre.trim())) {
      return res.status(400).json({ success: false, message: 'El nombre del usuario no puede estar vacío.' });
    }

    if (email !== undefined && !isValidEmailFormat(email)) {
      return res.status(400).json({ success: false, message: 'El formato del correo electrónico no es válido.' });
    }

    if (almacenes !== undefined && almacenes !== null && !Array.isArray(almacenes)) {
      return res.status(400).json({ success: false, message: 'El campo almacenes debe ser un arreglo de IDs válidos.' });
    }

    const parsedAlmacenes = [];
    if (Array.isArray(almacenes)) {
      const seenAlm = new Set();
      for (const rawAid of almacenes) {
        const aid = parsePositiveInt(rawAid);
        if (!aid) {
          return res.status(400).json({ success: false, message: 'Todos los almacenes seleccionados deben tener un ID válido.' });
        }
        if (!seenAlm.has(aid)) {
          seenAlm.add(aid);
          parsedAlmacenes.push(aid);
        }
      }
    }

    conn = await db.getConnection();
    if (!conn) {
      return res.status(503).json({ success: false, message: 'Servicio de base de datos no disponible temporalmente.' });
    }
    await conn.beginTransaction();

    const [prevRows] = await conn.query('SELECT * FROM inv_usuarios WHERE id = ? FOR UPDATE', [targetId]);
    if (prevRows.length === 0) {
      await safeRollback(conn);
      return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    }
    const targetUser = prevRows[0];
    const isTargetDeveloper = targetUser.es_developer === 1 || targetUser.rol === 'developer';

    // Protección de la cuenta developer principal
    if (isTargetDeveloper) {
      if (rol !== undefined && rol !== 'developer') {
        await safeRollback(conn);
        return res.status(403).json({ success: false, message: 'No se puede revocar el rol de la cuenta Desarrollador Principal.' });
      }
      if (activo !== undefined && !isTruthyFlag(activo)) {
        await safeRollback(conn);
        return res.status(403).json({ success: false, message: 'No se puede desactivar la cuenta del Desarrollador Principal.' });
      }
    } else {
      // Evitar que otro usuario sea elevado a developer
      if (rol === 'developer' || (body.es_developer !== undefined && isTruthyFlag(body.es_developer))) {
        await safeRollback(conn);
        return res.status(403).json({ success: false, message: 'Política de seguridad: Solo puede existir un único Desarrollador Principal.' });
      }
      if (rol !== undefined && (typeof rol !== 'string' || !VALID_OPERATIONAL_ROLES.includes(rol))) {
        await safeRollback(conn);
        return res.status(400).json({
          success: false,
          message: `Rol inválido. Los roles operativos permitidos son: ${VALID_OPERATIONAL_ROLES.join(', ')}.`
        });
      }
    }

    let cleanEmail = targetUser.email;
    if (email !== undefined) {
      cleanEmail = email.toLowerCase().trim();
      const [dupRows] = await conn.query(
        'SELECT id FROM inv_usuarios WHERE LOWER(email) = ? AND id <> ? FOR UPDATE',
        [cleanEmail, targetId]
      );
      if (dupRows.length > 0) {
        await safeRollback(conn);
        return res.status(409).json({ success: false, message: 'El correo electrónico ya está asignado a otro usuario.' });
      }
    }

    const prevPermisos = parsePermisosJson(targetUser.permisos_json, targetUser.rol, targetUser.es_developer);
    const prevPermisosStr = JSON.stringify(prevPermisos);
    let nextPerms = prevPermisos;
    let nextPermisosStr = prevPermisosStr;

    if (permisos !== undefined) {
      const permValidation = validateAndSanitizePermissions(permisos, isTargetDeveloper);
      if (permValidation.errorStatus) {
        await safeRollback(conn);
        return res.status(permValidation.errorStatus).json({
          success: false,
          message: permValidation.errorMessage
        });
      }
      if (isTargetDeveloper && !permValidation.permisos.includes('*')) {
        await safeRollback(conn);
        return res.status(403).json({
          success: false,
          message: 'No se puede revocar el acceso comodín (*) de la cuenta Desarrollador Principal.'
        });
      }
      nextPerms = permValidation.permisos;
      nextPermisosStr = JSON.stringify(nextPerms);
    }

    const campSelection = await parseUserCampamentoSelection(conn, body);
    if (campSelection.errorStatus) {
      await safeRollback(conn);
      return res.status(campSelection.errorStatus).json({
        success: false,
        message: campSelection.errorMessage
      });
    }

    if (parsedAlmacenes.length > 0) {
      const [validAlmRows] = await conn.query(
        'SELECT id FROM inv_almacenes WHERE id IN (?) AND activo = 1',
        [parsedAlmacenes]
      );
      const validAlmSet = new Set(validAlmRows.map(r => Number(r.id)));
      const invalidAlms = parsedAlmacenes.filter(aid => !validAlmSet.has(aid));
      if (invalidAlms.length > 0) {
        await safeRollback(conn);
        return res.status(400).json({
          success: false,
          message: `Uno o más almacenes seleccionados no existen o están inactivos (IDs: ${invalidAlms.join(', ')}).`
        });
      }
    }

    const nextNombre = nombre !== undefined ? nombre.trim() : targetUser.nombre;
    const nextCargo = cargo !== undefined ? asNonEmptyString(cargo) : targetUser.cargo;
    const nextArea = area !== undefined ? asNonEmptyString(area) : targetUser.area;
    const nextRol = rol !== undefined ? rol : targetUser.rol;
    const nextCampamentoId = campSelection.hasSelection ? campSelection.principalCampId : targetUser.campamento_id;
    const nextActivo = activo !== undefined ? (isTruthyFlag(activo) ? 1 : 0) : Number(targetUser.activo);

    const [prevCampRows] = await conn.query(
      'SELECT campamento_id FROM inv_usuario_campamentos WHERE usuario_id = ? ORDER BY campamento_id ASC',
      [targetId]
    );
    const prevCampIds = prevCampRows.map(r => Number(r.campamento_id)).filter(n => n > 0);

    await conn.query(`
      UPDATE inv_usuarios SET
        nombre = ?,
        email = ?,
        cargo = ?,
        area = ?,
        rol = ?,
        campamento_id = ?,
        permisos_json = ?,
        activo = ?
      WHERE id = ?
    `, [
      nextNombre,
      cleanEmail,
      nextCargo,
      nextArea,
      nextRol,
      nextCampamentoId,
      nextPermisosStr,
      nextActivo,
      targetId
    ]);

    let campsChanged = false;
    if (campSelection.hasSelection) {
      await conn.query('DELETE FROM inv_usuario_campamentos WHERE usuario_id = ?', [targetId]);
      for (const cid of campSelection.campamentoIds) {
        const isPrincipal = cid === campSelection.principalCampId ? 1 : 0;
        await conn.query(
          'INSERT IGNORE INTO inv_usuario_campamentos (usuario_id, campamento_id, es_principal) VALUES (?, ?, ?)',
          [targetId, cid, isPrincipal]
        );
      }
      const nextSorted = [...campSelection.campamentoIds].sort((a, b) => a - b);
      campsChanged =
        prevCampIds.length !== nextSorted.length ||
        prevCampIds.some((cid, idx) => cid !== nextSorted[idx]) ||
        Number(nextCampamentoId || 0) !== Number(targetUser.campamento_id || 0);
    }

    if (Array.isArray(almacenes)) {
      await conn.query('DELETE FROM inv_usuario_almacenes WHERE usuario_id = ?', [targetId]);
      for (const aid of parsedAlmacenes) {
        await conn.query(
          'INSERT IGNORE INTO inv_usuario_almacenes (usuario_id, almacen_id) VALUES (?, ?)',
          [targetId, aid]
        );
      }
    }

    const roleChanged = nextRol !== targetUser.rol;
    const areaChanged = (nextArea || null) !== (targetUser.area || null);
    const activoChanged = Number(nextActivo) !== Number(targetUser.activo);
    const permsChanged = permisos !== undefined && nextPermisosStr !== prevPermisosStr;

    if (roleChanged || areaChanged || activoChanged || permsChanged || campsChanged) {
      await bumpUserTokenVersion(conn, targetId);
    }

    await logAudit(conn, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'MODIFICACION_USUARIO',
      entidad: 'inv_usuarios',
      entidad_id: targetId,
      detalles_previos: {
        nombre: targetUser.nombre,
        email: targetUser.email,
        rol: targetUser.rol,
        area: targetUser.area,
        campamento_id: targetUser.campamento_id,
        activo: targetUser.activo,
        permisos: prevPermisos
      },
      detalles_nuevos: {
        nombre: nextNombre,
        email: cleanEmail,
        rol: nextRol,
        area: nextArea,
        campamento_id: nextCampamentoId,
        campamentos: campSelection.hasSelection ? campSelection.campamentoIds : prevCampIds,
        activo: nextActivo,
        permisos_actualizados: permisos !== undefined,
        permisos: nextPerms
      },
      req
    });

    await conn.commit();

    res.json({ success: true, message: 'Usuario actualizado exitosamente.' });
  } catch (error) {
    await safeRollback(conn);
    console.error('Update usuario error:', error);
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'El correo electrónico ya está asignado a otro usuario.' });
    }
    const status = isDbUnavailableError(error, conn) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error actualizando usuario.' });
  } finally {
    safeRelease(conn);
  }
});

router.patch('/usuarios/:id/estado', requireAuth, requireDeveloper, async (req, res) => {
  let conn = null;
  try {
    const db = getPool();
    const targetId = parsePositiveInt(req.params.id);
    if (!targetId) {
      return res.status(400).json({ success: false, message: 'ID de usuario inválido.' });
    }
    const { activo } = req.body || {};
    if (activo === undefined || activo === null) {
      return res.status(400).json({ success: false, message: 'Debe indicar el nuevo estado (activo).' });
    }

    conn = await db.getConnection();
    if (!conn) {
      return res.status(503).json({ success: false, message: 'Servicio de base de datos no disponible temporalmente.' });
    }
    await conn.beginTransaction();

    const [prevRows] = await conn.query('SELECT id, nombre, rol, es_developer, activo FROM inv_usuarios WHERE id = ? FOR UPDATE', [targetId]);
    if (prevRows.length === 0) {
      await safeRollback(conn);
      return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    }
    const targetUser = prevRows[0];

    if (targetUser.es_developer === 1 || targetUser.rol === 'developer') {
      await safeRollback(conn);
      return res.status(403).json({ success: false, message: 'No se puede desactivar la cuenta del Desarrollador Principal.' });
    }

    const nuevoActivo = isTruthyFlag(activo) ? 1 : 0;
    await conn.query('UPDATE inv_usuarios SET activo = ? WHERE id = ?', [nuevoActivo, targetId]);
    if (nuevoActivo === 0 || nuevoActivo !== Number(targetUser.activo)) {
      await bumpUserTokenVersion(conn, targetId);
    }

    await logAudit(conn, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'CAMBIO_ESTADO_USUARIO',
      entidad: 'inv_usuarios',
      entidad_id: targetId,
      detalles_previos: { activo: targetUser.activo },
      detalles_nuevos: { activo: nuevoActivo },
      req
    });

    await conn.commit();

    res.json({
      success: true,
      message: `Cuenta de usuario ${nuevoActivo ? 'activada' : 'desactivada'} correctamente.`,
      activo: nuevoActivo
    });
  } catch (error) {
    await safeRollback(conn);
    console.error('Change status error:', error);
    const status = isDbUnavailableError(error, conn) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error modificando estado del usuario.' });
  } finally {
    safeRelease(conn);
  }
});

router.put('/usuarios/:id/permisos', requireAuth, requireDeveloper, async (req, res) => {
  let conn = null;
  try {
    const db = getPool();
    const targetId = parsePositiveInt(req.params.id);
    if (!targetId) {
      return res.status(400).json({ success: false, message: 'ID de usuario inválido.' });
    }
    const { permisos } = req.body || {};

    conn = await db.getConnection();
    if (!conn) {
      return res.status(503).json({ success: false, message: 'Servicio de base de datos no disponible temporalmente.' });
    }
    await conn.beginTransaction();

    const [prevRows] = await conn.query('SELECT id, nombre, rol, permisos_json, es_developer FROM inv_usuarios WHERE id = ? FOR UPDATE', [targetId]);
    if (prevRows.length === 0) {
      await safeRollback(conn);
      return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    }
    const targetUser = prevRows[0];
    const isTargetDeveloper = targetUser.es_developer === 1 || targetUser.rol === 'developer';

    const permValidation = validateAndSanitizePermissions(permisos, isTargetDeveloper);
    if (permValidation.errorStatus) {
      await safeRollback(conn);
      return res.status(permValidation.errorStatus).json({
        success: false,
        message: permValidation.errorMessage
      });
    }

    if (isTargetDeveloper && !permValidation.permisos.includes('*')) {
      await safeRollback(conn);
      return res.status(403).json({
        success: false,
        message: 'No se puede revocar el acceso comodín (*) de la cuenta Desarrollador Principal.'
      });
    }

    const sanitizedPerms = permValidation.permisos;
    const permisosStr = JSON.stringify(sanitizedPerms);
    await conn.query('UPDATE inv_usuarios SET permisos_json = ? WHERE id = ?', [permisosStr, targetId]);
    await bumpUserTokenVersion(conn, targetId);

    await logAudit(conn, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'ASIGNACION_PERMISOS',
      entidad: 'inv_usuarios',
      entidad_id: targetId,
      detalles_previos: {
        permisos: parsePermisosJson(targetUser.permisos_json, targetUser.rol, targetUser.es_developer)
      },
      detalles_nuevos: { permisos: sanitizedPerms },
      req
    });

    await conn.commit();

    res.json({ success: true, message: 'Permisos actualizados correctamente.', permisos: sanitizedPerms });
  } catch (error) {
    await safeRollback(conn);
    console.error('Update permisos error:', error);
    const status = isDbUnavailableError(error, conn) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error actualizando permisos.' });
  } finally {
    safeRelease(conn);
  }
});

router.post('/usuarios/:id/recuperar', requireAuth, requireDeveloper, async (req, res) => {
  let conn = null;
  try {
    const db = getPool();
    const targetId = parsePositiveInt(req.params.id);
    if (!targetId) {
      return res.status(400).json({ success: false, message: 'ID de usuario inválido.' });
    }
    const { nuevaPassword } = req.body || {};

    const pwdCheck = validateStrongPassword(nuevaPassword);
    if (!pwdCheck.valid) {
      return res.status(400).json({ success: false, message: pwdCheck.message });
    }

    conn = await db.getConnection();
    if (!conn) {
      return res.status(503).json({ success: false, message: 'Servicio de base de datos no disponible temporalmente.' });
    }
    await conn.beginTransaction();

    const [prevRows] = await conn.query('SELECT id, nombre, email FROM inv_usuarios WHERE id = ? FOR UPDATE', [targetId]);
    if (prevRows.length === 0) {
      await safeRollback(conn);
      return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    }

    const hash = await hashPassword(nuevaPassword);
    await conn.query('UPDATE inv_usuarios SET password_hash = ? WHERE id = ?', [hash, targetId]);
    await bumpUserTokenVersion(conn, targetId);

    await logAudit(conn, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'RECUPERACION_ACCESO_USUARIO',
      entidad: 'inv_usuarios',
      entidad_id: targetId,
      detalles_nuevos: { recuperadoPor: req.user.nombre },
      req
    });

    await conn.commit();

    res.json({ success: true, message: `Contraseña restablecida exitosamente para ${prevRows[0].email}.` });
  } catch (error) {
    await safeRollback(conn);
    console.error('Recovery error:', error);
    const status = isDbUnavailableError(error, conn) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error restableciendo acceso.' });
  } finally {
    safeRelease(conn);
  }
});

router.get('/usuarios/auditoria', requireAuth, requireDeveloper, async (req, res) => {
  try {
    const db = getPool();
    const [rows] = await db.query(`
      SELECT * FROM inv_auditoria
      WHERE entidad = 'inv_usuarios'
         OR accion IN ('CREACION_USUARIO', 'MODIFICACION_USUARIO', 'CAMBIO_ESTADO_USUARIO', 'ASIGNACION_PERMISOS', 'RECUPERACION_ACCESO_USUARIO', 'LOGOUT_USUARIO')
      ORDER BY fecha DESC
      LIMIT 100
    `);
    res.json({ success: true, logs: normalizeAuditLogRows(rows) });
  } catch (error) {
    console.error('Usuarios auditoria error:', error);
    const status = isDbUnavailableError(error) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error consultando auditoría de usuarios.' });
  }
});

// ==========================================
// 8. CAMPAMENTOS Y ALMACENES (UBICACIONES DINÁMICAS)
// ==========================================

router.get('/campamentos', requireAuth, requirePermission('camp:ver'), async (req, res) => {
  try {
    const db = getPool();
    const schemaCaps = await getSchemaCapabilities(db);
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
    if (!includeSynthetic && schemaCaps.campamentos.hasEsSintetico) {
      campsQuery += ' AND c.es_sintetico = 0';
    }
    if (soloConfirmados && schemaCaps.campamentos.hasClasificacionSede) {
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
    campsQuery += schemaCaps.campamentos.hasClasificacionSede
      ? " ORDER BY CASE WHEN c.clasificacion_sede = 'CONFIRMADO' THEN 0 ELSE 1 END ASC, c.id ASC"
      : ' ORDER BY c.id ASC';

    const [camps] = await db.query(campsQuery, campsParams);

    let alms = [];
    const almSyntSql = (!includeSynthetic && schemaCaps.almacenes.hasEsSintetico) ? 'AND es_sintetico = 0' : '';
    if (scope.isGlobal) {
      const [aRows] = await db.query(
        `SELECT * FROM inv_almacenes WHERE activo = 1 ${almSyntSql} ORDER BY id ASC`
      );
      alms = aRows;
    } else if (scope.campamentoIds.length > 0) {
      const [aRows] = await db.query(
        `SELECT * FROM inv_almacenes WHERE activo = 1 ${almSyntSql} AND campamento_id IN (?) ORDER BY id ASC`,
        [scope.campamentoIds]
      );
      alms = aRows;
    }

    let aliasesList = [];
    if (schemaCaps.campamentoAlias?.exists && camps.length > 0) {
      try {
        const campIds = camps.map((c) => c.id);
        const [alRows] = await db.query(
          'SELECT * FROM inv_campamento_alias WHERE campamento_id IN (?) ORDER BY requiere_revision_historica ASC, id ASC',
          [campIds]
        );
        aliasesList = alRows;
      } catch (aliasErr) {
        if (aliasErr?.code !== 'ER_NO_SUCH_TABLE') {
          console.warn('[CAMPAMENTOS] Error consultando alias de campamentos:', aliasErr?.message || aliasErr);
        }
        aliasesList = [];
      }
    }

    const result = camps.map(c => ({
      ...c,
      total_articulos: parseInt(c.total_articulos || 0),
      total_fisico: parseFloat(c.total_fisico || 0),
      articulos_sin_cantidad: parseInt(c.articulos_sin_cantidad || 0),
      almacenes: alms.filter(a => a.campamento_id === c.id),
      aliases: aliasesList.filter(al => al.campamento_id === c.id)
    }));

    const sinSedeVerificada = scope.isGlobal
      ? await buildSinSedeSummary(db, includeSynthetic)
      : null;

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

router.post('/campamentos', requireAuth, requirePermission('camp:operar'), async (req, res) => {
  const pool = getPool();
  let conn = null;
  let inTransaction = false;
  try {
    const { nombre, codigo, provincia, direccion, responsable, telefono, almacenesIniciales } = req.body || {};

    if (typeof nombre !== 'string' || nombre.trim() === '') {
      return res.status(400).json({ success: false, message: 'El nombre del campamento es obligatorio.' });
    }

    const cleanNombre = nombre.trim().toUpperCase();

    conn = await pool.getConnection();
    if (!conn) {
      return res.status(503).json({ success: false, message: 'Servicio de base de datos no disponible temporalmente.' });
    }
    await conn.beginTransaction();
    inTransaction = true;

    const [existing] = await conn.query('SELECT id FROM inv_campamentos WHERE nombre = ? FOR UPDATE', [cleanNombre]);
    if (existing.length > 0) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(400).json({ success: false, message: `Ya existe un campamento registrado como "${cleanNombre}".` });
    }

    const [resCamp] = await conn.query(
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
      if (typeof alm === 'string' && alm.trim() !== '') {
        await conn.query(
          `INSERT INTO inv_almacenes (campamento_id, nombre, tipo, encargado, descripcion, activo)
           VALUES (?, ?, 'General', ?, NULL, 1)`,
          [campamentoId, alm.trim(), responsable || null]
        );
      } else if (alm && typeof alm.nombre === 'string' && alm.nombre.trim() !== '') {
        await conn.query(
          `INSERT INTO inv_almacenes (campamento_id, nombre, tipo, encargado, descripcion, activo)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [campamentoId, alm.nombre.trim(), alm.tipo || 'General', alm.encargado || responsable || null, alm.descripcion || null]
        );
      }
    }

    await logAudit(conn, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'CREACION_CAMPAMENTO',
      entidad: 'inv_campamentos',
      entidad_id: campamentoId,
      detalles_nuevos: { nombre: cleanNombre, provincia, responsable },
      req
    });

    await conn.commit();
    inTransaction = false;

    res.status(201).json({
      success: true,
      message: `Campamento "${cleanNombre}" y sus almacenes creados exitosamente.`,
      id: campamentoId
    });
  } catch (error) {
    if (conn && inTransaction) {
      await safeRollback(conn);
    }
    console.error('Create campamento error:', error);
    const status = isDbUnavailableError(error, conn) ? 503 : 500;
    res.status(status).json({
      success: false,
      message: status === 503
        ? 'Base de datos temporalmente no disponible. Intente nuevamente.'
        : 'Error creando campamento.'
    });
  } finally {
    safeRelease(conn);
  }
});

// ==========================================
// 8.0.1 ALIAS CANÓNICOS Y REASIGNACIÓN TRANSACCIONAL SEGURA (RUTAS ESTÁTICAS ANTES DE /:id)
// ==========================================

router.get('/campamentos/alias', requireAuth, requirePermission('camp:ver'), async (req, res) => {
  try {
    const db = getPool();
    const schemaCaps = await getSchemaCapabilities(db);
    if (!schemaCaps.campamentoAlias?.exists) {
      return res.json({ success: true, aliases: [] });
    }

    const scope = await getUserAllowedCampamentos(db, req.user);
    const includeSynthetic = req.query.incluir_sinteticos === 'true';
    const campamentoIdParam = asNonEmptyString(req.query.campamento_id);
    let filterCid = null;

    if (campamentoIdParam && campamentoIdParam.toUpperCase() !== 'TODOS') {
      filterCid = parsePositiveInt(campamentoIdParam);
      if (!filterCid) {
        return res.status(400).json({ success: false, message: 'Parámetro campamento_id inválido.' });
      }
      if (!scope.isGlobal && !scope.campamentoIds.includes(filterCid)) {
        return res.status(403).json({ success: false, message: 'Acceso denegado a la sede solicitada.' });
      }
    }

    if (!scope.isGlobal && scope.campamentoIds.length === 0) {
      return res.json({ success: true, aliases: [] });
    }

    const conds = ['c.activo = 1'];
    const params = [];
    if (!includeSynthetic && schemaCaps.campamentos.hasEsSintetico) {
      conds.push('c.es_sintetico = 0');
    }
    if (!scope.isGlobal) {
      conds.push('ca.campamento_id IN (?)');
      params.push(scope.campamentoIds);
    }
    if (filterCid) {
      conds.push('ca.campamento_id = ?');
      params.push(filterCid);
    }

    const [aliasRows] = await db.query(
      `SELECT ca.*,
              c.nombre AS campamento_nombre,
              c.codigo AS campamento_codigo,
              ${schemaCaps.campamentos.hasClasificacionSede ? 'c.clasificacion_sede' : "'CONFIRMADO'"} AS campamento_clasificacion
       FROM inv_campamento_alias ca
       JOIN inv_campamentos c ON c.id = ca.campamento_id
       WHERE ${conds.join(' AND ')}
       ORDER BY ca.campamento_id ASC, ca.requiere_revision_historica ASC, ca.id ASC`,
      params
    );

    const [pendingUbicRows] = await db.query(
      `SELECT ubicacion_nombre, COUNT(*) AS total
       FROM inv_articulos
       WHERE activo = 1 AND campamento_id IS NULL ${includeSynthetic ? '' : 'AND es_sintetico = 0'}
       GROUP BY ubicacion_nombre`
    );

    const pendingByNorm = new Map();
    for (const r of pendingUbicRows) {
      if (!scope.isGlobal && !hasExactLocationMatch(scope, r.ubicacion_nombre)) {
        continue;
      }
      const norm = normalizeAliasKey(r.ubicacion_nombre);
      if (!norm) continue;
      pendingByNorm.set(norm, (pendingByNorm.get(norm) || 0) + parseInt(r.total || 0));
    }

    const aliases = aliasRows.map((al) => {
      const normKey = normalizeAliasKey(al.alias_normalizado || al.alias_original);
      return {
        ...al,
        articulos_pendientes: pendingByNorm.get(normKey) || 0
      };
    });

    res.json({ success: true, aliases });
  } catch (error) {
    console.error('List campamentos alias error:', error);
    const status = isDbUnavailableError(error) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error consultando alias de campamentos.' });
  }
});

router.post('/campamentos/alias', requireAuth, requirePermission('camp:operar'), async (req, res) => {
  try {
    const db = getPool();
    const schemaCaps = await getSchemaCapabilities(db);
    if (!schemaCaps.campamentoAlias?.exists) {
      return res.status(503).json({
        success: false,
        message: 'La tabla inv_campamento_alias no está disponible en el esquema actual.'
      });
    }

    const {
      campamento_id,
      alias_original,
      tipo_alias,
      estado_validacion,
      requiere_revision_historica = false,
      notas
    } = req.body || {};

    const campId = parsePositiveInt(campamento_id);
    if (!campId) {
      return res.status(400).json({ success: false, message: 'ID de campamento inválido.' });
    }

    const cleanAliasOriginal = asNonEmptyString(alias_original);
    if (!cleanAliasOriginal) {
      return res.status(400).json({ success: false, message: 'El campo alias_original es obligatorio.' });
    }
    const aliasNormalizado = normalizeAliasKey(cleanAliasOriginal);
    if (!aliasNormalizado) {
      return res.status(400).json({ success: false, message: 'El alias proporcionado no es válido.' });
    }

    const scope = await getUserAllowedCampamentos(db, req.user);
    if (!scope.isGlobal && !scope.campamentoIds.includes(campId)) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: No tiene autorización para registrar alias en este campamento.'
      });
    }

    const [campRows] = await db.query(
      'SELECT id, nombre, codigo FROM inv_campamentos WHERE id = ? AND activo = 1 LIMIT 1',
      [campId]
    );
    if (campRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Campamento no encontrado o inactivo.' });
    }

    const [dupRows] = await db.query(
      'SELECT id, campamento_id, alias_original FROM inv_campamento_alias WHERE alias_normalizado = ? LIMIT 1',
      [aliasNormalizado]
    );
    if (dupRows.length > 0) {
      return res.status(409).json({
        success: false,
        message: `El alias normalizado "${aliasNormalizado}" ya se encuentra registrado en el catálogo (ID #${dupRows[0].id}).`
      });
    }

    const aliasCols = schemaCaps.campamentoAlias.cols;
    const insertCols = ['campamento_id', 'alias_original', 'alias_normalizado'];
    const insertVals = [campId, cleanAliasOriginal, aliasNormalizado];

    if (aliasCols.has('codigo_campamento')) {
      insertCols.push('codigo_campamento');
      insertVals.push(campRows[0].codigo || `SEDE-${campId}`);
    }

    let finalEstadoValidacion = 'CONFIRMADO';
    if (aliasCols.has('estado_validacion')) {
      const enumEstados = schemaCaps.campamentoAlias.estadoValidacionValues;
      if (estado_validacion !== undefined && estado_validacion !== null && String(estado_validacion).trim() !== '') {
        const cleanEst = String(estado_validacion).trim().toUpperCase();
        if (enumEstados.length > 0 && !enumEstados.includes(cleanEst)) {
          return res.status(400).json({
            success: false,
            message: `estado_validacion inválido. Valores permitidos: ${enumEstados.join(', ')}.`
          });
        }
        finalEstadoValidacion = cleanEst;
      } else if (enumEstados.length > 0 && !enumEstados.includes('CONFIRMADO')) {
        finalEstadoValidacion = enumEstados[0];
      }
      insertCols.push('estado_validacion');
      insertVals.push(finalEstadoValidacion);
    }

    const reqRevHist = (requiere_revision_historica === true || requiere_revision_historica === 1 || requiere_revision_historica === '1') ? 1 : 0;
    if (aliasCols.has('requiere_revision_historica')) {
      insertCols.push('requiere_revision_historica');
      insertVals.push(reqRevHist);
    }

    let finalTipoAlias = null;
    if (aliasCols.has('tipo_alias')) {
      const enumTipos = schemaCaps.campamentoAlias.tipoAliasValues;
      if (tipo_alias !== undefined && tipo_alias !== null && String(tipo_alias).trim() !== '') {
        const cleanTipo = String(tipo_alias).trim().toUpperCase();
        if (enumTipos.length > 0 && !enumTipos.includes(cleanTipo)) {
          return res.status(400).json({
            success: false,
            message: `tipo_alias inválido. Valores permitidos: ${enumTipos.join(', ')}.`
          });
        }
        finalTipoAlias = cleanTipo;
      } else if (enumTipos.length > 0) {
        finalTipoAlias = enumTipos.find((v) => ['ALIAS_HISTORICO', 'MANUAL', 'EQUIVALENTE', 'HISTORICO'].includes(v)) || enumTipos[0];
      } else {
        finalTipoAlias = 'MANUAL';
      }
      insertCols.push('tipo_alias');
      insertVals.push(finalTipoAlias);
    }

    const cleanNotas = asNonEmptyString(notas);
    if (cleanNotas) {
      if (aliasCols.has('notas')) {
        insertCols.push('notas');
        insertVals.push(cleanNotas);
      } else if (aliasCols.has('observaciones')) {
        insertCols.push('observaciones');
        insertVals.push(cleanNotas);
      }
    }

    if (aliasCols.has('creado_por')) {
      insertCols.push('creado_por');
      insertVals.push(req.user.id);
    }

    const placeholders = insertCols.map(() => '?').join(', ');
    const [resInsert] = await db.query(
      `INSERT INTO inv_campamento_alias (${insertCols.join(', ')}) VALUES (${placeholders})`,
      insertVals
    );

    await logAudit(db, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'CREACION_ALIAS_CAMPAMENTO',
      entidad: 'inv_campamento_alias',
      entidad_id: resInsert.insertId,
      detalles_nuevos: {
        campamento_id: campId,
        campamento_nombre: campRows[0].nombre,
        alias_original: cleanAliasOriginal,
        alias_normalizado: aliasNormalizado,
        estado_validacion: finalEstadoValidacion,
        requiere_revision_historica: reqRevHist,
        tipo_alias: finalTipoAlias
      },
      req
    });

    const [createdRows] = await db.query('SELECT * FROM inv_campamento_alias WHERE id = ?', [resInsert.insertId]);

    res.status(201).json({
      success: true,
      message: `Alias "${cleanAliasOriginal}" registrado para "${campRows[0].nombre}".`,
      id: resInsert.insertId,
      alias: createdRows[0] || {
        id: resInsert.insertId,
        campamento_id: campId,
        alias_original: cleanAliasOriginal,
        alias_normalizado: aliasNormalizado,
        estado_validacion: finalEstadoValidacion,
        requiere_revision_historica: reqRevHist
      }
    });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'El alias ya se encuentra registrado en el catálogo.'
      });
    }
    console.error('Create campamento alias error:', error);
    const status = isDbUnavailableError(error) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error registrando alias de campamento.' });
  }
});

router.post('/campamentos/resolver-alias', requireAuth, requirePermission('camp:ver'), async (req, res) => {
  try {
    const db = getPool();
    const scope = await getUserAllowedCampamentos(db, req.user);
    const { texto, ubicacion_nombre, campamento_id, permitir_revision_historica } = req.body || {};

    const hasCampId = campamento_id !== undefined && campamento_id !== null && String(campamento_id).trim() !== '';
    if (hasCampId) {
      const reqCid = parsePositiveInt(campamento_id);
      if (!reqCid) {
        return res.status(400).json({ success: false, message: 'ID de campamento inválido.' });
      }
      if (!scope.isGlobal && !scope.campamentoIds.includes(reqCid)) {
        return res.status(403).json({ success: false, message: 'Acceso denegado a la sede solicitada.' });
      }
    }

    const textInput = asNonEmptyString(ubicacion_nombre) ?? asNonEmptyString(texto);
    if (!hasCampId && !textInput) {
      return res.status(400).json({
        success: false,
        message: 'Debe proporcionar texto, ubicacion_nombre o campamento_id para resolver.'
      });
    }

    const resolucion = await resolveCampamentoVinculacion(
      db,
      hasCampId ? campamento_id : null,
      textInput,
      { permitirAliasRevisionHistorica: permitir_revision_historica === true }
    );

    if (!scope.isGlobal) {
      if (resolucion.campamento_id && !scope.campamentoIds.includes(Number(resolucion.campamento_id))) {
        return res.status(403).json({
          success: false,
          message: 'Acceso denegado: La ubicación o alias pertenece a una sede no autorizada.'
        });
      }
      if (resolucion.suggested_campamento_id && !scope.campamentoIds.includes(Number(resolucion.suggested_campamento_id))) {
        return res.status(403).json({
          success: false,
          message: 'Acceso denegado: La ubicación o alias sugerido pertenece a una sede no autorizada.'
        });
      }
    }

    res.json({ success: true, resolucion });
  } catch (error) {
    console.error('Resolve alias error:', error);
    const status = isDbUnavailableError(error) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error resolviendo alias de campamento.' });
  }
});

router.post('/campamentos/reasignaciones/preview', requireAuth, requirePermission('camp:operar'), async (req, res) => {
  try {
    const db = getPool();
    const scope = await getUserAllowedCampamentos(db, req.user);
    if (!scope.isGlobal) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: Solo perfiles globales pueden previsualizar reasignaciones de artículos sin sede verificada.'
      });
    }

    const schemaCaps = await getSchemaCapabilities(db);
    if (!schemaCaps.campamentoAlias?.exists) {
      return res.status(503).json({
        success: false,
        message: 'La tabla inv_campamento_alias no está disponible en el esquema actual.'
      });
    }

    const {
      campamento_destino_id,
      campamento_destino_codigo,
      almacen_destino_id,
      aliases,
      incluir_solo_sin_sede = true,
      incluir_ambiguos_relacionados = true,
      incluir_sinteticos = false
    } = req.body || {};

    const includeSynthetic = incluir_sinteticos === true;
    const onlySinSede = incluir_solo_sin_sede !== false;
    const includeRelatedAmbiguous = incluir_ambiguos_relacionados !== false;

    const destResult = await resolveDestinoCampamentoYAlmacen(db, {
      campamento_destino_id,
      campamento_destino_codigo,
      almacen_destino_id
    });
    if (destResult.errorStatus) {
      return res.status(destResult.errorStatus).json({ success: false, message: destResult.errorMessage });
    }
    const { destCamp, destAlm } = destResult;

    const [destAliases] = await db.query(
      `SELECT * FROM inv_campamento_alias
       WHERE campamento_id = ? AND estado_validacion = 'CONFIRMADO'
       ORDER BY requiere_revision_historica ASC, id ASC`,
      [destCamp.id]
    );

    const destAliasNormSet = new Set(
      destAliases.map((a) => normalizeAliasKey(a.alias_normalizado || a.alias_original)).filter(Boolean)
    );
    const requestedAliasesNorm = Array.isArray(aliases)
      ? Array.from(new Set(aliases.map((a) => normalizeAliasKey(a)).filter(Boolean)))
      : [];
    const targetNormSet = requestedAliasesNorm.length > 0
      ? new Set(requestedAliasesNorm)
      : destAliasNormSet;

    const syntFilter = includeSynthetic ? '' : 'AND es_sintetico = 0';
    const poolConds = ['activo = 1'];
    const poolParams = [];
    if (!includeSynthetic) {
      poolConds.push('es_sintetico = 0');
    }
    if (onlySinSede) {
      poolConds.push('campamento_id IS NULL');
    } else {
      poolConds.push('(campamento_id IS NULL OR campamento_id <> ?)');
      poolParams.push(destCamp.id);
    }

    const [poolRows] = await db.query(
      `SELECT * FROM inv_articulos WHERE ${poolConds.join(' AND ')} ORDER BY id ASC`,
      poolParams
    );

    const candidateRows = poolRows.filter((row) => {
      const normUbic = normalizeAliasKey(row.ubicacion_nombre);
      const exactAliasHit = Boolean(normUbic && targetNormSet.has(normUbic));
      const relatedHit = includeRelatedAmbiguous && isAmbiguousRelatedToDestino(normUbic, destCamp, destAliases);
      return exactAliasHit || relatedHit;
    });

    const candidatos = await evaluateReasignacionCandidatos(db, candidateRows, destCamp, destAliases, includeSynthetic);

    const [[globalSnap]] = await db.query(
      `SELECT COUNT(*) AS total_arts, COALESCE(SUM(COALESCE(cantidad_num, 0)), 0) AS total_unids
       FROM inv_articulos WHERE activo = 1 ${syntFilter}`
    );
    const [[sinSedeSnap]] = await db.query(
      `SELECT COUNT(*) AS total_arts, COALESCE(SUM(COALESCE(cantidad_num, 0)), 0) AS total_unids
       FROM inv_articulos WHERE activo = 1 AND campamento_id IS NULL ${syntFilter}`
    );
    const [[destSnap]] = await db.query(
      `SELECT COUNT(*) AS total_arts, COALESCE(SUM(COALESCE(cantidad_num, 0)), 0) AS total_unids
       FROM inv_articulos WHERE activo = 1 AND campamento_id = ? ${syntFilter}`,
      [destCamp.id]
    );

    const elegibles = candidatos.filter((c) => !c.requiere_confirmacion_individual);
    const bloqueados = candidatos.filter((c) => c.requiere_confirmacion_individual);
    const duplicadosCodigo = candidatos.filter((c) => c.duplicado_codigo_detectado).length;
    const duplicadosSerie = candidatos.filter((c) => c.duplicado_serie_detectado).length;
    const ambiguosNoHomologados = candidatos.filter((c) => c.es_ubicacion_no_homologada).length;

    const sumUnits = (arr) => Number(
      arr.reduce((acc, r) => acc + (r.cantidad_num !== null && r.cantidad_num !== undefined ? Number(r.cantidad_num) : 0), 0).toFixed(2)
    );
    const elegiblesSinSede = elegibles.filter((c) => c.campamento_id === null || c.campamento_id === undefined);
    const unidadesElegibles = sumUnits(elegibles);
    const unidadesElegiblesSinSede = sumUnits(elegiblesSinSede);

    const unvalidatedReqAliases = requestedAliasesNorm.filter((k) => !destAliasNormSet.has(k));
    const alertas = [];
    if (unvalidatedReqAliases.length > 0) {
      alertas.push(`Alias solicitados sin homologación confirmada para ${destCamp.codigo || destCamp.nombre}: ${unvalidatedReqAliases.join(', ')}.`);
    }
    if (duplicadosCodigo > 0) {
      alertas.push(`Se detectaron ${duplicadosCodigo} artículo(s) con código de referencia duplicado en inventario activo; requieren confirmación individual.`);
    }
    if (duplicadosSerie > 0) {
      alertas.push(`Se detectaron ${duplicadosSerie} artículo(s) con serial/IMEI duplicado en inventario activo; requieren confirmación individual.`);
    }
    if (ambiguosNoHomologados > 0) {
      alertas.push(`Se detectaron ${ambiguosNoHomologados} artículo(s) con ubicación histórica no homologada; requieren confirmación individual.`);
    }
    alertas.push('La reasignación conserva intactas las cantidades físicas, códigos originales y ubicaciones históricas; no fusiona ni elimina artículos.');

    const antes = {
      total_articulos_global: Number(globalSnap?.total_arts || 0),
      total_unidades_global: Number(globalSnap?.total_unids || 0),
      sin_sede_articulos: Number(sinSedeSnap?.total_arts || 0),
      sin_sede_unidades: Number(sinSedeSnap?.total_unids || 0),
      campamento_destino_articulos: Number(destSnap?.total_arts || 0),
      campamento_destino_unidades: Number(destSnap?.total_unids || 0)
    };

    const despuesSimulado = {
      total_articulos_global: antes.total_articulos_global,
      total_unidades_global: antes.total_unidades_global,
      sin_sede_articulos: antes.sin_sede_articulos - elegiblesSinSede.length,
      sin_sede_unidades: Number((antes.sin_sede_unidades - unidadesElegiblesSinSede).toFixed(2)),
      campamento_destino_articulos: antes.campamento_destino_articulos + elegibles.length,
      campamento_destino_unidades: Number((antes.campamento_destino_unidades + unidadesElegibles).toFixed(2)),
      pendientes_revision_individual: bloqueados.length
    };

    res.json({
      success: true,
      campamento_destino: {
        id: destCamp.id,
        codigo: destCamp.codigo || null,
        nombre: destCamp.nombre
      },
      almacen_destino: destAlm ? { id: destAlm.id, nombre: destAlm.nombre } : null,
      aliases_evaluados: destAliases,
      antes,
      despues_simulado: despuesSimulado,
      resumen: {
        total_candidatos: candidatos.length,
        elegibles: elegibles.length,
        bloqueados_revision_individual: bloqueados.length,
        duplicados_codigo: duplicadosCodigo,
        duplicados_serie: duplicadosSerie,
        ambiguos_no_homologados: ambiguosNoHomologados,
        cantidad_unidades_a_reasignar: unidadesElegibles,
        impacto_cantidades_alteradas: 0,
        impacto_fusiones_articulos: 0
      },
      alertas,
      candidatos
    });
  } catch (error) {
    console.error('Reasignaciones preview error:', error);
    const status = isDbUnavailableError(error) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error generando vista previa de reasignación.' });
  }
});

router.post('/campamentos/reasignaciones/aplicar', requireAuth, requirePermission('camp:operar'), async (req, res) => {
  const pool = getPool();
  let conn = null;
  let inTransaction = false;
  try {
    const scope = await getUserAllowedCampamentos(pool, req.user);
    if (!scope.isGlobal) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: Solo perfiles globales pueden aplicar reasignaciones de artículos sin sede verificada.'
      });
    }

    const schemaCaps = await getSchemaCapabilities(pool);
    if (!schemaCaps.campamentoAlias?.exists) {
      return res.status(503).json({
        success: false,
        message: 'La tabla inv_campamento_alias no está disponible en el esquema actual.'
      });
    }

    const {
      campamento_destino_id,
      campamento_destino_codigo,
      almacen_destino_id,
      articulo_ids,
      confirmar_revision_individual_ids = [],
      motivo,
      incluir_sinteticos = false
    } = req.body || {};

    if (!Array.isArray(articulo_ids) || articulo_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debe proporcionar una lista no vacía de articulo_ids.'
      });
    }

    const parsedIds = [];
    for (const rawId of articulo_ids) {
      const pid = parsePositiveInt(rawId);
      if (!pid) {
        return res.status(400).json({
          success: false,
          message: 'Todos los elementos de articulo_ids deben ser enteros positivos válidos.'
        });
      }
      parsedIds.push(pid);
    }
    const uniqueIds = Array.from(new Set(parsedIds));

    if (confirmar_revision_individual_ids !== undefined && confirmar_revision_individual_ids !== null && !Array.isArray(confirmar_revision_individual_ids)) {
      return res.status(400).json({
        success: false,
        message: 'El campo confirmar_revision_individual_ids debe ser un arreglo de IDs.'
      });
    }
    const confirmedSet = new Set();
    if (Array.isArray(confirmar_revision_individual_ids)) {
      for (const rawConfId of confirmar_revision_individual_ids) {
        const cid = parsePositiveInt(rawConfId);
        if (!cid) {
          return res.status(400).json({
            success: false,
            message: 'Todos los elementos de confirmar_revision_individual_ids deben ser enteros positivos válidos.'
          });
        }
        confirmedSet.add(cid);
      }
    }

    const includeSynthetic = incluir_sinteticos === true;
    const motivoText = asNonEmptyString(motivo) || 'Homologación controlada de sede por alias histórico';

    const destResult = await resolveDestinoCampamentoYAlmacen(pool, {
      campamento_destino_id,
      campamento_destino_codigo,
      almacen_destino_id
    });
    if (destResult.errorStatus) {
      return res.status(destResult.errorStatus).json({ success: false, message: destResult.errorMessage });
    }
    const { destCamp, destAlm } = destResult;

    conn = await pool.getConnection();
    await conn.beginTransaction();
    inTransaction = true;

    const [snapBeforeRows] = await conn.query(
      'SELECT COUNT(*) AS total_arts, COALESCE(SUM(COALESCE(cantidad_num, 0)), 0) AS total_unids FROM inv_articulos'
    );
    const prevTotalArts = Number(snapBeforeRows[0]?.total_arts || 0);
    const prevTotalUnids = Number(snapBeforeRows[0]?.total_unids || 0);

    const [selectedRows] = await conn.query(
      'SELECT * FROM inv_articulos WHERE id IN (?) AND activo = 1 FOR UPDATE',
      [uniqueIds]
    );

    if (selectedRows.length !== uniqueIds.length) {
      const foundSet = new Set(selectedRows.map((r) => r.id));
      const missingIds = uniqueIds.filter((id) => !foundSet.has(id));
      inTransaction = false;
      await safeRollback(conn);
      return res.status(404).json({
        success: false,
        message: 'Uno o más artículos seleccionados no existen o están inactivos.',
        missing_ids: missingIds
      });
    }

    if (!includeSynthetic && selectedRows.some((r) => Number(r.es_sintetico) === 1)) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(400).json({
        success: false,
        message: 'La selección incluye registros sintéticos de prueba. Active incluir_sinteticos únicamente en pruebas controladas.'
      });
    }

    const [destAliases] = await conn.query(
      `SELECT * FROM inv_campamento_alias
       WHERE campamento_id = ? AND estado_validacion = 'CONFIRMADO'
       ORDER BY requiere_revision_historica ASC, id ASC`,
      [destCamp.id]
    );

    const evaluated = await evaluateReasignacionCandidatos(conn, selectedRows, destCamp, destAliases, includeSynthetic);
    const bloqueados = evaluated.filter((ev) => ev.requiere_confirmacion_individual && !confirmedSet.has(ev.id));

    if (bloqueados.length > 0) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(409).json({
        success: false,
        code: 'REVISION_INDIVIDUAL_REQUERIDA',
        message: `Se detectaron ${bloqueados.length} artículo(s) que requieren confirmación individual explícita antes de reasignar.`,
        bloqueados: bloqueados.map((b) => ({
          id: b.id,
          codigo_original: b.codigo_original,
          articulo_nombre: b.articulo_nombre,
          serie_imei: b.serie_imei,
          ubicacion_nombre: b.ubicacion_nombre,
          campamento_id_actual: b.campamento_id,
          duplicado_codigo_detectado: b.duplicado_codigo_detectado,
          duplicado_serie_detectado: b.duplicado_serie_detectado,
          es_ubicacion_no_homologada: b.es_ubicacion_no_homologada,
          ya_asignado_sede: b.ya_asignado_sede,
          conflictos_codigo: b.conflictos_codigo,
          conflictos_serie: b.conflictos_serie,
          motivos_bloqueo: b.motivos_bloqueo
        }))
      });
    }

    const timestampIso = new Date().toISOString().slice(0, 10);
    const destTag = destCamp.codigo ? `${destCamp.codigo} (${destCamp.nombre})` : destCamp.nombre;
    const destAlmId = destAlm ? destAlm.id : null;
    const updatedIds = [];

    for (const art of evaluated) {
      const traceNote = `[Reasignación sede ${timestampIso}: "${art.ubicacion_nombre || 'SIN_UBICACION'}" -> ${destTag} | Motivo: ${motivoText} | Usuario: ${req.user.nombre}]`;
      const newObs = art.observaciones && String(art.observaciones).trim() !== ''
        ? `${String(art.observaciones).trim()}\n${traceNote}`
        : traceNote;

      await conn.query(
        `UPDATE inv_articulos
         SET campamento_id = ?,
             almacen_id = ?,
             estado_vinculacion_sede = 'CONFIRMADO',
             observaciones = ?
         WHERE id = ?`,
        [destCamp.id, destAlmId, newObs, art.id]
      );
      updatedIds.push(art.id);
    }

    await logAudit(conn, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'REASIGNACION_CAMPAMENTO_ALIAS',
      entidad: 'inv_campamentos',
      entidad_id: destCamp.id,
      detalles_previos: {
        total_articulos_previo: prevTotalArts,
        total_unidades_previo: prevTotalUnids,
        articulos: evaluated.map((ev) => ({
          id: ev.id,
          codigo_original: ev.codigo_original,
          ubicacion_nombre: ev.ubicacion_nombre,
          campamento_id: ev.campamento_id,
          almacen_id: ev.almacen_id,
          estado_vinculacion_sede: ev.estado_vinculacion_sede,
          cantidad_num: ev.cantidad_num
        }))
      },
      detalles_nuevos: {
        campamento_destino_id: destCamp.id,
        campamento_destino_codigo: destCamp.codigo || null,
        campamento_destino_nombre: destCamp.nombre,
        almacen_destino_id: destAlmId,
        motivo: motivoText,
        reasignados: updatedIds.length,
        articulo_ids: updatedIds,
        confirmar_revision_individual_ids: Array.from(confirmedSet),
        aliases_coincidentes: Array.from(new Set(evaluated.map((ev) => ev.ubicacion_normalizada).filter(Boolean)))
      },
      req
    });

    const [snapAfterRows] = await conn.query(
      'SELECT COUNT(*) AS total_arts, COALESCE(SUM(COALESCE(cantidad_num, 0)), 0) AS total_unids FROM inv_articulos'
    );
    const afterTotalArts = Number(snapAfterRows[0]?.total_arts || 0);
    const afterTotalUnids = Number(snapAfterRows[0]?.total_unids || 0);

    if (afterTotalArts !== prevTotalArts || Math.abs(afterTotalUnids - prevTotalUnids) >= 0.001) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(500).json({
        success: false,
        message: 'Fallo de verificación de integridad de inventario tras reasignación. Operación revertida.'
      });
    }

    await conn.commit();
    inTransaction = false;

    res.json({
      success: true,
      message: `${updatedIds.length} artículo(s) reasignado(s) de forma segura a "${destCamp.nombre}".`,
      reasignados: updatedIds.length,
      articulo_ids: updatedIds,
      campamento_destino: {
        id: destCamp.id,
        codigo: destCamp.codigo || null,
        nombre: destCamp.nombre
      },
      almacen_destino: destAlm ? { id: destAlm.id, nombre: destAlm.nombre } : null,
      integridad_cantidades: {
        intacto: true,
        total_articulos_antes: prevTotalArts,
        total_articulos_despues: afterTotalArts,
        total_unidades_antes: prevTotalUnids,
        total_unidades_despues: afterTotalUnids
      }
    });
  } catch (error) {
    if (conn && inTransaction) {
      await safeRollback(conn);
    }
    console.error('Reasignaciones aplicar error:', error);
    const status = isDbUnavailableError(error, conn) ? 503 : 500;
    res.status(status).json({
      success: false,
      message: status === 503
        ? 'Base de datos temporalmente no disponible. Intente nuevamente.'
        : 'Error aplicando reasignación transaccional de campamento.'
    });
  } finally {
    safeRelease(conn);
  }
});

router.put('/campamentos/:id', requireAuth, requirePermission('camp:operar'), async (req, res) => {
  try {
    const db = getPool();
    const campamentoId = parsePositiveInt(req.params.id);
    if (!campamentoId) {
      return res.status(400).json({ success: false, message: 'ID de campamento inválido.' });
    }

    const scope = await getUserAllowedCampamentos(db, req.user);
    if (!scope.isGlobal && !scope.campamentoIds.includes(campamentoId)) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: No tiene autorización para modificar este campamento.'
      });
    }

    const [prevRows] = await db.query(
      'SELECT * FROM inv_campamentos WHERE id = ? AND activo = 1 LIMIT 1',
      [campamentoId]
    );
    if (prevRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Campamento no encontrado.' });
    }
    const prev = prevRows[0];
    const schemaCaps = await getSchemaCapabilities(db);

    const {
      nombre,
      codigo,
      provincia,
      direccion,
      responsable,
      telefono,
      ubicacion_historica_equivalente,
      clasificacion_sede
    } = req.body || {};

    const updateClauses = [];
    const updateParams = [];

    if (nombre !== undefined) {
      if (typeof nombre !== 'string' || !nombre.trim()) {
        return res.status(400).json({ success: false, message: 'El nombre del campamento no puede estar vacío.' });
      }
      const cleanNombre = nombre.trim().toUpperCase();
      const [dupNombre] = await db.query(
        'SELECT id FROM inv_campamentos WHERE UPPER(TRIM(nombre)) = ? AND id <> ? LIMIT 1',
        [cleanNombre, campamentoId]
      );
      if (dupNombre.length > 0) {
        return res.status(409).json({
          success: false,
          message: `Ya existe otro campamento registrado con el nombre "${cleanNombre}".`
        });
      }
      updateClauses.push('nombre = ?');
      updateParams.push(cleanNombre);
    }

    if (codigo !== undefined) {
      if (codigo !== null && typeof codigo !== 'string') {
        return res.status(400).json({ success: false, message: 'El código del campamento es inválido.' });
      }
      const cleanCodigo = (typeof codigo === 'string' && codigo.trim() !== '')
        ? codigo.trim().toUpperCase()
        : null;
      if (cleanCodigo) {
        const [dupCodigo] = await db.query(
          'SELECT id FROM inv_campamentos WHERE UPPER(TRIM(codigo)) = ? AND id <> ? LIMIT 1',
          [cleanCodigo, campamentoId]
        );
        if (dupCodigo.length > 0) {
          return res.status(409).json({
            success: false,
            message: `Ya existe otro campamento registrado con el código "${cleanCodigo}".`
          });
        }
      }
      updateClauses.push('codigo = ?');
      updateParams.push(cleanCodigo);
    }

    const optionalFields = [
      ['provincia', provincia],
      ['direccion', direccion],
      ['responsable', responsable],
      ['telefono', telefono],
      ['ubicacion_historica_equivalente', ubicacion_historica_equivalente]
    ];
    for (const [colName, rawVal] of optionalFields) {
      if (rawVal !== undefined) {
        if (rawVal !== null && typeof rawVal !== 'string') {
          return res.status(400).json({ success: false, message: `El campo ${colName} es inválido.` });
        }
        updateClauses.push(`${colName} = ?`);
        updateParams.push(asNonEmptyString(rawVal));
      }
    }

    if (clasificacion_sede !== undefined) {
      if (!scope.isGlobal) {
        return res.status(403).json({
          success: false,
          message: 'Acceso denegado: Solo perfiles globales pueden cambiar la clasificación de sede.'
        });
      }
      if (schemaCaps.campamentos.hasClasificacionSede) {
        const cleanClasif = String(clasificacion_sede || '').trim().toUpperCase();
        const validClasifs = schemaCaps.campamentos.clasificacionValues;
        if (validClasifs.length > 0 && !validClasifs.includes(cleanClasif)) {
          return res.status(400).json({
            success: false,
            message: `clasificacion_sede inválida. Valores permitidos: ${validClasifs.join(', ')}.`
          });
        }
        updateClauses.push('clasificacion_sede = ?');
        updateParams.push(cleanClasif);
      }
    }

    if (updateClauses.length === 0) {
      return res.status(400).json({ success: false, message: 'No se enviaron campos válidos para actualizar.' });
    }

    updateParams.push(campamentoId);
    await db.query(
      `UPDATE inv_campamentos SET ${updateClauses.join(', ')} WHERE id = ?`,
      updateParams
    );

    const [updatedRows] = await db.query('SELECT * FROM inv_campamentos WHERE id = ? LIMIT 1', [campamentoId]);

    await logAudit(db, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'ACTUALIZACION_CAMPAMENTO',
      entidad: 'inv_campamentos',
      entidad_id: campamentoId,
      detalles_previos: prev,
      detalles_nuevos: updatedRows[0] || req.body,
      req
    });

    res.json({
      success: true,
      message: 'Campamento actualizado exitosamente.',
      campamento: updatedRows[0]
    });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Ya existe un campamento con el mismo nombre o código.'
      });
    }
    console.error('Update campamento error:', error);
    const status = isDbUnavailableError(error) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error actualizando campamento.' });
  }
});

router.post('/campamentos/:id/almacenes', requireAuth, requirePermission('camp:operar'), async (req, res) => {
  try {
    const db = getPool();
    const campamentoId = parsePositiveInt(req.params.id);
    if (!campamentoId) {
      return res.status(400).json({ success: false, message: 'ID de campamento inválido.' });
    }

    const scope = await getUserAllowedCampamentos(db, req.user);
    if (!scope.isGlobal && !scope.campamentoIds.includes(campamentoId)) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: No tiene autorización para crear almacenes en este campamento.'
      });
    }

    const { nombre, tipo = 'General', encargado, descripcion } = req.body || {};

    if (typeof nombre !== 'string' || nombre.trim() === '') {
      return res.status(400).json({ success: false, message: 'El nombre del almacén es obligatorio.' });
    }

    const [camp] = await db.query('SELECT id, nombre FROM inv_campamentos WHERE id = ? AND activo = 1', [campamentoId]);
    if (camp.length === 0) {
      return res.status(404).json({ success: false, message: 'Campamento no encontrado.' });
    }

    const [resAlm] = await db.query(
      `INSERT INTO inv_almacenes (campamento_id, nombre, tipo, encargado, descripcion, activo)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [campamentoId, nombre.trim(), tipo, encargado || null, descripcion || null]
    );

    await logAudit(db, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'CREACION_ALMACEN',
      entidad: 'inv_almacenes',
      entidad_id: resAlm.insertId,
      detalles_nuevos: { campamento_id: campamentoId, nombre: nombre.trim(), tipo },
      req
    });

    res.status(201).json({
      success: true,
      message: `Almacén "${nombre.trim()}" agregado al campamento "${camp[0].nombre}".`,
      id: resAlm.insertId
    });
  } catch (error) {
    console.error('Create almacen error:', error);
    const status = isDbUnavailableError(error) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error agregando almacén.' });
  }
});

// ==========================================
// 8.1 CATÁLOGOS DINÁMICOS: CATEGORÍAS Y CUSTODIOS
// ==========================================

router.get('/catalogos/categorias', requireAuth, requireAnyPermission(['inv:ver', 'inv:crear', 'lev:ver', 'lev:capturar', 'rep:ver']), async (req, res) => {
  try {
    const db = getPool();
    const schemaCaps = await getSchemaCapabilities(db);
    const scope = await getUserAllowedCampamentos(db, req.user);
    const { area, incluir_sinteticos } = req.query;
    const includeSynthetic = incluir_sinteticos === 'true';
    const areaParam = asNonEmptyString(area);
    const normArea = areaParam ? areaParam.toUpperCase() : null;

    let catRows = [];
    if (schemaCaps.categorias.exists) {
      const syntCond = (!includeSynthetic && schemaCaps.categorias.hasEsSintetico) ? 'AND es_sintetico = 0' : '';
      try {
        if (normArea && normArea !== 'TODAS') {
          const [rows] = await db.query(
            `SELECT nombre FROM inv_categorias WHERE activo = 1 ${syntCond} AND area = ? ORDER BY nombre ASC`,
            [normArea]
          );
          catRows = rows.map(r => r.nombre);
        } else {
          const [rows] = await db.query(
            `SELECT nombre FROM inv_categorias WHERE activo = 1 ${syntCond} ORDER BY nombre ASC`
          );
          catRows = rows.map(r => r.nombre);
        }
      } catch (catErr) {
        console.error('Error consultando inv_categorias:', catErr?.message || catErr);
        catRows = [];
      }
    }

    // Unificar con valores existentes en inv_articulos acotado al scope del usuario
    let artCatQuery = `SELECT DISTINCT categoria FROM inv_articulos WHERE activo = 1 ${includeSynthetic ? '' : 'AND es_sintetico = 0'} AND categoria IS NOT NULL AND categoria != ""`;
    const artCatParams = [];
    if (!scope.isGlobal) {
      const artScope = buildArticleScopeFilter(scope, '');
      artCatQuery += ` AND ${artScope.sql}`;
      artCatParams.push(...artScope.params);
    }
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
    const status = isDbUnavailableError(error) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error consultando catálogo de categorías.' });
  }
});

router.post('/catalogos/categorias', requireAuth, requirePermission('inv:crear'), async (req, res) => {
  try {
    const db = getPool();
    const { area, nombre } = req.body || {};
    if (typeof area !== 'string' || !area.trim() || typeof nombre !== 'string' || !nombre.trim()) {
      return res.status(400).json({ success: false, message: 'Área y nombre de categoría son obligatorios.' });
    }

    const normArea = area.toUpperCase().trim();
    const cleanNombre = nombre.trim();

    // Comprobar duplicado en la base de datos (cero DDL en tiempo de petición HTTP)
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
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'La categoría ya existe.' });
    }
    const status = isDbUnavailableError(error) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error registrando categoría.' });
  }
});

router.get('/catalogos/custodios', requireAuth, requireAnyPermission(['inv:ver', 'inv:crear', 'lev:ver', 'lev:capturar', 'rep:ver']), async (req, res) => {
  try {
    const db = getPool();
    const schemaCaps = await getSchemaCapabilities(db);
    const scope = await getUserAllowedCampamentos(db, req.user);
    const { q, incluir_sinteticos } = req.query;
    const includeSynthetic = incluir_sinteticos === 'true';
    const searchQuery = asNonEmptyString(q);

    let custRows = [];
    if (scope.isGlobal && schemaCaps.custodios.exists) {
      try {
        const custCols = ['id', 'nombre', 'cargo'];
        if (schemaCaps.custodios.hasDepartamento) custCols.push('departamento');
        if (schemaCaps.custodios.hasTelefono) custCols.push('telefono');
        const syntCond = (!includeSynthetic && schemaCaps.custodios.hasEsSintetico) ? 'AND es_sintetico = 0' : '';
        const [rows] = await db.query(
          `SELECT ${custCols.join(', ')} FROM inv_custodios WHERE activo = 1 ${syntCond} ORDER BY nombre ASC`
        );
        custRows = rows;
      } catch (custErr) {
        console.error('Error consultando inv_custodios:', custErr?.message || custErr);
        custRows = [];
      }
    }

    // Unificar con asignados de inv_articulos (acotado al scope cuando !scope.isGlobal)
    let artCustQuery = `SELECT DISTINCT asignado_a as nombre FROM inv_articulos WHERE activo = 1 ${includeSynthetic ? '' : 'AND es_sintetico = 0'} AND asignado_a IS NOT NULL AND asignado_a != ""`;
    const artCustParams = [];
    if (!scope.isGlobal) {
      const artScope = buildArticleScopeFilter(scope, '');
      artCustQuery += ` AND ${artScope.sql}`;
      artCustParams.push(...artScope.params);
    }
    const [artCusts] = await db.query(artCustQuery, artCustParams);

    // Unificar con responsables de inv_levantamiento_items (acotado al scope cuando !scope.isGlobal)
    let levCusts = [];
    if (schemaCaps.levantamientos.exists) {
      try {
        if (scope.isGlobal) {
          const [rows] = await db.query(
            `SELECT DISTINCT responsable_custodio as nombre FROM inv_levantamiento_items WHERE responsable_custodio IS NOT NULL AND responsable_custodio != "" ${includeSynthetic ? '' : 'AND es_sintetico = 0'}`
          );
          levCusts = rows;
        } else if (scope.campamentoIds.length > 0) {
          const [rows] = await db.query(
            `SELECT DISTINCT li.responsable_custodio as nombre
             FROM inv_levantamiento_items li
             JOIN inv_levantamientos l ON li.levantamiento_id = l.id
             WHERE li.responsable_custodio IS NOT NULL AND li.responsable_custodio != ""
               ${includeSynthetic ? '' : 'AND li.es_sintetico = 0 AND l.es_sintetico = 0'}
               AND l.campamento_id IN (?)`,
            [scope.campamentoIds]
          );
          levCusts = rows;
        }
      } catch (levCustErr) {
        console.error('Error consultando custodios de levantamientos:', levCustErr?.message || levCustErr);
        levCusts = [];
      }
    }

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
          departamento: scope.isGlobal ? (item.departamento || null) : null,
          telefono: scope.isGlobal ? (item.telefono || null) : null
        });
      }
    };

    custRows.forEach(addCust);
    artCusts.forEach(addCust);
    levCusts.forEach(addCust);

    let list = Array.from(map.values());
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      list = list.filter(c => c.nombre.toLowerCase().includes(searchLower) || (c.cargo && c.cargo.toLowerCase().includes(searchLower)));
    }

    list.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));

    res.json({ success: true, custodios: list });
  } catch (error) {
    console.error('List custodios error:', error);
    const status = isDbUnavailableError(error) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error consultando catálogo de custodios.' });
  }
});

router.post('/catalogos/custodios', requireAuth, requirePermission('inv:crear'), async (req, res) => {
  try {
    const db = getPool();
    const schemaCaps = await getSchemaCapabilities(db);
    const { nombre, cargo, departamento, telefono } = req.body || {};
    if (typeof nombre !== 'string' || !nombre.trim()) {
      return res.status(400).json({ success: false, message: 'El nombre del custodio o responsable es obligatorio.' });
    }

    const cleanNombre = nombre.trim();
    const cleanCargo = typeof cargo === 'string' && cargo.trim() ? cargo.trim() : 'Personal de Campo';
    const cleanDepto = typeof departamento === 'string' && departamento.trim() ? departamento.trim() : null;
    const cleanTel = typeof telefono === 'string' && telefono.trim() ? telefono.trim() : null;

    // Comprobar duplicado en la base de datos (cero DDL en tiempo de petición HTTP)
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

    const insertCols = ['nombre', 'cargo', 'activo'];
    const insertVals = [cleanNombre, cleanCargo, 1];
    if (schemaCaps.custodios.hasDepartamento) {
      insertCols.push('departamento');
      insertVals.push(cleanDepto);
    }
    if (schemaCaps.custodios.hasTelefono) {
      insertCols.push('telefono');
      insertVals.push(cleanTel);
    }

    const placeholders = insertCols.map(() => '?').join(', ');
    const [resInsert] = await db.query(
      `INSERT INTO inv_custodios (${insertCols.join(', ')}) VALUES (${placeholders})`,
      insertVals
    );

    res.status(201).json({
      success: true,
      message: 'Responsable registrado exitosamente.',
      custodio: {
        id: resInsert.insertId,
        nombre: cleanNombre,
        cargo: cleanCargo
      }
    });
  } catch (error) {
    console.error('Create custodio error:', error);
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'El responsable ya existe.' });
    }
    const status = isDbUnavailableError(error) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error registrando responsable.' });
  }
});

router.get('/catalogos/ubicaciones', requireAuth, requireAnyPermission(['inv:ver', 'inv:crear', 'lev:ver', 'lev:capturar', 'rep:ver']), async (req, res) => {
  try {
    const db = getPool();
    const scope = await getUserAllowedCampamentos(db, req.user);
    const includeSynthetic = req.query.incluir_sinteticos === 'true';

    // 1. Campamentos de inv_campamentos (acotados al scope cuando !scope.isGlobal)
    let campRows = [];
    try {
      if (scope.isGlobal) {
        const [rows] = await db.query(
          `SELECT id, nombre, codigo, provincia, responsable, clasificacion_sede
           FROM inv_campamentos
           WHERE activo = 1 ${includeSynthetic ? '' : 'AND es_sintetico = 0'}
           ORDER BY CASE WHEN clasificacion_sede = 'CONFIRMADO' THEN 0 ELSE 1 END ASC, id ASC`
        );
        campRows = rows;
      } else if (scope.campamentoIds.length > 0) {
        const [rows] = await db.query(
          `SELECT id, nombre, codigo, provincia, responsable, clasificacion_sede
           FROM inv_campamentos
           WHERE activo = 1 ${includeSynthetic ? '' : 'AND es_sintetico = 0'} AND id IN (?)
           ORDER BY CASE WHEN clasificacion_sede = 'CONFIRMADO' THEN 0 ELSE 1 END ASC, id ASC`,
          [scope.campamentoIds]
        );
        campRows = rows;
      }
    } catch (campErr) {
      console.error('Error consultando campamentos en catálogo ubicaciones:', campErr?.message || campErr);
      campRows = [];
    }

    // 2. Ubicaciones históricas en inv_articulos (acotadas al scope cuando !scope.isGlobal)
    let artUbicRows = [];
    try {
      let artUbicQuery = `SELECT DISTINCT ubicacion_nombre FROM inv_articulos WHERE activo = 1 ${includeSynthetic ? '' : 'AND es_sintetico = 0'} AND ubicacion_nombre IS NOT NULL AND ubicacion_nombre != ""`;
      const artUbicParams = [];
      if (!scope.isGlobal) {
        const artScope = buildArticleScopeFilter(scope, '');
        artUbicQuery += ` AND ${artScope.sql}`;
        artUbicParams.push(...artScope.params);
      }
      const [rows] = await db.query(artUbicQuery, artUbicParams);
      artUbicRows = rows.map(r => r.ubicacion_nombre);
    } catch (ubicErr) {
      console.error('Error consultando ubicaciones de artículos:', ubicErr?.message || ubicErr);
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
        const vinc = await resolveCampamentoVinculacion(db, null, clean, { skipAlmacenLookup: true });
        const visibleCampId = (scope.isGlobal || !vinc.campamento_id || scope.campamentoIds.includes(vinc.campamento_id))
          ? vinc.campamento_id
          : null;
        map.set(lower, {
          nombre: clean,
          tipo: vinc.estado_vinculacion_sede === 'SEDE_AMBIGUA' ? 'Ubicación Histórica (Sede Ambigua)' : 'Ubicación Histórica Excel',
          clasificacion_sede: vinc.estado_vinculacion_sede,
          provincia: null,
          campamento_id: visibleCampId
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

    const estadoParam = asNonEmptyString(estado);
    if (estadoParam && estadoParam.toUpperCase() !== 'TODOS') {
      conditions.push('l.estado = ?');
      params.push(estadoParam);
    }

    const campamentoParam = asNonEmptyString(campamento_id);
    if (campamento_id !== undefined && campamento_id !== '' && campamentoParam !== 'TODOS') {
      const cId = parsePositiveInt(campamento_id);
      if (!scope.isGlobal && (!cId || !scope.campamentoIds.includes(cId))) {
        return res.status(403).json({ success: false, message: 'Acceso denegado al campamento solicitado.' });
      }
      if (!cId) {
        return res.status(400).json({ success: false, message: 'Parámetro campamento_id inválido.' });
      }
      conditions.push('l.campamento_id = ?');
      params.push(cId);
    }

    // v2.2: filtro por fecha de inicio del levantamiento (DATE, sin zona horaria)
    if (!applyDateRange(req, res, conditions, params, 'l.fecha_inicio', { dateOnly: true })) return;

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
      ORDER BY l.id DESC
    `;

    const [rows] = await db.query(query, params);
    res.json({ success: true, levantamientos: rows });
  } catch (error) {
    console.error('List levantamientos error:', error);
    res.status(500).json({ success: false, message: 'Error consultando levantamientos.' });
  }
});

router.post('/levantamientos', requireAuth, requirePermission('lev:crear'), async (req, res) => {
  const pool = getPool();
  let conn = null;
  let inTransaction = false;
  try {
    const {
      titulo,
      campamento_id,
      almacen_id,
      fecha_inicio,
      responsable_levantamiento,
      equipo_auditor,
      notas,
      es_sintetico
    } = req.body || {};

    const actualFechaInicio = fecha_inicio || new Date().toISOString().split('T')[0];

    if (typeof titulo !== 'string' || !titulo.trim() || !campamento_id || typeof responsable_levantamiento !== 'string' || !responsable_levantamiento.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Título, campamento y responsable son obligatorios.'
      });
    }

    const cId = parsePositiveInt(campamento_id);
    if (!cId) {
      return res.status(400).json({ success: false, message: 'ID de campamento inválido.' });
    }

    let almIdParsed = null;
    if (almacen_id !== undefined && almacen_id !== null && String(almacen_id).trim() !== '') {
      almIdParsed = parsePositiveInt(almacen_id);
      if (!almIdParsed) {
        return res.status(400).json({ success: false, message: 'ID de almacén inválido.' });
      }
    }

    conn = await pool.getConnection();
    if (!conn) {
      return res.status(503).json({ success: false, message: 'Servicio de base de datos no disponible temporalmente.' });
    }
    await conn.beginTransaction();
    inTransaction = true;

    const scope = await getUserAllowedCampamentos(conn, req.user);
    if (!scope.isGlobal && !scope.campamentoIds.includes(cId)) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: No tiene autorización para crear levantamientos en este campamento.'
      });
    }

    const [cRows] = await conn.query('SELECT id, codigo, nombre, es_sintetico FROM inv_campamentos WHERE id = ? AND activo = 1 FOR UPDATE', [cId]);
    if (cRows.length === 0) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(400).json({ success: false, message: 'El campamento seleccionado no existe o está inactivo.' });
    }

    if (almIdParsed) {
      const [almRows] = await conn.query(
        'SELECT id FROM inv_almacenes WHERE id = ? AND campamento_id = ? AND activo = 1 LIMIT 1',
        [almIdParsed, cId]
      );
      if (almRows.length === 0) {
        inTransaction = false;
        await safeRollback(conn);
        return res.status(400).json({ success: false, message: 'El almacén seleccionado no pertenece al campamento o está inactivo.' });
      }
    }

    // Auto-generate code thread-safe via MAX suffix + FOR UPDATE (M07)
    const campCode = cRows[0].codigo || 'CAMP';
    const yearMatch = String(actualFechaInicio).match(/^(\d{4})/);
    const year = yearMatch ? Number(yearMatch[1]) : (new Date().getFullYear() || 2026);
    const codePrefix = `LEV-${year}-${campCode}-`;
    const [existingLevCodes] = await conn.query(
      'SELECT codigo_levantamiento FROM inv_levantamientos WHERE codigo_levantamiento LIKE ? FOR UPDATE',
      [`${codePrefix}%`]
    );
    let maxSeq = 0;
    for (const r of existingLevCodes) {
      const m = String(r.codigo_levantamiento || '').match(/(\d+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!Number.isNaN(n) && n > maxSeq) maxSeq = n;
      }
    }
    let seqNum = maxSeq + 1;
    let codigoLev = `${codePrefix}${String(seqNum).padStart(3, '0')}`;
    while (true) {
      const [checkCode] = await conn.query(
        'SELECT id FROM inv_levantamientos WHERE codigo_levantamiento = ? LIMIT 1 FOR UPDATE',
        [codigoLev]
      );
      if (checkCode.length === 0) break;
      seqNum++;
      codigoLev = `${codePrefix}${String(seqNum).padStart(3, '0')}`;
    }

    const isSyntLev = (isTruthyFlag(es_sintetico) || Number(cRows[0].es_sintetico) === 1) ? 1 : 0;

    const [insertRes] = await conn.query(
      `INSERT INTO inv_levantamientos (
        codigo_levantamiento, titulo, campamento_id, almacen_id, fecha_inicio,
        responsable_levantamiento, equipo_auditor, estado, notas, creado_por, es_sintetico
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'En proceso', ?, ?, ?)`,
      [
        codigoLev,
        titulo.trim(),
        cId,
        almIdParsed,
        actualFechaInicio,
        responsable_levantamiento.trim(),
        asNonEmptyString(equipo_auditor),
        asNonEmptyString(notas),
        req.user.id,
        isSyntLev
      ]
    );

    await logAudit(conn, {
      usuario_id: req.user.id,
      usuario_nombre: req.user.nombre,
      accion: 'CREACION_LEVANTAMIENTO',
      entidad: 'inv_levantamientos',
      entidad_id: insertRes.insertId,
      detalles_nuevos: { codigoLev, titulo: titulo.trim(), campamento_id: cId, es_sintetico: isSyntLev },
      req
    });

    await conn.commit();
    inTransaction = false;

    res.status(201).json({
      success: true,
      message: `Sesión de levantamiento "${codigoLev}" iniciada con éxito.`,
      id: insertRes.insertId,
      codigo: codigoLev,
      codigo_levantamiento: codigoLev
    });
  } catch (error) {
    if (conn && inTransaction) {
      await safeRollback(conn);
    }
    console.error('Create levantamiento error:', error);
    const status = isDbUnavailableError(error, conn) ? 503 : 500;
    res.status(status).json({
      success: false,
      message: status === 503
        ? 'Base de datos temporalmente no disponible. Intente nuevamente.'
        : 'Error creando sesión de levantamiento.'
    });
  } finally {
    safeRelease(conn);
  }
});

router.get('/levantamientos/:id', requireAuth, requirePermission('lev:ver'), async (req, res) => {
  try {
    const db = getPool();
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'ID de levantamiento inválido.' });
    }

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
    console.error('Get levantamiento detail error:', error);
    const status = isDbUnavailableError(error) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error consultando levantamiento.' });
  }
});

// Conciliación read-only Físico vs Teórico del campamento (Etapa 6)
router.get('/levantamientos/:id/conciliacion', requireAuth, requirePermission('lev:ver'), async (req, res) => {
  try {
    const db = getPool();
    const levId = parsePositiveInt(req.params.id);
    if (!levId) {
      return res.status(400).json({ success: false, message: 'ID de levantamiento inválido.' });
    }

    const [levRows] = await db.query(
      `SELECT l.id, l.codigo_levantamiento, l.titulo, l.campamento_id, l.almacen_id,
              l.estado, l.es_sintetico, c.nombre AS campamento_nombre
       FROM inv_levantamientos l
       JOIN inv_campamentos c ON l.campamento_id = c.id
       WHERE l.id = ?`,
      [levId]
    );
    if (levRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Levantamiento no encontrado.' });
    }
    const lev = levRows[0];

    const scope = await getUserAllowedCampamentos(db, req.user);
    if (!scope.isGlobal && !scope.campamentoIds.includes(lev.campamento_id)) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: El levantamiento pertenece a una sede o campamento no autorizado.'
      });
    }

    const isSyntLev = Number(lev.es_sintetico) === 1 ? 1 : 0;

    // 1. Universo físico capturado en la sesión (excluyendo los marcados explícitamente consolidado = 2 omitidos)
    const [fisicos] = await db.query(
      `SELECT id, codigo_original, area, categoria, articulo_nombre, serie_imei,
              cantidad, unidad_medida, estado_fisico, responsable_custodio,
              ubicacion_exacta, consolidado, articulo_maestro_id
       FROM inv_levantamiento_items
       WHERE levantamiento_id = ? AND consolidado <> 2
       ORDER BY id ASC`,
      [levId]
    );

    // 2. Inventario teórico actual del mismo campamento (activos y mismo nivel es_sintetico)
    const [teoricos] = await db.query(
      `SELECT id, codigo_original, area, categoria, articulo_nombre, serie_imei,
              cantidad_num, cantidad_verificada, unidad_medida, estado_fisico,
              ubicacion_nombre, asignado_a, campamento_id, almacen_id
       FROM inv_articulos
       WHERE activo = 1 AND es_sintetico = ? AND campamento_id = ?
       ORDER BY id ASC`,
      [isSyntLev, lev.campamento_id]
    );

    const masterById = new Map();
    const masterBySerial = new Map();
    const masterByCode = new Map();
    for (const m of teoricos) {
      masterById.set(Number(m.id), m);
      const serKey = normalizeSerialKey(m.serie_imei);
      if (serKey && !masterBySerial.has(serKey)) {
        masterBySerial.set(serKey, m);
      }
      const codeKey = m.codigo_original ? String(m.codigo_original).trim().toUpperCase() : null;
      if (codeKey && !masterByCode.has(codeKey)) {
        masterByCode.set(codeKey, m);
      }
    }

    const matchedPhysicalByMasterId = new Map();
    const sobrantesEnCampo = [];

    for (const it of fisicos) {
      let masterMatch = null;
      if (it.articulo_maestro_id && masterById.has(Number(it.articulo_maestro_id))) {
        masterMatch = masterById.get(Number(it.articulo_maestro_id));
      } else {
        const serKey = normalizeSerialKey(it.serie_imei);
        if (serKey && masterBySerial.has(serKey)) {
          masterMatch = masterBySerial.get(serKey);
        } else {
          const codeKey = it.codigo_original ? String(it.codigo_original).trim().toUpperCase() : null;
          if (codeKey && masterByCode.has(codeKey)) {
            masterMatch = masterByCode.get(codeKey);
          }
        }
      }

      if (!masterMatch) {
        sobrantesEnCampo.push({
          item_id: it.id,
          codigo_original: it.codigo_original || null,
          articulo_nombre: it.articulo_nombre,
          serie_imei: it.serie_imei || null,
          area: it.area,
          cantidad_fisica: Number(Number(it.cantidad || 0).toFixed(2)),
          estado_fisico: it.estado_fisico,
          ubicacion_exacta: it.ubicacion_exacta || null,
          motivo: 'Sin coincidencia en el inventario teórico actual del campamento'
        });
      } else {
        const mid = Number(masterMatch.id);
        const prevAgg = matchedPhysicalByMasterId.get(mid) || {
          master: masterMatch,
          cantidad_fisica: 0,
          item_ids: []
        };
        prevAgg.cantidad_fisica = Number((prevAgg.cantidad_fisica + Number(it.cantidad || 0)).toFixed(2));
        prevAgg.item_ids.push(it.id);
        matchedPhysicalByMasterId.set(mid, prevAgg);
      }
    }

    const coincidencias = [];
    const diferenciasCantidad = [];
    const faltantesNoLocalizados = [];

    for (const m of teoricos) {
      const mid = Number(m.id);
      const agg = matchedPhysicalByMasterId.get(mid);
      const teorica = m.cantidad_num !== null ? Number(Number(m.cantidad_num).toFixed(2)) : null;

      if (!agg) {
        faltantesNoLocalizados.push({
          articulo_maestro_id: mid,
          codigo_original: m.codigo_original || null,
          articulo_nombre: m.articulo_nombre,
          serie_imei: m.serie_imei || null,
          area: m.area,
          cantidad_teorica: teorica,
          ubicacion_nombre: m.ubicacion_nombre,
          asignado_a: m.asignado_a || null
        });
        continue;
      }

      const fisica = agg.cantidad_fisica;
      if (teorica === null || Math.abs(fisica - teorica) > 0.001) {
        diferenciasCantidad.push({
          articulo_maestro_id: mid,
          item_ids: agg.item_ids,
          codigo_original: m.codigo_original || null,
          articulo_nombre: m.articulo_nombre,
          serie_imei: m.serie_imei || null,
          cantidad_teorica: teorica,
          cantidad_fisica: fisica,
          diferencia: teorica === null ? fisica : Number((fisica - teorica).toFixed(2)),
          estado_cantidad: teorica === null ? 'PENDIENTE_VERIFICACION' : 'DIFERENCIA_CONTEO'
        });
      } else {
        coincidencias.push({
          articulo_maestro_id: mid,
          item_ids: agg.item_ids,
          codigo_original: m.codigo_original || null,
          articulo_nombre: m.articulo_nombre,
          serie_imei: m.serie_imei || null,
          cantidad_teorica: teorica,
          cantidad_fisica: fisica,
          diferencia: 0
        });
      }
    }

    const totalTeoricoUnidades = Number(
      teoricos.reduce((acc, m) => acc + (m.cantidad_num !== null ? Number(m.cantidad_num) : 0), 0).toFixed(2)
    );
    const totalFisicoUnidades = Number(
      fisicos.reduce((acc, f) => acc + Number(f.cantidad || 0), 0).toFixed(2)
    );

    res.json({
      success: true,
      levantamiento: lev,
      solo_lectura: true,
      resumen: {
        total_teorico_registros: teoricos.length,
        total_teorico_unidades: totalTeoricoUnidades,
        total_fisico_registros: fisicos.length,
        total_fisico_unidades: totalFisicoUnidades,
        coincidencias_exactas: coincidencias.length,
        diferencias_cantidad_count: diferenciasCantidad.length,
        sobrantes_count: sobrantesEnCampo.length,
        faltantes_count: faltantesNoLocalizados.length
      },
      coincidencias,
      diferencias_cantidad: diferenciasCantidad,
      sobrantes_en_campo: sobrantesEnCampo,
      faltantes_no_localizados: faltantesNoLocalizados
    });
  } catch (error) {
    console.error('Conciliacion levantamiento error:', error);
    const status = isDbUnavailableError(error) ? 503 : 500;
    res.status(status).json({ success: false, message: 'Error calculando conciliación físico vs teórico.' });
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
  let conn = null;
  let inTransaction = false;
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'ID de levantamiento inválido.' });
    }
    const { titulo, responsable_levantamiento, equipo_auditor, estado, notas, fecha_fin } = req.body || {};

    conn = await pool.getConnection();
    await conn.beginTransaction();
    inTransaction = true;

    // Bloqueo exclusivo FOR UPDATE para evitar colisiones con consolidaciones concurrentes
    const [existingRows] = await conn.query('SELECT * FROM inv_levantamientos WHERE id = ? FOR UPDATE', [id]);
    if (existingRows.length === 0) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(404).json({ success: false, message: 'Levantamiento no encontrado.' });
    }
    const currentLev = existingRows[0];

    const scope = await getUserAllowedCampamentos(conn, req.user);
    if (!scope.isGlobal && !scope.campamentoIds.includes(currentLev.campamento_id)) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: No tiene autorización para modificar levantamientos de este campamento.'
      });
    }

    // SEC-10 / QA-02: Bloqueo estricto de edición para levantamientos finalizados
    if (currentLev.estado === 'Finalizado') {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(409).json({
        success: false,
        message: 'No se puede modificar una auditoría en estado Finalizado. Los registros se encuentran protegidos contra escritura.'
      });
    }

    if (currentLev.estado === 'Cancelado') {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(409).json({
        success: false,
        message: 'No se puede modificar una auditoría cancelada.'
      });
    }

    // Regla de transición: Finalizado sólo es alcanzable mediante /consolidar
    if (estado === 'Finalizado') {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(400).json({
        success: false,
        message: 'El estado Finalizado únicamente puede alcanzarse mediante la consolidación de la auditoría (/consolidar).'
      });
    }

    if (estado !== undefined && estado !== null) {
      if (!ESTADOS_LEVANTAMIENTO_VALIDOS.includes(estado)) {
        inTransaction = false;
        await safeRollback(conn);
        return res.status(400).json({
          success: false,
          message: `Estado no válido. Valores permitidos: ${ESTADOS_LEVANTAMIENTO_VALIDOS.join(', ')}.`
        });
      }

      const permitidos = TRANSICIONES_LEVANTAMIENTO[currentLev.estado] || [];
      if (!permitidos.includes(estado)) {
        inTransaction = false;
        await safeRollback(conn);
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
    `, [
      asNonEmptyString(titulo),
      asNonEmptyString(responsable_levantamiento),
      equipo_auditor !== undefined ? (equipo_auditor ?? null) : null,
      estado !== undefined ? (estado ?? null) : null,
      notas !== undefined ? (notas ?? null) : null,
      fecha_fin !== undefined ? (fecha_fin || null) : null,
      id
    ]);

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
    inTransaction = false;

    res.json({ success: true, message: 'Levantamiento actualizado con éxito.' });
  } catch (error) {
    if (conn && inTransaction) {
      await safeRollback(conn);
    }
    console.error('Update levantamiento error:', error);
    const status = isDbUnavailableError(error, conn) ? 503 : 500;
    res.status(status).json({
      success: false,
      message: status === 503
        ? 'Base de datos temporalmente no disponible. Intente nuevamente.'
        : 'Error actualizando sesión de levantamiento.'
    });
  } finally {
    safeRelease(conn);
  }
});

// ==========================================
// 10. ARTÍCULOS DE LA SESIÓN DE LEVANTAMIENTO (ITEMS)
// ==========================================

router.get('/levantamientos/:id/items', requireAuth, requirePermission('lev:ver'), async (req, res) => {
  try {
    const db = getPool();
    const levId = parsePositiveInt(req.params.id);
    if (!levId) {
      return res.status(400).json({ success: false, message: 'ID de levantamiento inválido.' });
    }
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

    const areaParam = asNonEmptyString(area);
    if (areaParam && areaParam.toUpperCase() !== 'TODAS') {
      conditions.push('area = ?');
      params.push(areaParam.toUpperCase());
    }

    const estadoParam = asNonEmptyString(estado_fisico);
    if (estadoParam && estadoParam.toUpperCase() !== 'TODOS') {
      const norm = normalizeEstadoParam(estadoParam);
      conditions.push('estado_fisico = ?');
      params.push(norm);
    }

    const searchParam = asNonEmptyString(search);
    if (searchParam) {
      const q = `%${searchParam}%`;
      conditions.push('(articulo_nombre LIKE ? OR codigo_original LIKE ? OR serie_imei LIKE ? OR marca LIKE ? OR responsable_custodio LIKE ?)');
      params.push(q, q, q, q, q);
    }

    const [rows] = await db.query(
      `SELECT id, levantamiento_id, codigo_original, area, categoria, articulo_nombre,
              marca, modelo_caracteristicas, serie_imei, cantidad, unidad_medida,
              estado_fisico, propietario, responsable_custodio, ubicacion_exacta,
              fecha_revision, observaciones, consolidado, articulo_maestro_id,
              estado_verificacion, es_sintetico, creado_por, fecha_captura, fecha_actualizacion,
              CASE WHEN evidencia_foto IS NOT NULL AND evidencia_foto <> '' THEN 1 ELSE 0 END AS tiene_foto
       FROM inv_levantamiento_items
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
  let conn = null;
  let inTransaction = false;
  try {
    const levId = parsePositiveInt(req.params.id);
    if (!levId) {
      return res.status(400).json({ success: false, message: 'ID de levantamiento inválido.' });
    }
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
    } = req.body || {};

    if (typeof articulo_nombre !== 'string' || articulo_nombre.trim() === '') {
      return res.status(400).json({ success: false, message: 'La descripción del artículo es obligatoria.' });
    }

    const normArea = typeof area === 'string' && area.trim() !== '' ? area.trim().toUpperCase() : 'ALMACEN';
    if (!VALID_INVENTARIO_AREAS.includes(normArea)) {
      return res.status(400).json({
        success: false,
        message: `Área inválida. Valores permitidos: ${VALID_INVENTARIO_AREAS.join(', ')}.`
      });
    }

    conn = await pool.getConnection();
    if (!conn) {
      return res.status(503).json({ success: false, message: 'Servicio de base de datos no disponible temporalmente.' });
    }
    await conn.beginTransaction();
    inTransaction = true;

    // Bloqueo FOR UPDATE sobre el levantamiento para prevenir condición de carrera con consolidación
    const [levRows] = await conn.query('SELECT id, estado, campamento_id, es_sintetico FROM inv_levantamientos WHERE id = ? FOR UPDATE', [levId]);
    if (levRows.length === 0) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(404).json({ success: false, message: 'Levantamiento no encontrado.' });
    }

    // Orden seguridad (R-E2-01): validar ámbito de campamento (403) ANTES de comprobar estado (409)
    const scope = await getUserAllowedCampamentos(conn, req.user);
    if (!scope.isGlobal && !scope.campamentoIds.includes(levRows[0].campamento_id)) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: No tiene autorización para agregar artículos en este campamento.'
      });
    }

    if (levRows[0].estado === 'Finalizado' || levRows[0].estado === 'Cancelado') {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(409).json({
        success: false,
        message: levRows[0].estado === 'Cancelado'
          ? 'No se pueden registrar artículos en un levantamiento Cancelado.'
          : 'No se pueden registrar artículos en un levantamiento Finalizado.'
      });
    }

    // Quantity validation
    const cantNum = Number(cantidad);
    if (!Number.isFinite(cantNum) || cantNum <= 0) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(400).json({ success: false, message: 'La cantidad debe ser un número estrictamente mayor a cero.' });
    }
    if (Number(cantNum.toFixed(2)) !== cantNum) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(400).json({ success: false, message: 'La cantidad no puede tener más de 2 cifras decimales.' });
    }

    // Physical status normalization
    const estadoFisicoNormalizado = normalizeEstadoFisico(estado_fisico);
    const cleanSerie = typeof serie_imei === 'string' && serie_imei.trim() !== '' ? serie_imei.trim() : null;
    const serialKey = normalizeSerialKey(cleanSerie);

    // Check potential duplicate within session or master inventory (M07 / placeholder-safe)
    let advertenciaDuplicado = null;
    if (serialKey) {
      const [dupSession] = await conn.query(
        'SELECT id, articulo_nombre FROM inv_levantamiento_items WHERE levantamiento_id = ? AND UPPER(TRIM(serie_imei)) = ? LIMIT 1',
        [levId, serialKey]
      );
      if (dupSession.length > 0) {
        advertenciaDuplicado = `Aviso: El serial/IMEI "${cleanSerie}" ya fue registrado en esta auditoría (#${dupSession[0].id} - ${dupSession[0].articulo_nombre}).`;
      } else {
        const [dupMaster] = await conn.query(
          'SELECT id, articulo_nombre, ubicacion_nombre FROM inv_articulos WHERE activo = 1 AND UPPER(TRIM(serie_imei)) = ? LIMIT 1',
          [serialKey]
        );
        if (dupMaster.length > 0) {
          advertenciaDuplicado = `Aviso: El serial/IMEI "${cleanSerie}" ya existe en el inventario maestro (${dupMaster[0].ubicacion_nombre}).`;
        }
      }
    }

    const isSyntItem = Number(levRows[0].es_sintetico) === 1 ? 1 : 0;

    const [insertRes] = await conn.query(
      `INSERT INTO inv_levantamiento_items (
        levantamiento_id, codigo_original, area, categoria, articulo_nombre,
        marca, modelo_caracteristicas, serie_imei, cantidad, unidad_medida,
        estado_fisico, propietario, responsable_custodio, ubicacion_exacta,
        fecha_revision, observaciones, evidencia_foto, es_sintetico, creado_por
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        levId,
        asNonEmptyString(codigo_original),
        normArea,
        asNonEmptyString(categoria) || 'General',
        articulo_nombre.trim(),
        asNonEmptyString(marca),
        asNonEmptyString(modelo_caracteristicas),
        cleanSerie,
        cantNum,
        asNonEmptyString(unidad_medida) || 'Unidad',
        estadoFisicoNormalizado,
        asNonEmptyString(propietario) || 'INGMELEC',
        asNonEmptyString(responsable_custodio),
        asNonEmptyString(ubicacion_exacta),
        fecha_revision || null,
        asNonEmptyString(observaciones),
        evidencia_foto || null,
        isSyntItem,
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
        serie_imei: cleanSerie,
        estado_fisico: estadoFisicoNormalizado
      },
      req
    });

    await conn.commit();
    inTransaction = false;

    res.status(201).json({
      success: true,
      message: 'Artículo guardado en la auditoría.',
      id: insertRes.insertId,
      advertencia: advertenciaDuplicado,
      warning_duplicado: advertenciaDuplicado
    });
  } catch (error) {
    if (conn && inTransaction) {
      await safeRollback(conn);
    }
    console.error('Insert levantamiento item error:', error);
    const status = isDbUnavailableError(error, conn) ? 503 : 500;
    res.status(status).json({
      success: false,
      message: status === 503
        ? 'Base de datos temporalmente no disponible. Intente nuevamente.'
        : 'Error guardando artículo en el levantamiento.'
    });
  } finally {
    safeRelease(conn);
  }
});

router.put('/levantamientos/:id/items/:itemId', requireAuth, requirePermission('lev:editar'), async (req, res) => {
  const pool = getPool();
  let conn = null;
  let inTransaction = false;
  try {
    const levId = parsePositiveInt(req.params.id);
    const itemId = parsePositiveInt(req.params.itemId);
    if (!levId || !itemId) {
      return res.status(400).json({ success: false, message: 'ID de levantamiento o artículo inválido.' });
    }
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
    } = req.body || {};

    conn = await pool.getConnection();
    await conn.beginTransaction();
    inTransaction = true;

    // Bloqueo exclusivo FOR UPDATE sobre el ítem y levantamiento para proteger contra concurrencia
    const [itemRows] = await conn.query(
      `SELECT i.*, l.estado as lev_estado, l.campamento_id
       FROM inv_levantamiento_items i
       JOIN inv_levantamientos l ON i.levantamiento_id = l.id
       WHERE i.id = ? AND i.levantamiento_id = ? FOR UPDATE`,
      [itemId, levId]
    );

    if (itemRows.length === 0) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(404).json({ success: false, message: 'Artículo no encontrado en este levantamiento.' });
    }
    const currentItem = itemRows[0];

    const scope = await getUserAllowedCampamentos(conn, req.user);
    if (!scope.isGlobal && !scope.campamentoIds.includes(currentItem.campamento_id)) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: El levantamiento pertenece a una sede o campamento no autorizado.'
      });
    }

    // SEC-08 / SEC-10: Bloqueo de edición si el levantamiento está finalizado/cancelado o el ítem ya fue consolidado
    if (currentItem.lev_estado === 'Finalizado' || currentItem.lev_estado === 'Cancelado') {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(409).json({
        success: false,
        message: currentItem.lev_estado === 'Cancelado'
          ? 'No se pueden editar artículos de una auditoría Cancelada.'
          : 'No se pueden editar artículos de una auditoría Finalizada.'
      });
    }

    if (currentItem.consolidado === 1) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(409).json({
        success: false,
        message: 'No se puede modificar un artículo que ya ha sido consolidado en el inventario maestro.'
      });
    }

    let cantNum = null;
    if (cantidad !== undefined && cantidad !== null) {
      cantNum = Number(cantidad);
      if (isNaN(cantNum) || cantNum <= 0) {
        inTransaction = false;
        await safeRollback(conn);
        return res.status(400).json({ success: false, message: 'La cantidad debe ser mayor a cero.' });
      }
      if (Number(cantNum.toFixed(2)) !== cantNum) {
        inTransaction = false;
        await safeRollback(conn);
        return res.status(400).json({ success: false, message: 'La cantidad no puede tener más de 2 cifras decimales.' });
      }
    }

    let areaNorm = null;
    if (area !== undefined && area !== null && String(area).trim() !== '') {
      areaNorm = String(area).trim().toUpperCase();
      if (!VALID_INVENTARIO_AREAS.includes(areaNorm)) {
        inTransaction = false;
        await safeRollback(conn);
        return res.status(400).json({
          success: false,
          message: `Área inválida. Valores permitidos: ${VALID_INVENTARIO_AREAS.join(', ')}.`
        });
      }
    }

    if (articulo_nombre !== undefined && (typeof articulo_nombre !== 'string' || !articulo_nombre.trim())) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(400).json({ success: false, message: 'La descripción del artículo no puede estar vacía.' });
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
        codigo_original !== undefined ? asNonEmptyString(codigo_original) : null,
        areaNorm,
        categoria !== undefined ? asNonEmptyString(categoria) : null,
        articulo_nombre !== undefined ? articulo_nombre.trim() : null,
        marca !== undefined ? asNonEmptyString(marca) : null,
        modelo_caracteristicas !== undefined ? asNonEmptyString(modelo_caracteristicas) : null,
        serie_imei !== undefined ? asNonEmptyString(serie_imei) : null,
        cantNum,
        unidad_medida !== undefined ? asNonEmptyString(unidad_medida) : null,
        estadoNorm,
        propietario !== undefined ? asNonEmptyString(propietario) : null,
        responsable_custodio !== undefined ? asNonEmptyString(responsable_custodio) : null,
        ubicacion_exacta !== undefined ? asNonEmptyString(ubicacion_exacta) : null,
        observaciones !== undefined ? asNonEmptyString(observaciones) : null,
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
    inTransaction = false;

    res.json({ success: true, message: 'Artículo actualizado correctamente.' });
  } catch (error) {
    if (conn && inTransaction) {
      await safeRollback(conn);
    }
    console.error('Update levantamiento item error:', error);
    const status = isDbUnavailableError(error, conn) ? 503 : 500;
    res.status(status).json({
      success: false,
      message: status === 503
        ? 'Base de datos temporalmente no disponible. Intente nuevamente.'
        : 'Error actualizando artículo.'
    });
  } finally {
    safeRelease(conn);
  }
});

router.delete('/levantamientos/:id/items/:itemId', requireAuth, requirePermission('lev:editar'), async (req, res) => {
  const pool = getPool();
  let conn = null;
  let inTransaction = false;
  try {
    const levId = parsePositiveInt(req.params.id);
    const itemId = parsePositiveInt(req.params.itemId);
    if (!levId || !itemId) {
      return res.status(400).json({ success: false, message: 'ID de levantamiento o artículo inválido.' });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();
    inTransaction = true;

    // Bloqueo exclusivo FOR UPDATE sobre el ítem y levantamiento
    const [itemRows] = await conn.query(
      `SELECT i.*, l.estado as lev_estado, l.campamento_id
       FROM inv_levantamiento_items i
       JOIN inv_levantamientos l ON i.levantamiento_id = l.id
       WHERE i.id = ? AND i.levantamiento_id = ? FOR UPDATE`,
      [itemId, levId]
    );

    if (itemRows.length === 0) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(404).json({ success: false, message: 'Artículo no encontrado en este levantamiento.' });
    }
    const currentItem = itemRows[0];

    const scope = await getUserAllowedCampamentos(conn, req.user);
    if (!scope.isGlobal && !scope.campamentoIds.includes(currentItem.campamento_id)) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: El levantamiento pertenece a una sede o campamento no autorizado.'
      });
    }

    if (currentItem.lev_estado === 'Finalizado' || currentItem.lev_estado === 'Cancelado') {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(409).json({
        success: false,
        message: currentItem.lev_estado === 'Cancelado'
          ? 'No se pueden eliminar artículos de una auditoría Cancelada.'
          : 'No se pueden eliminar artículos de una auditoría Finalizada.'
      });
    }

    if (currentItem.consolidado === 1) {
      inTransaction = false;
      await safeRollback(conn);
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
    inTransaction = false;

    res.json({ success: true, message: 'Artículo eliminado de la sesión de levantamiento.' });
  } catch (error) {
    if (conn && inTransaction) {
      await safeRollback(conn);
    }
    console.error('Delete levantamiento item error:', error);
    const status = isDbUnavailableError(error, conn) ? 503 : 500;
    res.status(status).json({
      success: false,
      message: status === 503
        ? 'Base de datos temporalmente no disponible. Intente nuevamente.'
        : 'Error eliminando artículo.'
    });
  } finally {
    safeRelease(conn);
  }
});

// Import Items via Excel into Levantamiento
router.post('/levantamientos/:id/import-items', requireAuth, requirePermission('lev:importar'), async (req, res) => {
  const pool = getPool();
  let conn = null;
  let inTransaction = false;
  try {
    const levId = parsePositiveInt(req.params.id);
    if (!levId) {
      return res.status(400).json({ success: false, message: 'ID de levantamiento inválido.' });
    }
    const { items = [] } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'No se recibieron artículos para importar.' });
    }
    if (items.length > 5000) {
      return res.status(400).json({
        success: false,
        message: 'El lote de importación excede el límite de seguridad de 5,000 artículos.'
      });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();
    inTransaction = true;

    const [levRows] = await conn.query('SELECT id, estado, campamento_id, es_sintetico FROM inv_levantamientos WHERE id = ? FOR UPDATE', [levId]);
    if (levRows.length === 0) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(404).json({ success: false, message: 'Levantamiento no encontrado.' });
    }

    const scope = await getUserAllowedCampamentos(conn, req.user);
    if (!scope.isGlobal && !scope.campamentoIds.includes(levRows[0].campamento_id)) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: No tiene autorización para importar artículos a este campamento.'
      });
    }

    if (levRows[0].estado === 'Finalizado' || levRows[0].estado === 'Cancelado') {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(409).json({
        success: false,
        message: levRows[0].estado === 'Cancelado'
          ? 'No se pueden importar artículos a una auditoría Cancelada.'
          : 'No se pueden importar artículos a una auditoría Finalizada.'
      });
    }

    const isSyntLev = Number(levRows[0].es_sintetico) === 1 ? 1 : 0;
    const validRows = [];
    const validationErrors = [];
    const warnings = [];
    const seenBatchSerials = new Map();

    items.forEach((rawItem, idx) => {
      const rowNum = idx + 1;
      if (!rawItem || typeof rawItem !== 'object') {
        validationErrors.push(`Fila #${rowNum}: formato inválido.`);
        return;
      }
      const nombre = typeof rawItem.articulo_nombre === 'string' ? rawItem.articulo_nombre.trim() : '';
      if (!nombre) return; // Ignorar filas vacías sin descripción

      let cant;
      if (rawItem.cantidad === undefined || rawItem.cantidad === null || String(rawItem.cantidad).trim() === '') {
        cant = 1;
      } else {
        const num = Number(String(rawItem.cantidad).replace(',', '.').trim());
        if (!Number.isFinite(num) || num <= 0) {
          validationErrors.push(`Fila #${rowNum} ("${nombre}"): la cantidad "${rawItem.cantidad}" no es válida o es menor/igual a cero.`);
          return;
        }
        if (Number(num.toFixed(2)) !== num) {
          validationErrors.push(`Fila #${rowNum} ("${nombre}"): la cantidad supera los 2 decimales permitidos.`);
          return;
        }
        cant = num;
      }

      const rawArea = typeof rawItem.area === 'string' && rawItem.area.trim() !== ''
        ? rawItem.area.trim().toUpperCase()
        : 'ALMACEN';
      if (!VALID_INVENTARIO_AREAS.includes(rawArea)) {
        validationErrors.push(`Fila #${rowNum} ("${nombre}"): área "${rawItem.area}" no reconocida.`);
        return;
      }

      const cleanSerie = rawItem.serie_imei ? String(rawItem.serie_imei).trim() : null;
      const serKey = normalizeSerialKey(cleanSerie);
      if (serKey) {
        if (seenBatchSerials.has(serKey)) {
          warnings.push(`Serial repetido en el lote Excel (${cleanSerie}) en fila #${rowNum} (visto previamente en fila #${seenBatchSerials.get(serKey)}).`);
        } else {
          seenBatchSerials.set(serKey, rowNum);
        }
      }

      validRows.push([
        levId,
        asNonEmptyString(rawItem.codigo_original),
        rawArea,
        asNonEmptyString(rawItem.categoria) || 'General',
        nombre,
        asNonEmptyString(rawItem.marca),
        asNonEmptyString(rawItem.modelo_caracteristicas),
        cleanSerie,
        cant,
        asNonEmptyString(rawItem.unidad_medida) || 'Unidad',
        normalizeEstadoFisico(rawItem.estado_fisico),
        asNonEmptyString(rawItem.propietario) || 'INGMELEC',
        asNonEmptyString(rawItem.responsable_custodio),
        asNonEmptyString(rawItem.ubicacion_exacta),
        asNonEmptyString(rawItem.observaciones),
        isSyntLev,
        req.user.id
      ]);
    });

    if (validationErrors.length > 0) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(400).json({
        success: false,
        message: `Se detectaron ${validationErrors.length} fila(s) con datos inválidos durante la importación. Corrija el archivo antes de continuar.`,
        errores: validationErrors.slice(0, 20)
      });
    }

    if (validRows.length === 0) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(400).json({ success: false, message: 'No se encontraron filas válidas con descripción de artículo para importar.' });
    }

    // Detectar colisiones de serial contra la sesión actual y el maestro activo (solo alerta informativa)
    const batchSerialKeys = Array.from(seenBatchSerials.keys());
    if (batchSerialKeys.length > 0) {
      const [existingSessionRows] = await conn.query(
        'SELECT serie_imei FROM inv_levantamiento_items WHERE levantamiento_id = ? AND UPPER(TRIM(serie_imei)) IN (?)',
        [levId, batchSerialKeys]
      );
      existingSessionRows.forEach(r => warnings.push(`Serial "${r.serie_imei}" ya estaba registrado en esta sesión de levantamiento.`));

      const [existingMasterRows] = await conn.query(
        'SELECT serie_imei, ubicacion_nombre FROM inv_articulos WHERE activo = 1 AND UPPER(TRIM(serie_imei)) IN (?)',
        [batchSerialKeys]
      );
      existingMasterRows.forEach(r => warnings.push(`Serial "${r.serie_imei}" ya existe en el maestro activo (${r.ubicacion_nombre}).`));
    }

    // Bulk INSERT por lotes (sin N+1 consultas individuales)
    const CHUNK_SIZE = 500;
    for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
      const chunk = validRows.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const flatParams = chunk.flat();
      await conn.query(
        `INSERT INTO inv_levantamiento_items (
          levantamiento_id, codigo_original, area, categoria, articulo_nombre,
          marca, modelo_caracteristicas, serie_imei, cantidad, unidad_medida,
          estado_fisico, propietario, responsable_custodio, ubicacion_exacta,
          observaciones, es_sintetico, creado_por
        ) VALUES ${placeholders}`,
        flatParams
      );
    }

    const insertados = validRows.length;

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
        total_importados: insertados,
        warnings_count: warnings.length
      },
      req
    });

    await conn.commit();
    inTransaction = false;

    res.json({
      success: true,
      message: `${insertados} artículos importados con éxito a la sesión de levantamiento.`,
      insertados,
      warnings
    });
  } catch (error) {
    if (conn && inTransaction) {
      await safeRollback(conn);
    }
    console.error('Import items error:', error);
    const status = isDbUnavailableError(error, conn) ? 503 : 500;
    res.status(status).json({
      success: false,
      message: status === 503
        ? 'Base de datos temporalmente no disponible. Intente nuevamente.'
        : 'Error importando artículos desde Excel.'
    });
  } finally {
    safeRelease(conn);
  }
});

// ==========================================
// 11. CONSOLIDACIÓN AL INVENTARIO MAESTRO (APROBACIÓN FINAL)
// ==========================================

router.post('/levantamientos/:id/consolidar', requireAuth, requirePermission('lev:consolidar'), async (req, res) => {
  const pool = getPool();
  let conn = null;
  let inTransaction = false;
  try {
    const levId = parsePositiveInt(req.params.id);
    if (!levId) {
      return res.status(400).json({ success: false, message: 'ID de levantamiento inválido.' });
    }
    const {
      resolucion_duplicados,
      autorizar_reubicacion = false,
      autorizar_cambio_custodio = false,
      autorizar_cambio_estado = false
    } = req.body || {};

    conn = await pool.getConnection();
    await conn.beginTransaction();
    inTransaction = true;

    // 1. Get Levantamiento Info
    const [levRows] = await conn.query(`
      SELECT l.*, c.nombre as campamento_nombre
       FROM inv_levantamientos l
      JOIN inv_campamentos c ON l.campamento_id = c.id
      WHERE l.id = ? FOR UPDATE
    `, [levId]);

    if (levRows.length === 0) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(404).json({ success: false, message: 'Levantamiento no encontrado.' });
    }
    const lev = levRows[0];

    const scope = await getUserAllowedCampamentos(conn, req.user);
    if (!scope.isGlobal && !scope.campamentoIds.includes(lev.campamento_id)) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: No tiene autorización para consolidar levantamientos de este campamento.'
      });
    }

    if (lev.estado === 'Finalizado' || lev.estado === 'Cancelado') {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(409).json({
        success: false,
        message: lev.estado === 'Cancelado'
          ? 'No se puede consolidar un levantamiento Cancelado.'
          : 'Este levantamiento ya fue consolidado y finalizado previamente.'
      });
    }

    // 2. Get all non-consolidated items in this session
    const [items] = await conn.query(
      'SELECT * FROM inv_levantamiento_items WHERE levantamiento_id = ? AND consolidado = 0 FOR UPDATE',
      [levId]
    );

    if (items.length === 0) {
      inTransaction = false;
      await safeRollback(conn);
      return res.status(400).json({ success: false, message: 'No hay artículos pendientes de consolidar en esta sesión.' });
    }

    // SEC-09 / QA-03 / C04: RECONCILIACIÓN SEGURA DE DUPLICADOS (MAESTRO + INTRA-LOTE)
    const sessionSerialGroups = new Map();
    for (const it of items) {
      const sk = normalizeSerialKey(it.serie_imei);
      if (!sk) continue;
      if (!sessionSerialGroups.has(sk)) {
        sessionSerialGroups.set(sk, []);
      }
      sessionSerialGroups.get(sk).push(it);
    }

    const serialKeys = Array.from(sessionSerialGroups.keys());
    const duplicadosLote = [];
    for (const [sk, group] of sessionSerialGroups.entries()) {
      if (group.length > 1) {
        duplicadosLote.push({
          serie_imei: group[0].serie_imei,
          serie_normalizada: sk,
          cantidad_en_lote: group.length,
          items_ids: group.map(g => g.id),
          articulos: group.map(g => g.articulo_nombre)
        });
      }
    }

    const dupMap = new Map();
    let duplicadosExistentes = [];

    if (serialKeys.length > 0) {
      const [rowsMasterDup] = await conn.query(
        `SELECT id, codigo_original, articulo_nombre, serie_imei, campamento_id, almacen_id,
                ubicacion_nombre, zona_estante, asignado_a, estado_fisico,
                cantidad_num, cantidad_verificada, unidad_medida, es_sintetico
         FROM inv_articulos
         WHERE activo = 1 AND UPPER(TRIM(serie_imei)) IN (?) FOR UPDATE`,
        [serialKeys]
      );
      duplicadosExistentes = rowsMasterDup;

      duplicadosExistentes.forEach(d => {
        const sk = normalizeSerialKey(d.serie_imei);
        if (sk) dupMap.set(sk, d);
      });
    }

    if ((dupMap.size > 0 || duplicadosLote.length > 0) &&
        resolucion_duplicados !== 'VINCULAR_EXISTENTE' &&
        resolucion_duplicados !== 'OMITIR_DUPLICADOS') {
      inTransaction = false;
      await safeRollback(conn);

      const combinedDuplicados = [
        ...duplicadosExistentes.map(d => ({
          origen: 'MAESTRO',
          id: d.id,
          codigo_original: d.codigo_original,
          articulo_nombre: d.articulo_nombre,
          serie_imei: d.serie_imei,
          ubicacion_actual: d.ubicacion_nombre,
          custodio_actual: d.asignado_a,
          estado_actual: d.estado_fisico
        })),
        ...duplicadosLote
          .filter(dl => !dupMap.has(dl.serie_normalizada))
          .map(dl => ({
            origen: 'LOTE_SESION',
            id: dl.items_ids[0],
            codigo_original: null,
            articulo_nombre: `${dl.articulos[0]} (repetido ${dl.cantidad_en_lote} veces en sesión)`,
            serie_imei: dl.serie_imei,
            ubicacion_actual: lev.campamento_nombre,
            custodio_actual: null,
            estado_actual: 'Duplicado en sesión'
          }))
      ];

      return res.status(409).json({
        success: false,
        bloqueado_por_duplicados: true,
        message: `Se detectaron ${combinedDuplicados.length} conflicto(s) de serial/IMEI (en inventario maestro y/o duplicados dentro del mismo lote). Debe seleccionar 'VINCULAR_EXISTENTE' u 'OMITIR_DUPLICADOS'.`,
        duplicados: combinedDuplicados,
        duplicados_lote: duplicadosLote
      });
    }

    const schemaCaps = await getSchemaCapabilities(conn);
    const isSyntLev = Number(lev.es_sintetico) === 1 ? 1 : 0;
    const estadoVincNuevo = lev.campamento_id ? 'CONFIRMADO' : 'SIN_SEDE';
    let nuevosMaestro = 0;
    let vinculadosConciliados = 0;
    let omitidosDuplicados = 0;
    const campUbicacion = lev.campamento_nombre;

    for (const it of items) {
      const estadoFisicoNormalizado = normalizeEstadoFisico(it.estado_fisico);
      const serialKey = normalizeSerialKey(it.serie_imei);
      const masterExistente = serialKey && dupMap.has(serialKey) ? dupMap.get(serialKey) : null;

      if (masterExistente) {
        if (resolucion_duplicados === 'VINCULAR_EXISTENTE') {
          // REGLA FUNDAMENTAL DE INTEGRIDAD: NUNCA INSERTAR UN SEGUNDO ACTIVO CON EL MISMO SERIAL
          const masterId = masterExistente.id;

          const nuevoCampamentoId = autorizar_reubicacion ? lev.campamento_id : (masterExistente.campamento_id ?? null);
          const nuevoAlmacenId = autorizar_reubicacion ? (lev.almacen_id ?? masterExistente.almacen_id ?? null) : (masterExistente.almacen_id ?? null);
          const nuevaUbicacion = autorizar_reubicacion ? campUbicacion : (masterExistente.ubicacion_nombre ?? campUbicacion);
          const nuevaZona = autorizar_reubicacion ? (it.ubicacion_exacta || masterExistente.zona_estante || null) : (masterExistente.zona_estante ?? null);
          const nuevoEstadoVinc = nuevoCampamentoId ? 'CONFIRMADO' : 'SIN_SEDE';
          const nuevoCustodio = autorizar_cambio_custodio ? (it.responsable_custodio || masterExistente.asignado_a || null) : (masterExistente.asignado_a ?? null);
          const nuevoEstado = autorizar_cambio_estado ? estadoFisicoNormalizado : (masterExistente.estado_fisico || 'Bueno');

          await conn.query(`
            UPDATE inv_articulos SET
              campamento_id = ?,
              almacen_id = ?,
              estado_vinculacion_sede = ?,
              ubicacion_nombre = ?,
              zona_estante = ?,
              asignado_a = ?,
              estado_fisico = ?,
              fecha_revision = COALESCE(?, NOW()),
              observaciones = CONCAT(COALESCE(observaciones, ''), '\n[Conciliado en levantamiento ', ?, ']')
            WHERE id = ?
          `, [
            nuevoCampamentoId,
            nuevoAlmacenId,
            nuevoEstadoVinc,
            nuevaUbicacion,
            nuevaZona,
            nuevoCustodio,
            nuevoEstado,
            it.fecha_revision || null,
            lev.codigo_levantamiento,
            masterId
          ]);

          await conn.query(
            'UPDATE inv_levantamiento_items SET consolidado = 1, articulo_maestro_id = ? WHERE id = ?',
            [masterId, it.id]
          );

          const tipoMov = (autorizar_reubicacion && masterExistente.ubicacion_nombre !== nuevaUbicacion)
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
              motivo, observaciones, usuario_id, es_sintetico
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            masterId,
            tipoMov,
            Number(it.cantidad || 1),
            it.unidad_medida || masterExistente.unidad_medida || 'Unidad',
            masterExistente.ubicacion_nombre ?? null,
            nuevaUbicacion,
            masterExistente.asignado_a ?? null,
            nuevoCustodio,
            masterExistente.estado_fisico || 'Bueno',
            nuevoEstado,
            motivoTexto,
            `Sesión de auditoría: ${lev.codigo_levantamiento} (${lev.titulo}) - Serial conciliado: ${it.serie_imei}`,
            req.user.id,
            Number(masterExistente.es_sintetico ?? isSyntLev) === 1 ? 1 : 0
          ]);

          // Actualizar snapshot en dupMap en caso de otra aparición en el mismo lote
          masterExistente.campamento_id = nuevoCampamentoId;
          masterExistente.almacen_id = nuevoAlmacenId;
          masterExistente.ubicacion_nombre = nuevaUbicacion;
          masterExistente.zona_estante = nuevaZona;
          masterExistente.asignado_a = nuevoCustodio;
          masterExistente.estado_fisico = nuevoEstado;

          vinculadosConciliados++;
          continue;
        } else if (resolucion_duplicados === 'OMITIR_DUPLICADOS') {
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

      // ÍTEM NUEVO (SIN COLISIÓN DE SERIAL): Verificar/generar código único y crear activo maestro
      let finalItemCode = typeof it.codigo_original === 'string' && it.codigo_original.trim() !== ''
        ? it.codigo_original.trim()
        : null;

      if (finalItemCode) {
        const [dupCodeMaster] = await conn.query(
          'SELECT id, articulo_nombre FROM inv_articulos WHERE activo = 1 AND UPPER(TRIM(codigo_original)) = ? LIMIT 1 FOR UPDATE',
          [finalItemCode.toUpperCase()]
        );
        if (dupCodeMaster.length > 0) {
          inTransaction = false;
          await safeRollback(conn);
          return res.status(409).json({
            success: false,
            message: `No se pudo consolidar "${it.articulo_nombre}": el código "${finalItemCode}" ya pertenece a "${dupCodeMaster[0].articulo_nombre}" (#${dupCodeMaster[0].id}).`
          });
        }
      } else {
        const autoGen = await generateNextCodeForArea(conn, it.area, { forUpdate: true });
        finalItemCode = autoGen.nextCode;
      }

      const normArea = VALID_INVENTARIO_AREAS.includes(String(it.area || '').toUpperCase())
        ? String(it.area).toUpperCase()
        : 'ALMACEN';
      const brandVal = it.marca
        ? (it.modelo_caracteristicas ? `${it.marca} ${it.modelo_caracteristicas}` : it.marca)
        : (it.modelo_caracteristicas || null);
      const itemCant = Number(it.cantidad || 1);

      const [insMaster] = await conn.query(
        `INSERT INTO inv_articulos (
          codigo_original, area, categoria, articulo_nombre, ${schemaCaps.articulos.brandCol},
          ${schemaCaps.articulos.specCol}, serie_imei, propietario, asignado_a,
          cantidad_num, cantidad_texto, cantidad_verificada, estado_cantidad, unidad_medida,
          estado_fisico, ubicacion_nombre, zona_estante, fecha_revision,
          observaciones, evidencia_foto, activo, hoja_origen, fila_origen, creado_por,
          campamento_id, almacen_id, es_sintetico, origen_datos, estado_vinculacion_sede
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'VERIFICADO', ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?, ?, ?, ?, ?, ?)`,
        [
          finalItemCode,
          normArea,
          it.categoria || 'General',
          it.articulo_nombre,
          brandVal,
          it.modelo_caracteristicas || null,
          it.serie_imei ? String(it.serie_imei).trim() : null,
          it.propietario || 'INGMELEC',
          it.responsable_custodio || null,
          itemCant,
          String(itemCant),
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
          lev.almacen_id || null,
          isSyntLev,
          isSyntLev ? 'SINTETICO_PRUEBA' : 'OPERATIVO_REAL',
          estadoVincNuevo
        ]
      );

      const masterId = insMaster.insertId;

      // Registrar en dupMap inmediatamente para deduplicar intra-lote (C04)
      if (serialKey) {
        dupMap.set(serialKey, {
          id: masterId,
          codigo_original: finalItemCode,
          articulo_nombre: it.articulo_nombre,
          serie_imei: it.serie_imei,
          campamento_id: lev.campamento_id || null,
          almacen_id: lev.almacen_id || null,
          ubicacion_nombre: campUbicacion,
          zona_estante: it.ubicacion_exacta || null,
          asignado_a: it.responsable_custodio || null,
          estado_fisico: estadoFisicoNormalizado,
          cantidad_num: itemCant,
          cantidad_verificada: 1,
          unidad_medida: it.unidad_medida || 'Unidad',
          es_sintetico: isSyntLev
        });
      }

      await conn.query(
        'UPDATE inv_levantamiento_items SET consolidado = 1, articulo_maestro_id = ? WHERE id = ?',
        [masterId, it.id]
      );

      await conn.query(
        `INSERT INTO inv_movimientos (
          articulo_id, tipo_movimiento, cantidad, unidad_medida,
          ubicacion_destino, custodio_destino, estado_nuevo, motivo, observaciones, usuario_id, es_sintetico
        ) VALUES (?, 'ENTRADA', ?, ?, ?, ?, ?, 'Incorporación por Levantamiento en Campo', ?, ?, ?)`,
        [
          masterId,
          itemCant,
          it.unidad_medida || 'Unidad',
          campUbicacion,
          it.responsable_custodio || null,
          estadoFisicoNormalizado,
          `Sesión de auditoría: ${lev.codigo_levantamiento} (${lev.titulo})`,
          req.user.id,
          isSyntLev
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
    inTransaction = false;

    res.json({
      success: true,
      message: `Levantamiento consolidado exitosamente. ${nuevosMaestro} artículos nuevos incorporados, ${vinculadosConciliados} activos preexistentes vinculados/reubicados, ${omitidosDuplicados} omitidos.`,
      articulos_incorporados: nuevosMaestro,
      articulos_vinculados: vinculadosConciliados,
      articulos_omitidos: omitidosDuplicados
    });
  } catch (error) {
    if (conn && inTransaction) {
      await safeRollback(conn);
    }
    console.error('Consolidation error:', error);
    const status = isDbUnavailableError(error, conn) ? 503 : 500;
    res.status(status).json({
      success: false,
      message: status === 503
        ? 'Base de datos temporalmente no disponible. Intente nuevamente.'
        : 'Error consolidando levantamiento al inventario maestro.'
    });
  } finally {
    safeRelease(conn);
  }
});

// v2.2: utilidades internas reutilizadas por el módulo Actas (sin cambiar su comportamiento).
export {
  requireAuth,
  requirePermission,
  requireAnyPermission,
  getUserAllowedCampamentos,
  canTargetCampamento,
  logAudit,
  safeRollback,
  parsePositiveInt
};

export default router;
