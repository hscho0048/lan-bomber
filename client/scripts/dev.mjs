import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, rm, copyFile } from 'node:fs/promises';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..'); // client/
const srcDir = path.join(root, 'src');
const distDir = path.join(root, 'dist');

async function copyStatic() {
  await copyFile(path.join(srcDir, 'index.html'), path.join(distDir, 'index.html'));
  await copyFile(path.join(srcDir, 'styles.css'), path.join(distDir, 'styles.css'));
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await copyStatic();

const define = {
  'process.env.NODE_ENV': '"development"'
};

const ctxRenderer = await esbuild.context({
  entryPoints: [path.join(srcDir, 'renderer', 'index.ts')],
  outfile: path.join(distDir, 'renderer.js'),
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  sourcemap: true,
  define
});

await ctxRenderer.watch();

// Copy static files on change
const staticWatcher = fs.watch(srcDir, { recursive: false }, async (_eventType, filename) => {
  if (!filename) return;
  if (filename === 'index.html' || filename === 'styles.css') {
    try {
      await copyStatic();
    } catch {
      // ignore
    }
  }
});

console.log('[dev] client web assets watching:', distDir);

async function cleanup() {
  try {
    staticWatcher.close();
  } catch {
    // ignore
  }
  try {
    await ctxRenderer.dispose();
  } catch {
    // ignore
  }
}

process.on('SIGINT', () => {
  cleanup().finally(() => process.exit(0));
});
