import yaml from "js-yaml";

export interface YAMLLoadResult {
  data: any;
  errors: string[];
}

export function loadYaml(content: string): YAMLLoadResult {
  const errors: string[] = [];
  let data: any = null;

  try {
    data = yaml.load(content);
  } catch (error: any) {
    errors.push(`Standard: ${error.message}`);
    try {
      data = parseLenientYaml(content);
    } catch (error2: any) {
      errors.push(`Lenient: ${error2.message}`);
      try {
        data = yaml.load(cleanYamlContent(content));
      } catch (error3: any) {
        errors.push(`Cleaned: ${error3.message}`);
      }
    }
  }

  if (!data) {
    throw new Error(`Failed to parse YAML: ${errors.join("; ")}`);
  }
  return { data, errors };
}

export function parseLenientYaml(content: string): any {
  const implicit: yaml.Type[] = [
    new yaml.Type("tag:yaml.org,2002:str", {
      kind: "scalar",
      resolve: () => true,
      construct: (d: any) => d || "",
    }),
  ];

  const explicit: yaml.Type[] = [];

  const tagRegex = /![\w-]+/g;
  const tags = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(content)) !== null) tags.add(match[0]);

  for (const tag of tags) {
    if (tag === "!") continue;
    // Обе формы регистрации кастомного тега — так их видит js-yaml внутри.
    explicit.push(
      new yaml.Type(`tag:yaml.org,2002:${tag.slice(1)}`, {
        kind: "scalar",
        resolve: () => true,
        construct: (d: any) => d,
      }),
    );
    explicit.push(
      new yaml.Type(tag, {
        kind: "scalar",
        resolve: () => true,
        construct: (d: any) => d,
      }),
    );
  }

  // extend под капотом делает new Schema({ include: [this], implicit, explicit }),
  // но публичные типы это скрывают. extend — правильный способ.
  const schema = yaml.DEFAULT_SCHEMA.extend({ implicit, explicit });

  return yaml.load(content, { schema });
}

export function cleanYamlContent(content: string): string {
  return content
    .split("\n")
    .map((line) => line.replace(/![\w-]+/g, "").replace(/[*&]/g, ""))
    .filter((line) => !line.includes("!!binary") && !line.includes("!!python"))
    .join("\n");
}
