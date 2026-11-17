#!/bin/bash
# 사용: sudo bash deploy/setup.sh <SHA> <HOST>  — 다시 실행하면 백업 후 재배포. CI(.github/workflows/ci-cd.yml)가 SSM으로 호출한다.
set -euo pipefail
SHA=$1; HOST=$2
export HOME=${HOME:-/root}  # SSM Run Command는 HOME 없이 실행돼 npm이 실패한다
APP=/opt/dolbomeum; DATA=/var/lib/dolbomeum; DB=$DATA/app.db; PY=$APP/.venv/bin/python
if ! command -v caddy >/dev/null; then
  [ -f /swapfile ] || { fallocate -l 2G /swapfile; chmod 600 /swapfile; mkswap /swapfile; swapon /swapfile; echo '/swapfile none swap sw 0 0' >> /etc/fstab; }
  apt-get update -q && apt-get install -yq python3-venv git sqlite3 caddy curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -yq nodejs
  id dolbomeum >/dev/null 2>&1 || useradd --system --home $DATA --shell /usr/sbin/nologin dolbomeum
fi
mkdir -p $DATA/backups && chown -R dolbomeum:dolbomeum $DATA
[ -d $APP/.git ] || git clone -q https://github.com/p-rebel/Dolbom-eum.git $APP
git -C $APP fetch -q origin && git -C $APP checkout -q --detach $SHA
python3 -m venv $APP/.venv && $PY -m pip install -q -r $APP/backend/requirements.txt
(cd $APP/frontend && cp -f .env.example .env && echo "VITE_SITE_URL=https://$HOST" >> .env && npm ci --no-audit --no-fund && npm run build)
cat > /etc/dolbomeum/app.env <<ENV
DOLBOMEUM_DB_PATH=$DB
DOLBOMEUM_APP_ORIGINS=https://$HOST
DOLBOMEUM_COOKIE_SECURE=true
ENV
as_app() { runuser -u dolbomeum -- env PYTHONPATH=$APP/backend PYTHONUTF8=1 DOLBOMEUM_DB_PATH=$DB "$@"; }
[ -f $DB ] && as_app $PY -m app.db backup $DATA/backups/app-$(date +%Y%m%d-%H%M%S)-before-${SHA:0:7}.db
systemctl stop dolbomeum 2>/dev/null || true
as_app $PY -m app.db init
. /etc/dolbomeum/seed.env; as_app env DOLBOMEUM_DEMO_PASSWORD="$DOLBOMEUM_DEMO_PASSWORD" $PY -m app.db seed
as_app $PY -m app.db load-nhis
cat > /etc/systemd/system/dolbomeum.service <<UNIT
[Unit]
Description=Dolbom-eum demo
After=network.target
[Service]
User=dolbomeum
WorkingDirectory=$APP
EnvironmentFile=/etc/dolbomeum/app.env
Environment=PYTHONPATH=$APP/backend PYTHONUTF8=1
ExecStart=$PY -m uvicorn run_local_demo:create_app --factory --app-dir $APP/scripts --host 127.0.0.1 --port 8000 --workers 1
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
printf '%s {\n\tencode gzip\n\treverse_proxy 127.0.0.1:8000\n}\n' "$HOST" > /etc/caddy/Caddyfile
systemctl daemon-reload && systemctl enable -q --now dolbomeum && systemctl restart dolbomeum caddy
echo "$(date -Is) $SHA" >> $DATA/deploy.log
echo "배포 완료: https://$HOST  SHA=$SHA"
