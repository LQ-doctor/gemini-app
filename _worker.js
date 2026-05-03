/**
 * Cloudflare Pages Advanced Mode Worker
 * Gemini API Reverse Proxy
 *
 * Browser request:  /api/gemini/v1beta/models/gemini-2.5-flash:generateContent?key=xxx
 * Forwards to:      https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=xxx
 *
 * Cloudflare edge nodes run on overseas IPs, so Google won't block them.
 * The browser accesses a same-origin URL (/api/gemini/...) so no CORS issues.
 */
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // Handle OPTIONS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-goog-api-key',
            'Access-Control-Max-Age': '86400',
          },
        });
      }

      // Route: /api/gemini/* -> proxy to Google Generative Language API
      if (url.pathname.startsWith('/api/gemini')) {
        const upstreamPath = url.pathname.replace(/^\/api\/gemini/, '');
        if (!upstreamPath) {
          return new Response(JSON.stringify({ error: { message: 'Bad path' } }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const upstreamUrl = `https://generativelanguage.googleapis.com${upstreamPath}${url.search}`;

        const init = {
          method: request.method,
          headers: {
            'Content-Type': request.headers.get('Content-Type') || 'application/json',
          },
        };

        if (request.method !== 'GET' && request.method !== 'HEAD') {
          init.body = await request.text();
        }

        let upstream;
        try {
          upstream = await fetch(upstreamUrl, init);
        } catch (e) {
          return new Response(JSON.stringify({
            error: { message: 'Proxy upstream fetch failed: ' + e.message }
          }), {
            status: 502,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }

        const responseHeaders = new Headers();
        responseHeaders.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-goog-api-key');

        return new Response(upstream.body, {
          status: upstream.status,
          headers: responseHeaders,
        });
      }

      // All other requests: serve static assets (index.html, etc.)
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return new Response('Not found', { status: 404 });

    } catch (err) {
      return new Response(JSON.stringify({
        error: { message: 'Worker error: ' + err.message }
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
};
