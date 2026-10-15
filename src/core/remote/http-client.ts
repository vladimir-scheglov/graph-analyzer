import http from "http";
import https from "https";

export interface HTTPResponse<T = any> {
  status: number;
  json: T;
  raw: string;
}

export function httpPost<T = any>(
  url: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
  rejectUnauthorized = true,
): Promise<HTTPResponse<T>> {
  return new Promise((resolve, reject) => {
    let urlObj: URL;
    try {
      urlObj = new URL(url);
    } catch (e) {
      return reject(new Error("Invalid URL: " + url));
    }

    const isHttps = urlObj.protocol === "https:";
    const mod = isHttps ? https : http;
    const data = JSON.stringify(body);
    const headers: Record<string, string | number> = {
      Accept: "*/*",
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
      "apollo-require-preflight": "true",
      ...extraHeaders,
    };

    const opts: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: "POST",
      headers,
    };
    if (isHttps) opts.rejectUnauthorized = rejectUnauthorized;

    const req = mod.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        try {
          resolve({
            status: res.statusCode || 0,
            json: JSON.parse(text),
            raw: text,
          });
        } catch {
          reject(
            new Error(`Bad JSON (${res.statusCode}): ${text.slice(0, 300)}`),
          );
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

export function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}
