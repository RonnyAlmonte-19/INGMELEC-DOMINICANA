// INGMELEC v2.2 — Reglas de negocio PURAS del módulo Actas de Entrega.
// Sin acceso a base de datos ni a Express: se prueban de forma aislada y las usará el
// servicio transaccional de la Fase B. Valores por defecto = recomendaciones D1-D15
// pendientes de confirmación del propietario (ver informe de especificación).

export const ESTADOS = Object.freeze({
  BORRADOR: 'BORRADOR',
  CONFIRMADA: 'CONFIRMADA',
  ANULADA: 'ANULADA',
  DESCARTADA: 'DESCARTADA'
});

// Transiciones autorizadas y permiso exigido para cada una.
const TRANSICIONES = Object.freeze({
  BORRADOR: Object.freeze({ CONFIRMADA: 'act:confirmar', DESCARTADA: 'act:crear' }),
  CONFIRMADA: Object.freeze({ ANULADA: 'act:anular' }),
  ANULADA: Object.freeze({}),
  DESCARTADA: Object.freeze({})
});

export const LIMITES = Object.freeze({
  maxItems: 50,
  motivoMin: 5,
  motivoMax: 255,
  observacionesMax: 2000,
  motivoAnulacionMin: 10,
  motivoAnulacionMax: 500,
  nombreMax: 150
});

export function permisoParaTransicion(desde, hacia) {
  return TRANSICIONES[desde]?.[hacia] ?? null;
}

export function puedeTransicionar(desde, hacia) {
  return permisoParaTransicion(desde, hacia) !== null;
}

export function formatNumeroActa(anio, consecutivo) {
  const y = Number(anio);
  const n = Number(consecutivo);
  if (!Number.isInteger(y) || y < 2000 || y > 9999) throw new RangeError('Año de acta inválido');
  if (!Number.isInteger(n) || n < 1 || n > 999999) throw new RangeError('Consecutivo de acta inválido');
  return `ACT-${y}-${String(n).padStart(6, '0')}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const esTextoNoVacio = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;

// Cantidad: número finito > 0, máx. 2 decimales; entera cuando la unidad es "Unidad" (D6).
export function validarCantidad(valor, unidad = 'Unidad') {
  const n = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;
  if (typeof n !== 'number' || !Number.isFinite(n)) return 'La cantidad debe ser un número válido.';
  if (n <= 0) return 'La cantidad debe ser estrictamente mayor a cero.';
  if (Number(n.toFixed(2)) !== n) return 'La cantidad no puede tener más de 2 decimales.';
  if (String(unidad ?? 'Unidad').trim().toLowerCase() === 'unidad' && !Number.isInteger(n)) {
    return 'Para unidades enteras la cantidad debe ser un número entero.';
  }
  return null;
}

// Valida cabecera e ítems de un borrador. No consulta la BD: comprobaciones de stock,
// alcance y estado del artículo se hacen dentro de la transacción (validarItemContraArticulo).
export function validarPayloadActa(payload) {
  const errores = [];
  const p = payload && typeof payload === 'object' ? payload : {};
  if (typeof p.request_uuid !== 'string' || !UUID_RE.test(p.request_uuid)) errores.push('request_uuid debe ser un UUID válido.');
  const campId = Number(p.campamento_id);
  if (!Number.isInteger(campId) || campId <= 0) errores.push('campamento_id es obligatorio.');
  if (!esTextoNoVacio(p.colaborador_nombre, LIMITES.nombreMax)) errores.push('El colaborador es obligatorio.');
  if (!esTextoNoVacio(p.supervisor_nombre, LIMITES.nombreMax)) errores.push('El supervisor o coordinador es obligatorio.');
  if (p.departamento != null && !esTextoNoVacio(p.departamento, 100)) errores.push('Departamento inválido.');
  const motivo = typeof p.motivo === 'string' ? p.motivo.trim() : '';
  if (motivo.length < LIMITES.motivoMin || motivo.length > LIMITES.motivoMax) {
    errores.push(`El motivo debe tener entre ${LIMITES.motivoMin} y ${LIMITES.motivoMax} caracteres.`);
  }
  if (p.observaciones != null && (typeof p.observaciones !== 'string' || p.observaciones.length > LIMITES.observacionesMax)) {
    errores.push(`Las observaciones no pueden superar ${LIMITES.observacionesMax} caracteres.`);
  }
  const items = Array.isArray(p.items) ? p.items : [];
  if (items.length < 1) errores.push('El acta debe incluir al menos una herramienta.');
  if (items.length > LIMITES.maxItems) errores.push(`El acta no puede superar ${LIMITES.maxItems} herramientas.`);
  const vistos = new Set();
  items.forEach((it, i) => {
    const pos = `Ítem ${i + 1}`;
    const id = Number(it?.articulo_id);
    if (!Number.isInteger(id) || id <= 0) { errores.push(`${pos}: articulo_id inválido.`); return; }
    if (vistos.has(id)) errores.push(`${pos}: el artículo ${id} está duplicado en el acta.`);
    vistos.add(id);
    const err = validarCantidad(it?.cantidad, it?.unidad ?? 'Unidad');
    if (err) errores.push(`${pos}: ${err}`);
  });
  return { ok: errores.length === 0, errores };
}

// Marcadores que el inventario usa para "sin serie" (mismos que almacenApi.js PLACEHOLDER_SERIAL_VALUES).
const SERIE_PLACEHOLDERS = new Set(['N/A', 'S/N', 'S/S', 'SIN SERIAL', 'SIN SERIE', 'NO APLICA', 'NO TIENE', 'NONE', 'NULL', '--', '-']);
export function tieneSerieReal(serie) {
  const s = String(serie ?? '').trim().toUpperCase();
  return s !== '' && !SERIE_PLACEHOLDERS.has(s);
}

// Comprobaciones por ítem contra el artículo bloqueado (FOR UPDATE) dentro de la transacción.
// Devuelve { status, mensaje } o null si es válido. Los códigos siguen a POST /movimientos.
export function validarItemContraArticulo(item, articulo, campamentoActaId) {
  if (!articulo || Number(articulo.activo) !== 1) return { status: 404, mensaje: 'Artículo no encontrado o inactivo.' };
  const stock = articulo.cantidad_num === null || articulo.cantidad_num === undefined ? null : Number(articulo.cantidad_num);
  if (stock === null || Number(articulo.cantidad_verificada) === 0) {
    return { status: 409, mensaje: 'Stock no verificado (cantidad pendiente o NULL). Registre primero una ENTRADA o AJUSTE físico.' };
  }
  const vinc = articulo.estado_vinculacion_sede || (articulo.campamento_id ? 'CONFIRMADO' : 'SIN_SEDE');
  if (vinc !== 'CONFIRMADO' || articulo.campamento_id === null || articulo.campamento_id === undefined) {
    return { status: 409, mensaje: 'El artículo no tiene una sede confirmada. Reasigne su sede antes de entregarlo.' };
  }
  if (Number(articulo.campamento_id) !== Number(campamentoActaId)) {
    return { status: 409, mensaje: 'El artículo pertenece a un campamento distinto al del acta.' };
  }
  const cantidad = Number(item.cantidad);
  // Decisión del propietario: un registro con número de serie y stock > 1 (varias unidades bajo una
  // misma serie) puede entregarse de 1 hasta el stock disponible. Con stock 1 solo cabe 1 unidad.
  if (cantidad > stock) {
    return { status: 400, mensaje: `Stock insuficiente (${stock} disponibles) para entregar ${cantidad}.` };
  }
  return null;
}

// Orden de bloqueo estable (ascendente por id) para evitar interbloqueos entre actas.
export function ordenarItemsParaBloqueo(items) {
  return [...items].sort((a, b) => Number(a.articulo_id) - Number(b.articulo_id));
}

export function validarMotivoAnulacion(motivo) {
  const m = typeof motivo === 'string' ? motivo.trim() : '';
  if (m.length < LIMITES.motivoAnulacionMin || m.length > LIMITES.motivoAnulacionMax) {
    return `El motivo de anulación debe tener entre ${LIMITES.motivoAnulacionMin} y ${LIMITES.motivoAnulacionMax} caracteres.`;
  }
  return null;
}

// Devolución vinculada: nunca más de lo entregado por ítem (impide inflar stock).
export function cantidadDevolvible(entregada, yaDevuelta) {
  const r = Number((Number(entregada) - Number(yaDevuelta)).toFixed(2));
  return r > 0 ? r : 0;
}

export function validarDevolucion(entregada, yaDevuelta, solicitada, unidad = 'Unidad') {
  const err = validarCantidad(solicitada, unidad);
  if (err) return err;
  const max = cantidadDevolvible(entregada, yaDevuelta);
  if (Number(solicitada) > max) return `No se puede devolver más de lo entregado pendiente (${max}).`;
  return null;
}

// Estado derivado (no almacenado) de las devoluciones de un ítem.
export function estadoDevolucion(entregada, devuelta) {
  const d = Number(devuelta);
  if (!(d > 0)) return 'SIN_DEVOLUCION';
  return d >= Number(entregada) ? 'DEVUELTA_TOTAL' : 'DEVUELTA_PARCIAL';
}
