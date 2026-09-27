#!/usr/bin/env node
// PROTOTYPE, throwaway. Answers: can an inline widget reach a localhost server (fetch / POST / iframe)?
// Logs every request to localhost-probe.log next to this file.
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LOG = join(dirname(fileURLToPath(import.meta.url)), "localhost-probe.log");
const PORT = Number(process.env.PORT ?? 47613);

createServer((req, res) => {
  let body = "";
  req.on("data", d => (body += d));
  req.on("end", () => {
    appendFileSync(LOG, `${new Date().toISOString()} ${req.method} ${req.url} origin=${req.headers.origin ?? "-"} bytes=${body.length} ${body.slice(0, 300)}\n`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.url.startsWith("/frame")) {
      res.setHeader("Content-Type", "text/html");
      return res.end(`<body style="background:#264;color:#fff;font:14px system-ui;margin:0;padding:8px">iframe from localhost:${PORT} loaded</body>`);
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, method: req.method, path: req.url, received: body.length }));
  });
}).listen(PORT, "127.0.0.1", () => console.log(`listening on http://127.0.0.1:${PORT}`));
