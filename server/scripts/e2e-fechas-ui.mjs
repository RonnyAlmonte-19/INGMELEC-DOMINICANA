// E2E real (Chrome headless/CDP) del calendario de filtro en las 10 pantallas. Solo localhost.
// Uso: node scripts/e2e-fechas-ui.mjs <carpeta-salida>
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const cred = Object.fromEntries(fs.readFileSync(new URL('../.env.dev-credenciales', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()]; }));
const BASE = 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const resultados = [];
const check = (n, ok, d = '') => { resultados.push(ok); console.log(`${ok ? 'OK  ' : 'FALLA'} ${n}${d ? ' — ' + d : ''}`); };

const PAGINAS = [
  ['/inventario', 'Inventario Maestro'], ['/informatica', 'Informática y Telecom'], ['/oficinas', 'Oficinas y Mobiliario'],
  ['/cocina', 'Cocina y Comedor'], ['/almacen', 'Almacén y Herramientas'], ['/levantamientos', 'Levantamientos y Auditorías'],
  ['/ubicaciones', 'Sedes y Campamentos'], ['/movimientos', 'Movimientos de Stock'], ['/reportes', 'Centro de Reportes'], ['/auditoria', 'Bitácora de Auditoría']
];

const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9334', `--user-data-dir=${path.join(os.tmpdir(), 'ingm_e2e_f_' + Date.now())}`, '--no-first-run', '--window-size=1400,1000', 'about:blank'], { stdio: 'ignore' });
let ws; let id = 0; const pend = new Map(); const peticiones = [];
try {
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch('http://127.0.0.1:9334/json')).json(); if (targets.length) break; } catch { /* esperando */ } await sleep(500); }
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    if (d.method === 'Network.requestWillBeSent') peticiones.push(d.params.request.url);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; pend.set(n, (d) => (d.error ? rej(new Error(d.error.message)) : res(d.result))); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'error JS'); return r.result.value; };
  const waitFor = async (expr, ms = 15000, msg = expr) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return true; } catch { /* reintento */ } await sleep(250); } throw new Error('Timeout: ' + msg); };
  const goto = async (url) => { await send('Page.navigate', { url }); await sleep(1200); };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });

  const H = `
    window.__setVal = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    window.__btnTxt = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().includes(t));
    window.__dlg = () => document.querySelector('[data-testid=date-range-filter] [role=dialog]');
    window.__inp = (lbl) => { const l = [...__dlg().querySelectorAll('label')].find((x) => x.textContent.trim() === lbl); return l.parentElement.querySelector('input'); };
    window.__trigger = () => document.querySelector('[data-testid=date-range-filter] button[aria-haspopup=dialog]');`;

  await goto(BASE + '/');
  await waitFor(`!!document.querySelector('input[type=password]')`, 20000, 'login');
  await ev(H);
  await ev(`(() => { __setVal(document.querySelector('input[type=email],input[type=text]'), ${JSON.stringify(cred.EMAIL)}); __setVal(document.querySelector('input[type=password]'), ${JSON.stringify(cred.PASSWORD)}); document.querySelector('button[type=submit]').click(); })()`);
  await waitFor(`document.body.innerText.includes('Movimientos de Stock')`, 20000, 'sesión');
  const etiquetasSidebar = () => ev(`[...document.querySelectorAll('aside button')].map((b) => b.textContent.replace(/[0-9]+/g, '').trim()).filter(Boolean).join('|')`);
  const sidebarBase = await etiquetasSidebar();

  for (const [ruta, nombre] of PAGINAS) {
    try {
      await goto(BASE + ruta);
      await ev(H);
      await waitFor(`!!__trigger()`, 20000, 'botón calendario en ' + nombre);
      check(`${nombre}: botón de calendario visible al abrir la pestaña`, true);

      // Ventana compacta con los 5 controles pedidos
      await ev(`__trigger().click()`);
      await waitFor(`!!__dlg()`, 5000, 'ventana');
      const ctrl = await ev(`(() => { const t = __dlg().innerText; return ['Día exacto', 'Fecha desde', 'Fecha hasta', 'Aplicar filtro', 'Limpiar filtro'].every((s) => t.includes(s)); })()`);
      const ancho = await ev(`Math.round(__dlg().getBoundingClientRect().width)`);
      check(`${nombre}: ventana con día exacto, desde, hasta, aplicar y limpiar`, ctrl === true, `ancho ${ancho}px`);

      // Validación desde > hasta (no aplica, muestra error)
      await ev(`__setVal(__inp('Fecha desde'), '2026-03-12'); __setVal(__inp('Fecha hasta'), '2026-03-11'); __btnTxt('Aplicar filtro').click()`);
      check(`${nombre}: rechaza desde posterior a hasta`, await ev(`!!__dlg() && __dlg().innerText.includes('no puede ser posterior')`));

      // Día exacto lejano: aplica y llega al backend como fecha_desde=fecha_hasta
      const n0 = peticiones.length;
      await ev(`__setVal(__inp('Día exacto'), '2099-01-01'); __btnTxt('Aplicar filtro').click()`);
      await sleep(1800);
      const nuevas = peticiones.slice(n0).filter((u) => u.includes('fecha_desde=2099-01-01') && u.includes('fecha_hasta=2099-01-01'));
      check(`${nombre}: el filtro se envía al backend (día exacto)`, nuevas.length > 0, nuevas[0]?.split('?')[1]?.slice(0, 90) || 'sin petición');
      check(`${nombre}: muestra el filtro activo`, await ev(`document.querySelector('[data-testid=date-range-filter]').innerText.includes('01/01/2099')`));

      // Limpiar: vuelve sin parámetros de fecha
      const n1 = peticiones.length;
      await ev(`document.querySelector('[aria-label="Limpiar filtro de fecha"]').click()`);
      await sleep(1800);
      const trasLimpiar = peticiones.slice(n1).filter((u) => u.includes('/api/v2/') && !u.includes('/auth/') && !u.includes('/campamentos'));
      check(`${nombre}: limpiar quita el filtro y recarga sin fechas`, !(await ev(`document.querySelector('[data-testid=date-range-filter]').innerText.includes('2099')`)) && trasLimpiar.every((u) => !u.includes('fecha_desde')), `${trasLimpiar.length} peticiones`);

      check(`${nombre}: sidebar sin cambios`, (await etiquetasSidebar()) === sidebarBase && sidebarBase.length > 50);
    } catch (e) {
      check(`${nombre}: ${e.message}`, false);
    }
  }

  // Efecto real sobre los datos: movimientos y auditoría (rango amplio = todo lo que tiene fecha; 2099 = nada)
  await goto(BASE + '/movimientos'); await ev(H);
  await waitFor(`document.querySelectorAll('tbody tr').length > 1`, 15000, 'filas');
  const filas0 = await ev(`document.querySelectorAll('tbody tr').length`);
  await ev(`__trigger().click()`);
  await ev(`__setVal(__inp('Fecha desde'), '2099-01-01'); __btnTxt('Aplicar filtro').click()`);
  await waitFor(`document.body.innerText.includes('No hay movimientos registrados aún')`, 8000, 'sin movimientos 2099');
  check('Movimientos: filtro vacío muestra tabla vacía; el resto de la pantalla sigue', true);
  await ev(`document.querySelector('[aria-label="Limpiar filtro de fecha"]').click()`);
  await waitFor(`document.querySelectorAll('tbody tr').length === ${filas0}`, 8000, 'filas restauradas');
  check('Movimientos: al limpiar vuelven exactamente las mismas filas', true, `${filas0} filas`);

  await goto(BASE + '/inventario'); await ev(H);
  await waitFor(`document.querySelectorAll('tbody tr').length > 1`, 15000, 'inventario');
  const inv0 = await ev(`document.querySelectorAll('tbody tr').length`);
  await ev(`__trigger().click()`);
  await ev(`__setVal(__inp('Fecha desde'), '2099-01-01'); __btnTxt('Aplicar filtro').click()`);
  await waitFor(`document.body.innerText.includes('No se encontraron artículos')`, 8000, 'inventario vacío 2099');
  check('Inventario: el filtro por fecha de registro vacía la lista (2099)', true);
  await ev(`__trigger().click()`);
  await ev(`__setVal(__inp('Fecha desde'), '2000-01-01'); __setVal(__inp('Fecha hasta'), '2100-12-31'); __btnTxt('Aplicar filtro').click()`);
  await waitFor(`document.querySelectorAll('tbody tr').length === ${inv0}`, 8000, 'rango amplio');
  check('Inventario: un rango amplio devuelve el mismo conjunto', true, `${inv0} filas`);
  await send('Page.captureScreenshot', { format: 'png' }).then((r) => fs.writeFileSync(path.join(OUT, 'inventario_calendario.png'), Buffer.from(r.data, 'base64')));
  await ev(`__trigger().click()`);
  await sleep(400);
  await send('Page.captureScreenshot', { format: 'png' }).then((r) => fs.writeFileSync(path.join(OUT, 'calendario_abierto.png'), Buffer.from(r.data, 'base64')));
} catch (e) {
  check('ejecución sin errores: ' + e.message, false);
} finally {
  try { ws?.close(); } catch { /* sin acción */ }
  chrome.kill();
}
const fallos = resultados.filter((r) => !r).length;
console.log(`\nE2E fechas: ${resultados.length - fallos}/${resultados.length} correctas`);
process.exit(fallos ? 1 : 0);

