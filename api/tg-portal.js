// api/tg-portal.js
import crypto from "node:crypto";

/** Verifica firma del App Proxy (param "signature").
 *  Algoritmo oficial: ordenar los pares k=v (arrays unidos con ","),
 *  concatenar sin separadores y firmar HMAC-SHA256 con el shared secret. */
function verifyProxySignature(fullQueryString, sharedSecret) {
  const qs = (fullQueryString || "").replace(/^\?/, "");
  const params = new URLSearchParams(qs);

  const signature = params.get("signature");
  if (!signature || !sharedSecret) return false; // ← clave: sin firma => false, no crash
  params.delete("signature");

  // Agrupar claves repetidas (a=1&a=2 -> a=1,2)
  const map = {};
  for (const [k, v] of params.entries()) {
    if (!map[k]) map[k] = [];
    map[k].push(v);
  }

  const message = Object.keys(map)
    .sort()
    .map((k) => `${k}=${map[k].join(",")}`)
    .join("");

  const digest = crypto
    .createHmac("sha256", sharedSecret)
    .update(message)
    .digest("hex");
  // timingSafeEqual requiere misma longitud; si no, devuelve false
  if (digest.length !== signature.length) return false;
  
  return crypto.timingSafeEqual(
    Buffer.from(digest, "utf8"),
    Buffer.from(signature, "utf8")
  );
}

// Helper para responder JSON
function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

// Llamada a Appstle (rellena APPSTLE_API_BASE según tu Swagger)
async function appstle(path, init = {}) {
  const base = process.env.APPSTLE_API_BASE; // N/D: tu base real
  if (!base) throw new Error("APPSTLE_API_BASE not set");
  const headers = Object.assign(
    { Authorization: `Bearer ${process.env.APPSTLE_API_KEY}` },
    init.headers || {}
  );
  const r = await fetch(`${base}${path}`, { ...init, headers });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = json?.message || json?.error || `Appstle ${r.status}`;
    throw new Error(msg);
  }
  return json;
}

export default async function handler(req, res) {
  // 0) Seguridad App Proxy
  const okSignature = verifyProxySignature(req.url.split("?")[1] || "", process.env.SHOPIFY_APP_SHARED_SECRET);
  if (!okSignature) return send(res, 401, { error: "Bad proxy signature" });

  // 1) Ruta + método
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname.replace(/^\/api\/tg-portal/, ""); // base en Vercel
  const q = Object.fromEntries(url.searchParams.entries());
  const loggedInId = url.searchParams.get("logged_in_customer_id") || "";
  const customerId = url.searchParams.get("customer_id") || "";

  // Recomendación oficial: además de la firma, valida que el customer logueado
  // coincide con el que se solicita (si lo pasas en customer_id).
  if (customerId && loggedInId && customerId !== loggedInId) {
    return send(res, 403, { error: "Customer mismatch" });
  }

  try {
    // 2) Ping (para probar rápido)
    if (path === "/ping") {
      return send(res, 200, {
        ok: true,
        shop: url.searchParams.get("shop"),
        logged_in_customer_id: loggedInId || null
      });
    }

    // 3) Overview (devuelve forma que espera tu UI) — de momento stub
    if (path === "/overview" && req.method === "GET") {
      // TODO: Mapea tus endpoints reales de Appstle para construir este shape
      // Ejemplo estático para ver la UI funcionando:
      return send(res, 200, {
        subscriptionId: "sub_demo_123",
        weeks: [
          {
            label: "1",
            start: "2025-01-15",
            end: "2025-01-21",
            status: "confirmed",
            summary: "7 principales + 3 postres seleccionados",
            selection: {
              mains: ["Paella Valenciana", "Risotto Trufa", "Salmón Hierbas", "Cordero", "Curry Vegano", "Lubina", "Pollo Limón"],
              desserts: ["Tiramisú", "Crema Catalana", "Mousse Chocolate"]
            },
            delivery: "Valencia — martes 10:00–14:00"
          },
          {
            label: "2",
            start: "2025-01-22",
            end: "2025-01-28",
            status: "pending",
            summary: "Selección pendiente",
            selection: { mains: [], desserts: [] },
            delivery: "N/D"
          }
        ]
      });
    }

    // 4) Listado simple (si quisieras)
    if (path === "/subscriptions" && req.method === "GET") {
      const cid = url.searchParams.get("customer_id");
      // N/D: Rellena el endpoint real desde tu Swagger de Appstle
      // const data = await appstle(`/external/v2/subscriptions?customerId=${encodeURIComponent(cid)}`);
      // return send(res, 200, { subscriptions: normaliza(data) });
      return send(res, 200, { subscriptions: [] }); // placeholder
    }

    // 5) Acciones: pausar / reanudar / saltar (usa tus endpoints reales)
    const pauseMatch = path.match(/^\/subscriptions\/([^/]+)\/pause$/);
    if (pauseMatch && req.method === "POST") {
      const id = pauseMatch[1];
      // await appstle(`/external/v2/subscriptions/${encodeURIComponent(id)}/pause`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ reason: "customer_request" })});
      return send(res, 200, { ok: true, id, action: "pause" });
    }
    const resumeMatch = path.match(/^\/subscriptions\/([^/]+)\/resume$/);
    if (resumeMatch && req.method === "POST") {
      const id = resumeMatch[1];
      // await appstle(`/external/v2/subscriptions/${encodeURIComponent(id)}/resume`, { method: "POST" });
      return send(res, 200, { ok: true, id, action: "resume" });
    }
    const skipMatch = path.match(/^\/subscriptions\/([^/]+)\/skip$/);
    if (skipMatch && req.method === "POST") {
      const id = skipMatch[1];
      // await appstle(`/external/v2/subscriptions/${encodeURIComponent(id)}/skip`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ count: 1 })});
      return send(res, 200, { ok: true, id, action: "skip" });
    }

    return send(res, 404, { error: "Not found" });
  } catch (e) {
    return send(res, 500, { error: e.message || "Server error" });
  }
}
