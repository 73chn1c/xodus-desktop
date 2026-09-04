import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SteamShortcuts, shortcutAppId, SteamShortcut } from '../src/core/steam-shortcuts';

describe('SteamShortcuts (binary shortcuts.vdf)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xodus-vdf-'));
  });
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('round-trips shortcuts through write() then read()', () => {
    const vdf = path.join(tempDir, 'shortcuts.vdf');
    const input: SteamShortcut[] = [
      {
        AppName: 'Fallout 4',
        Exe: '"/home/u/.local/bin/xodus-desktop"',
        StartDir: '"/home/u/.local/bin"',
        LaunchOptions: 'play 4ae8f9b2',
        tags: ['Xbox Game Pass']
      },
      {
        AppName: 'Hi-Fi RUSH',
        Exe: '"/home/u/.local/bin/xodus-desktop"',
        StartDir: '"/home/u/.local/bin"',
        LaunchOptions: 'play hi-fi-rush',
        tags: ['Xbox Game Pass']
      }
    ];

    SteamShortcuts.write(vdf, input);
    const out = SteamShortcuts.read(vdf);

    expect(out).toHaveLength(2);
    expect(out[0].AppName).toBe('Fallout 4');
    expect(out[0].LaunchOptions).toBe('play 4ae8f9b2');
    expect(out[0].tags).toEqual(['Xbox Game Pass']);
    expect(out[1].AppName).toBe('Hi-Fi RUSH');
  });

  test('preserves unrelated existing shortcuts on upsert-style merge', () => {
    const vdf = path.join(tempDir, 'shortcuts.vdf');
    SteamShortcuts.write(vdf, [
      { AppName: 'Some GOG Game', Exe: '"/opt/gog/game"', StartDir: '"/opt/gog"', LaunchOptions: '' }
    ]);

    const existing = SteamShortcuts.read(vdf);
    existing.push({
      AppName: 'Pentiment',
      Exe: '"/home/u/.local/bin/xodus-desktop"',
      StartDir: '"/home/u/.local/bin"',
      LaunchOptions: 'play pentiment'
    });
    SteamShortcuts.write(vdf, existing);

    const names = SteamShortcuts.read(vdf).map((s) => s.AppName).sort();
    expect(names).toEqual(['Pentiment', 'Some GOG Game']);
    expect(fs.existsSync(vdf + '.xodus-bak')).toBe(true);
  });

  test('shortcutAppId is deterministic and in signed int32 range', () => {
    const a = shortcutAppId('"/x/xodus-desktop"', 'Fallout 4');
    const b = shortcutAppId('"/x/xodus-desktop"', 'Fallout 4');
    const c = shortcutAppId('"/x/xodus-desktop"', 'Starfield');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toBeGreaterThanOrEqual(-2147483648);
    expect(a).toBeLessThan(0); // high bit set for non-Steam shortcuts
  });

  test('read() of a missing file returns []', () => {
    expect(SteamShortcuts.read(path.join(tempDir, 'nope.vdf'))).toEqual([]);
  });
});
