import fs from "fs";
import path from "path";
import type { IncomingMessage, ServerResponse } from "http";
import { readJsonBody } from "../../core/remote/http-client";
import {
  runValidation,
  ValidationContext,
} from "../../core/validation/validate";
import type { ServerState } from "../state";

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

  req.on("close", () => {
    if (state.validation) {
      // validated context's state is stored inside
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
  // state.validation's internal state can be cancelled via context
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end('{"ok":true}');
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
