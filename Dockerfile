# ChungusHub — 容器化部署
# 多阶段：构建层装依赖 + 产 build/，运行层只带运行所需。
# 数据卷：/app/user-data（SQLite + presets 文件 + 图片全在这）。
FROM oven/bun:1.3.9 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.3.9 AS runtime
WORKDIR /app
# 运行层整体携带（server 依赖网深及 src/ 与 static/， granular 拷贝会持续漏件；
# 自托管单机镜像，体积不是首要约束）
COPY --from=build /app ./
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# 容器内 loopback-only 毫无意义：入口在 security.json 缺失时种网络访问开、白名单关。
# 已存在的 security.json 一律不碰（用户在 UI 里的加固保留）。
ENV CHUNGUS_DOCKER=1
EXPOSE 4242
VOLUME ["/app/user-data"]
ENTRYPOINT ["./docker-entrypoint.sh"]
