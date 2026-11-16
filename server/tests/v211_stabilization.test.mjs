import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function createMockDomEnvironment() {
  const listeners = new Map();
  const bodyChildren = [];

  function makeNode(nodeType, tagName = null, text = '') {
    const node = {
      nodeType,
      tagName,
      style: {},
      children: [],
      textContent: text,
      appendChild(child) {
        this.children.push(child);
        return child;
      }
    };
    return node;
  }

  const document = {
    body: {
      children: bodyChildren,
      appendChild(child) {
        bodyChildren.push(child);
        return child;
      }
    },
    createElement(tag) {
      return makeNode(1, String(tag).toUpperCase());
    },
    createTextNode(text) {
      return makeNode(3, null, String(text));
    }
  };

  const windowObj = {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatch(type, event) {
      for (const fn of listeners.get(type) || []) {
        fn(event);
      }
    }
  };

  return { windowObj, document, bodyChildren };
}

function collectNodes(node, acc = []) {
  acc.push(node);
  for (const child of node.children || []) {
    collectNodes(child, acc);
  }
  return acc;
}

describe('INGMELEC v2.1.1 — Estabilización XSS, CSP, CORS y Dependencias', () => {
  test('1. index.html y dist/index.html no contienen scripts inline y cargan /error-trap.js', () => {
    const indexHtml = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
    assert.match(indexHtml, /<script\s+src="\/error-trap\.js"><\/script>/i);
    assert.doesNotMatch(indexHtml, /<script(?![^>]*\bsrc=)[^>]*>/i);
    assert.doesNotMatch(indexHtml, /innerHTML/i);

    const distIndexPath = path.join(REPO_ROOT, 'dist', 'index.html');
    if (fs.existsSync(distIndexPath)) {
      const distHtml = fs.readFileSync(distIndexPath, 'utf8');
      assert.match(distHtml, /<script\s+src="\/error-trap\.js"><\/script>/i);
      assert.doesNotMatch(distHtml, /<script(?![^>]*\bsrc=)[^>]*>/i);
      assert.ok(fs.existsSync(path.join(REPO_ROOT, 'dist', 'error-trap.js')));
    }
  });

  test('2. public/error-trap.js no usa innerHTML y neutraliza payloads XSS vía textContent/TextNode', () => {
    const trapSource = fs.readFileSync(path.join(REPO_ROOT, 'public', 'error-trap.js'), 'utf8');
    assert.doesNotMatch(trapSource, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/i);

    const { windowObj, document, bodyChildren } = createMockDomEnvironment();
    windowObj.location = { hostname: 'localhost' };
    const context = vm.createContext({
      window: windowObj,
      document,
      Error
    });
    vm.runInContext(trapSource, context);

    const xssMessage = '<img src=x onerror=alert(1)>';
    const xssStack = '<script>alert("xss")</script>';
    windowObj.dispatch('error', {
      message: xssMessage,
      error: { stack: xssStack }
    });

    const xssReason = '<svg onload=alert(3)>';
    windowObj.dispatch('unhandledrejection', {
      reason: xssReason
    });

    assert.equal(bodyChildren.length, 2);

    const allNodes = [
      ...collectNodes(bodyChildren[0]),
      ...collectNodes(bodyChildren[1])
    ];
    const elementTags = allNodes.filter((n) => n.nodeType === 1).map((n) => n.tagName);
    assert.ok(!elementTags.includes('IMG'));
    assert.ok(!elementTags.includes('SCRIPT'));
    assert.ok(!elementTags.includes('SVG'));

    const textNodes = allNodes.filter((n) => n.nodeType === 3).map((n) => n.textContent);
    assert.ok(textNodes.includes(xssMessage));
    assert.ok(textNodes.includes(xssStack));
    assert.ok(textNodes.includes(xssReason));

    // En producción (hostname distinto de localhost/127.0.0.1) oculta stacks y mensajes técnicos
    const prodEnv = createMockDomEnvironment();
    prodEnv.windowObj.location = { hostname: 'ingmelec-dominicana.onrender.com' };
    vm.runInContext(trapSource, vm.createContext({ window: prodEnv.windowObj, document: prodEnv.document, Error }));
    prodEnv.windowObj.dispatch('error', {
      message: 'Secret SQL path /app/server/index.js',
      error: { stack: 'Error: Secret stack' }
    });
    prodEnv.windowObj.dispatch('unhandledrejection', {
      reason: 'Internal stack trace detail'
    });
    assert.equal(prodEnv.bodyChildren.length, 2);
    const prodText = [
      ...collectNodes(prodEnv.bodyChildren[0]),
      ...collectNodes(prodEnv.bodyChildren[1])
    ].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ');
    assert.doesNotMatch(prodText, /Secret SQL path|Secret stack|Internal stack trace/);
    assert.match(prodText, /error inesperado en la interfaz/i);
  });

  test('3. server/index.js retira unsafe-inline de script-src, conserva style-src y valida CORS por lista blanca', () => {
    const serverIndex = fs.readFileSync(path.join(REPO_ROOT, 'server', 'index.js'), 'utf8');

    const cspMatch = serverIndex.match(/'Content-Security-Policy',\s*\r?\n\s*"([^"]+)"/);
    assert.ok(cspMatch, 'Debe existir cabecera Content-Security-Policy');
    const csp = cspMatch[1];
    assert.match(csp, /script-src 'self'(?:;|$)/);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
    assert.match(csp, /style-src 'self' 'unsafe-inline' https:\/\/fonts\.googleapis\.com/);

    // Verificar que express.static se monta antes del middleware CORS de API
    const staticPos = serverIndex.indexOf("app.use(express.static(path.join(__dirname, '..', 'dist')))");
    const corsFilterPos = serverIndex.indexOf('if (origin && !isOriginAllowed(origin))');
    assert.ok(staticPos > 0 && corsFilterPos > 0 && staticPos < corsFilterPos);

    // Extraer y probar funciones puras parseCorsOrigins / isLocalDevOrigin / isOriginAllowed sin confiar en Host
    const fnBlockMatch = serverIndex.match(/function parseCorsOrigins[\s\S]*?function isOriginAllowed[\s\S]*?\n\}/);
    assert.ok(fnBlockMatch, 'Deben existir las funciones CORS');
    assert.doesNotMatch(fnBlockMatch[0], /req\.headers\.host|req\.get\(['"]host['"]\)/i);

    const sandboxProd = {
      URL,
      process: {
        env: {
          NODE_ENV: 'production',
          CORS_ORIGINS: 'https://ingmelec-dominicana.onrender.com'
        }
      }
    };
    vm.runInNewContext(fnBlockMatch[0], sandboxProd);

    assert.equal(sandboxProd.isOriginAllowed('https://ingmelec-dominicana.onrender.com'), true);
    assert.equal(sandboxProd.isOriginAllowed('https://attacker.example'), false);
    assert.equal(sandboxProd.isOriginAllowed('http://localhost:5173'), false);
    assert.equal(sandboxProd.isOriginAllowed('null'), false);
    assert.equal(sandboxProd.isOriginAllowed(undefined), true);
  });

  test('4. server/package.json no contiene dependencia xlsx ni imports en server/', () => {
    const serverPkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'server', 'package.json'), 'utf8'));
    assert.equal(serverPkg.dependencies?.xlsx, undefined);
    assert.equal(serverPkg.devDependencies?.xlsx, undefined);

    const serverIndex = fs.readFileSync(path.join(REPO_ROOT, 'server', 'index.js'), 'utf8');
    const apiFile = fs.readFileSync(path.join(REPO_ROOT, 'server', 'routes', 'almacenApi.js'), 'utf8');
    assert.doesNotMatch(serverIndex, /from\s+['"]xlsx['"]|require\(['"]xlsx['"]\)/);
    assert.doesNotMatch(apiFile, /from\s+['"]xlsx['"]|require\(['"]xlsx['"]\)/);
  });

  test('5. recovery-developer.js exige verificación hostname TLS y revoca sesiones con token_version', () => {
    const recoverySrc = fs.readFileSync(path.join(REPO_ROOT, 'server', 'scripts', 'recovery-developer.js'), 'utf8');
    assert.match(recoverySrc, /rejectUnauthorized:\s*true/);
    assert.doesNotMatch(recoverySrc, /checkServerIdentity\s*:\s*\(\)\s*=>\s*undefined/);
    assert.match(recoverySrc, /token_version\s*=\s*COALESCE\(token_version,\s*1\)\s*\+\s*1/);
  });
});
