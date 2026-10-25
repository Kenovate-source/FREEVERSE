// Production build: bundles src/main.tsx (+ imported CSS) into dist/app.js and dist/app.css, copies public/ assets.
// IIFE format + relative URLs + hash routing => dist/index.html also works when opened directly from disk (file://).
import { build } from 'esbuild';
import { cp, rm, mkdir } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await build({
  entryPoints: { app: 'src/main.tsx' },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'es2022',
  jsx: 'automatic',
  minify: true,
  sourcemap: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.png': 'file', '.svg': 'text', '.woff2': 'file', '.woff': 'file' },
  logLevel: 'info',
});
// The 3D scene (three.js + GSAP ScrollTrigger) is a separate, lazily loaded script so the app and landing page never wait for it.
await build({
  entryPoints: { immersive: 'src/immersive/index.ts' },
  outdir: 'dist', bundle: true, format: 'iife', target: 'es2022', minify: true, sourcemap: true,
  define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'info',
});
await cp('public', 'dist', { recursive: true });
console.log('build complete -> dist/');
