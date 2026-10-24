import fs from "fs";
import path from "path";
import type { IncomingMessage, ServerResponse } from "http";
import { readJsonBody } from "../../core/remote/http-client";
import {
  runValidation,
  ValidationContext,
} from "../../core/validation/validate";
import type { ServerState } from "../state";
import { apiLogin } from "../../core/remote/auth";
import { apiCheckRobject } from "../../core/remote/schemas-loader";

export async function handleValidateStream(
  req: IncomingMessage,
  res: ServerResponse,
  state: ServerState,
): Promise<void> {
  if (!state.validation) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(
      "data: " +
        JSON.stringify({
          type: "error",
          message: "Валидация доступна только в режиме --server",
        }) +
        "\n\n",
    );
    res.end();
    return;
  }

  const body = await readJsonBody(req);
  const domainIds = Array.isArray(body.domainIds) ? body.domainIds : [];

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Клиент оборвал SSE (AbortController.abort() на фронте или закрытие вкладки) —
  // останавливаем воркеры, чтобы они не продолжали дёргать API валидации.
  res.on("close", () => {
    if (state.validation?.state && !res.writableEnded) {
      state.validation.state.cancelled = true;
    }
  });

  try {
    await runValidation(res, domainIds, state.validation);
  } catch (err: any) {
    try {
      res.write(
        "data: " +
          JSON.stringify({ type: "error", message: err.message }) +
          "\n\n",
      );
      res.end();
    } catch {
      /* ignore */
    }
  }
}

export function handleValidateCancel(
  req: IncomingMessage,
  res: ServerResponse,
  state: ServerState,
): void {
  const ctx = state.validation;
  const wasRunning = !!(ctx?.state && !ctx.state.cancelled);
  if (ctx?.state) {
    ctx.state.cancelled = true;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, cancelled: wasRunning }));
}

export function handleValidationResults(
  req: IncomingMessage,
  res: ServerResponse,
  rootDir: string,
): void {
  try {
    const f = path.join(rootDir, "_validation.json");
    if (fs.existsSync(f)) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(fs.readFileSync(f, "utf8"));
    } else {
      res.writeHead(204);
      res.end();
    }
  } catch {
    res.writeHead(500);
    res.end('{"error":"read failed"}');
  }
}

export function handleValidationAvailable(
  req: IncomingMessage,
  res: ServerResponse,
  state: ServerState,
): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ available: !!state.credentials }));
}

export async function handleValidateSingle(
  req: IncomingMessage,
  res: ServerResponse,
  state: ServerState,
): Promise<void> {
  if (!state.validation) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Валидация доступна только в режиме --server (нужны креды)",
      }),
    );
    return;
  }

  let body: any;
  try {
    body = await readJsonBody(req);
  } catch (e: any) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Некорректный JSON: " + e.message }));
    return;
  }

  const sourceCode = body?.sourceCode;
  if (typeof sourceCode !== "string") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "sourceCode обязателен" }));
    return;
  }

  const ctx = state.validation;

  try {
    // Логин, если токена нет
    if (!ctx.credentials.token) {
      ctx.credentials.token = await apiLogin(
        ctx.credentials.loginUrl,
        ctx.credentials.username,
        ctx.credentials.password,
        ctx.credentials.secure,
      );
    }

    let response = await apiCheckRobject(
      ctx.credentials.apiUrl,
      ctx.credentials.token,
      ctx.credentials.tenantId,
      sourceCode,
      ctx.credentials.secure,
    );

    // Перелогин при 401
    if (response.status === 401) {
      ctx.credentials.token = null;
      ctx.credentials.token = await apiLogin(
        ctx.credentials.loginUrl,
        ctx.credentials.username,
        ctx.credentials.password,
        ctx.credentials.secure,
      );
      response = await apiCheckRobject(
        ctx.credentials.apiUrl,
        ctx.credentials.token,
        ctx.credentials.tenantId,
        sourceCode,
        ctx.credentials.secure,
      );
    }

    if (response.status !== 200) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: `HTTP ${response.status} от сервера валидации`,
        }),
      );
      return;
    }

    const checkResult = response.json?.data?.checkRobject;
    if (!checkResult) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Некорректный ответ от сервера" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        isValid: checkResult.isValid,
        diagnostics: checkResult.diagnostics || [],
        validatedAt: new Date().toISOString(),
      }),
    );
  } catch (e: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
}