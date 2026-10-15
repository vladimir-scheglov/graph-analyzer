#!/usr/bin/env node
// scripts/replace-icons.js
// Заменяет эмодзи на Material Symbols иконки через компонент MIcon.
//
// Использование:
//   node scripts/replace-icons.js web/app.jsx --dry-run --verbose
//   node scripts/replace-icons.js web/app.jsx
//
// По умолчанию делает бэкап рядом (file.bak).

const fs = require('fs');
const path = require('path');

// Словарь эмодзи → material symbol name.
// ВАЖНО: здесь только те символы, которые мы точно хотим заменить.
// Не добавляйте сюда обычные буквы или часто встречающиеся символы.
const ICON_MAP = {
  // Тулбар
  '🌐': 'language',
  '⛶': 'fit_screen',
  '⟳': 'refresh',
  '↺': 'restart_alt',
  '←': 'arrow_back',
  '→': 'arrow_forward',
  '🔍': 'search',
  '🔎': 'filter_alt',
  '⚙️': 'tune',
  '⚙': 'tune',
  '📊': 'bar_chart',
  '🎨': 'palette',
  '💾': 'save',
  '📖': 'menu_book',
  '⌨️': 'keyboard',
  '⌨': 'keyboard',

  // Анализ
  '🔁': 'cycle',
  '◯': 'radio_button_unchecked',
  '🗂': 'category',
  '📦': 'inventory_2',
  '🧬': 'account_tree',
  '⛔': 'block',
  '🎯': 'my_location',
  '🛤️': 'route',
  '🛤': 'route',
  '📐': 'straighten',

  // Вид / темы
  '🔥': 'local_fire_department',
  '☀️': 'light_mode',
  '☀': 'light_mode',
  '🌙': 'dark_mode',
  '🏷': 'label',
  '⚫': 'circle',

  // Фильтры
  '★': 'star',
  '☆': 'star',
  '❌': 'cancel',
  '🗑': 'delete_sweep',
  '🔌': 'power_off',
  '🚫': 'block',
  '💬': 'chat_bubble',
  '👁': 'visibility_off',

  // Данные
  '⇄': 'swap_horiz',
  '📝': 'description',
  '🖼️': 'image',
  '🖼': 'image',

  // Панели / ссылки
  '📂': 'folder_open',
  '📁': 'folder',
  '📋': 'content_copy',
  '📄': 'description',
  '✕': 'close',
  '✖': 'close',
  '✓': 'check',
  '✔': 'check',

  // Статусы
  '⚠️': 'warning',
  '⚠': 'warning',
  '✅': 'check_circle',
  '❗': 'priority_high',

  // Модалки
  '🚪': 'login',
  '🔗': 'link',
  '💥': 'bolt',
  '📌': 'push_pin',
  '🎓': 'school',
  '📅': 'calendar_today',
  '📈': 'trending_up',
  '🔬': 'science',
  '🕸': 'hub',
  '🧩': 'extension',
  '➕': 'add',
  '➖': 'remove',
  '▶': 'play_arrow',
  '❚❚': 'pause',
  '■': 'stop',
  '◀': 'chevron_left',
  '▸': 'chevron_right',
  '▾': 'expand_more',
  '▴': 'expand_less'
};

function parseArgs() {
  const args = process.argv.slice(2);
  const file = args.find(function(a) { return !a.startsWith('--'); });
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  return { file: file, dryRun: dryRun, verbose: verbose };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceInLine(line, lineNumber, usedIcons, changes, verbose) {
  var newLine = line;

  // 1. JSX-замены: '🔁' → React.createElement(MIcon, { name: 'cycle' })
  Object.keys(ICON_MAP).forEach(function(emoji) {
    var name = ICON_MAP[emoji];
    var e = escapeRegex(emoji);

    // Пропускаем конкатенацию
    var concatRegex = new RegExp("[+]\\s*['\"]" + e + "['\"]|['\"]" + e + "['\"]\\s*[+]");
    if (concatRegex.test(line)) return;

    // Пропускаем стрелку → в текстовом контексте (между буквами/цифрами/пробелами)
    if (emoji === '→' || emoji === '←') {
      // Если стрелка окружена пробелами и текстом с обеих сторон — не трогаем
      var textContext = new RegExp('\\w\\s*' + e + '\\s*\\w');
      if (textContext.test(line)) return;
    }

    var singleQuoted = new RegExp("'" + e + "'", 'g');
    var doubleQuoted = new RegExp('"' + e + '"', 'g');
    var replacement = "React.createElement(MIcon, { name: '" + name + "' })";

    var before = newLine;
    newLine = newLine.replace(singleQuoted, replacement);
    newLine = newLine.replace(doubleQuoted, replacement);

    if (newLine !== before) {
      usedIcons.add(emoji);
      changes.push({ line: lineNumber, emoji: emoji, name: name, kind: 'jsx' });
    }
  });

  // 2. HTML-замены: <span>🔁</span> → <span class="material-symbols-outlined mi-sm">cycle</span>
  if (newLine.indexOf('<') !== -1) {
    Object.keys(ICON_MAP).forEach(function(emoji) {
      if (newLine.indexOf(emoji) === -1) return;

      // То же правило для стрелок
      if (emoji === '→' || emoji === '←') {
        var textContext = new RegExp('\\w\\s*' + escapeRegex(emoji) + '\\s*\\w');
        if (textContext.test(newLine)) return;
      }

      var name = ICON_MAP[emoji];
      var e = escapeRegex(emoji);
      var regex = new RegExp(e, 'g');
      var replacement = '<span class="material-symbols-outlined mi-sm">' + name + '</span>';
      var before = newLine;
      newLine = newLine.replace(regex, replacement);
      if (newLine !== before) {
        usedIcons.add(emoji);
        changes.push({ line: lineNumber, emoji: emoji, name: name, kind: 'html' });
      }
    });
  }

  return newLine;
}

function processFile(file, verbose) {
  var content = fs.readFileSync(file, 'utf8');
  var lines = content.split('\n');
  var usedIcons = new Set();
  var changes = [];

  var newLines = lines.map(function(line, idx) {
    return replaceInLine(line, idx + 1, usedIcons, changes, verbose);
  });

  return {
    newContent: newLines.join('\n'),
    usedIcons: usedIcons,
    changes: changes,
    totalLines: lines.length
  };
}

function main() {
  var opts = parseArgs();

  if (!opts.file) {
    console.error('Usage: node scripts/replace-icons.js <file> [--dry-run] [--verbose]');
    process.exit(1);
  }

  if (!fs.existsSync(opts.file)) {
    console.error('File not found:', opts.file);
    process.exit(1);
  }

  console.log('=== Icon replacement ===');
  console.log('File:    ', opts.file);
  console.log('Mode:    ', opts.dryRun ? 'DRY RUN (no changes)' : 'APPLY');
  console.log('Verbose: ', opts.verbose);
  console.log('');

  var result = processFile(opts.file, opts.verbose);

  console.log('Total lines:', result.totalLines);
  console.log('Unique icons replaced:', result.usedIcons.size);
  if (result.usedIcons.size > 0) {
    console.log('Icons:');
    Array.from(result.usedIcons).sort().forEach(function(e) {
      console.log('  ' + e + '  →  ' + ICON_MAP[e]);
    });
  }
  console.log('Total replacements:', result.changes.length);

  if (opts.verbose && result.changes.length > 0) {
    console.log('\n=== Replacements preview (first 50) ===');
    result.changes.slice(0, 50).forEach(function(c) {
      console.log('  Line ' + c.line + '  [' + c.kind + ']  ' + c.emoji + '  →  ' + c.name);
    });
    if (result.changes.length > 50) {
      console.log('  ... and ' + (result.changes.length - 50) + ' more');
    }
  }

  if (opts.dryRun) {
    console.log('\nDry run — no changes applied.');
    console.log('Run without --dry-run to apply.');
    return;
  }

  if (result.changes.length === 0) {
    console.log('\nNothing to replace.');
    return;
  }

  var backup = opts.file + '.bak';
  fs.writeFileSync(backup, fs.readFileSync(opts.file));
  console.log('\nBackup saved:', backup);

  fs.writeFileSync(opts.file, result.newContent, 'utf8');
  console.log('Written to: ', opts.file);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Проверьте diff: diff ' + opts.file + ' ' + backup);
  console.log('  2. npm run build:web');
  console.log('  3. Обновите страницу с Cmd+Shift+R');
  console.log('  4. Если что-то не так — верните: mv ' + backup + ' ' + opts.file);
}

main();