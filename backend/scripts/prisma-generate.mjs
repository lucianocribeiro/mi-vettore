import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const schema = join(root, "prisma", "schema.prisma");
const result = spawnSync(
  "npx",
  ["prisma", "generate", `--schema=${schema}`],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL || "postgresql://x:x@127.0.0.1:5432/x",
      DIRECT_URL:
        process.env.DIRECT_URL || "postgresql://x:x@127.0.0.1:5432/x",
    },
  }
);

process.exit(result.status ?? 1);
