import fs from "fs";
import path from "path";
import { sanitizeFileName } from "../utils/file-utils";
import type {
  LintBaselineFile,
  LintBaselineIssue,
} from "../../shared/lint-baseline-types";

/**
 * Каталог baseline-файлов.
 *
 * remote: sibling к `.cache/models/`, не внутри cacheDir — значит
 *         переживает `--refresh` и `--reset-cache`:
 *         `~/.domna/cache/.cache/.lint-baselines/<hash>/`
 * local:  рядом с файлами домена: `<rootDir>/.lint-baselines/`
 */
export function getLintBaselineDir(cacheDir: string): string {
  const cleanDir = cacheDir.replace(/[\\/]+$/, "");
  const parts = cleanDir.split(path.sep);

  const domainsIdx = parts.indexOf("domains");
  if (domainsIdx > 0 && parts[domainsIdx - 1] === ".cache") {
    const hash = parts[parts.length - 1];
    const cacheRoot = parts.slice(0, domainsIdx - 1).join(path.sep);
    return path.join(cacheRoot, ".cache", ".lint-baselines", hash);
  }
  return path.join(cleanDir, ".lint-baselines");
}

export function getLintBaselinePath(
  cacheDir: string,
  domainId: string,
): string {
  return path.join(
    getLintBaselineDir(cacheDir),
    sanitizeFileName(domainId) + ".json",
  );
}

function validateBaselineData(data: any): LintBaselineFile | null {
  if (
    !data ||
    typeof data !== "object" ||
    typeof data.domainId !== "string" ||
    typeof data.takenAt !== "string" ||
    !Array.isArray(data.issues)
  ) {
    return null;
  }

  const issues: LintBaselineIssue[] = [];
  for (const raw of data.issues) {
    if (
      !raw ||
      typeof raw !== "object" ||
      typeof raw.ruleId !== "string" ||
      typeof raw.message !== "string" ||
      typeof raw.severity !== "string" ||
      typeof raw.category !== "string" ||
      typeof raw.rule !== "string"
    ) {
      continue;
    }
    issues.push({
      ruleId: raw.ruleId,
      entityFqid: raw.entityFqid ?? null,
      attributeId: raw.attributeId ?? null,
      message: raw.message,
      severity: raw.severity,
      category: raw.category,
      rule: raw.rule,
      hint: typeof raw.hint === "string" ? raw.hint : undefined,
      domainId: typeof raw.domainId === "string" ? raw.domainId : data.domainId,
    });
  }

  return { domainId: data.domainId, takenAt: data.takenAt, issues };
}

export function loadLintBaseline(
  cacheDir: string,
  domainId: string,
): LintBaselineFile | null {
  try {
    const p = getLintBaselinePath(cacheDir, domainId);
    if (!fs.existsSync(p)) return null;
    return validateBaselineData(JSON.parse(fs.readFileSync(p, "utf8")));
  } catch {
    return null;
  }
}

export function saveLintBaseline(
  cacheDir: string,
  baseline: LintBaselineFile,
): void {
  const p = getLintBaselinePath(cacheDir, baseline.domainId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(baseline, null, 2), "utf8");
  fs.renameSync(tmp, p);
}

export function clearLintBaseline(cacheDir: string, domainId: string): boolean {
  try {
    const p = getLintBaselinePath(cacheDir, domainId);
    if (!fs.existsSync(p)) return false;
    fs.unlinkSync(p);
    return true;
  } catch {
    return false;
  }
}

export function loadAllLintBaselines(
  cacheDir: string,
): Record<string, LintBaselineFile> {
  const result: Record<string, LintBaselineFile> = {};
  try {
    const dir = getLintBaselineDir(cacheDir);
    if (!fs.existsSync(dir)) return result;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const v = validateBaselineData(
          JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")),
        );
        if (v) result[v.domainId] = v;
      } catch {
        /* skip broken file */
      }
    }
  } catch {
    /* ignore */
  }
  return result;
}
