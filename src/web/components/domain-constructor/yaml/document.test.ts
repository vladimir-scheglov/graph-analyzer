/*
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { YamlDocument, getRql } from "./document";
import { parseDomainSchema } from "./parser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const incidentsYaml = readFileSync(
  resolve(__dirname, "../__fixtures__/incidents.yaml"),
  "utf8",
);

test("YamlDocument: без правок toString() идентичен исходнику", () => {
  const doc = new YamlDocument(incidentsYaml);
  assert.deepEqual(doc.errors, []);
  assert.equal(doc.isDirty(), false);
  assert.equal(doc.toString(), incidentsYaml);
});

test("YamlDocument: сохраняет комментарии при точечной правке", () => {
  const doc = new YamlDocument(incidentsYaml);
  doc.set(["entities", 0, "attributes", 0, "name"], "Новый ID");
  const result = doc.toString();

  assert.ok(
    result.includes("#AD RESPONSE"),
    "комментарий #AD RESPONSE потерян",
  );
  assert.ok(
    result.includes("# Полноэкранная карточка"),
    "комментарий # Полноэкранная карточка потерян",
  );
  assert.ok(result.includes("Новый ID"), "новое значение не записано");
  assert.ok(doc.isDirty());
});

test("YamlDocument: парсит !rql в dataRules[].condition", () => {
  const doc = new YamlDocument(incidentsYaml);
  assert.deepEqual(doc.errors, []);
  const rules = doc.get(["dataRules"]) as unknown[];
  assert.ok(Array.isArray(rules) && rules.length > 0);
  const firstRule = rules[0] as Record<string, unknown>;
  // после eemeli/yaml !rql снимается, value — чистый RQL
  assert.equal(firstRule.condition, "verdict is NULL");
});

test("Parser: entities + attributes", () => {
  const doc = new YamlDocument(incidentsYaml);
  const { schema, pathMap } = parseDomainSchema(doc);

  assert.ok(schema.entities.length >= 4, "минимум 4 сущности в incidents.yaml");
  const incident = schema.entities.find((e) => e.id === "Incident");
  assert.ok(incident, "Incident не найден");
  assert.ok(incident!.attributes.length > 10, "у Incident много атрибутов");
  const projectId = incident!.attributes.find(
    (a) => a.id === "projectIdentifier",
  );
  assert.ok(projectId, "projectIdentifier не найден");
  assert.equal(projectId!.dataType, "Identifier");
  assert.equal(projectId!.template, "{@prefix}-{@YY}-{@MM}-{@inc}");

  // pathMap содержит ключ
  assert.ok(pathMap.has("entity:Incident"));
  assert.ok(pathMap.has("entity:Incident/attribute:projectIdentifier"));
});

test("Parser: linkages + dataTypes", () => {
  const doc = new YamlDocument(incidentsYaml);
  const { schema } = parseDomainSchema(doc);

  const linkage = schema.linkages.find(
    (l) => l.id === "Incident_AssetGroups_rel",
  );
  assert.ok(linkage, "linkage Incident_AssetGroups_rel не найден");
  assert.equal(linkage!.type, "n_n");
  assert.equal(linkage!.useForSearch, true);

  const statusType = schema.dataTypes.find((d) => d.id === "Status");
  assert.ok(statusType, "dataType Status не найден");
  assert.equal(statusType!.kind, "Workflow");
  assert.ok(statusType!.statuses && statusType!.statuses.length > 0);
});
*/
