const host = widget.target || "192.168.31.1";
const refreshMs = opaline.refreshMs(widget.refresh || "2s");
const historyKey = `ping-history:${host}`;

async function readHistory() {
  return (await opaline.storage.get(historyKey)) || [];
}

async function tick() {
  const result = await opaline.net.ping(host, { timeoutMs: 2000 });
  const history = (await readHistory()).slice(-9);
  history.push({
    at: new Date().toLocaleTimeString(),
    ok: result.ok,
    elapsedMs: result.elapsedMs,
    code: result.code,
  });
  await opaline.storage.set(historyKey, history);

  opaline.render({
    title: `Ping ${host}`,
    status: result.ok ? "online" : "offline",
    elapsedMs: result.elapsedMs,
    lastCode: result.code,
    recent: history,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  });
}

await tick();
opaline.every(refreshMs, tick);
