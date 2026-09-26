#!/usr/bin/env node

import logger from '@src/utils/logger';

import cli from './cli';

// ========================================================================= //
//                                   INIT                                    //
// ========================================================================= //

// Keep this listener for the process lifetime: a small write can fail after
// cli() resolves. A closed reader (e.g. `head`) means no more output is wanted.
process.stdout.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') process.exit(0);
  logger.error(err);
  process.exit(1);
});

main();

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/**
 * Entry point for the command-line version
 */
async function main(): Promise<unknown> {
  const args = process.argv.slice(2);
  try {
    await cli(args);
  } catch (err) {
    logger.error(err);
    return (process.exitCode = 1);
  }
}
