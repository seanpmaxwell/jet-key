// ========================================================================= //
//                                   TYPES                                   //
// ========================================================================= //

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFn = (...args: any[]) => any;

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/**
 * Print info.
 */
function info(...args: unknown[]): void {
  callConsoleFn(args, 'info');
}

/**
 * Print error.
 */
function error(...args: unknown[]): void {
  callConsoleFn(args, 'error');
}

/**
 * Print a warning.
 */
function warn(...args: unknown[]): void {
  callConsoleFn(args, 'warn');
}

// ============================= Shared Helpers ============================ //

/**
 * Wrap the console function so we don't have to disable eslint repeatedly or
 * for the whole file.
 *
 * @private
 */
function callConsoleFn(
  args: unknown[],
  fnKey: 'info' | 'warn' | 'error',
): void {
  // eslint-disable-next-line no-console
  return console[fnKey](...args);
}

// ========================================================================= //
//                                  EXPORT                                   //
// ========================================================================= //

export default {
  info,
  error,
  warn,
} as const;
