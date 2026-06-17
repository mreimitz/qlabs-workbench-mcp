import Database from "better-sqlite3";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { RunRecord } from "@qlabs/contracts";
import { controlApiMigrations } from "./migrations.js";

export type { RunRecord } from "@qlabs/contracts";

export type McpServerRef = { name: string; url: string };
export type RegistryServer = McpServerRef & { enabled: boolean };
export type RegistryState = { servers: RegistryServer[] };

type StoreOptions = {
  dbPath: string;
  controlDataRoot: string;
  bootstrapFromJson: boolean;
};

type RegistryRow = {
  name: string;
  enabled: number;
};

type RunRow = {
  id: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  server_name: string;
  tool_name: string;
  status: "success" | "error";
  arguments_json: string;
  response_json: string;
  error: string | null;
};

const nowIso = () => new Date().toISOString();

const readJsonFile = async <T,>(filePath: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await fsp.readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
};

const serializeJson = (value: unknown) => JSON.stringify(value ?? null);

const parseJson = (value: string) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const toRunRecord = (row: RunRow): RunRecord => ({
  id: row.id,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  durationMs: row.duration_ms,
  serverName: row.server_name,
  toolName: row.tool_name,
  status: row.status,
  arguments: parseJson(row.arguments_json),
  response: parseJson(row.response_json),
  ...(row.error ? { error: row.error } : {}),
});

export const createSqliteStore = (options: StoreOptions) => {
  fs.mkdirSync(path.dirname(options.dbPath), { recursive: true });
  const db = new Database(options.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const migrate = () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);

    const current = db
      .prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations")
      .get() as { version: number };

    db.transaction(() => {
      for (const migration of controlApiMigrations) {
        if (migration.version <= current.version) continue;
        db.exec(migration.sql);
        db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
          migration.version,
          nowIso(),
        );
      }
    })();
  };

  const registryCount = () =>
    (db.prepare("SELECT COUNT(*) AS count FROM control_registry_servers").get() as { count: number }).count;

  const runCount = () => (db.prepare("SELECT COUNT(*) AS count FROM control_runs").get() as { count: number }).count;

  const bootstrapFromJson = async () => {
    if (!options.bootstrapFromJson) return;

    if (registryCount() === 0) {
      const registry = await readJsonFile<RegistryState>(path.join(options.controlDataRoot, "registry.json"), { servers: [] });
      const insertRegistry = db.prepare(`
        INSERT OR REPLACE INTO control_registry_servers (name, enabled, updated_at)
        VALUES (@name, @enabled, @updated_at)
      `);
      db.transaction(() => {
        for (const server of registry.servers ?? []) {
          if (!server.name) continue;
          insertRegistry.run({
            name: server.name,
            enabled: server.enabled ? 1 : 0,
            updated_at: nowIso(),
          });
        }
      })();
    }

    if (runCount() === 0) {
      const runs = await readJsonFile<RunRecord[]>(path.join(options.controlDataRoot, "runs.json"), []);
      const insertRun = db.prepare(`
        INSERT OR REPLACE INTO control_runs (
          id,
          started_at,
          finished_at,
          duration_ms,
          server_name,
          tool_name,
          status,
          arguments_json,
          response_json,
          error
        ) VALUES (
          @id,
          @started_at,
          @finished_at,
          @duration_ms,
          @server_name,
          @tool_name,
          @status,
          @arguments_json,
          @response_json,
          @error
        )
      `);
      db.transaction(() => {
        for (const run of runs) {
          insertRun.run({
            id: run.id,
            started_at: run.startedAt,
            finished_at: run.finishedAt,
            duration_ms: run.durationMs,
            server_name: run.serverName,
            tool_name: run.toolName,
            status: run.status,
            arguments_json: serializeJson(run.arguments),
            response_json: serializeJson(run.response),
            error: run.error ?? null,
          });
        }
      })();
    }
  };

  const ensureDefaults = (servers: McpServerRef[]) => {
    const insertDefault = db.prepare(`
      INSERT OR IGNORE INTO control_registry_servers (name, enabled, updated_at)
      VALUES (?, 1, ?)
    `);
    const updateTimestamp = nowIso();
    db.transaction(() => {
      for (const server of servers) {
        insertDefault.run(server.name, updateTimestamp);
      }
    })();
  };

  return {
    async initialize(defaultServers: McpServerRef[]) {
      migrate();
      await bootstrapFromJson();
      ensureDefaults(defaultServers);
    },

    async ensureRegistry(defaultServers: McpServerRef[]): Promise<RegistryState> {
      ensureDefaults(defaultServers);
      const rows = db
        .prepare("SELECT name, enabled FROM control_registry_servers")
        .all() as RegistryRow[];
      const enabledByName = new Map(rows.map((row) => [row.name, row.enabled === 1]));
      return {
        servers: defaultServers.map((server) => ({
          ...server,
          enabled: enabledByName.get(server.name) ?? true,
        })),
      };
    },

    async setServerEnabled(defaultServers: McpServerRef[], name: string, enabled: boolean): Promise<RegistryState> {
      ensureDefaults(defaultServers);
      db.prepare(
        `
          UPDATE control_registry_servers
          SET enabled = ?, updated_at = ?
          WHERE name = ?
        `,
      ).run(enabled ? 1 : 0, nowIso(), name);
      return this.ensureRegistry(defaultServers);
    },

    async listRuns(): Promise<RunRecord[]> {
      const rows = db
        .prepare(
          `
            SELECT
              id,
              started_at,
              finished_at,
              duration_ms,
              server_name,
              tool_name,
              status,
              arguments_json,
              response_json,
              error
            FROM control_runs
            ORDER BY started_at DESC, id DESC
          `,
        )
        .all() as RunRow[];
      return rows.map(toRunRecord);
    },

    async appendRun(record: RunRecord): Promise<void> {
      db.prepare(
        `
          INSERT OR REPLACE INTO control_runs (
            id,
            started_at,
            finished_at,
            duration_ms,
            server_name,
            tool_name,
            status,
            arguments_json,
            response_json,
            error
          ) VALUES (
            @id,
            @started_at,
            @finished_at,
            @duration_ms,
            @server_name,
            @tool_name,
            @status,
            @arguments_json,
            @response_json,
            @error
          )
        `,
      ).run({
        id: record.id,
        started_at: record.startedAt,
        finished_at: record.finishedAt,
        duration_ms: record.durationMs,
        server_name: record.serverName,
        tool_name: record.toolName,
        status: record.status,
        arguments_json: serializeJson(record.arguments),
        response_json: serializeJson(record.response),
        error: record.error ?? null,
      });
      db.prepare(
        `
          DELETE FROM control_runs
          WHERE id IN (
            SELECT id FROM control_runs
            ORDER BY started_at DESC, id DESC
            LIMIT -1 OFFSET 50
          )
        `,
      ).run();
    },

    async getMigrationVersion(): Promise<number> {
      return (db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as { version: number }).version;
    },

    async close(): Promise<void> {
      db.close();
    },
  };
};
