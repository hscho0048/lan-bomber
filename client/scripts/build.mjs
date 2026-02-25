import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, rm, copyFile } from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');
const distDir = path.join(root, 'dist');

async function copyStatic() {
  await copyFile(path.join(srcDir, 'index.html'), path.join(distDir, 'index.html'));
  await copyFile(path.join(srcDir, 'styles.css'), path.join(distDir, 'styles.css'));
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await copyStatic();

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
