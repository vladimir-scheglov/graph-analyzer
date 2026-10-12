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
      '  expertises(filter: $filter, pagination: $pagination, sorting: $sorting, organizationIds: $organizationIds) {\n' +
      '    expertises {\n' +
      '      id\n' +
      '      sourceId\n' +
      '      folderId\n' +
      '      type\n' +
      '      name\n' +
      '      status\n' +
      '      version\n' +
      '    }\n' +
      '    pageInfo { pagination { limit offset } totalCount }\n' +
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
  return data.expertises || [];
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
      return { id: d.id, sourceId: d.sourceId, folderId: d.folderId, name: d.name, status: d.status, version: d.version };
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
  console.log('  --server <url>       Базовый URL сервера (например https://qa.sgrc.rvision.local)');
  console.log('  --login <user>       Имя пользователя для логина');
  console.log('  --password <pass>    Пароль (в кавычках, если содержит спецсимволы)');
  console.log('  --port <port>        HTTP-порт сервера визуализации (по умолчанию 3000)');
  console.log('  --refresh            Обновить кэш принудительно');
  console.log('  --reset-cache        Удалить кэш перед загрузкой');
  console.log('  --secure             Проверять TLS-сертификат (по умолчанию отключено для self-signed)');
  console.log('  --help               Показать справку');
  console.log('');
  console.log('Кэш: .cache/domains/<host>__<hash>/');
  console.log('По умолчанию используется существующий кэш, если он есть.');
  console.log('');
  console.log('Примеры:');
  console.log('  node graph-analyzer.js ./domains');
  console.log('  node graph-analyzer.js --server https://qa.sgrc.rvision.local --login vscheglov --password "1234"');
  console.log('  node graph-analyzer.js --server https://qa.sgrc.rvision.local --login vscheglov --password "1234" --refresh');
  console.log('  node graph-analyzer.js --server https://qa.sgrc.rvision.local --login vscheglov --password "1234" --reset-cache --port 4000');
}

class DomainGraphAnalyzer {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.domains = new Map();
    this.links = [];
    this.brokenDomains = new Map();
    this.missingDomains = new Set();
    this.fqidReferences = [];
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
        nodesMap.set(nodeId, {
          id: nodeId,
          label: domainData.name,
          domainId: domainId,
          title: this.buildTooltip(domainData),
          group: 'domain',
          filePath: domainData.filePath,
          fqidRefs: domainData.fqidRefs,
          version: domainData.version,
          entitiesCount: domainData.entities.size,
          name: domainData.name || '',
          description: domainData.description || '',
          author: domainData.author || '',
          tags: Array.isArray(domainData.tags) ? domainData.tags.slice() : (domainData.tags ? [String(domainData.tags)] : [])
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
      brokenCount: this.brokenDomains.size
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
<link rel="stylesheet" href="https://esm.sh/reactflow@11.11.4/dist/style.css" />
<script type="importmap">
{
  "imports": {
    "react": "https://esm.sh/react@18.2.0",
    "react-dom": "https://esm.sh/react-dom@18.2.0",
    "react-dom/client": "https://esm.sh/react-dom@18.2.0/client",
    "reactflow": "https://esm.sh/reactflow@11.11.4?deps=react@18.2.0,react-dom@18.2.0",
    "dagre": "https://esm.sh/dagre@0.8.5"
  }
}
</script>
<script src="https://unpkg.com/@babel/standalone@7.23.5/babel.min.js"></script>
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
.section__title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--text-500); margin-bottom: 10px; }
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
.react-flow__edge:hover .react-flow__edge-textbg { opacity: 1; }
.show-labels .react-flow__edge-text,
.show-labels .react-flow__edge-textbg { opacity: 1; }

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
.rf-node__icon { width: 26px; height: 26px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
.rf-node--domain .rf-node__icon { background: rgba(16,185,129,0.15); color: var(--success); }
.rf-node--missing .rf-node__icon { background: rgba(245,158,11,0.15); color: var(--warning); }
.rf-node--broken .rf-node__icon { background: rgba(239,68,68,0.15); color: var(--danger); }
.rf-node__content { flex: 1; min-width: 0; }
.rf-node__id { font-size: 12px; font-weight: 600; color: var(--text-100); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rf-node__name { font-size: 10px; color: var(--text-500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
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
.details__refs { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.details__ref { padding: 6px 8px; background: var(--bg-800); border-left: 2px solid var(--accent); border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-200); word-break: break-all; cursor: pointer; transition: all 0.15s; }
.details__ref:hover { background: var(--bg-700); border-left-color: var(--accent-hover); }
.details__ref-path { font-size: 10px; color: var(--text-500); margin-top: 2px; }
.details__ref--missing { border-left-color: var(--warning); }
.details__actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }

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

.empty-state { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: var(--text-500); pointer-events: none; }
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
  position: absolute;
  top: -8px;
  right: -8px;
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
.graph-container.perf-mode .rf-node__icon {
  display: none;
}
.graph-container.perf-mode .rf-node__name {
  display: none;
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
</style>
</head>
<body>
<div id="root"></div>
<script id="graph-data" type="application/json">${graphDataJson}</script>
<script id="remote-info" type="application/json">${remoteInfoJson}</script>
<script id="refresh-command" type="application/json">${refreshCommandJson}</script>
<script type="text/babel" data-type="module" data-presets="react">
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import ReactFlow, {
  ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  Handle, Position, MarkerType, useNodesState, useEdgesState,
  useReactFlow, useViewport, useStore
} from 'reactflow';
import dagre from 'dagre';

const GRAPH_DATA = JSON.parse(document.getElementById('graph-data').textContent);
const REMOTE_INFO = (function() {
  try { return JSON.parse(document.getElementById('remote-info').textContent); } catch (e) { return null; }
})();
const REFRESH_COMMAND = (function() {
  try { return JSON.parse(document.getElementById('refresh-command').textContent); } catch (e) { return null; }
})();
const NODE_WIDTH = 220;
const NODE_HEIGHT = 60;
const NODE_COMPACT = 28;
const EDGE_COLOR = '#10b981';
const LINKAGE_COLOR = '#818cf8';
const FQID_COLOR = '#10b981';
const PATH_COLOR = '#fbbf24';
const DIFF_ADDED = '#22c55e';
const DIFF_REMOVED = '#ef4444';

// ============ LAYOUTS ============
function dagreLayout(nodes, edges, rankdir) {
  rankdir = rankdir || 'LR';
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(function() { return {}; });
  g.setGraph({ rankdir: rankdir, nodesep: 20, ranksep: 60, edgesep: 10, marginx: 20, marginy: 20 });
  nodes.forEach(function(n) {
    var isCompact = n.data && n.data.__compact;
    g.setNode(n.id, {
      width: isCompact ? NODE_COMPACT : NODE_WIDTH,
      height: isCompact ? NODE_COMPACT : NODE_HEIGHT
    });
  });
  edges.forEach(function(e) { g.setEdge(e.source, e.target); });
  dagre.layout(g);
  return nodes.map(function(n) {
    var pos = g.node(n.id);
    var isCompact = n.data && n.data.__compact;
    var w = isCompact ? NODE_COMPACT : NODE_WIDTH;
    var h = isCompact ? NODE_COMPACT : NODE_HEIGHT;
    return Object.assign({}, n, {
      position: { x: pos.x - w / 2, y: pos.y - h / 2 },
      targetPosition: rankdir === 'LR' ? 'left' : 'top',
      sourcePosition: rankdir === 'LR' ? 'right' : 'bottom'
    });
  });
}

function circularLayout(nodes) {
  var n = nodes.length;
  var R = Math.max(350, n * 40);
  return nodes.map(function(node, i) {
    var angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return Object.assign({}, node, {
      position: {
        x: Math.cos(angle) * R,
        y: Math.sin(angle) * R
      },
      targetPosition: 'left',
      sourcePosition: 'right'
    });
  });
}

function forceLayout(nodes, edges) {
  var n = nodes.length;
  var pos = nodes.map(function(_, i) {
    var a = (i / n) * 2 * Math.PI;
    return { x: Math.cos(a) * 400, y: Math.sin(a) * 400 };
  });
  var idx = new Map();
  nodes.forEach(function(node, i) { idx.set(node.id, i); });
  var links = edges.map(function(e) { return [idx.get(e.source), idx.get(e.target)]; })
                    .filter(function(l) { return l[0] != null && l[1] != null; });
  for (var iter = 0; iter < 250; iter++) {
    var fx = new Array(n).fill(0);
    var fy = new Array(n).fill(0);
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        var dx = pos[j].x - pos[i].x;
        var dy = pos[j].y - pos[i].y;
        var d2 = dx * dx + dy * dy + 0.01;
        var d = Math.sqrt(d2);
        var f = 8000 / d2;
        fx[i] -= (dx / d) * f; fy[i] -= (dy / d) * f;
        fx[j] += (dx / d) * f; fy[j] += (dy / d) * f;
      }
    }
    for (var k = 0; k < links.length; k++) {
      var a = links[k][0], b = links[k][1];
      var ddx = pos[b].x - pos[a].x;
      var ddy = pos[b].y - pos[a].y;
      var dd = Math.sqrt(ddx * ddx + ddy * ddy) + 0.01;
      var ff = (dd - 200) * 0.02;
      fx[a] += (ddx / dd) * ff; fy[a] += (ddy / dd) * ff;
      fx[b] -= (ddx / dd) * ff; fy[b] -= (ddy / dd) * ff;
    }
    var alpha = 1 - iter / 250;
    for (var m = 0; m < n; m++) {
      pos[m].x += fx[m] * alpha * 0.5;
      pos[m].y += fy[m] * alpha * 0.5;
    }
  }
  return nodes.map(function(node, i) {
    return Object.assign({}, node, {
      position: { x: pos[i].x, y: pos[i].y },
      targetPosition: 'left',
      sourcePosition: 'right'
    });
  });
}

function runLayout(nodes, edges, type) {
  if (type === 'TB') return dagreLayout(nodes, edges, 'TB');
  if (type === 'force') return forceLayout(nodes, edges);
  if (type === 'circular') return circularLayout(nodes);
  return dagreLayout(nodes, edges, 'LR');
}

// ============ UTILS ============
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function HighlightedText(props) {
  var text = props.text;
  var query = props.query;
  if (text === null || text === undefined) return null;
  var str = String(text);
  var q = (query || '').trim();
  if (!q) return str;
  var lower = str.toLowerCase();
  var qLower = q.toLowerCase();
  var parts = [];
  var pos = 0;
  var idx = lower.indexOf(qLower, pos);
  var key = 0;
  while (idx !== -1) {
    if (idx > pos) parts.push(str.slice(pos, idx));
    parts.push(React.createElement('mark', { key: 'm' + key++, className: 'search-hl' }, str.slice(idx, idx + q.length)));
    pos = idx + q.length;
    idx = lower.indexOf(qLower, pos);
  }
  if (pos < str.length) parts.push(str.slice(pos));
  return React.createElement(React.Fragment, null, ...parts);
}

function matchesNamespace(domainId, filterPattern) {
  if (!filterPattern || filterPattern.trim() === '') return true;
  var tokens = filterPattern.replace(/[,;]/g, ' ').split(' ').filter(function(p) { return p.length > 0; }).map(function(p) { return p.toLowerCase(); });
  if (tokens.length === 0) return true;
  var id = domainId.toLowerCase();
  var include = tokens.filter(function(t) { return t.charAt(0) !== '!'; });
  var exclude = tokens.filter(function(t) { return t.charAt(0) === '!'; }).map(function(t) { return t.slice(1); }).filter(function(t) { return t.length > 0; });
  for (var i = 0; i < exclude.length; i++) {
    if (simplePatternMatch(id, exclude[i])) return false;
  }
  if (include.length === 0) return true;
  for (var j = 0; j < include.length; j++) {
    if (simplePatternMatch(id, include[j])) return true;
  }
  return false;
}

function simplePatternMatch(domainId, pattern) {
  if (pattern.indexOf('*') !== -1) {
    var parts = pattern.split('*');
    if (parts[0]) {
      var prefix = parts[0];
      var prefixNoDot = prefix.charAt(prefix.length - 1) === '.' ? prefix.slice(0, -1) : prefix;
      if (domainId.indexOf(prefix) !== 0 && domainId !== prefixNoDot) return false;
    }
    if (parts[parts.length - 1]) {
      var last = parts[parts.length - 1];
      if (domainId.lastIndexOf(last) !== domainId.length - last.length) return false;
    }
    var pos = parts[0] ? parts[0].length : 0;
    for (var i = 1; i < parts.length - 1; i++) {
      if (!parts[i]) continue;
      var found = domainId.indexOf(parts[i], pos);
      if (found === -1) return false;
      pos = found + parts[i].length;
    }
    return true;
  }
  return domainId === pattern || domainId.indexOf(pattern + '.') === 0;
}

// ============ GRAPH ANALYSIS ============
function buildDependencyGraph(nodes, edges, options) {
  var opts = options || {};
  var includeFqid = opts.includeFqid !== false;
  var includeLinkage = opts.includeLinkage !== false;
  var missingAsSatisfied = opts.missingAsSatisfied !== false;
  var excludedIds = opts.excludedIds || new Set();
  var restrictTo = opts.restrictTo || null;

  var nodeById = new Map();
  nodes.forEach(function(n) { nodeById.set(n.id, n); });

  var deps = new Map();
  var domainIds = new Set();

  nodes.forEach(function(n) {
    if (n.data.nodeType !== 'domain') return;
    var did = n.data.domainId;
    if (excludedIds.has(did.toLowerCase())) return;
    if (restrictTo && !restrictTo.has(did)) return;
    domainIds.add(did);
    deps.set(did, new Set());
  });

  edges.forEach(function(e) {
    var kind = e.data && e.data.kind;
    if (kind === 'linkage' && !includeLinkage) return;
    if (kind === 'fqid' && !includeFqid) return;
    if (kind === 'aggregated') return;

    var srcNode = nodeById.get(e.source);
    var tgtNode = nodeById.get(e.target);
    if (!srcNode || !tgtNode) return;
    if (srcNode.data.nodeType !== 'domain') return;

    var srcId = srcNode.data.domainId;
    if (!domainIds.has(srcId)) return;

    var tgtType = tgtNode.data.nodeType;
    if (tgtType === 'broken') return;
    if (tgtType === 'missing') return;

    var tgtId = tgtNode.data.domainId;
    if (!domainIds.has(tgtId)) return;
    if (srcId === tgtId) return;

    deps.get(srcId).add(tgtId);
  });

  return { deps: deps, domainIds: domainIds, nodeById: nodeById };
}

function topologicalSort(depGraph, options) {
  var opts = options || {};
  var autoBreak = !!opts.autoBreakCycles;

  var deps = depGraph.deps;
  var remaining = new Set(depGraph.domainIds);
  var levels = [];
  var broken = [];  // { id, level, reason }

  while (remaining.size > 0) {
    var level = [];
    var ready = [];

    remaining.forEach(function(id) {
      var ready_flag = true;
      var depsSet = deps.get(id);
      if (depsSet) {
        depsSet.forEach(function(dep) {
          if (remaining.has(dep)) ready_flag = false;
        });
      }
      if (ready_flag) ready.push(id);
    });

    if (ready.length === 0) {
      if (!autoBreak) break;

      // Автоматический разрыв цикла:
      // выбираем узел с наименьшим количеством зависимостей внутри remaining
      var best = null;
      var bestCount = Infinity;
      remaining.forEach(function(id) {
        var cnt = 0;
        var s = deps.get(id);
        if (s) s.forEach(function(dep) { if (remaining.has(dep)) cnt++; });
        if (cnt < bestCount) { bestCount = cnt; best = id; }
      });

      if (best == null) break;

      // Разрываем все его внутренние зависимости
      var brokenDeps = [];
      var s = deps.get(best);
      if (s) {
        s.forEach(function(dep) {
          if (remaining.has(dep)) brokenDeps.push(dep);
        });
        brokenDeps.forEach(function(dep) { s.delete(dep); });
      }

      broken.push({ id: best, level: levels.length + 1, brokenDeps: brokenDeps });
      remaining.delete(best);
      level.push(best);

      // Продолжаем — после разрыва может освободиться ещё кто-то в этом же уровне
      continue;
    }

    ready.forEach(function(id) { remaining.delete(id); });
    levels.push(ready.sort());
  }

  var cyclic = Array.from(remaining).sort();
  return {
    levels: levels,
    cyclic: cyclic,
    criticalPath: levels.length,
    broken: broken
  };
}

function findCycles(nodes, edges) {
  var adjacency = new Map();
  nodes.forEach(function(n) { adjacency.set(n.id, []); });
  edges.forEach(function(e) { if (adjacency.has(e.source)) adjacency.get(e.source).push(e.target); });
  var index = 0;
  var stack = [];
  var onStack = new Set();
  var indices = new Map();
  var lowlinks = new Map();
  var sccs = [];
  function strongconnect(v) {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    var neighbors = adjacency.get(v) || [];
    for (var i = 0; i < neighbors.length; i++) {
      var to = neighbors[i];
      if (!adjacency.has(to)) continue;
      if (!indices.has(to)) {
        strongconnect(to);
        lowlinks.set(v, Math.min(lowlinks.get(v), lowlinks.get(to)));
      } else if (onStack.has(to)) {
        lowlinks.set(v, Math.min(lowlinks.get(v), indices.get(to)));
      }
    }
    if (lowlinks.get(v) === indices.get(v)) {
      var scc = [];
      var w;
      do { w = stack.pop(); onStack.delete(w); scc.push(w); } while (w !== v);
      if (scc.length > 1) sccs.push(scc);
    }
  }
  for (var i = 0; i < nodes.length; i++) {
    if (!indices.has(nodes[i].id)) strongconnect(nodes[i].id);
  }
  var nodeToScc = new Map();
  sccs.forEach(function(scc, i) { scc.forEach(function(n) { nodeToScc.set(n, i); }); });
  var cycleNodes = new Set();
  sccs.forEach(function(scc) { scc.forEach(function(n) { cycleNodes.add(n); }); });
  var cycleEdges = new Set();
  edges.forEach(function(e) {
    var s = nodeToScc.get(e.source);
    var t = nodeToScc.get(e.target);
    if (s !== undefined && s === t) cycleEdges.add(e.id);
  });
  return { sccs: sccs, cycleNodes: cycleNodes, cycleEdges: cycleEdges };
}

function findPath(startId, endId, edges) {
  if (!startId || !endId || startId === endId) return null;
  var adjacency = new Map();
  edges.forEach(function(e) {
    if (!adjacency.has(e.source)) adjacency.set(e.source, []);
    adjacency.get(e.source).push({ node: e.target, edge: e.id });
  });
  var visited = new Set([startId]);
  var queue = [{ id: startId, path: [startId], edges: [] }];
  while (queue.length > 0) {
    var cur = queue.shift();
    if (cur.id === endId) return { nodes: cur.path, edges: cur.edges };
    var neighbors = adjacency.get(cur.id) || [];
    for (var i = 0; i < neighbors.length; i++) {
      var n = neighbors[i];
      if (visited.has(n.node)) continue;
      visited.add(n.node);
      queue.push({ id: n.node, path: cur.path.concat([n.node]), edges: cur.edges.concat([n.edge]) });
    }
  }
  return null;
}

function findReachable(startId, depth, edges) {
  var inAdj = new Map();
  var outAdj = new Map();
  edges.forEach(function(e) {
    if (!outAdj.has(e.source)) outAdj.set(e.source, []);
    outAdj.get(e.source).push(e.target);
    if (!inAdj.has(e.target)) inAdj.set(e.target, []);
    inAdj.get(e.target).push(e.source);
  });
  var visited = new Set([startId]);
  var queue = [{ id: startId, d: 0 }];
  while (queue.length > 0) {
    var cur = queue.shift();
    if (cur.d >= depth) continue;
    var neighbors = (outAdj.get(cur.id) || []).concat(inAdj.get(cur.id) || []);
    for (var i = 0; i < neighbors.length; i++) {
      var n = neighbors[i];
      if (visited.has(n)) continue;
      visited.add(n);
      queue.push({ id: n, d: cur.d + 1 });
    }
  }
  return visited;
}

function generateMarkdownReport(ctx) {
  var nodes = ctx.nodes;
  var edges = ctx.edges;
  var cyclesInfo = ctx.cyclesInfo;
  var healthMap = ctx.healthMap;
  var namespaceFilter = ctx.namespaceFilter || '';
  var filters = ctx.filters || {};

  var now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  var domainNodes = nodes.filter(function(n) { return n.data.nodeType === 'domain'; });
  var missingNodes = nodes.filter(function(n) { return n.data.nodeType === 'missing'; });
  var brokenNodes = nodes.filter(function(n) { return n.data.nodeType === 'broken'; });

  var isolated = domainNodes.filter(function(n) {
    return !edges.some(function(e) { return e.source === n.id || e.target === n.id; });
  });

  var allRefs = [];
  domainNodes.forEach(function(n) {
    (n.data.fqidRefs || []).forEach(function(r) {
      var exists = nodes.some(function(x) {
        return (x.data.domainId || '').toLowerCase() === (r.targetDomainId || '').toLowerCase();
      });
      if (!exists) allRefs.push({ from: n.data.domainId, ref: r });
    });
  });

  var topConnected = domainNodes.map(function(n) {
    var d = 0;
    edges.forEach(function(e) { if (e.source === n.id) d++; if (e.target === n.id) d++; });
    return { node: n, degree: d };
  }).sort(function(a, b) { return b.degree - a.degree; }).slice(0, 10);

  var worstHealth = domainNodes.map(function(n) {
    return { node: n, health: healthMap.get(n.id) || 0 };
  }).sort(function(a, b) { return a.health - b.health; }).slice(0, 10);

  var nsMap = new Map();
  domainNodes.forEach(function(n) {
    var ns = n.data.domainId.split('.').slice(0, 2).join('.');
    nsMap.set(ns, (nsMap.get(ns) || 0) + 1);
  });
  var nsList = Array.from(nsMap.entries()).sort(function(a, b) { return b[1] - a[1]; });

  var lines = [];
  lines.push('# Domain Graph Report');
  lines.push('');
  lines.push('_Сгенерировано: ' + now + '_');
  lines.push('');
  lines.push('## Сводка');
  lines.push('');
  lines.push('| Метрика | Значение |');
  lines.push('| --- | ---: |');
  lines.push('| Всего узлов | ' + nodes.length + ' |');
  lines.push('| Домены | ' + domainNodes.length + ' |');
  lines.push('| Missing | ' + missingNodes.length + ' |');
  lines.push('| Broken | ' + brokenNodes.length + ' |');
  lines.push('| Связей | ' + edges.length + ' |');
  lines.push('| Циклических групп | ' + cyclesInfo.sccs.length + ' |');
  lines.push('| Изолированных доменов | ' + isolated.length + ' |');
  lines.push('| Битых FQID-ссылок | ' + allRefs.length + ' |');
  lines.push('');

  if (namespaceFilter) {
    lines.push('> Фильтр по namespace: \`' + namespaceFilter + '\`');
    lines.push('');
  }

  // Циклы
  lines.push('## Циклические зависимости');
  lines.push('');
  if (cyclesInfo.sccs.length === 0) {
    lines.push('_Циклов не обнаружено._');
  } else {
    lines.push('Найдено **' + cyclesInfo.sccs.length + '** циклических групп:');
    lines.push('');
    cyclesInfo.sccs.forEach(function(scc, i) {
      var names = scc.map(function(id) {
        var n = nodes.find(function(x) { return x.id === id; });
        return n ? n.data.domainId : id;
      });
      lines.push((i + 1) + '. ' + names.join(' → ') + ' → ' + names[0]);
    });
  }
  lines.push('');

  // Топ по связям
  lines.push('## Топ-10 по связям');
  lines.push('');
  lines.push('| # | Домен | Связей |');
  lines.push('| ---: | --- | ---: |');
  topConnected.forEach(function(item, i) {
    lines.push('| ' + (i + 1) + ' | \`' + item.node.data.domainId + '\` | ' + item.degree + ' |');
  });
  lines.push('');

  // Стена позора
  lines.push('## Низкий health score');
  lines.push('');
  lines.push('| # | Домен | Health |');
  lines.push('| ---: | --- | ---: |');
  worstHealth.forEach(function(item, i) {
    lines.push('| ' + (i + 1) + ' | \`' + item.node.data.domainId + '\` | ' + item.health + '/100 |');
  });
  lines.push('');

  // Изолированные
  if (isolated.length > 0) {
    lines.push('## Изолированные домены');
    lines.push('');
    isolated.forEach(function(n) { lines.push('- \`' + n.data.domainId + '\`'); });
    lines.push('');
  }

  // Битые FQID-ссылки
  if (allRefs.length > 0) {
    lines.push('## Битые FQID-ссылки');
    lines.push('');
    var byFrom = new Map();
    allRefs.forEach(function(item) {
      if (!byFrom.has(item.from)) byFrom.set(item.from, []);
      byFrom.get(item.from).push(item.ref);
    });
    byFrom.forEach(function(refs, from) {
      lines.push('### ' + from);
      lines.push('');
      refs.forEach(function(r) {
        lines.push('- \`' + r.fullFQID + '\` — ' + r.propertyPath);
      });
      lines.push('');
    });
  }

  // Неймспейсы
  lines.push('## Распределение по неймспейсам');
  lines.push('');
  lines.push('| Неймспейс | Доменов |');
  lines.push('| --- | ---: |');
  nsList.forEach(function(entry) {
    lines.push('| \`' + entry[0] + '\` | ' + entry[1] + ' |');
  });
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('_Отчёт сгенерирован Domain Graph Analyzer._');

  return lines.join('\\n');
}

function heatColor(value, min, max, scheme) {
  if (max === min) return scheme.mid;
  var t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  // Интерполяция между тремя цветами: low → mid → high
  var c1 = scheme.low, c2 = scheme.mid, c3 = scheme.high;
  function hexToRgb(h) {
    var r = parseInt(h.slice(1, 3), 16);
    var g = parseInt(h.slice(3, 5), 16);
    var b = parseInt(h.slice(5, 7), 16);
    return [r, g, b];
  }
  function lerp(a, b, k) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * k),
      Math.round(a[1] + (b[1] - a[1]) * k),
      Math.round(a[2] + (b[2] - a[2]) * k)
    ];
  }
  var from, to, k;
  if (t < 0.5) { from = hexToRgb(c1); to = hexToRgb(c2); k = t * 2; }
  else { from = hexToRgb(c2); to = hexToRgb(c3); k = (t - 0.5) * 2; }
  var rgb = lerp(from, to, k);
  return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
}

var HEATMAPS = {
  health:   { label: 'Health',     low: '#dc2626', mid: '#f59e0b', high: '#10b981' },
  degree:   { label: 'Связей',     low: '#334155', mid: '#3b82f6', high: '#10b981' },
  entities: { label: 'Entities',   low: '#334155', mid: '#8b5cf6', high: '#ec4899' },
  fqid:     { label: 'FQID-ссылок', low: '#334155', mid: '#0891b2', high: '#22d3ee' }
};

function computeHealth(node, edges, allNodes, cycleNodes, missingSet) {
  if (node.data.nodeType === 'broken' || node.data.nodeType === 'missing') return 0;
  var score = 100;
  var connected = false;
  var inEdges = 0, outEdges = 0;
  edges.forEach(function(e) {
    if (e.source === node.id) { connected = true; outEdges++; }
    if (e.target === node.id) { connected = true; inEdges++; }
  });
  if (!connected) score -= 40;
  if (cycleNodes && cycleNodes.has(node.id)) score -= 30;
  var refs = node.data.fqidRefs || [];
  var missingRefs = 0;
  refs.forEach(function(r) {
    if (!allNodes.some(function(n) { return (n.data.domainId || '').toLowerCase() === (r.targetDomainId || '').toLowerCase(); })) {
      missingRefs++;
    }
  });
  score -= Math.min(missingRefs * 3, 20);
  return Math.max(0, Math.round(score));
}

function healthClass(score) {
  if (score >= 80) return 'health-good';
  if (score >= 50) return 'health-mid';
  return 'health-bad';
}

// ============ AGGREGATE ============
function aggregateByNamespace(nodes, edges) {
  var getNs = function(domainId) {
    var parts = (domainId || '').split('.');
    return parts.slice(0, 2).join('.') || domainId;
  };
  var nodeToNs = new Map();
  var nsCount = new Map();
  nodes.forEach(function(n) {
    var ns = getNs(n.data.domainId);
    nodeToNs.set(n.id, ns);
    nsCount.set(ns, (nsCount.get(ns) || 0) + 1);
  });
  var newNodes = Array.from(nsCount.entries()).map(function(entry) {
    var ns = entry[0], count = entry[1];
    return {
      id: 'ns_' + ns,
      type: 'domainNode',
      data: { domainId: ns, label: ns, nodeType: 'domain', isNamespace: true, childCount: count },
      position: { x: 0, y: 0 }
    };
  });
  var edgeAgg = new Map();
  edges.forEach(function(e) {
    var fromNs = nodeToNs.get(e.source);
    var toNs = nodeToNs.get(e.target);
    if (!fromNs || !toNs || fromNs === toNs) return;
    var key = fromNs + '__' + toNs;
    if (!edgeAgg.has(key)) {
      edgeAgg.set(key, { id: 'ns_edge_' + fromNs + '__' + toNs, source: 'ns_' + fromNs, target: 'ns_' + toNs, count: 0, kinds: new Set() });
    }
    var a = edgeAgg.get(key);
    a.count++;
    if (e.data && e.data.kind) a.kinds.add(e.data.kind);
  });
  var newEdges = Array.from(edgeAgg.values()).map(function(a) {
    return {
      id: a.id, source: a.source, target: a.target, type: 'smoothstep', label: String(a.count),
      data: { isAggregated: true, count: a.count, kinds: Array.from(a.kinds), kind: 'aggregated' },
      markerEnd: { type: MarkerType.ArrowClosed, color: LINKAGE_COLOR, width: 14, height: 14 },
      style: { stroke: LINKAGE_COLOR, strokeWidth: Math.min(1 + a.count / 6, 4), opacity: 0.85 }
    };
  });
  return { nodes: dagreLayout(newNodes, newEdges, 'LR'), edges: newEdges };
}

// ============ BIDIRECTIONAL MERGE ============
function mergeBidirectional(edges) {
  var pairMap = new Map();
  edges.forEach(function(e) {
    var key = [e.source, e.target].sort().join('__');
    if (!pairMap.has(key)) pairMap.set(key, []);
    pairMap.get(key).push(e);
  });
  var result = [];
  var processed = new Set();
  edges.forEach(function(e) {
    if (processed.has(e.id)) return;
    var key = [e.source, e.target].sort().join('__');
    var group = pairMap.get(key);
    if (group.length === 1) {
      result.push(e);
      processed.add(e.id);
      return;
    }
    var forward = group.find(function(g) { return g.source === e.source && g.target === e.target; });
    var backward = group.find(function(g) { return g.source === e.target && g.target === e.source; });
    if (forward && backward) {
      result.push(Object.assign({}, forward, {
        id: forward.id + '__bi',
        markerStart: { type: MarkerType.ArrowClosed, color: forward.markerEnd ? forward.markerEnd.color : LINKAGE_COLOR, width: 12, height: 12 },
        data: Object.assign({}, forward.data, { isBidirectional: true, reverseEdgeId: backward.id })
      }));
      processed.add(forward.id);
      processed.add(backward.id);
    } else {
      group.forEach(function(g) { result.push(g); processed.add(g.id); });
    }
  });
  return result;
}

// ============ TOOLTIP BUILDERS ============
function buildTooltipHtml(domainId, label, nodeType, filePath, version, entitiesCount, fqidRefs, health, description, tags, validation) {
  var typeLabel = nodeType === 'domain' ? 'Корректный домен' : nodeType === 'missing' ? 'Несуществующий домен' : 'Битый YAML';
  var typeColor = nodeType === 'domain' ? '#10b981' : nodeType === 'missing' ? '#f59e0b' : '#ef4444';
  var html = '<div class="tooltip__header" style="color:' + typeColor + '">' + escapeHtml(typeLabel) + '</div>';
  html += '<div class="tooltip__body">';
  html += '<div class="tooltip__row"><span class="tooltip__label">ID:</span><span class="tooltip__value">' + escapeHtml(domainId) + '</span></div>';
  if (label && label !== domainId) html += '<div class="tooltip__row"><span class="tooltip__label">Название:</span><span class="tooltip__value">' + escapeHtml(label) + '</span></div>';
  if (version) html += '<div class="tooltip__row"><span class="tooltip__label">Версия:</span><span class="tooltip__value">' + escapeHtml(version) + '</span></div>';
  if (entitiesCount != null) html += '<div class="tooltip__row"><span class="tooltip__label">Entities:</span><span class="tooltip__value">' + entitiesCount + '</span></div>';
  if (health != null) html += '<div class="tooltip__row"><span class="tooltip__label">Health:</span><span class="tooltip__value">' + health + '/100</span></div>';
  if (description) html += '<div class="tooltip__row"><span class="tooltip__label">Описание:</span><span class="tooltip__value">' + escapeHtml(description) + '</span></div>';
  if (tags && tags.length > 0) html += '<div class="tooltip__row"><span class="tooltip__label">Теги:</span><span class="tooltip__value">' + tags.map(escapeHtml).join(', ') + '</span></div>';
  if (filePath) {
    html += '<div class="tooltip__row"><span class="tooltip__label">Файл:</span><span class="tooltip__value" style="font-size:11px">' + escapeHtml(filePath) + '</span></div>';
    html += '<div style="margin-top:10px"><button class="tooltip__btn js-open-file" data-file="' + escapeHtml(filePath) + '">📂 Открыть файл</button></div>';
  }
  // --- Валидация ---
  if (validation) {
    html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">';
  
    if (validation.status === 'invalid') {
      var diagCount = validation.diagnostics ? validation.diagnostics.length : 0;
      html += '<button class="tooltip__validation-toggle js-toggle-validation" type="button">'
        + '<span class="tooltip__validation-arrow">▸</span>'
        + '<span class="tooltip__validation-title" style="color:var(--danger)">❌ Невалиден</span>'
        + '<span class="tooltip__validation-count">' + diagCount + '</span>'
        + '</button>';
  
      if (diagCount > 0) {
        html += '<div class="tooltip__validation-list" style="display:none">';
        validation.diagnostics.forEach(function(d, i) {
          var sev = (d.severity || '').toString().toUpperCase();
          var sevClass = sev === 'ERROR' ? 'error' : sev === 'WARNING' ? 'warning' : 'info';
          html += '<div class="tooltip__validation-item">';
          html += '<div class="tooltip__validation-severity tooltip__validation-severity--' + sevClass + '">' + escapeHtml(sev) + '</div>';
          html += '<div class="tooltip__validation-message">' + escapeHtml(d.message || '') + '</div>';
          if (d.labels && d.labels.length > 0) {
            d.labels.forEach(function(lb) {
              html += '<div class="tooltip__validation-label">'
                + escapeHtml(lb.message || '')
                + (lb.span ? '<span class="tooltip__validation-span"> [' + lb.span.start + '–' + lb.span.end + ']</span>' : '')
                + '</div>';
            });
          }
          html += '</div>';
        });
        html += '</div>';
      }
    } else if (validation.status === 'error') {
      html += '<div class="tooltip__label" style="margin-bottom:6px;color:var(--warning)">⚠️ Ошибка валидации</div>';
      html += '<div class="tooltip__validation-message">' + escapeHtml(validation.error || '') + '</div>';
    }
  
    html += '</div>';
  }
  if (fqidRefs && fqidRefs.length > 0) {
    html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">';
    html += '<div class="tooltip__label" style="margin-bottom:8px">FQID ссылки (' + fqidRefs.length + '):</div>';
    html += '<div class="tooltip__fqid-list">';
    fqidRefs.forEach(function(ref) {
      html += '<div class="tooltip__ref">';
      html += '<div class="tooltip__fqid js-goto-domain" data-domain="' + escapeHtml(ref.targetDomainId || '') + '" style="cursor:pointer">' + escapeHtml(ref.fullFQID) + '</div>';
      html += '<div class="tooltip__path">' + escapeHtml(ref.propertyPath) + '</div>';
      html += '<button class="tooltip__btn js-open-file" data-file="' + escapeHtml(ref.filePath || '') + '" data-fqid="' + escapeHtml(ref.fullFQID || '') + '">📂 Открыть</button>';
      html += '</div>';
    });
    html += '</div>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function buildEdgeTooltipHtml(edge, refs) {
  var fullLabel = (edge.data && edge.data.fullLabel) || edge.label || edge.id;
  var link = (edge.data && edge.data.linkData) || {};
  var nameFrom = link.nameFrom || {};
  var side1Text = nameFrom.side1 || link.sourceEntity || null;
  var side2Text = nameFrom.side2 || link.targetEntity || null;
  var side1Domain = edge.data && edge.data.side1Domain;
  var side2Domain = edge.data && edge.data.side2Domain;
  function renderSide(labelText, text, domain) {
    if (!text) return '';
    var clickable = !!domain;
    var h = '<div class="tooltip__row"><span class="tooltip__label">' + labelText + '</span>';
    if (clickable) {
      h += '<span class="tooltip__value js-goto-domain" data-domain="' + escapeHtml(domain) + '" style="cursor:pointer;color:var(--accent-hover);text-decoration:underline dotted">' + escapeHtml(text) + ' <span style="font-size:10px;color:var(--text-500)">→ ' + escapeHtml(domain) + '</span></span>';
    } else {
      h += '<span class="tooltip__value" style="color:var(--text-400)">' + escapeHtml(text) + '</span>';
    }
    return h + '</div>';
  }
  var html = '<div class="tooltip__header">Связь: ' + escapeHtml(fullLabel) + '</div>';
  html += '<div class="tooltip__body">';
  if (edge.data && edge.data.isBidirectional) html += '<div style="font-size:11px;color:var(--accent-hover);margin-bottom:8px">⇄ двунаправленная связь</div>';
  html += renderSide('Сторона 1:', side1Text, side1Domain);
  html += renderSide('Сторона 2:', side2Text, side2Domain);
  if (side1Text || side2Text) html += '<div style="height:1px;background:var(--border);margin:10px 0"></div>';
  if (link.type) html += '<div class="tooltip__row"><span class="tooltip__label">Тип:</span><span class="tooltip__value">' + escapeHtml(link.type) + '</span></div>';
  if (refs && refs.length > 0) {
    html += '<div class="tooltip__label" style="margin-top:8px;margin-bottom:8px">FQID ссылки (' + refs.length + '):</div>';
    html += '<div class="tooltip__fqid-list">';
    refs.forEach(function(ref) {
      html += '<div class="tooltip__ref">';
      html += '<div class="tooltip__fqid js-goto-domain" data-domain="' + escapeHtml(ref.targetDomainId || '') + '" style="cursor:pointer">' + escapeHtml(ref.fullFQID) + '</div>';
      html += '<div class="tooltip__path">' + escapeHtml(ref.propertyPath) + '</div>';
      html += '<button class="tooltip__btn js-open-file" data-file="' + escapeHtml(ref.filePath || '') + '" data-fqid="' + escapeHtml(ref.fullFQID || '') + '">📂 Открыть</button>';
      html += '</div>';
    });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

// ============ NODES ============
function DomainNode(props) {
  var data = props.data;
  var selected = props.selected;

  if (data.__compact) {
    var compactCls = 'rf-compact rf-compact--' + data.nodeType + (selected ? ' rf-compact--selected' : '');
    var initial = (data.domainId || '?').charAt(0).toUpperCase();
    return React.createElement(React.Fragment, null,
      React.createElement(Handle, { type: 'target', position: Position.Left, className: 'rf-handle' }),
      React.createElement('div', { className: compactCls, title: data.domainId }, initial),
      React.createElement(Handle, { type: 'source', position: Position.Right, className: 'rf-handle' })
    );
  }

  var cls = 'rf-node rf-node--' + data.nodeType;
  if (selected) cls += ' rf-node--selected';
  if (data.dimmed) cls += ' rf-node--dimmed';
  if (data.__inPath) cls += ' rf-node--path';
  if (data.__isPathEndpoint) cls += ' rf-node--path-endpoint';
  var icon = data.nodeType === 'domain' ? '●' : data.nodeType === 'missing' ? '▲' : '✕';

  // Health — теперь это тег справа от ID, а не абсолютно позиционированный бейдж
  var healthBadge = null;
  if (data.health != null && data.nodeType === 'domain') {
    var hc = data.health >= 80 ? 'good' : data.health >= 50 ? 'mid' : 'bad';
    healthBadge = React.createElement('span', {
      className: 'rf-node__health rf-node__health--' + hc,
      title: 'Health score: ' + data.health + '/100'
    }, data.health);
  }
  
  var validationBadge = null;
  if (data.__validationStatus === 'invalid' && data.__validationCount > 0) {
    validationBadge = React.createElement('span', {
      className: 'rf-node__issues',
      title: 'Валидация: ' + data.__validationCount + ' проблем',
    }, '⚠' + data.__validationCount);
  }

  return React.createElement(React.Fragment, null,
    React.createElement(Handle, { type: 'target', position: Position.Left, className: 'rf-handle' }),
    React.createElement('div', { className: cls },
      React.createElement('div', { className: 'rf-node__icon' }, icon),
      React.createElement('div', { className: 'rf-node__content' },
        React.createElement('div', { className: 'rf-node__id-row' },
          React.createElement('span', {
            className: 'rf-node__id' + (data.__invalid ? ' rf-node__id--invalid' : ''),
            title: data.domainId + (data.__invalid ? ' — невалиден' : '')
          }, data.domainId),
          healthBadge,
          validationBadge
        ),
        data.label && data.label !== data.domainId && React.createElement('div', {
          className: 'rf-node__name',
          title: data.label
        }, data.label)
      )
    ),
    React.createElement(Handle, { type: 'source', position: Position.Right, className: 'rf-handle' })
  );
}

var nodeTypes = { domainNode: DomainNode };

// ============ POPOVER ============
function Popover(props) {
  var trigger = props.trigger;
  var children = props.children;
  var align = props.align || 'left';
  var width = props.width || 320;
  var state = useState(false);
  var open = state[0], setOpen = state[1];
  var wrapRef = useRef(null);
  useEffect(function() {
    if (!open) return;
    var onDoc = function(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    var onEsc = function(e) { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc, true);
    return function() { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc, true); };
  }, [open]);
  useEffect(function() {
    var handler = function() { setOpen(false); };
    document.addEventListener('close-all-popovers', handler);
    return function() { document.removeEventListener('close-all-popovers', handler); };
  }, []);
  return React.createElement('div', { className: 'popover-wrap', ref: wrapRef },
    React.createElement('div', { className: 'popover-trigger', onClick: function() { setOpen(!open); } }, trigger(open)),
    open && React.createElement('div', { className: 'popover popover--' + align, style: { width: width } },
      typeof children === 'function' ? children(function() { setOpen(false); }) : children
    )
  );
}

// ============ CONTEXT MENU ============
function ContextMenu(props) {
  var menu = props.menu;
  var onClose = props.onClose;
  var onAction = props.onAction;
  var ref = useRef(null);
  useEffect(function() {
    if (!menu) return;
    var onDoc = function(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    var onEsc = function(e) { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc, true);
    return function() { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc, true); };
  }, [menu]);
  if (!menu) return null;
  var items = [
    { icon: '🎯', label: 'Фокус (N шагов)', action: 'focus' },
    { icon: '📊', label: 'Что зависит от него', action: 'dependents' },
    { icon: '🛤️', label: 'Путь от...', action: 'path-from' },
    { icon: '↪️', label: 'Путь до...', action: 'path-to' },
    { type: 'divider' },
    { icon: '📂', label: 'Открыть файл', action: 'open-file' },
    { icon: '📋', label: 'Копировать ID', action: 'copy-id' },
    { icon: '★', label: 'В закладки', action: 'bookmark' },
    { icon: '👁️', label: 'Скрыть', action: 'hide', danger: true }
  ];
  return React.createElement('div', { className: 'ctx-menu', ref: ref, style: { left: menu.x, top: menu.y } },
    items.map(function(it, i) {
      if (it.type === 'divider') return React.createElement('div', { key: i, className: 'ctx-menu__divider' });
      return React.createElement('button', {
        key: i,
        className: 'ctx-menu__item' + (it.danger ? ' ctx-menu__item--danger' : ''),
        onClick: function() { onAction(it.action, menu.nodeId); onClose(); }
      },
        React.createElement('span', { className: 'ctx-menu__icon' }, it.icon),
        React.createElement('span', null, it.label)
      );
    })
  );
}

// ============ GROUPS OVERLAY ============
function GroupsOverlay(props) {
  var nodes = props.nodes;
  var enabled = props.enabled;
  var viewport = useViewport();
  var groups = useMemo(function() {
    if (!enabled) return [];
    var map = new Map();
    nodes.forEach(function(n) {
      if (!n.data || (n.data.nodeType !== 'domain' && n.data.nodeType !== 'missing')) return;
      var parts = (n.data.domainId || '').split('.');
      var ns = parts.slice(0, 2).join('.');
      if (!map.has(ns)) map.set(ns, []);
      map.get(ns).push(n);
    });
    return Array.from(map.entries()).map(function(entry) {
      var ns = entry[0], arr = entry[1];
      var w = (arr[0].data && arr[0].data.__compact) ? NODE_COMPACT : NODE_WIDTH;
      var h = (arr[0].data && arr[0].data.__compact) ? NODE_COMPACT : NODE_HEIGHT;
      var xs = arr.map(function(n) { return n.position.x; });
      var ys = arr.map(function(n) { return n.position.y; });
      var minX = Math.min.apply(null, xs) - 30;
      var minY = Math.min.apply(null, ys) - 40;
      var maxX = Math.max.apply(null, xs) + w + 30;
      var maxY = Math.max.apply(null, ys) + h + 30;
      return { id: ns, label: ns, x: minX, y: minY, w: maxX - minX, h: maxY - minY, count: arr.length };
    });
  }, [nodes, enabled]);

  if (!enabled) return null;
  return React.createElement('svg', { className: 'groups-overlay' },
    groups.map(function(g) {
      var tx = g.x * viewport.zoom + viewport.x;
      var ty = g.y * viewport.zoom + viewport.y;
      return React.createElement('g', { key: g.id, transform: 'translate(' + tx + ',' + ty + ') scale(' + viewport.zoom + ')' },
        React.createElement('rect', { width: g.w, height: g.h, rx: 12, fill: 'rgba(99,102,241,0.05)', stroke: 'rgba(99,102,241,0.35)', strokeDasharray: '6 4', strokeWidth: 1.5 }),
        React.createElement('text', { x: 12, y: 22, fill: 'var(--accent-hover)', fontSize: 12, fontWeight: 700 }, g.label + ' · ' + g.count)
      );
    })
  );
}

// ============ SIDE PANEL (details + editor) ============
function SidePanel(props) {
  var open = props.open;
  var tab = props.tab;
  var setTab = props.setTab;
  var node = props.node;
  var filePath = props.filePath;
  var pendingFile = props.pendingFile;
  var editorRef = props.editorRef;
  var onClose = props.onClose;
  var allNodes = props.allNodes;
  var allEdges = props.allEdges;
  var onGotoDomain = props.onGotoDomain;
  var onOpenFile = props.onOpenFile;
  var edge = props.edge;
  var ruleViolations = props.ruleViolations;

  var [monacoReady, setMonacoReady] = useState(false);
  var monacoInitedRef = useRef(false);

  // Инициализация Monaco — при первом открытии панели, а не только на вкладке «Файл»
  useEffect(function() {
    if (!open) return;
    if (monacoInitedRef.current) return;
    if (typeof window.require === 'undefined') return;
    monacoInitedRef.current = true;
    window.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.34.0/min/vs' } });
    window.require(['vs/editor/editor.main'], function() {
      setMonacoReady(true);
    });
  }, [open]);

  // Создание редактора, когда вкладка «Файл» активна и Monaco загружен
  useEffect(function() {
    if (!open || tab !== 'file' || !monacoReady) return;
    if (editorRef.current) return;
    var el = document.getElementById('monaco-container');
    if (!el) return;
    editorRef.current = window.monaco.editor.create(el, {
      value: '',
      language: 'yaml',
      theme: 'vs-dark',
      readOnly: true,
      automaticLayout: true,
      fontSize: 13,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontFamily: 'JetBrains Mono, SF Mono, Monaco, monospace'
    });
  }, [open, tab, monacoReady, pendingFile]);

  // Применение контента при появлении нового pendingFile или когда редактор готов
  useEffect(function() {
    if (!open || tab !== 'file') return;
    if (!editorRef.current) return;
    if (!pendingFile) return;
    editorRef.current.setValue(pendingFile.content);
    if (pendingFile.fqid) {
      setTimeout(function() {
        var ed = editorRef.current;
        if (!ed) return;
        var NEWLINE = String.fromCharCode(10);
        var lines = pendingFile.content.split(NEWLINE);
        for (var i = 0; i < lines.length; i++) {
          if (lines[i].indexOf(pendingFile.fqid) !== -1) {
            ed.revealLineInCenter(i + 1);
            ed.setSelection({
              startLineNumber: i + 1, startColumn: 1,
              endLineNumber: i + 1, endColumn: lines[i].length + 1
            });
            break;
          }
        }
      }, 100);
    }
  }, [open, tab, pendingFile, monacoReady]);

  if (!open) return null;

  var detailsContent = null;
  if (node) {
    var incoming = allEdges.filter(function(e) { return e.target === node.id; });
    var outgoing = allEdges.filter(function(e) { return e.source === node.id; });
    var refs = node.data.fqidRefs || [];
    var health = node.data.health;
    var hc = health != null ? (health >= 80 ? 'health-good' : health >= 50 ? 'health-mid' : 'health-bad') : null;

    detailsContent = React.createElement('div', { className: 'details' },
      React.createElement('div', { className: 'details__title' }, node.data.label || node.data.domainId),
      React.createElement('div', { className: 'details__id' },
        React.createElement('span', { className: 'details__id-text' }, node.data.domainId),
        React.createElement('button', { className: 'details__copy', onClick: function() { navigator.clipboard.writeText(node.data.domainId); }, title: 'Копировать' }, '📋')
      ),
      React.createElement('div', { className: 'details__badges' },
        React.createElement('span', { className: 'details__badge details__badge--' + node.data.nodeType }, node.data.nodeType),
        health != null && React.createElement('span', { className: 'details__badge details__badge--' + hc }, 'Health: ' + health + '/100'),
        node.data.version && React.createElement('span', { className: 'details__badge' }, 'v' + node.data.version)
      ),
      node.data.description && React.createElement('div', { className: 'details__field' },
        React.createElement('div', { className: 'details__field-label' }, 'Описание'),
        React.createElement('div', { className: 'details__field-value' }, node.data.description)
      ),
      node.data.tags && node.data.tags.length > 0 && React.createElement('div', { className: 'details__field' },
        React.createElement('div', { className: 'details__field-label' }, 'Теги'),
        React.createElement('div', { className: 'details__tags' }, node.data.tags.map(function(t, i) { return React.createElement('span', { key: i, className: 'tag' }, t); }))
      ),
      node.data.filePath && React.createElement('div', { className: 'details__field' },
        React.createElement('div', { className: 'details__field-label' }, 'Файл'),
        React.createElement('div', { className: 'details__field-value', style: { fontSize: 11, fontFamily: 'monospace' } }, node.data.filePath)
      ),
      ruleViolations.length > 0 && React.createElement('div', { className: 'section' },
        React.createElement('div', { className: 'section__title' }, 'Нарушения правил (' + ruleViolations.length + ')'),
        React.createElement('div', { className: 'rank-list' },
          ruleViolations.slice(0, 10).map(function(v, i) {
            return React.createElement('div', {
              key: i,
              className: 'rank-item',
              style: { cursor: 'pointer' },
              onClick: function() { gotoDomainByDomainId(v.fromId); }
            },
              React.createElement('span', { className: 'rank-item__num' }, v.severity === 'forbid' ? '⛔' : '⚠️'),
              React.createElement('span', { className: 'rank-item__label' }, v.fromId + ' → ' + v.toId)
            );
          })
        )
      ),
      React.createElement('div', { className: 'details__field' },
        React.createElement('div', { className: 'details__field-label' }, 'Исходящие FQID-ссылки (' + refs.length + ')'),
        refs.length === 0 ? React.createElement('div', { className: 'details__field-value', style: { color: 'var(--text-500)' } }, '—') :
          React.createElement('div', { className: 'details__refs' },
            refs.slice(0, 50).map(function(r, i) {
              var targetExists = allNodes.some(function(n) { return (n.data.domainId || '').toLowerCase() === (r.targetDomainId || '').toLowerCase(); });
              return React.createElement('div', {
                key: i,
                className: 'details__ref' + (targetExists ? '' : ' details__ref--missing'),
                onClick: function() { if (targetExists) onGotoDomain(r.targetDomainId); }
              },
                React.createElement('div', null, r.fullFQID),
                React.createElement('div', { className: 'details__ref-path' }, r.propertyPath + (!targetExists ? ' · ⚠️ missing' : ''))
              );
            })
          )
      ),
      incoming.length > 0 && React.createElement('div', { className: 'details__field' },
        React.createElement('div', { className: 'details__field-label' }, 'Входящие связи (' + incoming.length + ')'),
        React.createElement('div', { className: 'details__refs' },
          incoming.slice(0, 30).map(function(e, i) {
            var src = allNodes.find(function(n) { return n.id === e.source; });
            return React.createElement('div', { key: i, className: 'details__ref', onClick: function() { if (src) onGotoDomain(src.data.domainId); } },
              React.createElement('div', null, src ? src.data.domainId : e.source),
              React.createElement('div', { className: 'details__ref-path' }, (e.data && e.data.kind) || '')
            );
          })
        )
      ),
      outgoing.length > 0 && React.createElement('div', { className: 'details__field' },
        React.createElement('div', { className: 'details__field-label' }, 'Исходящие связи (' + outgoing.length + ')'),
        React.createElement('div', { className: 'details__refs' },
          outgoing.slice(0, 30).map(function(e, i) {
            var tgt = allNodes.find(function(n) { return n.id === e.target; });
            return React.createElement('div', { key: i, className: 'details__ref', onClick: function() { if (tgt) onGotoDomain(tgt.data.domainId); } },
              React.createElement('div', null, tgt ? tgt.data.domainId : e.target),
              React.createElement('div', { className: 'details__ref-path' }, (e.data && e.data.kind) || '')
            );
          })
        )
      ),
      React.createElement('div', { className: 'details__actions' },
        node.data.filePath && React.createElement('button', { className: 'btn', onClick: function() { onOpenFile(node.data.filePath); } }, '📂 Открыть файл'),
        node.data.nodeType === 'domain' && React.createElement('button', { className: 'btn', onClick: function() { onGotoDomain(node.data.domainId); } }, '🎯 Центрировать')
      )
    );
  } else {
    detailsContent = React.createElement('div', { className: 'details' }, React.createElement('div', { style: { color: 'var(--text-500)', textAlign: 'center', padding: 40 } }, 'Узел не выбран'));
  }

  var fileContent = null;
  if (tab === 'file') {
    fileContent = React.createElement('div', { style: { flex: 1, minHeight: 0, position: 'relative' } },
      React.createElement('div', { id: 'monaco-container', style: { width: '100%', height: '100%' } }),
      !pendingFile && React.createElement('div', {
        style: {
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-500)', background: 'var(--bg-850)', fontSize: 13
        }
      }, 'Загрузка файла...')
    );
  }
  
  var edgeContent = null;
  if (tab === 'edge') {
    if (!edge) {
      edgeContent = React.createElement('div', { className: 'details' }, React.createElement('div', { style: { color: 'var(--text-500)', textAlign: 'center', padding: 40 } }, 'Связь не выбрана'));
    } else {
      var link = (edge.data && edge.data.linkData) || {};
      var refs = (edge.data && edge.data.fqidRefs) || [];
      var srcNode = allNodes.find(function(n) { return n.id === edge.source; });
      var tgtNode = allNodes.find(function(n) { return n.id === edge.target; });
      edgeContent = React.createElement('div', { className: 'details' },
        React.createElement('div', { className: 'details__title' }, (edge.data && edge.data.fullLabel) || edge.label || edge.id),
        React.createElement('div', { className: 'details__id' },
          React.createElement('span', { className: 'details__id-text' }, edge.id),
          React.createElement('button', { className: 'details__copy', onClick: function() { navigator.clipboard.writeText(edge.id); }, title: 'Копировать ID' }, '📋')
        ),
        React.createElement('div', { className: 'details__badges' },
          edge.data && edge.data.kind && React.createElement('span', { className: 'details__badge' }, edge.data.kind),
          edge.data && edge.data.isBidirectional && React.createElement('span', { className: 'details__badge' }, '⇄ двунаправленная'),
          link.type && React.createElement('span', { className: 'details__badge' }, link.type),
          edge.data && edge.data.refCount && React.createElement('span', { className: 'details__badge' }, edge.data.refCount + ' refs')
        ),
        srcNode && React.createElement('div', { className: 'details__field' },
          React.createElement('div', { className: 'details__field-label' }, 'Источник'),
          React.createElement('div', { className: 'details__ref', onClick: function() { onGotoDomain(srcNode.data.domainId); } },
            React.createElement('div', null, srcNode.data.domainId),
            link.sourceEntity && React.createElement('div', { className: 'details__ref-path' }, link.sourceEntity)
          )
        ),
        tgtNode && React.createElement('div', { className: 'details__field' },
          React.createElement('div', { className: 'details__field-label' }, 'Цель'),
          React.createElement('div', { className: 'details__ref', onClick: function() { onGotoDomain(tgtNode.data.domainId); } },
            React.createElement('div', null, tgtNode.data.domainId),
            link.targetEntity && React.createElement('div', { className: 'details__ref-path' }, link.targetEntity)
          )
        ),
        link.nameFrom && (link.nameFrom.side1 || link.nameFrom.side2) && React.createElement('div', { className: 'details__field' },
          React.createElement('div', { className: 'details__field-label' }, 'Стороны'),
          link.nameFrom.side1 && React.createElement('div', { className: 'details__field-value' }, 'Сторона 1: ' + link.nameFrom.side1),
          link.nameFrom.side2 && React.createElement('div', { className: 'details__field-value' }, 'Сторона 2: ' + link.nameFrom.side2)
        ),
        refs.length > 0 && React.createElement('div', { className: 'details__field' },
          React.createElement('div', { className: 'details__field-label' }, 'FQID-ссылки (' + refs.length + ')'),
          React.createElement('div', { className: 'details__refs' },
            refs.map(function(r, i) {
              return React.createElement('div', {
                key: i,
                className: 'details__ref',
                onClick: function() { if (r.targetDomainId) onGotoDomain(r.targetDomainId); }
              },
                React.createElement('div', null, r.fullFQID),
                React.createElement('div', { className: 'details__ref-path' }, r.propertyPath)
              );
            })
          )
        ),
        React.createElement('div', { className: 'details__actions' },
          srcNode && React.createElement('button', { className: 'btn', onClick: function() { onGotoDomain(srcNode.data.domainId); } }, '🎯 К источнику'),
          tgtNode && React.createElement('button', { className: 'btn', onClick: function() { onGotoDomain(tgtNode.data.domainId); } }, '🎯 К цели')
        )
      );
    }
  }

  return React.createElement('div', { className: 'side-panel open' },
    React.createElement('div', { className: 'side-panel__header' },
      React.createElement('div', { className: 'side-panel__tabs' },
        React.createElement('button', { className: 'side-panel__tab' + (tab === 'details' ? ' active' : ''), onClick: function() { setTab('details'); } }, '📋 Детали'),
        React.createElement('button', { className: 'side-panel__tab' + (tab === 'file' ? ' active' : ''), onClick: function() { setTab('file'); } }, '📄 Файл'),
        React.createElement('button', { className: 'side-panel__tab' + (tab === 'edge' ? ' active' : ''), onClick: function() { setTab('edge'); } }, '🔗 Связь')
      ),
      React.createElement('button', { className: 'btn btn--icon', onClick: onClose, title: 'Закрыть' }, '✕')
    ),
    filePath && React.createElement('div', { className: 'editor-panel__path', style: { padding: '6px 16px', fontSize: 11, color: 'var(--text-500)', borderBottom: '1px solid var(--border)', background: 'var(--bg-800)', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, filePath),
    React.createElement('div', { className: 'side-panel__body' },
      tab === 'details' ? detailsContent :
      tab === 'edge' ? edgeContent :
      fileContent
    )
  );
}

// ============ MENUS ============
function FilterMenu(props) {
  var filters = props.filters, setFilters = props.setFilters, counts = props.counts;
  var namespaceFilter = props.namespaceFilter, setNamespaceFilter = props.setNamespaceFilter;
  var bookmarksOnly = props.bookmarksOnly, setBookmarksOnly = props.setBookmarksOnly;
  var onlyInvalid = props.onlyInvalid, setOnlyInvalid = props.setOnlyInvalid;
  var isolatedOnly = props.isolatedOnly, setIsolatedOnly = props.setIsolatedOnly;
  var tooltipsEnabled = props.tooltipsEnabled, setTooltipsEnabled = props.setTooltipsEnabled;

  var setAll = function(val) { setFilters(function(f) { return Object.assign({}, f, { domain: val, missing: val, broken: val, linkage: val, fqid: val }); }); };
  var resetAll = function() {
    setAll(true);
    setNamespaceFilter('');
    setBookmarksOnly(false);
    setOnlyInvalid(false);
    setIsolatedOnly(false);
  };

  var rows = [
    { key: 'domain', label: 'Domain', color: 'var(--success)' },
    { key: 'missing', label: 'Missing', color: 'var(--warning)' },
    { key: 'broken', label: 'Broken', color: 'var(--danger)' }
  ];
  var edgesRows = [
    { key: 'linkage', label: 'Linkage', color: LINKAGE_COLOR },
    { key: 'fqid', label: 'FQID', color: FQID_COLOR }
  ];

  return React.createElement('div', { className: 'menu' },
    React.createElement('div', { className: 'menu__header' },
      React.createElement('span', null, 'Фильтры'),
      React.createElement('button', { className: 'menu__action', onClick: resetAll }, 'Сбросить')
    ),

    React.createElement('div', { className: 'menu__section' },
      React.createElement('div', { className: 'menu__label' }, 'Тип узлов'),
      rows.map(function(it) {
        return React.createElement('label', { key: it.key, className: 'menu__checkbox' },
          React.createElement('input', { type: 'checkbox', checked: !!filters[it.key], onChange: function() { setFilters(function(f) { return Object.assign({}, f, { [it.key]: !f[it.key] }); }); } }),
          React.createElement('span', { className: 'menu__check' }),
          React.createElement('span', { className: 'menu__dot', style: { background: it.color } }),
          React.createElement('span', { className: 'menu__text' }, it.label),
          React.createElement('span', { className: 'menu__count' }, counts[it.key])
        );
      })
    ),

    React.createElement('div', { className: 'menu__section' },
      React.createElement('div', { className: 'menu__label' }, 'Тип связей'),
      edgesRows.map(function(it) {
        return React.createElement('label', { key: it.key, className: 'menu__checkbox' },
          React.createElement('input', { type: 'checkbox', checked: !!filters[it.key], onChange: function() { setFilters(function(f) { return Object.assign({}, f, { [it.key]: !f[it.key] }); }); } }),
          React.createElement('span', { className: 'menu__check' }),
          React.createElement('span', { className: 'menu__dot', style: { background: it.color } }),
          React.createElement('span', { className: 'menu__text' }, it.label),
          React.createElement('span', { className: 'menu__count' }, counts[it.key])
        );
      })
    ),

    React.createElement('div', { className: 'menu__section' },
      React.createElement('div', { className: 'menu__label' }, 'Namespace'),
      React.createElement('input', { className: 'menu__input', type: 'text', placeholder: 'sgrc.risk.*, !test.*', value: namespaceFilter, onChange: function(e) { setNamespaceFilter(e.target.value); } }),
      React.createElement('div', { className: 'menu__hint' }, 'Несколько масок через , ; или пробел. ', React.createElement('b', null, '!'), ' — исключить. ', React.createElement('b', null, '*'), ' — любой символ.')
    ),

    React.createElement('div', { className: 'menu__divider' }),

    React.createElement('div', { className: 'menu__section' },
      React.createElement('div', { className: 'menu__label' }, 'Дополнительно'),

      React.createElement('label', { className: 'menu__checkbox' },
        React.createElement('input', { type: 'checkbox', checked: bookmarksOnly, onChange: function() { setBookmarksOnly(!bookmarksOnly); } }),
        React.createElement('span', { className: 'menu__check' }),
        React.createElement('span', { className: 'menu__text' }, 'Только избранные (★)')
      ),
      React.createElement('label', { className: 'menu__checkbox' },
        React.createElement('input', { type: 'checkbox', checked: onlyInvalid, onChange: function() { setOnlyInvalid(!onlyInvalid); } }),
        React.createElement('span', { className: 'menu__check' }),
        React.createElement('span', { className: 'menu__text' }, 'Только невалидные (❌)')
      ),
      React.createElement('label', { className: 'menu__checkbox' },
        React.createElement('input', { type: 'checkbox', checked: isolatedOnly, onChange: function() { setIsolatedOnly(!isolatedOnly); } }),
        React.createElement('span', { className: 'menu__check' }),
        React.createElement('span', { className: 'menu__text' }, 'Только изолированные (◯)')
      ),

      React.createElement('div', { className: 'menu__divider' }),

      React.createElement('label', { className: 'menu__checkbox' },
        React.createElement('input', { type: 'checkbox', checked: !tooltipsEnabled, onChange: function() { setTooltipsEnabled(!tooltipsEnabled); } }),
        React.createElement('span', { className: 'menu__check' }),
        React.createElement('span', { className: 'menu__text' }, 'Скрывать тултипы')
      )
    )
  );
}

function AnalysisMenu(props) {
  var cycleHighlight = props.cycleHighlight, handleFindCycles = props.handleFindCycles;
  var isolatedOnly = props.isolatedOnly, setIsolatedOnly = props.setIsolatedOnly;
  var nsMode = props.nsMode, setNsMode = props.setNsMode;
  var focusDepth = props.focusDepth, setFocusDepth = props.setFocusDepth;
  var focusNode = props.focusNode;
  var close = props.close;
  var ruleViolations = props.ruleViolations;
  var rules = props.rules;
  var setRules = props.setRules;
  var rulesHighlighted = props.rulesHighlighted;
  var setRulesHighlighted = props.setRulesHighlighted;
  var showViolationsOnly = props.showViolationsOnly;
  var setShowViolationsOnly = props.setShowViolationsOnly;
  
  return React.createElement('div', { className: 'menu' },
    React.createElement('button', { className: 'menu__item' + (cycleHighlight ? ' menu__item--active' : ''), onClick: function() { handleFindCycles(); close(); } },
      React.createElement('span', { className: 'menu__icon' }, '🔁'),
      React.createElement('span', { className: 'menu__text' }, 'Найти циклы'),
      cycleHighlight && React.createElement('span', { className: 'menu__count' }, cycleHighlight.sccCount)
    ),
    React.createElement('button', { className: 'menu__item' + (isolatedOnly ? ' menu__item--active' : ''), onClick: function() { setIsolatedOnly(function(v) { return !v; }); close(); } },
      React.createElement('span', { className: 'menu__icon' }, '◯'),
      React.createElement('span', { className: 'menu__text' }, 'Только изолированные')
    ),
    React.createElement('button', { className: 'menu__item' + (nsMode ? ' menu__item--active' : ''), onClick: function() { setNsMode(function(v) { return !v; }); close(); } },
      React.createElement('span', { className: 'menu__icon' }, '🗂'),
      React.createElement('span', { className: 'menu__text' }, 'Агрегация по семействам')
    ),
    React.createElement('button', { className: 'menu__item', onClick: function() { props.onOpenTopo(); close(); } },
      React.createElement('span', { className: 'menu__icon' }, '📦'),
      React.createElement('span', { className: 'menu__text' }, 'Порядок установки')
    ),
    React.createElement('div', { className: 'menu__divider' }),
    React.createElement('div', { className: 'menu__row' },
      React.createElement('span', { style: { fontSize: 12, color: 'var(--text-400)' } }, 'Глубина фокуса:'),
      React.createElement('input', { className: 'menu__slider', type: 'range', min: 1, max: 4, value: focusDepth, onChange: function(e) { setFocusDepth(parseInt(e.target.value)); } }),
      React.createElement('span', { style: { fontSize: 12, fontWeight: 700, color: 'var(--accent-hover)', minWidth: 12 } }, focusDepth)
    ),
    focusNode && React.createElement('button', { className: 'menu__item menu__item--danger', onClick: function() { props.clearFocus(); close(); } },
      React.createElement('span', { className: 'menu__icon' }, '✕'),
      React.createElement('span', { className: 'menu__text' }, 'Сбросить фокус')
    )
  );
}

function ViewMenu(props) {
  var layoutType = props.layoutType, setLayoutType = props.setLayoutType;
  var compact = props.compact, setCompact = props.setCompact;
  var showGroups = props.showGroups, setShowGroups = props.setShowGroups;
  var bidirectional = props.bidirectional, setBidirectional = props.setBidirectional;
  var showEdgeLabels = props.showEdgeLabels, setShowEdgeLabels = props.setShowEdgeLabels;
  var theme = props.theme, setTheme = props.setTheme;
  var close = props.close;
  var layouts = [
    { key: 'LR', label: 'Горизонтально (LR)' },
    { key: 'TB', label: 'Вертикально (TB)' },
    { key: 'force', label: 'Force-directed' },
    { key: 'circular', label: 'Круговой' }
  ];
  return React.createElement('div', { className: 'menu' },
    React.createElement('div', { className: 'menu__label' }, 'Раскладка'),
    layouts.map(function(l) {
      return React.createElement('button', { key: l.key, className: 'menu__item' + (layoutType === l.key ? ' menu__item--active' : ''), onClick: function() { setLayoutType(l.key); close(); } },
        React.createElement('span', { className: 'menu__icon' }, layoutType === l.key ? '●' : '○'),
        React.createElement('span', { className: 'menu__text' }, l.label)
      );
    }),
    React.createElement('div', { className: 'menu__divider' }),
    React.createElement('div', { className: 'menu__label' }, 'Heatmap'),
    [
      { key: 'none', label: 'Выключен' },
      { key: 'health', label: 'Health score' },
      { key: 'degree', label: 'Количество связей' },
      { key: 'entities', label: 'Entities' },
      { key: 'fqid', label: 'Исходящие FQID' }
    ].map(function(h) {
      return React.createElement('button', {
        key: h.key,
        className: 'menu__item' + (props.heatmap === h.key ? ' menu__item--active' : ''),
        onClick: function() { props.setHeatmap(h.key); close(); }
      },
        React.createElement('span', { className: 'menu__icon' }, props.heatmap === h.key ? '●' : '○'),
        React.createElement('span', { className: 'menu__text' }, h.label)
      );
    }),
    React.createElement('div', { className: 'menu__divider' }),
    React.createElement('div', { className: 'menu__label' }, 'Отображение'),
    React.createElement('label', { className: 'menu__checkbox' },
      React.createElement('input', { type: 'checkbox', checked: compact, onChange: function() { setCompact(!compact); } }),
      React.createElement('span', { className: 'menu__check' }),
      React.createElement('span', { className: 'menu__text' }, 'Компактный режим')
    ),
    React.createElement('label', { className: 'menu__checkbox' },
      React.createElement('input', { type: 'checkbox', checked: showGroups, onChange: function() { setShowGroups(!showGroups); } }),
      React.createElement('span', { className: 'menu__check' }),
      React.createElement('span', { className: 'menu__text' }, 'Группировка в рамки')
    ),
    React.createElement('label', { className: 'menu__checkbox' },
      React.createElement('input', { type: 'checkbox', checked: bidirectional, onChange: function() { setBidirectional(!bidirectional); } }),
      React.createElement('span', { className: 'menu__check' }),
      React.createElement('span', { className: 'menu__text' }, 'Объединять A↔B')
    ),
    React.createElement('label', { className: 'menu__checkbox' },
      React.createElement('input', { type: 'checkbox', checked: showEdgeLabels, onChange: function() { setShowEdgeLabels(!showEdgeLabels); } }),
      React.createElement('span', { className: 'menu__check' }),
      React.createElement('span', { className: 'menu__text' }, 'Подписи связей')
    ),
    React.createElement('div', { className: 'menu__divider' }),
    React.createElement('button', { className: 'menu__item', onClick: function() { setTheme(theme === 'dark' ? 'light' : 'dark'); close(); } },
      React.createElement('span', { className: 'menu__icon' }, theme === 'dark' ? '☀️' : '🌙'),
      React.createElement('span', { className: 'menu__text' }, theme === 'dark' ? 'Светлая тема' : 'Тёмная тема')
    )
  );
}

function DataMenu(props) {
  var handleExportJSON = props.handleExportJSON;
  var handleExportMarkdown = props.handleExportMarkdown;
  var handleExportPNG = props.handleExportPNG;
  var snapshotInputRef = props.snapshotInputRef, handleSnapshotUpload = props.handleSnapshotUpload;
  var diffMode = props.diffMode, setDiffMode = props.setDiffMode;
  var validationAvailable = props.validationAvailable;
  var onOpenValidation = props.onOpenValidation;
  var close = props.close;

  return React.createElement('div', { className: 'menu' },
    React.createElement('div', { className: 'menu__label', style: { paddingLeft: 12, paddingTop: 6 } }, 'Экспорт'),
    React.createElement('button', { className: 'menu__item', onClick: function() { handleExportJSON(); close(); } },
      React.createElement('span', { className: 'menu__icon' }, '💾'),
      React.createElement('span', { className: 'menu__text' }, 'Граф в JSON')
    ),
    React.createElement('button', { className: 'menu__item', onClick: function() { handleExportMarkdown(); close(); } },
      React.createElement('span', { className: 'menu__icon' }, '📝'),
      React.createElement('span', { className: 'menu__text' }, 'Отчёт в Markdown')
    ),
    React.createElement('button', { className: 'menu__item', onClick: function() { handleExportPNG(); close(); } },
      React.createElement('span', { className: 'menu__icon' }, '🖼️'),
      React.createElement('span', { className: 'menu__text' }, 'Граф в PNG')
    ),

    React.createElement('div', { className: 'menu__divider' }),

    React.createElement('div', { className: 'menu__label', style: { paddingLeft: 12, paddingTop: 6 } }, 'Сравнение'),
    React.createElement('label', { className: 'menu__item' },
      React.createElement('span', { className: 'menu__icon' }, '⇄'),
      React.createElement('span', { className: 'menu__text' }, 'Загрузить снимок'),
      React.createElement('input', { ref: snapshotInputRef, type: 'file', accept: 'application/json', style: { display: 'none' }, onChange: function(e) { handleSnapshotUpload(e); close(); } })
    ),
    diffMode && React.createElement('button', { className: 'menu__item menu__item--danger', onClick: function() { setDiffMode(null); close(); } },
      React.createElement('span', { className: 'menu__icon' }, '✕'),
      React.createElement('span', { className: 'menu__text' }, 'Сбросить diff')
    ),

    validationAvailable && React.createElement('div', { className: 'menu__divider' }),
    validationAvailable && React.createElement('div', { className: 'menu__label', style: { paddingLeft: 12, paddingTop: 6 } }, 'Валидация'),
    validationAvailable && React.createElement('button', { className: 'menu__item', onClick: function() { onOpenValidation(); close(); } },
      React.createElement('span', { className: 'menu__icon' }, '🔍'),
      React.createElement('span', { className: 'menu__text' }, 'Массовая валидация доменов')
    )
  );
}

// ============ SEARCH MODAL ============
function ActiveModesBar(props) {
  var modes = props.modes;
  if (!modes || modes.length === 0) return null;

  return React.createElement('div', { className: 'active-modes' },
    modes.map(function(m, i) {
      return React.createElement('div', {
        key: i,
        className: 'active-mode active-mode--' + (m.color || 'accent')
      },
        React.createElement('span', { className: 'active-mode__icon' }, m.icon),
        React.createElement('span', { className: 'active-mode__label' }, m.label),
        m.onClear && React.createElement('button', {
          className: 'active-mode__close',
          onClick: m.onClear,
          title: 'Отключить'
        }, '✕')
      );
    })
  );
}

function SearchModal(props) {
  var open = props.open;
  var query = props.query, setQuery = props.setQuery;
  var results = props.results, index = props.index, setIndex = props.setIndex;
  var commands = props.commands || [];
  var onSelect = props.onSelect, onClose = props.onClose;
  var inputRef = props.inputRef;

  var filteredCommands = useMemo(function() {
    var q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(function(c) {
      var hay = (c.label + ' ' + (c.keywords || '') + ' ' + (c.section || '')).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }, [query, commands]);

  // Единый индекс: сначала команды, потом домены
  var totalItems = filteredCommands.length + results.length;
  var safeIndex = Math.min(index, Math.max(totalItems - 1, 0));

  // Сгруппировать команды по секциям для отображения
  var commandsBySection = useMemo(function() {
    var map = new Map();
    filteredCommands.forEach(function(c) {
      var s = c.section || 'Прочее';
      if (!map.has(s)) map.set(s, []);
      map.get(s).push(c);
    });
    return Array.from(map.entries());
  }, [filteredCommands]);

  if (!open) return null;

  var onKey = function(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(Math.min(safeIndex + 1, Math.max(totalItems - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(Math.max(safeIndex - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (totalItems === 0) return;
      if (safeIndex < filteredCommands.length) {
        // Команда
        var cmd = filteredCommands[safeIndex];
        onClose();
        setTimeout(function() { cmd.run(); }, 50);
      } else {
        // Домен
        var domainItem = results[safeIndex - filteredCommands.length];
        if (domainItem) onSelect(domainItem.node.data.domainId);
      }
    }
  };

  var cmdIdx = 0;
  var domainStartIdx = filteredCommands.length;

  return React.createElement('div', { className: 'search-overlay', onMouseDown: onClose },
    React.createElement('div', { className: 'search-modal search-modal--palette', onMouseDown: function(e) { e.stopPropagation(); } },

      React.createElement('div', { className: 'search-modal__input-wrap' },
        React.createElement('span', { className: 'search-modal__icon' }, '⌘'),
        React.createElement('input', {
          ref: inputRef,
          className: 'search-modal__input',
          type: 'text',
          placeholder: 'Команда или домен...',
          value: query,
          onChange: function(e) { setQuery(e.target.value); },
          onKeyDown: onKey
        }),
        React.createElement('kbd', { className: 'search-modal__kbd' }, 'Esc')
      ),

      React.createElement('div', { className: 'search-modal__results' },

        // Команды
        filteredCommands.length > 0 && commandsBySection.map(function(entry) {
          var section = entry[0];
          var cmds = entry[1];
          return React.createElement('div', { key: 'sec-' + section, className: 'palette-section' },
            React.createElement('div', { className: 'palette-section__title' }, section),
            cmds.map(function(cmd) {
              var itemIdx = cmdIdx++;
              var isActive = itemIdx === safeIndex;
              return React.createElement('div', {
                key: 'cmd-' + itemIdx,
                className: 'palette-item palette-item--command' + (isActive ? ' active' : ''),
                onMouseEnter: function() { setIndex(itemIdx); },
                onClick: function() { onClose(); setTimeout(function() { cmd.run(); }, 50); }
              },
                React.createElement('span', { className: 'palette-item__icon' }, cmd.icon || '•'),
                React.createElement('span', { className: 'palette-item__label' }, cmd.label),
                cmd.hotkey && React.createElement('kbd', { className: 'palette-item__hotkey' }, cmd.hotkey)
              );
            })
          );
        }),

        // Домены
        results.length > 0 && React.createElement('div', { className: 'palette-section' },
          React.createElement('div', { className: 'palette-section__title' }, 'Домены (' + results.length + ')'),
          results.slice(0, 50).map(function(item, i) {
            var itemIdx = domainStartIdx + i;
            var isActive = itemIdx === safeIndex;
            var n = item.node;
            var matched = new Set(item.matches.map(function(m) { return m.field; }));
            return React.createElement('div', {
              key: 'dom-' + i,
              className: 'palette-item' + (isActive ? ' active' : ''),
              onMouseEnter: function() { setIndex(itemIdx); },
              onClick: function() { onSelect(n.data.domainId); }
            },
              React.createElement('span', { className: 'palette-item__icon' },
                React.createElement('span', { className: 'search-result__dot search-result__dot--' + n.data.nodeType })
              ),
              React.createElement('div', { className: 'palette-item__content' },
                React.createElement('div', { className: 'search-result__id' },
                  React.createElement(HighlightedText, { text: n.data.domainId, query: query }),
                  matched.has('id') && React.createElement('span', { className: 'search-result__badge' }, 'id')
                ),
                n.data.name && n.data.name !== n.data.domainId && React.createElement('div', { className: 'search-result__label' },
                  React.createElement(HighlightedText, { text: n.data.name, query: query }),
                  matched.has('name') && React.createElement('span', { className: 'search-result__badge' }, 'name')
                )
              )
            );
          })
        ),

        // Пусто
        query.trim() === '' && filteredCommands.length === 0 && results.length === 0 &&
          React.createElement('div', { className: 'search-modal__hint' }, 'Начните вводить команду или имя домена'),
        query.trim() !== '' && filteredCommands.length === 0 && results.length === 0 &&
          React.createElement('div', { className: 'search-modal__hint' }, 'Ничего не найдено')
      ),

      React.createElement('div', { className: 'search-modal__footer' },
        React.createElement('span', null, React.createElement('kbd', null, '↑'), React.createElement('kbd', null, '↓'), ' навигация'),
        React.createElement('span', null, React.createElement('kbd', null, 'Enter'), ' выбрать'),
        React.createElement('span', null, React.createElement('kbd', null, 'Esc'), ' закрыть')
      )
    )
  );
}

// ============ TOOLTIP ============
function Toast(props) {
  var message = props.message;
  var actions = props.actions || [];
  var onClose = props.onClose;
  var duration = props.duration || 20000;
  var [visible, setVisible] = useState(true);
  var [copied, setCopied] = useState(false);

  useEffect(function() {
    if (!duration) return;
    var t = setTimeout(function() { setVisible(false); if (onClose) onClose(); }, duration);
    return function() { clearTimeout(t); };
  }, []);

  if (!visible) return null;

  var copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(function() {
      setCopied(true);
      setTimeout(function() { setCopied(false); }, 1500);
    });
  };

  return React.createElement('div', { className: 'toast' },
    React.createElement('div', { className: 'toast__body' },
      React.createElement('div', { className: 'toast__message', dangerouslySetInnerHTML: { __html: message } }),
      actions.map(function(a, i) {
        return React.createElement('div', { key: i, className: 'toast__action' },
          a.command && React.createElement('code', { className: 'toast__command' }, a.command),
          a.command && React.createElement('button', {
            className: 'toast__btn',
            onClick: function() { copyToClipboard(a.command); }
          }, copied ? '✓ Скопировано' : '📋 Копировать')
        );
      })
    ),
    React.createElement('button', { className: 'toast__close', onClick: function() { setVisible(false); if (onClose) onClose(); } }, '✕')
  );
}

function HoverTooltip(props) {
  var tooltip = props.tooltip;
  var onHide = props.onHide;
  if (!tooltip) return null;
  var style = { left: tooltip.x, top: tooltip.y };
  return React.createElement('div', {
    className: 'tooltip',
    style: style,
    onMouseEnter: function() { window.__tooltipHovered = true; },
    onMouseLeave: function() { window.__tooltipHovered = false; if (onHide) onHide(); }
  },
    React.createElement('div', { dangerouslySetInnerHTML: { __html: tooltip.html } })
  );
}

// ============ INNER (ReactFlow wrapper) ============
var ReactFlowInner = React.memo(function(props) {
  var rf = useReactFlow();
  useEffect(function() { props.setRfInstance(rf); }, [rf]);
  var zoomClass = useStore(function(s) {
  return s.transform[2] < 0.5 ? 'hide' : 'show';
});

useEffect(function() {
  var el = document.querySelector('.graph-container');
  if (!el) return;
  el.classList.toggle('hide-labels', zoomClass === 'hide');
}, [zoomClass]);

useEffect(function() {
  var el = document.querySelector('.graph-container');
  if (!el) return;
  el.classList.toggle('perf-mode', !!props.perfMode);
}, [props.perfMode]);
var defaultEdgeOptions = useMemo(function() {
  return {
    type: props.perfMode ? 'default' : 'smoothstep',
    animated: false,
    labelStyle: { fill: '#e2e8f0', fontSize: 10, fontWeight: 500 },
    labelBgStyle: { fill: '#0d1424', fillOpacity: 0.95 },
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 4
  };
}, [props.perfMode]);
  return React.createElement(ReactFlow, {
    nodes: props.nodes,
    edges: props.edges,
    onNodesChange: props.readOnly ? function() {} : props.onNodesChange,
    onEdgesChange: props.readOnly ? function() {} : props.onEdgesChange,
    onEdgeClick: props.onEdgeClick,
    nodeTypes: nodeTypes,
    onNodeClick: props.onNodeClick,
    onNodeDoubleClick: props.onNodeDoubleClick,
    onNodeContextMenu: props.onNodeContextMenu,
    onNodeMouseEnter: props.onNodeMouseEnter,
    onNodeMouseLeave: props.onNodeMouseLeave,
    onEdgeMouseEnter: props.onEdgeMouseEnter,
    onEdgeMouseLeave: props.onEdgeMouseLeave,
    onPaneClick: props.onPaneClick,
    onPaneContextMenu: props.onPaneContextMenu,
    fitView: true,
    fitViewOptions: { padding: 0.2 },
    minZoom: 0.05,
    maxZoom: 4,
    proOptions: { hideAttribution: true },
    nodesDraggable: !props.readOnly,
    nodesConnectable: false,
    elementsSelectable: true,
    onlyRenderVisibleElements: true,
    defaultEdgeOptions: defaultEdgeOptions
  },
    React.createElement(Background, { variant: BackgroundVariant.Dots, gap: 20, size: 1, color: 'var(--graph-dots)' }),
    React.createElement(Controls, { position: 'bottom-left' }),
    React.createElement(MiniMap, { position: 'bottom-right', nodeColor: function(n) { var t = n.data && n.data.nodeType; if (t === 'missing') return '#f59e0b'; if (t === 'broken') return '#ef4444'; return '#10b981'; }, maskColor: 'rgba(10,14,26,0.7)', style: { width: 180, height: 130 } })
  );
});

function evaluateRules(edges, nodes, rules) {
  if (!Array.isArray(edges) || !Array.isArray(nodes) || !Array.isArray(rules)) {
    return [];
  }
  var violations = [];
  var nodeById = new Map();
  nodes.forEach(function(n) { nodeById.set(n.id, n); });
  edges.forEach(function(e) {
    var src = nodeById.get(e.source);
    var tgt = nodeById.get(e.target);
    if (!src || !tgt) return;
    var fromId = (src.data.domainId || '').toLowerCase();
    var toId = (tgt.data.domainId || '').toLowerCase();
    rules.forEach(function(rule) {
      if (!rule.from || !rule.to) return;
      if (simplePatternMatch(fromId, rule.from.toLowerCase()) &&
          simplePatternMatch(toId, rule.to.toLowerCase())) {
        violations.push({
          ruleId: rule.id,
          rule: rule,
          edgeId: e.id,
          fromId: src.data.domainId,
          toId: tgt.data.domainId,
          severity: rule.action || 'warn'
        });
      }
    });
  });
  return violations;
}

function RulesMenu(props) {
  var rules = props.rules, setRules = props.setRules;
  var violations = props.violations;
  var rulesHighlighted = props.rulesHighlighted, setRulesHighlighted = props.setRulesHighlighted;
  var showViolationsOnly = props.showViolationsOnly, setShowViolationsOnly = props.setShowViolationsOnly;
  var close = props.close;
  var [draft, setDraft] = useState({ from: '', to: '', action: 'warn', message: '' });

  var addRule = function() {
    if (!draft.from || !draft.to) return;
    setRules(function(prev) {
      var arr = Array.isArray(prev) ? prev : [];
      return arr.concat([Object.assign({ id: 'r' + Date.now() }, draft)]);
    });
    setDraft({ from: '', to: '', action: 'warn', message: '' });
  };
  var removeRule = function(id) {
    setRules(function(prev) {
      return (Array.isArray(prev) ? prev : []).filter(function(r) { return r.id !== id; });
    });
  };
  var toggleAction = function(id) {
    setRules(function(prev) {
      return (Array.isArray(prev) ? prev : []).map(function(r) {
        if (r.id !== id) return r;
        return Object.assign({}, r, { action: r.action === 'forbid' ? 'warn' : 'forbid' });
      });
    });
  };

  return React.createElement('div', { className: 'menu', style: { width: 380, padding: 12 } },
    React.createElement('div', { className: 'menu__label' }, 'Правила зависимостей'),
    rules.length === 0 && React.createElement('div', { style: { fontSize: 11, color: 'var(--text-500)', padding: '8px 10px' } }, 'Правила не заданы'),
    rules.map(function(r) {
      return React.createElement('div', { key: r.id, className: 'rule-item' },
        React.createElement('button', {
          className: 'rule-item__action rule-item__action--' + r.action,
          onClick: function() { toggleAction(r.id); },
          title: r.action === 'forbid' ? 'Запрещено' : 'Предупреждение'
        }, r.action === 'forbid' ? '⛔' : '⚠️'),
        React.createElement('div', { className: 'rule-item__body' },
          React.createElement('div', { className: 'rule-item__pattern' }, r.from + ' → ' + r.to),
          r.message && React.createElement('div', { className: 'rule-item__message' }, r.message)
        ),
        React.createElement('button', { className: 'rule-item__remove', onClick: function() { removeRule(r.id); } }, '✕')
      );
    }),
    React.createElement('div', { className: 'rule-form' },
      React.createElement('input', { className: 'menu__input', placeholder: 'from (ui.*)', value: draft.from, onChange: function(e) { setDraft(Object.assign({}, draft, { from: e.target.value })); } }),
      React.createElement('input', { className: 'menu__input', placeholder: 'to (db.*)', value: draft.to, onChange: function(e) { setDraft(Object.assign({}, draft, { to: e.target.value })); } }),
      React.createElement('input', { className: 'menu__input', placeholder: 'комментарий', value: draft.message, onChange: function(e) { setDraft(Object.assign({}, draft, { message: e.target.value })); } }),
      React.createElement('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
        React.createElement('select', { className: 'menu__input', style: { flex: 1 }, value: draft.action, onChange: function(e) { setDraft(Object.assign({}, draft, { action: e.target.value })); } },
          React.createElement('option', { value: 'warn' }, '⚠️ Warn'),
          React.createElement('option', { value: 'forbid' }, '⛔ Forbid')
        ),
        React.createElement('button', { className: 'btn btn--primary', onClick: addRule }, 'Добавить')
      )
    ),
    React.createElement('div', { className: 'menu__divider' }),
    React.createElement('label', { className: 'menu__checkbox' },
      React.createElement('input', { type: 'checkbox', checked: rulesHighlighted, onChange: function() { setRulesHighlighted(!rulesHighlighted); } }),
      React.createElement('span', { className: 'menu__check' }),
      React.createElement('span', { className: 'menu__text' }, 'Подсвечивать нарушения')
    ),
    React.createElement('label', { className: 'menu__checkbox' },
      React.createElement('input', { type: 'checkbox', checked: showViolationsOnly, onChange: function() { setShowViolationsOnly(!showViolationsOnly); } }),
      React.createElement('span', { className: 'menu__check' }),
      React.createElement('span', { className: 'menu__text' }, 'Показать только нарушения')
    ),
    React.createElement('div', { style: { padding: '6px 10px', fontSize: 11, color: 'var(--text-500)' } },
      violations.length === 0 ? 'Нарушений нет ✅' : 'Найдено: ' + violations.length
    ),
    React.createElement('div', { style: { padding: '4px 10px' } },
      React.createElement('button', { className: 'menu__action', onClick: close }, 'Закрыть')
    )
  );
}

function TopoSortModal(props) {
  var open = props.open;
  var onClose = props.onClose;
  var allNodes = props.allNodes;
  var allEdges = props.allEdges;
  var allDomains = props.allDomains;
  var visibleDomains = props.visibleDomains;
  var bookmarkedDomains = props.bookmarkedDomains;
  var onGotoDomain = props.onGotoDomain;
  var onApplyLevels = props.onApplyLevels;

  var [scope, setScope] = useState('all');
  var [includeFqid, setIncludeFqid] = useState(true);
  var [includeLinkage, setIncludeLinkage] = useState(true);
  var [missingAsSatisfied, setMissingAsSatisfied] = useState(true);
  var [excludePattern, setExcludePattern] = useState('');
  var [result, setResult] = useState(null);
  var [expandedLevels, setExpandedLevels] = useState(function() { return new Set(); });
  var [expandedDeps, setExpandedDeps] = useState(function() { return new Set(); });
  var [autoBreak, setAutoBreak] = useState(false);

  useEffect(function() {
    if (!open) {
      setResult(null);
      setExpandedLevels(new Set());
      setExpandedDeps(new Set());
    }
  }, [open]);

  var build = useCallback(function() {
    var nodeSet;
    if (scope === 'visible') nodeSet = visibleDomains;
    else if (scope === 'bookmarked') nodeSet = bookmarkedDomains;
    else nodeSet = allDomains;

    var restrictTo = new Set();
    nodeSet.forEach(function(d) { restrictTo.add(d.domainId); });

    var excludedIds = new Set();
    var tokens = excludePattern.replace(/[,;]/g, ' ').split(' ').filter(function(t) { return t.length > 0; });
    if (tokens.length > 0) {
      allNodes.forEach(function(n) {
        if (n.data.nodeType !== 'domain') return;
        for (var i = 0; i < tokens.length; i++) {
          if (simplePatternMatch(n.data.domainId.toLowerCase(), tokens[i].toLowerCase())) {
            excludedIds.add(n.data.domainId.toLowerCase());
            return;
          }
        }
      });
    }

    var depGraph = buildDependencyGraph(allNodes, allEdges, {
      includeFqid: includeFqid,
      includeLinkage: includeLinkage,
      missingAsSatisfied: missingAsSatisfied,
      excludedIds: excludedIds,
      restrictTo: restrictTo
    });

    var sorted = topologicalSort(depGraph, { autoBreakCycles: autoBreak });

    // Карта уровней
    var levelMap = new Map();
    sorted.levels.forEach(function(level, idx) {
      level.forEach(function(id) { levelMap.set(id, idx + 1); });
    });

    setResult({
      levels: sorted.levels,
      cyclic: sorted.cyclic,
      broken: sorted.broken || [],
      criticalPath: sorted.criticalPath,
      levelMap: levelMap,
      stats: {
        total: depGraph.domainIds.size,
        levels: sorted.levels.length,
        cyclic: sorted.cyclic.length,
        criticalPath: sorted.criticalPath,
        excluded: excludedIds.size
      }
    });
  }, [autoBreak, scope, includeFqid, includeLinkage, missingAsSatisfied, excludePattern, allNodes, allEdges, allDomains, visibleDomains, bookmarkedDomains]);

  var exportJSON = useCallback(function() {
    if (!result) return;
    var data = {
      generatedAt: new Date().toISOString(),
      scope: scope,
      options: { includeFqid: includeFqid, includeLinkage: includeLinkage, missingAsSatisfied: missingAsSatisfied, excludePattern: excludePattern },
      criticalPath: result.criticalPath,
      stats: result.stats,
      levels: result.levels,
      cyclic: result.cyclic,
      broken: result.broken,
    };
    downloadFile(JSON.stringify(data, null, 2), 'topo-sort-' + new Date().toISOString().slice(0,19).replace(/[:.]/g,'-') + '.json', 'application/json');
  }, [result, scope, includeFqid, includeLinkage, missingAsSatisfied, excludePattern]);

  var exportMD = useCallback(function() {
    if (!result) return;
    var lines = [];
    lines.push('# Порядок установки доменов');
    lines.push('');
    lines.push('_Сгенерировано: ' + new Date().toLocaleString('ru-RU') + '_');
    lines.push('');
    lines.push('Уровни можно устанавливать параллельно. Домены внутри уровня — одновременно.');
    lines.push('');
    lines.push('## Сводка');
    lines.push('');
    lines.push('| Метрика | Значение |');
    lines.push('| --- | ---: |');
    lines.push('| Всего доменов | ' + result.stats.total + ' |');
    lines.push('| Уровней | ' + result.stats.levels + ' |');
    lines.push('| Критический путь | ' + result.stats.criticalPath + ' |');
    lines.push('| В циклах | ' + result.stats.cyclic + ' |');
    lines.push('');
    result.levels.forEach(function(level, idx) {
      lines.push('## Уровень ' + (idx + 1) + ' (' + level.length + ')');
      lines.push('');
      level.forEach(function(id) { lines.push('- \`' + id + '\`'); });
      lines.push('');
    });
    if (result.broken && result.broken.length > 0) {
      lines.push('## 🔗 Разорванные циклы (' + result.broken.length + ')');
      lines.push('');
      lines.push('Эти домены были размещены автоматически, но зависимости внутри цикла пришлось разорвать:');
      lines.push('');
      result.broken.forEach(function(b) {
        lines.push('- \`' + b.id + '\` (уровень ' + b.level + ')' + (b.brokenDeps.length > 0 ? ' — разорвано связей: ' + b.brokenDeps.length : ''));
        b.brokenDeps.forEach(function(d) { lines.push('  - \`' + d + '\`'); });
      });
      lines.push('');
    }
    if (result.cyclic.length > 0) {
      lines.push('## ⚠️ Требуют ручного вмешательства — циклические (' + result.cyclic.length + ')');
      lines.push('');
      result.cyclic.forEach(function(id) { lines.push('- \`' + id + '\`'); });
      lines.push('');
    }
    downloadFile(lines.join('\\n'), 'topo-sort-' + new Date().toISOString().slice(0,19).replace(/[:.]/g,'-') + '.md', 'text/markdown;charset=utf-8');
  }, [result]);

  var copyAsText = useCallback(function() {
    if (!result) return;
    var lines = [];
    result.levels.forEach(function(level, idx) {
      lines.push('# Уровень ' + (idx + 1));
      level.forEach(function(id) { lines.push(id); });
      lines.push('');
    });
    if (result.cyclic.length > 0) {
      lines.push('# Циклические (ручное вмешательство)');
      result.cyclic.forEach(function(id) { lines.push(id); });
    }
    navigator.clipboard.writeText(lines.join('\\n'));
  }, [result]);

  var toggleLevel = useCallback(function(idx) {
    setExpandedLevels(function(prev) {
      var s = new Set(prev);
      if (s.has(idx)) s.delete(idx); else s.add(idx);
      return s;
    });
  }, []);

  var toggleDeps = useCallback(function(domainId) {
    setExpandedDeps(function(prev) {
      var s = new Set(prev);
      if (s.has(domainId)) s.delete(domainId); else s.add(domainId);
      return s;
    });
  }, []);

  if (!open) return null;

  return React.createElement('div', { className: 'help-overlay', onMouseDown: onClose },
    React.createElement('div', { className: 'help-modal topo-modal', onMouseDown: function(e) { e.stopPropagation(); } },

      React.createElement('div', { className: 'help-modal__header' },
        React.createElement('div', { className: 'help-modal__title' }, '📦 Порядок установки доменов'),
        React.createElement('button', { className: 'help-modal__close', onClick: onClose }, '✕')
      ),

      React.createElement('div', { className: 'validation-modal__body' },

        !result && React.createElement('div', { className: 'validation-scope' },
          React.createElement('div', { className: 'validation-scope__label' }, 'Область'),
          scopeOption('all', 'Все домены', allDomains.length, scope, setScope),
          scopeOption('visible', 'Только видимые', visibleDomains.length, scope, setScope),
          scopeOption('bookmarked', 'Только избранные', bookmarkedDomains.length, scope, setScope),

          React.createElement('div', { className: 'validation-scope__label', style: { marginTop: 16 } }, 'Учитывать зависимости'),
          React.createElement('label', { className: 'menu__checkbox' },
            React.createElement('input', { type: 'checkbox', checked: includeFqid, onChange: function() { setIncludeFqid(!includeFqid); } }),
            React.createElement('span', { className: 'menu__check' }),
            React.createElement('span', { className: 'menu__text' }, 'FQID-ссылки')
          ),
          React.createElement('label', { className: 'menu__checkbox' },
            React.createElement('input', { type: 'checkbox', checked: includeLinkage, onChange: function() { setIncludeLinkage(!includeLinkage); } }),
            React.createElement('span', { className: 'menu__check' }),
            React.createElement('span', { className: 'menu__text' }, 'Linkage-связи')
          ),
          React.createElement('label', { className: 'menu__checkbox' },
            React.createElement('input', { type: 'checkbox', checked: missingAsSatisfied, onChange: function() { setMissingAsSatisfied(!missingAsSatisfied); } }),
            React.createElement('span', { className: 'menu__check' }),
            React.createElement('span', { className: 'menu__text' }, 'Missing-домены считать установленными')
          ),
          React.createElement('label', { className: 'menu__checkbox' },
            React.createElement('input', { type: 'checkbox', checked: autoBreak, onChange: function() { setAutoBreak(!autoBreak); } }),
            React.createElement('span', { className: 'menu__check' }),
            React.createElement('span', { className: 'menu__text' }, 'Автоматически разрывать циклы')
          ),
          React.createElement('div', { className: 'menu__hint' }, autoBreak
            ? 'Домены с циклом будут размещены в порядке, а разорванные связи — помечены.'
            : 'Домены с циклом попадут в отдельный блок «Требуют ручного вмешательства».'
          ),

          React.createElement('div', { className: 'validation-scope__label', style: { marginTop: 16 } }, 'Исключить домены по маске'),
          React.createElement('input', {
            className: 'menu__input',
            type: 'text',
            placeholder: 'например: *.settings.* , custom.*',
            value: excludePattern,
            onChange: function(e) { setExcludePattern(e.target.value); }
          }),
          React.createElement('div', { className: 'menu__hint' }, 'Маски через запятую или пробел. Исключённые домены считаются уже установленными.'),

          React.createElement('button', {
            className: 'btn btn--primary',
            onClick: build,
            style: { marginTop: 20, width: '100%', justifyContent: 'center' }
          }, '▶ Построить порядок')
        ),

        result && React.createElement('div', { className: 'topo-result' },

          // Циклические блоки в начале
          (result.cyclic.length > 0 || result.broken.length > 0) && React.createElement('div', { className: 'topo-cyclic' },

            result.cyclic.length > 0 && React.createElement(React.Fragment, null,
              React.createElement('div', { className: 'topo-cyclic__header' },
                React.createElement('span', { className: 'topo-cyclic__icon' }, '⚠️'),
                React.createElement('span', null, 'Требуют ручного вмешательства — цикл (' + result.cyclic.length + ')')
              ),
              React.createElement('div', { className: 'topo-cyclic__body' },
                result.cyclic.map(function(id) {
                  return React.createElement('a', {
                    key: id,
                    className: 'validation-log__domain',
                    onClick: function() { onGotoDomain(id); onClose(); }
                  }, id);
                })
              )
            ),
          
            result.cyclic.length === 0 && result.broken.length > 0 && React.createElement(React.Fragment, null,
              React.createElement('div', { className: 'topo-cyclic__header topo-cyclic__header--broken' },
                React.createElement('span', { className: 'topo-cyclic__icon' }, '🔗'),
                React.createElement('span', null, 'Циклы разорваны автоматически (' + result.broken.length + ')')
              ),
              React.createElement('div', { className: 'topo-cyclic__body' },
                result.broken.map(function(b) {
                  return React.createElement('div', { key: b.id, className: 'topo-broken-item' },
                    React.createElement('a', {
                      className: 'validation-log__domain',
                      onClick: function() { onGotoDomain(b.id); onClose(); }
                    }, b.id),
                    React.createElement('span', { className: 'topo-broken-item__meta' }, 'L' + b.level),
                    b.brokenDeps.length > 0 && React.createElement('span', {
                      className: 'topo-broken-item__deps',
                      title: 'Разорваны связи с: ' + b.brokenDeps.join(', ')
                    }, '↯' + b.brokenDeps.length)
                  );
                })
              )
            )
          ),
          // Уровни
          result.levels.map(function(level, idx) {
            var isOpen = expandedLevels.has(idx);
            return React.createElement('div', { key: idx, className: 'topo-level' + (isOpen ? ' topo-level--open' : '') },
              React.createElement('div', { className: 'topo-level__header', onClick: function() { toggleLevel(idx); } },
                React.createElement('span', { className: 'validation-log__chevron' }, isOpen ? '▾' : '▸'),
                React.createElement('span', { className: 'topo-level__badge' }, idx + 1),
                React.createElement('span', { className: 'topo-level__title' }, 'Уровень ' + (idx + 1)),
                React.createElement('span', { className: 'topo-level__count' }, level.length + ' домен' + (level.length === 1 ? '' : (level.length < 5 ? 'а' : 'ов')))
              ),
              isOpen && React.createElement('div', { className: 'topo-level__body'  },
                level.map(function(id) {
                  var isDepsOpen = expandedDeps.has(id);
                  var deps = result.levelMap ? findDeps(id, result, allEdges, allNodes) : [];
                  var brokenInfo = result.broken.find(function(b) { return b.id === id; });
                  return React.createElement('div', { key: id, className: 'topo-domain' + (brokenInfo ? ' topo-domain--broken' : '') },
                    React.createElement('div', { className: 'topo-domain__head' },
                      deps.length > 0 && React.createElement('span', {
                        className: 'validation-log__chevron',
                        style: { cursor: 'pointer' },
                        onClick: function() { toggleDeps(id); }
                      }, isDepsOpen ? '▾' : '▸'),
                      !deps.length && React.createElement('span', { className: 'validation-log__chevron' }, ' '),
                      React.createElement('a', {
                        className: 'validation-log__domain',
                        onClick: function() { onGotoDomain(id); onClose(); }
                      }, id),
                      brokenInfo && React.createElement('span', {
                        className: 'topo-broken-badge',
                        title: 'Цикл разорван автоматически. Отрезаны связи: ' + brokenInfo.brokenDeps.join(', ')
                      }, '⚠️ цикл разорван')
                    ),
                    isDepsOpen && React.createElement('div', { className: 'topo-domain__deps' },
                      deps.map(function(dep) {
                        var depLevel = result.levelMap.get(dep);
                        return React.createElement('div', { key: dep, className: 'topo-dep' },
                          React.createElement('span', { className: 'topo-dep__level' }, 'L' + depLevel),
                          React.createElement('a', {
                            className: 'validation-log__domain',
                            onClick: function() { onGotoDomain(dep); onClose(); }
                          }, dep)
                        );
                      })
                    )
                  );
                })
              )
            );
          })
        )
      ),

      result && React.createElement('div', { className: 'validation-footer' },
        React.createElement('div', { className: 'validation-stats' },
          React.createElement('span', { className: 'validation-stat' }, '📦 ' + result.stats.total),
          React.createElement('span', { className: 'validation-stat validation-stat--ok' }, '📊 ' + result.stats.levels + ' уровней'),
          React.createElement('span', { className: 'validation-stat validation-stat--warn' }, '⏱ ' + result.stats.criticalPath + ' шагов'),
          result.stats.brokenCount > 0 && React.createElement('span', { className: 'validation-stat validation-stat--warn' }, '🔗 ' + result.stats.brokenCount + ' разорвано'),
          result.stats.cyclic > 0 && React.createElement('span', { className: 'validation-stat validation-stat--err' }, '⚠️ ' + result.stats.cyclic + ' цикл.')
        ),
        React.createElement('div', { className: 'validation-footer__actions' },
          React.createElement('button', { className: 'btn', onClick: function() { onApplyLevels(result.levelMap); onClose(); } }, '🎨 На графе'),
          React.createElement('button', { className: 'btn', onClick: copyAsText }, '📋 Копировать'),
          React.createElement('button', { className: 'btn', onClick: exportJSON }, '💾 JSON'),
          React.createElement('button', { className: 'btn', onClick: exportMD }, '📝 MD'),
          React.createElement('button', { className: 'btn', onClick: function() { setResult(null); } }, '← Настройки')
        )
      )
    )
  );
}

// Вспомогательная функция — прямые зависимости домена с учётом фильтров
function findDeps(domainId, result, edges, nodes) {
  var nodeById = new Map();
  nodes.forEach(function(n) { nodeById.set(n.id, n); });
  var set = new Set();
  edges.forEach(function(e) {
    var s = nodeById.get(e.source);
    if (!s || s.data.nodeType !== 'domain') return;
    if (s.data.domainId !== domainId) return;
    var t = nodeById.get(e.target);
    if (!t || t.data.nodeType !== 'domain') return;
    if (!result.levelMap.has(t.data.domainId)) return;
    set.add(t.data.domainId);
  });
  return Array.from(set).sort();
}

function ValidationModal(props) {
  var open = props.open;
  var onClose = props.onClose;
  var allDomains = props.allDomains;       // [{id, domainId}]
  var visibleDomains = props.visibleDomains;
  var bookmarkedDomains = props.bookmarkedDomains;
  var onGotoDomain = props.onGotoDomain;
  var onResults = props.onResults;         // callback(resultsMap)

  var [scope, setScope] = useState('all'); // all | visible | bookmarked
  var [running, setRunning] = useState(false);
  var [started, setStarted] = useState(false);
  var [progress, setProgress] = useState({ current: 0, total: 0 });
  var [logs, setLogs] = useState([]);       // {domainId, status, diagnostics, error, current, total}
  var [filter, setFilter] = useState('problems'); // all | problems | invalid | errors | valid
  var [stats, setStats] = useState(null);
  var [cancelled, setCancelled] = useState(false);
  var abortRef = useRef(null);
  var logsRef = useRef(null);
  var [expanded, setExpanded] = useState(function() { return new Set(); });
  
  var toggleExpanded = useCallback(function(domainId) {
    setExpanded(function(prev) {
      var s = new Set(prev);
      if (s.has(domainId)) s.delete(domainId); else s.add(domainId);
      return s;
    });
  }, []);

  useEffect(function() {
    if (!open) {
      setStarted(false); setRunning(false); setLogs([]); setProgress({current:0,total:0});
      setStats(null); setCancelled(false);
      if (abortRef.current) { try { abortRef.current.abort(); } catch(e){} abortRef.current = null; }
    }
  }, [open]);

  useEffect(function() {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs.length]);

  var startValidation = useCallback(function() {
    var domains;
    if (scope === 'visible') domains = visibleDomains;
    else if (scope === 'bookmarked') domains = bookmarkedDomains;
    else domains = allDomains;

    if (domains.length === 0) { alert('Нет доменов в выбранной области'); return; }

    setRunning(true);
    setStarted(true);
    setLogs([]);
    setStats(null);
    setCancelled(false);
    setProgress({ current: 0, total: domains.length });
    setExpanded(new Set());

    var controller = new AbortController();
    abortRef.current = controller;

    fetch('/api/validate-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domainIds: domains.map(function(d) { return d.domainId; }) }),
      signal: controller.signal
    }).then(function(response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      function read() {
        return reader.read().then(function(r) {
          if (r.done) return;
          buffer += decoder.decode(r.value, { stream: true });
          var parts = buffer.split('\\n\\n');
          buffer = parts.pop();
          parts.forEach(function(part) {
            var line = part.trim();
            if (!line.startsWith('data:')) return;
            var json = line.slice(5).trim();
            var evt;
            try { evt = JSON.parse(json); } catch (e) { return; }
            handleEvent(evt);
          });
          return read();
        });
      }
      function handleEvent(evt) {
        if (evt.type === 'start') {
          setProgress({ current: 0, total: evt.total });
        } else if (evt.type === 'progress') {
          setProgress({ current: evt.current, total: evt.total });
          setLogs(function(prev) { return prev.concat([evt]); });
        } else if (evt.type === 'done') {
          setStats(evt.stats);
          setCancelled(evt.cancelled);
          setRunning(false);
          if (onResults) {
            var map = new Map();
            (evt.results || []).forEach(function(r) { map.set(r.domainId, r); });
            onResults(map);
          }
        } else if (evt.type === 'error') {
          setRunning(false);
          alert('Ошибка: ' + evt.message);
        }
      }
      return read();
    }).catch(function(err) {
      if (err.name === 'AbortError') return;
      setRunning(false);
      alert('Ошибка: ' + err.message);
    });
  }, [scope, allDomains, visibleDomains, bookmarkedDomains, onResults]);

  var stopValidation = useCallback(function() {
    fetch('/api/validate-cancel', { method: 'POST' }).catch(function(){});
    if (abortRef.current) { try { abortRef.current.abort(); } catch(e){} }
    setRunning(false);
  }, []);

  var filteredLogs = useMemo(function() {
    if (filter === 'all') return logs;
    if (filter === 'valid') return logs.filter(function(l) { return l.status === 'valid'; });
    if (filter === 'invalid') return logs.filter(function(l) { return l.status === 'invalid'; });
    if (filter === 'errors') return logs.filter(function(l) { return l.status === 'error'; });
    if (filter === 'problems') return logs.filter(function(l) { return l.status !== 'valid' && l.status !== 'skip'; });
    return logs;
  }, [logs, filter]);

  var exportJSON = useCallback(function() {
    if (!stats) return;
    var data = {
      generatedAt: new Date().toISOString(),
      stats: stats,
      cancelled: cancelled,
      results: logs.map(function(l) {
        return { domainId: l.domainId, status: l.status, diagnostics: l.diagnostics, error: l.error };
      })
    };
    downloadFile(JSON.stringify(data, null, 2), 'validation-' + new Date().toISOString().slice(0,19).replace(/[:.]/g,'-') + '.json', 'application/json');
  }, [stats, cancelled, logs]);

  var exportMD = useCallback(function() {
    if (!stats) return;
    var md = generateValidationMarkdown(stats, cancelled, logs);
    downloadFile(md, 'validation-' + new Date().toISOString().slice(0,19).replace(/[:.]/g,'-') + '.md', 'text/markdown;charset=utf-8');
  }, [stats, cancelled, logs]);

  if (!open) return null;

  var pct = progress.total > 0 ? Math.round(progress.current / progress.total * 100) : 0;

  return React.createElement('div', { className: 'help-overlay', onMouseDown: function() { if (!running) onClose(); } },
    React.createElement('div', { className: 'help-modal validation-modal', onMouseDown: function(e) { e.stopPropagation(); } },
      React.createElement('div', { className: 'help-modal__header' },
        React.createElement('div', { className: 'help-modal__title' }, '🔍 Массовая валидация доменов'),
        React.createElement('button', { className: 'help-modal__close', onClick: running ? stopValidation : onClose }, running ? '■ Стоп' : '✕')
      ),

      React.createElement('div', { className: 'validation-modal__body' },

        // Область валидации
        !started && React.createElement('div', { className: 'validation-scope' },
          React.createElement('div', { className: 'validation-scope__label' }, 'Область валидации'),
          scopeOption('all', 'Все домены в кэше', allDomains.length, scope, setScope),
          scopeOption('visible', 'Только видимые (после фильтров)', visibleDomains.length, scope, setScope),
          scopeOption('bookmarked', 'Только избранные', bookmarkedDomains.length, scope, setScope),
          React.createElement('button', { className: 'btn btn--primary', onClick: startValidation, style: { marginTop: 16, width: '100%', justifyContent: 'center' } }, '▶ Запустить валидацию')
        ),

        // Прогресс
        started && React.createElement('div', { className: 'validation-progress' },
          React.createElement('div', { className: 'validation-progress__bar' },
            React.createElement('div', { className: 'validation-progress__fill', style: { width: pct + '%' } })
          ),
          React.createElement('div', { className: 'validation-progress__text' }, progress.current + ' / ' + progress.total + ' (' + pct + '%)' + (running ? ' — идёт валидация...' : cancelled ? ' — остановлено' : ' — завершено'))
        ),

        // Фильтры логов
        started && React.createElement('div', { className: 'validation-filters' },
          ['problems', 'all', 'invalid', 'errors', 'valid'].map(function(f) {
            var labels = { problems: 'Только проблемные', all: 'Все', invalid: '❌ Невалидные', errors: '⚠️ Ошибки', valid: '✅ Валидные' };
            return React.createElement('button', {
              key: f,
              className: 'validation-filter' + (filter === f ? ' validation-filter--active' : ''),
              onClick: function() { setFilter(f); }
            }, labels[f]);
          })
        ),

        // Логи
        started && React.createElement('div', { className: 'validation-logs', ref: logsRef },
          filteredLogs.length === 0 ? React.createElement('div', { className: 'validation-logs__empty' }, 'Нет записей по фильтру') :
          filteredLogs.map(function(log, i) {
            var icon = log.status === 'valid' ? '✅' : log.status === 'invalid' ? '❌' : '⚠️';
            var isInvalid = log.status === 'invalid';
            var hasDiag = isInvalid && log.diagnostics && log.diagnostics.length > 0;
            var isOpen = expanded.has(log.domainId);
          
            return React.createElement('div', { key: i, className: 'validation-log validation-log--' + log.status + (isOpen ? ' validation-log--open' : '') },
              React.createElement('div', {
                className: 'validation-log__head' + (hasDiag ? ' validation-log__head--clickable' : ''),
                onClick: hasDiag ? function() { toggleExpanded(log.domainId); } : undefined
              },
                hasDiag && React.createElement('span', { className: 'validation-log__chevron' }, isOpen ? '▾' : '▸'),
                React.createElement('span', { className: 'validation-log__icon' }, icon),
                React.createElement('a', {
                  className: 'validation-log__domain',
                  onClick: function(e) { e.stopPropagation(); onGotoDomain(log.domainId); onClose(); }
                }, log.domainId),
                isInvalid && log.diagnostics && React.createElement('span', { className: 'validation-log__count' }, log.diagnostics.length + ' ' + plural(log.diagnostics.length, 'issue', 'issues')),
                log.error && React.createElement('span', { className: 'validation-log__error' }, log.error),
                hasDiag && !isOpen && React.createElement('span', { className: 'validation-log__hint' }, 'нажмите, чтобы раскрыть')
              ),
          
              isOpen && hasDiag && React.createElement('div', { className: 'validation-log__diag' },
                log.diagnostics.map(function(d, di) {
                  return React.createElement('div', { key: di, className: 'validation-diag' },
                    React.createElement('div', { className: 'validation-diag__severity' }, d.severity),
                    React.createElement('div', { className: 'validation-diag__message' }, d.message),
                    d.labels && d.labels.length > 0 && d.labels.map(function(lb, li) {
                      return React.createElement('div', { key: li, className: 'validation-diag__label' },
                        lb.message,
                        lb.span && React.createElement('span', { className: 'validation-diag__span' }, ' [' + lb.span.start + '-' + lb.span.end + ']')
                      );
                    })
                  );
                })
              )
            );
          })
        )
      ),

      // Футер с итогами
      stats && React.createElement('div', { className: 'validation-footer' },
        React.createElement('div', { className: 'validation-stats' },
          React.createElement('span', { className: 'validation-stat validation-stat--ok' }, '✅ ' + stats.valid),
          React.createElement('span', { className: 'validation-stat validation-stat--err' }, '❌ ' + stats.invalid),
          React.createElement('span', { className: 'validation-stat validation-stat--warn' }, '⚠️ ' + stats.errors),
          React.createElement('span', { className: 'validation-stat' }, '⏱ ' + formatDuration(stats.elapsedMs))
        ),
        React.createElement('div', { className: 'validation-footer__actions' },
          React.createElement('button', { className: 'btn', onClick: exportJSON }, '💾 JSON'),
          React.createElement('button', { className: 'btn', onClick: exportMD }, '📝 Markdown'),
          React.createElement('button', { className: 'btn', onClick: onClose }, 'Закрыть')
        )
      )
    )
  );
}

function scopeOption(value, label, count, current, setCurrent) {
  return React.createElement('label', { className: 'validation-scope__option' + (current === value ? ' active' : '') },
    React.createElement('input', {
      type: 'radio',
      checked: current === value,
      onChange: function() { setCurrent(value); }
    }),
    React.createElement('span', { className: 'validation-scope__radio' }),
    React.createElement('span', { className: 'validation-scope__text' }, label),
    React.createElement('span', { className: 'validation-scope__count' }, count)
  );
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

function formatDuration(ms) {
  if (ms < 1000) return ms + 'ms';
  var s = Math.floor(ms / 1000);
  if (s < 60) return s + 'с';
  var m = Math.floor(s / 60);
  return m + 'м ' + (s % 60) + 'с';
}

function downloadFile(content, filename, mime) {
  var blob = new Blob([content], { type: mime });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function generateValidationMarkdown(stats, cancelled, logs) {
  var lines = [];
  lines.push('# Отчёт валидации доменов');
  lines.push('');
  lines.push('_Сгенерировано: ' + new Date().toLocaleString('ru-RU') + '_');
  if (cancelled) lines.push('');
  if (cancelled) lines.push('> ⚠️ Валидация была прервана пользователем');
  lines.push('');
  lines.push('## Сводка');
  lines.push('');
  lines.push('| Метрика | Значение |');
  lines.push('| --- | ---: |');
  lines.push('| Всего в области | ' + stats.total + ' |');
  lines.push('| Обработано | ' + stats.processed + ' |');
  lines.push('| ✅ Валидных | ' + stats.valid + ' |');
  lines.push('| ❌ Невалидных | ' + stats.invalid + ' |');
  lines.push('| ⚠️ Ошибок | ' + stats.errors + ' |');
  lines.push('| ⏱ Время | ' + formatDuration(stats.elapsedMs) + ' |');
  lines.push('');

  var invalid = logs.filter(function(l) { return l.status === 'invalid'; });
  if (invalid.length > 0) {
    lines.push('## Невалидные домены (' + invalid.length + ')');
    lines.push('');
    invalid.forEach(function(l) {
      lines.push('### \`' + l.domainId + '\`');
      lines.push('');
      (l.diagnostics || []).forEach(function(d) {
        lines.push('- **[' + d.severity + ']** ' + d.message);
        (d.labels || []).forEach(function(lb) {
          lines.push('  - ' + lb.message + (lb.span ? ' (позиция ' + lb.span.start + '-' + lb.span.end + ')' : ''));
        });
      });
      lines.push('');
    });
  }

  var errors = logs.filter(function(l) { return l.status === 'error'; });
  if (errors.length > 0) {
    lines.push('## Ошибки выполнения (' + errors.length + ')');
    lines.push('');
    errors.forEach(function(l) {
      lines.push('- \`' + l.domainId + '\` — ' + (l.error || 'неизвестная ошибка'));
    });
    lines.push('');
  }

  var valid = logs.filter(function(l) { return l.status === 'valid'; });
  if (valid.length > 0) {
    lines.push('## Валидные домены (' + valid.length + ')');
    lines.push('');
    valid.forEach(function(l) { lines.push('- \`' + l.domainId + '\`'); });
    lines.push('');
  }

  return lines.join('\\n');
}


function HotkeysModal(props) {
  var open = props.open;
  var onClose = props.onClose;

  useEffect(function() {
    if (!open) return;
    var onEsc = function(e) { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc, true);
    return function() { document.removeEventListener('keydown', onEsc, true); };
  }, [open, onClose]);

  if (!open) return null;

  var groups = [
    {
      title: 'Общее',
      items: [
        { keys: ['Shift', 'Tab'], label: 'Открыть командную палитру' },
        { keys: ['Ctrl', 'K'], label: 'Открыть командную палитру (альтернатива)', alt: true },
        { keys: ['F1'], label: 'Руководство пользователя' },
        { keys: ['?'], label: 'Это окно с хоткеями' },
        { keys: ['Esc'], label: 'Снять выделение / закрыть' }
      ]
    },
    {
      title: 'Навигация',
      items: [
        { keys: ['F'], label: 'Вписать граф в экран' },
        { keys: ['Alt', '←'], label: 'Назад по истории' },
        { keys: ['Alt', '→'], label: 'Вперёд по истории' },
        { keys: ['Ctrl', 'клик'], label: 'Мультивыбор узлов' }
      ]
    },
    {
      title: 'Анализ',
      items: [
        { keys: ['C'], label: 'Найти циклы' },
        { keys: ['I'], label: 'Только изолированные' },
        { keys: ['S'], label: 'Агрегация по семействам' },
        { keys: ['P'], label: 'Найти путь между двумя узлами' },
        { keys: ['B'], label: 'Добавить в закладки' }
      ]
    },
    {
      title: 'Вид',
      items: [
        { keys: ['T'], label: 'Скрыть/показать тултипы' }
      ]
    },
    {
      title: 'Мышью',
      items: [
        { keys: ['Двойной клик'], label: 'Включить/выключить фокус на узле' },
        { keys: ['Правая кнопка'], label: 'Контекстное меню узла' },
        { keys: ['Клик по связи'], label: 'Детали связи в панели' },
        { keys: ['Клик по пустому месту'], label: 'Снять все выделения' }
      ]
    },
  ];

  return React.createElement('div', { className: 'help-overlay', onMouseDown: onClose },
    React.createElement('div', { className: 'help-modal hotkeys-modal', onMouseDown: function(e) { e.stopPropagation(); } },

      React.createElement('div', { className: 'help-modal__header' },
        React.createElement('div', { className: 'help-modal__title' }, '⌨️ Горячие клавиши'),
        React.createElement('button', { className: 'help-modal__close', onClick: onClose }, '✕')
      ),

      React.createElement('div', { className: 'hotkeys-body' },
        groups.map(function(g) {
          return React.createElement('div', { key: g.title, className: 'hotkeys-group' },
            React.createElement('div', { className: 'hotkeys-group__title' }, g.title),
            React.createElement('div', { className: 'hotkeys-group__items' },
              g.items.map(function(item, i) {
                return React.createElement('div', { key: i, className: 'hotkey-row' },
                  React.createElement('div', { className: 'hotkey-row__keys' },
                    item.keys.map(function(k, ki) {
                      return React.createElement(React.Fragment, { key: ki },
                        ki > 0 && React.createElement('span', { className: 'hotkey-plus' }, '+'),
                        React.createElement('kbd', { className: 'hotkey-key' }, k)
                      );
                    })
                  ),
                  React.createElement('div', { className: 'hotkey-row__label' }, item.label)
                );
              })
            )
          );
        })
      ),

      React.createElement('div', { className: 'hotkeys-footer' },
        'Все горячие клавиши работают, когда фокус не в поле ввода.'
      )
    )
  );
}

function HelpModal(props) {
  var open = props.open;
  var onClose = props.onClose;
  var [content, setContent] = useState('');
  var [loading, setLoading] = useState(false);
  var bodyRef = useRef(null);

  useEffect(function() {
    if (!open || content) return;
    setLoading(true);
    Promise.all([
      fetch('/user-guide').then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      }),
      import('https://esm.sh/marked@12.0.2')
    ])
      .then(function(results) {
        var md = results[0];
        var markedMod = results[1];
        var parse = markedMod.marked ? markedMod.marked.parse : (markedMod.parse || null);
        if (!parse) throw new Error('marked.parse не найден');
        var html = parse(md);
        setContent(html);
        setLoading(false);
      })
      .catch(function(err) {
        setContent('<p style="color:var(--danger)">Ошибка загрузки справки: ' + err.message + '</p>');
        setLoading(false);
      });
  }, [open, content]);

  useEffect(function() {
    if (!open) return;
    var onEsc = function(e) { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc, true);
    return function() { document.removeEventListener('keydown', onEsc, true); };
  }, [open, onClose]);

  if (!open) return null;

  return React.createElement('div', { className: 'help-overlay', onMouseDown: onClose },
    React.createElement('div', { className: 'help-modal', onMouseDown: function(e) { e.stopPropagation(); } },
      React.createElement('div', { className: 'help-modal__header' },
        React.createElement('div', { className: 'help-modal__title' }, '📖 Руководство пользователя'),
        React.createElement('button', { className: 'help-modal__close', onClick: onClose, title: 'Закрыть (Esc)' }, '✕')
      ),
      React.createElement('div', { className: 'help-modal__body', ref: bodyRef },
        loading ? React.createElement('div', { className: 'help-modal__loading' }, 'Загрузка...') :
        React.createElement('div', { className: 'help-content', dangerouslySetInnerHTML: { __html: content } })
      )
    )
  );
}

// ============ APP ============
function App() {
  // Theme
  var themeState = useState(function() { return localStorage.getItem('dg-theme') || 'dark'; });
  var theme = themeState[0], setTheme = themeState[1];
  useEffect(function() { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('dg-theme', theme); }, [theme]);

  // Filters
  var [filters, setFilters] = useState({ domain: true, broken: true, missing: true, linkage: true, fqid: true });
  var [namespaceFilter, setNamespaceFilter] = useState('');
  var [isolatedOnly, setIsolatedOnly] = useState(false);
  var [nsMode, setNsMode] = useState(false);

  // View
  var [layoutType, setLayoutType] = useState('LR');
  var [compact, setCompact] = useState(false);
  var [showGroups, setShowGroups] = useState(false);
  var [bidirectional, setBidirectional] = useState(true);
  var [showEdgeLabels, setShowEdgeLabels] = useState(false);

  // Interaction
  var [selectedNodeId, setSelectedNodeId] = useState(null);
  var [focusNode, setFocusNode] = useState(null);
  var [focusDepth, setFocusDepth] = useState(2);
  var [pathSel, setPathSel] = useState([]);
  var [pathResult, setPathResult] = useState(null);
  var [contextMenu, setContextMenu] = useState(null);
  var [cycleHighlight, setCycleHighlight] = useState(null);
  var [diffMode, setDiffMode] = useState(null);

  // Side panel
  var [panelOpen, setPanelOpen] = useState(false);
  var [panelTab, setPanelTab] = useState('details');
  var [panelNodeId, setPanelNodeId] = useState(null);
  var editorRef = useRef(null);

  // Search
  var [searchOpen, setSearchOpen] = useState(false);
  var [searchQuery, setSearchQuery] = useState('');
  var [searchIndex, setSearchIndex] = useState(0);
  var searchInputRef = useRef(null);

  // UI
  var [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  var [tooltip, setTooltip] = useState(null);
  var hideTimer = useRef(null);
  var tooltipCache = useRef(new Map());
  var rfInstance = useRef(null);
  var snapshotInputRef = useRef(null);
  
  var [editorFilePath, setEditorFilePath] = useState('');
  var [pendingFile, setPendingFile] = useState(null); // { content, fqid, ts }
  var [hiddenNodeIds, setHiddenNodeIds] = useState(function() { return new Set(); });
  
  var [pathMode, setPathMode] = useState(null); // { kind: 'from' | 'to', anchorId }
  var [tooltipsEnabled, setTooltipsEnabled] = useState(true);
  var [selectedEdgeId, setSelectedEdgeId] = useState(null);
  var [heatmap, setHeatmap] = useState('none'); // none | health | degree | entities | fqid
  
  var [navStack, setNavStack] = useState({ items: [], index: -1 });
  var [toastVisible, setToastVisible] = useState(!!(REMOTE_INFO && REMOTE_INFO.fromCache));
  
  var [topoOpen, setTopoOpen] = useState(false);
  var [topoLevelMap, setTopoLevelMap] = useState(null);
  
  var [hotkeysOpen, setHotkeysOpen] = useState(false);
  
  var [validationAvailable, setValidationAvailable] = useState(false);
  useEffect(function() {
    fetch('/api/validation-available').then(function(r) { return r.json(); })
      .then(function(d) { setValidationAvailable(!!d.available); })
      .catch(function(){});
  }, []);
  
  var [rules, setRules] = useState(function() {
    try {
      var raw = localStorage.getItem('dg-rules');
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  });
  
  var [showViolationsOnly, setShowViolationsOnly] = useState(false);
  var [rulesHighlighted, setRulesHighlighted] = useState(true);
  var [helpOpen, setHelpOpen] = useState(false);
  
  var [validationOpen, setValidationOpen] = useState(false);
  var [validationResults, setValidationResults] = useState(function() {
    // Загрузить сохранённые результаты
    return null; // загрузим через useEffect ниже
  });
  var [onlyInvalid, setOnlyInvalid] = useState(false);
  
  useEffect(function() {
    tooltipCache.current.clear();
  }, [nodes, validationResults]);
  
  
  useEffect(function() {
    fetch('/api/validation-results').then(function(r) {
      if (r.status === 204) return null;
      return r.json();
    }).then(function(data) {
      if (!data || !data.results) return;
      var map = new Map();
      data.results.forEach(function(r) { map.set(r.domainId, r); });
      setValidationResults(map);
    }).catch(function(){});
  }, []);
  
  var handleValidationResults = useCallback(function(map) {
    setValidationResults(map);
  }, []);
  
  useEffect(function() {
    try {
      var arr = Array.isArray(rules) ? rules : [];
      localStorage.setItem('dg-rules', JSON.stringify(arr));
    } catch (e) {}
  }, [rules]);
  
  // Initial dat
  useEffect(function() {
    setSelectedNodeId(null); setFocusNode(null);
    setPathResult(null); setPathSel([]);
    setCycleHighlight(null); setHiddenNodeIds(new Set());
    setPathMode(null);
    setTimeout(function() { rfInstance.current && rfInstance.current.fitView({ duration: 500, padding: 0.2 }); }, 150);
  }, [nsMode]);
  
  
  var [bookmarks, setBookmarks] = useState(function() {
    try {
      var raw = localStorage.getItem('dg-bookmarks');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (e) { return new Set(); }
  });
  
  var [bookmarksOnly, setBookmarksOnly] = useState(false);
  
  useEffect(function() {
    try { localStorage.setItem('dg-bookmarks', JSON.stringify(Array.from(bookmarks))); } catch (e) {}
  }, [bookmarks]);
  
  var toggleBookmark = useCallback(function(nodeId) {
    setBookmarks(function(prev) {
      var s = new Set(prev);
      if (s.has(nodeId)) s.delete(nodeId);
      else s.add(nodeId);
      return s;
    });
  }, []);
  
  useEffect(function() {
    if (pathSel.length > 0 || pathMode) {
      clearTimeout(hideTimer.current);
      setTooltip(null);
      window.__tooltipHovered = false;
    }
  }, [pathSel.length, pathMode]);
  
  useEffect(function() {
    if (!tooltipsEnabled) {
      clearTimeout(hideTimer.current);
      setTooltip(null);
      window.__tooltipHovered = false;
    }
  }, [tooltipsEnabled]);
  
  var initial = useMemo(function() {
    var nodes = GRAPH_DATA.nodes.map(function(n) {
      var domainId = n.domainId || n.id.replace(/^(domain_|missing_|broken_)/, '');
      return {
        id: n.id,
        type: 'domainNode',
        data: {
          domainId: domainId,
          label: n.label,
          nodeType: n.group,
          filePath: n.filePath,
          tooltipHtml: n.title,
          fqidRefs: n.fqidRefs || [],
          version: n.version,
          entitiesCount: n.entitiesCount,
          name: n.name || n.label || '',
          description: n.description || '',
          author: n.author || '',
          tags: Array.isArray(n.tags) ? n.tags : []
        },
        position: { x: 0, y: 0 }
      };
    });
    var edges = GRAPH_DATA.edges.map(function(e) {
      var isLinkage = e.kind === 'linkage';
      return {
        id: e.id,
        source: e.from,
        target: e.to,
        type: 'smoothstep',
        label: e.label,
        data: {
          tooltipHtml: e.title,
          fqidRefs: e.fqidRefs || [],
          linkData: e.linkData || null,
          fullLabel: e.fullLabel || e.label || e.id,
          kind: e.kind,
          refCount: e.refCount,
          side1Domain: e.side1Domain || null,
          side2Domain: e.side2Domain || null
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isLinkage ? LINKAGE_COLOR : FQID_COLOR,
          width: 14, height: 14
        },
        style: {
          stroke: isLinkage ? LINKAGE_COLOR : FQID_COLOR,
          strokeWidth: isLinkage ? 2 : 1.5,
          opacity: 0.85
        }
      };
    });
    return { nodes: dagreLayout(nodes, edges, 'LR'), edges: edges };
  }, []);

  var [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  var [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  // ---- Derived: namespace aggregation ----
  var display = useMemo(function() {
    if (!nsMode) return { nodes: nodes, edges: edges };
    return aggregateByNamespace(nodes, edges);
  }, [nodes, edges, nsMode]);
  var displayNodes = display.nodes;
  var displayEdges = display.edges;
  
    var ruleViolations = useMemo(function() {
    if (rules.length === 0) return [];
    return evaluateRules(displayEdges, displayNodes, rules);
  }, [displayEdges, displayNodes, rules]);
  
  var violationsByEdge = useMemo(function() {
    var m = new Map();
    ruleViolations.forEach(function(v) {
      if (!m.has(v.edgeId)) m.set(v.edgeId, []);
      m.get(v.edgeId).push(v);
    });
    return m;
  }, [ruleViolations]);

  // ---- Derived: cycle detection ----
  var cyclesInfo = useMemo(function() { return findCycles(displayNodes, displayEdges); }, [displayNodes, displayEdges]);

  // ---- Derived: health score ----
  var healthMap = useMemo(function() {
    var allNs = new Set();
    displayNodes.forEach(function(n) { allNs.add(n.id); });
    var map = new Map();
    displayNodes.forEach(function(n) {
      var h = computeHealth(n, displayEdges, displayNodes, cyclesInfo.cycleNodes, null);
      map.set(n.id, h);
    });
    return map;
  }, [displayNodes, displayEdges, cyclesInfo]);

  // ---- Derived: bidirectional merge ----
  var bidirectionalEdges = useMemo(function() {
    if (!bidirectional) return displayEdges;
    return mergeBidirectional(displayEdges);
  }, [displayEdges, bidirectional]);

  // ---- Filters ----
  var connected = useMemo(function() {
    var s = new Set();
    displayEdges.forEach(function(e) { s.add(e.source); s.add(e.target); });
    return s;
  }, [displayEdges]);

  var filteredNodes = useMemo(function() {
    return displayNodes.filter(function(n) {
      if (hiddenNodeIds.has(n.id)) return false;
      if (bookmarksOnly && !bookmarks.has(n.id)) return false;
      if (onlyInvalid) {
        var v = validationResults ? validationResults.get(n.data.domainId) : null;
        if (!v || v.status !== 'invalid') return false;
      }
      var t = n.data.nodeType;
      if (t === 'domain' && !filters.domain) return false;
      if (t === 'broken' && !filters.broken) return false;
      if (t === 'missing' && !filters.missing) return false;
      if (namespaceFilter && !matchesNamespace(n.data.domainId, namespaceFilter)) return false;
      if (isolatedOnly && (t !== 'domain' || connected.has(n.id))) return false;
      return true;
    });
  }, [displayNodes, filters, namespaceFilter, isolatedOnly, connected, hiddenNodeIds, bookmarks, bookmarksOnly, onlyInvalid, validationResults]);

  var filteredEdges = useMemo(function() {
    var ids = new Set(filteredNodes.map(function(n) { return n.id; }));
    return bidirectionalEdges.filter(function(e) {
      if (!ids.has(e.source) || !ids.has(e.target)) return false;
      if (showViolationsOnly && !violationsByEdge.has(e.id)) return false;
      var kind = e.data && e.data.kind;
      if (kind === 'linkage' && !filters.linkage) return false;
      if (kind === 'fqid' && !filters.fqid) return false;
      return true;
    });
  }, [bidirectionalEdges, filteredNodes, filters.linkage, filters.fqid, showViolationsOnly, violationsByEdge]);

  // ---- Highlights ----
  var highlight = useMemo(function() {
    // Priority: path > cycle > focus > selected
    if (pathResult) {
      return { nodes: new Set(pathResult.nodes), edges: new Set(pathResult.edges), color: PATH_COLOR, type: 'path' };
    }
    if (cycleHighlight) {
      return { nodes: cycleHighlight.nodeIds, edges: cycleHighlight.edgeIds, color: '#f97316', type: 'cycle' };
    }
    if (focusNode) {
      var reachable = findReachable(focusNode, focusDepth, filteredEdges);
      var focusEdges = new Set();
      filteredEdges.forEach(function(e) {
        if (reachable.has(e.source) && reachable.has(e.target)) focusEdges.add(e.id);
      });
      return { nodes: reachable, edges: focusEdges, color: '#22d3ee', type: 'focus' };
    }
    if (selectedNodeId) {
      var nodeIds = new Set([selectedNodeId]);
      var edgeIds = new Set();
      filteredEdges.forEach(function(e) {
        if (e.source === selectedNodeId || e.target === selectedNodeId) {
          edgeIds.add(e.id);
          nodeIds.add(e.source);
          nodeIds.add(e.target);
        }
      });
      return { nodes: nodeIds, edges: edgeIds, color: '#fbbf24', type: 'selected' };
    }
    return null;
  }, [selectedNodeId, focusNode, focusDepth, cycleHighlight, pathResult, filteredEdges]);
  
  var heatmapValues = useMemo(function() {
    if (heatmap === 'none') return null;
    var map = new Map();
    var values = [];
    displayNodes.forEach(function(n) {
      var v = 0;
      if (heatmap === 'health') v = healthMap.get(n.id) != null ? healthMap.get(n.id) : 0;
      else if (heatmap === 'degree') {
        var d = 0;
        displayEdges.forEach(function(e) { if (e.source === n.id) d++; if (e.target === n.id) d++; });
        v = d;
      }
      else if (heatmap === 'entities') v = n.data.entitiesCount || 0;
      else if (heatmap === 'fqid') v = (n.data.fqidRefs || []).length;
      map.set(n.id, v);
      values.push(v);
    });
    var min = Math.min.apply(null, values.length ? values : [0]);
    var max = Math.max.apply(null, values.length ? values : [1]);
    return { map: map, min: min, max: max, scheme: HEATMAPS[heatmap] };
  }, [heatmap, displayNodes, displayEdges, healthMap]);

  var visibleNodes = useMemo(function() {
    var pathEndpoints = pathResult ? new Set([pathResult.nodes[0], pathResult.nodes[pathResult.nodes.length - 1]]) : null;
    var hasChanges = highlight || compact || topoLevelMap || (validationResults && validationResults.size > 0) ||
      (bookmarks && bookmarks.size > 0) || (hiddenNodeIds && hiddenNodeIds.size > 0) || diffMode || selectedNodeId;
  
    // Быстрый путь: без активных режимов возвращаем filteredNodes как есть
    if (!hasChanges) return filteredNodes;
  
    return filteredNodes.map(function(n) {
      var dimmed = highlight ? !highlight.nodes.has(n.id) : false;
      var inPath = highlight && highlight.type === 'path' && highlight.nodes.has(n.id);
      var isPathEndpoint = pathEndpoints && pathEndpoints.has(n.id);
      var isAdded = diffMode && diffMode.addedNodes && diffMode.addedNodes.has(n.id);
      var health = healthMap.get(n.id);
      var topoLvl = topoLevelMap ? topoLevelMap.get(n.data.domainId) : null;
      var validation = validationResults ? validationResults.get(n.data.domainId) : null;
      var isInvalid = validation && validation.status === 'invalid';
      var isBookmarked = bookmarks ? bookmarks.has(n.id) : false;
  
      return Object.assign({}, n, {
        style: { opacity: dimmed ? 0.12 : 1, transition: 'opacity 0.2s' },
        data: Object.assign({}, n.data, {
          dimmed: dimmed,
          health: health,
          __compact: compact,
          __inPath: inPath,
          __isPathEndpoint: isPathEndpoint,
          __topoLevel: topoLvl,
          __invalid: isInvalid,
          __bookmarked: isBookmarked,
          __validationStatus: validation ? validation.status : null,
          __validationCount: validation && validation.diagnostics ? validation.diagnostics.length : 0,
        }),
        selected: n.id === selectedNodeId
      });
    });
  }, [filteredNodes, highlight, compact, pathResult, diffMode, healthMap, selectedNodeId, topoLevelMap, validationResults, bookmarks, hiddenNodeIds]);

 var visibleEdges = useMemo(function() {
  var hasHighlight = highlight || diffMode || selectedEdgeId ||
    (rulesHighlighted && violationsByEdge && violationsByEdge.size > 0);

  // Быстрый путь: если нет активных подсветок — возвращаем исходный массив
  if (!hasHighlight) return filteredEdges;

  return filteredEdges.map(function(e) {
    var isSelected = e.id === selectedEdgeId;
    var hl = highlight && highlight.edges.has(e.id);
    var baseColor = (e.data && e.data.kind === 'linkage') ? LINKAGE_COLOR
      : (e.data && e.data.kind === 'fqid') ? FQID_COLOR : LINKAGE_COLOR;

    var stroke = baseColor;
    var opacity = 0.85;
    var strokeWidth = (e.style && e.style.strokeWidth) || 1.5;
    var animated = false;

    if (highlight) {
      opacity = hl ? 1 : 0.06;
      strokeWidth = hl ? ((e.data && e.data.kind === 'linkage') ? 3 : 2) : strokeWidth;
      animated = hl && highlight.type === 'path';
    }

    if (diffMode) {
      if (diffMode.addedEdges && diffMode.addedEdges.has(e.id)) { stroke = DIFF_ADDED; opacity = 1; strokeWidth = 3; animated = true; }
      else if (diffMode.removedEdges && diffMode.removedEdges.has(e.id)) { stroke = DIFF_REMOVED; opacity = 1; strokeWidth = 3; }
    }

    if (rulesHighlighted && violationsByEdge && violationsByEdge.has(e.id)) {
      var v = violationsByEdge.get(e.id);
      var hasForbid = v.some(function(x) { return x.severity === 'forbid'; });
      stroke = hasForbid ? '#dc2626' : '#f59e0b';
      opacity = 1;
      strokeWidth = 3.5;
      animated = true;
    }

    if (isSelected) {
      stroke = '#fbbf24';
      opacity = 1;
      strokeWidth = 4;
      animated = true;
    }

    return Object.assign({}, e, {
      animated: animated,
      style: Object.assign({}, e.style, {
        stroke: stroke,
        opacity: opacity,
        strokeWidth: strokeWidth
      }),
      markerEnd: Object.assign({}, e.markerEnd, { color: stroke }),
      markerStart: e.markerStart ? Object.assign({}, e.markerStart, { color: stroke }) : undefined
    });
  });
}, [filteredEdges, highlight, diffMode, rulesHighlighted, violationsByEdge, selectedEdgeId]);
 
 var perfMode = useMemo(function() {
  return filteredEdges.length > 250;
}, [filteredEdges.length]);

var displayEdges = useMemo(function() {
  // В performance mode или при отключённых подписях — не передаём label,
  // чтобы ReactFlow не создавал <text>/<textbg> элементы
  var hideLabels = perfMode || !showEdgeLabels;
  if (!hideLabels) return visibleEdges;
  return visibleEdges.map(function(e) {
    if (!e.label) return e;
    var copy = Object.assign({}, e);
    delete copy.label;
    return copy;
  });
}, [visibleEdges, perfMode, showEdgeLabels]);
 
 var allDomainsList = useMemo(function() {
  return nodes.filter(function(n) { return n.data.nodeType === 'domain'; })
    .map(function(n) { return { id: n.id, domainId: n.data.domainId }; });
}, [nodes]);

var visibleDomainsList = useMemo(function() {
  return visibleNodes.filter(function(n) { return n.data.nodeType === 'domain'; })
    .map(function(n) { return { id: n.id, domainId: n.data.domainId }; });
}, [visibleNodes]);

var bookmarkedDomainsList = useMemo(function() {
  return nodes.filter(function(n) { return bookmarks.has(n.id) && n.data.nodeType === 'domain'; })
    .map(function(n) { return { id: n.id, domainId: n.data.domainId }; });
}, [nodes, bookmarks]);
  
  var panelEdge = selectedEdgeId
    ? visibleEdges.find(function(e) { return e.id === selectedEdgeId; }) || edges.find(function(e) { return e.id === selectedEdgeId; })
    : null;

  // ---- Helpers ----
  var domainToNodeId = useMemo(function() {
    var m = new Map();
    nodes.forEach(function(n) { m.set((n.data.domainId || '').toLowerCase(), n.id); });
    return m;
  }, [nodes]);

  var counts = useMemo(function() { return {
    domain: nodes.filter(function(n) { return n.data.nodeType === 'domain'; }).length,
    missing: nodes.filter(function(n) { return n.data.nodeType === 'missing'; }).length,
    broken: nodes.filter(function(n) { return n.data.nodeType === 'broken'; }).length,
    linkage: edges.filter(function(e) { return e.data && e.data.kind === 'linkage'; }).length,
    fqid: edges.filter(function(e) { return e.data && e.data.kind === 'fqid'; }).length
  }; }, [nodes, edges]);

  var topConnected = useMemo(function() {
    var deg = new Map();
    nodes.forEach(function(n) { deg.set(n.id, 0); });
    edges.forEach(function(e) {
      if (deg.has(e.source)) deg.set(e.source, deg.get(e.source) + 1);
      if (deg.has(e.target)) deg.set(e.target, deg.get(e.target) + 1);
    });
    return nodes.map(function(n) { return { node: n, degree: deg.get(n.id) || 0 }; })
      .filter(function(x) { return x.degree > 0; })
      .sort(function(a, b) { return b.degree - a.degree; }).slice(0, 5);
  }, [nodes, edges]);

  var worstHealth = useMemo(function() {
    return nodes
      .filter(function(n) { return n.data.nodeType === 'domain'; })
      .map(function(n) { return { node: n, health: healthMap.get(n.id) || 0 }; })
      .sort(function(a, b) { return a.health - b.health; })
      .slice(0, 5);
  }, [nodes, healthMap]);

  var namespaces = useMemo(function() {
    var map = new Map();
    nodes.forEach(function(n) {
      if (n.data.nodeType !== 'domain') return;
      var ns = n.data.domainId.split('.').slice(0, 2).join('.');
      map.set(ns, (map.get(ns) || 0) + 1);
    });
    return Array.from(map.entries()).sort(function(a, b) { return b[1] - a[1]; });
  }, [nodes]);

  var tagCloud = useMemo(function() {
    var m = new Map();
    nodes.forEach(function(n) { (n.data.tags || []).forEach(function(t) { m.set(String(t), (m.get(String(t)) || 0) + 1); }); });
    return Array.from(m.entries()).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 14);
  }, [nodes]);

  var isolatedCount = useMemo(function() {
    var conn = new Set();
    edges.forEach(function(e) { conn.add(e.source); conn.add(e.target); });
    return nodes.filter(function(n) { return n.data.nodeType === 'domain' && !conn.has(n.id); }).length;
  }, [nodes, edges]);

  var activeFiltersCount = useMemo(function() {
    var c = 0;
    if (!filters.domain) c++; if (!filters.missing) c++; if (!filters.broken) c++;
    if (!filters.linkage) c++; if (!filters.fqid) c++;
    if (namespaceFilter.trim()) c++;
    if (isolatedOnly) c++;
    return c;
  }, [filters, namespaceFilter, isolatedOnly]);

  // ---- Search ----
  var searchResults = useMemo(function() {
    var q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return nodes.map(function(n) {
      var d = n.data || {};
      var id = (d.domainId || '').toLowerCase();
      var nm = (d.name || '').toLowerCase();
      var desc = (d.description || '').toLowerCase();
      var tags = Array.isArray(d.tags) ? d.tags.map(function(t) { return String(t).toLowerCase(); }) : [];
      var matches = [];
      if (id.indexOf(q) !== -1) matches.push({ field: 'id' });
      if (nm.indexOf(q) !== -1) matches.push({ field: 'name' });
      if (desc.indexOf(q) !== -1) matches.push({ field: 'description' });
      tags.forEach(function(t) { if (t.indexOf(q) !== -1) matches.push({ field: 'tags' }); });
      return matches.length > 0 ? { node: n, matches: matches } : null;
    }).filter(Boolean).sort(function(a, b) {
      var rank = function(r) {
        var f = r.matches.map(function(m) { return m.field; });
        if (f.indexOf('id') !== -1) return 0;
        if (f.indexOf('name') !== -1) return 1;
        if (f.indexOf('tags') !== -1) return 2;
        return 3;
      };
      return rank(a) - rank(b);
    }).slice(0, 100);
  }, [searchQuery, nodes]);

  useEffect(function() { setSearchIndex(0); }, [searchQuery]);

  // Отслеживаем последнюю позицию мыши глобально
  useEffect(function() {
    var onMove = function(e) {
      window.__lastMouse = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener('mousemove', onMove);
    return function() { document.removeEventListener('mousemove', onMove); };
  }, []);
  // ---- Actions ----
  var navigatingFromHistory = useRef(false);
  
 var pushNav = useCallback(function(domainId) {
    if (!domainId) return;
    setNavStack(function(prev) {
      var trimmed = prev.items.slice(0, prev.index + 1);
      if (trimmed.length > 0 && trimmed[trimmed.length - 1] === domainId) return prev;
      var next = trimmed.concat([domainId]);
      if (next.length > 50) next = next.slice(next.length - 50);
      return { items: next, index: next.length - 1 };
    });
  }, []);
 
  var gotoWithoutNav = useCallback(function(domainId) {
    // как gotoDomainByDomainId, но без pushNav
    if (!domainId) return;
    var nodeId = domainToNodeId.get(domainId.toLowerCase());
    if (!nodeId) return;
    var node = nodes.find(function(n) { return n.id === nodeId; });
    if (!node || !rfInstance.current) return;
    var w = compact ? NODE_COMPACT : NODE_WIDTH;
    var h = compact ? NODE_COMPACT : NODE_HEIGHT;
    var cx = node.position.x + w / 2;
    var cy = node.position.y + h / 2;
    var z = Math.max(rfInstance.current.getZoom(), 1.2);
    rfInstance.current.setCenter(cx, cy, { zoom: z, duration: 500 });
    setSelectedNodeId(nodeId);
  }, [domainToNodeId, nodes, compact]);
  
  var gotoDomainByDomainId = useCallback(function(domainId) {
    if (!domainId) return;
    pushNav(domainId);
    gotoWithoutNav(domainId);
  }, [pushNav, gotoWithoutNav]);
  
  var navBack = useCallback(function() {
    setNavStack(function(prev) {
      if (prev.index <= 0) return prev;
      var newIdx = prev.index - 1;
      var id = prev.items[newIdx];
      if (id) setTimeout(function() { gotoWithoutNav(id); }, 0);
      return { items: prev.items, index: newIdx };
    });
  }, [gotoWithoutNav]);
  
  var navForward = useCallback(function() {
    setNavStack(function(prev) {
      if (prev.index >= prev.items.length - 1) return prev;
      var newIdx = prev.index + 1;
      var id = prev.items[newIdx];
      if (id) setTimeout(function() { gotoWithoutNav(id); }, 0);
      return { items: prev.items, index: newIdx };
    });
  }, [gotoWithoutNav]);

  var openSearch = useCallback(function() {
    setSearchQuery(''); setSearchIndex(0); setSearchOpen(true);
    setTimeout(function() { searchInputRef.current && searchInputRef.current.focus(); }, 50);
  }, []);
  var closeSearch = useCallback(function() { setSearchOpen(false); }, []);

  var openDetails = useCallback(function(nodeId) {
    setPanelNodeId(nodeId);
    setPanelTab('details');
    setPanelOpen(true);
  }, []);

  var closePanel = useCallback(function() { setPanelOpen(false); }, []);

  var openFileInEditor = useCallback(function(filePath, fqid) {
    if (!filePath) return;
    setEditorFilePath(filePath);
    setPanelTab('file');
    setPanelOpen(true);
    fetch('/file?path=' + encodeURIComponent(filePath))
      .then(function(r) { return r.ok ? r.text() : Promise.reject('File not found'); })
      .then(function(content) {
        setPendingFile({ content: content, fqid: fqid || null, ts: Date.now() });
      })
      .catch(function(err) {
        setPendingFile({ content: '// Не удалось загрузить файл: ' + err, fqid: null, ts: Date.now() });
      });
  }, []);

  var handleFindCycles = useCallback(function() {
    if (cycleHighlight) { setCycleHighlight(null); return; }
    var info = findCycles(displayNodes, displayEdges);
    if (info.cycleNodes.size === 0) { alert('Циклы не найдены'); return; }
    setCycleHighlight({ nodeIds: info.cycleNodes, edgeIds: info.cycleEdges, sccCount: info.sccs.length });
    setSelectedNodeId(null); setFocusNode(null); setPathResult(null); setPathSel([]);
    setTimeout(function() { rfInstance.current && rfInstance.current.fitView({ duration: 500, padding: 0.25 }); }, 50);
  }, [displayNodes, displayEdges, cycleHighlight]);

  var handleExportMarkdown = useCallback(function() {
    var md = generateMarkdownReport({
      nodes: nodes,
      edges: edges,
      cyclesInfo: cyclesInfo,
      healthMap: healthMap,
      namespaceFilter: namespaceFilter,
      filters: filters
    });
    var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'domain-report-' + new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-') + '.md';
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, cyclesInfo, healthMap, namespaceFilter, filters]);
  
  var handleExportJSON = useCallback(function() {
    var data = {
      exportedAt: new Date().toISOString(),
      scope: 'full',
      stats: { nodes: nodes.length, edges: edges.length },
      nodes: nodes.map(function(n) { return {
        id: n.id, domainId: n.data.domainId, label: n.data.label, nodeType: n.data.nodeType,
        filePath: n.data.filePath, description: n.data.description, tags: n.data.tags
      }; }),
      edges: edges.map(function(e) { return {
        id: e.id, source: e.source, target: e.target, label: e.label,
        kind: e.data && e.data.kind, fullLabel: e.data && e.data.fullLabel, refCount: e.data && e.data.refCount
      }; })
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'domain-graph-' + new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-') + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges]);

  var handleSnapshotUpload = useCallback(function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var snap = JSON.parse(ev.target.result);
        if (!snap.scope) {
          if (!confirm('Снапшот создан старой версией без поля "scope". Продолжить?')) { e.target.value = ''; return; }
        }
        var snapEdgeIds = new Set(snap.edges.map(function(x) { return x.id; }));
        var snapNodeIds = new Set(snap.nodes.map(function(x) { return x.id; }));
        var curEdgeIds = new Set(edges.map(function(x) { return x.id; }));
        var curNodeIds = new Set(nodes.map(function(x) { return x.id; }));
        var addedEdges = new Set(), removedEdges = new Set(), addedNodes = new Set(), removedNodes = new Set();
        curEdgeIds.forEach(function(id) { if (!snapEdgeIds.has(id)) addedEdges.add(id); });
        snapEdgeIds.forEach(function(id) { if (!curEdgeIds.has(id)) removedEdges.add(id); });
        curNodeIds.forEach(function(id) { if (!snapNodeIds.has(id)) addedNodes.add(id); });
        snapNodeIds.forEach(function(id) { if (!curNodeIds.has(id)) removedNodes.add(id); });
        setDiffMode({ addedEdges: addedEdges, removedEdges: removedEdges, addedNodes: addedNodes, removedNodes: removedNodes, snapshot: snap });
      } catch (err) { alert('Ошибка чтения снимка: ' + err.message); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [nodes, edges]);

  // ---- Node interactions ----
  var handleNodeClick = useCallback(function(event, node) {
    clearTimeout(hideTimer.current);
    setTooltip(null);
    window.__tooltipHovered = false;
  
    if (pathMode) {
      var startId = pathMode.kind === 'from' ? pathMode.anchorId : node.id;
      var endId = pathMode.kind === 'from' ? node.id : pathMode.anchorId;
      if (startId === endId) { setPathMode(null); return; }
      var res = findPath(startId, endId, filteredEdges);
      if (res) setPathResult(res); else alert('Путь не найден');
      setPathMode(null);
      return;
    }
  
    if (event.ctrlKey || event.metaKey) {
      setPathSel(function(prev) {
        if (prev.length === 0) return [node.id];
        if (prev.length === 1 && prev[0] !== node.id) return [prev[0], node.id];
        return [node.id];
      });
      return;
    }
  
    setSelectedNodeId(node.id);
    setFocusNode(null);
    setPathResult(null);
    setPathSel([]);
    pushNav(node.data.domainId);   // ← добавили
    openDetails(node.id);
  }, [openDetails, pathMode, filteredEdges, pushNav]);

  var handleNodeDoubleClick = useCallback(function(event, node) {
    if (focusNode === node.id) setFocusNode(null);
    else { setFocusNode(node.id); setSelectedNodeId(null); }
  }, [focusNode]);

  var handleNodeContextMenu = useCallback(function(event, node) {
    event.preventDefault();
    clearTimeout(hideTimer.current);
    setTooltip(null);
    window.__tooltipHovered = false;
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  }, []);

  var handlePaneContextMenu = useCallback(function(event) { event.preventDefault(); }, []);

  var handlePaneClick = useCallback(function() {
      // Закрываем все поповеры тулбара
      document.dispatchEvent(new CustomEvent('close-all-popovers'));
    
      // Скрываем тултип
      clearTimeout(hideTimer.current);
      setTooltip(null);
      window.__tooltipHovered = false;
    
      // Сбрасываем выделения и режимы
      setSelectedNodeId(null);
      setFocusNode(null);
      setPathResult(null);
      setPathSel([]);
      setCycleHighlight(null);
      setPathMode(null);
    
      // Закрываем контекстное меню
      setContextMenu(null);
  }, []);

  var handleContextAction = useCallback(function(action, nodeId) {
    var node = nodes.find(function(n) { return n.id === nodeId; });
    if (!node) return;
    if (action === 'focus') { setFocusNode(nodeId); setSelectedNodeId(null); }
    else if (action === 'dependents') {
      // Show only nodes that depend on this
      setFocusNode(nodeId); setFocusDepth(3);
    }
    else if (action === 'path-from') {
      setPathMode({ kind: 'from', anchorId: nodeId });
      setPathSel([]);
      setPathResult(null);
    }
    else if (action === 'path-to') {
      setPathMode({ kind: 'to', anchorId: nodeId });
      setPathSel([]);
      setPathResult(null);
    }
    else if (action === 'open-file') { if (node.data.filePath) openFileInEditor(node.data.filePath); }
    else if (action === 'copy-id') { navigator.clipboard.writeText(node.data.domainId); }
    else if (action === 'hide') {
      setHiddenNodeIds(function(prev) {
        var s = new Set(prev);
        s.add(nodeId);
        return s;
      });
    }
    else if (action === 'bookmark') { toggleBookmark(nodeId); }
  }, [nodes, filteredEdges, pathSel, openFileInEditor, setNodes]);

  var handleRunPath = useCallback(function() {
    if (pathSel.length !== 2) { alert('Выберите два узла через Ctrl+клик'); return; }
    var res = findPath(pathSel[0], pathSel[1], filteredEdges);
    if (res) setPathResult(res);
    else alert('Путь не найден');
  }, [pathSel, filteredEdges]);

  // ---- Tooltip ----
  var showTooltipFor = useCallback(function(html, event) {
    clearTimeout(hideTimer.current);
    var x = event.clientX + 16, y = event.clientY + 16;
    setTooltip({
      html: html,
      x: x,
      y: y,
      anchorX: event.clientX,
      anchorY: event.clientY
    });
  }, []);

 var scheduleHideRef = useRef(null);

var scheduleHide = useCallback(function() {
  clearTimeout(hideTimer.current);
  hideTimer.current = setTimeout(function() {
    if (window.__tooltipHovered) return;

    var el = document.querySelector('.tooltip');
    var m = window.__lastMouse;
    if (el && m) {
      var rect = el.getBoundingClientRect();
      var pad = 40;
      if (m.x >= rect.left - pad && m.x <= rect.right + pad &&
          m.y >= rect.top - pad && m.y <= rect.bottom + pad) {
        // Мышь рядом с тултипом — не скрываем, повторим проверку позже
        if (scheduleHideRef.current) scheduleHideRef.current();
        return;
      }
    }
    setTooltip(null);
  }, 250);
}, []);

useEffect(function() {
  scheduleHideRef.current = scheduleHide;
}, [scheduleHide]);

  useEffect(function() {
    if (!tooltip) return;
    var el = document.querySelector('.tooltip');
    if (!el) return;
  
    var rect = el.getBoundingClientRect();
    var margin = 12;
    var gap = 16;
    var ax = tooltip.anchorX != null ? tooltip.anchorX : tooltip.x;
    var ay = tooltip.anchorY != null ? tooltip.anchorY : tooltip.y;
  
    // Начинаем справа-снизу от курсора
    var x = ax + gap;
    var y = ay + gap;
  
    // Не влезает справа — перебрасываем влево от курсора (не clamp!)
    if (x + rect.width > window.innerWidth - margin) {
      x = ax - rect.width - gap;
    }
    // Не влезает снизу — перебрасываем вверх от курсора
    if (y + rect.height > window.innerHeight - margin) {
      y = ay - rect.height - gap;
    }
  
    // Финальная прижатие к краям — если и с другой стороны не влезает
    if (x < margin) x = margin;
    if (y < margin) y = margin;
  
    // Уже правильная позиция — не трогаем (это гасит цикл пересчёта)
    if (x === tooltip.x && y === tooltip.y) return;
  
    setTooltip(function(t) { return t ? Object.assign({}, t, { x: x, y: y }) : null; });
  }, [tooltip]);

  var handleNodeMouseEnter = useCallback(function(event, node) {
  if (!tooltipsEnabled) return;
  if (pathSel.length > 0 || pathMode) return;
  var curZoom = rfInstance.current ? rfInstance.current.getZoom() : 1;
  if (curZoom < 0.5) return;

  clearTimeout(hideTimer.current);
  hideTimer.current = setTimeout(function() {
    var key = node.id;
    var html = tooltipCache.current.get(key);
    if (!html) {
      var validation = validationResults ? validationResults.get(node.data.domainId) : null;
      html = buildTooltipHtml(
        node.data.domainId, node.data.label, node.data.nodeType, node.data.filePath,
        node.data.version, node.data.entitiesCount, node.data.fqidRefs,
        healthMap.get(node.id), node.data.description, node.data.tags,
        validation                              
      );
      tooltipCache.current.set(key, html);
    }
    showTooltipFor(html, event);
  }, 120);
}, [showTooltipFor, healthMap, pathSel.length, pathMode, tooltipsEnabled, validationResults]);
  
  var handleEdgeMouseEnter = useCallback(function(event, edge) {
    if (!tooltipsEnabled) return;
    if (pathSel.length > 0 || pathMode) return;
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(function() {
      var refs = (edge.data && edge.data.fqidRefs) || [];
      showTooltipFor(buildEdgeTooltipHtml(edge, refs), event);
    }, 120);
  }, [showTooltipFor, pathSel.length, pathMode, tooltipsEnabled]);

  // ---- Global click delegation (tooltip buttons, goto-domain) ----
  useEffect(function() {
    var handler = function(e) {
      var toggleBtn = e.target.closest('.js-toggle-validation');
      if (toggleBtn) {
        e.stopPropagation();
        e.preventDefault();
        var list = toggleBtn.nextElementSibling;
        if (list && list.classList.contains('tooltip__validation-list')) {
          var isOpen = list.style.display !== 'none';
          list.style.display = isOpen ? 'none' : 'block';
          var arrow = toggleBtn.querySelector('.tooltip__validation-arrow');
          if (arrow) arrow.textContent = isOpen ? '▸' : '▾';
        }
        return;
      }
      var openBtn = e.target.closest('.js-open-file');
      if (openBtn) {
        e.stopPropagation(); e.preventDefault();
        openFileInEditor(openBtn.getAttribute('data-file'), openBtn.getAttribute('data-fqid'));
        return;
      }
      var gotoBtn = e.target.closest('.js-goto-domain');
      if (gotoBtn) {
        e.stopPropagation(); e.preventDefault();
        var d = gotoBtn.getAttribute('data-domain');
        if (!d) return;
        gotoDomainByDomainId(d);
        setTooltip(null);
        window.__tooltipHovered = false;
      }
    };
    document.addEventListener('click', handler, true);
    return function() { document.removeEventListener('click', handler, true); };
  }, [openFileInEditor, gotoDomainByDomainId]);

  // ---- Hotkeys ----
  useEffect(function() {
    var handler = function(e) {
      if (e.shiftKey && e.key === 'Tab') { e.preventDefault(); if (searchOpen) closeSearch(); else openSearch(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openSearch(); return; }
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.key === 'f' || e.key === 'F') { rfInstance.current && rfInstance.current.fitView({ duration: 500 }); }
      else if (e.key === 'Escape') {
        setSelectedNodeId(null); setFocusNode(null);
        setPathSel([]); setPathResult(null);
        setCycleHighlight(null); setContextMenu(null);
        setPathMode(null);
      }
      else if (e.key === 'c' || e.key === 'C') { handleFindCycles(); }
      else if (e.key === 'i' || e.key === 'I') { setIsolatedOnly(function(v) { return !v; }); }
      else if (e.key === 's' || e.key === 'S') { setNsMode(function(v) { return !v; }); }
      else if (e.key === 'p' || e.key === 'P') { handleRunPath(); }
      else if ((e.key === 'b' || e.key === 'B') && selectedNodeId) { toggleBookmark(selectedNodeId); }
      else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); navBack(); return; }
      else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); navForward(); return; }
      else if ((e.key === '?' || e.key === 'F1') && !e.target.matches('input, textarea')) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      else if ((e.key === '?' || e.key === 'F1') && !e.target.matches('input, textarea')) {
        e.preventDefault();
        if (e.key === 'F1') setHelpOpen(true);
        else setHotkeysOpen(true);
        return;
      }
      else if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setTooltipsEnabled(function(v) { return !v; });
      }
    };
    window.addEventListener('keydown', handler, true);
    return function() { window.removeEventListener('keydown', handler, true); };
  }, [searchOpen, openSearch, closeSearch, handleFindCycles, handleRunPath, navBack, navForward, tooltipsEnabled]);

  // ---- Layout on change ----
  useEffect(function() {
    setNodes(function(prev) {
      var compactNodes = prev.map(function(n) { return Object.assign({}, n, { data: Object.assign({}, n.data, { __compact: compact }) }); });
      return runLayout(compactNodes, edges, layoutType);
    });
    setTimeout(function() { rfInstance.current && rfInstance.current.fitView({ duration: 500, padding: 0.2 }); }, 150);
  }, [layoutType, compact]);

  // ---- Render ----
  var panelNode = panelNodeId ? visibleNodes.find(function(n) { return n.id === panelNodeId; }) || nodes.find(function(n) { return n.id === panelNodeId; }) : null;
  
  useEffect(function() {
    if (!panelOpen || panelTab !== 'file') return;
    if (!panelNode) return;
    if (!panelNode.data.filePath) return;
    if (editorFilePath === panelNode.data.filePath && pendingFile) return;
    // Загружаем файл узла, если ещё не загружен
    openFileInEditor(panelNode.data.filePath);
  }, [panelOpen, panelTab, panelNodeId]);
  
  var handleEdgeClick = useCallback(function(event, edge) {
    setSelectedEdgeId(edge.id);
    setPanelTab('edge');
    setPanelOpen(true);
    clearTimeout(hideTimer.current);
    setTooltip(null);
    window.__tooltipHovered = false;
  }, []);
  
 var handleExportPNG = useCallback(function() {
    var flowEl = document.querySelector('.graph-container');
    if (!flowEl) { alert('Граф не найден'); return; }
  
    import('https://esm.sh/html-to-image@1.11.11')
      .then(function(mod) {
        var bg = getComputedStyle(document.documentElement).getPropertyValue('--graph-bg').trim() || '#0a0e1a';
        return mod.toPng(flowEl, {
          backgroundColor: bg,
          pixelRatio: 2,
          filter: function(node) {
            if (!node.classList) return true;
            if (node.classList.contains('react-flow__controls')) return false;
            if (node.classList.contains('react-flow__minimap')) return false;
            if (node.classList.contains('react-flow__panel')) return false;
            if (node.classList.contains('heat-legend')) return false;
            if (node.classList.contains('side-panel')) return false;
            if (node.classList.contains('toolbar')) return false;
            return true;
          }
        });
      })
      .then(function(dataUrl) {
        var a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'domain-graph-' + new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-') + '.png';
        a.click();
      })
      .catch(function(err) { alert('Ошибка экспорта: ' + err.message); });
  }, []);
 
 var activeModes = useMemo(function() {
  var modes = [];

  if (cycleHighlight) {
    modes.push({
      icon: '🔁',
      label: 'Циклы (' + cycleHighlight.sccCount + ')',
      color: 'orange',
      onClear: function() { setCycleHighlight(null); }
    });
  }
  if (focusNode) {
    modes.push({
      icon: '🎯',
      label: 'Фокус N=' + focusDepth,
      color: 'cyan',
      onClear: function() { setFocusNode(null); }
    });
  }
  if (pathResult || pathSel.length > 0) {
    modes.push({
      icon: '🛤️',
      label: pathResult ? 'Путь найден' : 'Выбор пути (' + pathSel.length + '/2)',
      color: 'yellow',
      onClear: function() { setPathResult(null); setPathSel([]); setPathMode(null); }
    });
  }
  if (hiddenNodeIds.size > 0) {
    modes.push({
      icon: '👁',
      label: 'Скрыто: ' + hiddenNodeIds.size,
      color: 'gray',
      onClear: function() { setHiddenNodeIds(new Set()); }
    });
  }
  if (onlyInvalid) {
    modes.push({
      icon: '❌',
      label: 'Только невалидные',
      color: 'red',
      onClear: function() { setOnlyInvalid(false); }
    });
  }
  if (bookmarksOnly) {
    modes.push({
      icon: '★',
      label: 'Только избранные',
      color: 'yellow',
      onClear: function() { setBookmarksOnly(false); }
    });
  }
  if (nsMode) {
    modes.push({
      icon: '🗂',
      label: 'Агрегация по семействам',
      color: 'purple',
      onClear: function() { setNsMode(false); }
    });
  }
  if (diffMode) {
    modes.push({
      icon: '⇄',
      label: 'Diff +' + (diffMode.addedEdges.size + diffMode.addedNodes.size) + '/−' + (diffMode.removedEdges.size + diffMode.removedNodes.size),
      color: 'blue',
      onClear: function() { setDiffMode(null); }
    });
  }
  if (ruleViolations && ruleViolations.length > 0 && rulesHighlighted) {
    modes.push({
      icon: '⛔',
      label: 'Нарушения: ' + ruleViolations.length,
      color: 'red',
      onClear: function() { setRulesHighlighted(false); }
    });
  }
  if (!tooltipsEnabled) {
    modes.push({
      icon: '🚫',
      label: 'Тултипы выключены',
      color: 'gray',
      onClear: function() { setTooltipsEnabled(true); }
    });
  }
  if (topoLevelMap) {
    modes.push({
      icon: '📦',
      label: 'Уровни установки',
      color: 'green',
      onClear: function() { setTopoLevelMap(null); }
    });
    }
  
    return modes;
  }, [topoLevelMap, cycleHighlight, focusNode, focusDepth, pathResult, pathSel, hiddenNodeIds, onlyInvalid, bookmarksOnly, nsMode, diffMode, ruleViolations, rulesHighlighted, tooltipsEnabled]);
 
 
 var commands = useMemo(function() {
    return [
      // Навигация
      { section: 'Навигация', icon: '⛶', label: 'Вписать в экран', hotkey: 'F', keywords: 'fit zoom',
        run: function() { rfInstance.current && rfInstance.current.fitView({ duration: 500 }); } },
      { section: 'Навигация', icon: '⟳', label: 'Переуложить граф', keywords: 'relayout',
        run: function() { setNodes(runLayout(nodes, edges, layoutType)); setTimeout(function() { rfInstance.current && rfInstance.current.fitView({ duration: 500 }); }, 100); } },
      { section: 'Навигация', icon: '←', label: 'Назад по истории', hotkey: 'Alt+←', keywords: 'back',
        run: navBack },
      { section: 'Навигация', icon: '→', label: 'Вперёд по истории', hotkey: 'Alt+→', keywords: 'forward',
        run: navForward },
  
      // Раскладка
      { section: 'Раскладка', icon: '📐', label: 'Горизонтальная (LR)', keywords: 'layout dagre horizontal',
        run: function() { setLayoutType('LR'); } },
      { section: 'Раскладка', icon: '📐', label: 'Вертикальная (TB)', keywords: 'layout vertical',
        run: function() { setLayoutType('TB'); } },
      { section: 'Раскладка', icon: '📐', label: 'Force-directed', keywords: 'layout force physics',
        run: function() { setLayoutType('force'); } },
      { section: 'Раскладка', icon: '📐', label: 'Круговая', keywords: 'layout circular circle',
        run: function() { setLayoutType('circular'); } },
  
      // Вид
      { section: 'Вид', icon: theme === 'dark' ? '☀️' : '🌙', label: 'Переключить тему', keywords: 'theme dark light',
        run: function() { setTheme(theme === 'dark' ? 'light' : 'dark'); } },
      { section: 'Вид', icon: '⚫', label: compact ? 'Выключить компактный режим' : 'Включить компактный режим', keywords: 'compact small',
        run: function() { setCompact(!compact); } },
      { section: 'Вид', icon: '🗂', label: showGroups ? 'Скрыть группировку' : 'Показать группировку', keywords: 'groups boxes',
        run: function() { setShowGroups(!showGroups); } },
      { section: 'Вид', icon: '⇄', label: bidirectional ? 'Разъединить A↔B' : 'Объединять A↔B', keywords: 'bidirectional merge',
        run: function() { setBidirectional(!bidirectional); } },
      { section: 'Вид', icon: '🏷', label: showEdgeLabels ? 'Скрыть подписи связей' : 'Показать подписи связей', keywords: 'labels edges',
        run: function() { setShowEdgeLabels(!showEdgeLabels); } },
      { section: 'Вид', icon: tooltipsEnabled ? '🚫' : '💬', label: tooltipsEnabled ? 'Скрыть тултипы' : 'Показать тултипы', hotkey: 'T', keywords: 'tooltip hover',
        run: function() { setTooltipsEnabled(!tooltipsEnabled); } },
  
      // Heatmap
      { section: 'Heatmap', icon: '🔥', label: heatmap === 'health' ? 'Выключить heatmap' : 'Heatmap: Health score', keywords: 'heatmap health',
        run: function() { setHeatmap(heatmap === 'health' ? 'none' : 'health'); } },
      { section: 'Heatmap', icon: '🔥', label: heatmap === 'degree' ? 'Выключить heatmap' : 'Heatmap: Количество связей', keywords: 'heatmap degree',
        run: function() { setHeatmap(heatmap === 'degree' ? 'none' : 'degree'); } },
      { section: 'Heatmap', icon: '🔥', label: heatmap === 'entities' ? 'Выключить heatmap' : 'Heatmap: Entities', keywords: 'heatmap entities',
        run: function() { setHeatmap(heatmap === 'entities' ? 'none' : 'entities'); } },
      { section: 'Heatmap', icon: '🔥', label: heatmap === 'fqid' ? 'Выключить heatmap' : 'Heatmap: FQID-ссылки', keywords: 'heatmap fqid refs',
        run: function() { setHeatmap(heatmap === 'fqid' ? 'none' : 'fqid'); } },
  
      // Анализ
      { section: 'Анализ', icon: '🔁', label: 'Найти циклы', hotkey: 'C', keywords: 'cycles scc loop',
        run: handleFindCycles },
      { section: 'Анализ', icon: '◯', label: isolatedOnly ? 'Показать все домены' : 'Только изолированные', hotkey: 'I', keywords: 'isolated orphans',
        run: function() { setIsolatedOnly(!isolatedOnly); } },
      { section: 'Анализ', icon: '🗂', label: nsMode ? 'Выключить агрегацию' : 'Агрегация по семействам', hotkey: 'S', keywords: 'namespace aggregate family',
        run: function() { setNsMode(!nsMode); } },
      { section: 'Анализ', icon: '📦', label: 'Порядок установки (топосорт)', keywords: 'topo install order',
        run: function() { setTopoOpen(true); } },
      { section: 'Анализ', icon: '🎯', label: focusNode ? 'Сбросить фокус' : 'Фокус на выделенном', keywords: 'focus',
        run: function() { if (focusNode) setFocusNode(null); else if (selectedNodeId) setFocusNode(selectedNodeId); } },
      { section: 'Анализ', icon: '🛤️', label: 'Найти путь между двумя узлами', hotkey: 'P', keywords: 'path find',
        run: handleRunPath },
  
      // Фильтры
      { section: 'Фильтры', icon: '★', label: bookmarksOnly ? 'Показать все домены' : 'Только избранные', keywords: 'bookmarks favorites',
        run: function() { setBookmarksOnly(!bookmarksOnly); } },
      { section: 'Фильтры', icon: '❌', label: onlyInvalid ? 'Показать все домены' : 'Только невалидные', keywords: 'invalid errors validation',
        run: function() { setOnlyInvalid(!onlyInvalid); } },
      { section: 'Фильтры', icon: '🗑', label: 'Сбросить все фильтры', keywords: 'reset filters clear',
        run: function() {
          setFilters({ domain: true, broken: true, missing: true, linkage: true, fqid: true });
          setNamespaceFilter('');
          setBookmarksOnly(false);
          setOnlyInvalid(false);
          setIsolatedOnly(false);
          setHiddenNodeIds(new Set());
        } },
  
      // Данные
      { section: 'Данные', icon: '💾', label: 'Экспорт графа в JSON', keywords: 'export json download',
        run: handleExportJSON },
      { section: 'Данные', icon: '📝', label: 'Отчёт в Markdown', keywords: 'export markdown report',
        run: handleExportMarkdown },
      { section: 'Данные', icon: '🖼️', label: 'Экспорт графа в PNG', keywords: 'export png image',
        run: handleExportPNG },
      validationAvailable && { section: 'Данные', icon: '🔍', label: 'Массовая валидация доменов', keywords: 'validate check',
        run: function() { setValidationOpen(true); } },
  
      // Справка
      { section: 'Справка', icon: '📖', label: 'Руководство пользователя', hotkey: 'F1', keywords: 'guide help docs',
        run: function() { setHelpOpen(true); } },
      { section: 'Справка', icon: '⌨️', label: 'Список горячих клавиш', keywords: 'hotkeys shortcuts',
        run: function() { setHotkeysOpen(true); } }
    ].filter(Boolean);
  }, [
    theme, compact, showGroups, bidirectional, showEdgeLabels, tooltipsEnabled, heatmap,
    isolatedOnly, nsMode, focusNode, selectedNodeId, bookmarksOnly, onlyInvalid, validationAvailable,
    nodes, edges, layoutType, navBack, navForward,
    handleFindCycles, handleRunPath, handleExportJSON, handleExportMarkdown, handleExportPNG
  ]);

  return React.createElement('div', { className: 'app' },
    React.createElement('aside', { className: 'sidebar' + (sidebarCollapsed ? ' sidebar--collapsed' : '') },
      sidebarCollapsed ?
        React.createElement('button', { className: 'sidebar__expand', onClick: function() { setSidebarCollapsed(false); }, title: 'Развернуть' }, '›') :
        React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'sidebar__header' },
            React.createElement('div', { className: 'sidebar__logo' }, '🌐'),
            React.createElement('div', { style: { flex: 1 } },
              React.createElement('div', { className: 'sidebar__title' }, 'Domain Graph'),
              React.createElement('div', { className: 'sidebar__subtitle' }, 'Analyzer')
            ),
            React.createElement('button', { className: 'sidebar__collapse', onClick: function() { setSidebarCollapsed(true); }, title: 'Свернуть' }, '‹')
          ),
          React.createElement('div', { className: 'sidebar__body' },
            // Overview
            React.createElement('div', { className: 'section' },
              React.createElement('div', { className: 'section__title' }, 'Обзор'),
              React.createElement('div', { className: 'stats-grid' },
                React.createElement('div', { className: 'stat-card stat-card--accent' }, React.createElement('div', { className: 'stat-card__value' }, nodes.length), React.createElement('div', { className: 'stat-card__label' }, 'Всего узлов')),
                React.createElement('div', { className: 'stat-card stat-card--success' }, React.createElement('div', { className: 'stat-card__value' }, edges.length), React.createElement('div', { className: 'stat-card__label' }, 'Связей')),
                React.createElement('div', { className: 'stat-card stat-card--warning' }, React.createElement('div', { className: 'stat-card__value' }, counts.missing), React.createElement('div', { className: 'stat-card__label' }, 'Missing')),
                React.createElement('div', { className: 'stat-card stat-card--danger' }, React.createElement('div', { className: 'stat-card__value' }, counts.broken), React.createElement('div', { className: 'stat-card__label' }, 'Broken'))
              )
            ),
            // Connectivity
            React.createElement('div', { className: 'section' },
              React.createElement('div', { className: 'section__title' }, 'Связность'),
              React.createElement('div', { className: 'mini-stats' },
                React.createElement('div', { className: 'mini-stat' }, React.createElement('span', { className: 'mini-stat__label' }, 'Домены'), React.createElement('span', { className: 'mini-stat__value' }, counts.domain)),
                React.createElement('div', { className: 'mini-stat' }, React.createElement('span', { className: 'mini-stat__label' }, 'Изолированы'), React.createElement('span', { className: 'mini-stat__value' }, isolatedCount)),
                React.createElement('div', { className: 'mini-stat' }, React.createElement('span', { className: 'mini-stat__label' }, 'Linkage'), React.createElement('span', { className: 'mini-stat__value' }, counts.linkage)),
                React.createElement('div', { className: 'mini-stat' }, React.createElement('span', { className: 'mini-stat__label' }, 'FQID'), React.createElement('span', { className: 'mini-stat__value' }, counts.fqid)),
                React.createElement('div', { className: 'mini-stat' }, React.createElement('span', { className: 'mini-stat__label' }, 'Циклы'), React.createElement('span', { className: 'mini-stat__value' }, cyclesInfo.sccs.length))
              )
            ),
            // Top connected
            topConnected.length > 0 && React.createElement('div', { className: 'section' },
              React.createElement('div', { className: 'section__title' }, 'Топ по связям'),
              React.createElement('div', { className: 'rank-list' },
                topConnected.map(function(item, i) {
                  return React.createElement('button', { key: item.node.id, className: 'rank-item', onClick: function() { gotoDomainByDomainId(item.node.data.domainId); }, title: item.node.data.domainId },
                    React.createElement('span', { className: 'rank-item__num' }, i + 1),
                    React.createElement('span', { className: 'rank-item__label' }, item.node.data.domainId),
                    React.createElement('span', { className: 'rank-item__value' }, item.degree)
                  );
                })
              )
            ),
            bookmarks.size > 0 && React.createElement('div', { className: 'section' },
              React.createElement('div', { className: 'section__title' }, 'Избранное (' + bookmarks.size + ')'),
              React.createElement('div', { className: 'rank-list' },
                Array.from(bookmarks).slice(0, 15).map(function(id) {
                  var n = nodes.find(function(x) { return x.id === id; });
                  if (!n) return null;
                  return React.createElement('button', {
                    key: id,
                    className: 'rank-item',
                    onClick: function() { gotoDomainByDomainId(n.data.domainId); },
                    title: n.data.domainId
                  },
                    React.createElement('span', { className: 'rank-item__num' }, '★'),
                    React.createElement('span', { className: 'rank-item__label' }, n.data.domainId),
                    React.createElement('button', {
                      className: 'rank-item__value',
                      style: { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-500)' },
                      onClick: function(ev) { ev.stopPropagation(); toggleBookmark(id); },
                      title: 'Убрать из избранного'
                    }, '✕')
                  );
                })
              )
            ),
            // Worst health
            worstHealth.length > 0 && React.createElement('div', { className: 'section' },
              React.createElement('div', { className: 'section__title' }, 'Стена позора (health)'),
              React.createElement('div', { className: 'rank-list' },
                worstHealth.map(function(item, i) {
                  var hc = item.health >= 80 ? 'health-good' : item.health >= 50 ? 'health-mid' : 'health-bad';
                  return React.createElement('button', { key: item.node.id, className: 'rank-item', onClick: function() { gotoDomainByDomainId(item.node.data.domainId); }, title: item.node.data.domainId },
                    React.createElement('span', { className: 'rank-item__num' }, i + 1),
                    React.createElement('span', { className: 'rank-item__label' }, item.node.data.domainId),
                    React.createElement('span', { className: 'details__badge details__badge--' + hc, style: { fontSize: 10, padding: '1px 6px' } }, item.health)
                  );
                })
              )
            ),
            // Namespaces
            namespaces.length > 0 && React.createElement('div', { className: 'section' },
              React.createElement('div', { className: 'section__title' }, 'Неймспейсы'),
              React.createElement('div', { className: 'bar-list', style: { maxHeight: 240, overflowY: 'auto' } },
                namespaces.map(function(entry) {
                  var ns = entry[0], count = entry[1];
                  var max = namespaces[0][1];
                  return React.createElement('button', { key: ns, className: 'bar-item', onClick: function() { setNamespaceFilter(ns); }, title: 'Показать ' + ns },
                    React.createElement('span', { className: 'bar-item__label' }, ns),
                    React.createElement('span', { className: 'bar-item__value' }, count),
                    React.createElement('span', { className: 'bar-item__track' }, React.createElement('span', { className: 'bar-item__fill', style: { width: (count / max * 100) + '%' } }))
                  );
                })
              )
            ),
            // Tags
            tagCloud.length > 0 && React.createElement('div', { className: 'section' },
              React.createElement('div', { className: 'section__title' }, 'Теги'),
              React.createElement('div', { className: 'tag-cloud' },
                tagCloud.map(function(entry) {
                  var tag = entry[0], count = entry[1];
                  return React.createElement('button', { key: tag, className: 'tag', onClick: function() { setSearchQuery(tag); openSearch(); }, title: tag + ' (' + count + ')' },
                    tag, React.createElement('span', { className: 'tag__count' }, count)
                  );
                })
              )
            ),
            // Legend
            React.createElement('div', { className: 'section' },
              React.createElement('div', { className: 'section__title' }, 'Легенда'),
              React.createElement('div', { className: 'legend-row' }, React.createElement('span', { className: 'legend-dot', style: { background: 'var(--success)' } }), 'Domain'),
              React.createElement('div', { className: 'legend-row' }, React.createElement('span', { className: 'legend-dot', style: { background: 'var(--warning)' } }), 'Missing'),
              React.createElement('div', { className: 'legend-row' }, React.createElement('span', { className: 'legend-dot', style: { background: 'var(--danger)' } }), 'Broken'),
              React.createElement('div', { className: 'legend-row' }, React.createElement('span', { className: 'legend-line', style: { background: LINKAGE_COLOR } }), 'Linkage'),
              React.createElement('div', { className: 'legend-row' }, React.createElement('span', { className: 'legend-line', style: { background: FQID_COLOR } }), 'FQID')
            )
          )
        )
    ),
    React.createElement('main', { className: 'main' },
      React.createElement('div', { className: 'toolbar' },
      
        React.createElement('div', { className: 'toolbar__group' },
          React.createElement('button', { className: 'btn btn--icon', onClick: function() { rfInstance.current && rfInstance.current.fitView({ duration: 500 }); }, title: 'Вписать (F)' }, '⛶'),
          React.createElement('button', { className: 'btn btn--icon', onClick: function() { setNodes(runLayout(nodes, edges, layoutType)); setTimeout(function() { rfInstance.current && rfInstance.current.fitView({ duration: 500 }); }, 100); }, title: 'Переуложить' }, '⟳'),
          React.createElement('button', { className: 'btn btn--icon', onClick: navBack, disabled: navStack.index <= 0, style: { opacity: navStack.index <= 0 ? 0.4 : 1 }, title: 'Назад (Alt+←)' }, '←'),
          React.createElement('button', { className: 'btn btn--icon', onClick: navForward, disabled: navStack.index >= navStack.items.length - 1, style: { opacity: navStack.index >= navStack.items.length - 1 ? 0.4 : 1 }, title: 'Вперёд (Alt+→)' }, '→')
        ),
      
        React.createElement('button', { className: 'btn', onClick: openSearch, title: 'Поиск (Shift+Tab)' },
          React.createElement('span', { className: 'btn__icon' }, '🔍'),
          'Поиск',
          React.createElement('kbd', { className: 'btn-kbd' }, '⇧ Tab')
        ),
      
        React.createElement(Popover, {
          width: 320,
          trigger: function(open) {
            return React.createElement('button', { className: 'btn' + (open ? ' btn--active' : '') },
              React.createElement('span', { className: 'btn__icon' }, '⚙️'),
              'Фильтры',
              activeFiltersCount > 0 && React.createElement('span', { className: 'btn__badge' }, activeFiltersCount)
            );
          }
        }, function() {
          return React.createElement(FilterMenu, {
            filters: filters, setFilters: setFilters, counts: counts,
            namespaceFilter: namespaceFilter, setNamespaceFilter: setNamespaceFilter,
            bookmarksOnly: bookmarksOnly, setBookmarksOnly: setBookmarksOnly,
            onlyInvalid: onlyInvalid, setOnlyInvalid: setOnlyInvalid,
            isolatedOnly: isolatedOnly, setIsolatedOnly: setIsolatedOnly,
            tooltipsEnabled: tooltipsEnabled, setTooltipsEnabled: setTooltipsEnabled
          });
        }),
      
        React.createElement(Popover, {
          width: 280,
          trigger: function(open) {
            var active = open || cycleHighlight || isolatedOnly || nsMode || focusNode;
            return React.createElement('button', { className: 'btn' + (active ? ' btn--active' : '') },
              React.createElement('span', { className: 'btn__icon' }, '📊'),
              'Анализ'
            );
          }
        }, function(close) {
          return React.createElement(AnalysisMenu, {
            cycleHighlight: cycleHighlight, handleFindCycles: handleFindCycles,
            isolatedOnly: isolatedOnly, setIsolatedOnly: setIsolatedOnly,
            nsMode: nsMode, setNsMode: setNsMode,
            focusDepth: focusDepth, setFocusDepth: setFocusDepth,
            focusNode: focusNode, clearFocus: function() { setFocusNode(null); },
            onOpenTopo: function() { setTopoOpen(true); },
            close: close
          });
        }),
      
        React.createElement(Popover, {
          width: 300,
          trigger: function(open) {
            return React.createElement('button', { className: 'btn' + (open ? ' btn--active' : '') },
              React.createElement('span', { className: 'btn__icon' }, '🎨'),
              'Вид'
            );
          }
        }, function(close) {
          return React.createElement(ViewMenu, {
            layoutType: layoutType, setLayoutType: setLayoutType,
            compact: compact, setCompact: setCompact,
            showGroups: showGroups, setShowGroups: setShowGroups,
            bidirectional: bidirectional, setBidirectional: setBidirectional,
            showEdgeLabels: showEdgeLabels, setShowEdgeLabels: setShowEdgeLabels,
            heatmap: heatmap, setHeatmap: setHeatmap,
            theme: theme, setTheme: setTheme,
            close: close
          });
        }),
      
        React.createElement(Popover, {
          width: 260,
          trigger: function(open) {
            return React.createElement('button', { className: 'btn' + (open || diffMode ? ' btn--active' : '') },
              React.createElement('span', { className: 'btn__icon' }, '💾'),
              'Данные'
            );
          }
        }, function(close) {
          return React.createElement(DataMenu, {
            handleExportJSON: handleExportJSON,
            handleExportMarkdown: handleExportMarkdown,
            handleExportPNG: handleExportPNG,
            snapshotInputRef: snapshotInputRef,
            handleSnapshotUpload: handleSnapshotUpload,
            diffMode: diffMode, setDiffMode: setDiffMode,
            validationAvailable: validationAvailable,
            onOpenValidation: function() { setValidationOpen(true); },
            close: close
          });
        }),
      
        React.createElement('div', { className: 'toolbar__spacer' }),
      
        React.createElement('button', {
          className: 'btn btn--icon',
          onClick: function() { setHotkeysOpen(true); },
          title: 'Горячие клавиши (?)'
        }, '⌨️'),

        React.createElement('button', {
          className: 'btn btn--icon',
          onClick: function() { setHelpOpen(true); },
          title: 'Руководство пользователя (F1)'
        }, '📖'),
      
        React.createElement('div', { className: 'toolbar__stats' },
          visibleNodes.length + ' / ' + nodes.length + ' узлов · ' + visibleEdges.length + ' / ' + edges.length + ' связей'
        )
      ),
      React.createElement(ActiveModesBar, { modes: activeModes }),
      React.createElement('div', { className: 'graph-container' + (showEdgeLabels ? ' show-labels' : '') },
        React.createElement(ReactFlowProvider, null,
          React.createElement(ReactFlowInner, {
            nodes: visibleNodes,
            edges: displayEdges,
            onNodesChange: onNodesChange,
            onEdgesChange: onEdgesChange,
            onEdgeClick: handleEdgeClick,
            onNodeClick: handleNodeClick,
            onNodeDoubleClick: handleNodeDoubleClick,
            onNodeContextMenu: handleNodeContextMenu,
            onNodeMouseEnter: handleNodeMouseEnter,
            onNodeMouseLeave: scheduleHide,
            onEdgeMouseEnter: handleEdgeMouseEnter,
            onEdgeMouseLeave: scheduleHide,
            onPaneClick: handlePaneClick,
            onPaneContextMenu: handlePaneContextMenu,
            setRfInstance: function(rf) { rfInstance.current = rf; },
            readOnly: nsMode,
            perfMode: perfMode,
          }),
          showGroups && React.createElement(GroupsOverlay, { nodes: visibleNodes, enabled: showGroups })
        ),
        visibleNodes.length === 0 && React.createElement('div', { className: 'empty-state' },
          React.createElement('div', { className: 'empty-state__title' }, 'Ничего не найдено'),
          React.createElement('div', { className: 'empty-state__text' }, 'Измените фильтры')
        ),
        React.createElement(SidePanel, {
          open: panelOpen, tab: panelTab, setTab: setPanelTab,
          node: panelNode,
          edge: panelEdge,
          filePath: editorFilePath,
          pendingFile: pendingFile,
          editorRef: editorRef,
          onClose: closePanel,
          allNodes: nodes, allEdges: edges,
          onGotoDomain: gotoDomainByDomainId,
          onOpenFile: function(p) { openFileInEditor(p); },
          ruleViolations: ruleViolations
        }),
        heatmap !== 'none' && heatmapValues && React.createElement('div', { className: 'heat-legend' },
          React.createElement('div', { className: 'heat-legend__title' }, 'Heatmap: ' + heatmapValues.scheme.label),
          React.createElement('div', { className: 'heat-legend__bar' }),
          React.createElement('div', { className: 'heat-legend__labels' },
            React.createElement('span', null, heatmapValues.min),
            React.createElement('span', null, heatmapValues.max)
          ),
          React.createElement('button', { className: 'heat-legend__close', onClick: function() { setHeatmap('none'); } }, '✕')
        )
      )
    ),
    React.createElement(HoverTooltip, { tooltip: tooltip, onHide: scheduleHide }),
    React.createElement(SearchModal, {
      open: searchOpen, query: searchQuery, setQuery: setSearchQuery,
      results: searchResults,  commands: commands, index: searchIndex, setIndex: setSearchIndex,
      onSelect: function(domainId) { gotoDomainByDomainId(domainId); closeSearch(); },
      onClose: closeSearch, inputRef: searchInputRef
    }),
    React.createElement(HelpModal, {
      open: helpOpen,
      onClose: function() { setHelpOpen(false); }
    }),
    React.createElement(HotkeysModal, {
      open: hotkeysOpen,
      onClose: function() { setHotkeysOpen(false); }
    }),
    React.createElement(ValidationModal, {
      open: validationOpen,
      onClose: function() { setValidationOpen(false); },
      allDomains: allDomainsList,
      visibleDomains: visibleDomainsList,
      bookmarkedDomains: bookmarkedDomainsList,
      onGotoDomain: gotoDomainByDomainId,
      onResults: handleValidationResults
    }),
    React.createElement(TopoSortModal, {
      open: topoOpen,
      onClose: function() { setTopoOpen(false); },
      allNodes: nodes,
      allEdges: edges,
      allDomains: allDomainsList,
      visibleDomains: visibleDomainsList,
      bookmarkedDomains: bookmarkedDomainsList,
      onGotoDomain: gotoDomainByDomainId,
      onApplyLevels: function(levelMap) { setTopoLevelMap(levelMap); }
    }),
    React.createElement(ContextMenu, { menu: contextMenu, onClose: function() { setContextMenu(null); }, onAction: handleContextAction }),
    toastVisible && REMOTE_INFO && REMOTE_INFO.fromCache && React.createElement(Toast, {
      message: '📦 Граф построен из <b>кэша</b>'
        + (REMOTE_INFO.fetchedAt ? ' (от ' + new Date(REMOTE_INFO.fetchedAt).toLocaleString('ru-RU') + ')' : '')
        + '. Данные могут быть устаревшими.',
      actions: REFRESH_COMMAND ? [{ command: REFRESH_COMMAND }] : [],
      duration: 30000,
      onClose: function() { setToastVisible(false); }
    })
  );
}

var root = createRoot(document.getElementById('root'));
root.render(React.createElement(App));
</script>
</body>
</html>`;
  }
}

let __mainCalled = false;
// --- CLI ---
async function main() {
  if (__mainCalled) return;
  __mainCalled = true;

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

    if (!username || !password) {
      console.error('❌ Для режима --server требуются --login и --password');
      process.exit(1);
    }

    const base = server.replace(/\/+$/, '');
    remoteCredentials = {
      server: base,
      loginUrl: base + '/api/evo/core/bff/graphql',
      apiUrl: base + '/api/graphql',
      tenantId: '00000000-0000-0000-0000-000000000000',
      token: null,               // получим лениво
      username: username,
      password: password,
      secure: !!args.flags.secure
    };

    try {
      const result = await prepareRemoteCache(server, username, password, {
        refresh: !!args.flags.refresh,
        resetCache: !!args.flags['reset-cache'],
        secure: !!args.flags.secure
      });
      rootDir = result.cacheDir;
      remoteInfo = result;
    } catch (err) {
      console.error('❌ Ошибка загрузки: ' + err.message);
      process.exit(1);
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