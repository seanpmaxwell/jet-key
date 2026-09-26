import { randomBytes } from 'crypto';
import { customAlphabet } from 'nanoid';
import { cpus } from 'os';
import { performance } from 'perf_hooks';

import logger from '@src/utils/logger';
import onInit from '@src/utils/onInit';

import jetKey from '../src';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const BATCH_SIZE = 16_384;
const WARMUP_MS = 500;
const SAMPLE_MS = 500;

const ROUNDS = 7;

// ========================================================================= //
//                                   INIT                                    //
// ========================================================================= //

const nanoidCrockford = customAlphabet(CROCKFORD_ALPHABET, 52);

let checksum = 0;

onInit.sync(() => {
  logger.info('\n Running benchmarks... \n');

  // ================================ Setup ================================ //

  const cases = [
    {
      name: 'jetKey()',
      generate: jetKey,
      chars: 52,
      bits: 260,
    },
    {
      name: 'Nano ID: Crockford, 52 chars',
      generate: nanoidCrockford,
      chars: 52,
      bits: 260,
    },
    {
      name: 'crypto.randomBytes(33): base64url',
      generate: () => randomBytes(33).toString('base64url'),
      chars: 44,
      bits: 264,
    },
  ].map((entry) => ({ ...entry, samples: [] as number[] }));

  // ============================== Run Tests ============================== //

  // Warm up every generator before collecting measurements.
  for (const entry of cases) {
    measure(entry.generate, WARMUP_MS);
  }

  // Rotate execution order to reduce fixed-order effects.
  for (let round = 0; round < ROUNDS; round++) {
    for (let position = 0; position < cases.length; position++) {
      const entry = cases[(round + position) % cases.length];
      entry.samples.push(measure(entry.generate, SAMPLE_MS));
      logger.info('Round', round, 'completed ~', entry.name);
    }
  }

  const results = cases.map((entry) => ({
    ...entry,
    ops: median(entry.samples),
  }));

  // Read the baseline before sorting: relative throughput is quoted against
  // jetKey(), which is the first case, not against whatever turns out fastest.
  const baseline = results[0].ops;

  // Fastest first, so the table reads in the same order as the README's.
  results.sort((a, b) => b.ops - a.ops);

  const integer = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  });

  // ============================ Print Results ============================ //

  // ---- Specs
  logger.info('# Secret key generation benchmark\n');
  logger.info(
    `Node ${process.version}; V8 ${process.versions.v8};`,
    `${process.platform}/${process.arch};`,
    `${cpus()[0]?.model ?? 'Unknown CPU'}\n`,
  );
  logger.info(
    `Median of ${ROUNDS} samples, at least ${SAMPLE_MS} ms each,`,
    `after ${WARMUP_MS} ms warmup per generator.\n`,
  );

  // ---- Print a Markdown-friendly table
  logger.info(
    '| Generator | Characters | Random bits | Median ops/sec | ns/key | Relative throughput |',
  );
  logger.info('|---|---:|---:|---:|---:|---:|');

  for (const result of results) {
    logger.info(
      `| ${result.name} | ${result.chars} | ${result.bits} |`,
      `${integer.format(result.ops)} |`,
      `${(1e9 / result.ops).toFixed(1)} |`,
      `${(result.ops / baseline).toFixed(2)}x |`,
    );
  }

  // ---- Final Message
  logger.info(
    '\nRelative throughput uses jetKey() as 1.00x; higher is faster.',
  );
  logger.info(
    'Measurements include generation and one character read per key.',
    'ns/key is amortized time derived from throughput, not individual-call latency.',
  );

  // Keep diagnostic output separate from the Markdown.
  logger.error('Checksum:', checksum);
}, 'benchmarks');

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/**
 * Measure results
 */
function measure(generate: () => string, durationMs: number): number {
  let count = 0;
  let localChecksum = 0;
  const start = performance.now();
  let elapsed: number;
  do {
    for (let i = 0; i < BATCH_SIZE; i++) {
      const key = generate();
      // Consume part of every result rather than discarding it.
      localChecksum = (localChecksum + key.charCodeAt(i % key.length)) | 0;
    }
    count += BATCH_SIZE;
    elapsed = performance.now() - start;
  } while (elapsed < durationMs);
  checksum ^= localChecksum;
  return (count * 1000) / elapsed;
}

/**
 * Get the median result
 */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
