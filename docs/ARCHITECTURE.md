# Architecture

`xodus-desktop` is a thin, launcher-independent shortcut generator. It deliberately
does **not** manage downloads, auth, wine installs or prefixes — `xodus-cli` owns all
of that. We only turn "a decrypted title on disk" into "a thing you can click".

## Modules (`src/core/`)

| Module | Responsibility |
|---|---|
| `config.ts` | Load/write `config.json`; resolve all paths through `XODUS_DESKTOP_HOME` → XDG → `$HOME` |
| `xodus-detector.ts` | Scan `gameRoots` for directories containing `MicrosoftGame.config`; extract TitleId / DisplayName / icon; delegate exe choice to the resolver |
| `executable-resolver.ts` | Pick the real game binary over `*Launcher.exe` / `*CrashHandler.exe` stubs |
| `desktop-entry.ts` | Write `~/.local/share/applications/xodus-<id>.desktop`; keep a `games.json` record so `play` and `remove` work by id |
| `steam-shortcuts.ts` | Dependency-free binary `shortcuts.vdf` reader/writer; upsert/remove by AppName across every Steam user; back up as `shortcuts.vdf.xodus-bak` |
| `launcher.ts` | Build and run `[gamemoderun] <xodus-cli> run <dir> <wine> --exe <exe>` with the GDK env, `WINEPREFIX` and PRIME offload |
| `proton-gdk-manager.ts` | Locate `xgameruntime.dll` / XAudio2 / GStreamer; provide the canonical GDK env block |
| `audio-codec-fixer.ts` | Per-title dialogue-audio / subtitle repairs |

## Control flow

```
sync:   detector.scan(gameRoots)
          → for each title: desktop-entry.sync()  [+ steam-shortcuts.upsert()]
          → update-desktop-database

play <id>:  games.json[id]  (or a fresh scan fallback)
          → launcher.plan()  → launcher.run()   (exec, stdio inherited, exit code propagated)
```

## Why not a launcher plugin

Neither Heroic nor Lutris load out-of-tree store plugins in 2026 — each store is a
compiled-in class, so any integration is a permanent fork with manual rebases on every
release. Generating freedesktop `.desktop` files + Steam shortcuts instead means the
titles show up in GNOME/KDE menus, Cartridges, and Steam/Big Picture with zero launcher
code to maintain. A real GUI, if wanted later, belongs upstream in the xodus repo as
`xodus-ui`, not in a downstream launcher fork.
