// Genera el par de claves ed25519 para la licencia de InventarioY Desktop.
// Uso: node scripts/generar-claves.mjs
// - Escribe license-private.pem en scripts/ (NUNCA distribuir; gitignored)
// - Imprime la clave PÚBLICA PEM para pegar en electron/server/license.ts
import { generateKeyPairSync, createPrivateKey, createPublicKey } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const privPath = path.join(__dirname, 'license-private.pem');

if (fs.existsSync(privPath)) {
  const privPem = fs.readFileSync(privPath, 'utf8');
  const pub = createPublicKey(createPrivateKey(privPem));
  console.log('Ya existe scripts/license-private.pem. Clave pública actual:');
  console.log(pub.export({ type: 'spki', format: 'pem' }).trim());
  process.exit(0);
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

fs.writeFileSync(privPath, privateKey, 'utf8');
console.log('Clave privada guardada en scripts/license-private.pem');
console.log('');
console.log('=== Copiá esta CLAVE PÚBLICA a electron/server/license.ts (LICENSE_PUBLIC_KEY) ===');
console.log(publicKey.trim());
