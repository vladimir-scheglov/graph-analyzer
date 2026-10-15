import fs from "fs";
import path from "path";
import type {
  AnalyzerStats,
  CacheDiff,
  DomainEntity,
  FQIDReference,
  GraphData,
  GraphEdge,
  GraphNode,
  LinkageData,
  RemoteInfo,
} from "../../shared/types";
import { scanDirectory } from "./scanner";
import { loadYaml } from "./yaml-loader";
import { findFQIDReferences } from "./references";
import { processLinkages, RawLinkage } from "./linkages";

interface DomainData {
  id: string;
  name: string;
  version: string;
  filePath: string;
  entities: Map<string, any>;
  rawData: any;
  fqidRefs: FQIDReference[];
}

interface DomainMetadata {
  updatedAt: string | null;
  createdAt: string | null;
  author: string | null;
  description: string | null;
  tags: string[];
  version: string | null;
}

export class DomainAnalyzer {
  private rootDir: string;
  private domains = new Map<string, DomainData>();
  private links: LinkageData[] = [];
  private brokenDomains = new Map<string, string>();
  private missingDomains = new Set<string>();
  private fqidReferences: FQIDReference[] = [];
  private metadata = new Map<string, DomainMetadata>();

  readonly stats: AnalyzerStats = {
    totalFiles: 0,
    processedFiles: 0,
    skippedFiles: 0,
    brokenFiles: 0,
    domains: 0,
    links: 0,
    fqidReferences: 0,
  };

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.loadMetadata();
  }

  analyze(): GraphData {
    const files = scanDirectory(this.rootDir);
    this.stats.totalFiles = files.length;
    for (const file of files) this.processFile(file);
    return this.buildGraphData();
  }

  private loadMetadata(): void {
    try {
      const indexPath = path.join(this.rootDir, "_index.json");
      if (!fs.existsSync(indexPath)) return;
      const idx = JSON.parse(fs.readFileSync(indexPath, "utf8"));
      for (const d of idx.domains || []) {
        if (!d.sourceId) continue;
        this.metadata.set(d.sourceId.toLowerCase(), {
          updatedAt: d.updatedAt || null,
          createdAt: d.createdAt || null,
          author: d.author || null,
          description: d.description || null,
          tags: Array.isArray(d.tags) ? d.tags : [],
          version: d.version || null,
        });
      }
    } catch {
      /* работаем без метаданных */
    }
  }

  private processFile(filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const { data } = loadYaml(content);

      if (data.type !== "domain") {
        this.stats.skippedFiles++;
        return;
      }

      const domainId = data.id as string;
      if (!domainId) throw new Error("Domain without ID");

      if (!this.domains.has(domainId)) {
        this.domains.set(domainId, {
          id: domainId,
          name: data.name || domainId,
          version: data.version || "",
          filePath,
          entities: new Map(),
          rawData: data,
          fqidRefs: [],
        });
      }
      this.stats.processedFiles++;
      this.stats.domains = this.domains.size;

      const domainData = this.domains.get(domainId)!;

      if (Array.isArray(data.entities)) {
        for (const entity of data.entities) {
          if (entity?.id && !domainData.entities.has(entity.id)) {
            domainData.entities.set(entity.id, entity);
          }
        }
      }

      findFQIDReferences(data, domainId, filePath, (ref) => {
        this.fqidReferences.push(ref);
        this.stats.fqidReferences = this.fqidReferences.length;
        domainData.fqidRefs.push(ref);
        if (!this.findDomainCaseInsensitive(ref.targetDomainId)) {
          this.missingDomains.add(ref.targetDomainId);
        }
      });

      if (Array.isArray(data.linkages)) {
        this.processLinkageBatch(domainId, data.linkages, filePath);
      }
    } catch (error: any) {
      console.error(`Error processing ${filePath}: ${error.message}`);
      this.brokenDomains.set(filePath, error.message);
      this.stats.brokenFiles++;
    }
  }

  private processLinkageBatch(
    domainId: string,
    linkages: RawLinkage[],
    filePath: string,
  ): void {
    processLinkages(
      domainId,
      linkages,
      filePath,
      (id) => !!this.findDomainCaseInsensitive(id),
      (link) => {
        if (!this.links.find((l) => l.id === link.id)) {
          this.links.push(link);
          this.stats.links = this.links.length;
        }
        if (!this.findDomainCaseInsensitive(link.target)) {
          this.missingDomains.add(link.target);
        }
      },
    );
  }

  private findDomainCaseInsensitive(domainId: string): string | null {
    const normalized = domainId.trim().toLowerCase();
    for (const existingId of this.domains.keys()) {
      if (existingId.trim().toLowerCase() === normalized) return existingId;
    }
    return null;
  }

  private getAllEntities(): DomainEntity[] {
    const result: DomainEntity[] = [];
    for (const [domainId, data] of this.domains) {
      for (const entity of data.entities.values()) {
        if (!entity?.id) continue;
        result.push({
          domainId,
          entityId: entity.id,
          name: entity.name || entity.id,
          inherits:
            typeof entity.inherits === "string" && entity.inherits
              ? entity.inherits
              : null,
        });
      }
    }
    return result;
  }

  private buildGraphData(): GraphData {
    const nodesMap = new Map<string, GraphNode>();
    const edgesMap = new Map<string, GraphEdge>();

    for (const [domainId, domainData] of this.domains) {
      const nodeId = `domain_${domainId}`;
      const raw = domainData.rawData || {};
      const meta =
        this.metadata.get(domainId.toLowerCase()) || ({} as DomainMetadata);

      let folderPath: string[] = [];
      try {
        const relPath = path.relative(this.rootDir, domainData.filePath);
        const dir = path.dirname(relPath);
        folderPath = dir.split(path.sep).filter((p) => p && p !== ".");
      } catch {
        /* ignore */
      }

      let fallbackUpdatedAt: string | null = null;
      let fallbackCreatedAt: string | null = null;
      try {
        const stat = fs.statSync(domainData.filePath);
        fallbackUpdatedAt = stat.mtime.toISOString();
        fallbackCreatedAt =
          stat.birthtime && stat.birthtime.getTime() > 0
            ? stat.birthtime.toISOString()
            : null;
      } catch {
        /* ignore */
      }

      const updatedAt = meta.updatedAt || fallbackUpdatedAt;
      const updatedAtSource: "graphql" | "fs" | null = meta.updatedAt
        ? "graphql"
        : fallbackUpdatedAt
          ? "fs"
          : null;
      const createdAt = meta.createdAt || fallbackCreatedAt;
      const createdAtSource: "graphql" | "fs" | null = meta.createdAt
        ? "graphql"
        : fallbackCreatedAt
          ? "fs"
          : null;

      nodesMap.set(nodeId, {
        id: nodeId,
        label: domainData.name,
        domainId,
        title: this.buildTooltip(domainData),
        group: "domain",
        filePath: domainData.filePath,
        folderPath,
        fqidRefs: domainData.fqidRefs,
        version: meta.version || domainData.version || "",
        entitiesCount: domainData.entities.size,
        name: domainData.name || "",
        description: raw.description || meta.description || "",
        author: raw.author || meta.author || "",
        tags: Array.isArray(raw.tags)
          ? raw.tags
          : raw.tags
            ? [String(raw.tags)]
            : meta.tags || [],
        updatedAt,
        updatedAtSource,
        createdAt,
        createdAtSource,
      });
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
          group: "missing",
          filePath: null,
          folderPath: [],
        });
      }
    }

    for (const [brokenFile, errorMsg] of this.brokenDomains) {
      const nodeId = `broken_${brokenFile.replace(/[^a-zA-Z0-9]/g, "_")}`;
      if (!nodesMap.has(nodeId)) {
        nodesMap.set(nodeId, {
          id: nodeId,
          label: path.basename(brokenFile),
          domainId: path.basename(brokenFile),
          title: `Broken YAML: ${brokenFile}\nError: ${errorMsg}`,
          group: "broken",
          filePath: brokenFile,
          folderPath: [],
        });
      }
    }

    this.buildFQIDEdges(edgesMap);
    this.buildLinkageEdges(edgesMap);

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

  private getNodeId(domainId: string): string | null {
    if (this.domains.has(domainId)) return `domain_${domainId}`;
    const existingId = this.findDomainCaseInsensitive(domainId);
    if (existingId) return `domain_${existingId}`;
    if (this.missingDomains.has(domainId)) return `missing_${domainId}`;
    for (const [brokenFile] of this.brokenDomains) {
      if (brokenFile.includes(domainId))
        return `broken_${brokenFile.replace(/[^a-zA-Z0-9]/g, "_")}`;
    }
    if (domainId && domainId.trim()) {
      this.missingDomains.add(domainId);
      return `missing_${domainId}`;
    }
    return null;
  }

  private buildFQIDEdges(edgesMap: Map<string, GraphEdge>): void {
    const groupedRefs = new Map<
      string,
      {
        sourceNodeId: string;
        targetNodeId: string;
        sourceDomainId: string;
        targetDomainId: string;
        refs: FQIDReference[];
      }
    >();

    for (const ref of this.fqidReferences) {
      const sourceDomainId =
        this.findDomainCaseInsensitive(ref.sourceDomainId) ||
        ref.sourceDomainId;
      const targetDomainId =
        this.findDomainCaseInsensitive(ref.targetDomainId) ||
        ref.targetDomainId;
      const sourceNodeId = this.getNodeId(sourceDomainId);
      const targetNodeId = this.getNodeId(targetDomainId);
      if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId)
        continue;

      const key = `${sourceNodeId}__${targetNodeId}`;
      if (!groupedRefs.has(key)) {
        groupedRefs.set(key, {
          sourceNodeId,
          targetNodeId,
          sourceDomainId,
          targetDomainId,
          refs: [],
        });
      }
      groupedRefs.get(key)!.refs.push(ref);
    }

    for (const [key, group] of groupedRefs) {
      const edgeId = `fqid_${key}`;
      if (edgesMap.has(edgeId)) continue;
      const refCount = group.refs.length;
      edgesMap.set(edgeId, {
        id: edgeId,
        from: group.sourceNodeId,
        to: group.targetNodeId,
        label: `${refCount} ref${refCount > 1 ? "s" : ""}`,
        title: this.buildFQIDEdgeTooltip(group),
        fqidRefs: group.refs,
        refCount,
        kind: "fqid",
      });
    }
  }

  private buildLinkageEdges(edgesMap: Map<string, GraphEdge>): void {
    for (const link of this.links) {
      const sourceDomainId =
        this.findDomainCaseInsensitive(link.source) || link.source;
      const targetDomainId =
        this.findDomainCaseInsensitive(link.target) || link.target;
      const sourceNodeId = this.getNodeId(sourceDomainId);
      const targetNodeId = this.getNodeId(targetDomainId);
      if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId)
        continue;

      const edgeId = `linkage_${link.id}`;
      if (edgesMap.has(edgeId)) continue;

      const refs: FQIDReference[] = [];
      if (link.fqidRef) {
        refs.push({
          sourceDomainId: link.source,
          targetDomainId: link.target,
          fullFQID: link.fqidRef.fullFQID,
          propertyPath: link.fqidRef.propertyPath,
          filePath: link.sourceFile,
        });
      }

      edgesMap.set(edgeId, {
        id: edgeId,
        from: sourceNodeId,
        to: targetNodeId,
        label:
          link.name.length > 20 ? link.name.slice(0, 17) + "..." : link.name,
        fullLabel: link.name,
        title: this.buildLinkTooltip(link),
        linkData: link,
        kind: "linkage",
        side1Domain: link.side1Domain,
        side2Domain: link.side2Domain,
        side1Raw: link.side1Raw,
        side2Raw: link.side2Raw,
        fqidRefs: refs,
      });
    }
  }

  private buildTooltip(d: DomainData): string {
    return [
      d.name,
      `ID: ${d.id}`,
      `Version: ${d.version}`,
      `Entities: ${d.entities.size}`,
      `FQID References: ${d.fqidRefs.length}`,
      `File: ${d.filePath}`,
    ].join("\n");
  }

  private buildLinkTooltip(link: LinkageData): string {
    return [
      link.name,
      `ID: ${link.originalId}`,
      `Type: ${link.type}`,
      `From: ${link.sourceEntity}`,
      `To: ${link.targetEntity}`,
      `File: ${link.sourceFile}`,
    ].join("\n");
  }

  private buildFQIDEdgeTooltip(group: {
    refs: FQIDReference[];
    sourceDomainId: string;
    targetDomainId: string;
  }): string {
    let tooltip = `FQID References (${group.refs.length})\n`;
    tooltip += `From: ${group.sourceDomainId}\nTo: ${group.targetDomainId}\n`;
    tooltip += "─".repeat(40) + "\n";
    group.refs.slice(0, 20).forEach((ref, i) => {
      tooltip += `${i + 1}. ${ref.fullFQID}\n   Path: ${ref.propertyPath}\n`;
    });
    if (group.refs.length > 20)
      tooltip += `... and ${group.refs.length - 20} more\n`;
    return tooltip;
  }

  private collectCacheDiff(): CacheDiff | null {
    const current = path.join(this.rootDir, "_index.json");
    const previous = path.join(this.rootDir, "_index_previous.json");
    if (!fs.existsSync(current) || !fs.existsSync(previous)) return null;

    try {
      const cur = JSON.parse(fs.readFileSync(current, "utf8"));
      const prev = JSON.parse(fs.readFileSync(previous, "utf8"));

      const curMap = new Map<string, any>(
        (cur.domains || []).map((d: any) => [d.sourceId, d]),
      );
      const prevMap = new Map<string, any>(
        (prev.domains || []).map((d: any) => [d.sourceId, d]),
      );

      const added: CacheDiff["added"] = [];
      const removed: CacheDiff["removed"] = [];
      const changed: CacheDiff["changed"] = [];

      for (const [id, d] of curMap) {
        if (!prevMap.has(id)) {
          added.push({
            sourceId: id,
            name: d.name,
            version: d.version,
            tags: d.tags || [],
          });
        } else {
          const p = prevMap.get(id);
          const changes: Array<{ field: string; from: any; to: any }> = [];
          if (p.version !== d.version)
            changes.push({ field: "version", from: p.version, to: d.version });
          if (p.name !== d.name)
            changes.push({ field: "name", from: p.name, to: d.name });
          if (JSON.stringify(p.tags || []) !== JSON.stringify(d.tags || [])) {
            changes.push({
              field: "tags",
              from: (p.tags || []).join(", "),
              to: (d.tags || []).join(", "),
            });
          }
          if (changes.length > 0) {
            changed.push({
              sourceId: id,
              name: d.name,
              version: d.version,
              changes,
            });
          }
        }
      }
      for (const [id, d] of prevMap) {
        if (!curMap.has(id))
          removed.push({ sourceId: id, name: d.name, version: d.version });
      }

      return {
        previousFetchedAt: prev.fetchedAt || null,
        currentFetchedAt: cur.fetchedAt || null,
        added,
        removed,
        changed,
      };
    } catch {
      return null;
    }
  }

  getDomainsMap(): Map<string, DomainData> {
    return this.domains;
  }

  getRootDir(): string {
    return this.rootDir;
  }
}
