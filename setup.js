#!/usr/bin/env node
/**
 * Wrapper so you can run: `npm run setup` or `node setup.js`
 * It will call the bash setup script and install Node/steamcmd/etc.
 *
 * NOTE: Needs root. If not root, it will run `sudo ./setup.sh`.
 */
import { spawnSync } from "child_process";
import process from "process";

const isRoot = (process.getuid && process.getuid() === 0);

const cmd = isRoot ? "./setup.sh" : "sudo";
const args = isRoot ? [] : ["./setup.sh"];

const r = spawnSync(cmd, args, { stdio: "inherit" });
process.exit(r.status ?? 1);
