#!/bin/bash
# KeepThinking v7.3.0 — 一键安装脚本
# 安装方式: bash install.sh (终端交互确认)
#       或: AGREE=yes bash install.sh (非交互模式，需先阅读条款)
# 不建议: curl | bash (管道安装需 AGREE=yes 环境变量)

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'
BOLD='\033[1m'

GR="$GREEN"
YL="$YELLOW"
BL="$BLUE"

START_TIME=$(date +%s)

echo -e "${BOLD}${BLUE}🚀 开始安装，预计耗时 1-3 分钟${NC}"
echo ""
echo -e "${BOLD}${BLUE}╔══════════════════════════════════════════════╗"
echo "║   KeepThinking v7.3.0 — 认知引擎安装脚本    ║"
echo "║   AI Developer Local Cognitive Engine        ║"
echo "║   无损安装 · 自动记忆发现                     ║"
echo -e "╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}${YELLOW}📜 法律声明 / LEGAL NOTICE${NC}"
echo -e "  ${YL}▸${NC} 本工具 100% 数据存储在本地，零数据上传"
echo -e "  ${YL}▸${NC} 开源 MIT 协议 — 自由使用、修改、分发"
echo -e "  ${YL}▸${NC} 仅供学习交流使用，禁止用于任何违法违规用途"
echo -e "  ${YL}▸${NC} 用户应自行备份数据，开发者不对数据丢失承担责任"
echo ""

# ── 法律声明确认 ──
if [ "$AGREE" = "yes" ]; then
  echo -e "${GREEN}✅ 已确认条款（AGREE=yes），继续安装...${NC}"
elif [ -t 0 ]; then
  read -p "是否同意上述条款并继续安装？(yes/no): " AGREE
  if [ "$AGREE" != "yes" ]; then
    echo -e "${RED}已取消安装。${NC}"
    exit 1
  fi
  echo -e "${GREEN}✅ 已确认条款，继续安装...${NC}"
else
  echo -e "${RED}========================================${NC}"
  echo -e "${RED}  ⚠️  请先确认法律声明${NC}"
  echo -e "${RED}========================================${NC}"
  echo ""
  echo -e "  交互安装: ${BOLD}bash install.sh${NC}"
  echo -e "  管道安装: ${BOLD}AGREE=yes curl -sL https://keepthinking.vip/install.sh | bash${NC}"
  echo ""
  exit 1
fi
echo ""

VERSION="7.3.0"
DOWNLOAD_BASE="https://cdn.keepthinking.vip/downloads"
TARBALL="keepthinking-v${VERSION}.tar.gz"
INSTALL_DIR="${KEEPTHINKING_HOME:-$HOME/.keepthinking}"

# ── 确定源目录 ──
if [ -n "${BASH_SOURCE[0]}" ] && [ "${BASH_SOURCE[0]}" != "bash" ]; then
    SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
    SRC_DIR=""
fi

if [ -n "$SRC_DIR" ] && [ "$SRC_DIR" = "$INSTALL_DIR" ]; then
    echo -e "${RED}错误: 不能在目标目录运行安装脚本${NC}"
    exit 1
fi

# ── 模式选择 ──
if [ -f "$SRC_DIR/loader.js" ] && [ -f "$SRC_DIR/engine.js" ]; then
    MODE="local"
    echo -e "${GREEN}本地安装模式 — ${SRC_DIR}${NC}"
else
    MODE="download"
    echo -e "${YELLOW}在线安装模式 — 从 CDN 下载${NC}"
    TMP_DIR=$(mktemp -d /tmp/keepthinking-install-XXXXXX)
    trap "rm -rf $TMP_DIR" EXIT
fi

# ── 进度函数 ──
_elapsed() {
  local now now_sec elapsed
  now_sec=$(date +%s)
  elapsed=$((now_sec - START_TIME))
  echo "${elapsed}s"
}

_progress() {
  local step="$1" total="$2" label="$3"
  local pct=$((step * 100 / total))
  [ $pct -lt 0 ] && pct=0
  [ $pct -gt 100 ] && pct=100
  printf "${BLUE}[%3d%%] [%d/%d]${NC} %s ${GREEN}(已耗时 %s)${NC}\n" $pct $step $total "$label" "$(_elapsed)"
}

TOTAL_STEPS=10
STEP=0

# ── Step 1: 检查系统 ──
STEP=$((STEP+1)); _progress $STEP $TOTAL_STEPS "检查系统环境..."
OS_NAME=$(uname -s 2>/dev/null || echo "Unknown")
case "$OS_NAME" in
  Darwin) echo -e "  系统: ${GREEN}macOS${NC}" ;;
  Linux)  echo -e "  系统: ${GREEN}Linux${NC}" ;;
  *)      echo -e "  系统: ${YELLOW}${OS_NAME}${NC}" ;;
esac

# ── Step 2: Node.js ──
STEP=$((STEP+1)); _progress $STEP $TOTAL_STEPS "检查 Node.js 环境..."
if command -v node &>/dev/null; then
    NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)
    echo -e "  Node.js $(node --version) — ${GREEN}已安装${NC}"
    if [ "$NODE_MAJOR" -lt 18 ]; then
        echo -e "  ${YELLOW}⚠️ 需要 Node.js >= 18，正在自动安装 nvm + Node.js 22...${NC}"
        if [ ! -f "$HOME/.nvm/nvm.sh" ]; then
            curl -s -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
        fi
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
        nvm install 22 2>&1 | tail -1
        nvm use 22
        echo -e "  Node.js $(node --version) — ${GREEN}已安装${NC}"
    fi
else
    echo -e "  ${YELLOW}Node.js 未安装，正在自动安装...${NC}"
    curl -s -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    nvm install 22 2>&1 | tail -1
    nvm use 22
    echo -e "  Node.js $(node --version) — ${GREEN}已安装${NC}"
fi

# ── Step 3: 下载 ──
if [ "$MODE" = "download" ]; then
    STEP=$((STEP+1)); _progress $STEP $TOTAL_STEPS "下载 KeepThinking v${VERSION} 完整包..."
    echo -e "  ${CYAN}地址: ${DOWNLOAD_BASE}/${TARBALL}${NC}"
    if command -v wget &>/dev/null; then
        wget -q --show-progress -O "$TMP_DIR/$TARBALL" "${DOWNLOAD_BASE}/${TARBALL}" 2>&1 || {
            echo -e "  ${YL}wget 失败，尝试 curl...${NC}"
            curl -fSL --progress-bar -o "$TMP_DIR/$TARBALL" "${DOWNLOAD_BASE}/${TARBALL}" || {
                echo -e "  ${RED}下载失败！请检查网络${NC}"; exit 1
            }
        }
    else
        curl -fSL --progress-bar -o "$TMP_DIR/$TARBALL" "${DOWNLOAD_BASE}/${TARBALL}" || {
            echo -e "  ${RED}下载失败！请检查网络${NC}"; exit 1
        }
    fi
    echo -e "  大小: ${GREEN}$(du -h "$TMP_DIR/$TARBALL" | cut -f1)${NC}"
    
    STEP=$((STEP+1)); _progress $STEP $TOTAL_STEPS "解压安装包..."
    mkdir -p "$TMP_DIR/extracted"
    tar xzf "$TMP_DIR/$TARBALL" -C "$TMP_DIR/extracted"
    SRC_DIR=$(ls -d "$TMP_DIR/extracted"/*/ | head -1)
    [ -z "$SRC_DIR" ] && { echo -e "${RED}解压失败${NC}"; exit 1; }
fi

# ── Step 5: 检测已有数据 ──
STEP=$((STEP+1)); _progress $STEP $TOTAL_STEPS "检测已有记忆数据..."
EXISTING_DATA=false
EXISTING_NODE_COUNT=0
if [ -f "$INSTALL_DIR/memory/graph.json" ]; then
    EXISTING_DATA=true
    BACKUP_TS=$(date +%Y%m%d%H%M%S)
    cp "$INSTALL_DIR/memory/graph.json" "/tmp/keepthinking-backup-graph-${BACKUP_TS}.json" 2>/dev/null || true
    EXISTING_NODE_COUNT=$(node -e "try{const g=JSON.parse(require('fs').readFileSync('$INSTALL_DIR/memory/graph.json','utf8'));console.log((g.nodes||[]).length)}catch(_){console.log(0)}" 2>/dev/null || echo 0)
    echo -e "  ${YL}📦 已有 ${EXISTING_NODE_COUNT} 条记忆，将保留${NC}"
else
    echo -e "  ${GREEN}  全新安装${NC}"
fi

# ── Step 6: 目录 ──
STEP=$((STEP+1)); _progress $STEP $TOTAL_STEPS "创建数据目录..."
mkdir -p "$INSTALL_DIR"/{memory,web,mcp,server,bin,cache}
echo -e "  ${GREEN}$INSTALL_DIR${NC}"

# ── Step 7: 复制引擎 ──
STEP=$((STEP+1)); _progress $STEP $TOTAL_STEPS "复制引擎文件..."
for f in engine.jsc engine.js engine-bug.js engine-discover.js loader.js; do
    cp "$SRC_DIR/$f" "$INSTALL_DIR/$f" 2>/dev/null && echo -e "  ${GR}✓ $f${NC}" || echo -e "  ${YL}⊘ $f 跳过${NC}"
done
cp "$SRC_DIR/password.js" "$INSTALL_DIR/" 2>/dev/null && { chmod +x "$INSTALL_DIR/password.js"; echo -e "  ${GR}✓ password.js${NC}"; } || echo -e "  ${YL}⊘ password.js 跳过${NC}"

# Web 控制台
[ -d "$SRC_DIR/web" ] && cp -r "$SRC_DIR/web/"* "$INSTALL_DIR/web/" && echo -e "  ${GR}✓ Web 控制台${NC}"

# MCP
if [ -d "$SRC_DIR/mcp" ]; then
    cp -r "$SRC_DIR/mcp/"* "$INSTALL_DIR/mcp/" 2>/dev/null || true
elif [ -d "$SRC_DIR/plugin/mcp" ]; then
    cp -r "$SRC_DIR/plugin/mcp/"* "$INSTALL_DIR/mcp/" 2>/dev/null || true
fi
chmod +x "$INSTALL_DIR/mcp/server.js" 2>/dev/null || true
echo -e "  ${GR}✓ MCP Server${NC}"

# Bin tools
for tool in kt-git-init keepthinking-update; do
    if [ -f "$SRC_DIR/bin/$tool" ]; then
        cp "$SRC_DIR/bin/$tool" "$INSTALL_DIR/bin/$tool" && chmod +x "$INSTALL_DIR/bin/$tool"
    fi
done
echo -e "  ${GR}✓ bin 工具${NC}"

# ── Step 8: 修复 ──
STEP=$((STEP+1)); _progress $STEP $TOTAL_STEPS "应用兼容性修复..."
[ -f "$INSTALL_DIR/mcp/server.js" ] && sed -i 's|path.join(__dirname, "..", "..", "engine-bug.js")|path.join(__dirname, "..", "engine-bug.js")|' "$INSTALL_DIR/mcp/server.js" 2>/dev/null || true
export PATH="$INSTALL_DIR/bin:$PATH"
echo -e "  ${GR}✓ 兼容性修复完成${NC}"

# ── Step 9: 依赖 (耗时最长) ──
STEP=$((STEP+1)); _progress $STEP $TOTAL_STEPS "安装服务端依赖（npm install，约需30秒）..."
if [ -f "$SRC_DIR/server/package.json" ]; then
    cp "$SRC_DIR/server/package.json" "$INSTALL_DIR/server/"
    cp "$SRC_DIR/server/server.js" "$INSTALL_DIR/server/" 2>/dev/null || true
fi
cd "$INSTALL_DIR/server"
echo -e "  ${YL}⏳ npm install express...${NC}"
npm install express --silent --no-audit --no-fund 2>&1 | tail -1
echo -e "  ${YL}⏳ npm install @xenova/transformers...${NC}"
npm install @xenova/transformers --silent --no-audit --no-fund 2>&1 | tail -3
echo -e "  ${GR}✓ 依赖安装完成${NC}"

# Pre-built node_modules
[ "$MODE" = "download" ] && [ -d "$SRC_DIR/node_modules" ] && cp -r "$SRC_DIR/node_modules" "$INSTALL_DIR/" 2>/dev/null || true

# ── Step 10: systemd + ONNX + 启动 ──
STEP=$((STEP+1)); _progress $STEP $TOTAL_STEPS "创建开机自启服务..."

SYSTEMD_DIR="$HOME/.config/systemd/user"
mkdir -p "$SYSTEMD_DIR"
cat > "$SYSTEMD_DIR/keepthinking.service" << SERVICE
[Unit]
Description=KeepThinking Cognitive Engine v${VERSION}
After=network.target
[Service]
Type=simple
ExecStart=$(which node) $INSTALL_DIR/loader.js
WorkingDirectory=$INSTALL_DIR
Restart=on-failure
RestartSec=10
Environment=KEEPTHINKING_HOME=$INSTALL_DIR
Environment=NODE_ENV=production
[Install]
WantedBy=default.target
SERVICE
systemctl --user daemon-reload 2>/dev/null || true
systemctl --user enable keepthinking.service 2>/dev/null || true
echo -e "  ${GR}✓ systemd 服务已创建${NC}"

# ONNX 模型下载
echo ""
echo -e "${BL}🔽 预下载语义搜索模型 (74MB)...${NC}"
echo -e "  ${YL}从 CDN 下载中...${NC}"
if [ -d "$INSTALL_DIR/cache/Xenova" ]; then
    echo -e "  ${GR}✅ 模型已存在，跳过${NC}"
else
    MODEL_URL="${DOWNLOAD_BASE}/onnx-model-v7.3.0.tar.gz"
    DL_START=$(date +%s)
    if wget --show-progress -O /tmp/onnx-model.tar.gz "$MODEL_URL" 2>&1 || curl -#L "$MODEL_URL" -o /tmp/onnx-model.tar.gz 2>&1; then
        DL_END=$(date +%s); DL_SEC=$((DL_END - DL_START))
        echo -e "  ${GR}✓ 下载完成 (${DL_SEC}s)${NC}"
        mkdir -p "$INSTALL_DIR/cache"
        tar xzf /tmp/onnx-model.tar.gz -C "$INSTALL_DIR/cache/" 2>/dev/null && echo -e "  ${GR}✅ ONNX 语义模型已缓存 (130MB)${NC}" || echo -e "  ${YL}ℹ️ 解压失败，首次搜索时自动下载${NC}"
        rm -f /tmp/onnx-model.tar.gz
    else
        echo -e "  ${YL}ℹ️ 下载失败，首次搜索时自动下载${NC}"
    fi
fi

# 自动发现
echo ""
echo -e "${BL}🔍 正在扫描现有记忆...${NC}"
DISCOVERY_RESULT=$(node -e "
  try{const e=require('$INSTALL_DIR/engine.js');const d=require('$INSTALL_DIR/engine-discover.js');const r=d.runDiscovery(e,'$HOME');console.log(JSON.stringify(r))}catch(x){console.log('{}');}
" 2>/dev/null || echo '{}')

SESSIONS_TOTAL=$(echo "$DISCOVERY_RESULT" | python3 -c "import sys,json;print(json.load(sys.stdin).get('sessionsFound',0))" 2>/dev/null || echo 0)
SESSIONS_IMPORTED=$(echo "$DISCOVERY_RESULT" | python3 -c "import sys,json;print(json.load(sys.stdin).get('sessionsImported',0))" 2>/dev/null || echo 0)
DECISIONS_IMPORTED=$(echo "$DISCOVERY_RESULT" | python3 -c "import sys,json;print(json.load(sys.stdin).get('decisionsImported',0))" 2>/dev/null || echo 0)
GIT_PROJECTS=$(echo "$DISCOVERY_RESULT" | python3 -c "import sys,json;print(json.load(sys.stdin).get('gitProjectsFound',0))" 2>/dev/null || echo 0)

echo -e "  ${GREEN}发现 ${SESSIONS_TOTAL} 个历史会话${NC}"
[ "$SESSIONS_IMPORTED" -gt 0 ] && echo -e "  ${GR}✅ 已导入 ${SESSIONS_IMPORTED} 会话的 ${DECISIONS_IMPORTED} 条决策${NC}"
[ "$GIT_PROJECTS" -gt 0 ] && echo -e "  ${GR}✅ 发现 ${GIT_PROJECTS} 个 Git 项目${NC}"
[ "$SESSIONS_IMPORTED" -eq 0 ] && [ "$GIT_PROJECTS" -eq 0 ] && echo -e "  ${YL}ℹ️ KeepThinking 将从今天开始陪伴你${NC}"

# ── 总结 ──
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════╗"
echo -e "║   KeepThinking v${VERSION} 安装完成！        ║"
echo -e "╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  安装模式: ${BOLD}${MODE}${NC}"
echo -e "  数据目录: ${BOLD}$INSTALL_DIR${NC}"
[ "$EXISTING_DATA" = true ] && echo -e "  ${GR}✅ 已保留 ${EXISTING_NODE_COUNT} 条历史记忆${NC}"
echo -e "  Web 控制台: ${BOLD}http://localhost:3456${NC}"
echo ""
echo -e "  ${BOLD}启动:${NC}  node $INSTALL_DIR/loader.js"
echo -e "  ${BOLD}更新:${NC}  keepthinking-update"
echo -e "  ${BOLD}管理:${NC}  systemctl --user start/stop/status keepthinking"
echo ""

# ── 密码设置 ──
export KEEPTHINKING_HOME="$INSTALL_DIR"
if [ -t 0 ]; then
    echo -e "${BL}🔐 设置 Web 控制台密码${NC}"
    echo -e "  ${BOLD}运行: node $INSTALL_DIR/password.js --set 你的密码${NC}"
    read -s -p "  输入密码（回车跳过）: " USER_PASSWORD
    echo
    if [ -n "$USER_PASSWORD" ]; then
        node "$INSTALL_DIR/password.js" --set "$USER_PASSWORD" 2>/dev/null && echo -e "${GR}✅ 密码已设置${NC}" || echo -e "${YL}⚠️ 设置失败，可稍后手动设置${NC}"
    fi
fi

echo -e "  ${GREEN}🔒 所有数据 100% 存储本地 — 零数据上传${NC}"
echo ""

# ── 自动启动 ──
# 自动配置防火墙放行 3456 端口
echo -e "${BL}🔓 配置防火墙放行 3456 端口...${NC}"
if command -v ufw &>/dev/null; then
  sudo ufw allow 3456/tcp 2>/dev/null && echo -e "  ${GR}✓ ufw 已放行${NC}" || echo -e "  ${YL}⊘ ufw 配置失败（可能需sudo）${NC}"
elif command -v firewall-cmd &>/dev/null; then
  sudo firewall-cmd --add-port=3456/tcp --permanent 2>/dev/null && firewall-cmd --reload 2>/dev/null && echo -e "  ${GR}✓ firewalld 已放行${NC}" || echo -e "  ${YL}⊘ firewalld 配置失败${NC}"
elif command -v iptables &>/dev/null; then
  sudo iptables -I INPUT -p tcp --dport 3456 -j ACCEPT 2>/dev/null && echo -e "  ${GR}✓ iptables 已放行${NC}" || echo -e "  ${YL}⊘ iptables 配置失败（可能需root）${NC}"
fi
# 提示云服务器安全组
echo -e "  ${YL}ℹ️ 如使用阿里云/腾讯云，还需在控制台安全组放行 TCP 3456${NC}"
echo ""

echo -e "${BL}🚀 正在启动 KeepThinking...${NC}"
export KEEPTHINKING_HOME="$INSTALL_DIR"
nohup node "$INSTALL_DIR/loader.js" > "$INSTALL_DIR/keepthinking.log" 2>&1 &
sleep 3
if curl -s http://localhost:3456/api/health > /dev/null 2>&1; then
  echo -e "  ${GR}✅ KeepThinking v${VERSION} 已启动！${NC}"
  SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ip.sb 2>/dev/null || curl -s icanhazip.com 2>/dev/null || echo "")
  if [ -n "$SERVER_IP" ]; then
    echo -e "  ${GR}   Web 控制台: http://${SERVER_IP}:3456${NC}"
  else
    echo -e "  ${GR}   Web 控制台: http://localhost:3456${NC}"
  fi
else
  echo -e "  ${YL}⚠️ 启动中，请稍后访问${NC}"
fi

# ── PATH 提示 ──
echo ""
echo -e "${BOLD}${CYAN}📌 使用提示:${NC}"
echo -e "  将 bin 目录加入 PATH 以使用命令行工具:"
echo -e "  ${BOLD}echo 'export PATH=\"\$PATH:$INSTALL_DIR/bin\"' >> ~/.bashrc${NC}"
echo -e "  ${BOLD}source ~/.bashrc${NC}"
echo ""
TOTAL_ELAPSED=$(( $(date +%s) - START_TIME ))
echo -e "  ${GREEN}🏁 总耗时: ${TOTAL_ELAPSED}s${NC}"
