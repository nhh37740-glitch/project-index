# Project Index

个人项目展示主页。静态页面在 `/projects/` 提供访问；现有 Media Workspace 保留在 `/`。Radar Pose Demo 作为只读静态素材挂载到容器的 `/radar/`，项目中的源码仓库维持私有，主页明确标注访问限制。

## 本地查看

```bash
python -m http.server 8000
```

打开 `http://127.0.0.1:8000/`。本地未挂载 Radar 素材时，`/radar/` 链接需要单独提供资源。

## 容器

```bash
docker build -t project-index:local .
docker run --rm --read-only --tmpfs /tmp:size=16m --cap-drop ALL --security-opt no-new-privileges \
  --memory 64m --cpus 0.25 -p 127.0.0.1:8092:8080 project-index:local
```

容器只监听宿主机回环地址，由现有 Nginx 的 `/projects/` 路由转发。Radar 素材由部署脚本以只读卷挂载，不进入 Git 或镜像。Jenkins 流水线在同一台服务器上串行执行，先检查页面，再构建容器镜像，部署后检查 HTTP 状态。

`python3 deploy/package.py` 额外产出版本化静态 ZIP，其中包含 `manifest.json` 与 `SHA256SUMS`；Jenkins 会归档并指纹化该交付物。源码与二进制素材分开：Radar 的图片由其自身流水线打包，再以只读卷提供给主页容器。

## 项目入口

| 项目 | 入口 | 说明 |
|---|---|---|
| Radar Pose Demo | `/projects/radar/` | 只读静态演示 |
| Media Workspace | `/` | 现有在线应用 |
| CC Agent Go、CC Agent Java、Edge Agent、Dev Knowledge Agent | 私有 GitHub 仓库 | 需要仓库访问权限；暂不公开会执行命令或处理用户文件的服务 |

## 部署

在服务器上配置 Docker 与 Jenkins 后，运行 `bash deploy/install-nginx-route.sh` 和 `bash deploy/install-jenkins-job.sh` 各一次。Jenkins job 指向本仓库服务器副本，以 `DEPLOY=true` 参数构建并发布。部署命令只替换 `project-index` 容器；不会修改 Media Workspace 的服务或发布目录。
