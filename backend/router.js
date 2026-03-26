/**
 * Minimal zero-dependency router.
 * Supports static paths and :param segments.
 * Usage:
 *   const router = createRouter();
 *   router.get("/api/foo", handler);
 *   router.post("/api/bar/:id", handler);
 *   await router.dispatch(req, res, pathname); // returns true if matched
 */

function matchRoute(routeMethod, routePath, reqMethod, reqPathname) {
  if (routeMethod !== reqMethod) return null;
  const routeParts = routePath.split("/");
  const reqParts = reqPathname.split("/");
  if (routeParts.length !== reqParts.length) return null;
  const params = {};
  for (let i = 0; i < routeParts.length; i++) {
    if (routeParts[i].startsWith(":")) {
      params[routeParts[i].slice(1)] = decodeURIComponent(reqParts[i]);
    } else if (routeParts[i] !== reqParts[i]) {
      return null;
    }
  }
  return params;
}

export function createRouter() {
  const routes = [];

  function add(method, path, handler) {
    routes.push({ method, path, handler });
  }

  return {
    get(path, handler)    { add("GET",    path, handler); },
    post(path, handler)   { add("POST",   path, handler); },
    delete(path, handler) { add("DELETE", path, handler); },

    async dispatch(req, res, pathname) {
      for (const route of routes) {
        const params = matchRoute(route.method, route.path, req.method, pathname);
        if (params !== null) {
          await route.handler(req, res, params);
          return true;
        }
      }
      return false;
    }
  };
}
