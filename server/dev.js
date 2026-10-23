import { spawn } from "node:child_process";
const children = [
  spawn(process.execPath, ["--watch", "server/index.js"], {
    stdio: "inherit",
    env: {
      ...process.env,
      CHAO_DEMO: process.env.CHAO_DEMO || "1",
      DATA_DIR: process.env.DATA_DIR || "./data/demo",
    },
  }),
  spawn("npx", ["vite", "--host", "0.0.0.0"], { stdio: "inherit" }),
];
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    children.forEach((p) => p.kill(signal));
    process.exit();
  });
children.forEach((p) =>
  p.on("exit", (code) => {
    children.forEach((c) => c.kill());
    process.exit(code || 0);
  }),
);
