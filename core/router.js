// HTTP route registry.
//
// A tiny method+path table that core/server.js consults on every request.
// Matching is exact on the pathname; a path of '*' is a catch-all for that
// method (used by the bid endpoint, which accepts POST to any URL). Query
// strings are the handler's concern. Handlers are (req, res, params) => void
// on raw node:http, matching the rest of the server.
export function createRouter() {
  const routes = [];

  function add(method, path, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Route ${method} ${path}: handler must be a function`);
    }
    routes.push({ method: method.toUpperCase(), path, handler });
  }

  function resolve(method, pathname) {
    const m = (method ?? '').toUpperCase();
    // Exact path wins; fall back to the method's catch-all ('*').
    const hit =
      routes.find(r => r.method === m && r.path === pathname) ??
      routes.find(r => r.method === m && r.path === '*');
    return hit ? { handler: hit.handler, params: {} } : null;
  }

  return { add, resolve };
}
