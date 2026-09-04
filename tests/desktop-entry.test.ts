import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { GdkGameMetadata } from '../src/core/xodus-detector';
import { DesktopEntry } from '../src/core/desktop-entry';

const game: GdkGameMetadata = {
  titleId: '4AE8F9B2',
  displayName: 'Fallout 4',
  executableName: 'Fallout4.exe',
  executableFullPath: '/games/Fallout4/Fallout4.exe',
  gameDirectory: '/games/Fallout4'
};

describe('DesktopEntry', () => {
  let home: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'xodus-home-'));
    for (const k of ['XODUS_DESKTOP_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME']) saved[k] = process.env[k];
    process.env.XODUS_DESKTOP_HOME = home;
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_DATA_HOME;
  });
  afterEach(() => {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('writes a .desktop entry that calls back into `play <id>`', () => {
    const { desktopFile, record, created } = DesktopEntry.sync(game, '/home/u/.local/bin/xodus-desktop');
    expect(created).toBe(true);
    expect(record.id).toBe('4ae8f9b2');
    expect(desktopFile).toBe(path.join(home, '.local', 'share', 'applications', 'xodus-4ae8f9b2.desktop'));

    const contents = fs.readFileSync(desktopFile, 'utf8');
    expect(contents).toContain('Name=Fallout 4');
    expect(contents).toContain('Exec=/home/u/.local/bin/xodus-desktop play 4ae8f9b2');
    expect(contents).toContain('StartupWMClass=Fallout4');
    expect(contents).toContain('Categories=Game;');
  });

  test('records the title in games.json and getRecord() reads it back', () => {
    DesktopEntry.sync(game, '/x/xodus-desktop');
    const rec = DesktopEntry.getRecord('4ae8f9b2');
    expect(rec?.displayName).toBe('Fallout 4');
    expect(rec?.executableName).toBe('Fallout4.exe');
    expect(fs.existsSync(path.join(home, '.config', 'xodus-desktop', 'games.json'))).toBe(true);
  });

  test('remove() deletes the entry and db row but never touches game files', () => {
    const { desktopFile } = DesktopEntry.sync(game, '/x/xodus-desktop');
    expect(DesktopEntry.remove('4ae8f9b2')).toBe(true);
    expect(fs.existsSync(desktopFile)).toBe(false);
    expect(DesktopEntry.getRecord('4ae8f9b2')).toBeUndefined();
  });

  test('sync() is idempotent (second run reports not-created)', () => {
    DesktopEntry.sync(game, '/x/xodus-desktop');
    expect(DesktopEntry.sync(game, '/x/xodus-desktop').created).toBe(false);
  });
});
