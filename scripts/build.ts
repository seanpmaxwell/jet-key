import { spawn } from 'child_process';
import { build as esbuild } from 'esbuild';
import fs from 'fs/promises';
import path from 'path';

import logger from '@src/utils/logger';
import onInit from '@src/utils/onInit';

// Keep each build isolated, including its backup during the final replacement.
// The lock prevents concurrent pack/build processes from replacing each other.
const LOCK = '.jet-key-build.lock';

await onInit(async () => {
  await fs.mkdir(LOCK).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'EEXIST') {
      throw new Error(
        'Another build is running, or a previous build was interrupted. ' +
          `Check for an active build before removing ${LOCK}.`,
      );
    }
    throw error;
  });

  let staging: string | undefined;
  let preserveBackup = false;
  try {
    await shell('tsc', ['-p', 'tsconfig.build.json', '--noEmit']);
    staging = await fs.mkdtemp('.jet-key-build-');
    const output = path.join(staging, 'lib');
    await shell('dts-bundle-generator', [
      '--project',
      'tsconfig.build.json',
      '-o',
      path.join(output, 'index.d.ts'),
      'src/index.ts',
    ]);

    const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'));
    await esbuild({
      define: { __JET_KEY_VERSION__: JSON.stringify(version) },
      entryPoints: { index: 'src/index.ts', cli: 'src/cli/main.ts' },
      outdir: output,
      bundle: true,
      splitting: true,
      minify: true,
      format: 'esm',
      platform: 'node',
      target: 'node20.19',
    });

    const backup = path.join(staging, 'previous-lib');
    let hadOutput = false;
    try {
      await fs.rename('lib', backup);
      hadOutput = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    try {
      await fs.rename(output, 'lib');
    } catch (error) {
      if (hadOutput) {
        try {
          await fs.rename(backup, 'lib');
        } catch (restoreError) {
          preserveBackup = true;
          throw new AggregateError(
            [error, restoreError],
            `Build replacement failed. Previous output is preserved at ${backup}.`,
            { cause: restoreError },
          );
        }
      }
      throw error;
    }
    logger.info('Finished building. Output written to "lib/"');
  } finally {
    try {
      if (staging && !preserveBackup) {
        await fs.rm(staging, { recursive: true, force: true });
      }
    } finally {
      await fs.rmdir(LOCK);
    }
  }
}, 'build');

/** Run a local tool without a shell and propagate its failure. */
function shell(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`${cmd} failed with ${signal ?? `exit code ${code}`}`),
        );
    });
  });
}
