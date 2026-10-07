/**
 * Run at most one asynchronous operation for a given context key.
 *
 * A new context is allowed to start while an older one is still pending.  The
 * identity check in the completion handlers prevents the older promise from
 * clearing the newer flight.  This is useful for dashboard refreshes where a
 * range/device switch must not wait for a request that is no longer relevant.
 */
export function runSingleFlight(flightRef, key, task) {
  const current = flightRef?.current;
  if (current && Object.is(current.key, key)) return current.promise;

  const promise = Promise.resolve().then(task);
  const flight = { key, promise };
  flightRef.current = flight;
  const clearIfCurrent = () => {
    if (flightRef.current === flight) flightRef.current = null;
  };
  // Supply both rejection and fulfillment handlers so observing completion
  // never creates an unhandled-rejection branch of its own.
  promise.then(clearIfCurrent, clearIfCurrent);
  return promise;
}
