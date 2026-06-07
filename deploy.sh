#!/bin/bash
# 手动同步:push 本地 → 服务器 pull
# 用法:
#   ./deploy.sh                # 正常 push + 远程 pull
#   ./deploy.sh --no-push      # 只同步服务器(不 push)
#   ./deploy.sh --no-deploy    # 只 push 不同步
set -e

cd "$(dirname "$0")"

PUSH=true
DEPLOY=true
for arg in "$@"; do
  case $arg in
    --no-push) PUSH=false ;;
    --no-deploy) DEPLOY=false ;;
  esac
done

# 1. 本地提交
if ! git diff --quiet HEAD 2>/dev/null; then
  read -p "有未提交改动,先提交吗? [Y/n] " yn
  yn=${yn:-Y}
  if [ "$yn" = "Y" ] || [ "$yn" = "y" ]; then
    git add -A
    read -p "提交信息: " msg
    [ -z "$msg" ] && msg="update: $(date +%Y-%m-%d)"
    git commit -m "$msg"
  fi
fi

# 2. push
if [ "$PUSH" = true ]; then
  echo "→ push 到 GitHub"
  git push origin main
fi

# 3. 部署到腾讯云
if [ "$DEPLOY" = true ]; then
  echo "→ 部署到 124.222.29.46:/var/www/lurecamp1.xiabebe.cn/"
  REMOTE="ubuntu@124.222.29.46"
  REMOTE_PATH="/var/www/lurecamp1.xiabebe.cn"

  for f in $(git diff --name-only origin/main HEAD 2>/dev/null | grep -E '\.(html|js|css|md)$'); do
    if [ -f "$f" ]; then
      echo "  同步 $f"
      scp -q "$f" "$REMOTE:/tmp/$(basename $f)" 2>/dev/null
      ssh -q $REMOTE "
        echo 'hErewego~071381' | sudo -S cp /tmp/$(basename $f) $REMOTE_PATH/$f
      "
    fi
  done

  echo "✓ 部署完成"
fi

echo "done."
