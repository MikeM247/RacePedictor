export const LOCAL_DATABASE_SCHEMA_VERSION: number;

export type LocalStatement = {
  run(...parameters: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...parameters: unknown[]): Record<string, unknown> | undefined;
  all(...parameters: unknown[]): Array<Record<string, unknown>>;
};

export type LocalDatabaseConnection = {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): LocalStatement;
};

export function openLocalDatabase(options: {
  databasePath: string;
  readOnly?: boolean;
}): LocalDatabaseConnection;
