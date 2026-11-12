#!/bin/sh
set -eu
cd "$(dirname "$0")"
node -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major!==22||minor<16){console.error("需要Node.js 22.16或更高的22.x版本");process.exit(1)}'
if [ ! -d node_modules ]; then
  echo '项目依赖尚未安装。请在本目录运行 npm ci --ignore-scripts。'
  exit 1
fi
npm run build
node_modules/.bin/tsx scripts/ensure-admin.ts
exec node_modules/.bin/tsx server/index.ts
