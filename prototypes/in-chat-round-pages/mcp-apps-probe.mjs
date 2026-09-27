#!/usr/bin/env node
// PROTOTYPE, throwaway. Answers: does Claude Code render a LOCAL stdio server's MCP App?
// Zero deps: hand-rolled JSON-RPC over stdio. Every message in/out is appended to probe.log
// next to this file so we can see what the client advertises at initialize.
import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LOG = join(dirname(fileURLToPath(import.meta.url)), "probe.log");
const log = (dir, msg) => appendFileSync(LOG, `${new Date().toISOString()} ${dir} ${JSON.stringify(msg)}\n`);

const UI_URI = "ui://visual-grilling/round";
const ROUND_HTML = `<!doctype html><html><body style="font-family:system-ui;background:#1e1e1e;color:#ddd;padding:16px">
<h3>Round 1 — PROTOTYPE MCP App</h3>
<p>Q1. Where should round files live?</p>
<button id="a">A. OS temp dir</button> <button id="b">B. .visual-grilling/ in repo</button>
<pre id="s">no answer yet</pre>
<script>
  // MCP Apps: the view talks to the host over postMessage JSON-RPC. ui/message pushes a user message.
  let id = 0;
  const send = (method, params) => parent.postMessage({ jsonrpc: "2.0", id: ++id, method, params }, "*");
  send("ui/initialize", { appCapabilities: {}, clientInfo: { name: "round-probe", version: "0" }, protocolVersion: "2026-01-26" });
  window.addEventListener("message", e => { document.getElementById("s").textContent = "host said: " + JSON.stringify(e.data).slice(0, 400); });
  for (const b of ["a", "b"]) document.getElementById(b).onclick = () => {
    send("ui/message", { role: "user", content: [{ type: "text", text: "ROUND SUBMISSION (MCP App): Q1 = " + b.toUpperCase() }] });
    document.getElementById("s").textContent = "sent ui/message for " + b;
  };
</script></body></html>`;

const reply = (id, result) => { const m = { jsonrpc: "2.0", id, result }; log("OUT", m); process.stdout.write(JSON.stringify(m) + "\n"); };

function handle(msg) {
  log("IN ", msg);
  const { id, method, params } = msg;
  if (id === undefined) return; // notification
  switch (method) {
    case "initialize": {
      const ui = params?.capabilities?.extensions?.["io.modelcontextprotocol/ui"];
      log("NOTE", { clientAdvertisesMcpAppsUi: !!ui, clientInfo: params?.clientInfo });
      return reply(id, {
        protocolVersion: params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "round-probe", version: "0.0.0" },
      });
    }
    case "tools/list":
      return reply(id, { tools: [{
        name: "show_round",
        description: "PROTOTYPE: show a visual-grilling round page as an MCP App view.",
        inputSchema: { type: "object", properties: {} },
        _meta: { ui: { resourceUri: UI_URI }, "ui/resourceUri": UI_URI },
      }] });
    case "tools/call":
      return reply(id, { content: [{ type: "text", text: "Round 1 shown (if your host renders MCP Apps). If you only see this text, the ui:// view was dropped." }] });
    case "resources/list":
      return reply(id, { resources: [{ uri: UI_URI, name: "round page", mimeType: "text/html;profile=mcp-app" }] });
    case "resources/read":
      return reply(id, { contents: [{ uri: UI_URI, mimeType: "text/html;profile=mcp-app", text: ROUND_HTML }] });
    default:
      return reply(id, {});
  }
}

let buf = "";
process.stdin.on("data", d => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) handle(JSON.parse(line)); }
});
