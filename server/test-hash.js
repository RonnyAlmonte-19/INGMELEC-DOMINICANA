import crypto from 'crypto';

const stored = "062bf534a77f9ca58caefff2480e24e7:2e166d9aa4262d48b49f6c80e9e77a5c7c5d355c6c1355daa06aae73039ff5defc76947e6d097b41ab9426df0dae0b244c2566e2e88d5df4203480cba19f4dce";

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const checkHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === checkHash;
}

const match = verifyPassword('1234', stored);
console.log('🗝️  ¿La contraseña "1234" coincide con el hash de dev de tu base de datos?', match ? 'SÍ, COINCIDE CORRECTAMENTE' : 'NO COINCIDE');
