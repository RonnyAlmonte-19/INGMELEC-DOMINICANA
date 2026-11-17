import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  ESTADOS, LIMITES, puedeTransicionar, permisoParaTransicion, formatNumeroActa, validarCantidad,
  validarPayloadActa, validarItemContraArticulo, ordenarItemsParaBloqueo, validarMotivoAnulacion,
  cantidadDevolvible, validarDevolucion, estadoDevolucion
} from '../services/actas/actaRules.js';

const base = () => ({
  request_uuid: crypto.randomUUID(), campamento_id: 3, colaborador_nombre: 'Juan Pérez', supervisor_nombre: 'Ana Gómez',
  departamento: 'Mantenimiento', motivo: 'Trabajo en obra', items: [{ articulo_id: 10, cantidad: 2 }]
});
const art = (o = {}) => ({ activo: 1, cantidad_num: 10, cantidad_verificada: 1, campamento_id: 3, estado_vinculacion_sede: 'CONFIRMADO', serie_imei: null, ...o });

describe('máquina de estados', () => {
  test('solo las transiciones autorizadas, con su permiso', () => {
    assert.equal(permisoParaTransicion('BORRADOR', 'CONFIRMADA'), 'act:confirmar');
    assert.equal(permisoParaTransicion('BORRADOR', 'DESCARTADA'), 'act:crear');
    assert.equal(permisoParaTransicion('CONFIRMADA', 'ANULADA'), 'act:anular');
    for (const [d, h] of [['CONFIRMADA', 'BORRADOR'], ['CONFIRMADA', 'DESCARTADA'], ['ANULADA', 'CONFIRMADA'], ['ANULADA', 'BORRADOR'],
      ['DESCARTADA', 'CONFIRMADA'], ['BORRADOR', 'ANULADA'], ['CONFIRMADA', 'CONFIRMADA']]) {
      assert.equal(puedeTransicionar(d, h), false, `${d}->${h} no debe permitirse`);
    }
    assert.deepEqual(Object.keys(ESTADOS).sort(), ['ANULADA', 'BORRADOR', 'CONFIRMADA', 'DESCARTADA']);
  });
});

describe('numeración', () => {
  test('formato ACT-AAAA-NNNNNN y rangos', () => {
    assert.equal(formatNumeroActa(2026, 1), 'ACT-2026-000001');
    assert.equal(formatNumeroActa(2026, 123456), 'ACT-2026-123456');
    assert.throws(() => formatNumeroActa(2026, 0), RangeError);
    assert.throws(() => formatNumeroActa(2026, 1000000), RangeError);
    assert.throws(() => formatNumeroActa(1999, 1), RangeError);
  });
});

describe('cantidades', () => {
  test('rechaza cero, negativos, NaN, texto y exceso de decimales; enteros para "Unidad"', () => {
    for (const v of [0, -1, NaN, Infinity, 'abc', '', null, undefined, 1.234]) assert.ok(validarCantidad(v, 'Metro'), String(v));
    assert.equal(validarCantidad(2, 'Unidad'), null);
    assert.equal(validarCantidad('3', 'Unidad'), null);
    assert.ok(validarCantidad(1.5, 'Unidad'));
    assert.equal(validarCantidad(1.5, 'Metro'), null);
    assert.equal(validarCantidad(0.25, 'Kg'), null);
  });
});

describe('payload del acta', () => {
  test('un payload válido pasa', () => assert.deepEqual(validarPayloadActa(base()), { ok: true, errores: [] }));
  test('campos obligatorios', () => {
    for (const campo of ['request_uuid', 'campamento_id', 'colaborador_nombre', 'supervisor_nombre', 'motivo']) {
      const p = base(); delete p[campo];
      assert.equal(validarPayloadActa(p).ok, false, campo);
    }
    assert.equal(validarPayloadActa(null).ok, false);
  });
  test('UUID inválido, motivo corto/largo y observaciones excesivas', () => {
    assert.equal(validarPayloadActa({ ...base(), request_uuid: 'no-uuid' }).ok, false);
    assert.equal(validarPayloadActa({ ...base(), motivo: 'abc' }).ok, false);
    assert.equal(validarPayloadActa({ ...base(), motivo: 'x'.repeat(LIMITES.motivoMax + 1) }).ok, false);
    assert.equal(validarPayloadActa({ ...base(), observaciones: 'x'.repeat(LIMITES.observacionesMax + 1) }).ok, false);
  });
  test('ítems: mínimo 1, máximo 50, sin duplicados, ids y cantidades válidos', () => {
    assert.equal(validarPayloadActa({ ...base(), items: [] }).ok, false);
    assert.equal(validarPayloadActa({ ...base(), items: Array.from({ length: 51 }, (_, i) => ({ articulo_id: i + 1, cantidad: 1 })) }).ok, false);
    assert.equal(validarPayloadActa({ ...base(), items: Array.from({ length: 50 }, (_, i) => ({ articulo_id: i + 1, cantidad: 1 })) }).ok, true);
    const dup = validarPayloadActa({ ...base(), items: [{ articulo_id: 1, cantidad: 1 }, { articulo_id: 1, cantidad: 2 }] });
    assert.equal(dup.ok, false); assert.match(dup.errores.join(' '), /duplicado/);
    assert.equal(validarPayloadActa({ ...base(), items: [{ articulo_id: 'x', cantidad: 1 }] }).ok, false);
    assert.equal(validarPayloadActa({ ...base(), items: [{ articulo_id: 1, cantidad: 0 }] }).ok, false);
    assert.equal(validarPayloadActa({ ...base(), items: [{ articulo_id: 1, cantidad: -2 }] }).ok, false);
  });
});

describe('ítem contra artículo bloqueado', () => {
  const item = (c = 2) => ({ articulo_id: 10, cantidad: c });
  test('caso válido y límites de stock', () => {
    assert.equal(validarItemContraArticulo(item(2), art(), 3), null);
    assert.equal(validarItemContraArticulo(item(10), art(), 3), null);
    assert.equal(validarItemContraArticulo(item(11), art(), 3).status, 400);
  });
  test('inactivo, no verificado, sin sede, otra sede', () => {
    assert.equal(validarItemContraArticulo(item(), art({ activo: 0 }), 3).status, 404);
    assert.equal(validarItemContraArticulo(item(), null, 3).status, 404);
    assert.equal(validarItemContraArticulo(item(), art({ cantidad_num: null }), 3).status, 409);
    assert.equal(validarItemContraArticulo(item(), art({ cantidad_verificada: 0 }), 3).status, 409);
    assert.equal(validarItemContraArticulo(item(), art({ estado_vinculacion_sede: 'SEDE_AMBIGUA' }), 3).status, 409);
    assert.equal(validarItemContraArticulo(item(), art({ campamento_id: null, estado_vinculacion_sede: null }), 3).status, 409);
    assert.equal(validarItemContraArticulo(item(), art({ campamento_id: 4 }), 3).status, 409);
  });
  test('artículo con serie: de 1 hasta el stock disponible (con stock 1, solo 1)', () => {
    assert.equal(validarItemContraArticulo(item(1), art({ serie_imei: 'SN-1' }), 3), null);
    assert.equal(validarItemContraArticulo(item(2), art({ serie_imei: 'SN-1' }), 3), null);
    assert.equal(validarItemContraArticulo(item(10), art({ serie_imei: 'SN-1' }), 3), null);
    assert.equal(validarItemContraArticulo(item(11), art({ serie_imei: 'SN-1' }), 3).status, 400, 'más del stock se rechaza');
    assert.equal(validarItemContraArticulo(item(1), art({ serie_imei: 'SN-1', cantidad_num: 1 }), 3), null);
    assert.equal(validarItemContraArticulo(item(2), art({ serie_imei: 'SN-1', cantidad_num: 1 }), 3).status, 400, 'serie con stock 1: solo 1');
  });
});

describe('bloqueo, anulación y devoluciones', () => {
  test('orden de bloqueo ascendente y sin mutar la entrada', () => {
    const items = [{ articulo_id: 9 }, { articulo_id: 2 }, { articulo_id: 5 }];
    assert.deepEqual(ordenarItemsParaBloqueo(items).map((i) => i.articulo_id), [2, 5, 9]);
    assert.deepEqual(items.map((i) => i.articulo_id), [9, 2, 5]);
  });
  test('motivo de anulación obligatorio (≥10 caracteres)', () => {
    assert.ok(validarMotivoAnulacion('corto'));
    assert.ok(validarMotivoAnulacion(undefined));
    assert.equal(validarMotivoAnulacion('Error de digitación en el acta'), null);
  });
  test('la devolución nunca supera lo entregado pendiente', () => {
    assert.equal(cantidadDevolvible(5, 2), 3);
    assert.equal(cantidadDevolvible(5, 5), 0);
    assert.equal(cantidadDevolvible(5, 7), 0);
    assert.equal(validarDevolucion(5, 2, 3), null);
    assert.ok(validarDevolucion(5, 2, 4));
    assert.ok(validarDevolucion(5, 5, 1));
    assert.ok(validarDevolucion(5, 0, 0));
    assert.ok(validarDevolucion(5, 0, -1));
  });
  test('estado de devolución derivado', () => {
    assert.equal(estadoDevolucion(5, 0), 'SIN_DEVOLUCION');
    assert.equal(estadoDevolucion(5, 2), 'DEVUELTA_PARCIAL');
    assert.equal(estadoDevolucion(5, 5), 'DEVUELTA_TOTAL');
  });
});
