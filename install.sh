#!/bin/bash
# KeepThinking v7.2.0 — One-Click Install Script
# AI Developer Local Cognitive Engine
# v7.2.0: 无损安装 + 自动记忆发现引擎
# Usage: curl -fsSL https://keepthinking.vip/install.sh | bash
#    or: wget -qO- https://keepthinking.vip/install.sh | bash
#    or: bash install.sh (from extracted tarball)

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
BOLD='\033[1m'

GR="$GREEN"  # shorthand aliases used in discovery section
YL="$YELLOW"
BL="$BLUE"

echo -e "${BOLD}${BLUE}"
echo "╔══════════════════════════════════════════════╗"
echo "║   KeepThinking v7.2.0 — 认知引擎安装脚本    ║"
echo "║   AI Developer Local Cognitive Engine        ║"
echo "║   无损安装 · 自动记忆发现                     ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo -e "${BOLD}${YELLOW}📜 法律声明 / LEGAL NOTICE${NC}"
echo -e "  ${YL}▸${NC} 本工具 100% 数据存储在本地，零数据上传"
echo -e "  ${YL}▸${NC} 开源 MIT 协议 — 自由使用、修改、分发"
echo -e "  ${YL}▸${NC} 仅供学习交流使用，禁止用于任何违法违规用途"
echo -e "  ${YL}▸${NC} 用户应自行备份数据，开发者不对数据丢失承担责任"
echo ""
echo -e "  ${BOLD}继续安装即表示您同意以上条款。${NC}"

VERSION="7.2.0"
DOWNLOAD_BASE="https://keepthinking.vip/downloads"
TARBALL="keepthinking-v${VERSION}.tar.gz"
INSTALL_DIR="${KEEPTHINKING_HOME:-$HOME/.keepthinking}"

# ── 确定源目录（兼容 curl|bash 和 bash install.sh 两种方式）──
if [ -n "${BASH_SOURCE[0]}" ] && [ "${BASH_SOURCE[0]}" != "bash" ]; then
    # 本地文件执行：bash install.sh
    SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
    # 管道执行：curl | bash
    SRC_DIR=""
fi

# ── 路径自检：禁止在目标目录运行 ──
if [ -n "$SRC_DIR" ] && [ "$SRC_DIR" = "$INSTALL_DIR" ]; then
    echo -e "${RED}错误: 不能在目标目录运行安装脚本${NC}"
    echo -e "请从其他目录运行："
    echo -e "  cd /path/to/keepthinking-v${VERSION} && bash install.sh"
    exit 1
fi

# ─── 模式选择：本地文件 vs 在线下载 ──────────────────────────
if [ -f "$SRC_DIR/loader.js" ] && [ -f "$SRC_DIR/engine.js" ]; then
    # 本地模式：文件在同目录下
    MODE="local"
    echo -e "${GREEN}本地安装模式 — 从 $SRC_DIR 复制文件${NC}"
else
    # 在线模式：下载完整包
    MODE="download"
    echo -e "${YELLOW}在线安装模式 — 将下载 KeepThinking v${VERSION} 完整包${NC}"
    TMP_DIR=$(mktemp -d /tmp/keepthinking-install-XXXXXX)
    trap "rm -rf $TMP_DIR" EXIT
fi

# ─── Step 1: Check Node.js ───────────────────────────────────
echo -e "${BLUE}[1/8]${NC} 检查系统环境..."
OS_NAME=$(uname -s 2>/dev/null || echo "Unknown")
if [ "$OS_NAME" = "Darwin" ]; then
    echo -e "  系统: ${GREEN}macOS${NC}"
elif [ "$OS_NAME" = "Linux" ]; then
    echo -e "  系统: ${GREEN}Linux${NC}"
else
    echo -e "  系统: ${YELLOW}${OS_NAME}${NC}（未经验证，可能不完全兼容）"
fi
echo -e "${BLUE}[2/8]${NC} 检查 Node.js 环境..."

# 更新后续步骤编号 (所有 [N/8] → [N+1/9]，共 9 步)
# 但为了简单起见，保持 8 步，把系统检测合并到第 1 步

if command -v node &>/dev/null; then
    NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
    echo -e "  Node.js $(node --version) — ${GREEN}已安装${NC}"
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo -e "  ${RED}需要 Node.js >= 18，当前版本过低${NC}"
        echo -e "  ${YELLOW}尝试安装 nvm 和 Node.js 22...${NC}"
        
        if [ ! -f "$HOME/.nvm/nvm.sh" ]; then
            curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
        fi
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        nvm install 22
        nvm use 22
        echo -e "  Node.js $(node --version) — ${GREEN}已安装${NC}"
    fi
else
    echo -e "  ${YELLOW}Node.js 未安装，正在安装 nvm + Node.js 22...${NC}"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install 22
    nvm use 22
    echo -e "  Node.js $(node --version) — ${GREEN}已安装${NC}"
fi

# ─── Step 2: Download tarball (online mode only) ──────────────
if [ "$MODE" = "download" ]; then
    echo -e "${BLUE}[2/8]${NC} 下载 KeepThinking v${VERSION} 完整包..."
    echo -e "  下载地址: ${DOWNLOAD_BASE}/${TARBALL}"
    
    if command -v wget &>/dev/null; then
        wget -q --show-progress -O "$TMP_DIR/$TARBALL" "${DOWNLOAD_BASE}/${TARBALL}" 2>&1 || {
            echo -e "  ${RED}wget 下载失败，尝试 curl...${NC}"
            curl -fSL --progress-bar -o "$TMP_DIR/$TARBALL" "${DOWNLOAD_BASE}/${TARBALL}" || {
                echo -e "  ${RED}下载失败！请检查网络连接${NC}"
                exit 1
            }
        }
    else
        curl -fSL --progress-bar -o "$TMP_DIR/$TARBALL" "${DOWNLOAD_BASE}/${TARBALL}" || {
            echo -e "  ${RED}下载失败！请检查网络连接${NC}"
            exit 1
        }
    fi
    
    TAR_SIZE=$(du -h "$TMP_DIR/$TARBALL" | cut -f1)
    echo -e "  下载完成: ${GREEN}${TAR_SIZE}${NC}"
    
    echo -e "${BLUE}[3/8]${NC} 解压安装包..."
    mkdir -p "$TMP_DIR/extracted"
    tar xzf "$TMP_DIR/$TARBALL" -C "$TMP_DIR/extracted"
    # Auto-detect extracted directory name
    SRC_DIR=$(ls -d "$TMP_DIR/extracted"/*/ | head -1)
    [ -z "$SRC_DIR" ] && { echo -e "${RED}解压失败：未找到安装目录${NC}"; exit 1; }
fi

# ─── 新 Step: 检测已有数据 (无损安装) ─────────────────────────
STEP_NUM=$([ "$MODE" = "download" ] && echo "4" || echo "2")
echo -e "${BLUE}[${STEP_NUM}/8]${NC} 检测已有记忆数据..."

EXISTING_DATA=false
EXISTING_NODE_COUNT=0

if [ -f "$INSTALL_DIR/memory/graph.json" ]; then
    EXISTING_DATA=true
    # 备份已有数据
    BACKUP_TS=$(date +%Y%m%d%H%M%S)
    cp "$INSTALL_DIR/memory/graph.json" "/tmp/keepthinking-backup-graph-${BACKUP_TS}.json" 2>/dev/null || true
    cp "$INSTALL_DIR/memory/embed_cache.json" "/tmp/keepthinking-backup-embed-${BACKUP_TS}.json" 2>/dev/null || true
    
    # 统计已有记忆数量
    EXISTING_NODE_COUNT=$(node -e "
      try {
        const g = JSON.parse(require('fs').readFileSync('$INSTALL_DIR/memory/graph.json','utf8'));
        console.log((g.nodes||[]).length);
      } catch(_) { console.log(0); }
    " 2>/dev/null || echo 0)
    
    echo -e "  ${YL}📦 检测到已有记忆数据（${EXISTING_NODE_COUNT} 条记忆），将保留并升级引擎${NC}"
    echo -e "  ${GREEN}  备份已保存至 /tmp/keepthinking-backup-graph-${BACKUP_TS}.json${NC}"
else
    echo -e "  ${GREEN}  全新安装 — 无已有记忆数据${NC}"
fi

# ─── Step: Create directories ──────────────────────────────
STEP_NUM=$([ "$MODE" = "download" ] && echo "5" || echo "3")
echo -e "${BLUE}[${STEP_NUM}/8]${NC} 创建数据目录..."
mkdir -p "$INSTALL_DIR/memory"
mkdir -p "$INSTALL_DIR/web"
mkdir -p "$INSTALL_DIR/mcp"
mkdir -p "$INSTALL_DIR/server"
mkdir -p "$INSTALL_DIR/bin"
echo -e "  数据目录: ${GREEN}$INSTALL_DIR${NC}"

# ─── Step: Copy engine files (尊重已有数据) ──────────────────
STEP_NUM=$([ "$MODE" = "download" ] && echo "6" || echo "4")
echo -e "${BLUE}[${STEP_NUM}/8]${NC} 复制引擎文件..."

if [ "$EXISTING_DATA" = true ]; then
    # 无损模式：只更新代码文件，不动 memory/
    cp "$SRC_DIR/engine.jsc" "$INSTALL_DIR/engine.jsc" 2>/dev/null || echo -e "  ${YELLOW}engine.jsc 未找到，跳过${NC}"
    cp "$SRC_DIR/engine.js" "$INSTALL_DIR/engine.js" 2>/dev/null || echo -e "  ${YELLOW}engine.js 未找到，跳过${NC}"
    cp "$SRC_DIR/engine-bug.js" "$INSTALL_DIR/engine-bug.js" 2>/dev/null || echo -e "  ${YELLOW}engine-bug.js 未找到，跳过${NC}"
    cp "$SRC_DIR/engine-discover.js" "$INSTALL_DIR/engine-discover.js" 2>/dev/null || echo -e "  ${YELLOW}engine-discover.js 未找到，跳过${NC}"
    cp "$SRC_DIR/loader.js" "$INSTALL_DIR/loader.js" 2>/dev/null || {
        echo -e "  ${RED}loader.js 未找到，安装中止！${NC}"
        exit 1
    }
    echo -e "  ${GREEN}引擎文件已更新（保留 memory/ 不变）${NC}"
else
    # 全新安装：全部复制
    cp "$SRC_DIR/engine.jsc" "$INSTALL_DIR/engine.jsc" 2>/dev/null || echo -e "  ${YELLOW}engine.jsc 未找到，跳过${NC}"
    cp "$SRC_DIR/engine.js" "$INSTALL_DIR/engine.js" 2>/dev/null || echo -e "  ${YELLOW}engine.js 未找到，跳过${NC}"
    cp "$SRC_DIR/engine-bug.js" "$INSTALL_DIR/engine-bug.js" 2>/dev/null || echo -e "  ${YELLOW}engine-bug.js 未找到，跳过${NC}"
    cp "$SRC_DIR/engine-discover.js" "$INSTALL_DIR/engine-discover.js" 2>/dev/null || echo -e "  ${YELLOW}engine-discover.js 未找到，跳过${NC}"
    cp "$SRC_DIR/loader.js" "$INSTALL_DIR/loader.js" 2>/dev/null || {
        echo -e "  ${RED}loader.js 未找到，安装中止！${NC}"
        exit 1
    }
    echo -e "  ${GREEN}引擎文件已复制${NC}"
    # Copy password tool
    cp "$SRC_DIR/password.js" "$INSTALL_DIR/password.js" 2>/dev/null && chmod +x "$INSTALL_DIR/password.js" && echo -e "  ${GREEN}password.js 已安装${NC}" || echo -e "  ${YELLOW}password.js 未找到，跳过${NC}"
fi

# ─── Copy web console ─────────────────────────────────
STEP_NUM=$([ "$MODE" = "download" ] && echo "5w" || echo "4w")
echo -e "${BLUE}[${STEP_NUM}/8]${NC} 复制 Web 控制台..."
if [ -d "$SRC_DIR/web" ]; then
    cp -r "$SRC_DIR/web/"* "$INSTALL_DIR/web/"
    echo -e "  ${GREEN}Web 控制台已复制${NC}"
else
    echo -e "  ${YELLOW}web/ 目录未找到，跳过${NC}"
fi

# ─── Copy MCP server ──────────────────────────────────
echo -e "${BLUE}[mcp/8]${NC} 复制 MCP Server..."
if [ -d "$SRC_DIR/mcp" ]; then
    cp -r "$SRC_DIR/mcp/"* "$INSTALL_DIR/mcp/" 2>/dev/null || true
    echo -e "  ${GREEN}MCP Server 已复制${NC}"
elif [ -d "$SRC_DIR/plugin/mcp" ]; then
    cp -r "$SRC_DIR/plugin/mcp/"* "$INSTALL_DIR/mcp/" 2>/dev/null || true
    echo -e "  ${GREEN}MCP Server 已复制（plugin/mcp）${NC}"
fi
chmod +x "$INSTALL_DIR/mcp/server.js" 2>/dev/null || true

# ─── Install bin tools ─────────────────────────────────
echo -e "${BLUE}[bin/8]${NC} 安装 bin 工具..."
if [ -f "$SRC_DIR/bin/kt-git-init" ]; then
    cp "$SRC_DIR/bin/kt-git-init" "$INSTALL_DIR/bin/kt-git-init"
    chmod +x "$INSTALL_DIR/bin/kt-git-init"
    echo -e "  ${GREEN}kt-git-init 已安装${NC}"
fi
if [ -f "$SRC_DIR/bin/keepthinking-update" ]; then
    cp "$SRC_DIR/bin/keepthinking-update" "$INSTALL_DIR/bin/keepthinking-update"
    chmod +x "$INSTALL_DIR/bin/keepthinking-update"
    echo -e "  ${GREEN}keepthinking-update 已安装${NC}"
fi

# ─── Post-install fixes ─────────────────────────────────
echo ""
echo -e "${BLUE}[fix/8]${NC} 应用兼容性修复..."
# Fix MCP bug engine path
if [ -f "$INSTALL_DIR/mcp/server.js" ]; then
    sed -i 's|path.join(__dirname, "..", "..", "engine-bug.js")|path.join(__dirname, "..", "engine-bug.js")|' "$INSTALL_DIR/mcp/server.js" 2>/dev/null || true
    echo -e "  ${GREEN}MCP bug engine 路径已修复${NC}"
fi
# Create password handler
if [ ! -f "$INSTALL_DIR/server/auth-middleware.js" ]; then
    echo -e "  ${YELLOW}请手动创建 auth-middleware.js${NC}"
fi
# Ensure bin is in PATH
export PATH="$INSTALL_DIR/bin:$PATH"
echo -e "  ${GREEN}bin 已加入 PATH${NC}"
echo ""

# ─── Step: Install server dependencies ─────────────────────
STEP_NUM=$([ "$MODE" = "download" ] && echo "7" || echo "7")
echo -e "${BLUE}[${STEP_NUM}/8]${NC} 安装服务端依赖..."
if [ -f "$SRC_DIR/server/package.json" ]; then
    cp "$SRC_DIR/server/package.json" "$INSTALL_DIR/server/"
    cp "$SRC_DIR/server/server.js" "$INSTALL_DIR/server/" 2>/dev/null || true
    cd "$INSTALL_DIR/server"
    npm install express 2>&1 | tail -3
    npm install @xenova/transformers 2>&1 | tail -3
    echo -e "  ${GREEN}依赖已安装（含 ONNX 嵌入引擎）${NC}"
elif [ -f "$INSTALL_DIR/server/package.json" ]; then
    cd "$INSTALL_DIR/server"
    npm install express 2>&1 | tail -3
    npm install @xenova/transformers 2>&1 | tail -3
    echo -e "  ${GREEN}依赖已安装（含 ONNX 嵌入引擎）${NC}"
else
    echo -e "  ${YELLOW}server/package.json 未找到，跳过${NC}"
fi

# ─── Copy node_modules for pre-bundled tarball ───────────────
if [ "$MODE" = "download" ] && [ -d "$SRC_DIR/node_modules" ]; then
    echo -e "  ${GREEN}复制预构建依赖...${NC}"
    cp -r "$SRC_DIR/node_modules" "$INSTALL_DIR/node_modules" 2>/dev/null || true
fi

# ─── Step: Create systemd service (auto-start) ──────────
STEP_NUM=$([ "$MODE" = "download" ] && echo "8" || echo "8")
echo -e "${BLUE}[${STEP_NUM}/8]${NC} 创建开机自启服务..."

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

# Reload and enable
systemctl --user daemon-reload 2>/dev/null || true
systemctl --user enable keepthinking.service 2>/dev/null || true

echo -e "  ${GREEN}systemd 服务已创建${NC}"

# ─── 自动发现现有记忆 ──────────────────────────────────────
echo ""
echo -e "${BL}🔍 正在扫描现有记忆...${NC}"

DISCOVERY_RESULT=$(node -e "
  try {
    const engine = require('$INSTALL_DIR/engine.js');
    const { runDiscovery } = require('$INSTALL_DIR/engine-discover.js');
    const report = runDiscovery(engine, '$HOME');
    console.log(JSON.stringify(report));
  } catch(e) {
    console.log(JSON.stringify({error: e.message, sessionsFound:0, sessionsImported:0, decisionsImported:0, gitProjectsFound:0}));
  }
" 2>/dev/null)

if [ $? -eq 0 ]; then
  SESSIONS_IMPORTED=$(echo "$DISCOVERY_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sessionsImported',0))" 2>/dev/null || echo 0)
  DECISIONS_IMPORTED=$(echo "$DISCOVERY_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('decisionsImported',0))" 2>/dev/null || echo 0)
  GIT_PROJECTS=$(echo "$DISCOVERY_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('gitProjectsFound',0))" 2>/dev/null || echo 0)
  SESSIONS_TOTAL=$(echo "$DISCOVERY_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sessionsFound',0))" 2>/dev/null || echo 0)
  
  echo -e "  ${GREEN}发现 ${SESSIONS_TOTAL} 个历史会话${NC}"
  [ "$SESSIONS_IMPORTED" -gt 0 ] && echo -e "  ${GR}✅ 已导入 $SESSIONS_IMPORTED 个会话的 $DECISIONS_IMPORTED 条关键决策${NC}"
  [ "$GIT_PROJECTS" -gt 0 ] && echo -e "  ${GR}✅ 发现 $GIT_PROJECTS 个 Git 项目，运行 kt-git-init 可启用自动记录${NC}"
  [ "$SESSIONS_IMPORTED" -eq 0 ] && [ "$GIT_PROJECTS" -eq 0 ] && echo -e "  ${YL}ℹ️ 未发现已有记忆数据，KeepThinking 将从今天开始陪伴你${NC}"
else
  echo -e "  ${YL}ℹ️ 记忆发现跳过（无 session 数据或引擎未加载）${NC}"
fi

# ─── Summary ──────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║   KeepThinking v${VERSION} 安装完成！        ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  安装模式:  ${BOLD}${MODE}${NC}"
echo -e "  数据目录:  ${BOLD}$INSTALL_DIR${NC}"
if [ "$EXISTING_DATA" = true ]; then
  echo -e "  ${GR}✅ 已保留 ${EXISTING_NODE_COUNT} 条历史记忆${NC}"
fi
echo -e "  Web 控制台: ${BOLD}http://localhost:3456${NC}"
echo -e "  MCP Server: ${BOLD}$INSTALL_DIR/mcp/server.js${NC}"
echo ""
echo -e "  ${YELLOW}启动命令:${NC}"
echo -e "    ${BOLD}node $INSTALL_DIR/loader.js${NC}"
echo ""
echo -e "  ${YELLOW}升级命令:${NC}"
echo -e "    ${BOLD}keepthinking-update${NC}   # 一键升级，安全保留数据"
echo ""
echo -e "  ${YELLOW}systemd 管理:${NC}"
echo -e "    ${BOLD}systemctl --user start keepthinking${NC}    # 启动"
echo -e "    ${BOLD}systemctl --user stop keepthinking${NC}     # 停止"
echo -e "    ${BOLD}systemctl --user status keepthinking${NC}   # 状态"
echo -e "    ${BOLD}journalctl --user -u keepthinking -f${NC}   # 日志"
echo ""
echo -e "  ${YELLOW}测试 API:${NC}"
echo -e "    ${BOLD}curl http://localhost:3456/api/health${NC}"
echo -e "    ${BOLD}curl http://localhost:3456/api/stats${NC}"
echo ""
echo ""
echo -e "${BL}🔐 设置 Web 控制台密码${NC}"
echo -e "  运行: node $INSTALL_DIR/password.js --set 你的密码"
echo -e "  如果无需密码，按回车跳过"
if [ -t 0 ]; then
  read -p "  输入密码（回车跳过）: " USER_PASSWORD
else
  echo -e "  ${YL}非交互模式，跳过密码设置${NC}"
  USER_PASSWORD=""
fi
if [ -n "$USER_PASSWORD" ]; then
  node "$INSTALL_DIR/password.js" --set "$USER_PASSWORD" 2>/dev/null && echo -e "${GR}✅ 密码已设置${NC}" || echo -e "${YL}⚠️ 密码设置失败，可稍后手动设置${NC}"
fi

echo -e "  ${GREEN}🔒 所有数据 100% 存储本地 — 零数据上传${NC}"
echo ""
