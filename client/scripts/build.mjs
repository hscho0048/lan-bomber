import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, rm, copyFile, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');
const distDir = path.join(root, 'dist');
const repoRoot = path.resolve(root, '..');

async function copyStatic() {
  await copyFile(path.join(srcDir, 'index.html'), path.join(distDir, 'index.html'));
  await copyFile(path.join(srcDir, 'styles.css'), path.join(distDir, 'styles.css'));
}

async function copyAssests() {
  const assestsSrc = path.join(repoRoot, 'assests');
  const assestsDist = path.join(distDir, 'assests');
  if (existsSync(assestsSrc)) {
    await cp(assestsSrc, assestsDist, { recursive: true });
    console.log('Assets copied to dist/assests/');
  } else {
    console.warn('Warning: assests folder not found at', assestsSrc);
  }
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await copyStatic();
await copyAssests();

const commonDefine = {
  'process.env.NODE_ENV': '"production"'
};

await esbuild.build({
  entryPoints: [path.join(srcDir, 'renderer', 'index.ts')],
  outfile: path.join(distDir, 'renderer.js'),
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  sourcemap: true,
  define: commonDefine
});

console.log('Client build complete:', distDir);
