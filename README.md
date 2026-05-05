# AI 数据库识别系统

浏览器端的图像 → 数据库字段识别工具，支持 Groq / NVIDIA / GitHub Models / 腾讯混元 / HuggingFace（DeepInfra/Together/Fireworks）/ DeepInfra / OpenRouter 等十多家视觉模型 API。

## 🏗 架构

```
┌────────────────────────────────────────────────┐
│  Cloudflare Pages 单一项目                     │
│                                                │
│  ┌──────────────┐    ┌──────────────────────┐  │
│  │  index.html  │───▶│  /api/* (Functions)  │──▶ 海外 AI API
│  │  (前端)       │    │  CORS 代理            │
│  └──────────────┘    └──────────────────────┘  │
│                                                │
│  HTML 与代理同域 → 浏览器无 CORS 预检 → 直通      │
└────────────────────────────────────────────────┘
```

不再需要单独维护一个 Worker 项目。`functions/api/[[path]].js` 是 Cloudflare Pages Functions 的 catch-all 路由，部署 Pages 时会自动识别并接管所有 `/api/*` 请求。

## 📂 目录结构

```
.
├── index.html                  # 主程序，浏览器打开即用
├── functions/
│   └── api/
│       └── [[path]].js         # 同域 CORS 代理（Pages Functions）
├── README.md
└── .gitignore
```

## 🚀 部署到 GitHub + Cloudflare Pages

### 步骤 1：推送到 GitHub

```bash
git init
git add .
git commit -m "feat: 合并 Worker 进 Pages Functions，统一同域代理"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

### 步骤 2：在 Cloudflare Pages 绑定仓库

1. 打开 https://dash.cloudflare.com → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. 选择刚刚的 GitHub 仓库 → **Begin setup**
3. 构建配置全部留空：
   - **Framework preset**：None
   - **Build command**：（留空）
   - **Build output directory**：`/`（或留空）
4. 点 **Save and Deploy**，约 30 秒后部署完成

### 步骤 3：验证

部署完成后会得到一个 `xxxxxx.pages.dev` 地址。访问：

- `https://xxxxxx.pages.dev/` → 主程序
- `https://xxxxxx.pages.dev/api/` → 应该看到 "🌐 AI API 同域代理 · 运行中" 帮助页

如果 `/api/` 看到 404，说明 Pages 没识别 Functions：检查 `functions/api/[[path]].js` 路径大小写、确保 `functions/` 在仓库根目录。

## 🔌 路径映射

前端的「API 基础地址」全部用相对路径，无需任何 CORS 处理：

| 服务 | 基础地址 | 真实目标 |
|---|---|---|
| Groq | `/api/groq` | `api.groq.com/openai` |
| NVIDIA NIM | `/api/nvidia` | `integrate.api.nvidia.com` |
| GitHub Models | `/api/github` | `models.github.ai/inference` |
| 腾讯混元 | `/api/hunyuan` | `api.hunyuan.cloud.tencent.com` |
| HF 推理路由 | `/api/hf` | `router.huggingface.co` |
| DeepInfra 直连 | `/api/deepinfra` | `api.deepinfra.com/v1/openai` |
| OpenRouter | `/api/openrouter` | `openrouter.ai/api` |

国内可直连的服务（智谱 / 硅基流动 / 阿里 / 月之暗面 / 火山豆包 / DeepSeek）依旧走原始域名，**不经过** `/api/` 代理。

## 🔁 从旧 Worker 迁移

旧版本里 HTML 调用 `https://my-ai-proxy.liuqin199513.workers.dev/groq` 之类的硬编码地址，这次全部改成了相对路径 `/api/groq`。

旧的 Worker（独立项目）**可以保留或删除**，不影响 Pages 上的新部署。如果想彻底关闭：dash.cloudflare.com → Workers & Pages → 选中旧 worker → Settings → Delete。

## 🛡️ 白名单

`functions/api/[[path]].js` 的 `ALLOWED_HOSTS` 数组限定了允许转发的目标主机，防止被白嫖成开放代理。要新增服务，往数组里加主机名，再加一条 `ROUTES` 路径即可。

## 💸 成本

Cloudflare Pages Functions 与 Workers 共享免费额度：**100,000 请求/天**。一张图识别一次 = 一次 Functions 请求，正常使用基本不会超。

## 🪪 License

MIT
