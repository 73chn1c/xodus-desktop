import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Standalone configuration for xodus-desktop.
 *
 * Deliberately Heroic-independent: the only external tools we need are the
 * `xodus-cli` binary (download + `run`) and a GDK-patched wine build. Everything
 * else (shortcut generation, Steam injection, audio fixes) is done here.
 */
export interface XodusDesktopConfig {
  /** Path to the `xodus-cli` executable (from xodus-gaming/xodus). */
  xodusCliPath: string;
  /** Path to the GDK-patched wine binary passed as `xodus-cli run <dir> <wineBin>`. */
  wineBinPath: string;
  /** WINEPREFIX used for GDK titles. */
  winePrefix: string;
  /** Directories scanned for already-downloaded / decrypted titles. */
  gameRoots: string[];
  /** Force the dedicated GPU via PRIME render offload (Optimus laptops). */
  primeOffload: boolean;
  /** Wrap the launch in `gamemoderun` when available. */
  useGameMode: boolean;
  /** Extra environment variables merged last (highest priority). */
  extraEnv: Record<string, string>;
}

/**
 * Home used for all path resolution. `XODUS_DESKTOP_HOME` overrides it (portable
 * installs, tests); otherwise the usual `$HOME`.
 */
export const baseHome = (): string => process.env.XODUS_DESKTOP_HOME || os.homedir();
const xdgConfigHome = (): string => process.env.XDG_CONFIG_HOME || path.join(baseHome(), '.config');
export const xdgDataHome = (): string => process.env.XDG_DATA_HOME || path.join(baseHome(), '.local', 'share');

/** Resolved fresh each call so a changed environment is respected. */
export const configDir = (): string => path.join(xdgConfigHome(), 'xodus-desktop');
export const configPath = (): string => path.join(configDir(), 'config.json');
/** Per-game records written by `sync`, read by `play`. */
export const gamesDbPath = (): string => path.join(configDir(), 'games.json');

function defaults(): XodusDesktopConfig {
  const home = baseHome();
  return {
    xodusCliPath: findFirstExisting([
      path.join(home, 'projects', 'xodus', 'target', 'release', 'xodus-cli'),
      path.join(home, 'projects', 'xodus', 'target', 'debug', 'xodus-cli'),
      path.join(home, '.local', 'bin', 'xodus-cli'),
      '/usr/local/bin/xodus-cli'
    ]) || 'xodus-cli',
    wineBinPath: findFirstExisting([
      path.join(home, '.local', 'share', 'Steam', 'compatibilitytools.d', 'Proton-XODUS-GDK', 'files', 'bin', 'wine'),
      path.join(home, 'projects', 'xodus-proton-build', 'dst-wine-x86_64', 'bin', 'wine')
    ]) || 'wine',
    winePrefix: path.join(home, '.wine'),
    // Only dirs containing a MicrosoftGame.config are picked up, so listing a
    // shared root (e.g. the old Heroic install dir) is harmless.
    gameRoots: [
      path.join(home, 'Games', 'XODUS'),
      path.join(home, 'Games', 'GamePass'),
      path.join(home, 'Games', 'Xbox'),
      path.join(home, 'Games', 'Heroic'),
      path.join(home, 'Games')
    ],
    primeOffload: true,
    useGameMode: true,
    extraEnv: {}
  };
}

function findFirstExisting(candidates: string[]): string | null {
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export class Config {
  public static path(): string {
    return configPath();
  }

  public static load(): XodusDesktopConfig {
    const base = defaults();
    if (!fs.existsSync(configPath())) {
      return base;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(configPath(), 'utf8')) as Partial<XodusDesktopConfig>;
      return {
        ...base,
        ...raw,
        extraEnv: { ...base.extraEnv, ...(raw.extraEnv || {}) },
        gameRoots: raw.gameRoots && raw.gameRoots.length > 0 ? raw.gameRoots : base.gameRoots
      };
    } catch {
      return base;
    }
  }

  /** Write the current effective config (defaults + overrides) so the user can edit it. */
  public static writeTemplate(): string {
    fs.mkdirSync(configDir(), { recursive: true });
    if (!fs.existsSync(configPath())) {
      fs.writeFileSync(configPath(), JSON.stringify(defaults(), null, 2) + '\n', 'utf8');
    }
    return configPath();
  }
}
