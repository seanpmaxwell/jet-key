import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const REPO = path.resolve(import.meta.dirname, '../..');
const npm = process.env.npm_execpath;
let workspace: string;
let project: string;
let consumer: string;
let tarball: string;

async function npmRun(args: string[], cwd: string) {
  if (!npm) throw new Error('Run package tests through npm run test:package.');
  return run(process.execPath, [npm, ...args], {
    cwd,
    timeout: 90_000,
    killSignal: 'SIGKILL',
    maxBuffer: 2 * 1024 * 1024,
    env: {
      ...process.env,
      npm_config_cache: path.join(workspace, 'npm-cache'),
    },
  });
}

async function artifactContents() {
  const files = await fs.readdir(path.join(project, 'lib'));
  return Promise.all(
    files
      .sort()
      .map(async (file) => [
        file,
        await fs.readFile(path.join(project, 'lib', file), 'utf8'),
      ]),
  );
}

beforeAll(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'jet-key-package-'));
  project = path.join(workspace, 'project');
  consumer = path.join(workspace, 'consumer');
  await fs.mkdir(project);
  await fs.mkdir(consumer);
  for (const file of [
    'src',
    'scripts',
    'package.json',
    'tsconfig.json',
    'tsconfig.build.json',
    'README.md',
    'LICENSE',
  ]) {
    await fs.cp(path.join(REPO, file), path.join(project, file), {
      recursive: true,
    });
  }
  await fs.symlink(
    path.join(REPO, 'node_modules'),
    path.join(project, 'node_modules'),
    'dir',
  );
  // A new version and stale artifact prove that prepack builds fresh output.
  const pkg = JSON.parse(
    await fs.readFile(path.join(project, 'package.json'), 'utf8'),
  );
  pkg.version = '0.0.0-package-test';
  await fs.writeFile(path.join(project, 'package.json'), JSON.stringify(pkg));
  await fs.mkdir(path.join(project, 'lib'));
  await fs.writeFile(
    path.join(project, 'lib', 'stale.js'),
    'throw new Error("stale");',
  );
  const readme = await fs.readFile(path.join(project, 'README.md'), 'utf8');
  await npmRun(['pack', '--json', '--pack-destination', workspace], project);
  expect(await fs.readFile(path.join(project, 'README.md'), 'utf8')).toBe(
    readme,
  );
  expect(await fs.readdir(path.join(project, 'lib'))).not.toContain('stale.js');
  tarball = path.join(workspace, 'jet-key-0.0.0-package-test.tgz');
  await fs.writeFile(
    path.join(consumer, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  await npmRun(
    [
      'install',
      tarball,
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ],
    consumer,
  );
});

afterAll(async () => {
  if (workspace) await fs.rm(workspace, { recursive: true, force: true });
});

describe('installed tarball', () => {
  it('exports the API and all shared chunks with working entropy validation', async () => {
    const { stdout } = await run(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import assert from 'node:assert/strict';
      import jetKey, * as api from 'jet-key';
      assert.deepEqual(Object.keys(api), ['default']);
      assert.equal(jetKey().length, 52);
      for (const [bits, length] of [[128,26],[256,52],[512,103],[1048576,209716]]) {
        const key = jetKey(bits);
        assert.equal(key.length, length);
        assert.match(key, /^[0-9A-HJKMNP-TV-Z]+$/);
      }
      assert.throws(() => jetKey(1048577), RangeError);
      console.log('ok');
    `,
      ],
      { cwd: consumer, timeout: 10_000 },
    );
    expect(stdout.trim()).toBe('ok');
  });

  it('installs an executable CLI with the package version and requested output', async () => {
    const cli = path.join(consumer, 'node_modules', '.bin', 'jet-key');
    const { stdout: version } = await run(cli, ['--version'], {
      timeout: 10_000,
    });
    expect(version).toBe('0.0.0-package-test\n');
    const { stdout } = await run(cli, ['-e', '128', '-c', '3'], {
      timeout: 10_000,
    });
    expect(stdout.trimEnd().split('\n')).toHaveLength(3);
    expect(
      stdout
        .trimEnd()
        .split('\n')
        .every((key) => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(key)),
    ).toBe(true);
    await expect(
      run(cli, ['--entropy=1048577'], { timeout: 10_000 }),
    ).rejects.toMatchObject({ code: 1, stdout: '' });
  });

  it('ships usable declarations and only intended package files', async () => {
    await fs.writeFile(
      path.join(consumer, 'check.ts'),
      `
      import jetKey from 'jet-key';
      // @ts-expect-error only the default export is supported
      import { jetKey as named } from 'jet-key';
      const keys: string[] = [jetKey(), jetKey(256)];
      // @ts-expect-error entropy must be numeric
      jetKey('256');
      void keys;
    `,
    );
    await run(
      process.execPath,
      [
        path.join(REPO, 'node_modules/typescript/bin/tsc'),
        '--noEmit',
        '--strict',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        '--target',
        'ES2022',
        'check.ts',
      ],
      { cwd: consumer, timeout: 30_000 },
    );
    const files = await fs.readdir(path.join(consumer, 'node_modules/jet-key'));
    expect(files.sort()).toEqual(
      ['LICENSE', 'README.md', 'lib', 'package.json'].sort(),
    );
  });
});

describe('build failure recovery', () => {
  it('preserves previous artifacts and README when packing fails validation', async () => {
    const before = await artifactContents();
    const readme = await fs.readFile(path.join(project, 'README.md'), 'utf8');
    const entry = path.join(project, 'src/index.ts');
    const source = await fs.readFile(entry, 'utf8');
    try {
      await fs.appendFile(entry, '\nconst invalid: string = 123;\n');
      await expect(
        npmRun(['pack', '--pack-destination', workspace], project),
      ).rejects.toThrow();
      expect(await artifactContents()).toEqual(before);
      expect(await fs.readFile(path.join(project, 'README.md'), 'utf8')).toBe(
        readme,
      );
      expect(
        (await fs.readdir(project)).filter((name) =>
          name.startsWith('.jet-key-build'),
        ),
      ).toEqual([]);
    } finally {
      await fs.writeFile(entry, source);
    }
  });

  it('preserves previous artifacts when bundling fails after typechecking', async () => {
    const before = await artifactContents();
    const entry = path.join(project, 'src/index.ts');
    const source = await fs.readFile(entry, 'utf8');
    const declaration = path.join(project, 'src/missing.d.ts');
    try {
      await fs.writeFile(
        declaration,
        'declare const value: string; export default value;',
      );
      await fs.appendFile(
        entry,
        "\nexport { default as missing } from './missing';\n",
      );
      await expect(npmRun(['run', 'build'], project)).rejects.toThrow();
      expect(await artifactContents()).toEqual(before);
      expect(
        (await fs.readdir(project)).filter((name) =>
          name.startsWith('.jet-key-build'),
        ),
      ).toEqual([]);
    } finally {
      await fs.writeFile(entry, source);
      await fs.rm(declaration);
    }
  });

  it('rejects a competing build without removing its lock or existing output', async () => {
    const before = await artifactContents();
    const lock = path.join(project, '.jet-key-build.lock');
    await fs.mkdir(lock);
    try {
      await expect(npmRun(['run', 'build'], project)).rejects.toThrow();
      expect(await artifactContents()).toEqual(before);
      expect((await fs.stat(lock)).isDirectory()).toBe(true);
    } finally {
      await fs.rmdir(lock);
    }
  });
});
