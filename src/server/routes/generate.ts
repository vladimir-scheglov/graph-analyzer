import type { IncomingMessage, ServerResponse } from "http";
import { readJsonBody } from "../../core/remote/http-client";
import { buildModelIndex } from "../../core/analyzer/model-builder";
import type { DomainAnalyzer } from "../../core/analyzer/DomainAnalyzer";
import { generateForEntity } from "../../core/analyzer/schema-generator";
import type { GeneratorProfile } from "../../core/analyzer/schema-generator/types";
import { getModelIndex } from "./model";

interface GenerateRequestBody {
  domainId: string;
  entityId: string;
  profile?: GeneratorProfile;
  options?: Record<string, unknown>;
}

export async function handleGenerateRequest(
  req: IncomingMessage,
  res: ServerResponse,
  analyzer: DomainAnalyzer,
): Promise<void> {
  let body: GenerateRequestBody;
  try {
    body = await readJsonBody(req);
  } catch (e: any) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Некорректный JSON: " + e.message }));
    return;
  }

  if (!body.domainId || !body.entityId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "domainId и entityId обязательны" }));
    return;
  }

  try {
    const allDomains = analyzer.getRawDomainsForModelIndex();
    // Используем кэш, если он актуален, иначе — пересобираем.
    const index = getModelIndex() ?? buildModelIndex(allDomains);
    const result = generateForEntity(allDomains, index, {
      domainId: body.domainId,
      entityId: body.entityId,
      profile: body.profile ?? "crud",
      options: body.options as any,
    });
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(result));
  } catch (e: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
}
