import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Minimal, dependency-free reader/writer for Steam's binary `shortcuts.vdf`
 * (non-Steam game shortcuts). Format tokens:
 *   0x00 <key\0> ...        nested map, terminated by 0x08
 *   0x01 <key\0> <value\0>  string
 *   0x02 <key\0> <int32-LE> number
 *   0x08                    end of map
 */

export interface SteamShortcut {
  AppName: string;
  Exe: string;
  StartDir: string;
  LaunchOptions: string;
  icon?: string;
  tags?: string[];
  appid?: number;
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

/** Steam's legacy non-Steam-app id (used as the map key and for `steam://rungameid`). */
export function shortcutAppId(exe: string, appName: string): number {
  const key = Buffer.from(`${exe}${appName}`, 'utf8');
  const top = (crc32(key) | 0x80000000) >>> 0;
  return top - 0x100000000; // to signed int32
}

class Reader {
  private p = 0;
  constructor(private b: Buffer) {}
  eof(): boolean {
    return this.p >= this.b.length;
  }
  u8(): number {
    return this.b[this.p++];
  }
  i32(): number {
    const v = this.b.readInt32LE(this.p);
    this.p += 4;
    return v;
  }
  cstr(): string {
    const start = this.p;
    while (this.b[this.p] !== 0x00) this.p++;
    const s = this.b.toString('utf8', start, this.p);
    this.p++;
    return s;
  }
}

function readMap(r: Reader): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  while (!r.eof()) {
    const type = r.u8();
    if (type === 0x08) break;
    const key = r.cstr();
    if (type === 0x00) obj[key] = readMap(r);
    else if (type === 0x01) obj[key] = r.cstr();
    else if (type === 0x02) obj[key] = r.i32();
  }
  return obj;
}

function mapField(key: string, value: string): Buffer {
  return Buffer.concat([Buffer.from([0x01]), Buffer.from(key + '\0', 'utf8'), Buffer.from(value + '\0', 'utf8')]);
}
function intField(key: string, value: number): Buffer {
  const n = Buffer.alloc(4);
  n.writeInt32LE(value | 0, 0);
  return Buffer.concat([Buffer.from([0x02]), Buffer.from(key + '\0', 'utf8'), n]);
}

function writeShortcut(index: number, s: SteamShortcut): Buffer {
  const parts: Buffer[] = [Buffer.from([0x00]), Buffer.from(String(index) + '\0', 'utf8')];
  parts.push(intField('appid', s.appid ?? shortcutAppId(s.Exe, s.AppName)));
  parts.push(mapField('AppName', s.AppName));
  parts.push(mapField('Exe', s.Exe));
  parts.push(mapField('StartDir', s.StartDir));
  parts.push(mapField('icon', s.icon || ''));
  parts.push(mapField('ShortcutPath', ''));
  parts.push(mapField('LaunchOptions', s.LaunchOptions || ''));
  parts.push(intField('IsHidden', 0));
  parts.push(intField('AllowDesktopConfig', 1));
  parts.push(intField('AllowOverlay', 1));
  parts.push(intField('OpenVR', 0));
  parts.push(intField('Devkit', 0));
  parts.push(mapField('DevkitGameID', ''));
  parts.push(intField('DevkitOverrideAppID', 0));
  parts.push(intField('LastPlayTime', 0));
  parts.push(mapField('FlatpakAppID', ''));
  // tags
  parts.push(Buffer.from([0x00]), Buffer.from('tags\0', 'utf8'));
  (s.tags || []).forEach((t, i) => parts.push(mapField(String(i), t)));
  parts.push(Buffer.from([0x08])); // end tags
  parts.push(Buffer.from([0x08])); // end this shortcut
  return Buffer.concat(parts);
}

export class SteamShortcuts {
  /** All Steam userdata config dirs on this machine. */
  public static userdataConfigDirs(): string[] {
    const home = os.homedir();
    const roots = [
      path.join(home, '.steam', 'steam', 'userdata'),
      path.join(home, '.steam', 'debian-installation', 'userdata'),
      path.join(home, '.local', 'share', 'Steam', 'userdata'),
      path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam', 'userdata')
    ];
    const dirs: string[] = [];
    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      for (const uid of fs.readdirSync(root)) {
        const cfg = path.join(root, uid, 'config');
        if (fs.existsSync(cfg)) dirs.push(cfg);
      }
    }
    return dirs;
  }

  public static read(vdfPath: string): SteamShortcut[] {
    if (!fs.existsSync(vdfPath)) return [];
    const root = readMap(new Reader(fs.readFileSync(vdfPath)));
    const list = (root['shortcuts'] || {}) as Record<string, Record<string, unknown>>;
    return Object.values(list).map((e) => ({
      AppName: String(e['AppName'] || ''),
      Exe: String(e['Exe'] || ''),
      StartDir: String(e['StartDir'] || ''),
      LaunchOptions: String(e['LaunchOptions'] || ''),
      icon: e['icon'] ? String(e['icon']) : undefined,
      appid: typeof e['appid'] === 'number' ? (e['appid'] as number) : undefined,
      tags: e['tags'] ? Object.values(e['tags'] as Record<string, string>) : []
    }));
  }

  public static write(vdfPath: string, shortcuts: SteamShortcut[]): void {
    const body = shortcuts.map((s, i) => writeShortcut(i, s));
    const buf = Buffer.concat([
      Buffer.from([0x00]),
      Buffer.from('shortcuts\0', 'utf8'),
      ...body,
      Buffer.from([0x08]), // end shortcuts
      Buffer.from([0x08]) // end root
    ]);
    if (fs.existsSync(vdfPath)) {
      fs.copyFileSync(vdfPath, vdfPath + '.xodus-bak');
    } else {
      fs.mkdirSync(path.dirname(vdfPath), { recursive: true });
    }
    fs.writeFileSync(vdfPath, buf);
  }

  /**
   * Upsert one shortcut (matched by AppName) into every Steam user on the box.
   * Returns the config dirs that were updated.
   */
  public static upsert(shortcut: SteamShortcut): string[] {
    const updated: string[] = [];
    for (const cfgDir of this.userdataConfigDirs()) {
      const vdf = path.join(cfgDir, 'shortcuts.vdf');
      const existing = this.read(vdf);
      const idx = existing.findIndex((s) => s.AppName === shortcut.AppName);
      if (idx >= 0) existing[idx] = { ...existing[idx], ...shortcut };
      else existing.push(shortcut);
      this.write(vdf, existing);
      updated.push(cfgDir);
    }
    return updated;
  }

  public static removeByName(appName: string): string[] {
    const updated: string[] = [];
    for (const cfgDir of this.userdataConfigDirs()) {
      const vdf = path.join(cfgDir, 'shortcuts.vdf');
      if (!fs.existsSync(vdf)) continue;
      const existing = this.read(vdf);
      const filtered = existing.filter((s) => s.AppName !== appName);
      if (filtered.length !== existing.length) {
        this.write(vdf, filtered);
        updated.push(cfgDir);
      }
    }
    return updated;
  }
}
