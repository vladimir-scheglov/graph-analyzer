import type {
  DomainSchemaSummary,
  ModelIndex,
  EntityRecord,
} from "../../../shared/model-types";

/**
 * Генерирует Markdown-отчёт по домену.
 * Все данные берутся из DomainSchemaSummary + ModelIndex.
 */
export function generateDomainMarkdown(
  schema: DomainSchemaSummary,
  index: ModelIndex,
): string {
  const lines: string[] = [];
  const m = schema.metadata;

  // ============ Заголовок ============
  lines.push(`# Домен: \`${m.id}\``);
  lines.push("");

  if (m.name && m.name !== m.id) {
    lines.push(`**${m.name}**`);
    lines.push("");
  }

  if (m.description) {
    lines.push(m.description);
    lines.push("");
  }

  // ============ Метаданные ============
  lines.push("## Метаданные");
  lines.push("");
  lines.push("| Поле | Значение |");
  lines.push("| --- | --- |");
  lines.push(`| ID | \`${m.id}\` |`);
  if (m.name) lines.push(`| Название | ${m.name} |`);
  if (m.version) lines.push(`| Версия | ${m.version} |`);
  if (m.author) lines.push(`| Автор | ${m.author} |`);
  if (m.status) lines.push(`| Статус | ${m.status} |`);
  if (m.date) lines.push(`| Дата | ${m.date} |`);
  if (m.tags.length > 0) {
    lines.push(`| Теги | ${m.tags.map((t) => "`" + t + "`").join(", ")} |`);
  }
  lines.push("");

  // ============ Сводка ============
  lines.push("## Сводка");
  lines.push("");
  lines.push("| Раздел | Количество |");
  lines.push("| --- | ---: |");
  const sections = schema.sections;
  lines.push(`| Сущности | ${sections.entities.count} |`);
  lines.push(`| Связи | ${sections.linkages.count} |`);
  lines.push(`| Типы данных | ${sections.dataTypes.count} |`);
  lines.push(`| Последовательности | ${sections.sequences.count} |`);
  lines.push(`| Действия | ${sections.actions.count} |`);
  lines.push(`| Представления | ${sections.views.count} |`);
  lines.push(`| Пункты меню | ${sections.menus.count} |`);
  lines.push(`| Миксины | ${sections.mixins.count} |`);
  lines.push(`| Правила данных | ${sections.dataRules.count} |`);
  lines.push(`| Иконки | ${sections.medias.count} |`);
  lines.push("");

  // ============ Sonar ============
  const sonar = index.lint?.sonar?.byDomain[m.id];
  if (sonar) {
    lines.push("## Sonar-оценка");
    lines.push("");
    lines.push(`**${sonar.grade}** (${sonar.score}/100)`);
    lines.push("");
    lines.push("| Категория | Оценка | Проблем |");
    lines.push("| --- | ---: | ---: |");
    sonar.breakdown.forEach((b) => {
      lines.push(`| ${b.label} | ${b.score} | ${b.issueCount} |`);
    });
    lines.push("");
  }

  // ============ Сущности ============
  if (sections.entities.items.length > 0) {
    lines.push(`## Сущности (${sections.entities.items.length})`);
    lines.push("");

    // Ищем полные EntityRecord в индексе — для атрибутов
    const entitiesByFqid = new Map<string, EntityRecord>();
    index.entities.forEach((e) => {
      if (e.domainId === m.id) entitiesByFqid.set(e.entityId, e);
    });

    sections.entities.items.forEach((entityItem) => {
      const full = entitiesByFqid.get(entityItem.id);
      lines.push(`### \`${entityItem.id}\``);
      lines.push("");

      if (entityItem.name && entityItem.name !== entityItem.id) {
        lines.push(`*${entityItem.name}*`);
        lines.push("");
      }

      if (full?.description) {
        lines.push(full.description);
        lines.push("");
      }

      const meta: string[] = [];
      if (entityItem.inherits) {
        meta.push(`**Наследует:** \`${entityItem.inherits}\``);
      }
      if (full?.label) {
        meta.push(`**Label:** \`${full.label}\``);
      }
      meta.push(`**Атрибутов:** ${entityItem.attributesCount}`);
      if (meta.length > 0) {
        lines.push(meta.join(" · "));
        lines.push("");
      }

      // Атрибуты
      if (full && full.attributes.length > 0) {
        lines.push("| ID | Название | Тип | Ссылка | Constraints |");
        lines.push("| --- | --- | --- | --- | --- |");
        full.attributes.forEach((a) => {
          const ref = a.referenceEntity
            ? `→ \`${a.referenceEntity}\``
            : a.itemReferenceEntity
              ? `→ \`${a.itemReferenceEntity}\` (Array)`
              : "—";
          const constraints =
            a.constraints.length > 0 ? a.constraints.join(", ") : "—";
          lines.push(
            `| \`${a.id}\` | ${a.name} | \`${a.dataType}\` | ${ref} | ${constraints} |`,
          );
        });
        lines.push("");
      }
    });
  }

  // ============ Связи ============
  if (sections.linkages.items.length > 0) {
    lines.push(`## Связи (${sections.linkages.items.length})`);
    lines.push("");
    lines.push("| ID | Название | Тип | Сторона 1 | Сторона 2 |");
    lines.push("| --- | --- | --- | --- | --- |");
    sections.linkages.items.forEach((l) => {
      const arrow = l.undirected ? "↔" : "→";
      lines.push(
        `| \`${l.id}\` | ${l.name} | \`${l.type}\` | \`${l.side1}\` | \`${l.side2}\` |`,
      );
    });
    lines.push("");
  }

  // ============ Типы данных ============
  if (sections.dataTypes.items.length > 0) {
    lines.push(`## Типы данных (${sections.dataTypes.items.length})`);
    lines.push("");
    sections.dataTypes.items.forEach((d) => {
      const suffix: string[] = [];
      if (d.valuesCount != null) suffix.push(`${d.valuesCount} значений`);
      if (d.statusesCount != null) suffix.push(`${d.statusesCount} статусов`);
      if (d.attributesCount != null)
        suffix.push(`${d.attributesCount} колонок`);
      lines.push(
        `- **\`${d.id}\`** (${d.kind})${d.name !== d.id ? ` — ${d.name}` : ""}${suffix.length > 0 ? " · " + suffix.join(", ") : ""}`,
      );
    });
    lines.push("");
  }

  // ============ Последовательности ============
  if (sections.sequences.items.length > 0) {
    lines.push(`## Последовательности (${sections.sequences.items.length})`);
    lines.push("");
    sections.sequences.items.forEach((s) => {
      lines.push(`- \`${s.id}\` — начинается с ${s.startFrom}`);
    });
    lines.push("");
  }

  // ============ Действия ============
  if (sections.actions.items.length > 0) {
    lines.push(`## Действия (${sections.actions.items.length})`);
    lines.push("");
    sections.actions.items.forEach((a) => {
      lines.push(`- \`${a.id}\` — **${a.name}** \`${a.type}\``);
    });
    lines.push("");
  }

  // ============ Views ============
  if (sections.views.items.length > 0) {
    lines.push(`## Представления (${sections.views.items.length})`);
    lines.push("");
    sections.views.items.forEach((v) => {
      const meta: string[] = [`\`${v.type}\``];
      if (v.entity) meta.push(`→ \`${v.entity}\``);
      if (v.isMixin) meta.push("mixin");
      lines.push(`- \`${v.id}\` — ${meta.join(" · ")}`);
    });
    lines.push("");
  }

  // ============ Меню ============
  if (sections.menus.items.length > 0) {
    lines.push(`## Меню (${sections.menus.items.length})`);
    lines.push("");
    sections.menus.items.forEach((mi) => {
      lines.push(
        `- \`${mi.route}\` — **${mi.label}** \`${mi.type}\`${mi.view ? " → " + mi.view : ""}`,
      );
    });
    lines.push("");
  }

  // ============ Миксины ============
  if (sections.mixins.items.length > 0) {
    lines.push(`## Миксины (${sections.mixins.items.length})`);
    lines.push("");
    sections.mixins.items.forEach((mx) => {
      lines.push(
        `- \`${mx.id}\` (${mx.type}) → \`${mx.entity}\` · ${mx.viewsCount} view`,
      );
    });
    lines.push("");
  }

  // ============ Правила данных ============
  if (sections.dataRules.items.length > 0) {
    lines.push(`## Правила данных (${sections.dataRules.items.length})`);
    lines.push("");
    sections.dataRules.items.forEach((r) => {
      const meta: string[] = [];
      if (r.effect) meta.push(`\`${r.effect}\``);
      if (r.entity) meta.push(`→ \`${r.entity}\``);
      lines.push(
        `- \`${r.id}\` — ${r.name}${meta.length > 0 ? " · " + meta.join(" ") : ""}`,
      );
    });
    lines.push("");
  }

  // ============ Флаги ============
  if (schema.flags.hasExchangeSettings || schema.flags.hasCounterColorPattern) {
    lines.push("## Особенности");
    lines.push("");
    if (schema.flags.hasExchangeSettings) {
      lines.push("- Настроен обмен данными (`exchangeSettings`)");
    }
    if (schema.flags.hasCounterColorPattern) {
      lines.push("- Есть цветовые схемы счётчиков (`counterColorPattern`)");
    }
    lines.push("");
  }

  // ============ Футер ============
  lines.push("---");
  lines.push("");
  lines.push(
    `_Сгенерировано Domain Graph Analyzer — ${new Date().toLocaleString("ru-RU")}_`,
  );

  return lines.join("\n");
}

/** Скачивает Markdown-файл. */
export function downloadDomainMarkdown(
  domainId: string,
  markdown: string,
): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeId = domainId.replace(/[^a-z0-9.-]/gi, "_");
  const dateStr = new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-");
  a.download = `${safeId}-${dateStr}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
