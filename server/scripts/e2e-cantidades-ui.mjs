// E2E real (Chrome/CDP, escritura con teclado) del campo de cantidad del Acta de Entrega. Solo localhost.
// Uso: node scripts/e2e-cantidades-ui.mjs <carpeta-salida>
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import mysql from 'mysql2/promise';

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const cred = Object.fromEntries(fs.readFileSync(new URL('../.env.dev-credenciales', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()]; }));
const BASE = 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const res = [];
const check = (n, ok, d = '') => { res.push(ok); console.log(`${ok ? 'OK  ' : 'FALLA'} ${n}${d ? ' — ' + d : ''}`); };

// Artículos de prueba (solo base sintética) para los escenarios pedidos
const pool = mysql.createPool({ host: '127.0.0.1', port: 3310, user: 'root', database: 'ingmelec_v22_actas_test' });
const [[{ d: dbName }]] = await pool.query('SELECT DATABASE() d');
if (dbName !== 'ingmelec_v22_actas_test') throw new Error('base inesperada');
const conn = await pool.getConnection();
await conn.query("SET SESSION sql_mode = ''");
const [[base]] = await conn.query('SELECT area, categoria FROM inv_articulos LIMIT 1');
const mk = async (nombre, qty) => (await conn.query(
  `INSERT INTO inv_articulos (articulo_nombre, area, categoria, ubicacion_nombre, campamento_id, estado_vinculacion_sede, cantidad_num, cantidad_texto, cantidad_verificada, estado_cantidad, unidad_medida, estado_fisico, activo, es_sintetico, codigo_original)
   VALUES (?, ?, ?, 'ALMACÉN 27 DE FEBRERO', 1, 'CONFIRMADO', ?, ?, 1, 'VERIFICADO', 'Unidad', 'Bueno', 1, 0, ?)`,
  [nombre, base.area, base.categoria, qty, String(qty), nombre.slice(0, 12)]))[0].insertId;
const A = await mk('CANT-A veinte', 20);
const B = await mk('CANT-B diez', 10);
const C = await mk('CANT-C tres', 3);
const D = await mk('CANT-D ocho', 8);
const E = await mk('CANT-E seis', 6);
conn.release();
const stock = async (id) => Number((await pool.query('SELECT cantidad_num FROM inv_articulos WHERE id=?', [id]))[0][0].cantidad_num);

const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9336', `--user-data-dir=${path.join(os.tmpdir(), 'ingm_cant_' + Date.now())}`, '--no-first-run', '--window-size=1400,1000', 'about:blank'], { stdio: 'ignore' });
let ws; let id = 0; const pend = new Map();
try {
  let t; for (let i = 0; i < 40; i++) { try { t = await (await fetch('http://127.0.0.1:9336/json')).json(); if (t.length) break; } catch { /* esperando */ } await sleep(500); }
  ws = new WebSocket(t.find((x) => x.type === 'page').webSocketDebuggerUrl); await new Promise((r) => { ws.onopen = r; });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (method, params = {}) => new Promise((rs, rj) => { const n = ++id; pend.set(n, (d) => (d.error ? rj(new Error(d.error.message)) : rs(d.result))); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'error JS'); return r.result.value; };
  const waitFor = async (e, ms = 15000, msg = e) => { const s = Date.now(); while (Date.now() - s < ms) { try { if (await ev(e)) return true; } catch { /* reintento */ } await sleep(250); } throw new Error('Timeout: ' + msg); };
  const goto = async (url) => { await send('Page.navigate', { url }); await sleep(1300); };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  const H = `
    window.__set = (el, v) => { const p = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); };
    window.__btn = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t) && !b.disabled);
    window.__field = (l) => { const x = [...document.querySelectorAll('[role=dialog] label')].find((y) => y.textContent.trim().startsWith(l)); return x && x.parentElement.querySelector('input,select,textarea'); };
    window.__fila = (n) => [...document.querySelectorAll('[role=dialog] tbody tr')].find((tr) => tr.innerText.includes(n));
    window.__q = (n) => __fila(n).querySelector('input[type=number]');`;
  // Escritura REAL con teclado: selecciona el contenido y escribe con eventos de entrada del navegador
  const escribir = async (nombre, texto) => {
    await ev(`(() => { const i = __q(${JSON.stringify(nombre)}); i.focus(); i.select(); })()`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    if (texto !== '') await send('Input.insertText', { text: texto });
    await sleep(250);
  };
  const fila = (n) => ev(`__fila(${JSON.stringify(n)}).innerText.replace(/\\s+/g, ' ')`);
  const valor = (n) => ev(`__q(${JSON.stringify(n)}).value`);
  const confirmarHabilitado = () => ev(`!!__btn('Confirmar y generar acta')`);

  const abrirForm = async () => {
    await goto(BASE + '/movimientos'); await ev(H);
    await waitFor(`!!__btn('Registrar Movimiento')`, 15000, 'botón'); await ev(`__btn('Registrar Movimiento').click()`);
    await waitFor(`!!__btn('ASIGNACION')`); await ev(`__btn('ASIGNACION').click()`);
    await waitFor(`!!__field('Campamento') && !__field('Campamento').disabled && __field('Campamento').options.length > 1`, 10000, 'sedes');
    await ev(`__set(__field('Campamento'), '1')`);
    await ev(`__set(__field('Nombre del colaborador'), 'Colab Cantidades')`);
    await ev(`__set(__field('Supervisor'), 'Sup Cantidades')`);
    await ev(`__set(__field('Motivo'), 'Prueba E2E de cantidades')`);
  };
  const agregar = async (q) => {
    await ev(`__set(document.querySelector('[role=dialog] input[placeholder^="Buscar"]'), ${JSON.stringify(q)})`);
    await waitFor(`[...document.querySelectorAll('[role=dialog] ul button')].some((b) => b.textContent.includes(${JSON.stringify(q)}) && !b.disabled)`, 8000, 'resultado ' + q);
    await ev(`[...document.querySelectorAll('[role=dialog] ul button')].find((b) => b.textContent.includes(${JSON.stringify(q)})).click()`);
    await waitFor(`!!__fila(${JSON.stringify(q)})`, 5000, 'fila ' + q);
  };

  await goto(BASE + '/');
  await waitFor(`!!document.querySelector('input[type=password]')`, 20000, 'login'); await ev(H);
  await ev(`(() => { __set(document.querySelector('input[type=email],input[type=text]'), ${JSON.stringify(cred.EMAIL)}); __set(document.querySelector('input[type=password]'), ${JSON.stringify(cred.PASSWORD)}); document.querySelector('button[type=submit]').click(); })()`);
  await waitFor(`document.body.innerText.includes('Movimientos de Stock')`, 20000, 'sesión');

  // ===== ACTA 1: A (stock 20) y B (stock 10) con cantidades distintas, editando varias veces =====
  await abrirForm();
  await agregar('CANT-A'); await agregar('CANT-B');
  check('Al agregar, la fila muestra el stock disponible', (await fila('CANT-A')).includes('Stock: 20') && (await fila('CANT-B')).includes('Stock: 10'), await fila('CANT-A'));
  check('Por defecto 1 unidad y no está bloqueado para artículos sin serie', (await valor('CANT-A')) === '1' && (await ev(`!__q('CANT-A').disabled`)));

  await escribir('CANT-A', '7');
  check('Escribir 7 → muestra "Quedará: 13"', (await valor('CANT-A')) === '7' && (await fila('CANT-A')).includes('Quedará: 13'), await fila('CANT-A'));
  await escribir('CANT-A', '0');
  check('Escribir 0 → error y confirmar deshabilitado', (await fila('CANT-A')).includes('mayor que cero') && !(await confirmarHabilitado()));
  await escribir('CANT-A', '-3');
  check('Escribir -3 → error y confirmar deshabilitado', (await fila('CANT-A')).includes('mayor que cero') && !(await confirmarHabilitado()));
  await escribir('CANT-A', '25');
  check('Escribir 25 (> stock 20) → error y confirmar deshabilitado', (await fila('CANT-A')).includes('No puede superar el stock (20)') && !(await confirmarHabilitado()));
  await escribir('CANT-A', '1.5');
  check('Escribir 1.5 (unidad entera) → error', (await fila('CANT-A')).includes('número entero') && !(await confirmarHabilitado()));
  await escribir('CANT-A', '');
  check('Campo vacío → "Indique la cantidad" y confirmar deshabilitado', (await fila('CANT-A')).includes('Indique la cantidad') && !(await confirmarHabilitado()));
  await escribir('CANT-A', '5');
  check('Corregir a 5 → "Quedará: 15" y confirmar habilitado', (await fila('CANT-A')).includes('Quedará: 15') && (await confirmarHabilitado()), await fila('CANT-A'));
  await escribir('CANT-B', '10');
  check('B: entregar todo (10) → "Quedará: 0"', (await fila('CANT-B')).includes('Quedará: 0') && (await confirmarHabilitado()), await fila('CANT-B'));
  await send('Page.captureScreenshot', { format: 'png' }).then((r) => fs.writeFileSync(path.join(OUT, 'cantidades_formulario.png'), Buffer.from(r.data, 'base64')));
  const antesActas = Number((await pool.query('SELECT COUNT(*) n FROM inv_actas_entrega'))[0][0].n);
  await ev(`__btn('Confirmar y generar acta').click()`);
  await waitFor(`document.body.innerText.includes('ACTA DE ENTREGA DE HERRAMIENTAS')`, 15000, 'acta 1');
  check('Acta 1: A 20→15 y B 10→0 (cantidades distintas por herramienta)', (await stock(A)) === 15 && (await stock(B)) === 0, `A=${await stock(A)} B=${await stock(B)}`);
  const [mv1] = await pool.query("SELECT articulo_id, cantidad FROM inv_movimientos WHERE articulo_id IN (?, ?) AND tipo_movimiento = 'SALIDA' ORDER BY articulo_id", [A, B]);
  check('Exactamente una SALIDA por herramienta, sin duplicados', mv1.length === 2 && Number(mv1[0].cantidad) === 5 && Number(mv1[1].cantidad) === 10, JSON.stringify(mv1.map((m) => Number(m.cantidad))));
  check('Se creó una sola acta', Number((await pool.query('SELECT COUNT(*) n FROM inv_actas_entrega'))[0][0].n) === antesActas + 1);
  await ev(`__btn('Cerrar').click()`); await sleep(400);

  // ===== ACTA 2 (stock 3, intento 4) =====
  await abrirForm();
  await agregar('CANT-C');
  await escribir('CANT-C', '4');
  check('Stock 3, escribir 4 → rechazado en pantalla', (await fila('CANT-C')).includes('No puede superar el stock (3)') && !(await confirmarHabilitado()));
  await ev(`document.querySelector('[role=dialog] form').requestSubmit()`); await sleep(500);
  check('Forzar el envío no registra nada (stock 3 intacto)', (await stock(C)) === 3);
  await escribir('CANT-C', '3');
  check('Corregir a 3 → "Quedará: 0"', (await fila('CANT-C')).includes('Quedará: 0') && (await confirmarHabilitado()));
  await ev(`__btn('Cancelar').click()`); await sleep(400);

  // ===== ACTA 3: 3 unidades de una herramienta y 2 de otra =====
  await abrirForm();
  await agregar('CANT-D'); await agregar('CANT-E');
  await escribir('CANT-D', '3'); await escribir('CANT-E', '2');
  check('3 de D (stock 8) y 2 de E (stock 6): restantes 5 y 4', (await fila('CANT-D')).includes('Quedará: 5') && (await fila('CANT-E')).includes('Quedará: 4'));
  await ev(`__btn('Confirmar y generar acta').click()`);
  await waitFor(`document.body.innerText.includes('ACTA DE ENTREGA DE HERRAMIENTAS')`, 15000, 'acta 3');
  check('Acta 3: D 8→5 y E 6→4', (await stock(D)) === 5 && (await stock(E)) === 4, `D=${await stock(D)} E=${await stock(E)}`);
  const txt = await ev(`document.querySelector('.acta-doc').innerText.replace(/\\s+/g, ' ')`);
  check('El acta impresa muestra 3 y 2', /CANT-D ocho.*\b3\b/.test(txt) && /CANT-E seis.*\b2\b/.test(txt));

  // ===== ACTA 4: artículo con serie real y varias unidades (Taladro: stock 3, un solo N.º de serie) =====
  await ev(`__btn('Cerrar').click()`); await sleep(400);
  const stockTaladro = async () => Number((await pool.query("SELECT cantidad_num FROM inv_articulos WHERE articulo_nombre LIKE 'Taladro Percutor%' LIMIT 1"))[0][0].cantidad_num);
  const t0 = await stockTaladro();
  await abrirForm();
  await agregar('Taladro');
  check('Serie con varias unidades: el campo NO está bloqueado y avisa', (await ev(`!__q('Taladro').disabled`)) && (await fila('Taladro')).includes('comparten el N.º de serie'), await fila('Taladro'));
  await escribir('Taladro', '4');
  check('Serie: 4 > stock 3 → rechazado', (await fila('Taladro')).includes('No puede superar el stock (3)') && !(await confirmarHabilitado()));
  await escribir('Taladro', '2');
  check('Serie: 2 → "Quedará: 1"', (await fila('Taladro')).includes('Quedará: 1') && (await confirmarHabilitado()), await fila('Taladro'));
  await ev(`__btn('Confirmar y generar acta').click()`);
  await waitFor(`document.body.innerText.includes('ACTA DE ENTREGA DE HERRAMIENTAS')`, 15000, 'acta 4');
  check('Acta 4: Taladro con serie 3→1 (descuento exacto de 2)', t0 === 3 && (await stockTaladro()) === 1, `stock ${t0}→${await stockTaladro()}`);
  check('El acta conserva la serie y muestra cantidad 2', /SN-SYNTH-HER-258A/.test(await ev(`document.querySelector('.acta-doc').innerText`)));

  // ===== Inventario: B aparece AGOTADO =====
  await goto(BASE + '/inventario'); await ev(H);
  await waitFor(`document.querySelectorAll('tbody tr').length > 1`, 15000, 'inventario');
  await ev(`__set(document.querySelector('input[placeholder^="Buscar"]'), 'CANT-B')`);
  await waitFor(`document.body.innerText.includes('AGOTADO')`, 10000, 'AGOTADO');
  check('Inventario muestra AGOTADO para el artículo que quedó en 0', true);
  await send('Page.captureScreenshot', { format: 'png' }).then((r) => fs.writeFileSync(path.join(OUT, 'cantidades_agotado.png'), Buffer.from(r.data, 'base64')));
} catch (e) {
  check('ejecución sin errores: ' + e.message, false);
} finally {
  try { ws?.close(); } catch { /* sin acción */ }
  chrome.kill();
  await pool.end();
}
const fallos = res.filter((r) => !r).length;
console.log(`\nE2E cantidades: ${res.length - fallos}/${res.length} correctas`);
process.exit(fallos ? 1 : 0);
