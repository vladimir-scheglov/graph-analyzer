import type { RFNode, RFEdge, FQIDRef } from "./types";

export function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[c];
  });
}

export function buildNodeTooltip(node: RFNode): string {
  const d = node.data;
  const typeLabel =
    d.nodeType === "domain"
      ? "Корректный домен"
      : d.nodeType === "missing"
        ? "Несуществующий домен"
        : "Битый YAML";
  const typeColor =
    d.nodeType === "domain"
      ? "#10b981"
      : d.nodeType === "missing"
        ? "#f59e0b"
        : "#ef4444";

  let html = `<div class="tooltip__header" style="color:${typeColor}">${escapeHtml(
    typeLabel,
  )}</div>`;
  html += '<div class="tooltip__body">';
  html += `<div class="tooltip__row"><span class="tooltip__label">ID:</span><span class="tooltip__value">${escapeHtml(
    d.domainId,
  )}</span></div>`;
  if (d.label && d.label !== d.domainId) {
    html += `<div class="tooltip__row"><span class="tooltip__label">Название:</span><span class="tooltip__value">${escapeHtml(
      d.label,
    )}</span></div>`;
  }
  if (d.version) {
    html += `<div class="tooltip__row"><span class="tooltip__label">Версия:</span><span class="tooltip__value">${escapeHtml(
      d.version,
    )}</span></div>`;
  }
  if (d.entitiesCount != null) {
    html += `<div class="tooltip__row"><span class="tooltip__label">Entities:</span><span class="tooltip__value">${d.entitiesCount}</span></div>`;
  }
  if (d.description) {
    html += `<div class="tooltip__row"><span class="tooltip__label">Описание:</span><span class="tooltip__value">${escapeHtml(
      d.description,
    )}</span></div>`;
  }
  if (d.tags && d.tags.length > 0) {
    html += `<div class="tooltip__row"><span class="tooltip__label">Теги:</span><span class="tooltip__value">${d.tags
      .map(escapeHtml)
      .join(", ")}</span></div>`;
  }
  if (d.filePath) {
    html += `<div class="tooltip__row"><span class="tooltip__label">Файл:</span><span class="tooltip__value" style="font-size:11px">${escapeHtml(
      d.filePath,
    )}</span></div>`;
    html += `<div style="margin-top:10px"><button class="tooltip__btn js-open-file" data-file="${escapeHtml(
      d.filePath,
    )}">📂 Открыть файл</button></div>`;
  }

  const refs = d.fqidRefs || [];
  if (refs.length > 0) {
    html +=
      '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">';
    html += `<div class="tooltip__label" style="margin-bottom:8px">FQID ссылки (${refs.length}):</div>`;
    html += '<div class="tooltip__fqid-list">';
    refs.forEach((ref) => {
      html += '<div class="tooltip__ref">';
      html += `<div class="tooltip__fqid js-goto-domain" data-domain="${escapeHtml(
        ref.targetDomainId || "",
      )}" style="cursor:pointer">${escapeHtml(ref.fullFQID)}</div>`;
      html += `<div class="tooltip__path">${escapeHtml(ref.propertyPath)}</div>`;
      html += `<button class="tooltip__btn js-open-file" data-file="${escapeHtml(
        ref.filePath || "",
      )}" data-fqid="${escapeHtml(ref.fullFQID || "")}">📂 Открыть</button>`;
      html += "</div>";
    });
    html += "</div></div>";
  }
  html += "</div>";
  return html;
}

export function buildEdgeTooltip(edge: RFEdge, refs: FQIDRef[]): string {
  const fullLabel = (edge.data && edge.data.fullLabel) || edge.label || edge.id;
  const link = (edge.data && edge.data.linkData) || {};
  const nameFrom = link.nameFrom || {};
  const side1Text = nameFrom.side1 || link.sourceEntity || null;
  const side2Text = nameFrom.side2 || link.targetEntity || null;
  const side1Domain = edge.data && edge.data.side1Domain;
  const side2Domain = edge.data && edge.data.side2Domain;

  function renderSide(
    labelText: string,
    text: string | null,
    domain: string | null,
  ): string {
    if (!text) return "";
    const clickable = !!domain;
    let h = `<div class="tooltip__row"><span class="tooltip__label">${labelText}</span>`;
    if (clickable) {
      h += `<span class="tooltip__value js-goto-domain" data-domain="${escapeHtml(
        domain,
      )}" style="cursor:pointer;color:var(--accent-hover);text-decoration:underline dotted">${escapeHtml(
        text,
      )}</span>`;
    } else {
      h += `<span class="tooltip__value" style="color:var(--text-400)">${escapeHtml(
        text,
      )}</span>`;
    }
    return h + "</div>";
  }

  let html = `<div class="tooltip__header">Связь: ${escapeHtml(fullLabel)}</div>`;
  html += '<div class="tooltip__body">';
  html += renderSide("Сторона 1:", side1Text, side1Domain);
  html += renderSide("Сторона 2:", side2Text, side2Domain);

  if (refs.length > 0) {
    html += `<div class="tooltip__label" style="margin-top:8px;margin-bottom:8px">FQID ссылки (${refs.length}):</div>`;
    html += '<div class="tooltip__fqid-list">';
    refs.forEach((ref) => {
      html += '<div class="tooltip__ref">';
      html += `<div class="tooltip__fqid">${escapeHtml(ref.fullFQID)}</div>`;
      if (ref.propertyPath) {
        html += `<div class="tooltip__path">${escapeHtml(ref.propertyPath)}</div>`;
      }
      html += `<button class="tooltip__btn js-open-file" data-file="${escapeHtml(
        ref.filePath || "",
      )}" data-fqid="${escapeHtml(ref.fullFQID || "")}">📂 Открыть</button>`;
      html += "</div>";
    });
    html += "</div>";
  }
  html += "</div>";
  return html;
}
