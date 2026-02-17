const { spawn } = require("child_process");

/**
 * Run a command and stream output.
 *
 * Options:
 * - onLine(line): callback for each non-empty line
 * - cwd: working directory
 * - env: extra environment variables
 * - capture: if true, resolves with combined stdout/stderr
 * - allowFail: if true, resolves with output even when exit code != 0
 */
function run(cmd, args, { onLine, cwd, env, capture = true, allowFail = false } = {}){
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      cwd: cwd || undefined,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    const handle = (buf) => {
      const s = buf.toString("utf8");
      if (capture) out += s;
      s.split("\n").filter(Boolean).forEach((l) => onLine?.(l));
    };
    p.stdout.on("data", handle);
    p.stderr.on("data", handle);
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0 || allowFail) return resolve(out);
      reject(new Error(`${cmd} exited ${code}`));
    });
  });
}

module.exports = { run };
