import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno de forma determinista
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const MIN_JWT_SECRET_LENGTH = 32;
const FORBIDDEN_SECRETS = [
  'ingmelec-almacen-enterprise-jwt-token-key-2026',
  'ingmelec_super_secret_jwt_key_2026_enterprise',
  'gridops-enterprise-hyper-secure-key-2026',
  'secret',
  'jwt_secret',
  'change_me',
  '12345678',
  'password'
];

let cachedSecret = null;

/**
 * Valida de forma estricta la existencia y robustez de JWT_SECRET.
 * Si la clave falta, es menor a 32 caracteres o coincide con valores por defecto prohibidos,
 * el proceso se aborta inmediatamente con código de salida 1.
 */
export function validateAndGetJwtSecret() {
  if (cachedSecret) {
    return cachedSecret;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret || typeof secret !== 'string' || secret.trim().length === 0) {
    console.error('\n❌ [SEGURIDAD FATAL] JWT_SECRET no está configurado en las variables de entorno.');
    console.error('El servidor rechaza el arranque por política corporativa de seguridad.');
    console.error('Configure una clave criptográfica de al menos 32 caracteres en server/.env o en el entorno de despliegue.\n');
    process.exit(1);
  }

  const trimmed = secret.trim();
  if (trimmed.length < MIN_JWT_SECRET_LENGTH) {
    console.error(`\n❌ [SEGURIDAD FATAL] JWT_SECRET es demasiado corto (${trimmed.length} caracteres). Se exige un mínimo de ${MIN_JWT_SECRET_LENGTH} caracteres.`);
    console.error('El servidor rechaza el arranque por política corporativa de seguridad.\n');
    process.exit(1);
  }

  if (FORBIDDEN_SECRETS.includes(trimmed.toLowerCase())) {
    console.error('\n❌ [SEGURIDAD FATAL] JWT_SECRET utiliza una clave predeterminada o insegura conocida.');
    console.error('El servidor rechaza el arranque por política corporativa de seguridad. Genere un secreto aleatorio seguro.\n');
    process.exit(1);
  }

  cachedSecret = trimmed;
  return cachedSecret;
}
