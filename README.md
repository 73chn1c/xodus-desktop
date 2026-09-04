# xodus-desktop

Turn already-downloaded **Xbox Game Pass** titles (via [xodus](https://github.com/xodus-gaming/xodus) + a GDK‑patched wine) into normal Linux **`.desktop` entries** and **Steam shortcuts** — without forking a launcher.

This replaces the old `xodus-for-heroic` bridge. Nothing here depends on Heroic (or Lutris, or any launcher): the only moving parts are the `xodus-cli` binary and a wine build with the GDK reimplementation.

## How it works

```
xodus-cli streaming <storeId> ~/Games/GamePass/<Name>     # you download a title
xodus-desktop sync                                        # we scan, resolve the real exe,
                                                          # and write ~/.local/share/applications/xodus-<id>.desktop
xodus-desktop sync --steam                                # ...and inject a Steam shortcut
```

Each generated shortcut runs `xodus-desktop play <id>`, which is the single place that
builds the launch command:

```
[gamemoderun] <xodus-cli> run <gameDir> <gdkWine> --exe <exe>
```

with the GDK env (`WINEDLLOVERRIDES`, `VKD3D_CONFIG`, XAudio2…), `WINEPREFIX`, and
optional PRIME render‑offload applied. Change any of that in one JSON file instead of
per‑shortcut.

## Install

```bash
git clone https://github.com/73chn1c/xodus-desktop.git
cd xodus-desktop
./scripts/install.sh          # builds + symlinks ~/.local/bin/xodus-desktop
xodus-desktop config          # edit ~/.config/xodus-desktop/config.json
xodus-desktop doctor          # verify xodus-cli + GDK wine + codecs are found
```

## Commands

| Command | Purpose |
|---|---|
| `xodus-desktop sync [--steam]` | Generate `.desktop` entries (and Steam shortcuts) for every downloaded title |
| `xodus-desktop play <id>` | Launch a title — this is what the shortcuts call |
| `xodus-desktop list` | List synced titles and their ids |
| `xodus-desktop remove <id> [--steam]` | Remove a title's shortcuts (game files are left alone) |
| `xodus-desktop doctor` | Check `xodus-cli` / GDK wine / codecs / titles on disk |
| `xodus-desktop fix-audio <dir>` | Repair dialogue audio + subtitles for one title |
| `xodus-desktop config` | Write / show `~/.config/xodus-desktop/config.json` |

## Config (`~/.config/xodus-desktop/config.json`)

| Key | Meaning |
|---|---|
| `xodusCliPath` | Path to the `xodus-cli` binary |
| `wineBinPath` | GDK‑patched wine binary passed to `xodus-cli run` |
| `winePrefix` | `WINEPREFIX` for GDK titles (the one holding `xgameruntime.dll`) |
| `gameRoots` | Directories scanned for downloaded titles (only dirs with `MicrosoftGame.config` count) |
| `primeOffload` | Force the dedicated GPU (Optimus laptops) |
| `useGameMode` | Wrap the launch in `gamemoderun` when available |
| `extraEnv` | Extra env vars, merged last |

`XODUS_DESKTOP_HOME`, `XDG_CONFIG_HOME` and `XDG_DATA_HOME` are all respected.

## License

GPL-3.0
