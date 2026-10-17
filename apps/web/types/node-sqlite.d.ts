// Node 24 runtime API; the existing Node 20 types predate native SQLite.
declare module "node:sqlite" {
  type SQLInputValue = string | number | bigint | null | Uint8Array;
  export class DatabaseSync {
    constructor(path: string, options?: { readOnly?: boolean });
    exec(sql: string): void;
    close(): void;
    prepare(sql: string): {
      all(...values: SQLInputValue[]): Record<string, unknown>[];
      get(...values: SQLInputValue[]): Record<string, unknown> | undefined;
      run(...values: SQLInputValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    };
  }
}
