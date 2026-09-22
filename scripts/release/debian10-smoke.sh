#!/usr/bin/env bash
set -euo pipefail

# Buster 已归档；从 Debian 官方归档安装真实系统依赖，在容器内验证成包。
printf '%s\n' 'deb http://archive.debian.org/debian buster main' > /etc/apt/sources.list
apt-get -o Acquire::Check-Valid-Until=false update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  /artifacts/*.deb xvfb xauth fonts-noto-cjk ca-certificates
Xvfb :99 -screen 0 1280x900x24 -nolisten tcp > /tmp/xvfb.log 2>&1 &
export DISPLAY=:99
export AIBUDDY_SMOKE_EXECUTABLE=/opt/AIbuddy/aibuddy
export AIBUDDY_SMOKE_OUTPUT=/artifacts
cd /workspace
ELECTRON_RUN_AS_NODE=1 /opt/AIbuddy/aibuddy scripts/release/runtime-smoke.cjs linux
