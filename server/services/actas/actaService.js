// INGMELEC v2.2 — Servicio transaccional de Actas de Entrega y Asignación de Herramientas.
// Todas las escrituras de una entrega (acta, ítems, movimientos SALIDA, stock, secuencia y
// auditoría) ocurren en UNA sola transacción MySQL. No toca POST /movimientos.
import {
  validarPayloadActa,
  validarItemContraArticulo,
  ordenarItemsParaBloqueo,
  validarMotivoAnulacion,
  tieneSerieReal,
  formatNumeroActa,
  puedeTransicionar
} from './actaRules.js';

export class ActaError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const trimOrNull = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

// ---------------------------------------------------------------------------
// Departamentos: NO existe catálogo formal. Se reutilizan los valores ya registrados en
// inv_custodios.departamento (sin crear registros ni migraciones), normalizados y sin duplicados.
// ---------------------------------------------------------------------------
const normDepto = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

export async function listarDepartamentos(db) {
  const [rows] = await db.query(
    `SELECT departamento FROM inv_custodios
     WHERE activo = 1 AND departamento IS NOT NULL AND TRIM(departamento) <> ''
     ORDER BY departamento ASC`
  );
  // Una clave por departamento (sin distinguir mayúsculas/espacios). Nombre canónico: la variante más
  // frecuente; en empate, la de "Formato Título" (mixta) antes que TODO MAYÚSCULAS o todo minúsculas.
  const variantes = new Map();
  for (const r of rows) {
    const nombre = String(r.departamento).trim().replace(/\s+/g, ' ');
    const clave = normDepto(nombre);
    if (!variantes.has(clave)) variantes.set(clave, new Map());
    variantes.get(clave).set(nombre, (variantes.get(clave).get(nombre) || 0) + 1);
  }
  const mixta = (s) => s !== s.toUpperCase() && s !== s.toLowerCase();
  const canonicos = [...variantes.values()].map((m) => [...m.entries()]
    .sort((a, b) => (b[1] - a[1]) || (Number(mixta(b[0])) - Number(mixta(a[0]))) || (a[0] < b[0] ? -1 : 1))[0][0]);
  return canonicos.sort((a, b) => a.localeCompare(b, 'es'));
}

export async function obtenerOpcionesActa(pool, scope, user) {
  let campamentos = [];
  if (scope.isGlobal || scope.campamentoIds.length > 0) {
    const filtro = scope.isGlobal ? '' : ' AND id IN (?)';
    const params = scope.isGlobal ? [] : [scope.campamentoIds];
    try {
      [campamentos] = await pool.query(
        `SELECT id, nombre, codigo FROM inv_campamentos WHERE activo = 1 AND COALESCE(es_sintetico, 0) = 0${filtro} ORDER BY nombre ASC`, params);
    } catch (err) {
      if (err?.code !== 'ER_BAD_FIELD_ERROR') throw err; // base sin es_sintetico
      [campamentos] = await pool.query(`SELECT id, nombre, codigo FROM inv_campamentos WHERE activo = 1${filtro} ORDER BY nombre ASC`, params);
    }
  }
  const departamentos = await listarDepartamentos(pool);
  const claves = new Set(departamentos.map(normDepto));
  const [custodios] = await pool.query(
    `SELECT nombre, departamento FROM inv_custodios WHERE activo = 1 AND departamento IS NOT NULL AND TRIM(departamento) <> '' ORDER BY nombre ASC LIMIT 3000`
  );
  const colaboradores = custodios.map((c) => ({ nombre: c.nombre, departamento: departamentos.find((d) => normDepto(d) === normDepto(c.departamento)) || null }));
  // Sugerencia: departamento del custodio que coincide con el nombre del usuario (solo si existe).
  const propio = custodios.find((c) => normDepto(c.nombre) === normDepto(user?.nombre));
  const sugerido = propio && claves.has(normDepto(propio.departamento)) ? departamentos.find((d) => normDepto(d) === normDepto(propio.departamento)) : null;
  return {
    campamentos: campamentos.map((c) => ({ id: c.id, nombre: c.nombre, codigo: c.codigo })),
    campamento_bloqueado: campamentos.length === 1,
    departamentos,
    departamento_sugerido: sugerido,
    colaboradores
  };
}

async function resolverPersona(conn, id, nombre, etiqueta) {
  const personaId = Number(id);
  if (!Number.isInteger(personaId) || personaId <= 0) return { id: null, nombre: nombre.trim() };
  const [rows] = await conn.query('SELECT id, nombre FROM inv_custodios WHERE id = ? LIMIT 1', [personaId]);
  if (rows.length === 0) throw new ActaError(400, `${etiqueta} seleccionado no existe en el catálogo.`);
  return { id: rows[0].id, nombre: nombre.trim() };
}

/**
 * Crea y confirma un acta en una sola transacción.
 * deps: { pool, canTargetCampamento, logAudit, scope, user, req }
 */
export async function crearActa(deps, payload) {
  const { pool, scope, user, req, canTargetCampamento, logAudit } = deps;
  const val = validarPayloadActa(payload);
  if (!val.ok) throw new ActaError(400, val.errores[0], { errores: val.errores });

  const campId = Number(payload.campamento_id);
  if (!scope.isGlobal && !canTargetCampamento(scope, campId, null)) {
    throw new ActaError(403, 'Acceso denegado: no tiene autorización para emitir actas en ese campamento.');
  }

  const conn = await pool.getConnection();
  let enTx = false;
  try {
    // Idempotencia: el mismo request_uuid del mismo usuario devuelve el acta ya creada.
    const [prev] = await conn.query('SELECT id, numero_acta, creado_por_id FROM inv_actas_entrega WHERE request_uuid = ?', [payload.request_uuid]);
    if (prev.length > 0) {
      if (Number(prev[0].creado_por_id) !== Number(user.id)) throw new ActaError(409, 'request_uuid ya utilizado.');
      return { id: prev[0].id, numero_acta: prev[0].numero_acta, duplicada: true };
    }

    await conn.beginTransaction();
    enTx = true;

    const [campRows] = await conn.query('SELECT id, nombre FROM inv_campamentos WHERE id = ? AND activo = 1', [campId]);
    if (campRows.length === 0) throw new ActaError(400, 'El campamento seleccionado no existe o está inactivo.');
    const camp = campRows[0];

    // El departamento debe pertenecer al catálogo (valores ya registrados); se guarda el nombre canónico.
    let departamento = null;
    if (trimOrNull(payload.departamento)) {
      const catalogo = await listarDepartamentos(conn);
      departamento = catalogo.find((d) => normDepto(d) === normDepto(payload.departamento)) || null;
      if (!departamento) throw new ActaError(400, 'El departamento seleccionado no pertenece al catálogo.');
    }

    const colaborador = await resolverPersona(conn, payload.colaborador_id, payload.colaborador_nombre, 'Colaborador');
    const supervisor = await resolverPersona(conn, payload.supervisor_id, payload.supervisor_nombre, 'Supervisor');

    // 1) Bloqueo de artículos en orden ascendente (evita interbloqueos) y validación de stock.
    const items = ordenarItemsParaBloqueo(payload.items);
    const articulos = new Map();
    for (const it of items) {
      const [rows] = await conn.query('SELECT * FROM inv_articulos WHERE id = ? AND activo = 1 FOR UPDATE', [Number(it.articulo_id)]);
      const art = rows[0];
      const err = validarItemContraArticulo({ cantidad: Number(it.cantidad) }, art, campId);
      if (err) throw new ActaError(err.status, `${art?.articulo_nombre || `Artículo ${it.articulo_id}`}: ${err.mensaje}`);
      articulos.set(Number(it.articulo_id), art);
    }

    // 2) Número consecutivo anual (fila de secuencia bloqueada).
    const anio = new Date().getFullYear();
    await conn.query('INSERT INTO inv_acta_secuencia (anio, ultimo) VALUES (?, 0) ON DUPLICATE KEY UPDATE anio = anio', [anio]);
    const [seq] = await conn.query('SELECT ultimo FROM inv_acta_secuencia WHERE anio = ? FOR UPDATE', [anio]);
    const consecutivo = Number(seq[0].ultimo) + 1;
    await conn.query('UPDATE inv_acta_secuencia SET ultimo = ? WHERE anio = ?', [consecutivo, anio]);
    const numero = formatNumeroActa(anio, consecutivo);

    // 3) Cabecera del acta (instantáneas inmutables).
    const motivo = payload.motivo.trim();
    const [actaRes] = await conn.query(
      `INSERT INTO inv_actas_entrega
        (numero_acta, anio, request_uuid, estado, campamento_id, campamento_nombre,
         colaborador_id, colaborador_nombre, departamento, supervisor_id, supervisor_nombre,
         entregado_por_id, entregado_por_nombre, motivo, observaciones, fecha_entrega, confirmado_en, creado_por_id)
       VALUES (?, ?, ?, 'CONFIRMADA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?)`,
      [numero, anio, payload.request_uuid, camp.id, camp.nombre,
        colaborador.id, colaborador.nombre, departamento, supervisor.id, supervisor.nombre,
        user.id, user.nombre || 'Usuario', motivo, trimOrNull(payload.observaciones), user.id]
    );
    const actaId = actaRes.insertId;

    // 4) Por ítem: stock, movimiento SALIDA vinculado al acta, ítem del acta y auditoría.
    for (const it of items) {
      const art = articulos.get(Number(it.articulo_id));
      const cant = Number(it.cantidad);
      const nuevo = Number((Number(art.cantidad_num) - cant).toFixed(2));
      await conn.query(
        'UPDATE inv_articulos SET cantidad_num = ?, cantidad_texto = ? WHERE id = ?',
        [nuevo, String(nuevo), art.id]
      );
      const [movRes] = await conn.query(
        `INSERT INTO inv_movimientos
          (articulo_id, tipo_movimiento, cantidad, unidad_medida, ubicacion_origen, ubicacion_destino,
           custodio_origen, custodio_destino, estado_previo, estado_nuevo, motivo, observaciones, usuario_id, es_sintetico, acta_id)
         VALUES (?, 'SALIDA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [art.id, cant, art.unidad_medida, art.ubicacion_nombre, art.ubicacion_nombre,
          art.asignado_a, colaborador.nombre, art.estado_fisico, art.estado_fisico,
          `Acta ${numero}: ${motivo}`.slice(0, 255), trimOrNull(payload.observaciones), user.id,
          Number(art.es_sintetico) === 1 ? 1 : 0, actaId]
      );
      await conn.query(
        `INSERT INTO inv_acta_items (acta_id, articulo_id, movimiento_id, codigo, descripcion, serie, unidad, ubicacion, cantidad)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [actaId, art.id, movRes.insertId, art.codigo_original || null, String(art.articulo_nombre).slice(0, 500),
          tieneSerieReal(art.serie_imei) ? String(art.serie_imei).trim() : null, art.unidad_medida || null, art.ubicacion_nombre || null, cant]
      );
    }

    await logAudit(conn, {
      usuario_id: user.id,
      usuario_nombre: user.nombre,
      accion: 'ACTA_CONFIRMADA',
      entidad: 'inv_actas_entrega',
      entidad_id: actaId,
      detalles_previos: null,
      detalles_nuevos: {
        numero_acta: numero,
        campamento_id: camp.id,
        colaborador: colaborador.nombre,
        supervisor: supervisor.nombre,
        items: items.map((i) => ({ articulo_id: Number(i.articulo_id), cantidad: Number(i.cantidad) }))
      },
      req
    });

    await conn.commit();
    enTx = false;
    return { id: actaId, numero_acta: numero, duplicada: false };
  } catch (err) {
    if (enTx) { try { await conn.rollback(); } catch { /* sin acción */ } }
    // Carrera por request_uuid duplicado entre dos peticiones simultáneas.
    if (err?.code === 'ER_DUP_ENTRY' && String(err.message).includes('uq_acta_request_uuid')) {
      throw new ActaError(409, 'Esta solicitud ya fue procesada.');
    }
    throw err;
  } finally {
    conn.release();
  }
}

export async function anularActa(deps, actaId, motivo) {
  const { pool, scope, user, req, canTargetCampamento, logAudit } = deps;
  const errMotivo = validarMotivoAnulacion(motivo);
  if (errMotivo) throw new ActaError(400, errMotivo);

  const conn = await pool.getConnection();
  let enTx = false;
  try {
    await conn.beginTransaction();
    enTx = true;
    const [rows] = await conn.query('SELECT * FROM inv_actas_entrega WHERE id = ? FOR UPDATE', [actaId]);
    if (rows.length === 0) throw new ActaError(404, 'Acta no encontrada.');
    const acta = rows[0];
    if (!scope.isGlobal && !canTargetCampamento(scope, acta.campamento_id, null)) {
      throw new ActaError(403, 'Acceso denegado: el acta pertenece a otro campamento.');
    }
    if (!puedeTransicionar(acta.estado, 'ANULADA')) {
      throw new ActaError(409, `Un acta en estado ${acta.estado} no puede anularse.`);
    }
    // Anulación DOCUMENTAL: no se toca stock, movimientos ni ítems.
    await conn.query(
      `UPDATE inv_actas_entrega
         SET estado = 'ANULADA', anulado_en = NOW(), anulado_por_id = ?, anulado_por_nombre = ?, motivo_anulacion = ?
       WHERE id = ? AND estado = 'CONFIRMADA'`,
      [user.id, user.nombre || 'Usuario', motivo.trim(), actaId]
    );
    await logAudit(conn, {
      usuario_id: user.id,
      usuario_nombre: user.nombre,
      accion: 'ACTA_ANULADA',
      entidad: 'inv_actas_entrega',
      entidad_id: actaId,
      detalles_previos: { numero_acta: acta.numero_acta, estado: acta.estado },
      detalles_nuevos: { estado: 'ANULADA', motivo_anulacion: motivo.trim(), stock_revertido: false },
      req
    });
    await conn.commit();
    enTx = false;
    return { id: actaId, numero_acta: acta.numero_acta };
  } catch (err) {
    if (enTx) { try { await conn.rollback(); } catch { /* sin acción */ } }
    throw err;
  } finally {
    conn.release();
  }
}

const SQL_ITEMS_RESUMEN = `
  SELECT acta_id, codigo, descripcion, serie, unidad, cantidad
  FROM inv_acta_items WHERE acta_id IN (?) ORDER BY id`;

export async function listarActas(pool, scope, query = {}) {
  const where = [];
  const params = [];
  if (!scope.isGlobal) {
    if (scope.campamentoIds.length === 0) return { actas: [], total: 0 };
    where.push('a.campamento_id IN (?)');
    params.push(scope.campamentoIds);
  }
  const campId = Number(query.campamento_id);
  if (Number.isInteger(campId) && campId > 0) { where.push('a.campamento_id = ?'); params.push(campId); }
  if (['CONFIRMADA', 'ANULADA'].includes(query.estado)) { where.push('a.estado = ?'); params.push(query.estado); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.desde || '')) { where.push('DATE(a.fecha_entrega) >= ?'); params.push(query.desde); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.hasta || '')) { where.push('DATE(a.fecha_entrega) <= ?'); params.push(query.hasta); }
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    where.push(`(a.numero_acta LIKE ? OR a.colaborador_nombre LIKE ? OR a.supervisor_nombre LIKE ? OR a.departamento LIKE ?
      OR a.entregado_por_nombre LIKE ? OR EXISTS (SELECT 1 FROM inv_acta_items i WHERE i.acta_id = a.id AND (i.descripcion LIKE ? OR i.codigo LIKE ? OR i.serie LIKE ?)))`);
    params.push(like, like, like, like, like, like, like, like);
  }
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const offset = Math.max(Number(query.offset) || 0, 0);
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM inv_actas_entrega a ${w}`, params);
  const [actas] = await pool.query(
    `SELECT a.id, a.numero_acta, a.estado, a.campamento_id, a.campamento_nombre, a.colaborador_nombre, a.departamento,
            a.supervisor_nombre, a.entregado_por_nombre, a.motivo, a.fecha_entrega, a.impresiones,
            a.anulado_en, a.anulado_por_nombre, a.motivo_anulacion
     FROM inv_actas_entrega a ${w} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  if (actas.length > 0) {
    const [items] = await pool.query(SQL_ITEMS_RESUMEN, [actas.map((a) => a.id)]);
    const byActa = new Map();
    for (const it of items) {
      if (!byActa.has(it.acta_id)) byActa.set(it.acta_id, []);
      byActa.get(it.acta_id).push(it);
    }
    for (const a of actas) a.items = byActa.get(a.id) || [];
  }
  return { actas, total: Number(total) };
}

export async function obtenerActa(pool, scope, actaId) {
  const [rows] = await pool.query('SELECT * FROM inv_actas_entrega WHERE id = ?', [actaId]);
  if (rows.length === 0) throw new ActaError(404, 'Acta no encontrada.');
  const acta = rows[0];
  if (!scope.isGlobal && !scope.campamentoIds.includes(Number(acta.campamento_id))) {
    throw new ActaError(403, 'Acceso denegado: el acta pertenece a otro campamento.');
  }
  const [items] = await pool.query(
    'SELECT id, articulo_id, codigo, descripcion, serie, unidad, ubicacion, cantidad FROM inv_acta_items WHERE acta_id = ? ORDER BY id',
    [actaId]
  );
  return { ...acta, items };
}
