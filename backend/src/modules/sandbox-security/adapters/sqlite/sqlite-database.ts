import { chmodSync, lstatSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, isAbsolute, resolve } from "node:path";

import type { SqliteSandboxSecurityDatabase } from "../../ports/sqlite-database.ts";
import {
  applySandboxSecurityMigrations,
  requiresSandboxSecurityForeignKeyRebuild,
  runSandboxSecurityQuickCheck
} from "./sqlite-migrations.ts";

const PRIVATE_PARENT_MASK = 0o077;
const PRIVATE_FILE_MODE = 0o600;

function fail(message: string): never {
  throw new Error(message);
}

function assertPrivateParent(parentPath: string): void {
  let entry;
  try {
    entry = lstatSync(parentPath);
  } catch {
    fail("sandbox security SQLite parent directory is unavailable");
  }
  if (!entry!.isDirectory() || entry!.isSymbolicLink()) {
    fail("sandbox security SQLite parent must be a real directory");
  }
  if ((entry!.mode & PRIVATE_PARENT_MASK) !== 0) {
    fail("sandbox security SQLite parent must not be group/other accessible");
  }
}

function assertRegularArtifact(path: string, label: string): void {
  let entry;
  try {
    entry = lstatSync(path);
  } catch {
    fail(`sandbox security SQLite ${label} disappeared`);
  }
  if (entry!.isSymbolicLink() || !entry!.isFile()) {
    fail(`sandbox security SQLite ${label} must be a regular file`);
  }
  chmodSync(path, PRIVATE_FILE_MODE);
  const secured = lstatSync(path);
  if (
    secured.isSymbolicLink() ||
    !secured.isFile() ||
    (secured.mode & 0o777) !== PRIVATE_FILE_MODE
  ) {
    fail(`sandbox security SQLite ${label} mode is not 0600`);
  }
}

function pathExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function assertSidecarBoundary(databasePath: string, parentPath: string): void {
  for (const sidecar of [`${databasePath}-wal`, `${databasePath}-shm`]) {
    if (!pathExists(sidecar)) {
      continue;
    }
    if (dirname(resolve(sidecar)) !== parentPath) {
      fail("sandbox security SQLite sidecar escaped its parent");
    }
    assertRegularArtifact(sidecar, "sidecar");
  }
}

function validateConfiguredPath(databasePath: string): Readonly<{
  databasePath: string;
  parentPath: string;
}> {
  if (typeof databasePath !== "string" || !isAbsolute(databasePath)) {
    fail("sandbox security SQLite path must be absolute");
  }
  const normalizedDatabasePath = resolve(databasePath);
  const parentPath = dirname(normalizedDatabasePath);
  assertPrivateParent(parentPath);

  if (pathExists(normalizedDatabasePath)) {
    const entry = lstatSync(normalizedDatabasePath);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      fail("sandbox security SQLite database must be a regular file");
    }
  }
  assertSidecarBoundary(normalizedDatabasePath, parentPath);
  return { databasePath: normalizedDatabasePath, parentPath };
}

function closeAfterFailure(database: DatabaseSync): void {
  try {
    if (database.isTransaction) {
      database.exec("ROLLBACK");
    }
  } catch {
    // Preserve the startup error; close is still attempted below.
  }
  try {
    database.exec("PRAGMA foreign_keys = ON");
  } catch {
    // Preserve the startup error; close is still attempted below.
  }
  try {
    database.close();
  } catch {
    // Preserve the startup error.
  }
}

export function openSandboxSecuritySqliteDatabase(input: Readonly<{
  path: string;
  deployment_key_id: string;
  now: () => string;
}>): SqliteSandboxSecurityDatabase {
  if (input === null || typeof input !== "object") {
    throw new TypeError("sandbox security SQLite input is required");
  }
  if (typeof input.deployment_key_id !== "string") {
    throw new TypeError("sandbox security SQLite deployment key ID is required");
  }
  if (typeof input.now !== "function") {
    throw new TypeError("sandbox security SQLite clock is required");
  }

  const configured = validateConfiguredPath(input.path);
  let database: DatabaseSync;
  try {
    database = new DatabaseSync(configured.databasePath);
  } catch (error) {
    throw error;
  }

  try {
    // A newly-created file inherits the process umask; normalize before any
    // schema or sidecar writes and verify again after WAL is enabled.
    assertRegularArtifact(configured.databasePath, "database");
    database.exec("PRAGMA journal_mode = WAL");
    database.exec("PRAGMA foreign_keys = ON");
    database.exec("PRAGMA busy_timeout = 5000");
    assertRegularArtifact(configured.databasePath, "database");
    assertSidecarBoundary(configured.databasePath, configured.parentPath);

    // SQLite cannot toggle foreign-key enforcement inside a transaction. Only
    // fresh/v1 databases need the bounded table rebuild that requires it.
    const requiresForeignKeyRebuild =
      requiresSandboxSecurityForeignKeyRebuild(database);
    if (requiresForeignKeyRebuild) {
      database.exec("PRAGMA foreign_keys = OFF");
    }
    database.exec("BEGIN IMMEDIATE");
    applySandboxSecurityMigrations({
      database,
      deployment_key_id: input.deployment_key_id,
      now: input.now
    });
    runSandboxSecurityQuickCheck(database);
    assertRegularArtifact(configured.databasePath, "database");
    assertSidecarBoundary(configured.databasePath, configured.parentPath);
    database.exec("COMMIT");
    if (requiresForeignKeyRebuild) {
      database.exec("PRAGMA foreign_keys = ON");
    }
    if (database.prepare("PRAGMA foreign_keys").get()!.foreign_keys !== 1) {
      throw new Error("sandbox security SQLite foreign keys could not be restored");
    }
    assertRegularArtifact(configured.databasePath, "database");
    assertSidecarBoundary(configured.databasePath, configured.parentPath);
  } catch (error) {
    closeAfterFailure(database);
    throw error;
  }

  let state: "open" | "closed" = "open";
  let transactionActive = false;

  function assertOpen(): void {
    if (state !== "open" || !database.isOpen) {
      throw new Error("sandbox security SQLite database is closed");
    }
  }

  return {
    transaction<T>(operation: (database: DatabaseSync) => T): T {
      assertOpen();
      if (transactionActive || database.isTransaction) {
        throw new Error("sandbox security SQLite transactions cannot be nested");
      }
      if (typeof operation !== "function") {
        throw new TypeError("sandbox security SQLite transaction callback is required");
      }
      transactionActive = true;
      try {
        database.exec("BEGIN IMMEDIATE");
        const result = operation(database);
        database.exec("COMMIT");
        return result;
      } catch (error) {
        try {
          if (database.isTransaction) {
            database.exec("ROLLBACK");
          }
        } catch {
          // Preserve the callback or commit failure.
        }
        throw error;
      } finally {
        transactionActive = false;
      }
    },

    read<T>(operation: (database: DatabaseSync) => T): T {
      assertOpen();
      if (typeof operation !== "function") {
        throw new TypeError("sandbox security SQLite read callback is required");
      }
      return operation(database);
    },

    checkpointAndClose(): void {
      if (state === "closed") {
        return;
      }
      if (transactionActive || database.isTransaction) {
        throw new Error("sandbox security SQLite cannot close during a transaction");
      }
      try {
        database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      } finally {
        try {
          database.close();
        } finally {
          state = "closed";
        }
      }
    },

    get state(): "open" | "closed" {
      return state;
    }
  };
}
