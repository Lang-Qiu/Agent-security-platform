import type { DatabaseSync } from "node:sqlite";

export interface SqliteSandboxSecurityDatabase {
  transaction<T>(operation: (database: DatabaseSync) => T): T;
  read<T>(operation: (database: DatabaseSync) => T): T;
  checkpointAndClose(): void;
  readonly state: "open" | "closed";
}
