import { Writable } from 'stream';

// ========================================================================= //
//                                 CONSTANTS                                 //
// ========================================================================= //

const HELP_TEXT = `
  jet-key - generate secure random secret keys

  Usage:
    jet-key [options]

  By default, each key contains 52 Crockford base32 characters (260 random bits).
  Each character provides 5 bits; key length is ceil(entropy / 5).

  Options:
    -h, --help          Show this help. Must be the only argument.
    -v, --version       Show the version. Must be the only argument.
    -c, --count <n>     How many keys to print (default: 1).
    -e, --entropy <n>   Requested bits of entropy (default: 256).
                       Must be an integer from 1 to 1,048,576.

  Examples:
    jet-key                    One random secret key
    jet-key -c 10              Ten keys, one per line
    jet-key --count=10         Ten keys, one per line
    jet-key --entropy 256      One 52-character key
    jet-key -e 128 -c 10       Ten 26-character keys`;

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/**
 * Print the help text above to the command line
 */
function printHelpText(output: Writable): boolean {
  return output.write(HELP_TEXT.trim() + '\n');
}

// ========================================================================= //
//                                  EXPORT                                   //
// ========================================================================= //

export default printHelpText;
