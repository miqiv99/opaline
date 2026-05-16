const command = widget.query || "ipconfig";
const args = widget.endpoint ? widget.endpoint.split(/\s+/).filter(Boolean) : [];

const result = await opaline.shell.exec(command, args, { timeoutMs: 5000 });
opaline.render({
  command,
  args,
  code: result.code,
  timedOut: result.timedOut,
  elapsedMs: result.elapsedMs,
  stdout: result.stdout.trim(),
  stderr: result.stderr.trim(),
});
