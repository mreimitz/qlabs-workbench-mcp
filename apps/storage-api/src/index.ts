import express, { Request, Response } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import type { Dirent } from "node:fs";

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const envFlag = (value: string | undefined, fallback = false) => {
  if (!value) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
};

const port = Number.parseInt(process.env.PORT ?? "4100", 10);
const storageRoot = requiredEnv("STORAGE_ROOT");
const seedDemoContent = envFlag(process.env.SEED_DEMO_CONTENT, true);

const safeJoin = (root: string, inputPath: string) => {
  const normalized = path.posix.normalize(`/${inputPath}`).slice(1);
  const fullPath = path.posix.join(root, normalized);
  const normalizedRoot = path.posix.normalize(root);
  const normalizedFullPath = path.posix.normalize(fullPath);
  if (normalizedFullPath !== normalizedRoot && !normalizedFullPath.startsWith(`${normalizedRoot}/`)) {
    throw new Error("invalid path");
  }
  return fullPath;
};

const ensureDir = async (p: string) => {
  await fs.mkdir(p, { recursive: true });
};

const writeFileIfMissing = async (targetPath: string, contents: string) => {
  try {
    await fs.access(targetPath);
  } catch {
    await ensureDir(path.posix.dirname(targetPath));
    await fs.writeFile(targetPath, contents, "utf8");
  }
};

const seedStorage = async () => {
  if (!seedDemoContent) return;

  await ensureDir(storageRoot);
  await ensureDir(path.posix.join(storageRoot, "docs"));
  await ensureDir(path.posix.join(storageRoot, "notes"));
  await ensureDir(path.posix.join(storageRoot, "playwright"));

  await writeFileIfMissing(
    path.posix.join(storageRoot, "docs", "example.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>QLabs Example Document</title>
  </head>
  <body>
    <main>
      <h1>QLabs Workbench Demo</h1>
      <p>This seeded HTML file is used by MarkItDown and Playwright smoke flows.</p>
      <ul>
        <li>Convert me with <code>markitdown_convert</code>.</li>
        <li>Screenshot me with <code>pw_screenshot</code>.</li>
      </ul>
    </main>
  </body>
</html>
`,
  );
  await writeFileIfMissing(
    path.posix.join(storageRoot, "notes", "todo.txt"),
    "Review service health, run demo tools, and inspect the seeded asset library.\n",
  );
  await writeFileIfMissing(
    path.posix.join(storageRoot, "playwright", "README.md"),
    "# Playwright demo\n\nUse `pw_get_title` or `pw_screenshot` against public sites, then store output in shared storage.\n",
  );
};

const app = express();
app.use(express.json({ limit: "20mb" }));

await seedStorage();

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, storageRoot, seeded: seedDemoContent });
});

app.get("/browse", async (req: Request, res: Response) => {
  const rel = typeof req.query.path === "string" ? req.query.path : "";
  const full = safeJoin(storageRoot, rel);
  await ensureDir(full);
  const entries = await fs.readdir(full, { withFileTypes: true });
  res.json({
    path: rel,
    entries: (entries as Dirent[]).map((e) => ({ name: e.name, kind: e.isDirectory() ? "folder" : "file" })),
  });
});

app.post("/folders", async (req: Request, res: Response) => {
  const rel = typeof req.body?.path === "string" ? req.body.path : "";
  const full = safeJoin(storageRoot, rel);
  await ensureDir(full);
  res.json({ ok: true });
});

app.post("/files", async (req: Request, res: Response) => {
  const rel = typeof req.body?.path === "string" ? req.body.path : "";
  const base64 = typeof req.body?.contentBase64 === "string" ? req.body.contentBase64 : "";
  const full = safeJoin(storageRoot, rel);
  await ensureDir(path.posix.dirname(full));
  const buf = Buffer.from(base64, "base64");
  await fs.writeFile(full, buf);
  res.json({ ok: true, bytesWritten: buf.byteLength });
});

app.get("/files", async (req: Request, res: Response) => {
  const rel = typeof req.query.path === "string" ? req.query.path : "";
  const full = safeJoin(storageRoot, rel);
  const buf = await fs.readFile(full);
  res.setHeader("content-type", "application/octet-stream");
  res.send(buf);
});

app.listen(port, "0.0.0.0");
