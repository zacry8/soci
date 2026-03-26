import http from "node:http";
import { config } from "./config.js";
import { createRouter } from "./router.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerShareRoutes } from "./routes/share.js";
import { registerUploadRoutes } from "./routes/uploads.js";
import { json, parseUrl, pickCorsOrigin } from "./utils.js";

// ── Startup validation ────────────────────────────────────────────────────────
if (config.authSecret === "replace-this-in-production") {
  throw new Error("[soci] AUTH_SECRET is still the default. Set a strong secret in .env (copy .env.example).");
}
if (config.adminPassword === "change-me-now") {
  throw new Error("[soci] ADMIN_PASSWORD is still the default. Set a strong password in .env (copy .env.example).");
}

// ── Router ────────────────────────────────────────────────────────────────────
const router = createRouter();
registerHealthRoutes(router);
registerAuthRoutes(router, config);
registerAdminRoutes(router, config);
registerShareRoutes(router);
registerUploadRoutes(router, config);

// ── Server ────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const { pathname } = parseUrl(req);
  const origin = req.headers.origin || "";
  const allowedOrigin = pickCorsOrigin(origin, config.corsOrigins);

  // CORS headers
  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Referrer-Policy", "no-referrer");

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const handled = await router.dispatch(req, res, pathname);
  if (!handled) return json(res, 404, { error: "Not found" });
});

// eslint-disable-next-line no-console
server.listen(config.port, () => console.log(`[soci-api] listening on http://localhost:${config.port}`));
