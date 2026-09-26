import { build } from 'esbuild';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import cli from '@src/cli/cli';

import { KEY_PATTERN } from '@test/_common/constants';

import { version } from '../../package.json';

describe('CLI output', () => {
  it.each([[], ['-c', '3'], ['--count=3']])(
    'prints keys for %j',
    async (...args) => {
      let text = '';
      const output = new Writable({
        write(chunk, _encoding, callback) {
          text += chunk.toString();
          callback();
        },
      });
      await cli(args, output);
      const lines = text.trimEnd().split('\n');
      expect(lines).toHaveLength(args.length === 0 ? 1 : 3);
      expect(text.endsWith('\n')).toBe(true);
      expect(lines.every((key) => KEY_PATTERN.test(key))).toBe(true);
    },
  );

  it.each(['--version', '-v'])(
    'reads the package version with %s in source runs',
    async (flag) => {
      let text = '';
      const output = new Writable({
        write(chunk, _encoding, callback) {
          text += chunk.toString();
          callback();
        },
      });
      await cli([flag], output);
      expect(text).toBe(`${version}\n`);
    },
  );

  it.each([
    ['--help', '-c', '2'],
    ['--version', '-c', '2'],
    ['-h', '-v'],
  ])('rejects combined helper flags %j', async (...args) => {
    await expect(cli(args)).rejects.toThrow('Invalid command-line arguments');
  });

  it('waits for a slow reader without losing keys', async () => {
    const chunks: string[] = [];
    let releaseFirstWrite: () => void = () => {};
    const output = new Writable({
      highWaterMark: 1,
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        if (chunks.length === 1) {
          releaseFirstWrite = callback;
        } else {
          setImmediate(callback);
        }
      },
    });
    const write = vi.spyOn(output, 'write');
    const args = ['-c', '2049'];
    const pending = cli(args, output);

    try {
      // The first full batch is blocked. No later batch may be queued.
      expect(write).toHaveBeenCalledTimes(1);
      expect(output.writableLength).toBe(Buffer.byteLength(chunks[0]));
    } finally {
      releaseFirstWrite();
    }
    await pending;

    const lines = chunks.join('').trimEnd().split('\n');
    expect(lines).toHaveLength(2049);
    expect(output.writableLength).toBe(0);
    expect(lines.every((key) => KEY_PATTERN.test(key))).toBe(true);
    expect(new Set(lines).size).toBe(2049);
  });

  it('keeps large-key writes bounded with a slow reader', async () => {
    let writes = 0;
    let bytes = 0;
    const output = new Writable({
      highWaterMark: 1,
      write(chunk, _encoding, callback) {
        writes++;
        bytes += chunk.length;
        expect(chunk.length).toBeLessThanOrEqual(200001);
        setTimeout(callback, 1);
      },
    });
    await cli(['-e', '1000000', '-c', '12'], output);
    expect(writes).toBe(12);
    expect(bytes).toBe(12 * 200001);
  });

  it('rejects an output error while waiting for drain', async () => {
    const output = new Writable({
      highWaterMark: 1,
      write(_chunk, _encoding, callback) {
        callback(new Error('Output failed'));
      },
    });
    await expect(cli(['-c', '2049'], output)).rejects.toThrow('Output failed');
  });
});

describe('CLI closed pipes', () => {
  let directory: string;
  let entry: string;

  beforeAll(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jet-key-cli-'));
    entry = path.join(directory, 'cli.mjs');
    await build({
      entryPoints: ['src/cli/main.ts'],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: entry,
      define: { __JET_KEY_VERSION__: '"test"' },
    });
  });

  afterAll(async () => {
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  });

  it('streams a large total output within a constrained heap', async () => {
    const child = spawn(
      process.execPath,
      ['--max-old-space-size=32', entry, '-e', '1000000', '-c', '1024'],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
        timeout: 10_000,
      },
    );
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    const result = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code, signal) => resolve({ code, signal }));
    });
    expect(result, stderr).toEqual({ code: 0, signal: null });
  }, 15_000);

  it('uses the injected version in a standalone bundle', () => {
    expect(
      execFileSync(process.execPath, [entry, '--version'], {
        encoding: 'utf8',
      }),
    ).toBe('test\n');
  });

  it.each([
    { args: ['--entropy', '256'], count: 1, length: 52 },
    { args: ['--entropy=128', '-c', '3'], count: 3, length: 26 },
    { args: ['-c', '3', '-e', '512'], count: 3, length: 103 },
    { args: ['--entropy', '300001'], count: 1, length: 60001 },
  ])(
    'generates requested entropy in the bundle for $args',
    ({ args, count, length }) => {
      const text = execFileSync(process.execPath, [entry, ...args], {
        encoding: 'utf8',
      });
      const lines = text.trimEnd().split('\n');
      expect(lines).toHaveLength(count);
      for (const key of lines) {
        expect(key).toHaveLength(length);
        expect(key).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
      }
    },
  );

  it('rejects invalid entropy before printing any keys', async () => {
    const write = vi.fn((_chunk, _encoding, callback) => callback());
    const output = new Writable({ write });
    await expect(cli(['--entropy=0'], output)).rejects.toThrow(
      'positive safe integer',
    );
    expect(write).not.toHaveBeenCalled();
  });

  it('documents the key-only CLI', () => {
    const help = execFileSync(process.execPath, [entry, '--help'], {
      encoding: 'utf8',
    });
    expect(help).toContain('jet-key');
    expect(help).toContain('52 Crockford base32 characters');
    expect(help).toContain('--count');
    expect(help).toContain('--entropy');
    expect(help).not.toContain('--type');
  });

  it.each([
    { args: [], closeAfterData: false },
    { args: ['-c', '100000'], closeAfterData: false },
    { args: ['-c', '100000'], closeAfterData: true },
    { args: ['--help'], closeAfterData: false },
    { args: ['--version'], closeAfterData: false },
  ])(
    'exits quietly for $args (close after data: $closeAfterData)',
    async ({ args, closeAfterData }) => {
      const child = spawn(process.execPath, [entry, ...args], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
      });
      let errors = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        errors += chunk;
      });
      // Covers both backpressured batches and small writes whose errors
      // arrive after cli() has already returned.
      if (closeAfterData) {
        child.stdout.once('data', () => child.stdout.destroy());
      } else {
        child.stdout.destroy();
      }
      const result = await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', (code, signal) => resolve({ code, signal }));
      });
      expect(result).toEqual({ code: 0, signal: null });
      expect(errors).toBe('');
    },
  );
});
