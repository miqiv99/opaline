const host = widget.target || "192.168.31.1";
const port = Number(widget.endpoint || "80");
const refreshMs = opaline.refreshMs(widget.refresh || "5s");

async function tick() {
  const result = await opaline.net.tcp(host, port, { timeoutMs: 2000 });
  opaline.render({
    title: `TCP ${host}:${port}`,
    status: result.ok ? "open" : "closed/unreachable",
    elapsedMs: result.elapsedMs,
    error: result.error,
    checkedAt: new Date().toLocaleTimeString(),
  });
}

await tick();
opaline.every(refreshMs, tick);
