import * as fs from 'fs';
import * as path from 'path';
import { GdkGameMetadata } from './xodus-detector';
import { gamesDbPath, xdgDataHome } from './config';

const applicationsDir = (): string => path.join(xdgDataHome(), 'applications');
const iconsDir = (): string => path.join(xdgDataHome(), 'xodus-desktop', 'icons');

export interface GameRecord {
  id: string;
  displayName: string;
  titleId?: string;
  gameDirectory: string;
  executableName: string;
  executableFullPath: string;
  desktopFile?: string;
}

export interface SyncResult {
  record: GameRecord;
  desktopFile: string;
  created: boolean;
}

/** Stable, filesystem-safe id for a title. */
export function gameId(game: GdkGameMetadata): string {
  const base = game.titleId || path.basename(game.gameDirectory);
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export class DesktopEntry {
  private static loadDb(): Record<string, GameRecord> {
    try {
      return JSON.parse(fs.readFileSync(gamesDbPath(), 'utf8')) as Record<string, GameRecord>;
    } catch {
      return {};
    }
  }

  private static saveDb(db: Record<string, GameRecord>): void {
    fs.mkdirSync(path.dirname(gamesDbPath()), { recursive: true });
    fs.writeFileSync(gamesDbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
  }

  /** Copy the title's icon into our own dir so the .desktop Icon= is stable. */
  private static installIcon(id: string, game: GdkGameMetadata): string | undefined {
    if (!game.iconPath || !fs.existsSync(game.iconPath)) return undefined;
    fs.mkdirSync(iconsDir(), { recursive: true });
    const ext = path.extname(game.iconPath) || '.png';
    const dest = path.join(iconsDir(), `${id}${ext}`);
    try {
      fs.copyFileSync(game.iconPath, dest);
      return dest;
    } catch {
      return undefined;
    }
  }

  /**
   * Write ~/.local/share/applications/xodus-<id>.desktop whose Exec calls back
   * into `xodus-desktop play <id>` (single source of truth for the launch env).
   */
  public static sync(game: GdkGameMetadata, selfBin: string): SyncResult {
    fs.mkdirSync(applicationsDir(), { recursive: true });
    const id = gameId(game);
    const desktopFile = path.join(applicationsDir(), `xodus-${id}.desktop`);
    const created = !fs.existsSync(desktopFile);
    const icon = this.installIcon(id, game) || 'applications-games';

    // StartupWMClass helps the DE / Steam match the wine window back to this entry.
    const wmClass = game.executableName.replace(/\.exe$/i, '');

    const entry = [
      '[Desktop Entry]',
      'Type=Application',
      `Name=${game.displayName}`,
      'Comment=Xbox Game Pass title (via xodus + GDK wine)',
      `Exec=${selfBin} play ${id}`,
      `Icon=${icon}`,
      `StartupWMClass=${wmClass}`,
      'Terminal=false',
      'Categories=Game;',
      'Keywords=xbox;gamepass;xodus;',
      `X-Xodus-TitleId=${game.titleId || ''}`,
      `X-Xodus-InstallDir=${game.gameDirectory}`,
      ''
    ].join('\n');

    fs.writeFileSync(desktopFile, entry, 'utf8');

    const record: GameRecord = {
      id,
      displayName: game.displayName,
      titleId: game.titleId,
      gameDirectory: game.gameDirectory,
      executableName: game.executableName,
      executableFullPath: game.executableFullPath,
      desktopFile
    };
    const db = this.loadDb();
    db[id] = record;
    this.saveDb(db);

    return { record, desktopFile, created };
  }

  public static getRecord(id: string): GameRecord | undefined {
    return this.loadDb()[id];
  }

  public static allRecords(): GameRecord[] {
    return Object.values(this.loadDb());
  }

  /** Remove a title's .desktop entry and DB row (files on disk are left alone). */
  public static remove(id: string): boolean {
    const db = this.loadDb();
    const rec = db[id];
    if (!rec) return false;
    if (rec.desktopFile && fs.existsSync(rec.desktopFile)) fs.unlinkSync(rec.desktopFile);
    delete db[id];
    this.saveDb(db);
    return true;
  }

  /** Refresh the DE menu cache if the tooling is present (best-effort). */
  public static refreshMenus(): void {
    try {
      const { spawnSync } = require('child_process') as typeof import('child_process');
      spawnSync('update-desktop-database', [applicationsDir()], { stdio: 'ignore' });
    } catch {
      /* not fatal */
    }
  }
}
