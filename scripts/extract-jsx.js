// scripts/extract-jsx.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'graph-analyzer.js');
const BACKUP = path.join(ROOT, 'graph-analyzer.js.bak');
const OUT_DIR = path.join(ROOT, 'web');
const OUT_FILE = path.join(OUT_DIR, 'app.jsx');

const START_TAG = '<script type="text/babel" data-type="module" data-presets="react">';
const END_TAG = '</script>';
const REPLACEMENT = '<script type="module" src="/web.bundle.js"></script>';

console.log('=== Extracting JSX ===');

// 1. Бэкап
if (!fs.existsSync(BACKUP)) {
    fs.copyFileSync(SOURCE, BACKUP);
    console.log('✓ Backup created:', BACKUP);
} else {
    console.log('✓ Backup already exists:', BACKUP);
}

// 2. Читаем исходник
let content = fs.readFileSync(SOURCE, 'utf8');

// 3. Находим блок Babel
const startIdx = content.indexOf(START_TAG);
if (startIdx === -1) {
    console.error('✗ Не найден <script type="text/babel">');
    process.exit(1);
}

const endIdx = content.indexOf(END_TAG, startIdx + START_TAG.length);
if (endIdx === -1) {
    console.error('✗ Не найден закрывающий </script>');
    process.exit(1);
}

let jsx = content.slice(startIdx + START_TAG.length, endIdx);

// 4. Убираем лишние переводы строк в начале/конце
jsx = jsx.replace(/^\s*\n/, '').replace(/\n\s*$/, '');

// 5. Раскрываем escape-последовательности template literal
//    Порядок важен: сначала backtick и $, потом двойной backslash
jsx = jsx
    .replace(/\\`/g, '`')
    .replace(/\\\$\{/g, '${')
    .replace(/\\\\/g, '\\');

// 6. Сохраняем
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, jsx, 'utf8');
console.log('✓ Extracted to:', OUT_FILE);
console.log('  Size:', jsx.length, 'chars,', jsx.split('\n').length, 'lines');

// 7. Заменяем блок в graph-analyzer.js
const before = content.slice(0, startIdx);
const after = content.slice(endIdx + END_TAG.length);
const newContent = before + REPLACEMENT + after;
fs.writeFileSync(SOURCE, newContent, 'utf8');
console.log('✓ Replaced Babel block in graph-analyzer.js with:', REPLACEMENT);

// 8. Также убираем подключение Babel из <head>
const babelScriptRegex = /\s*<script src="https:\/\/unpkg\.com\/@babel\/standalone[^"]*"><\/script>\s*/g;
let removed = 0;
const content2 = fs.readFileSync(SOURCE, 'utf8');
const newContent2 = content2.replace(babelScriptRegex, function() {
    removed++;
    return '\n';
});
if (removed > 0) {
    fs.writeFileSync(SOURCE, newContent2, 'utf8');
    console.log('✓ Removed Babel script tag from <head>');
} else {
    console.log('⚠ Babel script tag in <head> not found (проверьте вручную)');
}

console.log('\n=== Done ===');
console.log('Дальше: npm run build:web');