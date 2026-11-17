// INGMELEC v2.2 — Rutas del módulo Actas de Entrega (/api/v2/actas).
// Solo operativas con ACTAS_ENABLED=true; /actas/disponible informa el estado de la bandera.
import express from 'express';
import { getPool } from '../database/db.js';
import { isActasEnabled } from '../config/features.js';
import {
  requireAuth, requirePermission, requireAnyPermission,
  getUserAllowedCampamentos, canTargetCampamento, logAudit, parsePositiveInt
} from './almacenApi.js';
import { crearActa, anularActa, listarActas, obtenerActa, obtenerOpcionesActa, ActaError } from '../services/actas/actaService.js';

const router = express.Router();

function enviarError(res, err) {
  if (err instanceof ActaError) {
    return res.status(err.status).json({ success: false, message: err.message, ...err.extra });
  }
  console.error('[ACTAS] Error interno:', err?.message || err);
  return res.status(500).json({ success: false, message: 'Error interno en el módulo de actas.' });
}

router.get('/actas/disponible', requireAuth, (req, res) => {
  res.json({ success: true, enabled: isActasEnabled() });
});

// Con la bandera apagada el resto del módulo no existe.
router.use('/actas', (req, res, next) => {
  if (!isActasEnabled()) return res.status(404).json({ success: false, message: 'Módulo de actas no disponible.' });
  next();
});

const puedeVer = requireAnyPermission(['act:ver', 'inv:movimientos_ver']);
const puedeCrear = requireAnyPermission(['act:crear', 'inv:movimientos_registrar']);

async function deps(req) {
  const pool = getPool();
  const scope = await getUserAllowedCampamentos(pool, req.user);
  return { pool, scope, user: req.user, req, canTargetCampamento, logAudit };
}

router.get('/actas', requireAuth, puedeVer, async (req, res) => {
  try {
    const d = await deps(req);
    res.json({ success: true, ...(await listarActas(d.pool, d.scope, req.query)) });
  } catch (err) { enviarError(res, err); }
});

// Opciones del formulario según el alcance del usuario (sedes permitidas y catálogo de departamentos).
router.get('/actas/opciones', requireAuth, puedeCrear, async (req, res) => {
  try {
    const d = await deps(req);
    res.json({ success: true, ...(await obtenerOpcionesActa(d.pool, d.scope, req.user)) });
  } catch (err) { enviarError(res, err); }
});

router.get('/actas/:id', requireAuth, puedeVer, async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID de acta inválido.' });
    const d = await deps(req);
    res.json({ success: true, acta: await obtenerActa(d.pool, d.scope, id) });
  } catch (err) { enviarError(res, err); }
});

router.post('/actas', requireAuth, puedeCrear, async (req, res) => {
  try {
    const d = await deps(req);
    const r = await crearActa(d, req.body || {});
    res.status(r.duplicada ? 200 : 201).json({ success: true, message: `Acta ${r.numero_acta} registrada.`, ...r });
  } catch (err) { enviarError(res, err); }
});

router.post('/actas/:id/anular', requireAuth, requirePermission('act:anular'), async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID de acta inválido.' });
    const d = await deps(req);
    const r = await anularActa(d, id, req.body?.motivo);
    res.json({ success: true, message: `Acta ${r.numero_acta} anulada. El stock NO se revierte; registre las devoluciones físicas por separado.`, ...r });
  } catch (err) { enviarError(res, err); }
});

router.post('/actas/:id/impresion', requireAuth, puedeVer, async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID de acta inválido.' });
    const d = await deps(req);
    const acta = await obtenerActa(d.pool, d.scope, id);
    await d.pool.query('UPDATE inv_actas_entrega SET impresiones = impresiones + 1 WHERE id = ?', [id]);
    await logAudit(d.pool, {
      usuario_id: req.user.id, usuario_nombre: req.user.nombre, accion: 'ACTA_IMPRESA',
      entidad: 'inv_actas_entrega', entidad_id: id, detalles_previos: null,
      detalles_nuevos: { numero_acta: acta.numero_acta, reimpresion: Number(acta.impresiones) > 0 }, req
    });
    res.json({ success: true, impresiones: Number(acta.impresiones) + 1 });
  } catch (err) { enviarError(res, err); }
});

export default router;
