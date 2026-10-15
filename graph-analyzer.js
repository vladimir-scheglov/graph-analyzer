// graph-analyzer.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
let remoteCredentials = null;
let currentValidation = null;

// ============ REMOTE MODE ============

function parseArgs(argv) {
  const result = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        result.flags[key] = next;
        i++;
      } else {
        result.flags[key] = true;
      }
    } else {
      result.positional.push(a);
    }
  }
  return result;
}

const IS_TTY = !!process.stdout.isTTY;

function writeProgress(text) {
  if (!IS_TTY) return;
  const t = text.slice(0, 110);
  process.stdout.write('\r' + t + ' '.repeat(Math.max(0, 110 - t.length)));
}

function endProgress() {
  if (!IS_TTY) return;
  process.stdout.write('\r' + ' '.repeat(110) + '\r');
}

function makeProgressBar(current, total, width) {
  width = width || 30;
  if (total === 0) return '[' + '░'.repeat(width) + '] 0/0';
  const pct = Math.min(1, Math.max(0, current / total));
  const filled = Math.round(pct * width);
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + '] ' + current + '/' + total;
}

function sanitizeFileName(name) {
  const s = String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  return (s || 'unnamed').slice(0, 200);
}

function checkRemoteCacheExists(serverUrl) {
  const cacheDir = getCachePath(__dirname, serverUrl);
  const completeFlag = path.join(cacheDir, '.complete');
  return fs.existsSync(completeFlag) ? cacheDir : null;
}

function getCachePath(baseDir, serverUrl) {
  const u = new URL(serverUrl);
  const host = u.hostname;
  const hash = crypto.createHash('sha1').update(serverUrl).digest('hex').slice(0, 8);
  return path.join(baseDir, '.cache', 'domains', host + '__' + hash);
}

function httpPost(url, body, extraHeaders, rejectUnauthorized) {
  return new Promise(function(resolve, reject) {
    let urlObj;
    try { urlObj = new URL(url); } catch (e) { return reject(new Error('Invalid URL: ' + url)); }
    const isHttps = urlObj.protocol === 'https:';
    const mod = isHttps ? https : http;
    const data = JSON.stringify(body);
    const headers = Object.assign({
      'Accept': '*/*',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      'apollo-require-preflight': 'true'
    }, extraHeaders || {});
    const opts = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: headers
    };
    if (isHttps) opts.rejectUnauthorized = rejectUnauthorized !== false;
    const req = mod.request(opts, function(res) {
      const chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          resolve({ status: res.statusCode, json: JSON.parse(text), raw: text });
        } catch (e) {
          reject(new Error('Bad JSON (' + res.statusCode + '): ' + text.slice(0, 300)));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function ensureRemoteToken() {
  if (!remoteCredentials) throw new Error('Учётные данные не заданы');
  if (remoteCredentials.token) return remoteCredentials.token;
  const token = await apiLogin(
      remoteCredentials.loginUrl,
      remoteCredentials.username,
      remoteCredentials.password,
      remoteCredentials.secure
  );
  remoteCredentials.token = token;
  return token;
}

async function apiLogin(loginUrl, username, password, rejectUnauthorized) {
  const query =
      'mutation login($input: LoginRequest!) {\n' +
      '  login(input: $input) {\n' +
      '    loginResult { accessToken refreshToken }\n' +
      '    secondFactor { isEnabled sessionToken }\n' +
      '    forceChangePasswordSession { reason sessionId }\n' +
      '  }\n' +
      '}';
  const res = await httpPost(loginUrl, {
    operationName: 'login',
    variables: { input: { password: password, username: username } },
    query: query
  }, {}, rejectUnauthorized);
  if (res.status !== 200) throw new Error('HTTP ' + res.status);
  const login = res.json && res.json.data && res.json.data.login;
  if (!login) throw new Error('Нет данных в ответе');
  const token = login.loginResult && login.loginResult.accessToken;
  if (!token) {
    if (login.forceChangePasswordSession) {
      throw new Error('Требуется смена пароля: ' + (login.forceChangePasswordSession.reason || ''));
    }
    throw new Error('accessToken отсутствует');
  }
  return token;
}

async function apiFetchFolders(apiUrl, token, tenantId, rejectUnauthorized) {
  const query =
      'query resourceFolders {\n' +
      '  resourceFolders {\n' +
      '    id\n' +
      '    name\n' +
      '    parentFolderId\n' +
      '  }\n' +
      '}';
  const res = await httpPost(apiUrl, {
    operationName: 'resourceFolders',
    variables: {},
    query: query
  }, {
    'Authorization': 'Bearer ' + token,
    'x-tenant-id': tenantId
  }, rejectUnauthorized);
  if (res.status !== 200) throw new Error('HTTP ' + res.status);
  const folders = res.json && res.json.data && res.json.data.resourceFolders;
  if (!Array.isArray(folders)) throw new Error('Некорректный ответ');
  return folders;
}

async function apiFetchExpertises(apiUrl, token, tenantId, rootFolderId, rejectUnauthorized) {
  const query =
    'query expertises($filter: ExpertisesFilter, $pagination: PaginationInput, $sorting: ExpertisesSorting, $organizationIds: [String!]!) {\n' +
    '  expertises(\n' +
    '    filter: $filter\n' +
    '    pagination: $pagination\n' +
    '    sorting: $sorting\n' +
    '    organizationIds: $organizationIds\n' +
    '  ) {\n' +
    '    expertises {\n' +
    '      id\n' +
    '      sourceId\n' +
    '      folderId\n' +
    '      type\n' +
    '      name\n' +
    '      objectType\n' +
    '      dataSource\n' +
    '      description\n' +
    '      draft\n' +
    '      author\n' +
    '      status\n' +
    '      tags\n' +
    '      version\n' +
    '      severity\n' +
    '      createdAt\n' +
    '      updatedAt\n' +
    '      updater {\n' +
    '        id\n' +
    '        displayName\n' +
    '      }\n' +
    '      organization {\n' +
    '        id\n' +
    '        name\n' +
    '      }\n' +
    '    }\n' +
    '    pageInfo {\n' +
    '      pagination { limit offset }\n' +
    '      totalCount\n' +
    '    }\n' +
    '  }\n' +
    '}';

  const res = await httpPost(apiUrl, {
    operationName: 'expertises',
    variables: {
      filter: {
        folder: { folderId: rootFolderId, withChildFolders: true },
        query: '',
        types: ['DOMAIN']
      },
      organizationIds: [],
      pagination: { limit: 500, offset: 0 },
      sorting: { order: 'DESC', orderBy: 'UPDATED_AT' }
    },
    query: query
  }, {
    'Authorization': 'Bearer ' + token,
    'x-tenant-id': tenantId
  }, rejectUnauthorized);

  if (res.status !== 200) throw new Error('HTTP ' + res.status);

  const data = res.json && res.json.data && res.json.data.expertises;
  if (!data) throw new Error('Некорректный ответ');

  return (data.expertises || []).map(function(d) {
    // Нормализуем поля — чтобы на выходе был единый контракт
    return {
      id: d.id,
      sourceId: d.sourceId,
      folderId: d.folderId,
      type: d.type,
      name: d.name || '',
      status: d.status,
      version: d.version || '',
      description: d.description || '',
      author: d.author || '',
      tags: Array.isArray(d.tags) ? d.tags : [],
      createdAt: d.createdAt || null,
      updatedAt: d.updatedAt || null,
      objectType: d.objectType || null,
      updater: d.updater ? { id: d.updater.id, displayName: d.updater.displayName } : null,
      organization: d.organization ? { id: d.organization.id, name: d.organization.name } : null
    };
  });
}

async function apiFetchExpertiseSource(apiUrl, token, tenantId, id, rejectUnauthorized) {
  const query =
      'query expertise($id: String!) {\n' +
      '  expertise(id: $id) {\n' +
      '    id\n' +
      '    sourceId\n' +
      '    sourceCode\n' +
      '    status\n' +
      '  }\n' +
      '}';
  const res = await httpPost(apiUrl, {
    operationName: 'expertise',
    variables: { id: id },
    query: query
  }, {
    'Authorization': 'Bearer ' + token,
    'x-tenant-id': tenantId
  }, rejectUnauthorized);
  if (res.status !== 200) throw new Error('HTTP ' + res.status);
  const e = res.json && res.json.data && res.json.data.expertise;
  if (!e) throw new Error('Некорректный ответ');
  return e.sourceCode;
}

async function apiCheckRobject(apiUrl, token, tenantId, sourceCode, rejectUnauthorized) {
  const query =
      'mutation checkRobject($input: CheckRobjectInput!) {\n' +
      '  checkRobject(input: $input) {\n' +
      '    isValid\n' +
      '    diagnostics {\n' +
      '      message\n' +
      '      severity\n' +
      '      labels { message primary span { end start } }\n' +
      '    }\n' +
      '  }\n' +
      '}';
  return await httpPost(apiUrl, {
    operationName: 'checkRobject',
    variables: { input: { type: 'DOMAIN', sourceCode: sourceCode } },
    query: query
  }, {
    'Authorization': 'Bearer ' + token,
    'x-tenant-id': tenantId
  }, rejectUnauthorized);
}

function readJsonBody(req) {
  return new Promise(function(resolve, reject) {
    const chunks = [];
    req.on('data', function(c) { chunks.push(c); });
    req.on('end', function() {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function buildFolderPaths(folders) {
  const byId = new Map(folders.map(function(f) { return [f.id, f]; }));
  const cache = new Map();
  function getPath(id) {
    if (cache.has(id)) return cache.get(id);
    const folder = byId.get(id);
    if (!folder) { cache.set(id, []); return []; }
    if (folder.parentFolderId == null) { cache.set(id, []); return []; }
    const parentPath = getPath(folder.parentFolderId);
    const result = parentPath.concat([sanitizeFileName(folder.name)]);
    cache.set(id, result);
    return result;
  }
  for (const f of folders) getPath(f.id);
  return cache;
}

async function prepareRemoteCache(serverUrl, username, password, opts) {
  opts = opts || {};
  const baseDir = __dirname;
  const cacheDir = getCachePath(baseDir, serverUrl);
  const completeFlag = path.join(cacheDir, '.complete');

  const currentIndexPath = path.join(cacheDir, '_index.json');
  const previousIndexPath = path.join(cacheDir, '_index_previous.json');

  // Сохраняем предыдущий index перед перезаписью
  if (fs.existsSync(currentIndexPath)) {
    try {
      fs.copyFileSync(currentIndexPath, previousIndexPath);
       console.log('📸 Сохранён предыдущий снимок перед refresh');
    } catch (e) {}
  }

  if (opts.resetCache) {
    if (fs.existsSync(cacheDir)) {
      console.log('🗑  Удаление кэша: ' + cacheDir);
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
  }

  const cacheValid = fs.existsSync(completeFlag);
  if (cacheValid && !opts.refresh) {
    console.log('📦 Используется кэш: ' + cacheDir);
    console.log('   (обновить: --refresh, сбросить: --reset-cache)');
    let fetchedAt = null;
    try {
      const idx = JSON.parse(fs.readFileSync(path.join(cacheDir, '_index.json'), 'utf8'));
      fetchedAt = idx.fetchedAt || null;
    } catch (e) {}
    return { cacheDir: cacheDir, fromCache: true, server: serverUrl, fetchedAt: fetchedAt };
  }

  const base = serverUrl.replace(/\/+$/, '');
  const loginUrl = base + '/api/evo/core/bff/graphql';
  const apiUrl = base + '/api/graphql';
  const tenantId = '00000000-0000-0000-0000-000000000000';
  const rejectUnauthorized = !!(opts && opts.secure);

  // Login
  writeProgress('🔐 Логин ' + username + '...');
  let token;
  try {
    token = await apiLogin(loginUrl, username, password, rejectUnauthorized);
  } catch (err) {
    endProgress();
    throw new Error('Логин: ' + err.message);
  }
  endProgress();
  console.log('🔐 Логин: ✅ (' + username + ')');

  if (remoteCredentials) {
    remoteCredentials.token = token;
  }

  // Folders
  writeProgress('📁 Загрузка структуры папок...');
  let folders;
  try {
    folders = await apiFetchFolders(apiUrl, token, tenantId, rejectUnauthorized);
  } catch (err) {
    endProgress();
    throw new Error('Папки: ' + err.message);
  }
  endProgress();
  console.log('📁 Структура папок: ✅ (' + folders.length + ')');

  const rootFolder = folders.find(function(f) { return f.parentFolderId == null; });
  if (!rootFolder) throw new Error('Корневая папка не найдена');

  // Domains list
  writeProgress('📄 Загрузка списка доменов...');
  let domains;
  try {
    domains = await apiFetchExpertises(apiUrl, token, tenantId, rootFolder.id, rejectUnauthorized);
  } catch (err) {
    endProgress();
    throw new Error('Домены: ' + err.message);
  }
  endProgress();

  const enabledDomains = domains.filter(function(d) {
    return d.status === 'ENABLED' && d.type === 'DOMAIN';
  });
  console.log('📄 Домены: ✅ всего ' + domains.length + ', ENABLED ' + enabledDomains.length);

  // Prepare dir
  if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
  fs.mkdirSync(cacheDir, { recursive: true });

  // Index
  fs.writeFileSync(path.join(cacheDir, '_index.json'), JSON.stringify({
    server: serverUrl,
    fetchedAt: new Date().toISOString(),
    rootFolderId: rootFolder.id,
    folders: folders,
    domains: domains.map(function(d) {
      return {
        id: d.id,
        sourceId: d.sourceId,
        folderId: d.folderId,
        type: d.type,
        name: d.name,
        status: d.status,
        version: d.version,
        description: d.description,
        author: d.author,
        tags: Array.isArray(d.tags) ? d.tags : [],
        createdAt: d.createdAt || null,
        updatedAt: d.updatedAt || null,
        objectType: d.objectType || null,
        updater: d.updater ? { displayName: d.updater.displayName, id: d.updater.id } : null
      };
    })
  }, null, 2), 'utf8');

  // Folder paths
  const folderPaths = buildFolderPaths(folders);

  // Download each
  const errors = [];
  let saved = 0;
  const total = enabledDomains.length;

  for (let i = 0; i < total; i++) {
    const d = enabledDomains[i];
    const shortName = (d.sourceId || d.id).slice(0, 40);
    writeProgress('💾 Скачивание схем ' + makeProgressBar(i + 1, total) + ' — ' + shortName);
    try {
      const sourceCode = await apiFetchExpertiseSource(apiUrl, token, tenantId, d.id, rejectUnauthorized);
      if (!sourceCode || typeof sourceCode !== 'string') {
        errors.push({ id: d.id, sourceId: d.sourceId, error: 'Пустой sourceCode' });
        continue;
      }
      const folderPath = folderPaths.get(d.folderId) || [];
      const fullDir = path.join.apply(path, [cacheDir].concat(folderPath));
      fs.mkdirSync(fullDir, { recursive: true });
      const fileName = sanitizeFileName(d.sourceId) + '.ro';
      fs.writeFileSync(path.join(fullDir, fileName), sourceCode, 'utf8');
      saved++;
    } catch (err) {
      errors.push({ id: d.id, sourceId: d.sourceId, error: err.message });
    }
  }
  endProgress();

  if (errors.length > 0) {
    fs.writeFileSync(path.join(cacheDir, '_errors.json'), JSON.stringify(errors, null, 2), 'utf8');
  }

  fs.writeFileSync(completeFlag, new Date().toISOString(), 'utf8');

  console.log('💾 Сохранено: ' + saved + '/' + total);
  if (errors.length > 0) {
    console.log('⚠️  Ошибок: ' + errors.length + ' → ' + path.join(cacheDir, '_errors.json'));
  }
  console.log('📂 Кэш: ' + cacheDir);

  return { cacheDir: cacheDir, fromCache: false, server: serverUrl, fetchedAt: new Date().toISOString() };
}

function printHelp() {
  console.log('Usage:');
  console.log('');
  console.log('  Локальный режим:');
  console.log('    node graph-analyzer.js <directory-path> [port]');
  console.log('');
  console.log('  Удалённый режим:');
  console.log('    node graph-analyzer.js --server <url> --login <user> --password <pass> [options]');
  console.log('');
  console.log('Опции:');
  console.log('  --server <url>       Базовый URL сервера (например https://your.server.com)');
  console.log('  --login <user>       Имя пользователя (не нужно, если кэш уже есть)');
  console.log('  --password <pass>    Пароль (не нужно, если кэш уже есть)');
  console.log('  --port <port>        HTTP-порт сервера визуализации (по умолчанию 3000)');
  console.log('  --refresh            Обновить кэш (требуются --login и --password)');
  console.log('  --reset-cache        Удалить кэш перед загрузкой (требуются --login и --password)');
  console.log('  --secure             Проверять TLS-сертификат');
  console.log('  --help               Показать справку');
  console.log('');
  console.log('Кэш: .cache/domains/<host>__<hash>/');
  console.log('По умолчанию используется существующий кэш, если он есть.');
  console.log('');
  console.log('Примеры:');
  console.log('  node graph-analyzer.js ./domains');
  console.log('  node graph-analyzer.js --server https://your.server.com --login admin --password "qwerty"');
  console.log('  node graph-analyzer.js --server https://your.server.com  # если кэш уже есть');
  console.log('  node graph-analyzer.js --server https://your.server.com --login admin --password "qwerty" --refresh');
  console.log('  node graph-analyzer.js --server https://your.server.com --login admin --password "qwerty" --reset-cache --port 4000');
}

class DomainGraphAnalyzer {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.domains = new Map();
    this.links = [];
    this.brokenDomains = new Map();
    this.missingDomains = new Set();
    this.fqidReferences = [];
    this.metadata = new Map(); 
    this.loadMetadata();    
    this.stats = {
      totalFiles: 0,
      processedFiles: 0,
      skippedFiles: 0,
      brokenFiles: 0,
      domains: 0,
      links: 0,
      fqidReferences: 0
    };
  }

  loadMetadata() {
    try {
      const indexPath = path.join(this.rootDir, '_index.json');
      if (!fs.existsSync(indexPath)) return;
      const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      (idx.domains || []).forEach((d) => {
        if (!d.sourceId) return;
        this.metadata.set(d.sourceId.toLowerCase(), {
          updatedAt: d.updatedAt || null,
          createdAt: d.createdAt || null,
          author: d.author || null,
          description: d.description || null,
          tags: Array.isArray(d.tags) ? d.tags : [],
          version: d.version || null
        });
      });
    } catch (e) {
      // Работает и без метаданных
    }
  }


  collectCacheDiff() {
  const current = path.join(this.rootDir, '_index.json');
  const previous = path.join(this.rootDir, '_index_previous.json');
  if (!fs.existsSync(current) || !fs.existsSync(previous)) return null;

  try {
    const cur = JSON.parse(fs.readFileSync(current, 'utf8'));
    const prev = JSON.parse(fs.readFileSync(previous, 'utf8'));

    const curMap = new Map((cur.domains || []).map(d => [d.sourceId, d]));
    const prevMap = new Map((prev.domains || []).map(d => [d.sourceId, d]));

    const added = [];
    const removed = [];
    const changed = [];

    for (const [id, d] of curMap) {
      if (!prevMap.has(id)) {
        added.push({
          sourceId: id,
          name: d.name,
          version: d.version,
          tags: d.tags || []
        });
      } else {
        const p = prevMap.get(id);
        const changes = [];
        if (p.version !== d.version) {
          changes.push({ field: 'version', from: p.version, to: d.version });
        }
        if (p.name !== d.name) {
          changes.push({ field: 'name', from: p.name, to: d.name });
        }
        if (JSON.stringify(p.tags || []) !== JSON.stringify(d.tags || [])) {
          changes.push({
            field: 'tags',
            from: (p.tags || []).join(', '),
            to: (d.tags || []).join(', ')
          });
        }
        if (changes.length > 0) {
          changed.push({
            sourceId: id,
            name: d.name,
            version: d.version,
            changes: changes
          });
        }
      }
    }
    for (const [id, d] of prevMap) {
      if (!curMap.has(id)) {
        removed.push({ sourceId: id, name: d.name, version: d.version });
      }
    }

    return {
      previousFetchedAt: prev.fetchedAt || null,
      currentFetchedAt: cur.fetchedAt || null,
      added,
      removed,
      changed
    };
  } catch (e) { return null; }
}

  getAllEntities() {
    var result = [];
    for (var domainEntry of this.domains) {
      var domainId = domainEntry[0];
      var domainData = domainEntry[1];
      for (var entity of domainData.entities.values()) {
        if (!entity || !entity.id) continue;
        result.push({
          domainId: domainId,
          entityId: entity.id,
          name: entity.name || entity.id,
          inherits: (typeof entity.inherits === 'string' && entity.inherits) ? entity.inherits : null
        });
      }
    }
    return result;
  }

  analyze() {
    this.scanDirectory(this.rootDir);
    return this.buildGraphData();
  }

  scanDirectory(dir) {
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        let stat;
        try { stat = fs.statSync(fullPath); } catch (e) { continue; }
        if (stat.isDirectory()) {
          this.scanDirectory(fullPath);
        } else if (file.endsWith('.ro')) {
          this.stats.totalFiles++;
          this.processFile(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dir}: ${error.message}`);
    }
  }

  processFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      let data = null;
      let parseErrors = [];
      try {
        data = yaml.load(content);
      } catch (error) {
        parseErrors.push(`Standard: ${error.message}`);
        try {
          data = this.parseLenientYaml(content);
        } catch (error2) {
          parseErrors.push(`Lenient: ${error2.message}`);
          try {
            data = yaml.load(this.cleanYamlContent(content));
          } catch (error3) {
            parseErrors.push(`Cleaned: ${error3.message}`);
          }
        }
      }
      if (!data) throw new Error(`Failed to parse YAML: ${parseErrors.join('; ')}`);
      if (data.type !== 'domain') { this.stats.skippedFiles++; return; }
      const domainId = data.id;
      if (!domainId) throw new Error('Domain without ID');

      if (!this.domains.has(domainId)) {
        this.domains.set(domainId, {
          id: domainId,
          name: data.name || domainId,
          version: data.version || '',
          filePath: filePath,
          entities: new Map(),
          rawData: data,
          duplicates: [],
          fqidRefs: []
        });
      }
      this.stats.processedFiles++;
      this.stats.domains = this.domains.size;
      const domainData = this.domains.get(domainId);

      if (data.entities && Array.isArray(data.entities)) {
        for (const entity of data.entities) {
          if (entity && entity.id && !domainData.entities.has(entity.id)) {
            domainData.entities.set(entity.id, entity);
          }
        }
      }

      this.findFQIDReferences(data, domainId, filePath, domainData);
      if (data.linkages && Array.isArray(data.linkages)) {
        this.processLinkages(domainId, data.linkages, filePath);
      }
    } catch (error) {
      console.error(`Error processing ${filePath}: ${error.message}`);
      this.brokenDomains.set(filePath, error.message);
      this.stats.brokenFiles++;
    }
  }

  findFQIDReferences(obj, currentDomainId, filePath, domainData, currentPath = '') {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        const arrayPath = currentPath ? `${currentPath}[${index}]` : `[${index}]`;
        if (typeof item === 'object' && item !== null) {
          this.findFQIDReferences(item, currentDomainId, filePath, domainData, arrayPath);
        } else if (typeof item === 'string') {
          this.checkFQIDValue(item, currentDomainId, filePath, domainData, arrayPath);
        }
      });
      return;
    }
    for (const [key, value] of Object.entries(obj)) {
      const propertyPath = currentPath ? `${currentPath}.${key}` : key;
      if (typeof value === 'string') {
        this.checkFQIDValue(value, currentDomainId, filePath, domainData, propertyPath);
      } else if (typeof value === 'object' && value !== null) {
        this.findFQIDReferences(value, currentDomainId, filePath, domainData, propertyPath);
      }
    }
  }

  checkFQIDValue(value, currentDomainId, filePath, domainData, propertyPath) {
    if (!value || typeof value !== 'string') return;
    const fqidMatch = this.isFQID(value);
    if (fqidMatch) {
      const targetDomainId = fqidMatch.domainId;
      const targetEntityId = fqidMatch.entityId;
      const normalizedTarget = targetDomainId.trim().toLowerCase();
      const normalizedCurrent = currentDomainId.trim().toLowerCase();
      if (normalizedTarget === normalizedCurrent) return;

      const reference = {
        sourceDomainId: currentDomainId,
        targetDomainId: targetDomainId,
        targetEntityId: targetEntityId,
        fullFQID: value,
        filePath: filePath,
        propertyPath: propertyPath,
        propertyName: this.getPropertyName(propertyPath)
      };
      this.fqidReferences.push(reference);
      this.stats.fqidReferences = this.fqidReferences.length;
      if (domainData) domainData.fqidRefs.push(reference);

      if (!this.findDomainCaseInsensitive(targetDomainId)) {
        this.missingDomains.add(targetDomainId);
      }
    }
  }

  findDomainCaseInsensitive(domainId) {
    const normalizedId = domainId.trim().toLowerCase();
    for (const [existingId] of this.domains) {
      if (existingId.trim().toLowerCase() === normalizedId) return existingId;
    }
    return null;
  }

  isFQID(value) {
    const fqidPattern = /^([a-zA-Z0-9][\w.-]*\.[a-zA-Z0-9][\w.-]*)\/(.+)$/;
    const match = value.match(fqidPattern);
    if (match) return { domainId: match[1], entityId: match[2] };
    return null;
  }

  getPropertyName(propertyPath) {
    const parts = propertyPath.split('.');
    return parts[parts.length - 1];
  }

  processLinkages(sourceDomainId, linkages, filePath) {
    for (const linkage of linkages) {
      if (!linkage || !linkage.id) continue;
      if (linkage.side1 && this.isFQID(linkage.side1)) {
        this.createLinkFromFQID(sourceDomainId, linkage.side1, linkage, filePath, 'side1');
      }
      if (linkage.side2 && this.isFQID(linkage.side2)) {
        this.createLinkFromFQID(sourceDomainId, linkage.side2, linkage, filePath, 'side2');
      }
    }
  }

  createLinkFromFQID(sourceDomainId, fqid, linkage, filePath, side) {
    const fqidInfo = this.isFQID(fqid);
    if (!fqidInfo) return;
    const targetDomainId = fqidInfo.domainId;
    if (targetDomainId.trim().toLowerCase() === sourceDomainId.trim().toLowerCase()) return;

    // ВАЖНО: определяем домены обеих сторон linkage.
    // Если сторона содержит "/" — берём домен из FQID. Иначе — это сущность того же домена,
    // где лежит файл, поэтому домен = sourceDomainId.
    const side1Raw = linkage.side1 || '';
    const side2Raw = linkage.side2 || '';
    const extractDomain = (raw, fallback) => {
      if (!raw) return fallback;
      const slash = raw.indexOf('/');
      return slash > 0 ? raw.slice(0, slash) : fallback;
    };
    const side1Domain = extractDomain(side1Raw, sourceDomainId);
    const side2Domain = extractDomain(side2Raw, sourceDomainId);

    const linkObj = {
      id: `${sourceDomainId}_${targetDomainId}_${linkage.id}_${side}`,
      originalId: linkage.id,
      name: linkage.name || linkage.id,
      type: linkage.type || 'unknown',
      source: sourceDomainId,
      target: targetDomainId,
      sourceFile: filePath,
      nameFrom: linkage.nameFrom || {},
      sourceEntity: side1Raw,
      targetEntity: side2Raw,
      side1Domain: side1Domain,
      side2Domain: side2Domain,
      side1Raw: side1Raw,
      side2Raw: side2Raw,
      fqidRef: { fullFQID: fqid, propertyPath: `linkages.${side}`, propertyName: side }
    };

    if (!this.links.find(l => l.id === linkObj.id)) {
      this.links.push(linkObj);
      this.stats.links = this.links.length;
    }
    if (!this.findDomainCaseInsensitive(targetDomainId)) {
      this.missingDomains.add(targetDomainId);
    }
  }

  buildGraphData() {
    const nodesMap = new Map();
    const edgesMap = new Map();

    for (const [domainId, domainData] of this.domains) {
  const nodeId = `domain_${domainId}`;
  if (!nodesMap.has(nodeId)) {
    const raw = domainData.rawData || {};
    const meta = this.metadata.get(domainId.toLowerCase()) || {};

    let folderPath = [];
    try {
      const relPath = path.relative(this.rootDir, domainData.filePath);
      const dir = path.dirname(relPath);
      folderPath = dir.split(path.sep).filter(function(p) { return p && p !== '.'; });
    } catch (e) {}

    // Fallback: mtime файла, если нет метаданных из GraphQL
    let fallbackUpdatedAt = null;
    let fallbackCreatedAt = null;
    try {
      const stat = fs.statSync(domainData.filePath);
      fallbackUpdatedAt = stat.mtime.toISOString();
      fallbackCreatedAt = stat.birthtime && stat.birthtime.getTime() > 0
        ? stat.birthtime.toISOString()
        : null;
    } catch (e) { /* файл недоступен */ }

    const updatedAt = meta.updatedAt || fallbackUpdatedAt;
    const updatedAtSource = meta.updatedAt ? 'graphql' : (fallbackUpdatedAt ? 'fs' : null);

    const createdAt = meta.createdAt || fallbackCreatedAt;
    const createdAtSource = meta.createdAt ? 'graphql' : (fallbackCreatedAt ? 'fs' : null);

    nodesMap.set(nodeId, {
      id: nodeId,
      label: domainData.name,
      domainId: domainId,
      title: this.buildTooltip(domainData),
      group: 'domain',
      filePath: domainData.filePath,
      folderPath: folderPath,
      fqidRefs: domainData.fqidRefs,
      version: meta.version || domainData.version || '',
      entitiesCount: domainData.entities.size,
      name: domainData.name || '',
      description: raw.description || meta.description || '',
      author: raw.author || meta.author || '',
      tags: Array.isArray(raw.tags) ? raw.tags
        : (raw.tags ? [String(raw.tags)]
        : (meta.tags || [])),

      updatedAt: updatedAt,
      updatedAtSource: updatedAtSource,
      createdAt: createdAt,
      createdAtSource: createdAtSource,

      // Опционально: если meta.version есть, но не отличается от YAML — можно сохранить источник версии
      metaAuthor: meta.author || null
    });
  }
}

    for (const missingDomain of this.missingDomains) {
      if (this.findDomainCaseInsensitive(missingDomain)) continue;
      const nodeId = `missing_${missingDomain}`;
      if (!nodesMap.has(nodeId)) {
        nodesMap.set(nodeId, {
          id: nodeId,
          label: missingDomain,
          domainId: missingDomain,
          title: `Missing domain: ${missingDomain}`,
          group: 'missing',
          filePath: null
        });
      }
    }

    for (const [brokenFile, errorMsg] of this.brokenDomains) {
      const nodeId = `broken_${brokenFile.replace(/[^a-zA-Z0-9]/g, '_')}`;
      if (!nodesMap.has(nodeId)) {
        nodesMap.set(nodeId, {
          id: nodeId,
          label: path.basename(brokenFile),
          domainId: path.basename(brokenFile),
          title: `Broken YAML: ${brokenFile}\nError: ${errorMsg}`,
          group: 'broken',
          filePath: brokenFile
        });
      }
    }

    this.createEdgesFromFQIDReferences(edgesMap);
    this.createEdgesFromLinkages(edgesMap);

    return {
      nodes: Array.from(nodesMap.values()),
      edges: Array.from(edgesMap.values()),
      stats: this.stats,
      domainCount: this.domains.size,
      linkCount: this.links.length,
      fqidReferences: this.fqidReferences,
      missingCount: this.missingDomains.size,
      brokenCount: this.brokenDomains.size,
      entities: this.getAllEntities(),
      cacheDiff: this.collectCacheDiff(),
    };
  }

  createEdgesFromFQIDReferences(edgesMap) {
    const groupedRefs = new Map();
    for (const ref of this.fqidReferences) {
      const sourceDomainId = this.findDomainCaseInsensitive(ref.sourceDomainId) || ref.sourceDomainId;
      const targetDomainId = this.findDomainCaseInsensitive(ref.targetDomainId) || ref.targetDomainId;
      const sourceNodeId = this.getNodeId(sourceDomainId);
      const targetNodeId = this.getNodeId(targetDomainId);
      if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) continue;

      const key = `${sourceNodeId}__${targetNodeId}`;
      if (!groupedRefs.has(key)) {
        groupedRefs.set(key, { sourceNodeId, targetNodeId, sourceDomainId, targetDomainId, refs: [] });
      }
      groupedRefs.get(key).refs.push(ref);
    }

    for (const [key, group] of groupedRefs) {
      const edgeId = `fqid_${key}`;
      if (!edgesMap.has(edgeId)) {
        const refCount = group.refs.length;
        edgesMap.set(edgeId, {
          id: edgeId,
          from: group.sourceNodeId,
          to: group.targetNodeId,
          label: `${refCount} ref${refCount > 1 ? 's' : ''}`,
          title: this.buildFQIDEdgeTooltip(group),
          fqidRefs: group.refs,
          refCount: refCount,
          kind: 'fqid'
        });
      }
    }
  }

  createEdgesFromLinkages(edgesMap) {
    for (const link of this.links) {
      const sourceDomainId = this.findDomainCaseInsensitive(link.source) || link.source;
      const targetDomainId = this.findDomainCaseInsensitive(link.target) || link.target;
      const sourceNodeId = this.getNodeId(sourceDomainId);
      const targetNodeId = this.getNodeId(targetDomainId);
      if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) continue;

      const edgeId = `linkage_${link.id}`;
      if (!edgesMap.has(edgeId)) {
        const refs = [];
        if (link.fqidRef) {
          refs.push({
            sourceDomainId: link.source,
            targetDomainId: link.target,
            fullFQID: link.fqidRef.fullFQID,
            propertyPath: link.fqidRef.propertyPath,
            filePath: link.sourceFile
          });
        }

        edgesMap.set(edgeId, {
          id: edgeId,
          from: sourceNodeId,
          to: targetNodeId,
          label: this.truncate(link.name, 20),
          fullLabel: link.name,
          title: this.buildLinkTooltip(link),
          linkData: link,
          kind: 'linkage',
          side1Domain: link.side1Domain || null,
          side2Domain: link.side2Domain || null,
          side1Raw: link.side1Raw || null,
          side2Raw: link.side2Raw || null,
          fqidRefs: refs
        });
      }
    }
  }

  buildFQIDEdgeTooltip(group) {
    let tooltip = `FQID References (${group.refs.length})\n`;
    tooltip += `From: ${group.sourceDomainId}\nTo: ${group.targetDomainId}\n`;
    tooltip += '─'.repeat(40) + '\n';
    group.refs.slice(0, 20).forEach((ref, i) => {
      tooltip += `${i + 1}. ${ref.fullFQID}\n   Path: ${ref.propertyPath}\n`;
    });
    if (group.refs.length > 20) tooltip += `... and ${group.refs.length - 20} more\n`;
    return tooltip;
  }

  buildTooltip(domainData) {
    let t = `${domainData.name}\n`;
    t += `ID: ${domainData.id}\nVersion: ${domainData.version}\n`;
    t += `Entities: ${domainData.entities.size}\nFQID References: ${domainData.fqidRefs.length}\n`;
    t += `File: ${domainData.filePath}\n`;
    return t;
  }

  buildLinkTooltip(link) {
    return `${link.name}\nID: ${link.originalId}\nType: ${link.type}\nFrom: ${link.sourceEntity}\nTo: ${link.targetEntity}\nFile: ${link.sourceFile}`;
  }

  getNodeId(domainId) {
    if (this.domains.has(domainId)) return `domain_${domainId}`;
    const existingId = this.findDomainCaseInsensitive(domainId);
    if (existingId) return `domain_${existingId}`;
    if (this.missingDomains.has(domainId)) return `missing_${domainId}`;
    for (const [brokenFile] of this.brokenDomains) {
      if (brokenFile.includes(domainId)) return `broken_${brokenFile.replace(/[^a-zA-Z0-9]/g, '_')}`;
    }
    if (domainId && domainId.trim()) {
      this.missingDomains.add(domainId);
      return `missing_${domainId}`;
    }
    return null;
  }

  truncate(str, maxLength) {
    if (!str) return '';
    return str.length > maxLength ? str.substring(0, maxLength - 3) + '...' : str;
  }

  parseLenientYaml(content) {
    const lenientSchema = yaml.DEFAULT_SCHEMA.extend({
      implicit: [new yaml.Type('tag:yaml.org,2002:str', { kind: 'scalar', resolve: () => true, construct: (d) => d || '' })]
    });
    const handleUnknownTag = (tag) => new yaml.Type(tag, { kind: 'scalar', resolve: () => true, construct: (d) => d });
    const tagRegex = /![\w-]+/g;
    const tags = new Set();
    let match;
    while ((match = tagRegex.exec(content)) !== null) tags.add(match[0]);
    for (const tag of tags) {
      if (tag !== '!') {
        lenientSchema.explicit.push(handleUnknownTag(`tag:yaml.org,2002:${tag.slice(1)}`));
        lenientSchema.explicit.push(handleUnknownTag(tag));
      }
    }
    return yaml.load(content, { schema: lenientSchema });
  }

  cleanYamlContent(content) {
    return content.split(String.fromCharCode(10))
        .map(line => line.replace(/![\w-]+/g, '').replace(/[*&]/g, ''))
        .filter(line => !line.includes('!!binary') && !line.includes('!!python'))
        .join(String.fromCharCode(10));
  }

  startServer(port, remoteInfo, cliFlags) {
    const graphData = this.analyze();
    graphData.remoteInfo = remoteInfo || null;

    // Собираем команду для повторного запуска (без пароля)
    let refreshCommand = null;
    if (remoteInfo && remoteInfo.server) {
      const args = [];
      args.push('node graph-analyzer.js');
      args.push('--server ' + remoteInfo.server);
      if (cliFlags && cliFlags.login) args.push('--login ' + cliFlags.login);
      args.push('--password "***"');
      args.push('--refresh');
      refreshCommand = args.join(' ');
    }

    const server = http.createServer((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.generateHTML(graphData, refreshCommand));
      } else if (req.url === '/api/validate-stream' && req.method === 'POST') {
        this.handleValidateStream(req, res).catch(function(err) {
          try {
            res.write('data: ' + JSON.stringify({ type: 'error', message: err.message }) + '\n\n');
            res.end();
          } catch (e) {}
        });
      } else if (req.url === '/api/validate-cancel' && req.method === 'POST') {
        if (currentValidation) currentValidation.cancelled = true;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } else if (req.url === '/api/validation-results' && req.method === 'GET') {
        try {
          const f = path.join(this.rootDir, '_validation.json');
          if (fs.existsSync(f)) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(fs.readFileSync(f, 'utf8'));
          } else {
            res.writeHead(204);
            res.end();
          }
        } catch (e) {
          res.writeHead(500);
          res.end('{"error":"read failed"}');
        }
      } else if (req.url === '/api/validation-available' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ available: !!remoteCredentials }));
      } else if (req.url === '/web.bundle.js') {
        try {
          const bundlePath = path.join(__dirname, 'dist', 'web.bundle.js');
          const content = fs.readFileSync(bundlePath);
          res.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-cache'
          });
          res.end(content);
        } catch (e) {
          res.writeHead(404);
          res.end('// Bundle not built. Run: npm run build:web');
        }
      } else if (req.url === '/user-guide') {
        try {
          const guidePath = path.join(__dirname, 'USER_GUIDE.md');
          const content = fs.readFileSync(guidePath, 'utf8');
          res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
          res.end(content);
        } catch (e) {
          res.writeHead(404);
          res.end('# Справка недоступна\n\nФайл `USER_GUIDE.md` не найден рядом с `graph-analyzer.js`.');
        }
      } else if (req.url.startsWith('/file')) {
        this.handleFileRequest(req, res);
      } else if (req.url === '/favicon.ico') {
        res.writeHead(204);
        res.end();
      } else {
        res.writeHead(404); res.end('Not found');
      }
    });
    server.listen(port, () => {
      console.log(`\n🚀 Graph server: http://localhost:${port}`);
      console.log(`   Domains: ${graphData.domainCount}`);
      console.log(`   Links: ${graphData.linkCount}`);
      console.log(`   Missing: ${graphData.missingCount}`);
      console.log(`   Broken: ${graphData.brokenCount}\n`);
    });
    return server;
  }

  async handleValidateStream(req, res) {
    if (!remoteCredentials) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      res.write('data: ' + JSON.stringify({ type: 'error', message: 'Валидация доступна только в режиме --server' }) + '\n\n');
      res.end();
      return;
    }

    const body = await readJsonBody(req);
    const domainIds = Array.isArray(body.domainIds) ? body.domainIds : [];

    try {
      await ensureRemoteToken();
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: ' + JSON.stringify({ type: 'error', message: 'Логин: ' + e.message }) + '\n\n');
      res.end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const send = (obj) => {
      try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch (e) {}
    };

    const state = { cancelled: false, startTime: Date.now() };
    currentValidation = state;

    req.on('close', function() {
      state.cancelled = true;
    });

    const queue = domainIds.slice();
    const results = [];
    const total = queue.length;
    let current = 0;

    send({ type: 'start', total: total });

    const checkOne = async (domainId) => {
      const domain = this.domains.get(domainId);
      if (!domain) {
        return { domainId: domainId, status: 'error', error: 'Домен не найден в кэше' };
      }

      let content;
      try {
        content = fs.readFileSync(domain.filePath, 'utf8');
      } catch (e) {
        return { domainId: domainId, status: 'error', error: 'Файл недоступен: ' + e.message };
      }

      let data;
      try {
        try {
          data = yaml.load(content);
        } catch (e1) {
          try {
            data = this.parseLenientYaml(content);
          } catch (e2) {
            data = yaml.load(this.cleanYamlContent(content));
          }
        }
        if (!data || typeof data !== 'object' || data.type !== 'domain') {
          return { domainId: domainId, status: 'skip' };
        }
      } catch (e) {
        return { domainId: domainId, status: 'error', error: 'YAML parse: ' + e.message };
      }

      let response;
      try {
        response = await apiCheckRobject(
            remoteCredentials.apiUrl,
            remoteCredentials.token,
            remoteCredentials.tenantId,
            content,
            remoteCredentials.secure
        );
      } catch (e) {
        return { domainId: domainId, status: 'error', error: e.message };
      }

      // 401 → перелогин
      if (response.status === 401) {
        try {
          remoteCredentials.token = null;
          const newToken = await ensureRemoteToken();
          response = await apiCheckRobject(
              remoteCredentials.apiUrl,
              newToken,
              remoteCredentials.tenantId,
              content,
              remoteCredentials.secure
          );
        } catch (e) {
          return { domainId: domainId, status: 'error', error: 'Перелогин не удался: ' + e.message };
        }
      }

      if (response.status !== 200) {
        return { domainId: domainId, status: 'error', error: 'HTTP ' + response.status };
      }

      const checkResult = response.json && response.json.data && response.json.data.checkRobject;
      if (!checkResult) {
        return { domainId: domainId, status: 'error', error: 'Некорректный ответ' };
      }

      if (checkResult.isValid) {
        return { domainId: domainId, status: 'valid' };
      }
      return { domainId: domainId, status: 'invalid', diagnostics: checkResult.diagnostics || [] };
    };

    const worker = async () => {
      while (queue.length > 0 && !state.cancelled) {
        const domainId = queue.shift();
        let result;
        try {
          result = await checkOne(domainId);
        } catch (e) {
          result = { domainId: domainId, status: 'error', error: e.message };
        }
        if (state.cancelled) break;
        current++;
        result.current = current;
        result.total = total;
        results.push(result);
        send(Object.assign({ type: 'progress' }, result));
      }
    };

    const workers = [];
    const limit = Math.min(3, total);
    for (let i = 0; i < limit; i++) workers.push(worker());
    await Promise.all(workers);

    const stats = {
      total: total,
      processed: results.length,
      valid: results.filter(function(r) { return r.status === 'valid'; }).length,
      invalid: results.filter(function(r) { return r.status === 'invalid'; }).length,
      errors: results.filter(function(r) { return r.status === 'error'; }).length,
      elapsedMs: Date.now() - state.startTime
    };

    const report = {
      generatedAt: new Date().toISOString(),
      server: remoteCredentials.server,
      cancelled: state.cancelled,
      stats: stats,
      results: results
    };

    // Сохраняем в кэш
    try {
      fs.writeFileSync(path.join(this.rootDir, '_validation.json'), JSON.stringify(report, null, 2), 'utf8');
    } catch (e) {}

    send({ type: 'done', cancelled: state.cancelled, stats: stats, results: results });
    res.end();

    currentValidation = null;
  }

  handleFileRequest(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const filePath = url.searchParams.get('path');
    if (!filePath) { res.writeHead(400); res.end('Missing path'); return; }
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(content);
    } catch (e) { res.writeHead(404); res.end('Not found'); }
  }
  generateHTML(graphData, refreshCommand) {
    const graphDataJson = JSON.stringify(graphData).replace(/<\/script>/g, '<\\/script>');
    const remoteInfoJson = JSON.stringify(graphData.remoteInfo || null).replace(/<\/script>/g, '<\\/script>');
    const refreshCommandJson = JSON.stringify(refreshCommand || null).replace(/<\/script>/g, '<\\/script>');

    return `<!DOCTYPE html>
<html lang="ru" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Domain Graph Analyzer</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='8' cy='8' r='4' fill='%236366f1'/%3E%3Ccircle cx='24' cy='8' r='4' fill='%2310b981'/%3E%3Ccircle cx='16' cy='24' r='4' fill='%23f59e0b'/%3E%3Cpath d='M8 8 L24 8 M8 8 L16 24 M24 8 L16 24' stroke='%236366f1' stroke-width='1.5' fill='none'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,400,0,0&display=swap">
<link rel="stylesheet" href="https://esm.sh/reactflow@11.11.4/dist/style.css" />
<script type="importmap">
{
  "imports": {
    "react": "https://esm.sh/react@18.2.0",
    "react/": "https://esm.sh/react@18.2.0/",
    "react-dom": "https://esm.sh/react-dom@18.2.0?external=react",
    "react-dom/": "https://esm.sh/react-dom@18.2.0/",
    "reactflow": "https://esm.sh/reactflow@11.11.4?external=react,react-dom",
    "dagre": "https://esm.sh/dagre@0.8.5"
  }
}
</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.34.0/min/vs/loader.min.js"></script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
:root, [data-theme="dark"] {
  --bg-900: #0a0e1a; --bg-850: #0d1424; --bg-800: #111827; --bg-750: #1a2233;
  --bg-700: #1e293b; --bg-600: #293548; --border: #1e293b; --border-hover: #334155;
  --text-100: #f1f5f9; --text-200: #e2e8f0; --text-400: #94a3b8; --text-500: #64748b;
  --accent: #6366f1; --accent-hover: #818cf8; --accent-soft: rgba(99,102,241,0.15);
  --success: #10b981; --warning: #f59e0b; --danger: #ef4444;
  --graph-bg: #0a0e1a; --graph-dots: #1e293b;
}
[data-theme="light"] {
  --bg-900: #ffffff;
  --bg-850: #ffffff;
  --bg-800: #ffffff;
  --bg-750: #f8fafc;
  --bg-700: #f1f5f9;
  --bg-600: #e2e8f0;
  --border: #e2e8f0;
  --border-hover: #94a3b8;
  --text-100: #0f172a;
  --text-200: #1e293b;
  --text-400: #475569;
  --text-500: #64748b;
  --accent: #4f46e5;
  --accent-hover: #4338ca;
  --accent-soft: rgba(79,70,229,0.10);
  --success: #047857;
  --warning: #b45309;
  --danger: #b91c1c;
  --graph-bg: #f8fafc;
  --graph-dots: #cbd5e1;
}
[data-theme="light"] .help-modal { background: #ffffff; }
[data-theme="light"] .help-modal__header { background: #f8fafc; }
[data-theme="light"] .help-content code { background: #f1f5f9; color: #4338ca; }
[data-theme="light"] .help-content pre { background: #f8fafc; }
[data-theme="light"] .help-content th { background: #f8fafc; }
[data-theme="light"] .help-content tr:nth-child(even) td { background: #f8fafc; }
[data-theme="light"] body {
  background: #f1f5f9;
}
[data-theme="light"] .sidebar,
[data-theme="light"] .toolbar,
[data-theme="light"] .side-panel,
[data-theme="light"] .side-panel__header,
[data-theme="light"] .editor-panel__path {
  background: #ffffff;
}
[data-theme="light"] .graph-container {
  background: var(--graph-bg);
  box-shadow: inset 0 0 0 1px var(--border);
}
[data-theme="light"] .rf-node {
  background: #ffffff;
  border-color: #cbd5e1;
  box-shadow: 0 1px 3px rgba(15,23,42,0.08);
}
[data-theme="light"] .rf-node:hover {
  border-color: var(--accent);
  box-shadow: 0 6px 20px rgba(15,23,42,0.12);
}
[data-theme="light"] .rf-node--domain .rf-node__icon { background: rgba(4,120,87,0.12); color: #047857; }
[data-theme="light"] .rf-node--missing .rf-node__icon { background: rgba(180,83,9,0.12); color: #b45309; }
[data-theme="light"] .rf-node--broken .rf-node__icon { background: rgba(185,28,28,0.12); color: #b91c1c; }
[data-theme="light"] .rf-compact--domain { background: rgba(4,120,87,0.12); }
[data-theme="light"] .rf-compact--missing { background: rgba(180,83,9,0.12); }
[data-theme="light"] .rf-compact--broken { background: rgba(185,28,28,0.12); }
[data-theme="light"] .stat-card,
[data-theme="light"] .mini-stat,
[data-theme="light"] .rank-item,
[data-theme="light"] .menu__checkbox:hover,
[data-theme="light"] .menu__item:hover {
  background: #f8fafc;
}
[data-theme="light"] .stat-card {
  background: #ffffff;
  border-color: #e2e8f0;
  box-shadow: 0 1px 2px rgba(15,23,42,0.04);
}
[data-theme="light"] .btn:hover {
  background: #f1f5f9;
}
[data-theme="light"] .popover,
[data-theme="light"] .ctx-menu,
[data-theme="light"] .search-modal,
[data-theme="light"] .tooltip {
  background: #ffffff;
  border-color: #cbd5e1;
  box-shadow: 0 16px 48px rgba(15,23,42,0.15);
}
[data-theme="light"] .tooltip__header,
[data-theme="light"] .tooltip__ref {
  background: #f8fafc;
}
[data-theme="light"] .tooltip__fqid { color: #4338ca; }
[data-theme="light"] .react-flow__controls {
  background: #ffffff !important;
  border-color: #e2e8f0 !important;
}
[data-theme="light"] .react-flow__controls-button {
  border-bottom-color: #e2e8f0 !important;
  fill: #1e293b !important;
}
[data-theme="light"] .react-flow__controls-button svg { fill: #1e293b !important; }
[data-theme="light"] .react-flow__controls-button:hover { background: #f1f5f9 !important; }
[data-theme="light"] .react-flow__minimap { background: #ffffff !important; border-color: #e2e8f0; }
[data-theme="light"] .react-flow__edge-text { fill: #475569; }
[data-theme="light"] .react-flow__edge-textbg { fill: #ffffff; stroke: #e2e8f0; }
[data-theme="light"] .search-hl { background: rgba(251,191,36,0.35); color: #78350f; }
[data-theme="light"] .details__id { background: #f8fafc; }
[data-theme="light"] .details__ref { background: #f8fafc; }
[data-theme="light"] .diff-legend { background: #ffffff; }
[data-theme="light"] .sidebar__header { background: linear-gradient(135deg, rgba(79,70,229,0.06), transparent); }
html, body, #root { width: 100%; height: 100%; overflow: hidden; }
body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg-900); color: var(--text-100); font-size: 14px; -webkit-font-smoothing: antialiased; }
.app { display: flex; width: 100vw; height: 100vh; }

/* Sidebar */
.sidebar { width: 320px; background: var(--bg-850); border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0; transition: width 0.25s cubic-bezier(0.4,0,0.2,1); }
.sidebar--collapsed { width: 44px; min-width: 44px; }
.sidebar__header { padding: 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px; background: linear-gradient(135deg, var(--accent-soft), transparent); }
.sidebar__logo { width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, var(--accent), #8b5cf6); display: flex; align-items: center; justify-content: center; font-size: 20px; box-shadow: 0 4px 12px rgba(99,102,241,0.4); }
.sidebar__title { font-size: 16px; font-weight: 700; letter-spacing: -0.3px; }
.sidebar__subtitle { font-size: 11px; color: var(--text-500); text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
.sidebar__expand, .sidebar__collapse { background: transparent; border: none; color: var(--text-400); cursor: pointer; font-size: 16px; padding: 6px 8px; border-radius: 6px; transition: all 0.15s; font-family: inherit; }
.sidebar__expand { width: 100%; height: 48px; font-size: 18px; }
.sidebar__expand:hover, .sidebar__collapse:hover { background: var(--bg-700); color: var(--accent-hover); }
.sidebar__body { flex: 1; overflow-y: auto; padding: 16px; }
.sidebar__body::-webkit-scrollbar { width: 6px; }
.sidebar__body::-webkit-scrollbar-thumb { background: var(--bg-600); border-radius: 3px; }
.section { margin-bottom: 20px; }
.section__title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--text-500); }
.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.stat-card { background: var(--bg-800); border: 1px solid var(--border); border-radius: 10px; padding: 12px; transition: all 0.2s; }
.stat-card:hover { border-color: var(--border-hover); }
.stat-card__value { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
.stat-card__label { font-size: 10px; color: var(--text-500); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
.stat-card--success .stat-card__value { color: var(--success); }
.stat-card--warning .stat-card__value { color: var(--warning); }
.stat-card--danger .stat-card__value { color: var(--danger); }
.stat-card--accent .stat-card__value { color: var(--accent-hover); }
.mini-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.mini-stat { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: var(--bg-800); border: 1px solid var(--border); border-radius: 6px; }
.mini-stat__label { font-size: 11px; color: var(--text-500); }
.mini-stat__value { font-size: 13px; font-weight: 700; color: var(--text-100); }
.rank-list { display: flex; flex-direction: column; gap: 2px; }
.rank-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: transparent; border: none; border-radius: 6px; cursor: pointer; font-family: inherit; color: var(--text-300); font-size: 12px; text-align: left; transition: background 0.15s; width: 100%; }
.rank-item:hover { background: var(--bg-800); color: var(--text-100); }
.rank-item__num { width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; background: var(--bg-700); border-radius: 4px; font-size: 10px; font-weight: 700; color: var(--text-500); flex-shrink: 0; }
.rank-item__label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: 'JetBrains Mono', monospace; font-size: 11px; }
.rank-item__value { font-size: 11px; font-weight: 700; color: var(--accent-hover); flex-shrink: 0; }
.bar-list { display: flex; flex-direction: column; gap: 4px; }
.bar-item { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; background: transparent; border: none; padding: 4px 0; cursor: pointer; font-family: inherit; text-align: left; color: var(--text-300); font-size: 12px; }
.bar-item:hover { color: var(--accent-hover); }
.bar-item__label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: 'JetBrains Mono', monospace; font-size: 11px; }
.bar-item__value { font-weight: 700; color: var(--text-400); font-size: 11px; }
.bar-item__track { grid-column: 1 / -1; height: 3px; background: var(--bg-700); border-radius: 2px; overflow: hidden; }
.bar-item__fill { display: block; height: 100%; background: linear-gradient(90deg, var(--accent), #8b5cf6); border-radius: 2px; transition: width 0.3s; }
.tag-cloud { display: flex; flex-wrap: wrap; gap: 5px; }
.tag { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; background: var(--bg-800); border: 1px solid var(--border); border-radius: 12px; color: var(--text-400); font-size: 11px; font-family: inherit; cursor: pointer; transition: all 0.15s; }
.tag:hover { background: var(--bg-700); border-color: var(--accent); color: var(--accent-hover); }
.tag__count { font-size: 9px; padding: 0 4px; background: var(--bg-700); border-radius: 6px; color: var(--text-500); font-weight: 700; }
.legend-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 12px; color: var(--text-400); }
.legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.legend-line { width: 16px; height: 2px; flex-shrink: 0; border-radius: 1px; }

/* Main */
.main { flex: 1; display: flex; flex-direction: column; position: relative; min-width: 0; }
.toolbar {
  height: 56px;
  background: var(--bg-850);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  z-index: 10;
  flex-shrink: 0;
  overflow: visible;   /* было: overflow-x: auto */
}
.toolbar__group { display: flex; gap: 4px; background: var(--bg-800); border-radius: 8px; padding: 3px; border: 1px solid var(--border); }
.toolbar__spacer { flex: 1; min-width: 8px; }
.toolbar__stats { color: var(--text-500); font-size: 12px; white-space: nowrap; }
.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 7px; background: transparent; border: 1px solid transparent; color: var(--text-200); font-size: 13px; font-family: inherit; cursor: pointer; transition: all 0.15s; font-weight: 500; white-space: nowrap; }
.btn:hover { background: var(--bg-700); color: var(--text-100); }
.btn--active { background: var(--accent); color: white; }
.btn--active:hover { background: var(--accent-hover); }
.btn--icon { padding: 8px; }
.btn__icon { font-size: 14px; }
.btn__badge { margin-left: 6px; padding: 1px 6px; background: var(--accent); color: white; border-radius: 10px; font-size: 10px; font-weight: 700; }
.btn--active .btn__badge { background: rgba(255,255,255,0.3); }
.btn-kbd { display: inline-block; padding: 2px 6px; background: var(--bg-700); border: 1px solid var(--border-hover); border-radius: 4px; font-size: 10px; font-family: 'JetBrains Mono', monospace; color: var(--text-400); font-weight: 600; margin-left: 4px; }

.graph-container { flex: 1; position: relative; background: var(--graph-bg); min-height: 0; }
.react-flow__attribution { display: none; }
.react-flow__background { background: var(--graph-bg) !important; }
.react-flow__minimap { background: var(--bg-800) !important; border: 1px solid var(--border); border-radius: 8px; }
.react-flow__minimap-mask { fill: rgba(99,102,241,0.15); }
.react-flow__controls { background: var(--bg-800) !important; border: 1px solid var(--border) !important; border-radius: 8px !important; box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important; overflow: hidden; }
.react-flow__controls-button { background: transparent !important; border: none !important; border-bottom: 1px solid var(--border) !important; color: var(--text-200) !important; fill: var(--text-200) !important; }
.react-flow__controls-button:hover { background: var(--bg-700) !important; }
.react-flow__controls-button svg { fill: var(--text-200) !important; }
.react-flow__edge-path { stroke-width: 1.5; }
.react-flow__edge-text { fill: var(--text-400); font-size: 10px; font-family: inherit; opacity: 0; transition: opacity 0.15s; }
.react-flow__edge-textbg { fill: var(--bg-850); stroke: var(--border); stroke-width: 1; opacity: 0; transition: opacity 0.15s; }
.react-flow__edge:hover .react-flow__edge-text,
.react-flow__edge:hover .react-flow__edge-textbg { opacity: 1 !important; }
.graph-container.show-labels .react-flow__edge-text,
.graph-container.show-labels .react-flow__edge-textbg { opacity: 1 !important; }

/* Nodes */
.rf-node { position: relative; display: flex; align-items: center; gap: 10px; width: 100%; height: 100%; padding: 10px 14px; border-radius: 10px; background: var(--bg-800); border: 1.5px solid var(--border); transition: all 0.2s; cursor: pointer; overflow: hidden; }
.rf-node:hover { border-color: var(--accent); transform: translateY(-1px); box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
.rf-node--domain { border-left: 3px solid var(--success); }
.rf-node--missing { border-left: 3px solid var(--warning); }
.rf-node--broken { border-left: 3px solid var(--danger); }
.rf-node--selected { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.rf-node--dimmed { opacity: 0.15; }
.rf-node--path { border-color: #fbbf24 !important; box-shadow: 0 0 0 3px rgba(251,191,36,0.35) !important; }
.rf-node--path-endpoint { border-color: #22c55e !important; box-shadow: 0 0 0 3px rgba(34,197,94,0.4) !important; }
.rf-node__icon { width: 30px; height: 30px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; flex-shrink: 0; }
.rf-node--domain .rf-node__icon { background: rgba(16,185,129,0.15); color: var(--success); }
.rf-node--missing .rf-node__icon { background: rgba(245,158,11,0.15); color: var(--warning); }
.rf-node--broken .rf-node__icon { background: rgba(239,68,68,0.15); color: var(--danger); }
.rf-node__content { flex: 1; min-width: 0; }
.rf-node__id { font-size: 14px; font-weight: 600; color: var(--text-100); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rf-node__name { font-size: 12px; color: var(--text-500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 4px; }
.rf-handle { width: 6px !important; height: 6px !important; background: var(--bg-600) !important; border: 1.5px solid var(--bg-850) !important; }
/* Compact node */
.rf-compact { width: 100%; height: 100%; border-radius: 50%; border: 2px solid; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; transition: all 0.15s; cursor: pointer; }
.rf-compact--domain { background: rgba(16,185,129,0.2); border-color: var(--success); color: var(--success); }
.rf-compact--missing { background: rgba(245,158,11,0.2); border-color: var(--warning); color: var(--warning); }
.rf-compact--broken { background: rgba(239,68,68,0.2); border-color: var(--danger); color: var(--danger); }
.rf-compact--selected { box-shadow: 0 0 0 4px var(--accent-soft); }

/* Groups overlay */
.groups-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; }

/* Panel (details + editor) */
.side-panel { position: absolute; right: 0; top: 0; bottom: 0; width: 480px; max-width: 60vw; background: var(--bg-850); border-left: 1px solid var(--border); display: flex; flex-direction: column; z-index: 20; transform: translateX(100%); transition: transform 0.3s cubic-bezier(0.4,0,0.2,1); box-shadow: -20px 0 40px rgba(0,0,0,0.3); }
.side-panel.open { transform: translateX(0); }
.side-panel__header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); gap: 12px; background: var(--bg-800); flex-shrink: 0; }
.side-panel__tabs { display: flex; gap: 4px; }
.side-panel__tab { padding: 6px 12px; border-radius: 6px; background: transparent; border: none; color: var(--text-500); font-size: 12px; font-family: inherit; cursor: pointer; font-weight: 500; transition: all 0.15s; }
.side-panel__tab:hover { background: var(--bg-700); color: var(--text-200); }
.side-panel__tab.active { background: var(--accent-soft); color: var(--accent-hover); }
.side-panel__body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.details { padding: 16px; overflow-y: auto; flex: 1; }
.details::-webkit-scrollbar { width: 6px; }
.details::-webkit-scrollbar-thumb { background: var(--bg-600); border-radius: 3px; }
.details__title { font-size: 16px; font-weight: 700; color: var(--text-100); margin-bottom: 4px; word-break: break-word; }
.details__id { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--accent-hover); word-break: break-all; margin-bottom: 12px; padding: 6px 8px; background: var(--bg-800); border-radius: 6px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.details__id-text { flex: 1; }
.details__copy { background: transparent; border: none; color: var(--text-500); cursor: pointer; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
.details__copy:hover { background: var(--bg-700); color: var(--accent-hover); }
.details__badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.details__badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.details__badge--domain { background: rgba(16,185,129,0.15); color: var(--success); }
.details__badge--missing { background: rgba(245,158,11,0.15); color: var(--warning); }
.details__badge--broken { background: rgba(239,68,68,0.15); color: var(--danger); }
.details__badge--health-good { background: rgba(16,185,129,0.15); color: var(--success); }
.details__badge--health-mid { background: rgba(245,158,11,0.15); color: var(--warning); }
.details__badge--health-bad { background: rgba(239,68,68,0.15); color: var(--danger); }
.details__field { margin-bottom: 12px; }
.details__field-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-500); font-weight: 700; margin-bottom: 4px; }
.details__field-value { font-size: 13px; color: var(--text-200); line-height: 1.5; word-break: break-word; }
.details__tags { display: flex; flex-wrap: wrap; gap: 5px; }
.details__refs { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; max-height: 260px; overflow-y: auto; }
.details__ref { padding: 6px 8px; background: var(--bg-800); border-left: 2px solid var(--accent); border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-200); word-break: break-all; cursor: pointer; transition: all 0.15s; }
.details__ref:hover { background: var(--bg-700); border-left-color: var(--accent-hover); }
.details__ref-path { font-size: 10px; color: var(--text-500); margin-top: 2px; }
.details__ref--missing { border-left-color: var(--warning); }
.details__actions { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; padding-top: 12px; border-top: 1px solid var(--border); }

/* Context menu */
.ctx-menu { position: fixed; z-index: 500; background: var(--bg-800); border: 1px solid var(--border-hover); border-radius: 10px; box-shadow: 0 16px 48px rgba(0,0,0,0.5); padding: 6px; min-width: 200px; animation: popoverIn 0.12s ease; }
.ctx-menu__item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 12px; background: transparent; border: none; border-radius: 6px; color: var(--text-200); font-size: 13px; font-family: inherit; cursor: pointer; text-align: left; transition: background 0.1s; }
.ctx-menu__item:hover { background: var(--bg-700); }
.ctx-menu__item--danger { color: var(--danger); }
.ctx-menu__item--danger:hover { background: rgba(239,68,68,0.15); }
.ctx-menu__icon { width: 18px; text-align: center; font-size: 14px; }
.ctx-menu__divider { height: 1px; background: var(--border); margin: 4px 8px; }

/* Popover (existing) */
.popover-wrap { position: relative; display: inline-block; }
.popover-trigger { display: inline-block; }
.popover { position: absolute; top: calc(100% + 8px); background: var(--bg-800); border: 1px solid var(--border-hover); border-radius: 12px; box-shadow: 0 16px 48px rgba(0,0,0,0.5); animation: popoverIn 0.15s cubic-bezier(0.16,1,0.3,1); overflow: hidden; z-index: 1000; max-height: 80vh; overflow-y: auto;}
.popover--left { left: 0; }
.popover--right { right: 0; }
@keyframes popoverIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

/* Menu (existing) */
.menu { padding: 6px; }
.menu__header { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--text-500); }
.menu__action { background: transparent; border: none; color: var(--accent-hover); font-size: 11px; cursor: pointer; padding: 2px 6px; border-radius: 4px; font-family: inherit; font-weight: 600; text-transform: none; letter-spacing: 0; }
.menu__action:hover { background: var(--bg-700); }
.menu__section { padding: 6px 4px; }
.menu__label { padding: 4px 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--text-500); }
.menu__checkbox { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; color: var(--text-200); transition: background 0.1s; }
.menu__checkbox:hover { background: var(--bg-700); }
.menu__checkbox input { display: none; }
.menu__check { width: 16px; height: 16px; border-radius: 4px; border: 1.5px solid var(--border-hover); background: var(--bg-750); position: relative; flex-shrink: 0; transition: all 0.15s; }
.menu__checkbox input:checked + .menu__check { background: var(--accent); border-color: var(--accent); }
.menu__checkbox input:checked + .menu__check::after { content: ''; position: absolute; left: 4px; top: 1px; width: 5px; height: 9px; border: solid white; border-width: 0 2px 2px 0; transform: rotate(45deg); }
.menu__dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.menu__text { flex: 1; }
.menu__count { font-size: 11px; font-weight: 700; color: var(--text-500); padding: 1px 6px; background: var(--bg-750); border-radius: 8px; }
.menu__input { width: calc(100% - 20px); margin: 4px 10px; padding: 8px 10px; background: var(--bg-750); border: 1px solid var(--border); border-radius: 6px; color: var(--text-100); font-size: 12px; font-family: inherit; outline: none; }
.menu__input:focus { border-color: var(--accent); }
.menu__hint { padding: 6px 10px 4px; font-size: 11px; color: var(--text-500); line-height: 1.6; }
.menu__hint b { color: var(--accent-hover); background: var(--bg-700); padding: 0 4px; border-radius: 3px; font-weight: 700; }
.menu__item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; background: transparent; border: none; border-radius: 6px; color: var(--text-200); font-size: 13px; font-family: inherit; cursor: pointer; text-align: left; transition: background 0.1s; }
.menu__item:hover { background: var(--bg-700); }
.menu__item--active { background: var(--accent-soft); color: var(--accent-hover); }
.menu__item--danger { color: var(--danger); }
.menu__item--danger:hover { background: rgba(239,68,68,0.15); }
.menu__icon { font-size: 14px; width: 18px; text-align: center; }
.menu__divider { height: 1px; background: var(--border); margin: 4px 8px; }
.menu__row { display: flex; align-items: center; gap: 8px; padding: 4px 10px; }
.menu__slider { flex: 1; }

/* Search modal (existing) */
.search-overlay { position: fixed; inset: 0; background: rgba(10,14,26,0.7); backdrop-filter: blur(6px); z-index: 300; display: flex; align-items: flex-start; justify-content: center; padding-top: 12vh; animation: searchFadeIn 0.15s ease; }
@keyframes searchFadeIn { from { opacity: 0; } to { opacity: 1; } }
.search-modal { width: 580px; max-width: 90vw; background: var(--bg-800); border: 1px solid var(--border-hover); border-radius: 14px; box-shadow: 0 24px 80px rgba(0,0,0,0.6); overflow: hidden; display: flex; flex-direction: column; animation: searchSlideDown 0.2s cubic-bezier(0.16,1,0.3,1); }
@keyframes searchSlideDown { from { opacity: 0; transform: translateY(-20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
.search-modal__input-wrap { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--border); }
.search-modal__icon { font-size: 16px; color: var(--text-500); }
.search-modal__input { flex: 1; background: transparent; border: none; outline: none; color: var(--text-100); font-size: 15px; font-family: inherit; }
.search-modal__input::placeholder { color: var(--text-500); }
.search-modal__kbd, .search-modal__footer kbd { display: inline-block; padding: 2px 6px; background: var(--bg-700); border: 1px solid var(--border-hover); border-radius: 4px; font-size: 10px; font-family: 'JetBrains Mono', monospace; color: var(--text-400); font-weight: 600; }
.search-modal__results { max-height: 50vh; overflow-y: auto; padding: 8px; }
.search-modal__hint { padding: 24px; text-align: center; color: var(--text-500); font-size: 13px; }
.search-result { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; cursor: pointer; transition: background 0.1s; }
.search-result:hover, .search-result.active { background: var(--bg-700); }
.search-result__dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.search-result__dot--domain { background: var(--success); }
.search-result__dot--missing { background: var(--warning); }
.search-result__dot--broken { background: var(--danger); }
.search-result__content { flex: 1; min-width: 0; }
.search-result__id { font-size: 13px; font-weight: 500; color: var(--text-100); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.search-result__label { font-size: 11px; color: var(--text-500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.search-result__desc { font-size: 11px; color: var(--text-500); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.search-result__tags { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
.search-result__tag { display: inline-block; padding: 1px 6px; background: var(--bg-700); border: 1px solid var(--border); border-radius: 10px; font-size: 10px; color: var(--text-400); }
.search-result__badge { display: inline-block; margin-left: 6px; padding: 1px 5px; background: var(--accent-soft); border-radius: 4px; font-size: 9px; color: var(--accent-hover); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.search-hl { background: rgba(251,191,36,0.25); color: #fde68a; border-radius: 2px; padding: 0 1px; }
.search-modal__footer { display: flex; gap: 16px; padding: 10px 16px; border-top: 1px solid var(--border); background: var(--bg-850); font-size: 11px; color: var(--text-500); }
.search-modal__footer span { display: flex; align-items: center; gap: 4px; }

/* Tooltip */
.tooltip { position: fixed; z-index: 1000; background: var(--bg-800); border: 1px solid var(--border-hover); border-radius: 10px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); padding: 0; max-width: 480px; max-height: 500px; overflow: hidden; display: flex; flex-direction: column; font-size: 12px; color: var(--text-200); pointer-events: auto; }
.tooltip__header { padding: 12px 14px; border-bottom: 1px solid var(--border); font-weight: 600; font-size: 13px; color: var(--text-100); background: var(--bg-750); flex-shrink: 0; }
.tooltip__body { padding: 12px 14px; overflow-y: auto; flex: 1; }
.tooltip__body::-webkit-scrollbar { width: 6px; }
.tooltip__body::-webkit-scrollbar-thumb { background: var(--bg-600); border-radius: 3px; }
.tooltip__row { display: flex; gap: 8px; margin-bottom: 6px; font-size: 12px; }
.tooltip__label { color: var(--text-500); min-width: 70px; }
.tooltip__value { color: var(--text-200); word-break: break-all; }
.tooltip__ref { margin-bottom: 6px; padding: 8px 10px; background: var(--bg-750); border-radius: 6px; border-left: 2px solid var(--accent); }
.tooltip__fqid { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--accent-hover); margin-bottom: 4px; word-break: break-all; }
.tooltip__path { font-size: 10px; color: var(--text-500); font-family: monospace; margin-bottom: 6px; word-break: break-all; }
.tooltip__btn { font-size: 10px; padding: 4px 8px; background: var(--bg-700); border: 1px solid var(--border); border-radius: 4px; color: var(--text-300); cursor: pointer; font-family: inherit; transition: all 0.15s; }
.tooltip__btn:hover { background: var(--accent); color: white; border-color: var(--accent); }
.js-goto-domain { transition: color 0.15s, background 0.15s; border-radius: 3px; padding: 0 2px; }
.js-goto-domain:hover { background: var(--accent-soft); color: var(--accent-hover) !important; }
.tooltip__fqid.js-goto-domain:hover { text-decoration: underline; }

.fqid-highlight { background: rgba(99,102,241,0.15); }
.fqid-highlight-line { background: rgba(99,102,241,0.4); }
.diff-legend { display: flex; align-items: center; gap: 10px; padding: 6px 10px; background: var(--bg-800); border: 1px solid var(--border-hover); border-radius: 8px; font-size: 12px; color: var(--text-300); }
.diff-legend__item { display: inline-flex; align-items: center; gap: 5px; font-weight: 600; }
.diff-legend__dot { width: 8px; height: 8px; border-radius: 50%; }
.diff-legend__close { background: transparent; border: none; color: var(--text-500); cursor: pointer; padding: 2px 6px; border-radius: 4px; }
.diff-legend__close:hover { background: var(--bg-700); color: var(--text-200); }
.diff-legend__scope { font-size: 10px; color: var(--text-500); padding: 2px 6px; background: var(--bg-700); border-radius: 4px; font-family: 'JetBrains Mono', monospace; }

.empty-state { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: var(--text-500); z-index: 5; }
.empty-state__title { font-size: 16px; color: var(--text-400); margin-bottom: 6px; }
.empty-state__text { font-size: 13px; }

#monaco-container { width: 100%; height: 100%; }
.heat-legend {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-800);
  border: 1px solid var(--border-hover);
  border-radius: 10px;
  padding: 10px 14px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 5;
  min-width: 220px;
}
.heat-legend__title { font-size: 11px; font-weight: 700; color: var(--text-200); text-transform: uppercase; letter-spacing: 0.5px; }
.heat-legend__bar {
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(90deg, #dc2626 0%, #f59e0b 50%, #10b981 100%);
}
.heat-legend__labels { display: flex; justify-content: space-between; font-size: 10px; color: var(--text-500); font-family: 'JetBrains Mono', monospace; }
.heat-legend__close { position: absolute; top: 6px; right: 6px; background: transparent; border: none; color: var(--text-500); cursor: pointer; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
.heat-legend__close:hover { background: var(--bg-700); color: var(--text-200); }
.rule-item {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  background: var(--bg-750);
  border-radius: 6px;
  margin-bottom: 4px;
}
.rule-item__action {
  width: 24px; height: 24px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-size: 14px;
  flex-shrink: 0;
}
.rule-item__action--forbid { background: rgba(220,38,38,0.15); }
.rule-item__action--warn { background: rgba(245,158,11,0.15); }
.rule-item__body { flex: 1; min-width: 0; }
.rule-item__pattern {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--text-100);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rule-item__message { font-size: 11px; color: var(--text-500); margin-top: 2px; }
.rule-item__remove {
  background: transparent;
  border: none;
  color: var(--text-500);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
.rule-item__remove:hover { background: var(--bg-700); color: var(--danger); }
.rule-form { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.rule-form .menu__input { width: 100%; margin: 0; }
.tooltip {
  max-height: 600px;  /* увеличено с 500 */
}

.tooltip__body {
  max-height: 520px;  /* оставляем как fallback */
  overflow: hidden;   /* не скроллим body целиком */
  display: flex;
  flex-direction: column;
}

/* Скроллируемый список FQID */
.tooltip__fqid-list {
  flex: 1;
  min-height: 0;
  max-height: 300px;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
  margin-right: -4px;
}
.tooltip__fqid-list::-webkit-scrollbar { width: 6px; }
.tooltip__fqid-list::-webkit-scrollbar-track { background: transparent; }
.tooltip__fqid-list::-webkit-scrollbar-thumb {
  background: var(--bg-600);
  border-radius: 3px;
}
.tooltip__fqid-list::-webkit-scrollbar-thumb:hover { background: var(--border-hover); }
.bar-list::-webkit-scrollbar { width: 6px; }
.bar-list::-webkit-scrollbar-thumb { background: var(--bg-600); border-radius: 3px; }
.toast {
  position: fixed;
  top: 72px;
  right: 20px;
  z-index: 500;
  background: var(--bg-800);
  border: 1px solid var(--border-hover);
  border-left: 3px solid var(--warning);
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.4);
  padding: 12px 40px 12px 14px;
  max-width: 520px;
  display: flex;
  gap: 10px;
  animation: toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes toastIn {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}
.toast__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.toast__message { font-size: 13px; color: var(--text-200); line-height: 1.5; }
.toast__message b { color: var(--warning); font-weight: 600; }
.toast__action { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.toast__command {
  flex: 1;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  padding: 6px 10px;
  background: var(--bg-750);
  border-radius: 5px;
  color: var(--text-200);
  word-break: break-all;
  min-width: 0;
}
.toast__btn {
  font-size: 11px;
  padding: 6px 10px;
  background: var(--bg-700);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text-200);
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  transition: all 0.15s;
}
.toast__btn:hover { background: var(--accent); color: white; border-color: var(--accent); }
.toast__close {
  position: absolute;
  top: 8px;
  right: 8px;
  background: transparent;
  border: none;
  color: var(--text-500);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
}
.toast__close:hover { background: var(--bg-700); color: var(--text-200); }
.help-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 26, 0.75);
  backdrop-filter: blur(6px);
  z-index: 400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  animation: searchFadeIn 0.2s ease;
}
.help-modal {
  width: 900px;
  max-width: 90vw;
  max-height: 85vh;
  background: var(--bg-850);
  border: 1px solid var(--border-hover);
  border-radius: 14px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: searchSlideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.help-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-800);
}
.help-modal__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-100);
  letter-spacing: -0.3px;
}
.help-modal__close {
  background: transparent;
  border: none;
  color: var(--text-400);
  font-size: 18px;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 6px;
  transition: all 0.15s;
}
.help-modal__close:hover {
  background: var(--bg-700);
  color: var(--text-100);
}
.help-modal__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px 32px;
  scroll-behavior: smooth;
}
.help-modal__body::-webkit-scrollbar { width: 8px; }
.help-modal__body::-webkit-scrollbar-thumb { background: var(--bg-600); border-radius: 4px; }
.help-modal__loading {
  text-align: center;
  color: var(--text-500);
  padding: 60px;
}

/* Markdown content */
.help-content {
  color: var(--text-200);
  font-size: 14px;
  line-height: 1.65;
  max-width: 100%;
}
.help-content h1 {
  font-size: 26px;
  font-weight: 700;
  color: var(--text-100);
  margin: 0 0 16px 0;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
.help-content h2 {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-100);
  margin: 32px 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.help-content h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-100);
  margin: 24px 0 10px 0;
}
.help-content h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent-hover);
  margin: 20px 0 8px 0;
}
.help-content p { margin: 10px 0; }
.help-content strong { color: var(--text-100); font-weight: 600; }
.help-content em { color: var(--text-300); }

.help-content a {
  color: var(--accent-hover);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.15s;
}
.help-content a:hover { border-bottom-color: var(--accent-hover); }

.help-content ul,
.help-content ol {
  margin: 10px 0;
  padding-left: 24px;
}
.help-content li { margin: 5px 0; }

.help-content code {
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-size: 12.5px;
  padding: 2px 6px;
  background: var(--bg-700);
  border-radius: 4px;
  color: var(--accent-hover);
  word-break: break-word;
}

.help-content pre {
  background: var(--bg-800);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
  overflow-x: auto;
  margin: 14px 0;
  font-size: 12.5px;
  line-height: 1.55;
}
.help-content pre::-webkit-scrollbar { height: 8px; }
.help-content pre::-webkit-scrollbar-thumb { background: var(--bg-600); border-radius: 4px; }
.help-content pre code {
  background: transparent;
  padding: 0;
  color: var(--text-200);
  font-size: inherit;
}

.help-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 14px 0;
  font-size: 13px;
}
.help-content th,
.help-content td {
  padding: 8px 12px;
  border: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}
.help-content th {
  background: var(--bg-800);
  font-weight: 600;
  color: var(--text-100);
}
.help-content tr:nth-child(even) td {
  background: rgba(255, 255, 255, 0.02);
}

.help-content blockquote {
  margin: 14px 0;
  padding: 8px 16px;
  border-left: 3px solid var(--accent);
  background: var(--accent-soft);
  color: var(--text-300);
  border-radius: 0 6px 6px 0;
}
.help-content blockquote p { margin: 4px 0; }

.help-content hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 24px 0;
}
.validation-modal { width: 900px; }
.validation-modal__body { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 0; }

.validation-scope { padding: 20px 32px; display: flex; flex-direction: column; gap: 8px; }
.validation-scope__label {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 1px; color: var(--text-500); margin-bottom: 8px;
}
.validation-scope__option {
  display: flex; align-items: center; gap: 10px; padding: 12px 16px;
  background: var(--bg-800); border: 1px solid var(--border); border-radius: 8px;
  cursor: pointer; transition: all 0.15s;
}
.validation-scope__option:hover { border-color: var(--border-hover); }
.validation-scope__option.active { border-color: var(--accent); background: var(--accent-soft); }
.validation-scope__option input { display: none; }
.validation-scope__radio {
  width: 16px; height: 16px; border-radius: 50%;
  border: 2px solid var(--border-hover); position: relative; flex-shrink: 0;
}
.validation-scope__option.active .validation-scope__radio { border-color: var(--accent); }
.validation-scope__option.active .validation-scope__radio::after {
  content: ''; position: absolute; inset: 3px; border-radius: 50%; background: var(--accent);
}
.validation-scope__text { flex: 1; font-size: 13px; }
.validation-scope__count {
  font-size: 11px; font-weight: 700; padding: 2px 8px;
  background: var(--bg-700); border-radius: 10px; color: var(--text-400);
}

.validation-progress { padding: 16px 32px; }
.validation-progress__bar {
  height: 8px; background: var(--bg-700); border-radius: 4px; overflow: hidden;
}
.validation-progress__fill {
  height: 100%; background: linear-gradient(90deg, var(--accent), #8b5cf6);
  transition: width 0.3s ease;
}
.validation-progress__text {
  font-size: 12px; color: var(--text-400); margin-top: 8px; font-family: 'JetBrains Mono', monospace;
}

.validation-filters {
  display: flex; gap: 6px; padding: 12px 32px; border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.validation-filter {
  padding: 6px 12px; background: transparent; border: 1px solid var(--border);
  border-radius: 6px; color: var(--text-400); cursor: pointer;
  font-size: 12px; font-family: inherit; transition: all 0.15s;
}
.validation-filter:hover { background: var(--bg-700); color: var(--text-200); }
.validation-filter--active { background: var(--accent-soft); color: var(--accent-hover); border-color: var(--accent); }

.validation-logs {
  flex: 1; min-height: 0; overflow-y: auto; padding: 12px 32px;
  font-size: 13px;
}
.validation-logs::-webkit-scrollbar { width: 8px; }
.validation-logs::-webkit-scrollbar-thumb { background: var(--bg-600); border-radius: 4px; }
.validation-logs__empty { text-align: center; color: var(--text-500); padding: 40px; }

.validation-log {
  padding: 10px 12px; border-radius: 8px; margin-bottom: 6px;
  border-left: 3px solid var(--border); background: var(--bg-800);
}
.validation-log--valid { border-left-color: var(--success); }
.validation-log--invalid { border-left-color: var(--danger); }
.validation-log--error { border-left-color: var(--warning); }

.validation-log__head { display: flex; align-items: center; gap: 8px; }
.validation-log__icon { font-size: 14px; flex-shrink: 0; }
.validation-log__domain {
  font-family: 'JetBrains Mono', monospace; font-size: 12.5px;
  color: var(--accent-hover); cursor: pointer;
  text-decoration: underline dotted;
}
.validation-log__domain:hover { text-decoration: underline; color: var(--accent); }
.validation-log__count {
  font-size: 11px; padding: 1px 6px; border-radius: 8px;
  background: rgba(239, 68, 68, 0.15); color: var(--danger);
}
.validation-log__error { font-size: 11px; color: var(--warning); }

.validation-log__diag { margin-top: 8px; padding-left: 22px; }
.validation-diag {
  padding: 6px 10px; background: var(--bg-750); border-radius: 6px;
  margin-top: 4px; font-size: 12px;
}
.validation-diag__severity {
  font-weight: 700; font-size: 10px; text-transform: uppercase;
  color: var(--danger); letter-spacing: 0.5px; margin-bottom: 2px;
}
.validation-diag__message { color: var(--text-200); }
.validation-diag__label { color: var(--text-500); font-size: 11px; margin-top: 4px; font-family: monospace; }
.validation-diag__span { color: var(--accent-hover); }

.validation-footer {
  padding: 14px 32px; border-top: 1px solid var(--border);
  background: var(--bg-800); display: flex; align-items: center;
  justify-content: space-between; gap: 16px; flex-shrink: 0;
}
.validation-stats { display: flex; gap: 16px; font-size: 13px; font-weight: 600; }
.validation-stat { color: var(--text-400); }
.validation-stat--ok { color: var(--success); }
.validation-stat--err { color: var(--danger); }
.validation-stat--warn { color: var(--warning); }
.validation-footer__actions { display: flex; gap: 8px; }

[data-theme="light"] .validation-scope__option { background: #ffffff; }
[data-theme="light"] .validation-log { background: #ffffff; }
[data-theme="light"] .validation-diag { background: #f8fafc; }
.validation-log__head { display: flex; align-items: center; gap: 8px; }
.validation-log__head--clickable { cursor: pointer; user-select: none; }
.validation-log__head--clickable:hover .validation-log__domain { color: var(--accent); }

.validation-log__chevron {
  width: 14px;
  font-size: 11px;
  color: var(--text-500);
  flex-shrink: 0;
  display: inline-block;
  text-align: center;
}
.validation-log--open .validation-log__chevron { color: var(--accent-hover); }

.validation-log__hint {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-500);
  font-style: italic;
}
.validation-log--invalid.validation-log--open {
  background: var(--bg-750);
}
/* Полоса активных режимов */
.active-modes {
  display: flex;
  gap: 6px;
  padding: 6px 16px;
  background: var(--bg-850);
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  flex-shrink: 0;
  flex-wrap: nowrap;
  min-height: 38px;
  align-items: center;
}
.active-modes::-webkit-scrollbar { height: 3px; }
.active-modes::-webkit-scrollbar-thumb { background: var(--bg-600); border-radius: 2px; }

.active-mode {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px 4px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
  border: 1px solid;
  transition: all 0.15s;
}
.active-mode__icon { font-size: 12px; }
.active-mode__label { color: inherit; }

.active-mode__close {
  background: transparent;
  border: none;
  color: inherit;
  opacity: 0.6;
  cursor: pointer;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1;
  font-family: inherit;
  transition: all 0.15s;
}
.active-mode__close:hover { opacity: 1; background: rgba(255,255,255,0.1); }

.active-mode--accent { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-hover); }
.active-mode--orange { background: rgba(249,115,22,0.12); border-color: #f97316; color: #fb923c; }
.active-mode--cyan { background: rgba(34,211,238,0.12); border-color: #22d3ee; color: #67e8f9; }
.active-mode--yellow { background: rgba(251,191,36,0.12); border-color: #fbbf24; color: #fcd34d; }
.active-mode--red { background: rgba(239,68,68,0.12); border-color: #ef4444; color: #f87171; }
.active-mode--purple { background: rgba(139,92,246,0.12); border-color: #8b5cf6; color: #a78bfa; }
.active-mode--blue { background: rgba(59,130,246,0.12); border-color: #3b82f6; color: #60a5fa; }
.active-mode--gray { background: var(--bg-700); border-color: var(--border-hover); color: var(--text-400); }

[data-theme="light"] .active-mode--orange { background: rgba(249,115,22,0.15); color: #c2410c; }
[data-theme="light"] .active-mode--cyan { background: rgba(6,182,212,0.15); color: #0e7490; }
[data-theme="light"] .active-mode--yellow { background: rgba(251,191,36,0.2); color: #92400e; }
[data-theme="light"] .active-mode--red { background: rgba(239,68,68,0.15); color: #b91c1c; }
[data-theme="light"] .active-mode--purple { background: rgba(139,92,246,0.15); color: #6d28d9; }
[data-theme="light"] .active-mode--blue { background: rgba(59,130,246,0.15); color: #1d4ed8; }
[data-theme="light"] .active-mode--accent { background: var(--accent-soft); color: var(--accent-hover); }
.topo-modal { width: 900px; }
.topo-result { padding: 12px 32px; overflow-y: auto; flex: 1; min-height: 0; }
.topo-result::-webkit-scrollbar { width: 8px; }
.topo-result::-webkit-scrollbar-thumb { background: var(--bg-600); border-radius: 4px; }

.topo-level {
  margin-bottom: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-800);
  overflow: hidden;
}
.topo-level__header {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; cursor: pointer; transition: background 0.15s;
}
.topo-level__header:hover { background: var(--bg-700); }
.topo-level__badge {
  width: 26px; height: 26px; border-radius: 50%;
  background: linear-gradient(135deg, var(--accent), #8b5cf6);
  color: #fff; font-size: 12px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.topo-level__title { font-weight: 600; font-size: 13px; color: var(--text-100); }
.topo-level__count { margin-left: auto; font-size: 11px; color: var(--text-500); }

.topo-level__body { padding: 6px 14px 12px; border-top: 1px solid var(--border); }
.topo-domain { padding: 4px 0; }
.topo-domain__head { display: flex; align-items: center; gap: 8px; }
.topo-domain__deps { margin-top: 4px; padding-left: 26px; }
.topo-dep { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 2px 0; }
.topo-dep__level {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; padding: 1px 6px; border-radius: 4px;
  background: var(--bg-700); color: var(--text-500);
}

.topo-cyclic {
  border: 1px solid var(--danger); border-radius: 8px;
  margin-bottom: 12px; background: rgba(239,68,68,0.05);
  overflow: hidden;
}
.topo-cyclic__header {
  padding: 10px 14px; font-weight: 600; font-size: 13px;
  color: var(--danger); display: flex; gap: 8px; align-items: center;
  background: rgba(239,68,68,0.08);
}
.topo-cyclic__icon { font-size: 14px; }
.topo-cyclic__body { padding: 10px 14px; display: flex; flex-wrap: wrap; gap: 10px; }

.topo-badge {
  padding: 1px 6px;
  background: linear-gradient(135deg, var(--accent), #8b5cf6);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  border-radius: 10px;
  border: 2px solid var(--bg-800);
  font-family: 'JetBrains Mono', monospace;
  pointer-events: none;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
}

.active-mode--green { background: rgba(16,185,129,0.12); border-color: #10b981; color: #34d399; }
[data-theme="light"] .active-mode--green { background: rgba(16,185,129,0.15); color: #047857; }
.topo-domain--broken {
  background: rgba(245, 158, 11, 0.06);
  border-left: 2px solid var(--warning);
  padding-left: 8px;
  border-radius: 4px;
}

.topo-broken-badge {
  margin-left: 8px;
  padding: 1px 6px;
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: var(--warning);
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  cursor: help;
}

.topo-cyclic__header--broken {
  background: rgba(245, 158, 11, 0.08);
  color: var(--warning);
}

.topo-broken-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.topo-broken-item__meta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  padding: 1px 6px;
  background: var(--bg-700);
  color: var(--text-500);
  border-radius: 4px;
}

.topo-broken-item__deps {
  font-size: 11px;
  color: var(--warning);
  cursor: help;
}

[data-theme="light"] .topo-domain--broken {
  background: rgba(217, 119, 6, 0.08);
  border-left-color: #d97706;
}
[data-theme="light"] .topo-broken-badge {
  background: rgba(217, 119, 6, 0.12);
  color: #b45309;
}
[data-theme="light"] .topo-cyclic__header--broken {
  color: #b45309;
}
.search-modal--palette { width: 680px; }

.palette-section { margin-bottom: 8px; }
.palette-section__title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-500);
  padding: 8px 12px 4px;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.1s;
  font-size: 13px;
  color: var(--text-200);
}
.palette-item:hover,
.palette-item.active {
  background: var(--bg-700);
}
.palette-item.active {
  box-shadow: inset 2px 0 0 var(--accent);
}
.palette-item__icon {
  width: 22px;
  flex-shrink: 0;
  text-align: center;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.palette-item__label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.palette-item--command .palette-item__label {
  font-weight: 500;
}
.palette-item__content { flex: 1; min-width: 0; }
.palette-item__hotkey {
  flex-shrink: 0;
  padding: 2px 6px;
  background: var(--bg-800);
  border: 1px solid var(--border-hover);
  border-radius: 4px;
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-400);
  font-weight: 600;
}
.palette-item.active .palette-item__hotkey {
  background: var(--accent-soft);
  color: var(--accent-hover);
  border-color: var(--accent);
}

/* Hotkeys modal */
.hotkeys-modal { width: 620px; }
.hotkeys-body {
  padding: 20px 32px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.hotkeys-body::-webkit-scrollbar { width: 8px; }
.hotkeys-body::-webkit-scrollbar-thumb { background: var(--bg-600); border-radius: 4px; }

.hotkeys-group { margin-bottom: 24px; }
.hotkeys-group__title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-500);
  margin-bottom: 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.hotkeys-group__items {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
}
.hotkey-row {
  display: grid;
  grid-template-columns: 200px 1fr;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  font-size: 13px;
}
.hotkey-row__keys {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.hotkey-key {
  display: inline-block;
  padding: 3px 8px;
  background: var(--bg-700);
  border: 1px solid var(--border-hover);
  border-bottom-width: 2px;
  border-radius: 5px;
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-100);
  min-width: 24px;
  text-align: center;
}
.hotkey-plus {
  color: var(--text-500);
  font-size: 10px;
  font-weight: 700;
}
.hotkey-row__label {
  color: var(--text-300);
  font-size: 13px;
}
.hotkeys-footer {
  padding: 12px 32px 20px;
  font-size: 12px;
  color: var(--text-500);
  border-top: 1px solid var(--border);
  text-align: center;
  font-style: italic;
  flex-shrink: 0;
}

[data-theme="light"] .hotkey-key {
  background: #f8fafc;
  color: #0f172a;
}
[data-theme="light"] .palette-item__hotkey {
  background: #f8fafc;
}
[data-theme="light"] .palette-item.active .palette-item__hotkey {
  background: var(--accent-soft);
  color: var(--accent-hover);
}
.graph-container.hide-labels .react-flow__edge-text,
.graph-container.hide-labels .react-flow__edge-textbg {
  opacity: 0 !important;
  transition: opacity 0.2s;
}
/* Performance mode — упрощаем визуал при большом числе рёбер */

.graph-container.perf-mode .rf-node {
  box-shadow: none !important;
  transition: none !important;
  border-width: 1px !important;
}
.graph-container.perf-mode .rf-node:hover {
  transform: none !important;
  box-shadow: none !important;
}
.graph-container.perf-mode .rf-node {
  box-shadow: none !important;
  transition: none !important;
}
.graph-container.perf-mode .rf-node__id {
  font-size: 11px;
}

.graph-container.perf-mode .react-flow__edge-path {
  stroke-width: 1 !important;
}

.graph-container.perf-mode .rf-handle {
  width: 4px !important;
  height: 4px !important;
}

.graph-container.perf-mode .react-flow__edge:hover .react-flow__edge-path {
  stroke-width: 1.5 !important;
}
/* Строка с ID + health */
.rf-node__id-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  width: 100%;
}

.rf-node__id {
  flex: 0 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

/* Невалидный домен — красное волнистое подчёркивание */
.rf-node__id--invalid {
  color: #fca5a5;
  padding-bottom: 3px;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='4'><path d='M0 3 Q 5 0, 10 3 T 20 3 T 30 3 T 40 3' stroke='%23ef4444' stroke-width='1.4' fill='none'/></svg>");
  background-repeat: repeat-x;
  background-position: 0 100%;
  background-size: 20px 4px;
}
[data-theme="light"] .rf-node__id--invalid {
  color: #b91c1c;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='4'><path d='M0 3 Q 5 0, 10 3 T 20 3 T 30 3 T 40 3' stroke='%23dc2626' stroke-width='1.4' fill='none'/></svg>");
}

/* Health score как тег */
.rf-node__health {
  flex-shrink: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 6px;
  line-height: 1.5;
  white-space: nowrap;
}
.rf-node__health--good {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}
.rf-node__health--mid {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}
.rf-node__health--bad {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}
[data-theme="light"] .rf-node__health--good { background: rgba(5, 150, 105, 0.12); color: #047857; }
[data-theme="light"] .rf-node__health--mid { background: rgba(217, 119, 6, 0.12); color: #b45309; }
[data-theme="light"] .rf-node__health--bad { background: rgba(185, 28, 28, 0.12); color: #b91c1c; }
.tooltip__validation-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tooltip__validation-item {
  padding: 8px 10px;
  background: var(--bg-750);
  border-radius: 6px;
  border-left: 2px solid var(--border);
  font-size: 12px;
}

.tooltip__validation-severity {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}
.tooltip__validation-severity--error { color: var(--danger); }
.tooltip__validation-severity--warning { color: var(--warning); }
.tooltip__validation-severity--info { color: var(--accent-hover); }

.tooltip__validation-message {
  color: var(--text-200);
  line-height: 1.4;
}

.tooltip__validation-label {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-500);
  font-family: 'JetBrains Mono', monospace;
}
.tooltip__validation-span {
  color: var(--accent-hover);
}
.rf-node__issues {
  flex-shrink: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  line-height: 1.5;
}
[data-theme="light"] .rf-node__issues {
  background: rgba(185, 28, 28, 0.12);
  color: #b91c1c;
}
.tooltip__validation-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
  padding-right: 4px;
  margin-right: -4px;
  margin-top: 8px;
}
.tooltip__validation-list::-webkit-scrollbar { width: 6px; }
.tooltip__validation-list::-webkit-scrollbar-thumb {
  background: var(--bg-600);
  border-radius: 3px;
}

.tooltip__validation-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background: transparent;
  border: none;
  color: inherit;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  padding: 6px 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  text-align: left;
}
.tooltip__validation-toggle:hover {
  background: var(--bg-750);
}
.tooltip__validation-arrow {
  font-size: 11px;
  color: var(--text-500);
  width: 12px;
  display: inline-block;
  transition: transform 0.15s;
}
.tooltip__validation-title {
  flex: 1;
  font-weight: 600;
}
.tooltip__validation-count {
  padding: 1px 6px;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
  font-size: 10px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
}
[data-theme="light"] .tooltip__validation-count {
  background: rgba(185, 28, 28, 0.12);
  color: #b91c1c;
}
.learning-path-modal { width: 900px; }

.learning-path-hint {
  background: var(--accent-soft);
  border-radius: 8px;
  padding: 12px 16px;
}
.learning-path-hint__title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--accent-hover);
  margin-bottom: 8px;
}
.learning-path-hint__list {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  color: var(--text-300);
  line-height: 1.7;
}

.learning-entry-points {
  border: 1px solid var(--accent);
  background: var(--accent-soft);
  border-radius: 8px;
  margin-bottom: 12px;
  overflow: hidden;
}
.learning-entry-points__header {
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 13px;
  color: var(--accent-hover);
}
.learning-entry-points__icon { font-size: 14px; }
.learning-entry-points__hint {
  font-size: 11px;
  color: var(--text-500);
  margin-left: auto;
  font-style: italic;
}
.learning-entry-points__body {
  padding: 10px 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  background: var(--bg-800);
}

.learning-path-stage-badge {
  background: linear-gradient(135deg, #06b6d4, #0891b2) !important;
}

.learning-stage-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px 14px;
}

.learning-domain-card {
  background: var(--bg-750);
  border-radius: 8px;
  padding: 10px 12px;
  border-left: 3px solid var(--accent);
}
.learning-domain-card__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.learning-domain-card__label {
  font-size: 12px;
  color: var(--text-500);
  font-style: italic;
}
.learning-domain-card__desc {
  font-size: 12px;
  color: var(--text-400);
  margin: 4px 0 6px;
  line-height: 1.5;
}
.learning-domain-card__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 11px;
  color: var(--text-500);
}
.learning-domain-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: 'JetBrains Mono', monospace;
}
.learning-domain-stat__icon {
  color: var(--accent-hover);
  font-weight: 700;
}
.learning-domain-stat--tags {
  background: var(--bg-700);
  padding: 1px 8px;
  border-radius: 8px;
}

/* Tour overlay */
.tour-overlay {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 250;
  pointer-events: none;
  animation: tourIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes tourIn {
  from { opacity: 0; transform: translateX(-50%) translateY(30px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

.tour-overlay__card {
  pointer-events: auto;
  width: 480px;
  max-width: 90vw;
  background: var(--bg-800);
  border: 1px solid var(--border-hover);
  border-radius: 14px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.5), 0 0 0 4px var(--accent-soft);
  padding: 16px 20px;
}

.tour-overlay__header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.tour-overlay__stage-badge {
  padding: 3px 10px;
  border-radius: 12px;
  background: linear-gradient(135deg, #06b6d4, #0891b2);
  color: white;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.tour-overlay__counter {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-500);
  margin-left: auto;
}
.tour-overlay__close {
  background: transparent;
  border: none;
  color: var(--text-500);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 14px;
  margin-left: 4px;
}
.tour-overlay__close:hover {
  background: var(--bg-700);
  color: var(--danger);
}

.tour-overlay__title {
  font-family: 'JetBrains Mono', monospace;
  font-size: 15px;
  font-weight: 600;
  color: var(--accent-hover);
  margin-bottom: 4px;
  word-break: break-all;
}
.tour-overlay__subtitle {
  font-size: 13px;
  color: var(--text-300);
  margin-bottom: 8px;
}
.tour-overlay__desc {
  font-size: 13px;
  color: var(--text-400);
  line-height: 1.5;
  margin-bottom: 12px;
}
.tour-overlay__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 10px;
}
.tour-stat {
  font-size: 11px;
  color: var(--text-500);
  font-family: 'JetBrains Mono', monospace;
}
.tour-overlay__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 12px;
}

.tour-overlay__progress {
  margin-bottom: 12px;
}
.tour-overlay__progress-bar {
  height: 4px;
  background: var(--bg-700);
  border-radius: 2px;
  overflow: hidden;
}
.tour-overlay__progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), #06b6d4);
  transition: width 0.3s ease;
}

.tour-overlay__controls {
  display: flex;
  justify-content: center;
  gap: 8px;
}
.tour-btn {
  width: 44px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-750);
  color: var(--text-200);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
  font-family: inherit;
}
.tour-btn:hover:not(:disabled) {
  background: var(--bg-700);
  border-color: var(--accent);
}
.tour-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.tour-btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
  width: 56px;
}
.tour-btn--primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

[data-theme="light"] .tour-overlay__card {
  box-shadow: 0 16px 48px rgba(15,23,42,0.2), 0 0 0 4px var(--accent-soft);
}
.entity-hierarchy-modal {
  width: 100vw;
  height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  border-radius: 0;
  border: none;
}
.entity-hierarchy-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.entity-search-panel {
  width: 340px;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.entity-search-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.entity-search-icon { font-size: 14px; color: var(--text-500); }
.entity-search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-100);
  font-size: 13px;
  font-family: inherit;
}
.entity-search-input::placeholder { color: var(--text-500); }
.entity-search-results {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
}
.entity-search-results::-webkit-scrollbar { width: 6px; }
.entity-search-results::-webkit-scrollbar-thumb { background: var(--bg-600); border-radius: 3px; }
.entity-search-hint {
  text-align: center;
  padding: 30px 16px;
  color: var(--text-500);
  font-size: 12px;
  line-height: 1.6;
}
.entity-search-item {
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}
.entity-search-item:hover { background: var(--bg-700); }
.entity-search-item--active {
  background: var(--accent-soft);
  box-shadow: inset 2px 0 0 var(--accent);
}
.entity-search-item--orphan { opacity: 0.55; }
.entity-search-item__id {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--text-100);
  font-weight: 600;
}
.entity-search-item__name {
  font-size: 11px;
  color: var(--text-400);
  margin-top: 2px;
}
.entity-search-item__meta {
  display: flex;
  gap: 6px;
  margin-top: 4px;
  align-items: center;
  flex-wrap: wrap;
}
.entity-search-item__domain {
  font-size: 10px;
  color: var(--text-500);
  font-family: 'JetBrains Mono', monospace;
}
.entity-search-item__badge {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 6px;
  background: var(--bg-700);
  color: var(--text-500);
}
.entity-search-item__badge--ok {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.entity-graph-panel {
  flex: 1;
  position: relative;
  background: var(--graph-bg);
  min-width: 0;
  overflow: hidden;
}
.entity-graph-back {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 5;
  padding: 6px 12px;
  background: var(--bg-800);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-200);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.entity-graph-back:hover {
  background: var(--bg-700);
  border-color: var(--accent);
}
.entity-graph-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: var(--text-500);
}
.entity-graph-empty__icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.4;
}
.entity-graph-empty__title { font-size: 14px; color: var(--text-400); }
.entity-graph-empty__hint {
  font-size: 12px;
  margin-top: 6px;
  color: var(--text-500);
}
.entity-graph-container {
  width: 100%;
  height: 100%;
  overflow: auto;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.entity-graph-svg {
  min-width: 100%;
  min-height: 100%;
  max-width: 100%;
}

.entity-edge {
  fill: none;
  stroke: var(--accent-hover);
  stroke-width: 1.5;
}
.entity-edge--cycle {
  stroke: var(--danger);
  stroke-width: 2;
  stroke-dasharray: 6 4;
}
.entity-arrow-marker { fill: var(--accent-hover); }

.entity-graph-node { transition: opacity 0.15s; }
.entity-graph-node:hover:not(.entity-graph-node--missing) { opacity: 0.85; }
.entity-graph-node:hover:not(.entity-graph-node--missing) .entity-node-rect {
  stroke-width: 2.5;
  stroke: var(--accent);
}

.entity-node-rect {
  fill: var(--bg-800);
  stroke: var(--border-hover);
  stroke-width: 1.5;
  transition: all 0.15s;
}
.entity-node-rect--root {
  fill: var(--accent-soft);
  stroke: var(--accent);
  stroke-width: 2.5;
}
.entity-node-rect--foreign {
  stroke: #8b5cf6;
  stroke-dasharray: 5 3;
}
.entity-node-rect--cycle {
  stroke: var(--danger);
  stroke-width: 2.5;
}
.entity-node-rect--missing {
  fill: rgba(239, 68, 68, 0.08);
  stroke: var(--danger);
  stroke-dasharray: 4 3;
}

.entity-node-id {
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-size: 12px;
  font-weight: 600;
  fill: var(--text-100);
  pointer-events: none;
}
.entity-node-id--root {
  font-size: 14px;
  fill: var(--accent-hover);
}
.entity-node-name {
  font-size: 10px;
  fill: var(--text-400);
  pointer-events: none;
}
.entity-node-domain {
  font-size: 9px;
  fill: var(--text-500);
  font-family: 'JetBrains Mono', monospace;
  cursor: pointer;
  transition: fill 0.15s;
}
.entity-node-domain:hover { fill: var(--accent-hover); text-decoration: underline; }
.entity-node-domain--foreign { fill: #a78bfa; }
.entity-node-domain--foreign:hover { fill: #c4b5fd; }
.entity-node-domain--missing { fill: var(--danger); cursor: default; }
.entity-node-domain--missing:hover { fill: var(--danger); text-decoration: none; }

/* Вкладка «Сущности» в панели деталей */
.entity-tab-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}
.entity-tab-item {
  padding: 8px 10px;
  background: var(--bg-800);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  border-left: 2px solid transparent;
}
.entity-tab-item:hover {
  background: var(--bg-700);
  border-left-color: var(--accent);
}
.entity-tab-item__head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.entity-tab-item__id {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-100);
}
.entity-tab-item__arrows {
  margin-left: auto;
  font-size: 11px;
  color: var(--success);
  font-family: 'JetBrains Mono', monospace;
}
.entity-tab-item__name {
  font-size: 11px;
  color: var(--text-400);
  margin-top: 2px;
}
.entity-tab-item__inherits {
  font-size: 10px;
  color: var(--text-500);
  font-family: 'JetBrains Mono', monospace;
  margin-top: 3px;
}

[data-theme="light"] .entity-node-rect { fill: #ffffff; }
[data-theme="light"] .entity-node-rect--root { fill: var(--accent-soft); }
[data-theme="light"] .entity-node-rect--missing { fill: rgba(185, 28, 28, 0.08); }
[data-theme="light"] .entity-node-rect--foreign { stroke: #6d28d9; }
[data-theme="light"] .entity-edge { stroke: #4f46e5; }
[data-theme="light"] .entity-arrow-marker { fill: #4f46e5; }

.entity-hierarchy-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

/* Обёртка диаграммы */


.entity-graph-container {
  width: 100%;
  height: 100%;
  cursor: grab;
  overflow: hidden;
}
.entity-graph-container--dragging {
  cursor: grabbing;
}

.entity-graph-svg {
  display: block;
  user-select: none;
}

/* Кнопки управления зумом */
.entity-graph-controls {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-800);
  border: 1px solid var(--border-hover);
  border-radius: 10px;
  padding: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.entity-ctrl-btn {
  width: 36px;
  height: 36px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-200);
  cursor: pointer;
  font-size: 16px;
  font-family: inherit;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.entity-ctrl-btn:hover {
  background: var(--bg-700);
  color: var(--accent-hover);
}
.entity-zoom-level {
  padding: 0 10px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-400);
  font-weight: 600;
  min-width: 48px;
  text-align: center;
}

/* Кнопка «Назад» остаётся */
.entity-graph-back {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 10;
  padding: 8px 14px;
  background: var(--bg-800);
  border: 1px solid var(--border-hover);
  border-radius: 8px;
  color: var(--text-200);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  font-weight: 500;
  transition: all 0.15s;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.entity-graph-back:hover {
  background: var(--bg-700);
  border-color: var(--accent);
  color: var(--accent-hover);
}

/* Поисковая панель — чуть шире */
.entity-search-panel {
  width: 360px;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-850);
}

/* Пустое состояние */
.entity-graph-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: var(--text-500);
}

/* Светлая тема */
[data-theme="light"] .entity-graph-controls,
[data-theme="light"] .entity-graph-back {
  box-shadow: 0 4px 12px rgba(15,23,42,0.12);
}
[data-theme="light"] .entity-ctrl-btn:hover,
[data-theme="light"] .entity-graph-back:hover {
  background: #f1f5f9;
}
/* Полноэкранный overlay для иерархии */
.help-overlay--fullscreen {
  padding: 0;
}

/* Полноэкранная модалка */
.entity-hierarchy-modal {
  width: 100vw;
  height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  border-radius: 0;
  border: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.entity-hierarchy-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

/* Панель диаграммы — занимает всё оставшееся место */
.entity-graph-panel {
  flex: 1;
  position: relative;
  background: var(--graph-bg);
  min-width: 0;
  overflow: hidden;
}

/* Контейнер графа внутри панели */
.entity-graph-container {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: grab;
  overflow: hidden;
}
.entity-graph-container--dragging {
  cursor: grabbing;
}

.entity-graph-svg {
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
}

.entity-node-id,
.entity-node-name,
.entity-node-domain {
  overflow: hidden;
}
.rf-node[style*="background"] {
  /* Если узел имеет inline-цвет от heatmap, отключаем дефолтный фон */
  background-image: none !important;
}
.rf-node[style*="background"] .rf-node__id,
.rf-node[style*="background"] .rf-node__name {
  color: #ffffff !important;
}
.rf-node[style*="background"] .rf-node__icon {
  background: rgba(0,0,0,0.25) !important;
  color: #ffffff !important;
}
.menu__pill {
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--bg-750);
  border: 1px solid var(--border);
  color: var(--text-400);
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
  font-weight: 600;
  transition: all 0.15s;
  margin-right: 4px;
}
.menu__pill:hover {
  background: var(--bg-700);
  color: var(--text-200);
}
.menu__pill--active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent-hover);
}


.groups-overlay {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
  pointer-events: none;
  transform-origin: 0 0;
  will-change: transform;
}
[data-theme="dark"] .rf-node {
  background: linear-gradient(180deg, #1e2b47 0%, #131c2e 100%);
  border-color: #33456a;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05);
}
[data-theme="dark"] .rf-node:hover {
  background: linear-gradient(180deg, #263659 0%, #1a2642 100%);
  border-color: #5a75b8;
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
 .material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  font-size: 18px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  -webkit-font-feature-settings: 'liga';
  -webkit-font-smoothing: antialiased;
  user-select: none;
  vertical-align: middle;
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}

.material-symbols-outlined.mi-sm { font-size: 14px; }
.material-symbols-outlined.mi-md { font-size: 18px; }
.material-symbols-outlined.mi-lg { font-size: 24px; }
.material-symbols-outlined.mi-xl { font-size: 32px; }

.material-symbols-outlined.mi-fill {
  font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}   
  .side-panel__pane {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
  .rules-modal {
  width: 720px;
  max-width: 92vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}
.rules-modal__body {
  padding: 16px 24px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

/* Форма */
.rules-form {
  background: var(--bg-800);
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 20px;
}
.rules-form__label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-500);
  margin-bottom: 10px;
}
.rules-form__row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.rules-form__input {
  flex: 1;
  padding: 8px 12px;
  background: var(--bg-750);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-100);
  font-size: 13px;
  font-family: 'JetBrains Mono', monospace;
  outline: none;
}
.rules-form__input:focus { border-color: var(--accent); }
.rules-form__select {
  padding: 8px 12px;
  background: var(--bg-750);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-100);
  font-size: 13px;
  font-family: inherit;
  outline: none;
}
.rules-form__arrow {
  color: var(--accent-hover);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
.rules-form__hint {
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-500);
  line-height: 1.6;
}
.rules-form__hint code {
  background: var(--bg-750);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  color: var(--accent-hover);
}
.rules-form__hint b {
  color: var(--accent-hover);
  background: var(--bg-750);
  padding: 0 4px;
  border-radius: 3px;
}

/* Список правил */
.rules-list { margin-bottom: 20px; }
.rules-list__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.rules-list__clear {
  background: transparent;
  border: none;
  color: var(--text-500);
  font-size: 11px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  font-family: inherit;
}
.rules-list__clear:hover { background: var(--bg-700); color: var(--danger); }
.rules-list__empty {
  padding: 20px;
  text-align: center;
  color: var(--text-500);
  font-size: 13px;
}

.rules-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-800);
  border-radius: 8px;
  margin-bottom: 6px;
  border-left: 3px solid var(--border);
}
.rules-item--warn { border-left-color: var(--warning); }
.rules-item--forbid { border-left-color: var(--danger); }

.rules-item__action {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  transition: all 0.15s;
}
.rules-item__action--warn { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
.rules-item__action--forbid { background: rgba(239, 68, 68, 0.15); color: var(--danger); }
.rules-item__action:hover { transform: scale(1.05); }

.rules-item__body { flex: 1; min-width: 0; }
.rules-item__pattern {
  font-size: 13px;
  color: var(--text-100);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rules-item__pattern code {
  background: var(--bg-750);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11.5px;
  color: var(--accent-hover);
}
.rules-item__arrow { color: var(--text-500); }
.rules-item__message { font-size: 11px; color: var(--text-500); margin-top: 2px; }

.rules-item__remove {
  background: transparent;
  border: none;
  color: var(--text-500);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
}
.rules-item__remove:hover { background: var(--bg-700); color: var(--danger); }

/* Toggles */
.rules-toggles {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  margin-bottom: 16px;
}
.rules-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-200);
  padding: 4px 0;
}
.rules-toggle input { display: none; }
.rules-toggle__check {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1.5px solid var(--border-hover);
  background: var(--bg-750);
  position: relative;
  flex-shrink: 0;
  transition: all 0.15s;
}
.rules-toggle input:checked + .rules-toggle__check {
  background: var(--accent);
  border-color: var(--accent);
}
.rules-toggle input:checked + .rules-toggle__check::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 5px;
  height: 9px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

/* Список нарушений */
.rules-violations { margin-bottom: 8px; }
.rules-violations__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
  padding-right: 4px;
}
.rules-violations__list::-webkit-scrollbar { width: 6px; }
.rules-violations__list::-webkit-scrollbar-thumb { background: var(--bg-600); border-radius: 3px; }

.rules-violation {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--bg-800);
  border-radius: 6px;
  font-size: 12px;
  border-left: 2px solid var(--border);
}
.rules-violation--warn { border-left-color: var(--warning); }
.rules-violation--forbid { border-left-color: var(--danger); }
.rules-violation__from,
.rules-violation__to {
  font-family: 'JetBrains Mono', monospace;
  color: var(--accent-hover);
  cursor: pointer;
  text-decoration: underline dotted;
}
.rules-violation__from:hover,
.rules-violation__to:hover { text-decoration: underline; }
.rules-violation__arrow { color: var(--text-500); }
.rules-violation__message {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-500);
  font-style: italic;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rules-violations__more {
  font-size: 11px;
  color: var(--text-500);
  padding: 8px;
  text-align: center;
}

/* Footer */
.rules-modal__footer {
  padding: 12px 24px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-800);
  flex-shrink: 0;
}
.rules-modal__stats {
  font-size: 12px;
  color: var(--text-500);
}
.rules-modal__stats--err { color: var(--danger); }

/* Light theme */
[data-theme="light"] .rules-form { background: #f8fafc; }
[data-theme="light"] .rules-item { background: #ffffff; }
[data-theme="light"] .rules-violation { background: #ffffff; }
[data-theme="light"] .rules-form__input,
[data-theme="light"] .rules-form__select { background: #ffffff; }
.tag--active {
  background: var(--accent-soft) !important;
  border-color: var(--accent) !important;
  color: var(--accent-hover) !important;
}
  .details__field-label--btn {
  display: flex;
  align-items: center;
  width: 100%;
  background: transparent;
  border: none;
  color: var(--text-500);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 700;
  padding: 4px 0;
  cursor: pointer;
  font-family: inherit;
  transition: color 0.15s;
}
.details__field-label--btn:hover { color: var(--accent-hover); }
.details__field-count {
  margin-left: auto;
  padding: 1px 6px;
  background: var(--bg-700);
  border-radius: 8px;
  color: var(--text-500);
  font-size: 10px;
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0;
}
  .tag--active {
  background: var(--accent-soft) !important;
  border-color: var(--accent) !important;
  color: var(--accent-hover) !important;
}

.tooltip__fqid-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
  padding-right: 4px;
  margin-right: -4px;
}
.tooltip__fqid-list::-webkit-scrollbar { width: 6px; }
.tooltip__fqid-list::-webkit-scrollbar-thumb { background: var(--bg-600); border-radius: 3px; }

.tooltip__ref {
  padding: 8px 10px;
  background: var(--bg-750);
  border-radius: 6px;
  border-left: 2px solid var(--accent);
}

.tooltip__fqid {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--accent-hover);
  margin-bottom: 6px;
  word-break: break-all;
}

/* Контекст: откуда → куда */
.tooltip__ref-context {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.tooltip__ref-arrow {
  color: var(--text-500);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
.tooltip__ref-node {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  background: var(--bg-800);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-400);
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
  max-width: 180px;
  min-width: 0;
}
.tooltip__ref-node:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent-hover);
}
.tooltip__ref-node-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'JetBrains Mono', monospace;
}
.tooltip__ref-node .material-symbols-outlined {
  font-size: 12px;
  flex-shrink: 0;
}

.tooltip__path {
  font-size: 10px;
  color: var(--text-500);
  font-family: 'JetBrains Mono', monospace;
  margin-bottom: 6px;
  word-break: break-all;
}
.empty-state__icon { color: var(--text-500); margin-bottom: 12px; }
.empty-state__actions {
  display: flex; gap: 8px; margin-top: 16px;
  justify-content: center; flex-wrap: wrap;
}  
.search-result__fqid-block {
  margin-top: 6px;
  padding: 6px 8px;
  background: rgba(99, 102, 241, 0.06);
  border-left: 2px solid var(--accent);
  border-radius: 4px;
}
.search-result__fqid-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--accent-hover);
  margin-bottom: 4px;
}
.search-result__fqid-head .material-symbols-outlined {
  font-size: 12px;
}
.search-result__fqid-item {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-200);
  padding: 2px 0;
  word-break: break-all;
}
.search-result__fqid-path {
  display: inline-block;
  margin-left: 8px;
  font-size: 10px;
  color: var(--text-500);
  font-family: 'JetBrains Mono', monospace;
}
.search-result__fqid-more {
  font-size: 10px;
  color: var(--text-500);
  font-style: italic;
  margin-top: 2px;
}  
  .sidebar__icon-btn {
  background: transparent;
  border: none;
  color: var(--text-500);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  transition: all 0.15s;
}
.sidebar__icon-btn:hover {
  background: var(--bg-700);
  color: var(--accent-hover);
}

.section {
  margin-bottom: 6px;
  border-radius: 8px;
  overflow: hidden;
}
.section__header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 10px;
  background: transparent;
  border: none;
  color: var(--text-400);
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  transition: all 0.15s;
  text-align: left;
}
.section__header:hover {
  background: var(--bg-800);
  color: var(--text-200);
}
.section__icon {
  color: var(--accent-hover);
  display: flex;
  align-items: center;
}
.section__title { flex: 1; }
.section__badge {
  padding: 1px 6px;
  background: var(--bg-700);
  border-radius: 8px;
  font-size: 10px;
  color: var(--text-500);
  font-weight: 700;
}
.section__body { padding: 4px 0 10px; }

/* Быстрые действия */
.quick-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 8px;
}
.quick-action {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: var(--bg-800);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-300);
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
  text-align: left;
  min-width: 0;
}
.quick-action:hover:not(:disabled) {
  background: var(--bg-700);
  border-color: var(--accent);
  color: var(--accent-hover);
}
.quick-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.quick-action__count {
  margin-left: auto;
  padding: 1px 6px;
  background: var(--bg-700);
  border-radius: 8px;
  font-size: 10px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
}

/* Проблемы */
.problems-group { margin-bottom: 10px; }
.problems-group:last-child { margin-bottom: 0; }
.problems-group__title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-400);
  margin-bottom: 4px;
  padding: 0 4px;
}
.problems-group__action {
  padding: 4px 10px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--accent-hover);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  font-weight: 500;
}
.problems-group__action:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
}

/* Что нового */
.news-since {
  font-size: 10px;
  color: var(--text-500);
  padding: 0 4px 8px;
  font-style: italic;
}

/* Клик по карточке */
.stat-card--clickable {
  cursor: pointer;
}
.stat-card--clickable:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}
.stat-card--empty {
  opacity: 0.5;
}

/* Удаление из избранного */
.rank-item__remove {
  background: transparent;
  border: none;
  color: var(--text-500);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  display: flex;
  opacity: 0;
  transition: opacity 0.15s;
}
.rank-item:hover .rank-item__remove { opacity: 1; }
.rank-item__remove:hover { color: var(--danger); background: var(--bg-700); }

/* Компактный режим */
.sidebar--compact .stat-card__value { font-size: 16px; }
.sidebar--compact .stat-card__label { font-size: 9px; }
.sidebar--compact .section__body { padding: 2px 0 6px; }
.sidebar--compact .rank-item { padding: 4px 6px; font-size: 11px; }
.sidebar--compact .rank-item__num { display: none; }
.sidebar--compact .quick-actions { grid-template-columns: 1fr; }
.sidebar--compact .tag-cloud { gap: 3px; }
.sidebar--compact .tag { font-size: 10px; padding: 2px 6px; }

/* Секции со сворачиванием */
.section--collapsed .section__body { display: none; }

/* Legacy совместимость */
.section__title {
  /* раньше был просто .section__title — оставлено для совместимости */
}
  .activity-chart {
  padding: 4px 4px 0;
}
.activity-chart__bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 60px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 2px;
}
.activity-chart__bar {
  flex: 1;
  background: linear-gradient(180deg, var(--accent-hover) 0%, var(--accent) 100%);
  border-radius: 2px 2px 0 0;
  min-height: 2px;
  transition: all 0.15s;
  cursor: help;
}
.activity-chart__bar:hover {
  background: var(--accent-hover);
  filter: brightness(1.3);
}
.activity-chart__bar--today {
  background: linear-gradient(180deg, #10b981 0%, #059669 100%);
}
.activity-chart__legend {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: var(--text-500);
  margin-top: 6px;
  padding: 0 2px;
}
  .missing-ref-item {
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.missing-ref-item:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}
.missing-ref-targets {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 4px 0 24px;
}
.missing-ref-target {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--warning);
  opacity: 0.85;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.missing-ref-target .material-symbols-outlined {
  font-size: 10px;
  flex-shrink: 0;
}
.missing-ref-target--more {
  color: var(--text-500);
  font-style: italic;
  padding-left: 14px;
}
  .news-more {
  font-size: 10px;
  color: var(--text-500);
  padding: 6px 4px;
  text-align: center;
  font-style: italic;
}

.news-changed-item {
  margin-bottom: 4px;
  padding: 0 0 4px;
}
.news-changes {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 6px 4px 26px;
}
.news-change {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-500);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.news-change__field {
  color: var(--text-400);
  min-width: 60px;
}
.news-change__from {
  color: var(--danger);
  text-decoration: line-through;
  opacity: 0.7;
}
.news-change__to {
  color: var(--success);
  font-weight: 600;
}
.news-change .material-symbols-outlined {
  font-size: 10px;
  color: var(--text-500);
  flex-shrink: 0;
}
  .section__periods {
  display: flex;
  gap: 2px;
  margin-left: auto;
}
.period-btn {
  padding: 2px 6px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-500);
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  text-transform: none;
  letter-spacing: 0;
}
.period-btn:hover {
  background: var(--bg-700);
  color: var(--text-200);
}
.period-btn--active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent-hover);
}
  /* Снимки в DataMenu */
.snap-slot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  margin: 2px 6px;
  background: var(--bg-750);
}
.snap-slot__info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.snap-slot__badge {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
.snap-slot__badge--a { background: #6366f1; }
.snap-slot__badge--b { background: #10b981; }
.snap-slot__meta { min-width: 0; }
.snap-slot__time {
  font-size: 12px;
  color: var(--text-200);
  font-weight: 500;
}
.snap-slot__stats {
  font-size: 10px;
  color: var(--text-500);
  font-family: 'JetBrains Mono', monospace;
  margin-top: 2px;
}
.snap-slot__empty {
  font-size: 12px;
  color: var(--text-500);
  font-style: italic;
}
.snap-slot__actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
.snap-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-400);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.snap-btn:hover { background: var(--bg-700); color: var(--text-100); }
.snap-btn--primary { color: var(--accent-hover); }
.snap-btn--primary:hover { background: var(--accent-soft); color: var(--accent-hover); }
.snap-btn--danger { color: var(--danger); }
.snap-btn--danger:hover { background: rgba(239, 68, 68, 0.15); }

/* Snackbar */
.snackbar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  background: var(--bg-800);
  border: 1px solid var(--border-hover);
  border-radius: 8px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  color: var(--text-100);
  font-size: 13px;
  z-index: 400;
  animation: snackbarIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.snackbar .material-symbols-outlined {
  color: var(--success);
  font-size: 18px;
}
@keyframes snackbarIn {
  from { opacity: 0; transform: translateX(-50%) translateY(20px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
  .details__source-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--bg-750);
  font-family: 'JetBrains Mono', monospace;
  margin-left: auto;
  text-transform: lowercase;
}
  .news-empty {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-750);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-400);
  line-height: 1.5;
}
.news-empty .material-symbols-outlined {
  color: var(--text-500);
  font-size: 16px;
  flex-shrink: 0;
  margin-top: 1px;
}
</style>
</head>
<body>
<div id="root"></div>
<script id="graph-data" type="application/json">${graphDataJson}</script>
<script id="remote-info" type="application/json">${remoteInfoJson}</script>
<script id="refresh-command" type="application/json">${refreshCommandJson}</script>
<script type="module" src="/web.bundle.js"></script>
</body>
</html>`;
  }
}

let __mainCalled = false;
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.flags.help) {
    printHelp();
    process.exit(0);
  }

  if (args.positional.length === 0 && !args.flags.server) {
    printHelp();
    process.exit(1);
  }

  let rootDir;
  let remoteInfo = null;

  if (args.flags.server) {
    const server = args.flags.server;
    const username = args.flags.login || args.flags.username;
    const password = args.flags.password;
    const refresh = !!args.flags.refresh;
    const resetCache = !!args.flags['reset-cache'];

    if (username && password) {
      const base = server.replace(/\/+$/, '');
      remoteCredentials = {
        server: base,
        loginUrl: base + '/api/evo/core/bff/graphql',
        apiUrl: base + '/api/graphql',
        tenantId: '00000000-0000-0000-0000-000000000000',
        token: null,
        username: username,
        password: password,
        secure: !!args.flags.secure
      };
    }

    // Проверяем кэш до требования кредов
    const cachedDir = (!refresh && !resetCache) ? checkRemoteCacheExists(server) : null;

    if (cachedDir) {
      // Кэш валиден — используем без логина
      let fetchedAt = null;
      try {
        const idx = JSON.parse(fs.readFileSync(path.join(cachedDir, '_index.json'), 'utf8'));
        fetchedAt = idx.fetchedAt || null;
      } catch (e) {}

      rootDir = cachedDir;
      remoteInfo = { cacheDir: cachedDir, fromCache: true, server: server, fetchedAt: fetchedAt };

      var currentIndex = path.join(cachedDir, '_index.json');
      var previousIndex = path.join(cachedDir, '_index_previous.json');
      if (fs.existsSync(currentIndex) && !fs.existsSync(previousIndex)) {
        try {
          fs.copyFileSync(currentIndex, previousIndex);
          console.log('📸 Создан предыдущий снимок для diff');
        } catch (e) { /* ignore */ }
      }

      console.log('📦 Используется кэш: ' + cachedDir);
      console.log('   (обновить: --refresh --login <user> --password <pass>, сбросить: --reset-cache)');

      if (!username || !password) {
        console.log('💡 Логин/пароль не указаны — валидация доменов будет недоступна');
      }
    } else {
      // Кэша нет или запрошено обновление — нужны креды
      if (!username || !password) {
        console.error('❌ Для сервера ' + server + ' нет закэшированной версии.');
        console.error('');
        console.error('   Укажите креды, чтобы скачать схемы:');
        console.error('     node graph-analyzer.js --server ' + server + ' --login <user> --password <pass>');
        console.error('');
        console.error('   Если кэш есть, но повреждён — запустите с --reset-cache и кредами.');
        process.exit(1);
      }

      const base = server.replace(/\/+$/, '');
      remoteCredentials = {
        server: base,
        loginUrl: base + '/api/evo/core/bff/graphql',
        apiUrl: base + '/api/graphql',
        tenantId: '00000000-0000-0000-0000-000000000000',
        token: null,
        username: username,
        password: password,
        secure: !!args.flags.secure
      };

      try {
        const result = await prepareRemoteCache(server, username, password, {
          refresh: refresh,
          resetCache: resetCache,
          secure: !!args.flags.secure
        });
        rootDir = result.cacheDir;
        remoteInfo = result;
      } catch (err) {
        console.error('❌ Ошибка загрузки: ' + err.message);
        process.exit(1);
      }
    }
  } else {
    rootDir = path.resolve(args.positional[0]);
    if (!fs.existsSync(rootDir)) {
      console.error('❌ Directory does not exist: ' + rootDir);
      process.exit(1);
    }
  }

  const port = parseInt(args.flags.port || args.positional[1] || '3000', 10);

  console.log('🔍 Analyzing domains in: ' + rootDir);
  const analyzer = new DomainGraphAnalyzer(rootDir);
  analyzer.startServer(port, remoteInfo, args.flags);
}

if (require.main === module) {
  main().catch(function(err) {
    console.error('❌ Fatal: ' + err.message);
    console.error(err.stack);
    process.exit(1);
  });
}

module.exports = DomainGraphAnalyzer;