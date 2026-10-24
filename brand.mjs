// Derives web-sized brand assets from the original approved logo PNG (kept untouched in assets-src/).
import { createRequire } from 'node:module';
// sharp is not a project dependency (native module). This one-off script resolves it from a local or global install;
// the generated files in public/brand/ are committed, so normal builds never need sharp.
const require = createRequire(import.meta.url);
let sharp;
try { sharp = require('sharp'); } catch { sharp = createRequire('/opt/npm-tools/node_modules/')('sharp'); }
const src = 'assets-src/freeverse-logo-original.png';
// Square crop around the emblem (circle + orbit), excluding the wordmark below it. Measured on the 1536x1024 original.
const square = { left: 490, top: 150, width: 530, height: 530 };
await sharp(src).extract(square).resize(512).png().toFile('public/brand/emblem-512.png');
await sharp(src).extract(square).resize(96).png().toFile('public/brand/emblem-96.png');
await sharp(src).extract(square).resize(180).png().toFile('public/brand/apple-touch-icon.png');
await sharp(src).extract(square).resize(32).png().toFile('public/brand/favicon-32.png');
// Full lockup at a web-friendly size for the welcome screen.
await sharp(src).resize(960).png({ compressionLevel: 9 }).toFile('public/brand/lockup-960.png');
console.log('brand assets written', square);
