import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Support Base64 signature sketch canvases
app.use(morgan('dev'));

// Serve static assets from the React production build directory
app.use(express.static(path.join(__dirname, '..', 'dist')));

// Routing mount
app.use('/api', apiRouter);

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
    message: 'Error interno en el kernel del servidor de GridOps.',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

app.listen(PORT, () => {
  console.log(`⚡ SERVER OPERATING AT: http://localhost:${PORT}`);
});
