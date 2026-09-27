#!/bin/sh
# 首启种子：user-data/security.json 不存在时，按容器语义写入
# （网络访问开、IP 白名单关：家庭内网信任模型，密码可在 UI 里再开）。
# 任何已存在的配置文件原样保留。
set -e

SEC="/app/user-data/security.json"
if [ ! -f "$SEC" ]; then
	mkdir -p /app/user-data
	cat > "$SEC" <<'EOF'
{
  "networkAccessEnabled": true,
  "ipAllowlistEnabled": false,
  "passwordEnabled": false,
  "passwordHash": null,
  "sessionIdleMinutes": 60,
  "sessions": {}
}
EOF
	echo "[docker-entrypoint] seeded security.json (network access on)"
fi

exec bun server/index.ts
