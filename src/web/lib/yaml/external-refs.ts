export interface ExternalRef {
  line: number;
  field: string;
  raw: string;
  domain: string;
  target: string;
  lineText: string;
}

export interface ExternalRefGroup {
  domain: string;
  refs: ExternalRef[];
  uniqueTargets: string[];
}

const FQID_DOMAIN_RE = /^[a-z0-9][\w-]*(\.[a-z0-9][\w-]*)+$/i;

const REF_FIELDS = new Set([
  "inherits",
  "entity",
  "linkage",
  "side1",
  "side2",
  "view",
  "modal",
  "panel",
  "form",
  "tab",
  "list",
  "page",
  "addLinksView",
  "fromView",
  "viewId",
  "action",
  "widget",
  "block",
  "attribute",
  "key",
  "value",
  "join",
  "entity_lists",
  "source",
]);

const NON_REF_FIELDS = new Set([
  "id",
  "name",
  "label",
  "description",
  "message",
  "help",
  "template",
  "route",
  "type",
  "kind",
  "dataType",
  "version",
  "author",
  "status",
  "date",
  "severity",
  "defaultPrefix",
  "incrementTemplate",
  "regexp",
  "mimeTypes",
  "title",
]);

export function extractExternalRefs(
  content: string,
  currentDomainId: string,
): ExternalRef[] {
  if (!content || !currentDomainId) return [];

  const refs: ExternalRef[] = [];
  const lines = content.split("\n");
  const currentLower = currentDomainId.toLowerCase();

  let blockScalarIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const indent = (line.match(/^(\s*)/) || ["", ""])[1].length;

    // Внутри block scalar (description: |, condition: |...) — пропускаем всё
    if (blockScalarIndent >= 0) {
      if (indent > blockScalarIndent) continue;
      blockScalarIndent = -1;
    }

    if (trimmed.startsWith("#")) continue;

    // Начало нового block scalar
    const bsMatch = line.match(
      /^(\s*)(?:-\s+)?[a-zA-Z_][\w]*\s*:\s*[|>][+\-]?\s*(?:#.*)?$/,
    );
    if (bsMatch) {
      blockScalarIndent = indent;
      continue;
    }

    const m = line.match(/^(\s*)(?:-\s+)?([a-zA-Z_][\w]*)\s*:\s*(.+)$/);
    if (!m) continue;

    const field = m[2];
    let value = m[3].trim();

    if (NON_REF_FIELDS.has(field)) continue;
    if (!REF_FIELDS.has(field)) continue;

    const hashIdx = value.indexOf(" #");
    if (hashIdx > 0) value = value.slice(0, hashIdx).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!value) continue;

    const slashIdx = value.indexOf("/");
    if (slashIdx <= 0 || slashIdx >= value.length - 1) continue;

    const domainPart = value.slice(0, slashIdx);
    if (!FQID_DOMAIN_RE.test(domainPart)) continue;
    if (domainPart.toLowerCase() === currentLower) continue;

    const targetPart = value.slice(slashIdx + 1).trim();
    if (!targetPart) continue;

    refs.push({
      line: i + 1,
      field,
      raw: value,
      domain: domainPart.toLowerCase(),
      target: targetPart,
      lineText: line,
    });
  }

  return refs;
}

export function groupExternalRefs(refs: ExternalRef[]): ExternalRefGroup[] {
  const map = new Map<string, ExternalRef[]>();
  refs.forEach((r) => {
    if (!map.has(r.domain)) map.set(r.domain, []);
    map.get(r.domain)!.push(r);
  });

  const groups: ExternalRefGroup[] = [];
  map.forEach((groupRefs, domain) => {
    const unique = new Set(groupRefs.map((r) => r.target));
    groups.push({
      domain,
      refs: groupRefs,
      uniqueTargets: Array.from(unique).sort(),
    });
  });
  groups.sort((a, b) => b.refs.length - a.refs.length);
  return groups;
}
