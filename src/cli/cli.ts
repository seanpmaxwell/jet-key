import { once } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { Writable } from 'stream';
import { fileURLToPath } from 'url';

import jetKey from '@src/api/jetKey';

import cmdLineParser, { ParsedCmdLineArgs } from './_internal/cmdLineParser';
import printHelpText from './_internal/printHelpText';

// Injected by esbuild at build time (see scripts/build.ts), so the bundled
// CLI answers `--version` without touching the filesystem. Absent when the
// source runs directly under tsx, where `readVersion` takes over.
declare const __JET_KEY_VERSION__: string | undefined;

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

const PACKAGE_NAME = 'jet-key';
const BATCH_BYTES = 64 * 1024;

// ========================================================================= //
//                                   INIT                                    //
// ========================================================================= //

/**
 * Run `jet-key` from the command line.
 */
async function cli(
  args: string[],
  output: Writable = process.stdout,
): Promise<unknown> {
  // ---- Parse the command-line arguments
  const pArgs = cmdLineParser(args);

  // ---- `help/version`
  if (pArgs.help || pArgs.version) {
    if (args.length !== 1)
      throw new Error(
        'Invalid command-line arguments. Please use the "-h" flag for assistance',
      );
    if (pArgs.help) return printHelpText(output);
    return printVersion(output);
  }

  // ---- Print the keys
  return printKeys(pArgs, output);
}

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/**
 * Writes are batched. Past a few thousand keys, a write syscall per line costs
 * far more than generating the key does.
 *
 * Used by: {@link cli}
 *
 * @private
 */
async function printKeys(
  args: ParsedCmdLineArgs,
  output: Writable,
): Promise<void> {
  const { count, entropy } = args;
  let batch = '';
  for (let i = 0; i < count; i++) {
    const line = jetKey(entropy) + '\n';
    // Keys are ASCII, so character count equals byte count. Flush before
    // appending a line that would exceed the target; large lines go alone.
    if (batch.length + line.length > BATCH_BYTES && batch !== '') {
      await writeBatch(batch, output);
      batch = '';
    }
    batch += line;
    if (batch.length >= BATCH_BYTES) {
      await writeBatch(batch, output);
      batch = '';
    }
  }
  if (batch !== '') await writeBatch(batch, output);
}

async function writeBatch(batch: string, output: Writable): Promise<void> {
  if (!output.write(batch)) await once(output, 'drain');
}

/**
 * Check if the version is inlined. If not, use package.json.
 *
 * Used by: {@link cli}
 *
 * @private
 */
async function printVersion(output: Writable): Promise<boolean> {
  let version;
  if (typeof __JET_KEY_VERSION__ === 'string') {
    version = __JET_KEY_VERSION__;
  } else {
    const thisFilePath = fileURLToPath(import.meta.url);
    const thisFileDir = path.dirname(thisFilePath);
    version = await loadVersionFromPkgJson(thisFileDir);
  }
  return output.write(`${version}\n`);
}

/**
 * Look at the package.json and return the version. Only reached when the
 * source runs unbundled (the build inlines `__JET_KEY_VERSION__` instead).
 * Walks up from the directory this file lives in.
 *
 * Used by: {@link printVersion}
 *
 * @private
 */
async function loadVersionFromPkgJson(startDir: string): Promise<string> {
  let dir = startDir;
  while (true) {
    const filePath = path.join(dir, 'package.json');
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const packageJson = JSON.parse(content);
      if (packageJson.name === PACKAGE_NAME) return packageJson.version;
    } catch {
      // Not here, keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('Could not find package.json');
    dir = parent;
  }
}

// ========================================================================= //
//                                  EXPORT                                   //
// ========================================================================= //

export default cli;
