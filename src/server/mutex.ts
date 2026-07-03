/**
 * Minimal per-key async serializer. Runs fn() for a given key strictly after any
 * previously-queued fn() for the same key has settled — turning a read-modify-write
 * (getRules → setRules) into an atomic critical section within this process, so
 * concurrent saves for the same mailbox can't lose an update.
 *
 * Single-process scope (the app runs as one container). A multi-instance deployment
 * would additionally need server-side optimistic concurrency; noted for later.
 */
const chains = new Map<string, Promise<unknown>>();

export function withKeyedLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  // Run fn after prev settles (success OR failure), so one caller's error can't
  // deadlock the next.
  const run = prev.then(fn, fn);
  // The next waiter chains on this run, but must not see its rejection.
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  chains.set(key, tail);
  // Best-effort cleanup so the map doesn't grow unbounded across many mailboxes.
  tail.then(() => {
    if (chains.get(key) === tail) chains.delete(key);
  });
  return run;
}
