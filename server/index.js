import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import almacenRouter from './routes/almacenApi.js';
import { validateAndGetJwtSecret } from './config/auth.js';

// Validar que JWT_SECRET exista y sea seguro antes de inicializar la app
validateAndGetJwtSecret();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());

// Encabezados de seguridad defensiva HTTP (OWASP / Enterprise)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(express.json({ limit: '10mb' })); // Support Base64 signature sketch canvases
app.use(morgan('dev'));

// Serve static assets from the React production build directory
app.use(express.static(path.join(__dirname, '..', 'dist')));

// Healthcheck ligero para Render / balanceadores de carga
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'INGMELEC | ALMACÉN GENERAL', timestamp: new Date().toISOString() });
});

// Routing mount - Único router oficial para INGMELEC | ALMACÉN GENERAL
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
app.use((err, req, res, next) => {
  console.error('❌ ERROR OPERATIVO DE BACKEND:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Error interno en el servidor de INGMELEC | ALMACÉN GENERAL.',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

app.listen(PORT, () => {
  console.log(`⚡ SERVER OPERATING AT: http://localhost:${PORT}`);
});
