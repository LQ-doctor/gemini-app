// Cloudflare Pages _worker.js (Advanced Mode) - Gemini Proxy v4
// Place at deployment root.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      // Gemini API proxy
      if (url.pathname.indexOf("/api/gemini") === 0) {
        return await proxyGemini(request, url);
      }

      // Static assets
      if (env && env.ASSETS && typeof env.ASSETS.fetch === "function") {
        return await env.ASSETS.fetch(request);
      }

      const envKeys = env ? Object.keys(env).join(", ") : "no env";
      return errResp(
        "ASSETS binding not found. env keys: [" + envKeys + "].",
        500
      );
    } catch (e) {
      return errResp(
        "Top-level worker error: " + (e && e.message ? e.message : String(e)),
        500
      );
    }
  },
};

async function proxyGemini(request, url) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const upstreamPath = url.pathname.replace(/^\/api\/gemini/, "");
  if (!upstreamPath || upstreamPath === "/") {
    return jsonResp({ error: { message: "Path required after /api/gemini" } }, 400);
  }

  const target = "https://generativelanguage.googleapis.com" + upstreamPath + url.search;

  const init = {
    method: request.method,
    headers: {
      "Content-Type": request.headers.get("Content-Type") || "application/json",
      "Accept": "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      init.body = await request.text();
    } catch (e) {
      return jsonResp(
        { error: { message: "Body read failed: " + (e && e.message ? e.message : String(e)) } },
        400
      );
    }
  }

  let upstream;
  try {
    upstream = await fetch(target, init);
  } catch (e) {
    return jsonResp(
      { error: { message: "Upstream Google fetch failed: " + (e && e.message ? e.message : String(e)) } },
      502
    );
  }

  const respHeaders = new Headers();
  respHeaders.set(
    "Content-Type",
    upstream.headers.get("Content-Type") || "application/json"
  );
  for (const k in CORS) {
    respHeaders.set(k, CORS[k]);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
}

function errResp(message, status) {
  return new Response(message, {
    status: status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS },
  });
}

function jsonResp(obj, status) {
  return new Response(JSON.stringify(obj, null, 2), {
    status: status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}
