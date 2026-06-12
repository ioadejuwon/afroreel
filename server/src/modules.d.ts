declare module "express-mysql-session" {
  import type session from "express-session";

  interface StoreOptions {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    charset?: string;
    createDatabaseTable?: boolean;
    schema?: {
      tableName?: string;
      columnNames?: {
        session_id?: string;
        expires?: string;
        data?: string;
      };
    };
  }

  function createMySQLSession(sessionModule: typeof session): {
    new (options: StoreOptions): session.Store;
  };

  export = createMySQLSession;
}
