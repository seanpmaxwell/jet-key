import logger from './logger';

// ========================================================================= //
//                                 FUNCTIONS                                 //
// ========================================================================= //

/**
 * Wrap a module's top-level entry logic (scripts, playgrounds). The callback
 * runs immediately; if it throws, the error is logged with `cbName` for
 * context and then rethrown so the process still exits non-zero.
 */
async function onInit<T>(cb: () => Promise<T>, cbName?: string): Promise<T> {
  try {
    return await cb();
  } catch (err) {
    logger.error(`onInit function "${cbName}" failed:`, err);
    throw err;
  }
}

/**
 * Same as above but synchronous.
 */
onInit.sync = function <T>(cb: () => T, cbName?: string): T {
  try {
    return cb();
  } catch (err) {
    logger.error(`onInit.sync function "${cbName}" failed:`, err);
    throw err;
  }
};

// Useful for temporarily disabling the callback (e.g. in playgrounds)
onInit.skip = function skip(_: () => void | unknown, __?: string): void {};

// ========================================================================= //
//                                  EXPORT                                   //
// ========================================================================= //

export default onInit;
