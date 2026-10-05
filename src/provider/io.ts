import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fail, ProviderError } from './json.js';
const { O_RDONLY, O_WRONLY, O_CREAT, O_EXCL, O_NOFOLLOW, O_NONBLOCK } = fs.constants;
export const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
type Stat = fs.BigIntStats;
const stat = (p: string) => fs.statSync(p, { bigint: true });
const lstat = (p: string) => fs.lstatSync(p, { bigint: true });
const sameID = (a: Stat, b: Stat) => a.dev === b.dev && a.ino === b.ino;
const sameFile = (a: Stat, b: Stat) => sameID(a, b) && a.mode === b.mode && a.nlink === b.nlink && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
function optionalStat(p: string): Stat | undefined {
  try { return lstat(p); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw e; }
}
export function checkPath(p: string): void {
  if (!p || p === '-' || p.includes('\0') || Buffer.byteLength(p) > 4096 || /^[a-z][a-z\d+.-]*:\/\//i.test(p)) fail('invalid_path');
}
interface Snapshot { supplied: string; resolved: string; parent: string; parentInfo: Stat; info: Stat; bytes: Buffer; hash: string }
export interface ReadHooks { afterResolved?: () => void; afterChunk?: () => void }
export function readRegular(supplied: string, max: number, noFollow = false, hooks: ReadHooks = {}): Snapshot {
  checkPath(supplied);
  // Do not path.resolve the original spelling: symlink/.. has native OS meaning.
  const resolved = fs.realpathSync.native(supplied);
  const parent = path.dirname(resolved), parentInfo = stat(parent);
  hooks.afterResolved?.();
  const fd = fs.openSync(supplied, O_RDONLY | O_NONBLOCK | (noFollow ? O_NOFOLLOW : 0));
  try {
    const info = fs.fstatSync(fd, { bigint: true });
    if (!info.isFile()) fail('nonregular_file');
    if (info.size > BigInt(max)) fail('byte_limit');
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const chunk = Buffer.allocUnsafe(Math.min(65536, max + 1 - total));
      const size = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (!size) break;
      total += size; if (total > max) fail('byte_limit');
      chunks.push(chunk.subarray(0, size));
      hooks.afterChunk?.();
    }
    if (!sameFile(info, fs.fstatSync(fd, { bigint: true })) || !sameFile(info, stat(supplied)) || fs.realpathSync.native(supplied) !== resolved) fail('file_changed');
    const bytes = Buffer.concat(chunks, total);
    if (!sameID(stat(parent), parentInfo)) fail('parent_changed');
    return { supplied, resolved, parent, parentInfo, info, bytes, hash: sha256(bytes) };
  } finally { fs.closeSync(fd); }
}
function recheck(snapshot: Snapshot, max: number): void {
  const current = readRegular(snapshot.supplied, max);
  if (current.parent !== snapshot.parent || !sameID(current.parentInfo, snapshot.parentInfo) || current.resolved !== snapshot.resolved || !sameFile(current.info, snapshot.info) || current.hash !== snapshot.hash || current.bytes.length !== snapshot.bytes.length) fail('file_changed');
}
interface Destination { supplied: string; parentSpelling: string; parent: string; parentInfo: Stat; resolved: string; previous?: Snapshot; max: number }
function destination(supplied: string, max: number): Destination {
  checkPath(supplied);
  const leaf = path.basename(supplied);
  if (leaf === '.' || leaf === '..' || supplied.endsWith(path.sep)) fail('invalid_path');
  const parentSpelling = path.dirname(supplied), parent = fs.realpathSync.native(parentSpelling), parentInfo = stat(parent);
  if (!parentInfo.isDirectory()) fail('invalid_parent');
  const resolved = path.join(parent, leaf), info = optionalStat(resolved);
  const d: Destination = { supplied, parentSpelling, parent, parentInfo, resolved, max };
  if (info) {
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n) fail('unsafe_destination');
    d.previous = readRegular(resolved, max, true);
    if (!sameFile(info, d.previous.info)) fail('file_changed');
    // Replacing via directory rename must not bypass an ordinary file's write permission.
    const fd = fs.openSync(resolved, O_WRONLY | O_NONBLOCK | O_NOFOLLOW);
    try { if (!sameFile(info, fs.fstatSync(fd, { bigint: true }))) fail('file_changed'); } finally { fs.closeSync(fd); }
  }
  return d;
}
function recheckDestination(d: Destination): void {
  if (fs.realpathSync.native(d.parentSpelling) !== d.parent || !sameID(stat(d.parent), d.parentInfo)) fail('parent_changed');
  const now = optionalStat(d.resolved);
  if (d.previous) {
    if (!now || !sameFile(d.previous.info, now) || !now.isFile() || now.nlink !== 1n) fail('destination_changed');
    recheck(d.previous, d.max);
  } else if (now) fail('destination_changed');
}
export interface PublicationHooks {
  /** Test-only in-process seams, never exposed by the CLI or input document. */
  afterStages?: (stages: readonly string[]) => void;
  beforeRename?: (index: number) => void;
}
export function publishPair(input: Snapshot, output: string, receipt: string, svg: Buffer, json: Buffer, hooks: PublicationHooks = {}): void {
  if (svg.length > 8 * 1024 * 1024 || json.length > 256 * 1024) fail('artifact_limit');
  const destinations = [destination(output, 8 * 1024 * 1024), destination(receipt, 256 * 1024)];
  const [a, b] = destinations as [Destination, Destination];
  if (a.resolved === b.resolved || destinations.some(d => d.resolved === input.resolved || (d.previous && sameID(d.previous.info, input.info))) || (a.previous && b.previous && sameID(a.previous.info, b.previous.info))) fail('path_alias');
  interface Stage { path: string; snapshot: Snapshot; destination: Destination; backup?: string; published: boolean }
  const stages: Stage[] = [];
  let retain = false;
  try {
    for (const [i, d] of destinations.entries()) {
      const name = path.join(d.parent, `.plot-ts-stage-${randomBytes(16).toString('hex')}`);
      let owned = false;
      try {
        const fd = fs.openSync(name, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600); owned = true;
        try { fs.writeFileSync(fd, i === 0 ? svg : json); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        const snapshot = readRegular(name, d.max, true);
        if (snapshot.hash !== sha256(i === 0 ? svg : json)) fail('stage_changed');
        stages.push({ path: name, snapshot, destination: d, published: false });
      } catch (error) { if (owned) fs.unlinkSync(name); throw error; }
    }
    hooks.afterStages?.(stages.map(s => s.path));
    recheck(input, 4 * 1024 * 1024);
    for (const s of stages) {
      recheckDestination(s.destination); recheck(s.snapshot, s.destination.max);
      if (lstat(s.path).isSymbolicLink()) fail('stage_changed');
    }
    for (const [i, s] of stages.entries()) {
      const d = s.destination;
      // Private backup names are reserved atomically. Only our own names are cleaned.
      if (d.previous) {
        s.backup = path.join(d.parent, `.plot-ts-backup-${randomBytes(16).toString('hex')}`);
        const fd = fs.openSync(s.backup, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600); fs.closeSync(fd);
        try { fs.renameSync(d.resolved, s.backup); } catch (error) { fs.unlinkSync(s.backup); delete s.backup; throw error; }
        fs.chmodSync(s.path, Number(d.previous.info.mode & 0o777n));
      }
      hooks.beforeRename?.(i);
      fs.renameSync(s.path, d.resolved); s.published = true;
    }
  } catch (error) {
    for (const s of [...stages].reverse()) {
      try {
        if (s.published) fs.unlinkSync(s.destination.resolved);
        if (s.backup) { fs.renameSync(s.backup, s.destination.resolved); delete s.backup; }
      } catch { retain = true; }
    }
    if (retain) throw new ProviderError('publication_recovery_required');
    throw error;
  } finally {
    if (!retain) for (const s of stages) {
      if (!s.published && optionalStat(s.path)) fs.unlinkSync(s.path);
      if (s.backup) fs.unlinkSync(s.backup);
    }
  }
}
