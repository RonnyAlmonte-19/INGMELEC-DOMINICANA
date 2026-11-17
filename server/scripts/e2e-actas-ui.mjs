// E2E real del módulo Actas en Chrome headless (CDP) contra http://localhost:5173 (+API 5000).
// Solo localhost y base sintética. Uso: node scripts/e2e-actas-ui.mjs <carpeta-salida>
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import mysql from 'mysql2/promise';

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const cred = Object.fromEntries(fs.readFileSync(new URL('../.env.dev-credenciales', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()]; }));
const BASE = 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const resultados = [];
const check = (nombre, ok, detalle = '') => { resultados.push({ nombre, ok }); console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ' — ' + detalle : ''}`); };

const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${path.join(os.tmpdir(), 'ingm_e2e_profile_' + Date.now())}`, '--no-first-run', '--window-size=1400,1000', 'about:blank'], { stdio: 'ignore' });
let ws; let id = 0; const pend = new Map();
try {
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch('http://127.0.0.1:9333/json')).json(); if (targets.length) break; } catch { /* esperando */ } await sleep(500); }
  const page = targets.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; pend.set(n, (d) => (d.error ? rej(new Error(d.error.message)) : res(d.result))); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'error JS'); return r.result.value; };
  globalThis.__ev = ev;
  const waitFor = async (expr, ms = 15000, msg = expr) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return true; } catch { /* reintento */ } await sleep(250); } throw new Error('Timeout: ' + msg); };
  const goto = async (url) => { await send('Page.navigate', { url }); await sleep(1200); };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });

  const helpers = `
    window.__setVal = (el, v) => { const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); };
    window.__btn = (txt, root = document) => [...root.querySelectorAll('button')].find((b) => b.textContent.includes(txt) && !b.disabled);
    window.__field = (label) => { const l = [...document.querySelectorAll('[role=dialog] label')].find((x) => x.textContent.trim().startsWith(label)); return l && l.parentElement.querySelector('input,select,textarea'); };`;

  // 1) Login
  await goto(BASE + '/');
  await waitFor(`!!document.querySelector('input[type=password]')`, 20000, 'login');
  await ev(helpers);
  await ev(`(() => { __setVal(document.querySelector('input[type=email],input[type=text]'), ${JSON.stringify(cred.EMAIL)}); __setVal(document.querySelector('input[type=password]'), ${JSON.stringify(cred.PASSWORD)}); document.querySelector('button[type=submit]').click(); })()`);
  await waitFor(`document.body.innerText.includes('Movimientos de Stock')`, 20000, 'sesión iniciada');
  check('login real en el navegador', true);

  // 2) Abrir formulario de acta desde ASIGNACION
  await goto(BASE + '/movimientos');
  await ev(helpers);
  await waitFor(`!!__btn('Registrar Movimiento')`, 15000, 'botón Registrar Movimiento');
  await waitFor(`!!__btn('Actas de Entrega')`, 8000, 'pestaña Actas (bandera activa)');
  check('pestaña "Actas de Entrega" visible con la bandera activa', true);
  await ev(`__btn('Registrar Movimiento').click()`);
  await waitFor(`!!__btn('ASIGNACION')`, 8000, 'botón ASIGNACION');
  await ev(`__btn('ASIGNACION').click()`);
  await waitFor(`document.body.innerText.includes('Acta de Entrega de Herramientas')`, 8000, 'formulario de acta');
  check('ASIGNACION abre el formulario de acta', true);

  // 3) Llenar el formulario
  await waitFor(`!!__field('Campamento') && !__field('Campamento').disabled && __field('Campamento').options.length > 1`, 10000, 'sedes cargadas en el formulario');
  await ev(`__setVal(__field('Campamento'), '1')`);
  await ev(`__setVal(__field('Nombre del colaborador'), 'Pedro Colaborador E2E')`);
  await ev(`__setVal(__field('Departamento'), 'Mantenimiento')`);
  await ev(`__setVal(__field('Supervisor'), 'Ana Supervisora E2E')`);
  await ev(`__setVal(__field('Motivo'), 'Entrega E2E de herramientas')`);
  await ev(`__setVal(__field('Observaciones'), 'Prueba automatizada del formulario completo')`);
  const agregar = async (texto) => {
    await ev(`__setVal(document.querySelector('[role=dialog] input[placeholder^="Buscar"]'), ${JSON.stringify(texto)})`);
    await waitFor(`[...document.querySelectorAll('[role=dialog] ul button')].some((b) => b.textContent.includes(${JSON.stringify(texto)}))`, 8000, 'resultado ' + texto);
    await ev(`[...document.querySelectorAll('[role=dialog] ul button')].find((b) => b.textContent.includes(${JSON.stringify(texto)}) && !b.disabled).click()`);
  };
  await agregar('Escritorio');
  await agregar('Mult');
  await waitFor(`document.querySelectorAll('[role=dialog] tbody tr').length === 2`, 5000, '2 herramientas en el acta');
  check('varias herramientas en una misma acta', true);

  // 4) Estados previos de stock en BD
  const pool = mysql.createPool({ host: '127.0.0.1', port: 3310, user: 'root', password: '', database: 'ingmelec_v22_actas_test' });
  const stock = async (n) => Number((await pool.query('SELECT cantidad_num FROM inv_articulos WHERE articulo_nombre LIKE ?', [`%${n}%`]))[0][0].cantidad_num);
  const antesTaladro = await stock('Escritorio Met'); const antesMulti = await stock('Mult');
  // cantidad del escritorio (sin serie) = 2; el multímetro (1 en stock, con serie) queda en 1 y se agotará
  await ev(`(() => { const inp = document.querySelectorAll('[role=dialog] tbody tr')[0].querySelector('input[type=number]'); __setVal(inp, '2'); })()`);
  await ev(`__btn('Confirmar y generar acta').click()`);
  try { await waitFor(`document.body.innerText.includes('ACTA DE ENTREGA DE HERRAMIENTAS')`, 15000, 'acta generada'); } catch (e) { console.log('DIALOGO:', (await ev(`(document.querySelector('[role=dialog]')||document.body).innerText.slice(-700)`))); console.log('INVALIDOS:', await ev(`[...document.querySelectorAll('[role=dialog] :invalid')].map(x=>x.outerHTML.slice(0,160)).join(' | ')`)); throw e; }
  const numero = await ev(`(document.body.innerText.match(/ACT-\\d{4}-\\d{6}/) || [])[0]`);
  check('acta generada con número automático', /^ACT-\d{4}-\d{6}$/.test(numero), numero);
  check('descuento de varias herramientas', (await stock('Escritorio Met')) === antesTaladro - 2 && (await stock('Mult')) === antesMulti - 1, `escritorio ${antesTaladro}→${await stock('Escritorio Met')}, multímetro ${antesMulti}→${await stock('Mult')}`);

  await send('Emulation.setEmulatedMedia', { media: 'print' }); await sleep(400);
  fs.writeFileSync(path.join(OUT, 'vista_impresion.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await send('Emulation.setEmulatedMedia', { media: '' });
  // 5) PDF carta con tres firmas
  const pdfB64 = (await send('Page.printToPDF', { paperWidth: 8.5, paperHeight: 11, preferCSSPageSize: true, printBackground: true })).data;
  const pdfPath = path.join(OUT, `${numero}.pdf`);
  fs.writeFileSync(pdfPath, Buffer.from(pdfB64, 'base64'));
  const raw = fs.readFileSync(pdfPath, 'latin1');
  const mb = raw.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  check('PDF tamaño carta (612x792 pt)', !!mb && Math.round(mb[1]) === 612 && Math.round(mb[2]) === 792, mb ? `${mb[1]}x${mb[2]}` : 'sin MediaBox');
  const txt = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' });
  fs.writeFileSync(path.join(OUT, `${numero}.txt`), txt);
  const paginas = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('PDF contiene solo el acta (sin menú ni formulario)', txt.includes(numero) && !txt.includes('PRINCIPAL') && !txt.includes('Inventario Maestro'));
  check('PDF con las 3 firmas', ['Quien entrega', 'Quien recibe', 'Supervisor / Coordinador'].every((s) => txt.includes(s)));
  check('PDF con datos del acta', ['Pedro Colaborador E2E', 'Ana Supervisora E2E', 'Mantenimiento', 'Escritorio'].every((s) => txt.includes(s)));
  check('PDF de una página', paginas === 1, `páginas=${paginas}`);

  // 6) Cerrar, historial, filtros y reimpresión
  await ev(`__btn('Cerrar').click()`);
  await sleep(500);
  await ev(`__btn('Actas de Entrega').click()`);
  await waitFor(`document.body.innerText.includes(${JSON.stringify(numero)})`, 10000, 'acta en historial');
  check('historial lista el acta', true);
  await ev(`__setVal(document.querySelector('input[placeholder^="N.º acta"]'), 'Pedro Colaborador')`);
  await sleep(1200);
  check('búsqueda por colaborador', await ev(`document.body.innerText.includes(${JSON.stringify(numero)})`));
  await ev(`__setVal(document.querySelector('input[placeholder^="N.º acta"]'), 'zzz-no-existe')`);
  await waitFor(`document.body.innerText.includes('No hay actas que coincidan')`, 6000, 'sin resultados');
  check('filtro sin coincidencias', true);
  await ev(`__setVal(document.querySelector('input[placeholder^="N.º acta"]'), '')`);
  await waitFor(`document.body.innerText.includes(${JSON.stringify(numero)})`, 6000, 'lista restablecida');
  const imprAntes = Number((await pool.query('SELECT impresiones FROM inv_actas_entrega WHERE numero_acta = ?', [numero]))[0][0].impresiones);
  await waitFor(`!!__btn('Ver / Reimprimir')`, 8000, 'botón Ver / Reimprimir');
  await ev(`__btn('Ver / Reimprimir').click()`);
  await waitFor(`document.body.innerText.includes('ACTA DE ENTREGA DE HERRAMIENTAS')`, 8000, 'reimpresión');
  await ev(`__btn('Imprimir / Guardar PDF').dispatchEvent(new MouseEvent('click', { bubbles: true }))`).catch(() => {});
  await sleep(1500);
  const imprDespues = Number((await pool.query('SELECT impresiones FROM inv_actas_entrega WHERE numero_acta = ?', [numero]))[0][0].impresiones);
  check('reimpresión registra el conteo de impresiones', imprDespues === imprAntes + 1, `${imprAntes}→${imprDespues}`);
  await send('Page.navigate', { url: BASE + '/movimientos' }); await sleep(1500); // descarta el diálogo de impresión headless

  // 7) AGOTADO visible tras confirmar (multímetro agotado)
  await goto(BASE + '/inventario');
  await waitFor(`document.body.innerText.includes('Inventario') && document.querySelectorAll('tbody tr').length > 0`, 20000, 'inventario');
  const hayAgotado = await waitFor(`document.body.innerText.includes('AGOTADO')`, 10000, 'AGOTADO en inventario').catch(() => false);
  check('inventario muestra AGOTADO tras confirmar el acta', hayAgotado === true);
  const sinFiltrar = await ev(`document.body.innerText.includes('Mult')`);
  check('el artículo agotado sigue visible en inventario', sinFiltrar === true);
  const [[{ a }]] = await pool.query("SELECT activo a FROM inv_articulos WHERE articulo_nombre LIKE '%Mult%'");
  check('el artículo agotado sigue activo', Number(a) === 1);
  await send('Page.captureScreenshot', { format: 'png' }).then((r) => fs.writeFileSync(path.join(OUT, 'inventario_agotado.png'), Buffer.from(r.data, 'base64')));
  // 8) Usuario con UNA sola sede (Supervisor M633): sede seleccionada y bloqueada; departamento solo por catálogo
  const argon2 = (await import('argon2')).default;
  const pass633 = `Sup${Date.now().toString(36)}9a`;
  await pool.query('UPDATE inv_usuarios SET password_hash = ?, permisos_json = ? WHERE id = 4',
    [await argon2.hash(pass633, { type: argon2.argon2id }), JSON.stringify(['act:crear', 'act:ver', 'inv:movimientos_registrar', 'inv:movimientos_ver', 'inv:ver', 'camp:ver'])]);
  const [[{ email633 }]] = await pool.query('SELECT email AS email633 FROM inv_usuarios WHERE id = 4');
  await pool.end();
  await goto(BASE + '/'); await ev(`localStorage.clear()`);
  await goto(BASE + '/');
  await waitFor(`!!document.querySelector('input[type=password]')`, 20000, 'login M633');
  await ev(helpers);
  await ev(`(() => { __setVal(document.querySelector('input[type=email],input[type=text]'), ${JSON.stringify(email633)}); __setVal(document.querySelector('input[type=password]'), ${JSON.stringify(pass633)}); document.querySelector('button[type=submit]').click(); })()`);
  await waitFor(`document.body.innerText.includes('Supervisor Sintético M633')`, 20000, 'sesión M633');
  await goto(BASE + '/movimientos'); await ev(helpers);
  await waitFor(`!!__btn('Registrar Movimiento')`, 15000, 'botón Registrar Movimiento (M633)');
  await waitFor(`!!__btn('Actas de Entrega')`, 8000, 'pestaña Actas (M633)');
  await ev(`__btn('Registrar Movimiento').click()`);
  await waitFor(`!!__btn('ASIGNACION')`, 8000, 'ASIGNACION (M633)');
  await ev(`__btn('ASIGNACION').click()`);
  await waitFor(`document.body.innerText.includes('Acta de Entrega de Herramientas')`, 8000, 'formulario (M633)');
  await waitFor(`(__field('Campamento')?.options.length || 0) > 1 || (__field('Campamento')?.value === '4')`, 8000, 'opciones de sede cargadas');
  const sede = await ev(`(() => { const s = __field('Campamento'); return { value: s.value, disabled: s.disabled, opciones: [...s.options].filter((o) => o.value).map((o) => o.textContent) }; })()`);
  check('M633: sede MANTENIMIENTO 633 seleccionada automáticamente', sede.value === '4', JSON.stringify(sede.opciones));
  check('M633: sede bloqueada y sin otras opciones', sede.disabled === true && sede.opciones.length === 1);
  const depto = await ev(`(() => { const d = __field('Departamento'); return { tag: d.tagName, opciones: [...d.options].map((o) => o.textContent) }; })()`);
  check('Departamento es un selector de catálogo (no texto libre)', depto.tag === 'SELECT' && depto.opciones.includes('Mantenimiento'), depto.opciones.join(' | ').slice(0, 90));
  await send('Page.captureScreenshot', { format: 'png' }).then((r) => fs.writeFileSync(path.join(OUT, 'formulario_sede_bloqueada.png'), Buffer.from(r.data, 'base64')));
} catch (e) {
  check('ejecución sin errores', false, e.message);
  try { console.log('PANTALLA:', await globalThis.__ev('document.body.innerText.slice(0, 600)'), '\nHTML dialogo:', await globalThis.__ev("(document.querySelector('[role=dialog]')||document.body).innerHTML.slice(0, 900)")); } catch { /* sin acción */ }
  try { console.log('CAMPOS:', await globalThis.__ev("['Campamento','Nombre del colaborador','Departamento','Supervisor','Motivo','Observaciones'].map((l) => l + ':' + !!__field(l)).join(' ')")); } catch { /* sin acción */ }
} finally {
  try { ws?.close(); } catch { /* sin acción */ }
  chrome.kill();
}
const fallos = resultados.filter((r) => !r.ok).length;
console.log(`\nE2E: ${resultados.length - fallos}/${resultados.length} correctas`);
process.exit(fallos ? 1 : 0);







