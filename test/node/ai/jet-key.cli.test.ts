import { describe, expect, it } from 'vitest';

import cmdLineParser from '@src/cli/_internal/cmdLineParser';

// ========================================================================= //
//                                   TESTS                                   //
// ========================================================================= //

// ---- Defaults
describe('cmdLineParser', () => {
  it('defaults to one random key', () => {
    const parsed = cmdLineParser([]);
    expect(parsed).toEqual({
      help: false,
      version: false,
      count: 1,
      entropy: 256,
    });
  });

  it('accepts every flag in long and short form', () => {
    // Each pair must parse the same way, or a short flag is missing or is
    // pointing at the wrong option.
    const pairs: [string[], string[]][] = [
      [['--help'], ['-h']],
      [['--version'], ['-v']],
      [
        ['--entropy', '128'],
        ['-e', '128'],
      ],
      [
        ['--count', '5'],
        ['-c', '5'],
      ],
    ];
    for (const [long, short] of pairs) {
      const shortParsed = cmdLineParser(short);
      const longParsed = cmdLineParser(long);
      const label = short.join(' ');
      expect(shortParsed, label).toEqual(longParsed);
    }
  });

  it('parses --count', () => {
    for (const args of [['--count', '5'], ['-c', '5'], ['--count=5']]) {
      const parsed = cmdLineParser(args);
      expect(parsed.count, args.join(' ')).toBe(5);
    }
  });

  it('rejects generator selection flags', () => {
    for (const args of [
      ['--type=key'],
      ['-t', 'key'],
      ['--type', 'timed'],
      ['-t', 'mono'],
    ]) {
      expect(() => cmdLineParser(args), args.join(' ')).toThrow();
    }
  });

  it('rejects a count that is not a positive integer', () => {
    for (const value of ['0', '-1', '1.5', 'abc', '']) {
      expect(() => cmdLineParser(['-c', value]), value).toThrow();
    }
  });

  it('rejects counts outside the safe integer range', () => {
    for (const value of ['9007199254740992', '9007199254740993', '1e100']) {
      expect(() => cmdLineParser(['-c', value]), value).toThrow(
        'positive safe integer',
      );
    }
    expect(cmdLineParser(['-c', String(Number.MAX_SAFE_INTEGER)]).count).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it('rejects an unknown flag', () => {
    expect(() => cmdLineParser(['--nope'])).toThrow();
    expect(() => cmdLineParser(['-z'])).toThrow();
  });

  it('rejects the boolean flags this replaced', () => {
    for (const args of [['--timed'], ['--mono'], ['--key'], ['-m'], ['-k']]) {
      expect(() => cmdLineParser(args), args.join(' ')).toThrow();
    }
  });

  it('requires --help and --version to come first', () => {
    expect(() => cmdLineParser(['-c', '2', '--help'])).toThrow();
    expect(() => cmdLineParser(['-c', '2', '--version'])).toThrow();
    const help = cmdLineParser(['--help']);
    expect(help.help).toBe(true);

    const version = cmdLineParser(['--version']);
    expect(version.version).toBe(true);
  });
});

describe('CLI entropy', () => {
  it.each([['--entropy', '256'], ['--entropy=256'], ['-e', '256']])(
    'parses %j',
    (...args) => {
      expect(cmdLineParser(args).entropy).toBe(256);
    },
  );

  it.each([
    ['--entropy', '128', '-c', '3'],
    ['-c', '3', '-e', '128'],
  ])('combines entropy and count for %j', (...args) => {
    expect(cmdLineParser(args)).toMatchObject({ entropy: 128, count: 3 });
  });

  it.each(['0', '-1', '1.5', '', 'abc', 'NaN', 'Infinity', '9007199254740992'])(
    'rejects invalid entropy %j',
    (value) => {
      expect(() => cmdLineParser([`--entropy=${value}`])).toThrow(
        'positive safe integer',
      );
    },
  );

  it.each([['--entropy'], ['-e'], ['-e', '-c', '3']])(
    'requires an entropy value for %j',
    (...args) => {
      expect(() => cmdLineParser(args)).toThrow();
    },
  );
});

it('rejects entropy above the resource limit', () => {
  expect(() => cmdLineParser(['--entropy=1048577'])).toThrow('must not exceed');
});
