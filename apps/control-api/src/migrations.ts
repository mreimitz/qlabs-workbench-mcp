export type SqlMigration = {
  version: number;
  sql: string;
};

export const controlApiMigrations: SqlMigration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS control_registry_servers (
        name TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS control_runs (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        server_name TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('success', 'error')),
        arguments_json TEXT NOT NULL,
        response_json TEXT NOT NULL,
        error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_control_runs_started_at
        ON control_runs (started_at DESC);
    `,
  },
];
