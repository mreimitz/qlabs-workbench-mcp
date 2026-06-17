import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const envExamplePath = path.join(root, ".env.example");
const envPath = path.join(root, ".env");
const localQpsPath = path.join(root, "local", "qps-toolkit");

const exists = async (targetPath) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const main = async () => {
  if (!(await exists(envPath))) {
    await fs.copyFile(envExamplePath, envPath);
    console.log("Created .env from .env.example");
  } else {
    console.log(".env already exists");
  }

  await fs.mkdir(localQpsPath, { recursive: true });
  console.log(`Ensured optional QPS mount path: ${path.relative(root, localQpsPath)}`);
  console.log("Local bootstrap complete");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
