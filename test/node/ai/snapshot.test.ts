// @vitest-environment node
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import v8 from 'node:v8';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

const REPO_ROOT = path.resolve(__dirname, '../../..');

// Evaluated while the snapshot is BUILT, so the generator registers its
// deserialize callback and fills its pool. Those buffered keys are baked into
// the blob; the callback exists to make sure they are never handed out again.
//
// Both mutants were checked against these cases: dropping the reset entirely,
// and rewinding the cursor without re-randomizing. Each fails at least one.
const ENTRY_SOURCE = `
import v8 from 'node:v8';

import jetKey from '@src/index';

const beforeSnapshot = Array.from({ length: 2049 }, () => jetKey());
// Leave the character cursor inside a block before saving the snapshot.
beforeSnapshot.push(jetKey(128), jetKey(512), jetKey(261));

v8.startupSnapshot.setDeserializeMainFunction(() => {
  console.log(
    JSON.stringify({
      beforeSnapshot,
      afterRestore: Array.from({ length: 2049 }, () => jetKey()),
    }),
  );
});
`;

// ========================================================================= //
//                                   TYPES                                   //
// ========================================================================= //

interface SnapshotRun {
  beforeSnapshot: string[];
  afterRestore: string[];
}

// ========================================================================= //
//                                   TESTS                                   //
// ========================================================================= //

describe.skipIf(typeof v8.startupSnapshot?.isBuildingSnapshot !== 'function')(
  'v8 startup snapshot',
  () => {
    let dir = '';
    let blob = '';

    beforeAll(async () => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jet-key-snapshot-'));
      const entry = path.join(dir, 'entry.ts');
      const bundle = path.join(dir, 'bundle.cjs');
      blob = path.join(dir, 'snapshot.blob');

      fs.writeFileSync(entry, ENTRY_SOURCE);

      // A snapshot entry cannot resolve relative requires, so the library and
      // the entry have to end up in one CommonJS file.
      await build({
        entryPoints: [entry],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        outfile: bundle,
        tsconfig: path.join(REPO_ROOT, 'tsconfig.json'),
        absWorkingDir: REPO_ROOT,
        logLevel: 'silent',
      });

      // Unsupported APIs are explicitly skipped above. Every build error here
      // is a real failure, including exceptions thrown by the library.
      execFileSync(
        process.execPath,
        ['--build-snapshot', '--snapshot-blob', blob, bundle],
        { cwd: dir, stdio: 'pipe', timeout: 30_000, killSignal: 'SIGKILL' },
      );
    }, 120_000);

    afterAll(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    /**
     * Restore the snapshot in a fresh process and read back what it generated.
     */
    function restore(): SnapshotRun {
      const out = execFileSync(process.execPath, ['--snapshot-blob', blob], {
        cwd: dir,
        encoding: 'utf8',
        timeout: 30_000,
        killSignal: 'SIGKILL',
      });
      return JSON.parse(out) as SnapshotRun;
    }

    // Catches a callback that rewinds the pool cursor without discarding the
    // saved characters, which would hand out the snapshot's keys verbatim. It
    // does NOT catch a callback that resets nothing: that case leaves the
    // cursor past the baked keys, so the next case covers it instead.
    it('never replays keys that were baked into the blob', () => {
      const run = restore();
      expect(run.beforeSnapshot).toHaveLength(2052);
      expect(run.afterRestore).toHaveLength(2049);

      const baked = new Set(run.beforeSnapshot);
      for (const key of run.afterRestore) {
        expect(
          baked.has(key),
          `restored key ${key} was baked into the snapshot`,
        ).toBe(false);
      }
    }, 60_000);

    // The load-bearing one. Any failure to re-randomize on deserialize shows
    // up here, including a callback that resets nothing at all, because both
    // processes then walk the same saved pool in lockstep.
    it('gives two restored processes different keys', () => {
      const first = restore();
      const second = restore();

      // Same blob, so both start from the identical saved pool. Anything shared
      // here would mean two deployments handing out the same keys.
      const overlap = first.afterRestore.filter((key) =>
        second.afterRestore.includes(key),
      );
      expect(overlap).toEqual([]);
    }, 60_000);
  },
);
