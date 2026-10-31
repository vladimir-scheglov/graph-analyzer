import type { CheatsheetSection } from "../types";

export const sequences: CheatsheetSection = {
  id: "sequences",
  label: "Последовательности",
  icon: "linear_scale",
  docsRef: "§ Последовательности — стр. 307",
  md: `
# Последовательности (sequences)

## Назначение

Единый счётчик для атрибутов типа \`Identifier\` без сегментации (простая последовательность чисел).

## Обязательные поля

| Поле | Описание |
|---|---|
| \`id\` | Data ID |

## Опциональные поля

| Поле | По умолчанию | Описание |
|---|---|---|
| \`startFrom\` | \`1\` | Начальное значение |
| \`description\` | — | Описание |

## Пример

\`\`\`yaml
sequences:
  - id: IncidentSequence
    startFrom: 1
    description: Последовательность для идентификаторов инцидентов
\`\`\`

## Использование в атрибуте

\`\`\`yaml
entities:
  - id: Incident
    attributes:
      - id: incidentId
        name: Идентификатор
        dataType: Identifier
        sequence: IncidentSequence
\`\`\`

## Кросс-доменная ссылка

\`\`\`yaml
- id: ticketId
  dataType: Identifier
  sequence: other.domain/SequenceId
\`\`\`

## Ведущие нули

\`\`\`yaml
- id: incidentId
  dataType: Identifier
  sequence: IncidentSequence
  incrementTemplate: "0000"   # 1 → 0001
\`\`\`

## Когда НЕ использовать

Если нужен префикс или дата в идентификаторе — не \`sequence\`, а \`template\` + \`prefixRules\` (см. секцию Сущности).
`,
};
