declare module "express-mysql-session" {
  import type session from "express-session";

  interface StoreOptions {
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
    new (options: StoreOptions, connection: import("mysql2/promise").Pool): session.Store;
  };

  export = createMySQLSession;
}
