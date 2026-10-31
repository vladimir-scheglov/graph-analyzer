import type { CheatsheetRecipe } from "../types";

export const identifierFromDictionary: CheatsheetRecipe = {
  id: "identifier-from-dictionary",
  title: "Идентификатор с префиксом из справочника",
  description:
    "Identifier с prefixRules: префикс подставляется из связанной сущности-справочника",
  sections: ["entities"],
  md: `
# Идентификатор с префиксом из справочника

## Что делаем

Атрибут типа Identifier, в шаблоне которого \`{@prefix}\` подставляется из атрибута другой сущности-справочника.

## Схема

Есть \`Incident\` с атрибутом \`incidentType\` (String), и справочник \`IncidentTypeDict\` с полями \`fullName\` и \`shortCode\`.

Хотим, чтобы идентификатор имел вид \`ATK-25-10-08-0001\`, где \`ATK\` — \`shortCode\` типа инцидента.

## Шаги

1. Задайте \`template\` с литералом \`{@prefix}\`.
2. Задайте \`defaultPrefix\` — он сработает, если ни одно правило не подошло.
3. Опишите \`prefixRules\` — какие атрибуты сравнивать и откуда брать префикс.

## Полный пример

\`\`\`yaml
entities:
  - id: Incident
    attributes:
      - id: incidentType
        dataType: String
      - id: incidentId
        name: Идентификатор инцидента
        dataType: Identifier
        template: "{@prefix}-{@YY}/{@MM}/{@DD}-{@inc}"
        defaultPrefix: INC
        incrementTemplate: "0000"
        prefixRules:
          - id: PrefixByType
            attribute: incidentType
            source:
              entity: dictionaries.test/IncidentTypeDict
              key: fullName
              value: shortCode
\`\`\`

## Как работает

1. Система ищет первое правило, в котором значение \`attribute\` текущей сущности (\`incidentType\`) совпадает со значением \`key\` сущности-справочника (\`fullName\`).
2. Если совпало — в префикс подставляется \`value\` (\`shortCode\`).
3. Если ни одно правило не сработало — \`defaultPrefix\`.

## Проверка

Создайте инцидент с \`incidentType = "Атака"\` (если у неё \`shortCode = "ATK"\`) — получите \`ATK-25-10-08-0001\`.
`,
};
