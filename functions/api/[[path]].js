/**
 * AI 数据库识别系统 — Cloudflare Pages Functions 同域代理
 * 路径：functions/api/[[path]].js  →  接管所有 /api/* 请求
 *
 * 与 HTML 同域部署在 Cloudflare Pages 上，浏览器不会触发 CORS 预检。
 * （CORS 头仍保留，便于第三方调用时跨域。）
 *
 * 路由表（前端基础地址 → 实际目标）：
 *   /api/groq/v1/chat/completions      → https://api.groq.com/openai/v1/chat/completions
 *   /api/nvidia/v1/chat/completions    → https://integrate.api.nvidia.com/v1/chat/completions
 *   /api/github/chat/completions       → https://models.github.ai/inference/chat/completions
 *   /api/hunyuan/v1/chat/completions   → https://api.hunyuan.cloud.tencent.com/v1/chat/completions
 *   /api/hf/v1/chat/completions        → https://router.huggingface.co/v1/chat/completions
 *   /api/deepinfra/chat/completions    → https://api.deepinfra.com/v1/openai/chat/completions
 *   /api/openrouter/v1/chat/completions→ https://openrouter.ai/api/v1/chat/completions
 *
 * 也支持 X-Target-URL 请求头自定义任意目标（仅限白名单内主机）。
 */

const ROUTES = {
  '/api/groq/':        'https://api.groq.com/',        // 修复：base 去掉 openai/，避免与前端路径的 openai/ 重复（原来会拼成 /openai/openai/ → 404）
  '/api/nvidia/':      'https://integrate.api.nvidia.com/',
  '/api/github/':      'https://models.github.ai/inference/',
  '/api/hunyuan/':     'https://api.hunyuan.cloud.tencent.com/',
  '/api/hf/':          'https://router.huggingface.co/',
  '/api/deepinfra/':   'https://api.deepinfra.com/v1/openai/',
  '/api/openrouter/':  'https://openrouter.ai/api/',
  '/api/together/':    'https://api.together.xyz/',
  '/api/fireworks/':   'https://api.fireworks.ai/',
  '/api/mistral/':     'https://api.mistral.ai/',
  '/api/openai/':      'https://api.openai.com/',
  '/api/anthropic/':   'https://api.anthropic.com/',
  '/api/xai/':         'https://api.x.ai/',
  '/api/gemini/':      'https://generativelanguage.googleapis.com/',
  '/api/dashscope/':   'https://dashscope.aliyuncs.com/',
  '/api/moonshot/':    'https://api.moonshot.cn/',
  '/api/stepfun/':     'https://api.stepfun.com/',
  '/api/minimax/':     'https://api.minimax.chat/',
  '/api/deepseek/':    'https://api.deepseek.com/',
  '/api/zhipu/':       'https://open.bigmodel.cn/',
  '/api/siliconflow/': 'https://api.siliconflow.cn/',
};

const ALLOWED_HOSTS = [
  'router.huggingface.co',
  'api-inference.huggingface.co',
  'api.groq.com',
  'models.github.ai',
  'models.inference.ai.azure.com',
  'api.hunyuan.cloud.tencent.com',
  'api.together.xyz',
  'api.fireworks.ai',
  'integrate.api.nvidia.com',
  'api.cerebras.ai',
  'api.mistral.ai',
  'api.cohere.ai',
  'api.deepinfra.com',
  'api.openrouter.ai',
  'openrouter.ai',
  'api.openai.com',
  'api.anthropic.com',
  'api.x.ai',
  'generativelanguage.googleapis.com',
  'dashscope.aliyuncs.com',
  'api.moonshot.cn',
  'api.stepfun.com',
  'api.minimax.chat',
  'api.deepseek.com',
  'open.bigmodel.cn',
  'api.siliconflow.cn',
];

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Target-URL, x-api-key, anthropic-version',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonError(message, status = 400, extra = {}) {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

export async function onRequest(context) {
  const { request } = context;

  // CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  const url = new URL(request.url);

  // 根 /api 或 /api/ 返回帮助页（方便人工访问验证）
  if (url.pathname === '/api' || url.pathname === '/api/') {
    return new Response(helpPage(), {
      headers: { ...corsHeaders(), 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // 1. 路径前缀路由
  let targetUrl = null;
  for (const prefix in ROUTES) {
    if (url.pathname.startsWith(prefix)) {
      targetUrl = ROUTES[prefix] + url.pathname.slice(prefix.length) + url.search;
      break;
    }
  }

  // 2. X-Target-URL 头部兜底
  if (!targetUrl) {
    targetUrl = request.headers.get('X-Target-URL');
  }

  if (!targetUrl) {
    return jsonError('请使用路径快捷方式或 X-Target-URL 请求头', 400, {
      shortcuts: Object.keys(ROUTES),
    });
  }

  // 3. 目标主机白名单校验
  let targetHost;
  try {
    targetHost = new URL(targetUrl).hostname;
  } catch {
    return jsonError('无效的目标 URL: ' + targetUrl, 400);
  }
  if (!ALLOWED_HOSTS.some(h => targetHost === h || targetHost.endsWith('.' + h))) {
    return jsonError(`域名 ${targetHost} 不在白名单中`, 403);
  }

  // 4. 转发请求头：剔除 hop-by-hop 与 CF 注入的头
  const newHeaders = new Headers();
  for (const [key, value] of request.headers) {
    const k = key.toLowerCase();
    if (k === 'host' || k === 'origin' || k === 'referer' || k === 'x-target-url' || k.startsWith('cf-')) continue;
    newHeaders.set(key, value);
  }

  // 5. 转发，body 直接透传（保持流式响应能力）
  try {
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : request.body,
    });

    const respHeaders = new Headers(upstream.headers);
    // 用我方 CORS 头覆盖上游可能存在的限制
    for (const [k, v] of Object.entries(corsHeaders())) respHeaders.set(k, v);
    // 删除可能干扰 SSE 的 content-encoding（CF Pages 已自动解压）
    respHeaders.delete('content-encoding');
    respHeaders.delete('content-length');

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: respHeaders,
    });
  } catch (e) {
    return jsonError('转发失败: ' + (e.message || String(e)), 502);
  }
}

function helpPage() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>AI API Proxy · Pages Functions</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#1d1d1f;line-height:1.7}
code{background:#f5f5f7;padding:2px 6px;border-radius:4px;font-size:13px;font-family:ui-monospace,Menlo,monospace}
h1{color:#007AFF;margin:0 0 4px}h2{font-size:15px;margin:24px 0 8px;color:#1d1d1f}
.card{background:#f5f5f7;border-radius:12px;padding:14px 16px;margin:10px 0;font-size:13px}
.tag{display:inline-block;background:#34c759;color:#fff;padding:2px 8px;border-radius:6px;font-size:11px;margin-left:6px;vertical-align:middle}</style></head><body>
<h1>🌐 AI API 同域代理 <span class="tag">运行中</span></h1>
<p style="color:#86868b;margin:0">由 Cloudflare Pages Functions 提供 · 同域部署，无 CORS 问题</p>
<h2>📌 已注册路径（前端把「API 基础地址」设为这些相对路径即可）</h2>
<div class="card">
<code>/api/groq/openai/v1/chat/completions</code> → Groq<br>
<code>/api/nvidia/v1/chat/completions</code> → NVIDIA NIM<br>
<code>/api/github/chat/completions</code> → GitHub Models<br>
<code>/api/hunyuan/v1/chat/completions</code> → 腾讯混元<br>
<code>/api/hf/v1/chat/completions</code> → HuggingFace 路由<br>
<code>/api/openrouter/v1/chat/completions</code> → OpenRouter<br>
<code>/api/together/v1/chat/completions</code> → Together AI<br>
<code>/api/fireworks/inference/v1/chat/completions</code> → Fireworks<br>
<code>/api/mistral/v1/chat/completions</code> → Mistral<br>
<code>/api/openai/v1/chat/completions</code> → OpenAI<br>
<code>/api/anthropic/v1/messages</code> → Anthropic Claude<br>
<code>/api/xai/v1/chat/completions</code> → xAI Grok<br>
<code>/api/gemini/v1beta/models/...</code> → Google Gemini<br>
<code>/api/dashscope/compatible-mode/v1/chat/completions</code> → 阿里百炼 Qwen-VL<br>
<code>/api/moonshot/v1/chat/completions</code> → Kimi · <code>/api/stepfun/...</code> 阶跃 · <code>/api/minimax/...</code> MiniMax · <code>/api/deepseek/...</code> · <code>/api/zhipu/...</code> 智谱 · <code>/api/siliconflow/...</code> 硅基
</div>
<h2>🔧 用法</h2>
<div class="card">前端将「API 基础地址」配置为相对路径（如 <code>/api/nvidia</code>）即可。<br>
HTML 与 Functions 同域，浏览器不触发 CORS 预检，请求直接打过来。</div>
<p style="color:#86868b;font-size:12px;margin-top:24px">免费额度：Cloudflare Pages Functions 共享 Workers 配额 · 10 万次/天</p>
</body></html>`;
}
