#!/bin/bash
# ===== 账簿 Skill 一键安装脚本 =====
# 用法: bash install.sh
# 支持: Claude Code / Codex / WorkBuddy

set -e

SKILL_NAME="zhang-bu"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   📊 账簿 · AI Skill 安装脚本        ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ─── Claude Code ───
install_claude_code() {
  local dest="$HOME/.claude/skills/$SKILL_NAME"
  mkdir -p "$dest"
  cp "$SCRIPT_DIR/.claude/skills/$SKILL_NAME/SKILL.md" "$dest/SKILL.md"
  echo "✅ Claude Code: 已安装到 $dest"
  echo "   触发词: 帮我部署记账系统 / deploy accounting system"
}

# ─── Codex ───
install_codex() {
  local dest="$SCRIPT_DIR/.codex"
  mkdir -p "$dest"
  cp "$SCRIPT_DIR/SKILL.md" "$dest/instructions.md"
  echo "✅ Codex (OpenAI): 已安装到 $dest/instructions.md"
  echo "   打开项目后 Codex 自动加载"
}

# ─── WorkBuddy ───
install_workbuddy() {
  local dest="$SCRIPT_DIR/.workbuddy"
  mkdir -p "$dest"
  cp "$SCRIPT_DIR/SKILL.md" "$dest/project.md"
  echo "✅ WorkBuddy: 已安装到 $dest/project.md"
}

# ─── 检测并安装 ───
INSTALLED=0

if command -v claude &>/dev/null || [ -d "$HOME/.claude" ]; then
  install_claude_code
  INSTALLED=1
fi

if [ -f "$SCRIPT_DIR/.codex/instructions.md" ] || [ -d "$SCRIPT_DIR/.codex" ]; then
  install_codex
  INSTALLED=1
fi

if [ -d "$SCRIPT_DIR/.workbuddy" ] || command -v workbuddy &>/dev/null; then
  install_workbuddy
  INSTALLED=1
fi

# ─── 如果都没检测到，全部安装 ───
if [ $INSTALLED -eq 0 ]; then
  echo "未检测到特定平台，执行全平台安装..."
  install_claude_code
  install_codex
  install_workbuddy
fi

echo ""
echo "── 安装完成 ──"
echo ""
echo "现在打开任意目录，对 AI 说："
echo "  '帮我部署记账系统'"
echo "  '给XX公司配置一套账簿'"
echo ""
echo "AI 将自动 clone 项目、运行配置向导、启动服务。"
echo ""
