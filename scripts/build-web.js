// scripts/build-web.js
const esbuild = require('esbuild');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const isProd = process.env.NODE_ENV === 'production';

console.log('=== Building web bundle ===');
console.log('Mode:', isProd ? 'production' : 'development');

esbuild.build({
    entryPoints: [path.join(ROOT, 'web', 'app.jsx')],
    bundle: true,
    outfile: path.join(ROOT, 'dist', 'web.bundle.js'),
    format: 'esm',
    target: ['es2020'],
    jsx: 'transform',
    minify: isProd,
    sourcemap: !isProd,
    logLevel: 'info',
    external: [
        'react',
        'react-dom',
        'react-dom/client',
        'reactflow',
        'dagre'
    ],
    define: {
        'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development')
    }
}).then(function() {
    console.log('✓ Bundle built: dist/web.bundle.js');
}).catch(function(err) {
    console.error('✗ Build failed:', err);
    process.exit(1);
});