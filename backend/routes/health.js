import { json } from "../utils.js";
import { now } from "../utils.js";

export function registerHealthRoutes(router) {
  router.get("/health", (_req, res) => {
    return json(res, 200, { ok: true, service: "soci-api", time: now() });
  });
}
