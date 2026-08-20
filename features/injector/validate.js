import { assertHook } from '../../core/interfaces.js';

// Wrap a raw adapter export with runtime checks.
// Catches undefined returns (forgot `return ctx;`) and other type errors early.
export function wrapHandler(handler, label) {
  assertHook(handler, label);

  return async function wrappedHook(ctx) {
    const result = await handler(ctx);

    if (result === undefined) {
      throw new Error(`${label}: hook returned undefined — must return ctx or null`);
    }

    return result;
  };
}
