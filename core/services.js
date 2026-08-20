// Service registry.
//
// A "service" is a long-lived module that does not fit the per-auction hook
// model: HTTP endpoints, event sinks, background work. Services live here by
// name, expose their own methods, and know nothing about HTTP routing. A
// service may optionally declare routes as data via `routes()` — the wiring in
// index.js is the only place that binds those declarations to the router, so
// services stay independent of routes (and testable without a server).
export function createServices() {
  const index = new Map();

  function register(name, instance) {
    if (index.has(name)) throw new Error(`Service "${name}" already registered`);
    index.set(name, instance);
    return instance;
  }

  function get(name) {
    return index.get(name) ?? null;
  }

  function all() {
    return [...index.values()];
  }

  return { register, get, all, has: name => index.has(name) };
}
