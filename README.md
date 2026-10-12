# 项目主页

展示顺序（2026-10-12）：雷达回放、RAG 文档问答、C++ 视频状态面板优先，其后为影音素材和 Qt 桌面项目，Java 与 Go 智能助手放在最后。项目能力与访问入口保持原有说明。

简洁的个人主页，独立展示项目、私有仓库目录和脱敏技术经历。公开静态文件位于 `web/`。完整简历的受控交付有独立的 `resume-gateway/` Docker 模块，以及备用的 `worker/` Cloudflare Worker 模块；原始 PDF、访问令牌及令牌摘要均不属于本仓库。

## 模块

| 模块 | 交付物 | 验证 |
| --- | --- | --- |
| `web/` | 四个 HTML 页面、样式和访问脚本 | `python3 deploy/validate.py` |
| `resume-gateway/` | 只监听服务器回环端口的独立 PDF 访问容器 | 七项标准库行为测试、Jenkins Docker 构建 |
| `worker/` | Cloudflare Worker 源码 | 匿名请求拒绝、专属链接成功、响应禁止缓存 |
| `deploy/` | 静态 ZIP、Docker 和 Jenkins 部署流程 | Jenkins 构建、镜像 smoke 与线上 smoke |
| `radar/` | 历史素材；当前 Radar 由独立仓库交付 | 不装入主页镜像或 ZIP |

## 页面与项目

主页 `/projects/` 链接项目页、仓库页和公开简历页。项目页列出八项作品，每项写明功能、输入输出、技术与演示状态。雷达网页回放 Oxford RobotCar 全部 7,203 帧记录，不运行模型推理；C++ 视频页当前只显示等待配置状态。文档问答 v0.8.0 使用自由问题和获授权的资料，回答默认使用简体中文；默认由服务端接入 OpenRouter 免费模型（`openrouter/free`），无需访问者填写模型密钥；交付包含 18 个编译模块，含鉴权业务模块 `auth-facade`。游客只能看和查公开资料；真实登录用户可被授予指定笔记本的 viewer（查看）、editor（编辑）或 manager（笔记本管理）角色。查看者可阅读和提问，编辑者可导入文档，笔记本管理者可管理本笔记本成员与名称说明，但不能创建、归档笔记本或获得全局管理员身份。全局管理员可创建、归档和恢复私人笔记本；归档保留文档和成员关联，公开内置资料始终只读。全站按北京时间每天共 20 次 Web 问答，零点更新；公开、私人和管理员工作区共享额度。有效且未命中成功缓存的问答开始时计数，失败或超时不退还，缓存命中不消耗；20 次问答不等于 20 次上游模型请求。模型配置与额度规则以 RAG 仓库的 `docs/OPENROUTER_RUNTIME.md` 为正式依据，笔记本权限以 `docs/NOTEBOOK_PERMISSIONS.md` 为准；实际部署与验收以构建发布记录为准。Qt 雷达回放和 Qt 设备工作台是 Windows 桌面程序，仓库保持私有。

RAG v0.8.0 的业务变更归属：成员权限由 `auth-facade` 决策，关系表笔记本目录由 `data-facade` 管理，默认中文由 `agent-facade` 负责。模块归属见 RAG 仓库 `docs/BUSINESS_CHANGE_MAP.md`，完成阶段与真实账号验收见 `docs/NOTEBOOK_ACCESS_VALIDATION.md`。Provider/model 目录、管理员 Web 模型配置和管理员重置额度仍为设计，尚未实现，不属于当前展示能力。

服务器现有 Nginx 将 `/projects/radar/`、`/projects/apps/go/`、`/projects/apps/java/`、`/projects/apps/cpp/` 分别代理到独立 Docker 服务。主页 Docker 镜像只含 `web/`，不会复制 Radar 帧或其他项目的构建产物。Media Workspace 仍由 `/` 提供。

当前域名继续由服务器 Nginx 提供：它要在同一域名下代理在线演示和受控的 `/api/resume` 完整简历入口。GitHub Pages 只能托管静态页面，无法承担这些代理路由。
公开入口页位于 `https://nhh37740-glitch.github.io/`，由独立仓库 `nhh37740-glitch.github.io` 托管，链接到 `http://portfolio.72945645.xyz/`。入口页不复制本仓库内容。

## 构建与部署

Jenkins 在 Linux 服务器运行 `deploy/validate.py`、`deploy/package.py`、简历网关行为测试、两个独立 Docker 镜像构建、主页容器 smoke 和部署后的公共入口检查。使用 Jenkins `DEPLOY=true` 更新现有 `project-index` 容器。发布 ZIP 带 `manifest.json` 和 `SHA256SUMS`。本地只进行源码编辑和静态核查，编译与 Docker 构建在服务器执行。

`resume-gateway/` 从仓库外的只读私有文件读取 PDF 和令牌 SHA-256 摘要，只有持有专属链接的访问者能获取完整文件。它需要同源 HTTPS 反向代理将 `/api/resume` 转发至 `127.0.0.1:18105`。部署细节见 `resume-gateway/README.md`。公开页面没有 PDF、联系信息或专属链接。

`portfolio.72945645.xyz` 的独立 Nginx 虚拟主机配置在 `deploy/portfolio-https.conf`，监听 80 和 8443。80 提供主页和公开项目演示，并拒绝 `/api/resume`；8443 使用 TLS，提供相同页面及受控的完整简历入口。DNS A 记录指向演示服务器且为 DNS-only；Certbot 使用 `deploy/portfolio-acme-bootstrap.conf` 所示 webroot 签发和自动续期证书。云防火墙需允许入站 TCP 80；要从公网打开完整简历，还需允许 TCP 8443。8088 Media Workspace 服务保留。所有项目容器只监听服务器回环端口。

Cloudflare Worker 绑定 `PORTFOLIO_KV` 和密文变量 `RESUME_TOKEN_SHA256`。KV 的 `public:<filename>` 来自 `web/`，私有键 `private:resume-pdf` 存放原始 PDF 字节。仅持有 256 位随机令牌的访问者能从 `/api/resume` 获取 PDF；令牌放在 `resume.html#resume=...` URL 片段中，前端先从地址栏移除片段，再发送 `Authorization` 请求。完整文件响应含 `no-store`、`noindex`、`no-referrer`。公开页面没有 PDF、联系信息或专属链接。

Worker 可独立发布到 `portfolio.72945645.xyz`。更新公共页面时，将同一 `web/` 目录同步至 KV；更新完整简历时仅替换私有 KV 键。不得将 PDF、base64、令牌、摘要或 Cloudflare 凭证写入提交、Jenkins 制品或公开静态文件。
