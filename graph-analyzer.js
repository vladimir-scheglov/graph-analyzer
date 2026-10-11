// graph-analyzer.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const http = require('http');

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

  startServer(port = 3000) {
    const graphData = this.analyze();
    const server = http.createServer((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.generateHTML(graphData));
      } else if (req.url.startsWith('/file')) {
        this.handleFileRequest(req, res);
      } else {
        res.writeHead(404); res.end('Not found');
      }
    });
    server.listen(port, () => {
      console.log(`${String.fromCharCode(10)}🚀 Graph server: http://localhost:${port}`);
      console.log(`   Domains: ${graphData.domainCount}`);
      console.log(`   Links: ${graphData.linkCount}`);
      console.log(`   Missing: ${graphData.missingCount}`);
      console.log(`   Broken: ${graphData.brokenCount}\n`);
    });
    return server;
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

  generateHTML(graphData) {
    const graphDataJson = JSON.stringify(graphData).replace(/<\/script>/g, '<\\/script>');

    return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Domain Graph Analyzer</title>
<link rel="stylesheet" href="https://unpkg.com/reactflow@11.11.4/dist/style.css" />
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --bg-900: #0a0e1a;
  --bg-850: #0d1424;
  --bg-800: #111827;
  --bg-750: #1a2233;
  --bg-700: #1e293b;
  --bg-600: #293548;
  --border: #1e293b;
  --border-hover: #334155;
  --text-100: #f1f5f9;
  --text-200: #e2e8f0;
  --text-400: #94a3b8;
  --text-500: #64748b;
  --accent: #6366f1;
  --accent-hover: #818cf8;
  --success: #10b981;
  --warning: #f59e0b;
  --danger: #ef4444;
}
html, body, #root { width: 100%; height: 100%; overflow: hidden; }
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-900);
  color: var(--text-100);
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}
.app { display: flex; width: 100vw; height: 100vh; }

/* Sidebar */
.sidebar {
  width: 320px;
  background: var(--bg-850);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
}
.sidebar__header {
  padding: 20px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 12px;
  background: linear-gradient(135deg, rgba(99,102,241,0.1), transparent);
}
.sidebar__logo {
  width: 40px; height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--accent), #8b5cf6);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
  box-shadow: 0 4px 12px rgba(99,102,241,0.4);
}
.sidebar__title { font-size: 16px; font-weight: 700; letter-spacing: -0.3px; }
.sidebar__subtitle { font-size: 11px; color: var(--text-500); text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
.sidebar__body { flex: 1; overflow-y: auto; padding: 20px; }
.sidebar__body::-webkit-scrollbar { width: 6px; }
.sidebar__body::-webkit-scrollbar-thumb { background: var(--bg-600); border-radius: 3px; }

.section { margin-bottom: 24px; }
.section__title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-500);
  margin-bottom: 12px;
}

.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.stat-card {
  background: var(--bg-800);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  transition: all 0.2s;
}
.stat-card:hover { border-color: var(--border-hover); transform: translateY(-1px); }
.stat-card__value { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
.stat-card__label { font-size: 11px; color: var(--text-500); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
.stat-card--success .stat-card__value { color: var(--success); }
.stat-card--warning .stat-card__value { color: var(--warning); }
.stat-card--danger .stat-card__value { color: var(--danger); }
.stat-card--accent .stat-card__value { color: var(--accent-hover); }

.toggle-list { display: flex; flex-direction: column; gap: 6px; }
.toggle-btn {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg-800);
  border: 1px solid var(--border);
  color: var(--text-400);
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  text-align: left;
  transition: all 0.2s;
  width: 100%;
}
.toggle-btn:hover { border-color: var(--border-hover); color: var(--text-200); }
.toggle-btn.active { background: var(--bg-700); border-color: var(--accent); color: var(--text-100); }
.toggle-btn__dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.toggle-btn__dot--domain { background: var(--success); }
.toggle-btn__dot--missing { background: var(--warning); }
.toggle-btn__dot--broken { background: var(--danger); }
.toggle-btn__count { margin-left: auto; font-size: 11px; color: var(--text-500); }

.input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg-800);
  border: 1px solid var(--border);
  color: var(--text-100);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: all 0.2s;
}
.input::placeholder { color: var(--text-500); }
.input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
.hint { font-size: 11px; color: var(--text-500); margin-top: 8px; line-height: 1.5; }
.hint code { background: var(--bg-700); padding: 1px 5px; border-radius: 4px; font-size: 10px; color: var(--accent-hover); }

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
}
.toolbar__group { display: flex; gap: 4px; background: var(--bg-800); border-radius: 8px; padding: 3px; border: 1px solid var(--border); }
.toolbar__spacer { flex: 1; }
.toolbar__title { font-weight: 600; font-size: 14px; color: var(--text-200); }
.toolbar__stats { color: var(--text-500); font-size: 12px; }

.btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 14px;
  border-radius: 7px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-200);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
  font-weight: 500;
}
.btn:hover { background: var(--bg-700); color: var(--text-100); }
.btn--primary { background: var(--accent); color: white; }
.btn--primary:hover { background: var(--accent-hover); }
.btn--icon { padding: 8px; }

.graph-container { flex: 1; position: relative; background: var(--bg-900); }
.react-flow__attribution { display: none; }

/* ReactFlow customization */
.react-flow__background { background: var(--bg-900); }
.react-flow__minimap { background: var(--bg-800) !important; border: 1px solid var(--border); border-radius: 8px; }
.react-flow__minimap-mask { fill: rgba(99,102,241,0.15); }
.react-flow__controls {
  background: var(--bg-800) !important;
  border: 1px solid var(--border) !important;
  border-radius: 8px !important;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
  overflow: hidden;
}
.react-flow__controls-button {
  background: transparent !important;
  border: none !important;
  border-bottom: 1px solid var(--border) !important;
  color: var(--text-200) !important;
  fill: var(--text-200) !important;
  transition: background 0.15s;
}
.react-flow__controls-button:last-child { border-bottom: none !important; }
.react-flow__controls-button:hover { background: var(--bg-700) !important; }
.react-flow__controls-button svg { fill: var(--text-200) !important; }
.react-flow__edge-path { stroke-width: 1.5; }
.react-flow__edge.selected .react-flow__edge-path { stroke-width: 3; }
.react-flow__edge-text {
  fill: var(--text-200);
  font-size: 10px;
  font-family: inherit;
  font-weight: 500;
}
.react-flow__edge-textbg {
  fill: var(--bg-850) !important;
  stroke: var(--border);
  stroke-width: 1;
}
.react-flow__edge.selected .react-flow__edge-path { stroke: var(--accent-hover); }
.react-flow__edge:hover .react-flow__edge-path { stroke: var(--accent-hover); }

/* Custom node */
.rf-node {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--bg-800);
  border: 1.5px solid var(--border);
  transition: all 0.2s;
  cursor: pointer;
  overflow: hidden;
}
.rf-node:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}
.rf-node--domain { border-left: 3px solid var(--success); }
.rf-node--missing { border-left: 3px solid var(--warning); }
.rf-node--broken { border-left: 3px solid var(--danger); }
.rf-node--selected { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(99,102,241,0.3); }
.rf-node__icon {
  width: 26px; height: 26px;
  border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}
.rf-node--domain .rf-node__icon { background: rgba(16,185,129,0.15); color: var(--success); }
.rf-node--missing .rf-node__icon { background: rgba(245,158,11,0.15); color: var(--warning); }
.rf-node--broken .rf-node__icon { background: rgba(239,68,68,0.15); color: var(--danger); }
.rf-node__content { flex: 1; min-width: 0; }
.rf-node__id { font-size: 12px; font-weight: 600; color: var(--text-100); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rf-node__name { font-size: 10px; color: var(--text-500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.rf-handle {
  width: 6px !important; height: 6px !important;
  background: var(--bg-600) !important;
  border: 1.5px solid var(--bg-850) !important;
}

/* Editor panel */
.editor-panel {
  position: absolute;
  right: 0; top: 0; bottom: 0;
  width: 50%;
  max-width: 800px;
  background: var(--bg-850);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  z-index: 20;
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: -20px 0 40px rgba(0,0,0,0.4);
}
.editor-panel.open { transform: translateX(0); }
.editor-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  gap: 12px;
  background: var(--bg-800);
  flex-shrink: 0;
}
.editor-panel__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-200);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.editor-panel__path { font-size: 11px; color: var(--text-500); margin-top: 2px; }
.editor-panel__body { flex: 1; min-height: 0; }

/* Tooltip */
.tooltip {
  position: fixed;
  z-index: 1000;
  background: var(--bg-800);
  border: 1px solid var(--border-hover);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.6);
  padding: 0;
  max-width: 480px;
  max-height: 500px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: var(--text-200);
  pointer-events: auto;
}
.tooltip__header {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
  font-size: 13px;
  color: var(--text-100);
  background: var(--bg-750);
  flex-shrink: 0;
}
.tooltip__body { padding: 12px 14px; overflow-y: auto; flex: 1; }
.tooltip__body::-webkit-scrollbar { width: 6px; }
.tooltip__body::-webkit-scrollbar-thumb { background: var(--bg-600); border-radius: 3px; }
.tooltip__row { display: flex; gap: 8px; margin-bottom: 6px; font-size: 12px; }
.tooltip__label { color: var(--text-500); min-width: 70px; }
.tooltip__value { color: var(--text-200); word-break: break-all; }
.tooltip__ref {
  margin-bottom: 6px;
  padding: 8px 10px;
  background: var(--bg-750);
  border-radius: 6px;
  border-left: 2px solid var(--accent);
}
.tooltip__fqid { font-family: 'JetBrains Mono', 'SF Mono', monospace; font-size: 11px; color: var(--accent-hover); margin-bottom: 4px; word-break: break-all; }
.tooltip__path { font-size: 10px; color: var(--text-500); font-family: monospace; margin-bottom: 6px; word-break: break-all; }
.tooltip__btn {
  font-size: 10px;
  padding: 4px 8px;
  background: var(--bg-700);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-300);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.tooltip__btn:hover { background: var(--accent); color: white; border-color: var(--accent); }

.fqid-highlight { background: rgba(99,102,241,0.15); }
.fqid-highlight-line { background: rgba(99,102,241,0.4); }

/* Empty state */
.empty-state {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: var(--text-500);
  pointer-events: none;
}
.empty-state__title { font-size: 16px; color: var(--text-400); margin-bottom: 6px; }
.empty-state__text { font-size: 13px; }

/* Loading */
.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(10,14,26,0.9);
  backdrop-filter: blur(4px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  z-index: 100;
}
.spinner {
  width: 40px; height: 40px;
  border: 3px solid var(--bg-700);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-overlay__text { color: var(--text-400); font-size: 13px; }
.rf-node--dimmed { opacity: 0.4; }
.js-goto-domain {
  transition: color 0.15s, background 0.15s;
  border-radius: 3px;
  padding: 0 2px;
}
.js-goto-domain:hover {
  background: rgba(99,102,241,0.15);
  color: #c7d2fe !important;
}
.tooltip__fqid.js-goto-domain:hover {
  text-decoration: underline;
}
/* --- Search modal --- */
.search-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10,14,26,0.7);
  backdrop-filter: blur(6px);
  z-index: 300;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  animation: searchFadeIn 0.15s ease;
}
@keyframes searchFadeIn { from { opacity: 0; } to { opacity: 1; } }

.search-modal {
  width: 580px;
  max-width: 90vw;
  background: var(--bg-800);
  border: 1px solid var(--border-hover);
  border-radius: 14px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.6);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: searchSlideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes searchSlideDown {
  from { opacity: 0; transform: translateY(-20px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.search-modal__input-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}
.search-modal__icon { font-size: 16px; color: var(--text-500); }
.search-modal__input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-100);
  font-size: 15px;
  font-family: inherit;
}
.search-modal__input::placeholder { color: var(--text-500); }

.search-modal__kbd,
.btn-kbd,
.search-modal__footer kbd {
  display: inline-block;
  padding: 2px 6px;
  background: var(--bg-700);
  border: 1px solid var(--border-hover);
  border-radius: 4px;
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-400);
  font-weight: 600;
}
.btn-kbd { margin-left: 4px; }

.search-modal__results {
  max-height: 50vh;
  overflow-y: auto;
  padding: 8px;
}
.search-modal__results::-webkit-scrollbar { width: 6px; }
.search-modal__results::-webkit-scrollbar-thumb { background: var(--bg-600); border-radius: 3px; }

.search-modal__hint {
  padding: 24px;
  text-align: center;
  color: var(--text-500);
  font-size: 13px;
}

.search-result {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.1s;
}
.search-result:hover,
.search-result.active {
  background: var(--bg-700);
}
.search-result__dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.search-result__dot--domain { background: var(--success); }
.search-result__dot--missing { background: var(--warning); }
.search-result__dot--broken { background: var(--danger); }
.search-result__content { flex: 1; min-width: 0; }
.search-result__id {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-100);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.search-result__label {
  font-size: 11px;
  color: var(--text-500);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.search-modal__footer {
  display: flex;
  gap: 16px;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg-850);
  font-size: 11px;
  color: var(--text-500);
}
.search-modal__footer span { display: flex; align-items: center; gap: 4px; }
.search-result__desc {
  font-size: 11px;
  color: var(--text-500);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.search-result__tags {
  display: flex;
  gap: 4px;
  margin-top: 4px;
  flex-wrap: wrap;
}
.search-result__tag {
  display: inline-block;
  padding: 1px 6px;
  background: var(--bg-700);
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 10px;
  color: var(--text-400);
}
.search-result__badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 5px;
  background: rgba(99,102,241,0.2);
  border: 1px solid rgba(99,102,241,0.4);
  border-radius: 4px;
  font-size: 9px;
  color: var(--accent-hover);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  vertical-align: middle;
}
.search-hl {
  background: rgba(251,191,36,0.25);
  color: #fde68a;
  border-radius: 2px;
  padding: 0 1px;
}
.toolbar__filter {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-800);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 8px 4px 10px;
  flex: 1;
  max-width: 420px;
  position: relative;
  transition: border-color 0.15s;
}
.toolbar__filter:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
}
.toolbar__filter-icon {
  font-size: 12px;
  color: var(--text-500);
  flex-shrink: 0;
}
.toolbar__filter-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-100);
  font-size: 12px;
  font-family: inherit;
  min-width: 0;
}
.toolbar__filter-input::placeholder { color: var(--text-500); }

.toolbar__filter-clear {
  background: transparent;
  border: none;
  color: var(--text-500);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 4px;
  transition: all 0.15s;
}
.toolbar__filter-clear:hover { background: var(--bg-700); color: var(--text-200); }

.toolbar__filter-help {
  position: relative;
  flex-shrink: 0;
}
.toolbar__filter-help-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--bg-700);
  color: var(--text-400);
  font-size: 11px;
  font-weight: 700;
  cursor: help;
  user-select: none;
  transition: all 0.15s;
}
.toolbar__filter-help:hover .toolbar__filter-help-icon {
  background: var(--accent);
  color: white;
}

.toolbar__filter-tooltip {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 340px;
  background: var(--bg-800);
  border: 1px solid var(--border-hover);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5);
  padding: 12px 14px;
  font-size: 12px;
  color: var(--text-200);
  z-index: 100;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: all 0.15s ease;
  pointer-events: none;
}
.toolbar__filter-help:hover .toolbar__filter-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
  pointer-events: auto;
}
.toolbar__filter-tooltip-title {
  font-weight: 700;
  font-size: 11px;
  color: var(--text-500);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 10px;
}
.toolbar__filter-tooltip-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}
.toolbar__filter-tooltip-row:last-child { border-bottom: none; }
.toolbar__filter-tooltip-row code {
  flex-shrink: 0;
  min-width: 130px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  color: var(--accent-hover);
  background: var(--bg-750);
  padding: 2px 6px;
  border-radius: 4px;
  word-break: break-all;
}
.toolbar__filter-tooltip-row span {
  font-size: 11px;
  color: var(--text-400);
  line-height: 1.5;
}
.toolbar__filter-tooltip-row b {
  color: var(--text-200);
  background: var(--bg-700);
  padding: 0 4px;
  border-radius: 3px;
  font-weight: 600;
}
/* --- Toolbar chips --- */
.toolbar__chips {
  display: flex;
  gap: 4px;
  background: var(--bg-800);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 3px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text-500);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
  font-weight: 500;
}
.chip:hover { background: var(--bg-700); color: var(--text-300); }
.chip--active {
  background: var(--bg-750);
  border-color: var(--border-hover);
  color: var(--text-100);
}
.chip__dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; opacity: 0.5; }
.chip--active .chip__dot { opacity: 1; }
.chip__count {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  background: var(--bg-700);
  border-radius: 8px;
  color: var(--text-400);
}
.chip--active .chip__count { background: rgba(99,102,241,0.2); color: var(--accent-hover); }

/* --- Collapsible sidebar --- */
.sidebar {
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.sidebar--collapsed {
  width: 44px;
  min-width: 44px;
}
.sidebar__expand,
.sidebar__collapse {
  background: transparent;
  border: none;
  color: var(--text-400);
  cursor: pointer;
  font-size: 16px;
  padding: 6px 8px;
  border-radius: 6px;
  transition: all 0.15s;
  font-family: inherit;
}
.sidebar__expand {
  width: 100%;
  height: 48px;
  font-size: 18px;
}
.sidebar__expand:hover,
.sidebar__collapse:hover {
  background: var(--bg-700);
  color: var(--accent-hover);
}

/* --- Mini-stats --- */
.mini-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.mini-stat {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  background: var(--bg-800);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.mini-stat__label { font-size: 11px; color: var(--text-500); }
.mini-stat__value { font-size: 13px; font-weight: 700; color: var(--text-100); }

/* --- Rank list --- */
.rank-list { display: flex; flex-direction: column; gap: 2px; }
.rank-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  color: var(--text-300);
  font-size: 12px;
  text-align: left;
  transition: background 0.15s;
  width: 100%;
}
.rank-item:hover { background: var(--bg-800); color: var(--text-100); }
.rank-item__num {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-700);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-500);
  flex-shrink: 0;
}
.rank-item__label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
}
.rank-item__value {
  font-size: 11px;
  font-weight: 700;
  color: var(--accent-hover);
  flex-shrink: 0;
}

/* --- Bar list (namespaces) --- */
.bar-list { display: flex; flex-direction: column; gap: 4px; }
.bar-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 8px;
  background: transparent;
  border: none;
  padding: 4px 0;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  color: var(--text-300);
  font-size: 12px;
  transition: color 0.15s;
}
.bar-item:hover { color: var(--accent-hover); }
.bar-item__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
}
.bar-item__value { font-weight: 700; color: var(--text-400); font-size: 11px; }
.bar-item__track {
  grid-column: 1 / -1;
  height: 3px;
  background: var(--bg-700);
  border-radius: 2px;
  overflow: hidden;
}
.bar-item__fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--accent), #8b5cf6);
  border-radius: 2px;
  transition: width 0.3s;
}

/* --- Tag cloud --- */
.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  background: var(--bg-800);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text-400);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
}
.tag:hover {
  background: var(--bg-700);
  border-color: var(--accent);
  color: var(--accent-hover);
}
.tag__count {
  font-size: 9px;
  padding: 0 4px;
  background: var(--bg-700);
  border-radius: 6px;
  color: var(--text-500);
  font-weight: 700;
}
.tag:hover .tag__count { background: rgba(99,102,241,0.25); color: var(--accent-hover); }

/* --- Legend rows --- */
.legend-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  font-size: 12px;
  color: var(--text-400);
}
.legend-dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
}
.legend-line {
  width: 16px; height: 2px; flex-shrink: 0; border-radius: 1px;
}
</style>
</head>
<body>
<div id="root"></div>
<script id="graph-data" type="application/json">${graphDataJson}</script>
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
<script type="text/babel" data-type="module" data-presets="react">
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import ReactFlowComponent, {
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  useReactFlow
} from 'reactflow';
import dagre from 'dagre';

// --- Data ---
const GRAPH_DATA = JSON.parse(document.getElementById('graph-data').textContent);

// --- Constants ---
const NODE_WIDTH = 220;
const NODE_HEIGHT = 60;
const EDGE_COLOR = '#10b981';

// --- Dagre layout ---
function layoutGraph(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'LR',
    nodesep: 30,
    ranksep: 100,
    edgesep: 20,
    marginx: 40,
    marginy: 40,
    ranker: 'network-simplex'
  });
  nodes.forEach(n => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach(e => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map(n => {
    const pos = g.node(n.id);
    return {
      ...n,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      targetPosition: 'left',
      sourcePosition: 'right'
    };
  });
}

// --- Convert to ReactFlow format ---
function toReactFlow(graphData) {
  const nodes = graphData.nodes.map(n => {
    const domainId = n.domainId || n.id.replace(/^(domain_|missing_|broken_)/, '');
    return {
      id: n.id,
      type: 'domainNode',
      data: {
        domainId,
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

  const edges = graphData.edges.map(e => {
    const isLinkage = e.kind === 'linkage';
    const isFqid = e.kind === 'fqid';
  
    const base = {
      id: e.id,
      source: e.from,
      target: e.to,
      label: e.label,
      data: {
        tooltipHtml: e.title,
        fqidRefs: e.fqidRefs || [],
        linkData: e.linkData || null,
        fullLabel: e.fullLabel || e.label || e.id,
        kind: e.kind,
        // Новые поля:
        side1Domain: e.side1Domain || null,
        side2Domain: e.side2Domain || null,
        side1Raw: e.side1Raw || null,
        side2Raw: e.side2Raw || null
      }
    };
  
    if (isLinkage) {
      return {
        ...base,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#818cf8', width: 16, height: 16 },
        style: { stroke: '#818cf8', strokeWidth: 2.5, strokeDasharray: '6 4' },
        labelStyle: { fill: '#c7d2fe', fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: '#1e1b4b', fillOpacity: 0.95 },
        labelBgPadding: [5, 3],
        labelBgBorderRadius: 4
      };
    }
  
    return {
      ...base,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981', width: 12, height: 12 },
      style: { stroke: '#10b981', strokeWidth: 1.2, opacity: 0.7 },
      labelStyle: { fill: '#a7f3d0', fontSize: 9, fontWeight: 400 },
      labelBgStyle: { fill: '#052e2b', fillOpacity: 0.9 },
      labelBgPadding: [3, 2],
      labelBgBorderRadius: 3
    };
  });

  return { nodes: layoutGraph(nodes, edges), edges };
}

// --- Filter helpers ---
function matchesNamespace(domainId, filterPattern) {
  if (!filterPattern || filterPattern.trim() === '') return true;

  // Разбиваем по запятой, точке с запятой или пробелу
  const tokens = filterPattern
    .replace(/[,;]/g, ' ')
    .split(' ')
    .filter(p => p.length > 0)
    .map(p => p.toLowerCase());

  if (tokens.length === 0) return true;

  const id = domainId.toLowerCase();

  // Разделяем на включающие и исключающие маски
  const include = tokens.filter(t => !t.startsWith('!'));
  const exclude = tokens.filter(t => t.startsWith('!')).map(t => t.slice(1)).filter(t => t.length > 0);

  // Исключающие имеют приоритет: если домен подходит под исключение — отбрасываем
  for (const ex of exclude) {
    if (simplePatternMatch(id, ex)) return false;
  }

  // Если нет ни одной включающей маски, но есть исключающие — показываем всё, кроме исключённого
  if (include.length === 0) return true;

  // Иначе домен должен матчиться хотя бы одной включающей маской
  return include.some(inc => simplePatternMatch(id, inc));
}

function simplePatternMatch(domainId, pattern) {
  if (pattern.indexOf('*') !== -1) {
    const parts = pattern.split('*');
    if (parts[0] && domainId.indexOf(parts[0]) !== 0) return false;
    if (parts[parts.length - 1]) {
      const last = parts[parts.length - 1];
      if (domainId.lastIndexOf(last) !== domainId.length - last.length) return false;
    }
    let pos = parts[0] ? parts[0].length : 0;
    for (let i = 1; i < parts.length - 1; i++) {
      if (!parts[i]) continue;
      const found = domainId.indexOf(parts[i], pos);
      if (found === -1) return false;
      pos = found + parts[i].length;
    }
    return true;
  }
  return domainId === pattern || domainId.indexOf(pattern + '.') === 0;
}

// --- Custom node ---
function DomainNode({ data, selected }) {
  const cls = 'rf-node rf-node--' + data.nodeType + (selected ? ' rf-node--selected' : '') + (data.dimmed ? ' rf-node--dimmed' : '');
  const icon = data.nodeType === 'domain' ? '●' : data.nodeType === 'missing' ? '▲' : '✕';
  return (
    <React.Fragment>
      <Handle type="target" position={Position.Left} className="rf-handle" />
      <div className={cls}>
        <div className="rf-node__icon">{icon}</div>
        <div className="rf-node__content">
          <div className="rf-node__id" title={data.domainId}>{data.domainId}</div>
          {data.label && data.label !== data.domainId && (
            <div className="rf-node__name" title={data.label}>{data.label}</div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="rf-handle" />
    </React.Fragment>
  );
}

const nodeTypes = { domainNode: DomainNode };

// --- Editor Panel ---
function EditorPanel({ open, filePath, editorRef, onClose }) {
  const [monacoReady, setMonacoReady] = useState(false);
  useEffect(() => {
    if (typeof window.require === 'undefined') return;
    window.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.34.0/min/vs' } });
    window.require(['vs/editor/editor.main'], () => {
      if (!editorRef.current) {
        editorRef.current = window.monaco.editor.create(document.getElementById('monaco-container'), {
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
      }
      setMonacoReady(true);
    });
  }, []);

  const handleClose = () => onClose();

  return (
    <div className={'editor-panel' + (open ? ' open' : '')}>
      <div className="editor-panel__header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="editor-panel__title">📄 Просмотр файла</div>
          <div className="editor-panel__path" title={filePath}>{filePath}</div>
        </div>
        <button className="btn btn--icon" onClick={handleClose} title="Закрыть">✕</button>
      </div>
      <div className="editor-panel__body">
        <div id="monaco-container" style={{ width: '100%', height: '100%' }}></div>
      </div>
    </div>
  );
}

// --- Tooltip ---
function HoverTooltip({ tooltip }) {
  if (!tooltip) return null;
  const { html, x, y } = tooltip;
  return (
    <div
      className="tooltip"
      style={{ left: x, top: y }}
      onMouseEnter={() => { window.__tooltipHovered = true; }}
      onMouseLeave={() => {
        window.__tooltipHovered = false;
        // Скрываем тултип через общий колбэк
        if (window.__hideTooltip) window.__hideTooltip();
      }}
    >
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

// --- Main App ---
function App() {
  const initial = useMemo(() => toReactFlow(GRAPH_DATA), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [filters, setFilters] = useState({ domain: true, broken: true, missing: true, linkage: true, fqid: true });
  const [namespaceFilter, setNamespaceFilter] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPath, setEditorPath] = useState('');
  const [tooltip, setTooltip] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const hideTimer = useRef(null);
  const tooltipHovered = useRef(false);
  const editorRef = useRef(null);
  const wrapperRef = useRef(null);
  const rfInstance = useRef(null);
  const hoverTimeout = useRef(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const searchInputRef = useRef(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Счётчики для чипов фильтра
const counts = useMemo(() => ({
  domain: nodes.filter(n => n.data.nodeType === 'domain').length,
  missing: nodes.filter(n => n.data.nodeType === 'missing').length,
  broken: nodes.filter(n => n.data.nodeType === 'broken').length,
  linkage: edges.filter(e => e.data?.kind === 'linkage').length,
  fqid: edges.filter(e => e.data?.kind === 'fqid').length
}), [nodes, edges]);

// Топ-5 доменов по числу связей (входящих + исходящих)
const topConnected = useMemo(() => {
  const degree = new Map();
  nodes.forEach(n => degree.set(n.id, 0));
  edges.forEach(e => {
    if (degree.has(e.source)) degree.set(e.source, degree.get(e.source) + 1);
    if (degree.has(e.target)) degree.set(e.target, degree.get(e.target) + 1);
  });
  return nodes
    .map(n => ({ node: n, degree: degree.get(n.id) || 0 }))
    .filter(x => x.degree > 0)
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 5);
}, [nodes, edges]);

// Топ-5 доменов по исходящим FQID-ссылкам
const topRefs = useMemo(() => {
  return nodes
    .map(n => ({ node: n, count: (n.data.fqidRefs || []).length }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}, [nodes]);

// Разбивка по неймспейсам (первые 2 сегмента id)
const namespaces = useMemo(() => {
  const map = new Map();
  nodes.forEach(n => {
    if (n.data.nodeType !== 'domain') return;
    const parts = n.data.domainId.split('.');
    const ns = parts.slice(0, 2).join('.');
    map.set(ns, (map.get(ns) || 0) + 1);
  });
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
}, [nodes]);

// Облако тегов
const tagCloud = useMemo(() => {
  const map = new Map();
  nodes.forEach(n => {
    (n.data.tags || []).forEach(t => {
      const key = String(t);
      map.set(key, (map.get(key) || 0) + 1);
    });
  });
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14);
}, [nodes]);

// Изолированные домены (без связей)
const isolatedCount = useMemo(() => {
  const connected = new Set();
  edges.forEach(e => { connected.add(e.source); connected.add(e.target); });
  return nodes.filter(n => n.data.nodeType === 'domain' && !connected.has(n.id)).length;
}, [nodes, edges]);

// Общее число FQID-ссылок
const totalFqidRefs = useMemo(
  () => nodes.reduce((sum, n) => sum + (n.data.fqidRefs?.length || 0), 0),
  [nodes]
);
  
  const domainToNodeId = useMemo(() => {
    const map = new Map();
    nodes.forEach(n => {
      const d = (n.data.domainId || '').toLowerCase();
      if (d) map.set(d, n.id);
    });
    return map;
  }, [nodes]);

  // --- Filters ---
    // Базовая фильтрация (тип + namespace)
  const filteredNodes = useMemo(() => {
    return nodes.filter(n => {
      const t = n.data.nodeType;
      if (t === 'domain' && !filters.domain) return false;
      if (t === 'broken' && !filters.broken) return false;
      if (t === 'missing' && !filters.missing) return false;
      if (namespaceFilter && !matchesNamespace(n.data.domainId, namespaceFilter)) return false;
      return true;
    });
  }, [nodes, filters, namespaceFilter]);

  const filteredEdges = useMemo(() => {
  const ids = new Set(filteredNodes.map(n => n.id));
  return edges.filter(e => {
    if (!ids.has(e.source) || !ids.has(e.target)) return false;
    const kind = e.data?.kind;
    if (kind === 'linkage' && !filters.linkage) return false;
    if (kind === 'fqid' && !filters.fqid) return false;
    return true;
  });
}, [edges, filteredNodes, filters.linkage, filters.fqid]);

  // Множества для подсветки
  const { highlightedNodeIds, highlightedEdgeIds } = useMemo(() => {
    if (!selectedNodeId) return { highlightedNodeIds: null, highlightedEdgeIds: null };
    const nodeIds = new Set([selectedNodeId]);
    const edgeIds = new Set();
    filteredEdges.forEach(e => {
      if (e.source === selectedNodeId || e.target === selectedNodeId) {
        edgeIds.add(e.id);
        nodeIds.add(e.source);
        nodeIds.add(e.target);
      }
    });
    return { highlightedNodeIds: nodeIds, highlightedEdgeIds: edgeIds };
  }, [selectedNodeId, filteredEdges]);

  // Финальные узлы с учётом подсветки
  const visibleNodes = useMemo(() => {
    if (!highlightedNodeIds) return filteredNodes;
    return filteredNodes.map(n => {
      const dimmed = !highlightedNodeIds.has(n.id);
      return {
        ...n,
        style: { opacity: dimmed ? 0.15 : 1, transition: 'opacity 0.2s' },
        data: { ...n.data, dimmed }
      };
    });
  }, [filteredNodes, highlightedNodeIds]);
  
  const searchResults = useMemo(() => {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return [];

  return nodes
    .map(n => {
      const d = n.data || {};
      const id = (d.domainId || '').toLowerCase();
      const name = (d.name || '').toLowerCase();
      const description = (d.description || '').toLowerCase();
      const tags = Array.isArray(d.tags) ? d.tags.map(t => String(t).toLowerCase()) : [];

      const matches = [];
      if (id.includes(q)) matches.push({ field: 'id', value: d.domainId });
      if (name.includes(q)) matches.push({ field: 'name', value: d.name });
      if (description.includes(q)) matches.push({ field: 'description', value: d.description });
      tags.forEach(tag => {
        if (tag.includes(q)) matches.push({ field: 'tags', value: tag });
      });

      return matches.length > 0 ? { node: n, matches } : null;
    })
    .filter(Boolean)
    // Сортировка: сначала совпадения по id, потом по name, потом остальные
    .sort((a, b) => {
      const rank = (r) => {
        const fields = r.matches.map(m => m.field);
        if (fields.includes('id')) return 0;
        if (fields.includes('name')) return 1;
        if (fields.includes('tags')) return 2;
        return 3;
      };
      return rank(a) - rank(b);
    })
    .slice(0, 100);
}, [searchQuery, nodes]);
  
  useEffect(() => { setSearchIndex(0); }, [searchQuery]);
  
  const gotoDomainByDomainId = useCallback((domainId) => {
  if (!domainId) return;
  const nodeId = domainToNodeId.get(domainId.toLowerCase());
  if (!nodeId) return;
  const node = nodes.find(n => n.id === nodeId);
  if (!node || !rfInstance.current) return;
  const cx = node.position.x + NODE_WIDTH / 2;
  const cy = node.position.y + NODE_HEIGHT / 2;
  const zoom = Math.max(rfInstance.current.getZoom(), 1.2);
  rfInstance.current.setCenter(cx, cy, { zoom, duration: 500 });
  setSelectedNodeId(nodeId);
}, [domainToNodeId, nodes]);

const openSearch = useCallback(() => {
  setSearchQuery('');
  setSearchIndex(0);
  setSearchOpen(true);
  setTimeout(() => searchInputRef.current?.focus(), 50);
}, []);

const closeSearch = useCallback(() => {
  setSearchOpen(false);
}, []);

const handleSearchKeyDown = useCallback((e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeSearch();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    setSearchIndex(i => Math.min(i + 1, Math.max(searchResults.length - 1, 0)));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setSearchIndex(i => Math.max(i - 1, 0));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const target = searchResults.length === 1
      ? searchResults[0]
      : searchResults[searchIndex];
    if (target) {
      gotoDomainByDomainId(target.node.data.domainId);
      closeSearch();
    }
  }
}, [searchResults, searchIndex, gotoDomainByDomainId, closeSearch]);

useEffect(() => {
  const handler = (e) => {
    // Shift+Tab — toggle поиска
    if (e.shiftKey && e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      if (searchOpen) {
        closeSearch();
      } else {
        openSearch();
      }
      return;
    }
    // Ctrl/Cmd+K — альтернативный шорткат (на всякий случай)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      openSearch();
    }
  };
  window.addEventListener('keydown', handler, true);
  return () => window.removeEventListener('keydown', handler, true);
}, [searchOpen, openSearch, closeSearch]);

  // Финальные рёбра с учётом подсветки
  const visibleEdges = useMemo(() => {
    if (!highlightedEdgeIds) {
      return filteredEdges.map(e => ({
        ...e,
        style: { ...e.style, opacity: 0.85, strokeWidth: 1.5 }
      }));
    }
    return filteredEdges.map(e => {
      const hl = highlightedEdgeIds.has(e.id);
      const baseColor = e.data?.kind === 'linkage' ? '#818cf8' : '#10b981';
      const strokeWidth = e.data?.kind === 'linkage' ? 3 : 2;
      return {
        ...e,
        animated: hl,
        style: {
          ...e.style,
          opacity: hl ? 1 : 0.08,
          strokeWidth: hl ? strokeWidth : e.style.strokeWidth,
          stroke: hl ? '#fbbf24' : baseColor
        },
        markerEnd: {
          ...e.markerEnd,
          color: hl ? '#fbbf24' : baseColor
        }
      };
    });
  }, [filteredEdges, highlightedEdgeIds]);

  const showTooltipFor = useCallback((html, event) => {
    clearTimeout(hideTimer.current);
    const x = event.clientX + 16;
    const y = event.clientY + 16;
    setTooltip({ html, x, y });
  }, []);

  const scheduleHideTooltip = useCallback(() => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!window.__tooltipHovered) setTooltip(null);
    }, 250);
  }, []);
  
  // --- Handlers ---
 const handleNodeClick = useCallback((event, node) => {
    // Переключаем выделение
    setSelectedNodeId(prev => prev === node.id ? null : node.id);
  }, []);

  const handleNodeMouseEnter = useCallback((event, node) => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      const html = buildTooltipHtml(
        node.data.domainId,
        node.data.label,
        node.data.nodeType,
        node.data.filePath,
        node.data.version,
        node.data.entitiesCount,
        node.data.fqidRefs
      );
      showTooltipFor(html, event);
    }, 120);
  }, [showTooltipFor]);

  const handleNodeMouseLeave = useCallback(() => {
    scheduleHideTooltip();
  }, [scheduleHideTooltip]);

  const handleEdgeMouseEnter = useCallback((event, edge) => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      const refs = edge.data?.fqidRefs || [];
      const html = buildEdgeTooltipHtml(edge, refs);
      showTooltipFor(html, event);
    }, 120);
  }, [showTooltipFor]);

  const handleEdgeMouseLeave = useCallback(() => {
    scheduleHideTooltip();
  }, [scheduleHideTooltip]);

  const handleOpenFqidRef = useCallback((filePath, fqid) => {
    if (!filePath) return;
    setEditorPath(filePath);
    setEditorOpen(true);
    fetch('/file?path=' + encodeURIComponent(filePath))
      .then(r => r.ok ? r.text() : Promise.reject('File not found'))
      .then(content => {
        if (editorRef.current) {
          editorRef.current.setValue(content);
          if (fqid) {
            setTimeout(() => {
              const NEWLINE = String.fromCharCode(10);
              const lines = content.split(NEWLINE);
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes(fqid)) {
                  editorRef.current.revealLineInCenter(i + 1);
                  editorRef.current.setSelection({
                    startLineNumber: i + 1, startColumn: 1,
                    endLineNumber: i + 1, endColumn: lines[i].length + 1
                  });
                  break;
                }
              }
            }, 100);
          }
        }
      })
      .catch(() => {
        if (editorRef.current) editorRef.current.setValue('// Не удалось загрузить файл');
      });
    setTooltip(null);
  }, []);
    
  const handlePaneDoubleClick = useCallback((event) => {
    if (!rfInstance.current) return;
    const { screenToFlowPosition, setCenter, getZoom } = rfInstance.current;
    const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const z = getZoom();
    setCenter(pos.x, pos.y, { zoom: Math.min(z * 1.8, 5), duration: 400 });
  }, []);

  const handlePaneClick = useCallback(() => {
    setTooltip(null);
  }, []);

  // --- Toolbar actions ---
  const savePng = useCallback(() => {
    const rf = document.querySelector('.react-flow__viewport');
    if (!rf) return;
    const svg = document.querySelector('.react-flow__edges')?.ownerSVGElement?.parentElement;
    // Используем html-to-image через canvas (упрощенный вариант через прокси)
    // Просто сохраняем через canvas ReactFlow
    const canvas = document.querySelector('.react-flow__pane')?.parentElement?.querySelector('canvas');
    // ReactFlow рисует SVG поверх. Используем ручное преобразование:
    alert('Функция экспорта в PNG доступна через встроенную кнопку ReactFlow. Используйте скриншот.');
  }, []);

  const resetLayout = useCallback(() => {
    const layouted = layoutGraph(
      nodes.map(n => ({ ...n, position: { x: 0, y: 0 } })),
      edges
    );
    setNodes(layouted);
    setTimeout(() => rfInstance.current?.fitView({ duration: 500, padding: 0.2 }), 50);
  }, [nodes, edges, setNodes]);

  const fitView = useCallback(() => {
    rfInstance.current?.fitView({ duration: 500, padding: 0.2 });
  }, []);
  
  // Позиционирование тултипа в пределах окна
  useEffect(() => {
    if (!tooltip) return;
    const el = document.querySelector('.tooltip');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let x = tooltip.x;
    let y = tooltip.y;
    const margin = 8;
    if (x + rect.width > window.innerWidth - margin) {
      x = Math.max(margin, window.innerWidth - rect.width - margin);
    }
    if (y + rect.height > window.innerHeight - margin) {
      y = Math.max(margin, window.innerHeight - rect.height - margin);
    }
    if (x !== tooltip.x || y !== tooltip.y) {
      setTooltip(t => t ? { ...t, x, y } : null);
    }
  }, [tooltip]);
  
  useEffect(() => {
  const handler = (e) => {
    // Открыть файл
    const openBtn = e.target.closest('.js-open-file');
    if (openBtn) {
      e.stopPropagation();
      e.preventDefault();
      const file = openBtn.getAttribute('data-file');
      const fqid = openBtn.getAttribute('data-fqid');
      handleOpenFqidRef(file, fqid);
      return;
    }

    // Перейти к домену
    const gotoBtn = e.target.closest('.js-goto-domain');
    if (gotoBtn) {
      e.stopPropagation();
      e.preventDefault();
      const domainId = gotoBtn.getAttribute('data-domain');
      if (!domainId) return;

      const nodeId = domainToNodeId.get(domainId.toLowerCase());
      if (!nodeId) {
        console.warn('Node not found for domain:', domainId);
        return;
      }
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;

      // Центрируем камеру на узле
      if (rfInstance.current) {
        const nodeW = NODE_WIDTH;
        const nodeH = NODE_HEIGHT;
        const cx = node.position.x + nodeW / 2;
        const cy = node.position.y + nodeH / 2;
        const zoom = Math.max(rfInstance.current.getZoom(), 1.2);
        rfInstance.current.setCenter(cx, cy, { zoom, duration: 500 });
      }

      // Выделяем узел и подсвечиваем его связи
      setSelectedNodeId(nodeId);

      // Скрываем тултип
      setTooltip(null);
      window.__tooltipHovered = false;
      return;
    }
  };

  document.addEventListener('click', handler, true);
  return () => document.removeEventListener('click', handler, true);
}, [handleOpenFqidRef, domainToNodeId, nodes]);
  
  useEffect(() => {
    window.__hideTooltip = () => {
      // Мягкое скрытие с задержкой
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        if (!window.__tooltipHovered) setTooltip(null);
      }, 100);
    };
    return () => { delete window.__hideTooltip; };
  }, []);

  // Stats
  const stats = GRAPH_DATA.stats;
  const domainCount = GRAPH_DATA.domainCount;
  const linkCount = GRAPH_DATA.linkCount;
  const missingCount = GRAPH_DATA.missingCount;
  const brokenCount = GRAPH_DATA.brokenCount;

  return (
    <div className="app">
      <aside className={'sidebar' + (sidebarCollapsed ? ' sidebar--collapsed' : '')}>
          {sidebarCollapsed ? (
            <button
              className="sidebar__expand"
              onClick={() => setSidebarCollapsed(false)}
              title="Развернуть панель"
            >
              ›
            </button>
          ) : (
            <>
              <div className="sidebar__header">
                <div className="sidebar__logo">🌐</div>
                <div style={{ flex: 1 }}>
                  <div className="sidebar__title">Domain Graph</div>
                  <div className="sidebar__subtitle">Analyzer</div>
                </div>
                <button
                  className="sidebar__collapse"
                  onClick={() => setSidebarCollapsed(true)}
                  title="Свернуть панель"
                >
                  ‹
                </button>
              </div>
        
              <div className="sidebar__body">
                {/* --- Основные метрики --- */}
                <div className="section">
                  <div className="section__title">Обзор</div>
                  <div className="stats-grid">
                    <div className="stat-card stat-card--accent">
                      <div className="stat-card__value">{nodes.length}</div>
                      <div className="stat-card__label">Всего узлов</div>
                    </div>
                    <div className="stat-card stat-card--success">
                      <div className="stat-card__value">{edges.length}</div>
                      <div className="stat-card__label">Связей</div>
                    </div>
                    <div className="stat-card stat-card--warning">
                      <div className="stat-card__value">{counts.missing}</div>
                      <div className="stat-card__label">Missing</div>
                    </div>
                    <div className="stat-card stat-card--danger">
                      <div className="stat-card__value">{counts.broken}</div>
                      <div className="stat-card__label">Broken</div>
                    </div>
                  </div>
                </div>
        
                {/* --- Метрики связности --- */}
                <div className="section">
                  <div className="section__title">Связность</div>
                  <div className="mini-stats">
                    <div className="mini-stat">
                      <span className="mini-stat__label">Домены</span>
                      <span className="mini-stat__value">{counts.domain}</span>
                    </div>
                    <div className="mini-stat">
                      <span className="mini-stat__label">Изолированы</span>
                      <span className="mini-stat__value">{isolatedCount}</span>
                    </div>
                    <div className="mini-stat">
                      <span className="mini-stat__label">Linkage</span>
                      <span className="mini-stat__value">{counts.linkage}</span>
                    </div>
                    <div className="mini-stat">
                      <span className="mini-stat__label">FQID-рёбра</span>
                      <span className="mini-stat__value">{counts.fqid}</span>
                    </div>
                    <div className="mini-stat" style={{ gridColumn: 'span 2' }}>
                      <span className="mini-stat__label">Всего FQID-ссылок</span>
                      <span className="mini-stat__value">{totalFqidRefs}</span>
                    </div>
                  </div>
                </div>
        
                {/* --- Топ по связям --- */}
                {topConnected.length > 0 && (
                  <div className="section">
                    <div className="section__title">Топ по связям</div>
                    <div className="rank-list">
                      {topConnected.map((item, i) => (
                        <button
                          key={item.node.id}
                          className="rank-item"
                          onClick={() => gotoDomainByDomainId(item.node.data.domainId)}
                          title={item.node.data.domainId}
                        >
                          <span className="rank-item__num">{i + 1}</span>
                          <span className="rank-item__label">{item.node.data.domainId}</span>
                          <span className="rank-item__value">{item.degree}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
        
                {/* --- Топ по исходящим ссылкам --- */}
                {topRefs.length > 0 && (
                  <div className="section">
                    <div className="section__title">Топ по исходящим FQID</div>
                    <div className="rank-list">
                      {topRefs.map((item, i) => (
                        <button
                          key={item.node.id}
                          className="rank-item"
                          onClick={() => gotoDomainByDomainId(item.node.data.domainId)}
                          title={item.node.data.domainId}
                        >
                          <span className="rank-item__num">{i + 1}</span>
                          <span className="rank-item__label">{item.node.data.domainId}</span>
                          <span className="rank-item__value">{item.count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
        
                {/* --- Неймспейсы --- */}
                {namespaces.length > 0 && (
                  <div className="section">
                    <div className="section__title">Неймспейсы</div>
                    <div className="bar-list">
                      {namespaces.map(([ns, count]) => {
                        const max = namespaces[0][1];
                        const pct = (count / max) * 100;
                        return (
                          <button
                            key={ns}
                            className="bar-item"
                            onClick={() => setNamespaceFilter(ns + '.*')}
                            title={'Показать только ' + ns + '.*'}
                          >
                            <span className="bar-item__label">{ns}</span>
                            <span className="bar-item__value">{count}</span>
                            <span className="bar-item__track">
                              <span className="bar-item__fill" style={{ width: pct + '%' }}></span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
        
                {/* --- Облако тегов --- */}
                {tagCloud.length > 0 && (
                  <div className="section">
                    <div className="section__title">Теги</div>
                    <div className="tag-cloud">
                      {tagCloud.map(([tag, count]) => (
                        <button
                          key={tag}
                          className="tag"
                          onClick={() => setSearchQuery(tag) || openSearch()}
                          title={tag + ' (' + count + ')'}
                        >
                          {tag}
                          <span className="tag__count">{count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
        
                {/* --- Легенда --- */}
                <div className="section">
                  <div className="section__title">Легенда</div>
                  <div className="toggle-list">
                    <div className="legend-row">
                      <span className="legend-dot" style={{ background: 'var(--success)' }}></span>
                      Domain — корректный
                    </div>
                    <div className="legend-row">
                      <span className="legend-dot" style={{ background: 'var(--warning)' }}></span>
                      Missing — несуществующий
                    </div>
                    <div className="legend-row">
                      <span className="legend-dot" style={{ background: 'var(--danger)' }}></span>
                      Broken — ошибка YAML
                    </div>
                    <div className="legend-row">
                      <span className="legend-line" style={{ background: '#818cf8' }}></span>
                      Linkage — явная связь
                    </div>
                    <div className="legend-row">
                      <span className="legend-line" style={{ background: '#10b981' }}></span>
                      FQID — неявная ссылка
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </aside>

      <main className="main">
        <div className="toolbar">
          <div className="toolbar__group">
            <button className="btn btn--icon" onClick={fitView} title="Вписать в экран">⛶</button>
            <button className="btn btn--icon" onClick={resetLayout} title="Переуложить">⟳</button>
          </div>
        
          <button className="btn" onClick={openSearch} title="Поиск домена (Shift+Tab)" style={{ gap: 8 }}>
            🔍 Поиск
            <kbd className="btn-kbd">⇧ Tab</kbd>
          </button>
        
          <div className="toolbar__chips">
            {[
              { key: 'domain', label: 'Domain', color: 'var(--success)' },
              { key: 'missing', label: 'Missing', color: 'var(--warning)' },
              { key: 'broken', label: 'Broken', color: 'var(--danger)' },
              { key: 'linkage', label: 'Linkage', color: '#818cf8' },
              { key: 'fqid', label: 'FQID', color: '#10b981' }
            ].map(item => (
              <button
                key={item.key}
                className={'chip' + (filters[item.key] ? ' chip--active' : '')}
                onClick={() => setFilters(f => ({ ...f, [item.key]: !f[item.key] }))}
                title={item.label + ': ' + counts[item.key]}
              >
                <span className="chip__dot" style={{ background: item.color }}></span>
                <span className="chip__label">{item.label}</span>
                <span className="chip__count">{counts[item.key]}</span>
              </button>
            ))}
          </div>
        
          <div className="toolbar__filter">
            <span className="toolbar__filter-icon">🔎</span>
            <input
              className="toolbar__filter-input"
              type="text"
              placeholder="sgrc.risk.*, !test.*"
              value={namespaceFilter}
              onChange={e => setNamespaceFilter(e.target.value)}
            />
            {namespaceFilter && (
              <button className="toolbar__filter-clear" onClick={() => setNamespaceFilter('')} title="Очистить">✕</button>
            )}
            <div className="toolbar__filter-help">
              <span className="toolbar__filter-help-icon">?</span>
              <div className="toolbar__filter-tooltip">
                <div className="toolbar__filter-tooltip-title">Синтаксис фильтра</div>
                <div className="toolbar__filter-tooltip-row">
                  <code>sgrc.risk.*</code>
                  <span>показать домены из неймспейса</span>
                </div>
                <div className="toolbar__filter-tooltip-row">
                  <code>users.*, sgrc.*</code>
                  <span>несколько масок через <b>,</b> <b>;</b> или пробел</span>
                </div>
                <div className="toolbar__filter-tooltip-row">
                  <code>!test.*</code>
                  <span>исключить домены из неймспейса</span>
                </div>
                <div className="toolbar__filter-tooltip-row">
                  <code>sgrc.*, !sgrc.legacy.*</code>
                  <span>комбинировать включение и исключение</span>
                </div>
                <div className="toolbar__filter-tooltip-row">
                  <code>*</code>
                  <span>любое количество символов</span>
                </div>
              </div>
            </div>
          </div>
        
          <div className="toolbar__spacer"></div>
        
          <div className="toolbar__stats">
            {visibleNodes.length} / {nodes.length} узлов · {visibleEdges.length} / {edges.length} связей
          </div>
        </div>
        <div className="graph-container" ref={wrapperRef}>
          <ReactFlowProvider>
            <ReactFlowInner
              nodes={visibleNodes}
              edges={visibleEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              onNodeMouseEnter={handleNodeMouseEnter}
              onNodeMouseLeave={handleNodeMouseLeave}
              onEdgeMouseEnter={handleEdgeMouseEnter}
              onEdgeMouseLeave={handleEdgeMouseLeave}
              onPaneDoubleClick={handlePaneDoubleClick}
              onPaneClick={handlePaneClick}
              setRfInstance={(inst) => { rfInstance.current = inst; }}
            />
          </ReactFlowProvider>

          {visibleNodes.length === 0 && (
            <div className="empty-state">
              <div className="empty-state__title">Ничего не найдено</div>
              <div className="empty-state__text">Попробуйте изменить фильтры</div>
            </div>
          )}

          <EditorPanel
            open={editorOpen}
            filePath={editorPath}
            editorRef={editorRef}
            onClose={() => setEditorOpen(false)}
          />
        </div>
      </main>

      <HoverTooltip tooltip={tooltip} onOpenFile={handleOpenFqidRef} />
      
      {searchOpen && (
  <div className="search-overlay" onMouseDown={closeSearch}>
    <div className="search-modal" onMouseDown={e => e.stopPropagation()}>
      <div className="search-modal__input-wrap">
        <span className="search-modal__icon">🔍</span>
        <input
          ref={searchInputRef}
          className="search-modal__input"
          type="text"
          placeholder="Поиск домена по id, имени, описанию или тегам"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
        <kbd className="search-modal__kbd">Esc</kbd>
      </div>
      <div className="search-modal__results">
        {searchQuery.trim() === '' ? (
          <div className="search-modal__hint">Введите запрос для поиска</div>
        ) : searchResults.length === 0 ? (
          <div className="search-modal__hint">Ничего не найдено</div>
        ) : (
            searchResults.map((item, i) => {
              const n = item.node;
              const matchedFields = new Set(item.matches.map(m => m.field));
              return (
                <div
                  key={n.id}
                  className={'search-result' + (i === searchIndex ? ' active' : '')}
                  onMouseEnter={() => setSearchIndex(i)}
                  onClick={() => {
                    gotoDomainByDomainId(n.data.domainId);
                    closeSearch();
                  }}
                >
                  <span className={'search-result__dot search-result__dot--' + n.data.nodeType}></span>
                  <div className="search-result__content">
                    <div className="search-result__id">
                      <HighlightedText text={n.data.domainId} query={searchQuery} />
                      {matchedFields.has('id') && <span className="search-result__badge">id</span>}
                    </div>
                    {n.data.name && n.data.name !== n.data.domainId && (
                      <div className="search-result__label">
                        <HighlightedText text={n.data.name} query={searchQuery} />
                        {matchedFields.has('name') && <span className="search-result__badge">name</span>}
                      </div>
                    )}
                    {n.data.description && (
                      <div className="search-result__desc">
                        <HighlightedText text={n.data.description} query={searchQuery} />
                        {matchedFields.has('description') && <span className="search-result__badge">description</span>}
                      </div>
                    )}
                    {Array.isArray(n.data.tags) && n.data.tags.length > 0 && (
                      <div className="search-result__tags">
                        {n.data.tags.map((tag, ti) => (
                          <span key={ti} className="search-result__tag">
                            <HighlightedText text={tag} query={searchQuery} />
                          </span>
                        ))}
                        {matchedFields.has('tags') && <span className="search-result__badge">tags</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
      </div>
      <div className="search-modal__footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> навигация</span>
        <span><kbd>Enter</kbd> выбрать</span>
        <span><kbd>Esc</kbd> закрыть</span>
      </div>
    </div>
  </div>
)}
    </div>
  );
}

// --- Inner ReactFlow component with instance access ---
function ReactFlowInner(props) {
  const rf = useReactFlow();
  const { setRfInstance } = props;
  useEffect(() => {
    setRfInstance(rf);
  }, [rf, setRfInstance]);

  return (
    <ReactFlowComponent
      defaultEdgeOptions={{
        type: 'smoothstep',
        labelStyle: { fill: '#e2e8f0', fontSize: 10, fontWeight: 500 },
        labelBgStyle: { fill: '#0d1424', fillOpacity: 0.95 },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4
      }}
      nodes={props.nodes}
      edges={props.edges}
      onNodesChange={props.onNodesChange}
      onEdgesChange={props.onEdgesChange}
      nodeTypes={nodeTypes}
      onNodeClick={props.onNodeClick}
      onNodeMouseEnter={props.onNodeMouseEnter}
      onNodeMouseLeave={props.onNodeMouseLeave}
      onEdgeMouseEnter={props.onEdgeMouseEnter}
      onEdgeMouseLeave={props.onEdgeMouseLeave}
      onPaneDoubleClick={props.onPaneDoubleClick}
      onPaneClick={props.onPaneClick}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={4}
      proOptions={{ hideAttribution: true }}
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable
      onlyRenderVisibleElements
      defaultEdgeOptions={{ type: 'smoothstep' }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e293b" />
      <Controls position="bottom-left" />
      <MiniMap
        position="bottom-right"
        nodeColor={(n) => {
          const t = n.data?.nodeType;
          if (t === 'missing') return '#f59e0b';
          if (t === 'broken') return '#ef4444';
          return '#10b981';
        }}
        maskColor="rgba(10,14,26,0.7)"
        style={{ width: 180, height: 130 }}
      />
    </ReactFlowComponent>
  );
}

// --- Tooltip HTML builders ---
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function HighlightedText({ text, query }) {
  if (text === null || text === undefined) return null;
  const str = String(text);
  const q = (query || '').trim();
  if (!q) return str;

  const lower = str.toLowerCase();
  const qLower = q.toLowerCase();
  const parts = [];
  let pos = 0;
  let idx = lower.indexOf(qLower, pos);
  let key = 0;

  while (idx !== -1) {
    if (idx > pos) parts.push(str.slice(pos, idx));
    parts.push(
      React.createElement('mark', { key: 'm' + key++, className: 'search-hl' },
        str.slice(idx, idx + q.length))
    );
    pos = idx + q.length;
    idx = lower.indexOf(qLower, pos);
  }
  if (pos < str.length) parts.push(str.slice(pos));

  return React.createElement(React.Fragment, null, ...parts);
}

function buildEdgeTooltipHtml(edge, refs, onOpenFile) {
  const fullLabel = edge.data?.fullLabel || edge.label || edge.id;
  const link = edge.data?.linkData || {};
  const nameFrom = link.nameFrom || {};

  // Название стороны — nameFrom.side1/side2, fallback — сам FQID
  const side1Text = nameFrom.side1 || link.sourceEntity || null;
  const side2Text = nameFrom.side2 || link.targetEntity || null;

  // Домены сторон уже посчитаны на бэкенде
  const side1Domain = edge.data?.side1Domain || null;
  const side2Domain = edge.data?.side2Domain || null;

  function renderSide(labelText, text, domain) {
    if (!text) return '';
    const clickable = !!domain;
    let h = '<div class="tooltip__row"><span class="tooltip__label">' + labelText + '</span>';
    if (clickable) {
      h += '<span class="tooltip__value js-goto-domain" '
        + 'data-domain="' + escapeHtml(domain) + '" '
        + 'style="cursor:pointer;color:var(--accent-hover);text-decoration:underline dotted">'
        + escapeHtml(text)
        + ' <span style="font-size:10px;color:var(--text-500)">→ ' + escapeHtml(domain) + '</span>'
        + '</span>';
    } else {
      h += '<span class="tooltip__value" style="color:var(--text-400)">' + escapeHtml(text) + '</span>';
    }
    h += '</div>';
    return h;
  }

  let html = '<div class="tooltip__header">Связь: ' + escapeHtml(fullLabel) + '</div>';
  html += '<div class="tooltip__body">';

  html += renderSide('Сторона 1:', side1Text, side1Domain);
  html += renderSide('Сторона 2:', side2Text, side2Domain);

  if (side1Text || side2Text) {
    html += '<div style="height:1px;background:var(--border);margin:10px 0"></div>';
  }

  if (link.type) {
    html += '<div class="tooltip__row"><span class="tooltip__label">Тип:</span><span class="tooltip__value">' + escapeHtml(link.type) + '</span></div>';
  }

  if (refs && refs.length > 0) {
    html += '<div class="tooltip__label" style="margin-top:8px;margin-bottom:8px">FQID ссылки (' + refs.length + '):</div>';
    refs.forEach(function(ref) {
      html += '<div class="tooltip__ref">';
      html += '<div class="tooltip__fqid js-goto-domain" '
        + 'data-domain="' + escapeHtml(ref.targetDomainId || '') + '" '
        + 'style="cursor:pointer">'
        + escapeHtml(ref.fullFQID)
        + '</div>';
      html += '<div class="tooltip__path">' + escapeHtml(ref.propertyPath) + '</div>';
      html += '<button class="tooltip__btn js-open-file" data-file="' + escapeHtml(ref.filePath || '') + '" data-fqid="' + escapeHtml(ref.fullFQID || '') + '">📂 Открыть</button>';
      html += '</div>';
    });
  }

  html += '</div>';
  return html;
}

function buildTooltipHtml(domainId, label, nodeType, filePath, version, entitiesCount, fqidRefs, onOpenFile) {
  const typeLabel = nodeType === 'domain' ? 'Корректный домен'
    : nodeType === 'missing' ? 'Несуществующий домен'
    : 'Битый YAML';
  const typeColor = nodeType === 'domain' ? '#10b981'
    : nodeType === 'missing' ? '#f59e0b' : '#ef4444';

  let html = '<div class="tooltip__header" style="color:' + typeColor + '">' + escapeHtml(typeLabel) + '</div>';
  html += '<div class="tooltip__body">';
  html += '<div class="tooltip__row"><span class="tooltip__label">ID:</span><span class="tooltip__value">' + escapeHtml(domainId) + '</span></div>';
  if (label && label !== domainId) {
    html += '<div class="tooltip__row"><span class="tooltip__label">Название:</span><span class="tooltip__value">' + escapeHtml(label) + '</span></div>';
  }
  if (version) {
    html += '<div class="tooltip__row"><span class="tooltip__label">Версия:</span><span class="tooltip__value">' + escapeHtml(version) + '</span></div>';
  }
  if (entitiesCount !== undefined && entitiesCount !== null) {
    html += '<div class="tooltip__row"><span class="tooltip__label">Entities:</span><span class="tooltip__value">' + entitiesCount + '</span></div>';
  }
  if (filePath) {
    html += '<div class="tooltip__row"><span class="tooltip__label">Файл:</span><span class="tooltip__value" style="font-size:11px">' + escapeHtml(filePath) + '</span></div>';
    html += '<div style="margin-top:10px"><button class="tooltip__btn js-open-file" data-file="' + escapeHtml(filePath) + '">📂 Открыть файл</button></div>';
  }

  if (fqidRefs && fqidRefs.length > 0) {
    html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">';
    html += '<div class="tooltip__label" style="margin-bottom:8px">FQID ссылки (' + fqidRefs.length + '):</div>';
    fqidRefs.forEach(function(ref) {
      html += '<div class="tooltip__ref">';
      html += '<div class="tooltip__fqid js-goto-domain" '
        + 'data-domain="' + escapeHtml(ref.targetDomainId || '') + '" '
        + 'style="cursor:pointer">'
        + escapeHtml(ref.fullFQID)
        + '</div>';
      html += '<div class="tooltip__path">' + escapeHtml(ref.propertyPath) + '</div>';
      html += '<button class="tooltip__btn js-open-file" data-file="' + escapeHtml(ref.filePath || '') + '" data-fqid="' + escapeHtml(ref.fullFQID || '') + '">📂 Открыть</button>';
      html += '</div>';
    });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

// --- Mount ---
const root = createRoot(document.getElementById('root'));
root.render(<App />);
</script>
</body>
</html>`;
  }
}

// --- CLI ---
function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    console.log('Usage: node graph-analyzer.js <directory-path> [port]');
    console.log('Example: node graph-analyzer.js ./domains 3000');
    process.exit(0);
  }
  const rootDir = path.resolve(args[0]);
  const port = parseInt(args[1] || '3000');
  if (!fs.existsSync(rootDir)) {
    console.error(`❌ Directory does not exist: ${rootDir}`);
    process.exit(1);
  }
  console.log(`🔍 Analyzing domains in: ${rootDir}`);
  const analyzer = new DomainGraphAnalyzer(rootDir);
  analyzer.startServer(port);
}

if (require.main === module) main();
module.exports = DomainGraphAnalyzer;