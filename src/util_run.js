const { spawn } = require("child_process");

function run(cmd, args, { onLine } = {}){
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const handle = (buf) => {
      const s = buf.toString("utf8");
      out += s;
      s.split("\n").filter(Boolean).forEach((l) => onLine?.(l));
    };
    p.stdout.on("data", handle);
    p.stderr.on("data", handle);
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) return resolve(out);
      reject(new Error(`${cmd} exited ${code}`));
    });
  });
}

module.exports = { run };
