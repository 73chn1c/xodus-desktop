#!/usr/bin/env bash
# Installs the `xodus-desktop` command into ~/.local/bin (no root, no launcher fork).
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DEST="$HOME/.local/bin"

echo "=== xodus-desktop installer ==="
echo "project: $PROJECT_DIR"

cd "$PROJECT_DIR"

echo "-> installing dependencies"
npm install --silent --no-audit --no-fund

echo "-> building"
npm run build --silent

mkdir -p "$BIN_DEST"
chmod +x "$PROJECT_DIR/bin/xodus-desktop.js"
ln -sf "$PROJECT_DIR/bin/xodus-desktop.js" "$BIN_DEST/xodus-desktop"

echo "-> writing config template"
node "$BIN_DEST/xodus-desktop" config >/dev/null || true

# Clean up any leftovers from the old Heroic-bridge era.
rm -f "$BIN_DEST/xodus-heroic" \
      "$HOME/.local/share/applications/xodus-heroic.desktop" \
      "$HOME/.local/share/applications/heroic-xodus.desktop"

cat <<EOF

Installed: $BIN_DEST/xodus-desktop
Make sure $BIN_DEST is on your PATH.

Next:
  xodus-desktop config          # review ~/.config/xodus-desktop/config.json
  xodus-desktop doctor          # check xodus-cli + GDK wine are found
  xodus-desktop sync            # create .desktop entries for downloaded titles
  xodus-desktop sync --steam    # ...and add them to Steam
EOF
