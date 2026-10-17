import type { ModelIndex } from "../../../shared/model-types";
import type {
  PiiReport,
  PiiHit,
  PiiSeverity,
  PiiCategory,
} from "../../../shared/pii-types";

const SEVERITY_LABELS: Record<PiiSeverity, string> = {
  critical: "🔴 Спецкатегории (GDPR Art. 9 / 152-ФЗ спецкатегория)",
  high: "🟠 Высокая чувствительность",
  medium: "🟡 Требуют внимания",
  low: "🟢 Косвенно",
};

const CATEGORY_LABELS: Record<PiiCategory, string> = {
  identity: "Идентичность",
  contact: "Контакты",
  document: "Документы",
  financial: "Финансовые данные",
  biometric: "Биометрия",
  special: "Специальные категории",
  location: "Локация",
  technical: "Технические",
  custom: "Прочие",
};

const SEVERITY_ORDER: PiiSeverity[] = ["critical", "high", "medium", "low"];

export interface PiiMarkdownOptions {
  /** Название компании/проекта. */
  projectName?: string;
  /** Автор отчёта. */
  author?: string;
  /** Исключённые ключи (не считать PII). */
  ignoredKeys?: Set<string>;
}

export function generatePiiMarkdown(
  report: PiiReport,
  index: ModelIndex,
  options: PiiMarkdownOptions = {},
): string {
  const lines: string[] = [];
  const now = new Date().toLocaleString("ru-RU");

  const ignored = options.ignoredKeys || new Set<string>();
  const hits = report.hits.filter((h) => !ignored.has(h.key));

  // ============ Заголовок ============
  lines.push("# Отчёт по PII-атрибутам");
  lines.push("");
  lines.push(`**Дата генерации:** ${now}`);
  if (options.projectName) {
    lines.push(`**Проект:** ${options.projectName}`);
  }
  if (options.author) {
    lines.push(`**Ответственный:** ${options.author}`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Назначение документа");
  lines.push("");
  lines.push(
    "Отчёт содержит перечень атрибутов схем доменов, которые могут содержать " +
      "персональные данные (PII). Документ предназначен для оценки рисков и " +
      "подготовки мер защиты в соответствии с GDPR, 152-ФЗ и PCI DSS.",
  );
  lines.push("");
  lines.push(
    "> **Важно:** перечень построен эвристически — по именам атрибутов и " +
      "контексту сущностей. Он не является юридическим заключением. " +
      "Перед принятием решений требуется ручная валидация.",
  );
  lines.push("");

  // ============ Сводка ============
  lines.push("## Сводка");
  lines.push("");
  lines.push("| Метрика | Значение |");
  lines.push("| --- | ---: |");
  lines.push(`| Всего PII-атрибутов | ${hits.length} |`);
  lines.push(
    `| Спецкатегорий (critical) | ${hits.filter((h) => h.severity === "critical").length} |`,
  );
  lines.push(
    `| Высокая чувствительность | ${hits.filter((h) => h.severity === "high").length} |`,
  );
  lines.push(
    `| Требуют внимания | ${hits.filter((h) => h.severity === "medium").length} |`,
  );
  lines.push(
    `| Косвенные | ${hits.filter((h) => h.severity === "low").length} |`,
  );
  lines.push(
    `| Затронуто доменов | ${new Set(hits.map((h) => h.entityFqid.split("/")[0])).size} |`,
  );
  lines.push(
    `| Затронуто сущностей | ${new Set(hits.map((h) => h.entityFqid)).size} |`,
  );
  if (ignored.size > 0) {
    lines.push(`| Исключено вручную | ${ignored.size} |`);
  }
  lines.push("");

  // ============ Нормативная база ============
  lines.push("## Нормативная база");
  lines.push("");
  lines.push("| Регуляция | Что относится |");
  lines.push("| --- | --- |");
  lines.push(
    "| **GDPR Art. 4** | Общее определение персональных данных (имя, email, адрес, идентификаторы). |",
  );
  lines.push(
    "| **GDPR Art. 9** | Спецкатегории: здоровье, религия, этничность, политические взгляды, биометрия, сексуальная ориентация. |",
  );
  lines.push(
    "| **152-ФЗ** | Российское законодательство о персональных данных. |",
  );
  lines.push(
    "| **PCI DSS** | Карточные данные: PAN, CVV, expiry, банковские счета. |",
  );
  lines.push("");

  // ============ По серьёзности ============
  SEVERITY_ORDER.forEach((sev) => {
    const items = hits.filter((h) => h.severity === sev);
    if (items.length === 0) return;

    lines.push(`## ${SEVERITY_LABELS[sev]} (${items.length})`);
    lines.push("");
    lines.push("| Сущность.Атрибут | Тип | Домен | Категория | Основание |");
    lines.push("| --- | --- | --- | --- | --- |");
    items.forEach((h) => {
      const [domainId, entityAndAttr] = h.entityFqid.split("/");
      const attrRef = `\`${entityAndAttr}.${h.attributeId}\``;
      lines.push(
        `| ${attrRef} | \`${h.dataType}\` | \`${domainId}\` | ${CATEGORY_LABELS[h.category]} | ${h.regulation || h.reasons[0]} |`,
      );
    });
    lines.push("");
  });

  // ============ По доменам ============
  const byDomain = new Map<string, PiiHit[]>();
  hits.forEach((h) => {
    const domainId = h.entityFqid.split("/")[0];
    if (!byDomain.has(domainId)) byDomain.set(domainId, []);
    byDomain.get(domainId)!.push(h);
  });

  if (byDomain.size > 0) {
    lines.push("## Распределение по доменам");
    lines.push("");
    lines.push("| Домен | Название | Всего | Critical |");
    lines.push("| --- | --- | ---: | ---: |");
    Array.from(byDomain.entries())
      .map(([domainId, items]) => ({
        domainId,
        name: index.domains.find((d) => d.id === domainId)?.name || domainId,
        total: items.length,
        critical: items.filter((h) => h.severity === "critical").length,
      }))
      .sort((a, b) => b.critical - a.critical || b.total - a.total)
      .forEach((entry) => {
        lines.push(
          `| \`${entry.domainId}\` | ${entry.name} | ${entry.total} | ${entry.critical} |`,
        );
      });
    lines.push("");
  }

  // ============ По категориям ============
  const byCategory = new Map<PiiCategory, PiiHit[]>();
  hits.forEach((h) => {
    if (!byCategory.has(h.category)) byCategory.set(h.category, []);
    byCategory.get(h.category)!.push(h);
  });

  if (byCategory.size > 0) {
    lines.push("## Распределение по категориям");
    lines.push("");
    lines.push("| Категория | Количество |");
    lines.push("| --- | ---: |");
    Array.from(byCategory.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .forEach(([cat, items]) => {
        lines.push(`| ${CATEGORY_LABELS[cat]} | ${items.length} |`);
      });
    lines.push("");
  }

  // ============ Детальный список ============
  lines.push("## Полный список");
  lines.push("");
  hits
    .slice()
    .sort((a, b) => {
      const sevDiff =
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
      if (sevDiff !== 0) return sevDiff;
      return a.entityFqid.localeCompare(b.entityFqid);
    })
    .forEach((h) => {
      lines.push(`### \`${h.entityFqid}#${h.attributeId}\``);
      lines.push("");
      lines.push(`- **Атрибут:** ${h.attributeName}`);
      lines.push(`- **Тип:** \`${h.dataType}\``);
      lines.push(`- **Категория:** ${CATEGORY_LABELS[h.category]}`);
      lines.push(`- **Серьёзность:** ${h.severity}`);
      if (h.regulation) lines.push(`- **Регуляция:** ${h.regulation}`);
      lines.push(`- **Почему сработало:** ${h.reasons.join(", ")}`);
      if (h.note) lines.push(`- **Заметка:** ${h.note}`);
      lines.push("");
    });

  // ============ Рекомендации ============
  lines.push("---");
  lines.push("");
  lines.push("## Рекомендации");
  lines.push("");

  const criticalCount = hits.filter((h) => h.severity === "critical").length;
  const highCount = hits.filter((h) => h.severity === "high").length;

  if (criticalCount > 0) {
    lines.push("### 🔴 Немедленно");
    lines.push("");
    lines.push(
      "- **Спецкатегории требуют явного согласия субъекта** (GDPR Art. 9, 152-ФЗ).",
    );
    lines.push(
      "- **Проверить шифрование** в хранилище для всех critical-полей.",
    );
    lines.push(
      "- **Ограничить доступ** — только сотрудники с соответствующей ролью.",
    );
    lines.push(
      "- **Запретить выгрузку в логи и тестовые среды** — маскирование обязательно.",
    );
    lines.push("");
  }

  if (highCount > 0) {
    lines.push("### 🟠 В ближайшее время");
    lines.push("");
    lines.push(
      "- Определить **срок хранения (retention)** для ФИО, контактов, документов.",
    );
    lines.push(
      "- Настроить **аудит доступа** — кто и когда смотрел персональные данные.",
    );
    lines.push(
      "- Проверить **политику обезличивания** перед передачей во внешние системы.",
    );
    lines.push(
      "- Добавить **согласие на обработку** в бизнес-процессы, где появляются эти данные.",
    );
    lines.push("");
  }

  lines.push("### Общие");
  lines.push("");
  lines.push(
    "- Провести **ручную валидацию** отчёта: часть записей может быть ложными срабатываниями.",
  );
  lines.push(
    "- Включить **маскирование** PII-атрибутов в представлениях, где полные значения не нужны.",
  );
  lines.push(
    "- **Документировать** решения по каждому critical-атрибуту: зачем он нужен и как защищён.",
  );
  lines.push(
    "- Настроить **мониторинг инцидентов** — любое изменение состава PII-атрибутов должно быть видно.",
  );
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push(`_Отчёт сгенерирован Domain Graph Analyzer — ${now}_`);
  lines.push("_Эвристический анализ. Требует валидации DPO._");

  return lines.join("\n");
}

export function downloadPiiMarkdown(markdown: string, filename?: string): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe =
    filename ||
    `pii-report-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-")}.md`;
  a.download = safe;
  a.click();
  URL.revokeObjectURL(url);
}
