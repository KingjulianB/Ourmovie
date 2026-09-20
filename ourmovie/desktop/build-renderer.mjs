import * as esbuild from 'esbuild';
import { mkdirSync, copyFileSync } from 'node:fs';

// main.ts et preload-webview.ts tournent dans un contexte Node (Electron) et sont
// compilés par tsc seul (require() résout socket.io-client normalement via node_modules).
// renderer.ts tourne dans la page du panneau app (pas de Node, nodeIntegration: false) :
// il a besoin d'être bundlé comme n'importe quel script navigateur.
await esbuild.build({
  entryPoints: ['src/renderer/renderer.ts'],
  outfile: 'dist/renderer/renderer.js',
  bundle: true,
  format: 'iife',
  target: 'es2022',
  platform: 'browser',
  logLevel: 'info',
});

mkdirSync('dist/renderer', { recursive: true });
copyFileSync('src/renderer/index.html', 'dist/renderer/index.html');
copyFileSync('src/renderer/renderer.css', 'dist/renderer/renderer.css');
