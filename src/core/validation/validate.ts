import fs from "fs";
import type { ServerResponse } from "http";
import type {
  RemoteCredentials,
  ValidationResult,
  ValidationStats,
} from "../../shared/types";
import { apiCheckRobject } from "../remote/schemas-loader";
import { loadYaml } from "../analyzer/yaml-loader";
import type { DomainAnalyzer } from "../analyzer/DomainAnalyzer";
import { apiLogin } from "../remote/auth";

interface ValidationState {
  cancelled: boolean;
  startTime: number;
}

export interface ValidationContext {
  credentials: RemoteCredentials;
  analyzer: DomainAnalyzer;
  state: ValidationState | null;
}

async function ensureToken(ctx: ValidationContext): Promise<string> {
  if (ctx.credentials.token) return ctx.credentials.token;
  const token = await apiLogin(
    ctx.credentials.loginUrl,
    ctx.credentials.username,
    ctx.credentials.password,
    ctx.credentials.secure,
  );
  ctx.credentials.token = token;
  return token;
}

function send(res: ServerResponse, obj: any): void {
  try {
    res.write("data: " + JSON.stringify(obj) + "\n\n");
  } catch {
    /* ignore */
  }
}

export async function runValidation(
  res: ServerResponse,
  domainIds: string[],
  ctx: ValidationContext,
): Promise<void> {
  const state: ValidationState = { cancelled: false, startTime: Date.now() };
  ctx.state = state;

  const total = domainIds.length;
  send(res, { type: "start", total });

  try {
    await ensureToken(ctx);
  } catch (e: any) {
    send(res, { type: "error", message: "Логин: " + e.message });
    res.end();
    return;
  }

  const queue = domainIds.slice();
  const results: ValidationResult[] = [];
  let current = 0;

  const checkOne = async (domainId: string): Promise<ValidationResult> => {
    const domain = ctx.analyzer.getDomainsMap().get(domainId);
    if (!domain)
      return { domainId, status: "error", error: "Домен не найден в кэше" };

    let content: string;
    try {
      content = fs.readFileSync(domain.filePath, "utf8");
    } catch (e: any) {
      return {
        domainId,
        status: "error",
        error: "Файл недоступен: " + e.message,
      };
    }

    try {
      const { data } = loadYaml(content);
      if (!data || typeof data !== "object" || data.type !== "domain") {
        return { domainId, status: "skip" };
      }
    } catch (e: any) {
      return { domainId, status: "error", error: "YAML parse: " + e.message };
    }

    let response;
    try {
      response = await apiCheckRobject(
        ctx.credentials.apiUrl,
        ctx.credentials.token!,
        ctx.credentials.tenantId,
        content,
        ctx.credentials.secure,
      );
    } catch (e: any) {
      return { domainId, status: "error", error: e.message };
    }

    if (response.status === 401) {
      try {
        ctx.credentials.token = null;
        const newToken = await ensureToken(ctx);
        response = await apiCheckRobject(
          ctx.credentials.apiUrl,
          newToken,
          ctx.credentials.tenantId,
          content,
          ctx.credentials.secure,
        );
      } catch (e: any) {
        return {
          domainId,
          status: "error",
          error: "Перелогин не удался: " + e.message,
        };
      }
    }

    if (response.status !== 200) {
      return { domainId, status: "error", error: "HTTP " + response.status };
    }

    const checkResult = response.json?.data?.checkRobject;
    if (!checkResult)
      return { domainId, status: "error", error: "Некорректный ответ" };

    if (checkResult.isValid) return { domainId, status: "valid" };
    return {
      domainId,
      status: "invalid",
      diagnostics: checkResult.diagnostics || [],
    };
  };

  const worker = async (): Promise<void> => {
    while (queue.length > 0 && !state.cancelled) {
      const domainId = queue.shift()!;
      let result: ValidationResult;
      try {
        result = await checkOne(domainId);
      } catch (e: any) {
        result = { domainId, status: "error", error: e.message };
      }

      if (state.cancelled) break;
      current++;
      result.current = current;
      result.total = total;
      results.push(result);
      send(res, { type: "progress", ...result });
    }
  };

  const limit = Math.min(3, total);
  await Promise.all(Array.from({ length: limit }, () => worker()));

  const stats: ValidationStats = {
    total,
    processed: results.length,
    valid: results.filter((r) => r.status === "valid").length,
    invalid: results.filter((r) => r.status === "invalid").length,
    errors: results.filter((r) => r.status === "error").length,
    elapsedMs: Date.now() - state.startTime,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    server: ctx.credentials.server,
    cancelled: state.cancelled,
    stats,
    results,
  };

  try {
    fs.writeFileSync(
      require("path").join(ctx.analyzer.getRootDir(), "_validation.json"),
      JSON.stringify(report, null, 2),
      "utf8",
    );
  } catch {
    /* ignore */
  }

  send(res, { type: "done", cancelled: state.cancelled, stats, results });
  res.end();

  ctx.state = null;
}
