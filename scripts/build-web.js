const esbuild = require('esbuild');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const isProd = process.env.NODE_ENV === 'production';

async function build() {
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/web/entry.tsx')],
    bundle: true,
    outfile: path.join(ROOT, 'dist/web.bundle.js'),
    format: 'esm',
    target: ['es2020'],
    jsx: 'automatic',
    minify: isProd,
    sourcemap: !isProd,
    logLevel: 'info',
    external: [
      'react',
      'react-dom',
      'react-dom/client',
      'reactflow',
      'dagre',
      'zustand'
    ],
    define: {
      'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development')
    }
  });

  await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/web/styles/index.css')],
    bundle: true,
    outfile: path.join(ROOT, 'dist/web.bundle.css'),
    minify: isProd,
    logLevel: 'info'
  });

  console.log('✓ Bundles built: dist/web.bundle.js, dist/web.bundle.css');
}

build().catch((err) => {
  console.error('✗ Build failed:', err);
  process.exit(1);
});