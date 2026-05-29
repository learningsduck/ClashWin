declare module "sql.js" {
  export interface Database {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string): void;
    prepare(sql: string): Statement;
    export(): Uint8Array;
  }
  export interface Statement {
    bind(values: unknown[]): void;
    step(): boolean;
    get(): unknown[] | undefined;
    free(): void;
  }
  export interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }
  export default function initSqlJs(config?: SqlJsConfig): Promise<{
    Database: new (data?: Uint8Array) => Database;
  }>;
}
