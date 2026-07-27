import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  linkSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeSync,
  type BigIntStats
} from "node:fs";
import { basename, dirname, isAbsolute, resolve, sep } from "node:path";
import { types as utilTypes } from "node:util";

export const SANDBOX_SECURITY_FS_SNAPSHOT_MAX_BYTES = 16_777_216;
export const SANDBOX_SECURITY_FS_SNAPSHOT_MAX_DIRECTORY_ENTRIES = 4096;

export interface SandboxSecurityFileSnapshot {
  readonly path: string;
  readonly real_root: string;
  readonly size: number;
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mtime_ns: bigint;
  readonly sha256_hex: string;
  readonly bytes: Buffer;
}

export type SandboxSecurityJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly SandboxSecurityJsonValue[]
  | { readonly [key: string]: SandboxSecurityJsonValue };

export interface SandboxSecurityJsonSnapshot extends SandboxSecurityFileSnapshot {
  readonly json: SandboxSecurityJsonValue;
}

export type SandboxSecurityDirectoryEntryKind = "file" | "directory";

export interface SandboxSecurityDirectoryEntry {
  readonly name: string;
  readonly kind: SandboxSecurityDirectoryEntryKind;
}

export interface SandboxSecurityDirectorySnapshot {
  readonly path: string;
  readonly real_root: string;
  readonly dev: bigint;
  readonly ino: bigint;
  readonly entries: readonly SandboxSecurityDirectoryEntry[];
}

export interface SandboxSecurityBoundLiveRoot {
  readonly requested_path: string;
  readonly real_path: string;
  readonly dev: bigint;
  readonly ino: bigint;
}

export interface SandboxSecurityBoundLiveRoots {
  readonly corpus_root: SandboxSecurityBoundLiveRoot;
  readonly capture_parent_root: SandboxSecurityBoundLiveRoot;
  readonly output_root: SandboxSecurityBoundLiveRoot;
}

export interface SandboxSecurityExclusiveWriteResult {
  readonly path: string;
  readonly size: number;
  readonly sha256_hex: string;
}

const INVALID = "sandbox_security_fs_snapshot_reject";
const FILE_INPUT_KEYS = Object.freeze(["real_root", "path", "max_bytes"] as const);
const DIRECTORY_INPUT_KEYS = Object.freeze([
  "real_root",
  "path",
  "expected_entries"
] as const);
const WRITE_INPUT_KEYS = Object.freeze(["real_root", "path", "data"] as const);
const LIVE_ROOT_KEYS = Object.freeze([
  "corpus_root",
  "capture_parent_root",
  "output_root"
] as const);
const MAX_PATH_LENGTH = 4000;
const MAX_ENTRY_NAME_BYTES = 255;
const MAX_JSON_DEPTH = 64;
const MAX_JSON_NODES = 1_000_000;
const EXCLUSIVE_TEMP_SUFFIX = ".sandbox-security-exclusive-tmp";
const FORBIDDEN_RECORD_KEYS = Object.freeze([
  "__proto__",
  "prototype",
  "constructor"
] as const);

function fail(code: string): never {
  throw new Error(`${INVALID}:${code}`);
}

function isWellFormed(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

interface DataRecordSnapshot {
  readonly keys: readonly string[];
  readonly values: ReadonlyMap<string, unknown>;
}

function snapshotDataRecord(
  value: unknown,
  code: string,
  exactKeys: readonly string[]
): DataRecordSnapshot {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    utilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(code);
  }

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) fail(code);
  const keys = ownKeys as string[];
  if (
    keys.length !== exactKeys.length ||
    exactKeys.some((key) => !keys.includes(key))
  ) {
    fail(code);
  }

  const values = new Map<string, unknown>();
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      fail(code);
    }
    values.set(key, descriptor.value);
  }
  return Object.freeze({ keys: Object.freeze([...keys]), values });
}

function snapshotDenseStringArray(
  value: unknown,
  code: string,
  maxEntries: number
): readonly string[] {
  if (
    !Array.isArray(value) ||
    utilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    fail(code);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    lengthDescriptor.value > maxEntries
  ) {
    fail(code);
  }
  const length = lengthDescriptor.value as number;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== length + 1 || !ownKeys.includes("length")) fail(code);

  const output: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "string"
    ) {
      fail(code);
    }
    output.push(descriptor.value);
  }
  return Object.freeze(output);
}

function assertAbsoluteNormalizedPath(value: unknown, code: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_PATH_LENGTH ||
    value.includes("\0") ||
    !isWellFormed(value) ||
    !isAbsolute(value) ||
    resolve(value) !== value
  ) {
    fail(code);
  }
  return value;
}

interface BindingStat {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly size: bigint;
  readonly mode: bigint;
  readonly nlink: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}

function toBindingStat(stat: BigIntStats): BindingStat {
  return Object.freeze({
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mode: stat.mode,
    nlink: stat.nlink,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs
  });
}

function bindingStatsEqual(left: BindingStat, right: BindingStat): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function assertCanonicalRealRoot(value: unknown, prefix: string): string {
  const rootPath = assertAbsoluteNormalizedPath(value, `${prefix}_path_invalid`);
  let rootStat;
  try {
    rootStat = lstatSync(rootPath, { bigint: true });
  } catch {
    fail(`${prefix}_missing`);
  }
  if (rootStat.isSymbolicLink()) fail(`${prefix}_symlink_alias`);
  if (!rootStat.isDirectory()) fail(`${prefix}_not_directory`);
  let realPath: string;
  try {
    realPath = realpathSync(rootPath);
  } catch {
    fail(`${prefix}_missing`);
  }
  if (realPath !== rootPath) fail(`${prefix}_symlink_alias`);
  return rootPath;
}

function assertPathWithinRoot(
  path: string,
  realRoot: string,
  code: string
): void {
  if (path === realRoot || !path.startsWith(`${realRoot}${sep}`)) {
    fail(code);
  }
}

function assertCanonicalParent(path: string, code: string): string {
  const parent = dirname(path);
  let parentReal: string;
  try {
    parentReal = realpathSync(parent);
  } catch {
    fail(code);
  }
  if (parentReal !== parent) fail(code);
  return parent;
}

function sha256HexOf(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

interface FileSnapshotRequest {
  readonly realRoot: string;
  readonly path: string;
  readonly maxBytes: number;
}

function parseFileSnapshotInput(input: unknown): FileSnapshotRequest {
  const record = snapshotDataRecord(input, "input_invalid", FILE_INPUT_KEYS);
  const realRoot = assertCanonicalRealRoot(record.values.get("real_root"), "root");
  const path = assertAbsoluteNormalizedPath(
    record.values.get("path"),
    "snapshot_path_invalid"
  );
  assertPathWithinRoot(path, realRoot, "snapshot_path_outside_root");
  assertCanonicalParent(path, "snapshot_parent_alias");
  const maxBytes = record.values.get("max_bytes");
  if (
    typeof maxBytes !== "number" ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > SANDBOX_SECURITY_FS_SNAPSHOT_MAX_BYTES
  ) {
    fail("input_invalid");
  }
  return Object.freeze({ realRoot, path, maxBytes });
}

function readBoundFileBytes(request: FileSnapshotRequest): Readonly<{
  bytes: Buffer;
  binding: BindingStat;
}> {
  let pathStat;
  try {
    pathStat = lstatSync(request.path, { bigint: true });
  } catch {
    fail("snapshot_missing");
  }
  if (pathStat.isSymbolicLink()) fail("snapshot_symlink");
  if (!pathStat.isFile()) fail("snapshot_not_regular");
  if (pathStat.nlink !== 1n) fail("snapshot_link_count_invalid");
  if (pathStat.size > BigInt(request.maxBytes)) fail("snapshot_too_large");
  const pathBinding = toBindingStat(pathStat);
  const expectedSize = Number(pathStat.size);

  let descriptor: number;
  try {
    descriptor = openSync(
      request.path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
  } catch {
    fail("snapshot_open_failed");
  }

  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile()) fail("snapshot_not_regular");
    const beforeBinding = toBindingStat(before);
    if (!bindingStatsEqual(beforeBinding, pathBinding)) {
      fail("snapshot_binding_changed");
    }

    const buffer = Buffer.alloc(expectedSize + 1);
    let totalBytesRead = 0;
    while (totalBytesRead < buffer.length) {
      const bytesRead = readSync(
        descriptor,
        buffer,
        totalBytesRead,
        buffer.length - totalBytesRead,
        null
      );
      if (bytesRead === 0) break;
      totalBytesRead += bytesRead;
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (!bindingStatsEqual(toBindingStat(after), beforeBinding)) {
      fail("snapshot_binding_changed");
    }
    if (totalBytesRead !== expectedSize) fail("snapshot_binding_changed");

    return Object.freeze({
      bytes: buffer.subarray(0, expectedSize),
      binding: beforeBinding
    });
  } finally {
    closeSync(descriptor);
  }
}

export function snapshotSandboxSecurityFile(
  input: unknown
): SandboxSecurityFileSnapshot {
  const request = parseFileSnapshotInput(input);
  const captured = readBoundFileBytes(request);
  return Object.freeze({
    path: request.path,
    real_root: request.realRoot,
    size: captured.bytes.length,
    dev: captured.binding.dev,
    ino: captured.binding.ino,
    mtime_ns: captured.binding.mtimeNs,
    sha256_hex: sha256HexOf(captured.bytes),
    bytes: captured.bytes
  });
}

interface JsonNormalizationState {
  nodes: number;
}

function normalizeParsedJsonValue(
  value: unknown,
  state: JsonNormalizationState,
  depth: number
): SandboxSecurityJsonValue {
  state.nodes += 1;
  if (state.nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) {
    fail("snapshot_json_invalid");
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (!isWellFormed(value)) fail("snapshot_json_invalid");
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("snapshot_json_invalid");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") fail("snapshot_json_invalid");
  if (Array.isArray(value)) {
    return Object.freeze(
      value.map((item) => normalizeParsedJsonValue(item, state, depth + 1))
    );
  }

  const output: Record<string, SandboxSecurityJsonValue> = {};
  const keys = Object.keys(value).sort();
  for (const key of keys) {
    if (
      (FORBIDDEN_RECORD_KEYS as readonly string[]).includes(key) ||
      !isWellFormed(key)
    ) {
      fail("snapshot_json_invalid");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      fail("snapshot_json_invalid");
    }
    output[key] = normalizeParsedJsonValue(descriptor.value, state, depth + 1);
  }
  return Object.freeze(output);
}

export function snapshotSandboxSecurityJson(
  input: unknown
): SandboxSecurityJsonSnapshot {
  const fileSnapshot = snapshotSandboxSecurityFile(input);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      fileSnapshot.bytes
    );
  } catch {
    fail("snapshot_json_invalid");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("snapshot_json_invalid");
  }
  const json = normalizeParsedJsonValue(parsed, { nodes: 0 }, 0);
  return Object.freeze({
    path: fileSnapshot.path,
    real_root: fileSnapshot.real_root,
    size: fileSnapshot.size,
    dev: fileSnapshot.dev,
    ino: fileSnapshot.ino,
    mtime_ns: fileSnapshot.mtime_ns,
    sha256_hex: fileSnapshot.sha256_hex,
    bytes: fileSnapshot.bytes,
    json
  });
}

function assertExpectedDirectoryEntries(value: unknown): readonly string[] {
  const entries = snapshotDenseStringArray(
    value,
    "input_invalid",
    SANDBOX_SECURITY_FS_SNAPSHOT_MAX_DIRECTORY_ENTRIES
  );
  let previous: string | undefined;
  for (const name of entries) {
    if (
      name.length === 0 ||
      Buffer.byteLength(name, "utf8") > MAX_ENTRY_NAME_BYTES ||
      name === "." ||
      name === ".." ||
      name.includes("/") ||
      name.includes("\0") ||
      !isWellFormed(name)
    ) {
      fail("directory_snapshot_expected_entries_invalid");
    }
    if (previous !== undefined && !(name > previous)) {
      fail("directory_snapshot_expected_entries_invalid");
    }
    previous = name;
  }
  return entries;
}

export function snapshotSandboxSecurityDirectory(
  input: unknown
): SandboxSecurityDirectorySnapshot {
  const record = snapshotDataRecord(input, "input_invalid", DIRECTORY_INPUT_KEYS);
  const realRoot = assertCanonicalRealRoot(record.values.get("real_root"), "root");
  const path = assertAbsoluteNormalizedPath(
    record.values.get("path"),
    "snapshot_path_invalid"
  );
  if (path !== realRoot) {
    assertPathWithinRoot(path, realRoot, "snapshot_path_outside_root");
    assertCanonicalParent(path, "snapshot_parent_alias");
  }
  const expectedEntries = assertExpectedDirectoryEntries(
    record.values.get("expected_entries")
  );

  let pathStat;
  try {
    pathStat = lstatSync(path, { bigint: true });
  } catch {
    fail("directory_snapshot_missing");
  }
  if (pathStat.isSymbolicLink()) fail("directory_snapshot_symlink");
  if (!pathStat.isDirectory()) fail("directory_snapshot_not_directory");

  let descriptor: number;
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );
  } catch {
    fail("directory_snapshot_open_failed");
  }

  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isDirectory()) fail("directory_snapshot_not_directory");
    if (before.dev !== pathStat.dev || before.ino !== pathStat.ino) {
      fail("directory_snapshot_binding_changed");
    }
    const beforeBinding = toBindingStat(before);

    let names: string[];
    try {
      names = [...readdirSync(path)].sort();
    } catch {
      fail("directory_snapshot_binding_changed");
    }
    if (names.length > SANDBOX_SECURITY_FS_SNAPSHOT_MAX_DIRECTORY_ENTRIES) {
      fail("directory_snapshot_inventory_mismatch");
    }

    let midStat;
    try {
      midStat = lstatSync(path, { bigint: true });
    } catch {
      fail("directory_snapshot_binding_changed");
    }
    if (
      midStat.isSymbolicLink() ||
      midStat.dev !== before.dev ||
      midStat.ino !== before.ino
    ) {
      fail("directory_snapshot_binding_changed");
    }

    if (
      names.length !== expectedEntries.length ||
      names.some((name, index) => name !== expectedEntries[index])
    ) {
      fail("directory_snapshot_inventory_mismatch");
    }

    const entries: SandboxSecurityDirectoryEntry[] = [];
    for (const name of names) {
      let entryStat;
      try {
        entryStat = lstatSync(`${path}${sep}${name}`, { bigint: true });
      } catch {
        fail("directory_snapshot_binding_changed");
      }
      if (entryStat.isSymbolicLink()) fail("directory_snapshot_entry_invalid");
      if (entryStat.isFile()) {
        entries.push(Object.freeze({ name, kind: "file" as const }));
      } else if (entryStat.isDirectory()) {
        entries.push(Object.freeze({ name, kind: "directory" as const }));
      } else {
        fail("directory_snapshot_entry_invalid");
      }
    }

    const after = fstatSync(descriptor, { bigint: true });
    if (!bindingStatsEqual(toBindingStat(after), beforeBinding)) {
      fail("directory_snapshot_binding_changed");
    }
    let finalStat;
    try {
      finalStat = lstatSync(path, { bigint: true });
    } catch {
      fail("directory_snapshot_binding_changed");
    }
    if (
      finalStat.isSymbolicLink() ||
      finalStat.dev !== before.dev ||
      finalStat.ino !== before.ino
    ) {
      fail("directory_snapshot_binding_changed");
    }

    return Object.freeze({
      path,
      real_root: realRoot,
      dev: beforeBinding.dev,
      ino: beforeBinding.ino,
      entries: Object.freeze(entries)
    });
  } finally {
    closeSync(descriptor);
  }
}

export function bindSandboxSecurityLiveRoots(
  input: unknown
): SandboxSecurityBoundLiveRoots {
  const record = snapshotDataRecord(input, "input_invalid", LIVE_ROOT_KEYS);
  const bound = new Map<string, SandboxSecurityBoundLiveRoot>();
  for (const key of LIVE_ROOT_KEYS) {
    const rootPath = assertCanonicalRealRoot(record.values.get(key), "root");
    const rootStat = lstatSync(rootPath, { bigint: true });
    bound.set(
      key,
      Object.freeze({
        requested_path: rootPath,
        real_path: rootPath,
        dev: rootStat.dev,
        ino: rootStat.ino
      })
    );
  }

  const paths = LIVE_ROOT_KEYS.map((key) => bound.get(key)!.real_path);
  for (let left = 0; left < paths.length; left += 1) {
    for (let right = left + 1; right < paths.length; right += 1) {
      const a = paths[left]!;
      const b = paths[right]!;
      if (
        a === b ||
        a.startsWith(`${b}${sep}`) ||
        b.startsWith(`${a}${sep}`)
      ) {
        fail("path_overlap");
      }
    }
  }

  return Object.freeze({
    corpus_root: bound.get("corpus_root")!,
    capture_parent_root: bound.get("capture_parent_root")!,
    output_root: bound.get("output_root")!
  });
}

export function writeSandboxSecurityExclusiveAtomicFile(
  input: unknown
): SandboxSecurityExclusiveWriteResult {
  const record = snapshotDataRecord(input, "input_invalid", WRITE_INPUT_KEYS);
  const realRoot = assertCanonicalRealRoot(record.values.get("real_root"), "root");
  const path = assertAbsoluteNormalizedPath(
    record.values.get("path"),
    "snapshot_path_invalid"
  );
  assertPathWithinRoot(path, realRoot, "snapshot_path_outside_root");

  const rawData = record.values.get("data");
  let bytes: Buffer;
  if (typeof rawData === "string") {
    if (!isWellFormed(rawData)) fail("exclusive_write_data_invalid");
    bytes = Buffer.from(rawData, "utf8");
  } else if (Buffer.isBuffer(rawData)) {
    bytes = Buffer.from(rawData);
  } else if (rawData instanceof Uint8Array) {
    bytes = Buffer.from(rawData);
  } else {
    fail("exclusive_write_data_invalid");
  }
  if (
    bytes.length === 0 ||
    bytes.length > SANDBOX_SECURITY_FS_SNAPSHOT_MAX_BYTES
  ) {
    fail("exclusive_write_data_invalid");
  }

  const fileName = basename(path);
  if (fileName.length === 0 || fileName === "." || fileName === "..") {
    fail("snapshot_path_invalid");
  }
  const parent = dirname(path);
  let parentStat;
  try {
    parentStat = lstatSync(parent, { bigint: true });
  } catch {
    fail("exclusive_write_parent_invalid");
  }
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    fail("exclusive_write_parent_invalid");
  }
  let parentReal: string;
  try {
    parentReal = realpathSync(parent);
  } catch {
    fail("exclusive_write_parent_invalid");
  }
  if (parentReal !== parent) fail("exclusive_write_parent_invalid");

  const tempPath = `${parent}${sep}.${fileName}${EXCLUSIVE_TEMP_SUFFIX}`;
  if (tempPath.length > MAX_PATH_LENGTH + 64) fail("snapshot_path_invalid");
  let tempExists = true;
  try {
    lstatSync(tempPath, { bigint: true });
  } catch {
    tempExists = false;
  }
  if (tempExists) fail("exclusive_write_temp_exists");

  let targetExists = true;
  try {
    lstatSync(path, { bigint: true });
  } catch {
    targetExists = false;
  }
  if (targetExists) fail("exclusive_write_target_exists");

  let descriptor: number | undefined;
  let tempCreated = false;
  try {
    try {
      descriptor = openSync(
        tempPath,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600
      );
      tempCreated = true;
    } catch (error) {
      if (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: unknown }).code === "EEXIST"
      ) {
        fail("exclusive_write_temp_exists");
      }
      fail("exclusive_write_failed");
    }

    let totalBytesWritten = 0;
    while (totalBytesWritten < bytes.length) {
      const bytesWritten = writeSync(
        descriptor,
        bytes,
        totalBytesWritten,
        bytes.length - totalBytesWritten,
        null
      );
      if (bytesWritten <= 0) fail("exclusive_write_failed");
      totalBytesWritten += bytesWritten;
    }
    fsyncSync(descriptor);
    const written = fstatSync(descriptor, { bigint: true });
    if (
      !written.isFile() ||
      written.nlink !== 1n ||
      written.size !== BigInt(bytes.length)
    ) {
      fail("exclusive_write_failed");
    }
    closeSync(descriptor);
    descriptor = undefined;

    let parentRecheck;
    try {
      parentRecheck = lstatSync(parent, { bigint: true });
    } catch {
      fail("exclusive_write_parent_invalid");
    }
    if (
      parentRecheck.dev !== parentStat.dev ||
      parentRecheck.ino !== parentStat.ino
    ) {
      fail("exclusive_write_parent_invalid");
    }

    // Publish atomically and exclusively: linkSync fails with EEXIST if the
    // final path already exists, so a concurrent same-privileged writer cannot
    // be silently clobbered the way renameSync would. The exclusive temp is
    // removed by the finally block below, on both success and failure.
    try {
      linkSync(tempPath, path);
    } catch (error) {
      if (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: unknown }).code === "EEXIST"
      ) {
        fail("exclusive_write_target_exists");
      }
      fail("exclusive_write_failed");
    }

    let parentDescriptor: number | undefined;
    try {
      parentDescriptor = openSync(
        parent,
        constants.O_RDONLY | constants.O_DIRECTORY
      );
      fsyncSync(parentDescriptor);
    } catch {
      // The evidence is already published as a durable hardlink; a failed parent
      // directory fsync is a durability nicety, not a publication failure, so do
      // not turn a completed publish into an error that a retry would then
      // reject as target-exists.
    } finally {
      if (parentDescriptor !== undefined) closeSync(parentDescriptor);
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (tempCreated) {
      // Remove the exclusive temp on every path: on failure it must not linger,
      // and on success the published file is a separate hardlink so unlinking the
      // temp is safe.
      try {
        unlinkSync(tempPath);
      } catch {
        // Already unlinked after a successful publish, or never created.
      }
    }
  }

  return Object.freeze({
    path,
    size: bytes.length,
    sha256_hex: sha256HexOf(bytes)
  });
}
