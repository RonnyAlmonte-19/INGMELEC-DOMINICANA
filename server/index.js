import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import almacenRouter from './routes/almacenApi.js';
import actasRouter from './routes/actasApi.js';
import { validateAndGetJwtSecret } from './config/auth.js';

// Validar que JWT_SECRET exista y sea seguro antes de inicializar la app
validateAndGetJwtSecret();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

function resolveTrustProxy(rawValue) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
    return 1;
  }
  const normalized = String(rawValue).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return 1;
  if (normalized === 'false' || normalized === '0') return false;
  if (/^\d+$/.test(normalized)) {
    return Number.parseInt(normalized, 10);
  }
  return String(rawValue).trim();
}

function parseCorsOrigins(rawValue) {
  return String(rawValue || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isLocalDevOrigin(origin) {
  try {
    const parsed = new URL(origin);
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    return isHttp && isLocalHost;
  } catch {
    return false;
  }
}

function isOriginAllowed(origin) {
  if (!origin) return true; // Solicitudes same-origin sin cabecera Origin, curl o healthchecks internos
  if (origin === 'null') return false;

  const whitelist = parseCorsOrigins(process.env.CORS_ORIGINS);
  if (whitelist.length > 0) {
    return whitelist.includes(origin);
  }

  if (process.env.NODE_ENV !== 'production') {
    return isLocalDevOrigin(origin);
  }

  return false;
}

app.disable('x-powered-by');
app.set('trust proxy', resolveTrustProxy(process.env.TRUST_PROXY));

// Encabezados de seguridad defensiva HTTP (OWASP / Enterprise)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'"
  );
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Serve static assets from the React production build directory (antes del control CORS de API)
app.use(express.static(path.join(__dirname, '..', 'dist')));

// Control estricto de CORS por lista blanca (sin fallback abierto *)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !isOriginAllowed(origin)) {
    return res.status(403).json({
      success: false,
      message: 'Origen CORS no autorizado.'
    });
  }
  next();
});

app.use(cors({
  origin: (origin, callback) => {
    callback(null, Boolean(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
}));

// Límites diferenciados de payload JSON: 10 MB solo en rutas con evidencia Base64 o lotes importados; 1 MB global
const json10mb = express.json({ limit: '10mb' });
const json1mb = express.json({ limit: '1mb' });

app.post('/api/v2/articulos', json10mb);
app.put('/api/v2/articulos/:id', json10mb);
app.post('/api/v2/levantamientos/:id/items', json10mb);
app.put('/api/v2/levantamientos/:id/items/:itemId', json10mb);
app.post('/api/v2/levantamientos/:id/import-items', json10mb);
app.use(json1mb);

app.use(morgan('dev'));

// Healthcheck ligero para Render / balanceadores de carga
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'INGMELEC | ALMACÉN GENERAL', timestamp: new Date().toISOString() });
});

// Modo Mantenimiento Defensivo: impide escrituras (POST, PUT, PATCH, DELETE) durante despliegues o migraciones
if (String(process.env.MAINTENANCE_MODE || '').trim().toLowerCase() === 'true') {
  app.use('/api/v2', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return res.status(503).json({
        success: false,
        message: 'El sistema se encuentra en MODO MANTENIMIENTO por actualización programada. No se permiten modificaciones en este momento.'
      });
    }
    next();
  });
}

// Routing mount - Único router oficial para INGMELEC | ALMACÉN GENERAL
app.use('/api/v2', actasRouter); // v2.2: Actas (404 si ACTAS_ENABLED != true)
app.use('/api/v2', almacenRouter);

// Bloqueo explícito del router legado /api (desmontado por seguridad defensiva)
app.all('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint legado /api desmantelado. Utilice /api/v2.' });
});
app.all('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint legado /api desmantelado. Utilice /api/v2.' });
});

// Fallback to React index.html for SPA client routing (non-API routes)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

// Handling Errors
app.use((err, req, res, _next) => {
  if (err?.type === 'entity.too.large' || err?.status === 413 || err?.statusCode === 413) {
    return res.status(413).json({
      success: false,
      message: 'El cuerpo de la solicitud excede el límite máximo permitido.'
    });
  }
  if (err instanceof SyntaxError && (err?.status === 400 || err?.statusCode === 400) && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'JSON inválido en el cuerpo de la solicitud.'
    });
  }
  console.error('❌ ERROR OPERATIVO DE BACKEND:', err.stack);
  res.status(err?.status || err?.statusCode || 500).json({
    success: false,
    message: 'Error interno en el servidor de INGMELEC | ALMACÉN GENERAL.',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

app.listen(PORT, () => {
  console.log(`⚡ SERVER OPERATING AT: http://localhost:${PORT}`);
});
