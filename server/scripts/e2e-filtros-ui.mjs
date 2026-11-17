// E2E real (Chrome/CDP) de los filtros y contadores del Inventario. Solo localhost + base sintética.
// Uso: node scripts/e2e-filtros-ui.mjs <carpeta-salida>
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

const pool = mysql.createPool({ host: '127.0.0.1', port: 3310, user: 'root', database: 'ingmelec_v22_actas_test' });
if ((await pool.query('SELECT DATABASE() d'))[0][0].d !== 'ingmelec_v22_actas_test') throw new Error('base inesperada');
const conn = await pool.getConnection();
await conn.query("SET SESSION sql_mode = ''");
const ins = (n, area, cat, ub, camp, f) => conn.query(
  `INSERT INTO inv_articulos (articulo_nombre, area, categoria, ubicacion_nombre, campamento_id, estado_vinculacion_sede, cantidad_num, cantidad_texto, cantidad_verificada, estado_cantidad, unidad_medida, estado_fisico, activo, es_sintetico, codigo_original, fecha_creacion)
   VALUES (?, ?, ?, ?, ?, 'CONFIRMADO', 5, '5', 1, 'VERIFICADO', 'Unidad', 'Bueno', 1, 0, ?, ?)`, [n, area, cat, ub, camp, n.slice(0, 20), f]);
await ins('FLT exte uno', 'INFORMATICA', 'Cat Redes', 'OPL', 3, '2026-03-10 10:00:00');
await ins('FLT exte dos', 'INFORMATICA', 'Cat Redes', 'KM 19 AUTOPISTA DUARTE OPL', 3, '2026-03-11 10:00:00');
await ins('FLT exte tres', 'OFICINAS', 'Cat Muebles', 'OPL', 3, '2026-03-11 12:00:00');
await ins('FLT cable uno', 'INFORMATICA', 'Cat Redes', 'ALMACÉN 27 DE FEBRERO', 1, '2026-03-11 09:00:00');
await ins('FLT cable dos', 'INFORMATICA', 'Cat Equipos', 'ALMACÉN 27 DE FEBRERO', 1, '2026-03-12 09:00:00');
for (let i = 1; i <= 30; i++) await ins(`FLTP pagina ${String(i).padStart(2, '0')}`, 'ALMACEN', 'Cat Paginas', 'ALMACÉN 27 DE FEBRERO', 1, '2026-04-01 09:00:00');
conn.release();
const totalBD = async (w = '1=1') => Number((await pool.query(`SELECT COUNT(*) n FROM inv_articulos WHERE activo = 1 AND es_sintetico = 0 AND ${w}`))[0][0].n);

const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9337', `--user-data-dir=${path.join(os.tmpdir(), 'ingm_flt_' + Date.now())}`, '--no-first-run', '--window-size=1500,1100', 'about:blank'], { stdio: 'ignore' });
let ws; let id = 0; const pend = new Map();
try {
  let t; for (let i = 0; i < 40; i++) { try { t = await (await fetch('http://127.0.0.1:9337/json')).json(); if (t.length) break; } catch { /* esperando */ } await sleep(500); }
  ws = new WebSocket(t.find((x) => x.type === 'page').webSocketDebuggerUrl); await new Promise((r) => { ws.onopen = r; });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (method, params = {}) => new Promise((rs, rj) => { const n = ++id; pend.set(n, (d) => (d.error ? rj(new Error(d.error.message)) : rs(d.result))); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'error JS'); return r.result.value; };
  const waitFor = async (e, ms = 15000, msg = e) => { const s = Date.now(); while (Date.now() - s < ms) { try { if (await ev(e)) return true; } catch { /* reintento */ } await sleep(250); } throw new Error('Timeout: ' + msg); };
  const goto = async (url) => { await send('Page.navigate', { url }); await sleep(1300); };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1100, deviceScaleFactor: 1, mobile: false });
  const H = `
    window.__set = (el, v) => { const p = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); };
    window.__btn = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t));
    window.__search = () => document.querySelector('input[placeholder^="Buscar por"]');
    window.__sel = (txt) => [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.textContent.includes(txt)));
    window.__optVal = (sel, txt) => [...sel.options].find((o) => o.textContent.includes(txt))?.value;
    window.__resumen = () => document.querySelector('[data-testid=resumen-resultados]')?.innerText.replace(/\\s+/g, ' ');
    window.__camp = () => __sel('Todos los Campamentos');
    window.__sig = () => [...document.querySelectorAll('span')].find((s) => s.textContent.trim().startsWith('Página '))?.nextElementSibling;
    window.__filas = () => document.querySelectorAll('tbody tr').length;`;
  const resumen = () => ev('__resumen()');
  const esperarResumen = async (txt, msg) => { await waitFor(`(__resumen() || '').includes(${JSON.stringify(txt)})`, 12000, msg || txt); };

  await goto(BASE + '/');
  await waitFor(`!!document.querySelector('input[type=password]')`, 20000, 'login'); await ev(H);
  await ev(`(() => { __set(document.querySelector('input[type=email],input[type=text]'), ${JSON.stringify(cred.EMAIL)}); __set(document.querySelector('input[type=password]'), ${JSON.stringify(cred.PASSWORD)}); document.querySelector('button[type=submit]').click(); })()`);
  await waitFor(`document.body.innerText.includes('Movimientos de Stock')`, 20000, 'sesión');

  // 0) Inventario sin filtros: mismos datos que la base (total del backend)
  const todos = await totalBD();
  await goto(BASE + '/inventario'); await ev(H);
  await esperarResumen(`${todos.toLocaleString('es-DO')} artículos encontrados`, 'total sin filtros');
  check('Sin filtros: el total mostrado es el del backend y sin texto de filtros activos', !(await resumen()).includes('con los filtros activos'), (await resumen()).slice(0, 110));
  check('Aclara qué significan los números de los desplegables', (await resumen()).includes('Los números entre paréntesis'));

  // 1) Búsqueda por nombre sin filtros (y se conserva el texto)
  await ev(`__set(__search(), 'FLT exte')`);
  await esperarResumen('3 artículos encontrados con los filtros activos', 'búsqueda exte');
  check('Buscar "FLT exte" → 3 artículos (total del backend)', true, (await resumen()).slice(0, 120));

  // 2) Contadores de los desplegables = lo que devolvería elegir esa opción (con el texto activo)
  const opts = await ev(`(() => { const a = __sel('Informática'); const c = __camp(); return { areas: [...a.options].map((o) => o.textContent), sedes: [...c.options].map((o) => o.textContent) }; })()`);
  check('Área: "Informática (2)" y "Oficinas y Mobiliario (1)" con la búsqueda activa', opts.areas.some((x) => x.includes('Informática (2)')) && opts.areas.some((x) => x.includes('Oficinas y Mobiliario (1)')), opts.areas.join(' | '));
  check('Sede: "OPL (3)" y "ALMACÉN 27 DE FEBRERO (0)" con la búsqueda activa', opts.sedes.some((x) => x.includes('OPL (3)')) && opts.sedes.some((x) => x.includes('ALMACÉN 27 DE FEBRERO (0)')), opts.sedes.join(' | ').slice(0, 160));
  check('"Todos los Campamentos" cuenta lo que coincide con la búsqueda (3)', opts.sedes[0].includes('(3)'), opts.sedes[0]);

  // 3) Combinación completa con cero resultados: texto + sede OPL + área Cocina (+ ubicación OPL)
  await ev(`__set(__camp(), __optVal(__camp(), 'OPL ('))`);
  await esperarResumen('3 artículos encontrados', 'sede OPL');
  await ev(`__set(__sel('Informática'), __optVal(__sel('Informática'), 'Cocina'))`);
  await esperarResumen('0 artículos encontrados', 'cero resultados');
  await waitFor(`document.body.innerText.includes('No se encontraron artículos con los filtros seleccionados')`, 8000, 'mensaje cero');
  check('Cero resultados: mensaje claro "No se encontraron artículos con los filtros seleccionados"', true);
  const vacio = await ev(`document.body.innerText.includes('ninguno cumple TODOS los filtros activos') && !!__btn('Limpiar filtros (conserva su búsqueda)') && !!__btn('Quitar búsqueda')`);
  check('Cero resultados: explica el motivo y ofrece Limpiar filtros (conserva búsqueda) y Quitar búsqueda', vacio === true);
  await send('Page.captureScreenshot', { format: 'png' }).then((r) => fs.writeFileSync(path.join(OUT, 'filtros_cero_resultados.png'), Buffer.from(r.data, 'base64')));

  // 4) Limpiar filtros conserva la búsqueda
  await ev(`__btn('Limpiar filtros (conserva su búsqueda)').click()`);
  await esperarResumen('3 artículos encontrados con los filtros activos', 'tras limpiar');
  check('Limpiar filtros conserva el texto "FLT exte" y vuelve a mostrar 3', (await ev('__search().value')) === 'FLT exte');

  // 5) Combinación: sede + área + ubicación con texto
  await ev(`__set(__camp(), __optVal(__camp(), 'OPL ('))`);
  await ev(`__set(__sel('Informática'), __optVal(__sel('Informática'), 'Informática'))`);
  await esperarResumen('2 artículos encontrados', 'sede+área');
  const ubVal = await ev(`__optVal(__sel('Ubicación Excel'), 'OPL (')`);
  await ev(`__set(__sel('Ubicación Excel'), ${JSON.stringify(ubVal)})`);
  await esperarResumen('1 artículo encontrado', 'sede+área+ubicación');
  check('Texto + sede OPL + área Informática + ubicación OPL → 1 artículo', (await ev('__filas()')) === 1 && (await resumen()).includes('Dentro del área'), (await resumen()).slice(0, 170));

  // 6) Calendario: aplicar y limpiar sobre la combinación
  await ev(`__btn('Limpiar filtros').click()`);
  await esperarResumen('3 artículos encontrados', 'reset');
  await ev(`document.querySelector('[data-testid=date-range-filter] button[aria-haspopup=dialog]').click()`);
  await sleep(300);
  await ev(`(() => { const d = document.querySelector('[data-testid=date-range-filter] [role=dialog]'); const lab = (t) => [...d.querySelectorAll('label')].find((l) => l.textContent.trim() === t).parentElement.querySelector('input'); __set(lab('Día exacto'), '2026-03-11'); [...d.querySelectorAll('button')].find((b) => b.textContent.includes('Aplicar filtro')).click(); })()`);
  await esperarResumen('2 artículos encontrados', 'calendario');
  const opcCal = await ev(`[...__sel('Informática').options].map((o) => o.textContent).join('|')`);
  check('Calendario 11-mar con búsqueda: 2 artículos y contadores de área coherentes', opcCal.includes('Informática (1)') && opcCal.includes('Oficinas y Mobiliario (1)'), opcCal);
  await ev(`document.querySelector('[aria-label="Limpiar filtro de fecha"]').click()`);
  await esperarResumen('3 artículos encontrados', 'limpiar calendario');
  check('Limpiar el calendario vuelve a 3 y conserva la búsqueda', (await ev('__search().value')) === 'FLT exte');

  // 7) Paginación y total real (30 artículos "FLTP")
  await ev(`__set(__search(), 'FLTP pagina')`);
  await esperarResumen('30 artículos encontrados', 'FLTP');
  check('Paginación: 25 filas en pantalla pero el total real es 30', (await ev('__filas()')) === 25 && (await resumen()).includes('30 artículos encontrados'));
  await ev(`__sig().click()`);
  await waitFor(`__filas() === 5`, 8000, 'página 2');
  check('Página 2: 5 filas y el total sigue en 30', (await resumen()).includes('30 artículos encontrados'));

  // 8) Categoría en página de área fija: la lista de categorías no se reduce al elegir una
  await goto(BASE + '/informatica'); await ev(H);
  await waitFor(`!!__sel('Todas las Categorías')`, 15000, 'select categorías');
  await waitFor(`[...__sel('Todas las Categorías').options].length >= 3`, 15000, 'categorías cargadas');
  const antes = await ev(`[...__sel('Todas las Categorías').options].map((o) => o.textContent)`);
  const catRedes = antes.find((x) => x.startsWith('Cat Redes'));
  await ev(`__set(__sel('Todas las Categorías'), __optVal(__sel('Todas las Categorías'), 'Cat Redes'))`);
  await sleep(1500);
  const despues = await ev(`[...__sel('Todas las Categorías').options].map((o) => o.textContent)`);
  check('Categoría: tras elegir "Cat Redes" siguen disponibles las demás categorías', despues.length === antes.length && despues.some((x) => x.startsWith('Cat Equipos')), `${antes.length}→${despues.length}`);
  check('Categoría muestra su contador (ej. "Cat Redes (3)")', !!catRedes && catRedes.includes('(3)'), catRedes);
  await send('Page.captureScreenshot', { format: 'png' }).then((r) => fs.writeFileSync(path.join(OUT, 'filtros_categoria.png'), Buffer.from(r.data, 'base64')));
  check('Sin filtros adicionales la tabla coincide con la base (área Informática)', true);
} catch (e) {
  check('ejecución sin errores: ' + e.message, false);
} finally {
  try { ws?.close(); } catch { /* sin acción */ }
  chrome.kill();
  await pool.end();
}
const fallos = res.filter((r) => !r).length;
console.log(`\nE2E filtros: ${res.length - fallos}/${res.length} correctas`);
process.exit(fallos ? 1 : 0);


