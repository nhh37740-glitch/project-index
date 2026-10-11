# 主页发布参数与 RAG 门禁

日期：2026-10-11（北京时间）；任务 RAG-OPENROUTER-20261010。

Jenkins `DEPLOY=true` 发布静态镜像。仅更新页面文案时同时传 `STATIC_ONLY=true`，执行 `deploy/deploy.sh` 并核验既有公共路由，跳过两个共用 Nginx 安装脚本。默认 `STATIC_ONLY=false` 保留既有发布流程；路由修改仍归平台运维，需要对应授权。

主页公共 RAG smoke 使用 `openrouter --metadata-only`，验证公开/只读边界、静态资源、默认免费模型及全站 20 次额度元数据；不发送 `api/demo/chat`。真实模型与检索问答由 RAG 发布负责验收，主页文案发布不重复消费额度。完整模型运行依据见 [RAG OPENROUTER_RUNTIME.md](https://github.com/nhh37740-glitch/ai-rag-platform/blob/master/docs/OPENROUTER_RUNTIME.md)。

若实际模型与声明不同，门禁失败；不自动切换提供商、重置计数或覆写凭据。此参数仅控制本主页流水线，不约束其他项目。
