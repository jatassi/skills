// The idle shutdown: a grilling session whose agent and page have both gone
// quiet for the idle limit ends itself, so a forgotten tab or an agent that
// never ran `end` doesn't leave a server running.

export const IDLE_LIMIT_MS = 60 * 60 * 1000;

/** Hidden and undocumented: tests shorten the idle limit with it. */
const IDLE_ENV = 'VISUAL_GRILLING_IDLE_MS';

export function idleLimitMs(env: NodeJS.ProcessEnv = process.env): number {
  const override = Number(env[IDLE_ENV]);
  return Number.isFinite(override) && override > 0 ? override : IDLE_LIMIT_MS;
}

export interface IdleWatch {
  /** Records activity now. */
  touch(): void;
}

/**
 * Calls `onIdle` once nothing has touched the watch for `limitMs` while
 * `busy()` stayed false. `busy()` covers activity that lasts, like a waiting
 * `await`.
 */
export function watchIdle(limitMs: number, busy: () => boolean, onIdle: () => void): IdleWatch {
  let last = Date.now();
  const timer = setInterval(
    () => {
      if (busy()) last = Date.now();
      else if (Date.now() - last >= limitMs) {
        clearInterval(timer);
        onIdle();
      }
    },
    Math.max(25, Math.min(limitMs / 4, 60_000)),
  );
  return {
    touch: () => {
      last = Date.now();
    },
  };
}
