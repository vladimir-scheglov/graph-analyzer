export function buildDataTypeHover(
  value: string,
  index: any,
  domain: string,
): string | null {
  const dt = index?.dataTypes?.find(
    (d: any) => d.domainId === domain && d.id === value,
  );
  if (!dt) return null;

  const headerParts: string[] = [`**${dt.id}** — ${dt.kind}`];
  if (dt.name && dt.name !== dt.id) headerParts.push(`«${dt.name}»`);

  const bullets: string[] = [];
  if (dt.kind === "Enum" && dt.values?.length) {
    const shown = dt.values.slice(0, 8).join(", ");
    bullets.push(
      `- Значений: ${dt.values.length}. Первые: ${shown}${dt.values.length > 8 ? "…" : ""}`,
    );
  } else if (dt.kind === "Workflow" && dt.statuses?.length) {
    const shown = dt.statuses.slice(0, 8).join(", ");
    bullets.push(
      `- Статусов: ${dt.statuses.length}. Первые: ${shown}${dt.statuses.length > 8 ? "…" : ""}`,
    );
    if (dt.initial) bullets.push(`- Начальный: \`${dt.initial}\``);
  } else if (dt.kind === "Table" && dt.columns?.length) {
    bullets.push(`- Колонок: ${dt.columns.length}`);
  }

  const blocks: string[] = [headerParts.join(" ")];
  if (bullets.length > 0) blocks.push(bullets.join("\n"));
  if (dt.description) blocks.push(dt.description);

  return blocks.join("\n\n");
}

export function buildIdentifierHover(model: any, line: number): string | null {
  // Собираем `sequence:` и `template:` в текущем атрибуте
  const blockLines: string[] = [];
  const lineText = model.getLineContent(line);
  const currentIndent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;

  for (let i = line; i >= 1; i--) {
    const t = model.getLineContent(i);
    if (!t.trim()) continue;
    const ind = (t.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind < currentIndent) {
      blockLines.unshift(t);
      break;
    }
    blockLines.unshift(t);
  }
  for (let i = line + 1; i <= model.getLineCount(); i++) {
    const t = model.getLineContent(i);
    if (!t.trim()) continue;
    const ind = (t.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind < currentIndent) break;
    blockLines.push(t);
  }

  const seqLine = blockLines.find((l) => /^\s*sequence\s*:/.test(l));
  const tmplLine = blockLines.find((l) => /^\s*template\s*:/.test(l));

  if (seqLine && tmplLine) {
    return "⚠ **Конфликт**: для `Identifier` заданы и `sequence`, и `template`. Они взаимоисключающие — оставьте только одно.";
  }
  return null;
}

export function buildSequenceHover(
  value: string,
  index: any,
  domain: string,
): string | null {
  const seq = index?.sequences?.find(
    (s: any) => s.domainId === domain && s.id === value,
  );
  if (!seq) return null;
  return `**${seq.id}** — startFrom: ${seq.startFrom}. Несегментированный идентификатор.\n\nПример: ${seq.startFrom}, ${seq.startFrom + 1}, …`;
}

export function buildCounterPatternHover(
  value: string,
  index: any,
  domain: string,
): string | null {
  const p = index?.counterColorPatterns?.find(
    (x: any) => x.domainId === domain && x.id === value,
  );
  if (!p) return null;
  return `**${p.id}** — red: \`${p.red}\`, yellow: \`${p.yellow}\`.\n\nСчётчик станет жёлтым при превышении \`${p.yellow}\`, красным — \`${p.red}\`.`;
}

export function buildIconNameHover(value: string): string {
  return `**${value}** — иконка из дизайн-системы rui-icons. Справа от значения — превью.`;
}

export function buildRouteHover(
  value: string,
  model: any,
  currentLine: number,
): string | null {
  const matches: number[] = [];
  const lineCount = model.getLineCount();
  for (let i = 1; i <= lineCount; i++) {
    if (i === currentLine) continue;
    const t = model.getLineContent(i);
    const m = t.match(/^\s*(?:-\s+)?route\s*:\s*["']?([^\s"'#]+)["']?/);
    if (m && m[1] === value) matches.push(i);
  }
  if (matches.length > 0) {
    return `⚠ **Дубликат**: route \`${value}\` уже встречается в строках: ${matches.map((n) => `:${n}`).join(", ")}.\n\nПоле \`route\` должно быть уникальным.`;
  }
  return null;
}

export function buildActionHover(
  value: string,
  index: any,
  domain: string,
): string | null {
  if (!index?.actions) return null;
  const a = index.actions.find(
    (x: any) => x.domainId === domain && x.id === value,
  );
  if (!a) {
    return `⚠ **${value}** — действие не найдено в текущем домене`;
  }

  const headerParts: string[] = [`**${a.id}**`];
  const bullets: string[] = [];
  if (a.name && a.name !== a.id) bullets.push(`- \`name\`: ${a.name}`);
  if (a.type) bullets.push(`- \`type\`: ${a.type}`);

  if (a.entity) bullets.push(`- \`entity\`: ${a.entity.split("/").pop()}`);
  if (a.operation) bullets.push(`- \`operation\`: ${a.operation}`);
  if (a.modal) bullets.push(`- \`modal\`: ${a.modal}`);
  if (a.panel) bullets.push(`- \`panel\`: ${a.panel}`);
  if (a.view) bullets.push(`- \`view\`: ${a.view}`);
  if (a.automationId)
    bullets.push(`- \`automation\`: ${a.automationId.slice(0, 8)}…`);
  if (a.scenario) bullets.push(`- \`scenario\`: ${a.scenario}`);
  if (a.workerTag) bullets.push(`- \`workerTag\`: ${a.workerTag}`);
  if (a.bulkSettings?.length)
    bullets.push(`- \`bulkSettings\`: ${a.bulkSettings.length} шт.`);

  const blocks: string[] = [headerParts.join(" ")];
  if (bullets.length > 0) blocks.push(bullets.join("\n"));
  if (a.description) blocks.push(a.description);

  return blocks.join("\n\n");
}

export function buildWidgetHover(
  value: string,
  index: any,
  domain: string,
): string | null {
  if (!index?.viewWidgets) return null;
  const w = index.viewWidgets.find(
    (x: any) => x.domainId === domain && x.id === value,
  );

  if (!w) {
    return `⚠ **${value}** — виджет не найден в текущем домене`;
  }

  const headerParts: string[] = [`**${w.id}**`];
  const bullets: string[] = [];
  if (w.type) bullets.push(`- \`type\`: ${w.type}`);
  if (w.controlType) bullets.push(`- \`control\`: ${w.controlType}`);

  if (w.parentViewId) bullets.push(`- \`view\`: ${w.parentViewId}`);
  if (w.attribute) bullets.push(`- \`attribute\`: ${w.attribute}`);
  if (w.linkage) bullets.push(`- \`linkage\`: ${w.linkage}`);
  if (w.side != null) bullets.push(`- \`side\`: ${w.side}`);
  if (w.joinId) bullets.push(`- \`join\`: ${w.joinId}`);
  if (w.addLinksView) bullets.push(`- \`addLinksView\`: ${w.addLinksView}`);
  if (w.openView) bullets.push(`- \`openView\`: ${w.openView}`);
  if (w.displayMode) bullets.push(`- \`displayMode\`: ${w.displayMode}`);
  if (w.actionIds?.length) {
    const shown = w.actionIds.slice(0, 5).join(", ");
    const suffix = w.actionIds.length > 5 ? ` …+${w.actionIds.length - 5}` : "";
    bullets.push(`- \`actions\`: ${shown}${suffix}`);
  }

  const blocks: string[] = [headerParts.join(" ")];
  if (bullets.length > 0) blocks.push(bullets.join("\n"));
  return blocks.join("\n\n");
}
