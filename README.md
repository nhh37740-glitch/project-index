# Project Index

个人项目展示主页。静态页面在 `/projects/` 提供访问；现有 Media Workspace 保留在 `/`。Radar Pose Demo 当前关闭预览，等待真实数据来源与许可证核查；发布包不包含雷达演示帧、位姿数据或演示脚本。

## 本地查看

```bash
python -m http.server 8000
```

打开 `http://127.0.0.1:8000/`。Radar Pose Demo 卡片只显示核查状态，不提供虚构预览。

## 容器

```bash
docker build -t project-index:local .
docker run --rm --read-only --tmpfs /tmp:size=16m --cap-drop ALL --security-opt no-new-privileges \
  --memory 64m --cpus 0.25 -p 127.0.0.1:8092:8080 project-index:local
```

容器只监听宿主机回环地址，由现有 Nginx 的 `/projects/` 路由转发。主页镜像只包含 Radar 的待核查提示页，不包含任何预览数据。Jenkins 校验项目入口、待核查提示与演示素材缺席，再打包、构建容器镜像，部署后检查 HTTP 状态。

Go 和 Java 演示通过服务器现有 Nginx 入口转发到回环地址的服务端口，不向公网发布容器端口：

| 项目 | 对外入口 | 服务器上游 |
|---|---|---|
| CC Agent Go | `/projects/apps/go/` | `127.0.0.1:18101` |
| CC Agent Java | `/projects/apps/java/agent.html` | `127.0.0.1:18102` |
| Edge Agent | `/projects/apps/cpp/` | `127.0.0.1:18103` |

`deploy/project-apps-route.conf` 将服务挂在同源路径下，并处理 Go 页面的根路径 API/SSE 请求与 C++ 面板的 API/帧 URL。运行 `bash deploy/install-nginx-route.sh` 会安装主页和演示服务路由、执行 `nginx -t`，然后 reload Nginx。Go 与 Java 页面会调用其真实后端；调用模型功能仍需各服务已有的 API key 配置。

C++ 容器默认运行 `--web-idle` 等待配置。状态 API 应返回 `waiting_config` 和空 `events`，页面明确提示尚未配置真实视频与模型，当前没有帧数据，也没有运行推理。这个入口只展示实际状态，不代表模型推理已部署或可用。

`python3 deploy/package.py` 额外产出版本化静态 ZIP，其中包含主页、Radar 演示、`manifest.json` 与 `SHA256SUMS`；Jenkins 会归档并指纹化该交付物。

## 项目入口

| 项目 | 入口 | 说明 |
|---|---|---|
| Radar Pose Demo | `/projects/radar/` | 来源与许可证核查提示；不提供数据预览 |
| Media Workspace | `/` | 现有在线应用 |
| CC Agent Go | `/projects/apps/go/` | 实时 WebAgent 页面；源码链接需 GitHub 权限 |
| CC Agent Java | `/projects/apps/java/agent.html` | 实时 Agent 页面；源码链接需 GitHub 权限 |
| Edge Agent | `/projects/apps/cpp/` | 等待配置的真实状态面板；不运行模型推理 |
| Dev Knowledge Agent | 私有 GitHub 仓库 | 需要仓库访问权限；暂不公开会执行命令或处理用户文件的服务 |

## 部署

在服务器上配置 Docker 与 Jenkins 后，运行 `bash deploy/install-nginx-route.sh` 和 `bash deploy/install-jenkins-job.sh` 各一次。Jenkins job 指向本仓库服务器副本，以 `DEPLOY=true` 参数构建并发布。部署命令只替换 `project-index` 容器；不会修改 Media Workspace 的服务或发布目录。
