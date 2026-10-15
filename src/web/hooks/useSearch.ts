import { useMemo } from "react";
import { useGraphStore } from "../state/useGraphStore";
import type { RFNode } from "../lib/types";

export interface SearchMatch {
  field: "id" | "name" | "description" | "tags" | "fqid";
  value: any;
}

export interface SearchResult {
  node: RFNode;
  matches: SearchMatch[];
}

/**
 * Поиск по узлам: id, name, description, tags, FQID-ссылки.
 * Сортирует по релевантности (id > name > fqid > tags > description).
 */
export function useSearch(): SearchResult[] {
  const nodes = useGraphStore((s) => s.nodes);
  const query = useGraphStore((s) => s.searchQuery);

  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return nodes
      .map((n): SearchResult | null => {
        const d = n.data || ({} as any);
        const id = (d.domainId || "").toLowerCase();
        const nm = (d.name || "").toLowerCase();
        const desc = (d.description || "").toLowerCase();
        const tags = Array.isArray(d.tags)
          ? d.tags.map((t: any) => String(t).toLowerCase())
          : [];
        const matches: SearchMatch[] = [];

        if (id.indexOf(q) !== -1)
          matches.push({ field: "id", value: d.domainId });
        if (nm.indexOf(q) !== -1)
          matches.push({ field: "name", value: d.name });
        if (desc.indexOf(q) !== -1)
          matches.push({ field: "description", value: d.description });
        tags.forEach((t) => {
          if (t.indexOf(q) !== -1) matches.push({ field: "tags", value: t });
        });

        const fqidRefs = d.fqidRefs || [];
        const fqidHits: any[] = [];
        fqidRefs.forEach((r: any) => {
          if (r.fullFQID && r.fullFQID.toLowerCase().indexOf(q) !== -1) {
            fqidHits.push({
              fullFQID: r.fullFQID,
              targetDomainId: r.targetDomainId,
              propertyPath: r.propertyPath,
            });
          }
        });
        if (fqidHits.length > 0)
          matches.push({ field: "fqid", value: fqidHits });

        return matches.length > 0 ? { node: n, matches } : null;
      })
      .filter((x): x is SearchResult => x !== null)
      .sort((a, b) => {
        const rank = (r: SearchResult): number => {
          const f = r.matches.map((m) => m.field);
          if (f.indexOf("id") !== -1) return 0;
          if (f.indexOf("name") !== -1) return 1;
          if (f.indexOf("fqid") !== -1) return 2;
          if (f.indexOf("tags") !== -1) return 3;
          return 4;
        };
        return rank(a) - rank(b);
      })
      .slice(0, 100);
  }, [query, nodes]);
}
