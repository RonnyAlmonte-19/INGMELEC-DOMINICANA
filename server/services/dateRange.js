// INGMELEC v2.2 — Filtro de consulta por rango de fechas (solo lectura, parametrizado).
// Semántica: el "día" del usuario es el de la zona de la aplicación (APP_TIMEZONE_OFFSET,
// por defecto -04:00 = America/Santo_Domingo, sin horario de verano). Si la base guarda sus
// DATETIME en otra zona (p. ej. UTC), configure DB_TIME_OFFSET (+00:00). Sin configurar, se
// asume que la base guarda la hora local de la aplicación (sin conversión).
// Rango inclusivo: col >= desde 00:00 AND col < (hasta + 1 día) 00:00. Fechas NULL quedan fuera.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_YEAR = 1990;
const MAX_YEAR = 2100;

export function parseOffsetMinutes(value, fallbackMin) {
  if (value === undefined || value === null || String(value).trim() === '') return fallbackMin;
  const m = String(value).trim().match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!m) return fallbackMin;
  const min = Number(m[2]) * 60 + Number(m[3]);
  if (min > 14 * 60) return fallbackMin;
  return (m[1] === '-' ? -1 : 1) * min;
}

export function getOffsets(env = process.env) {
  const app = parseOffsetMinutes(env.APP_TIMEZONE_OFFSET, -240);
  const db = parseOffsetMinutes(env.DB_TIME_OFFSET, app);
  return { app, db };
}

function parseStrictDate(value) {
  const m = typeof value === 'string' ? value.trim().match(DATE_RE) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < MIN_YEAR || y > MAX_YEAR) return null;
  const ms = Date.UTC(y, mo - 1, d);
  const chk = new Date(ms);
  if (chk.getUTCFullYear() !== y || chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) return null;
  return { text: `${m[1]}-${m[2]}-${m[3]}`, ms };
}

const fmt = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

/**
 * Lee fecha_desde / fecha_hasta de la query.
 * Devuelve { active:false } | { error } | { active:true, desde, hasta, startDb, endDb }.
 */
export function parseDateRange(query = {}, env = process.env) {
  const rawDesde = query.fecha_desde;
  const rawHasta = query.fecha_hasta;
  const empty = (v) => v === undefined || v === null || String(v).trim() === '';
  if (empty(rawDesde) && empty(rawHasta)) return { active: false };
  if (Array.isArray(rawDesde) || Array.isArray(rawHasta)) return { error: 'Parámetros de fecha inválidos.' };

  const desde = empty(rawDesde) ? null : parseStrictDate(rawDesde);
  const hasta = empty(rawHasta) ? null : parseStrictDate(rawHasta);
  if (!empty(rawDesde) && !desde) return { error: 'La fecha "desde" no es válida (use AAAA-MM-DD).' };
  if (!empty(rawHasta) && !hasta) return { error: 'La fecha "hasta" no es válida (use AAAA-MM-DD).' };
  if (desde && hasta && desde.ms > hasta.ms) return { error: 'La fecha "desde" no puede ser posterior a "hasta".' };

  const { app, db } = getOffsets(env);
  const shift = (db - app) * 60000;
  return {
    active: true,
    desde: desde?.text ?? null,
    hasta: hasta?.text ?? null,
    startDb: desde ? fmt(desde.ms + shift) : null,
    endDb: hasta ? fmt(hasta.ms + 86400000 + shift) : null
  };
}

/** Condición para una columna DATETIME/TIMESTAMP (zona de la base). */
export function dateTimeCondition(column, range) {
  if (!range?.active) return null;
  const parts = [];
  const params = [];
  if (range.startDb) { parts.push(`${column} >= ?`); params.push(range.startDb); }
  if (range.endDb) { parts.push(`${column} < ?`); params.push(range.endDb); }
  return { sql: `(${parts.join(' AND ')})`, params };
}

/** Condición para una columna DATE (sin hora ni zona). */
export function dateOnlyCondition(column, range) {
  if (!range?.active) return null;
  const parts = [];
  const params = [];
  if (range.desde) { parts.push(`${column} >= ?`); params.push(range.desde); }
  if (range.hasta) { parts.push(`${column} <= ?`); params.push(range.hasta); }
  return { sql: `(${parts.join(' AND ')})`, params };
}

/** Aplica la condición a (conditions, params) y devuelve false si la query es inválida. */
export function applyDateRange(req, res, conditions, params, column, { dateOnly = false } = {}) {
  const range = parseDateRange(req.query);
  if (range.error) {
    res.status(400).json({ success: false, message: range.error });
    return false;
  }
  const cond = dateOnly ? dateOnlyCondition(column, range) : dateTimeCondition(column, range);
  if (cond) {
    conditions.push(cond.sql);
    params.push(...cond.params);
  }
  return true;
}
