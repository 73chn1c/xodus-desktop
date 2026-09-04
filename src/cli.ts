import * as os from 'os';
import * as path from 'path';
import { XodusDetector, GdkGameMetadata } from './core/xodus-detector';
import { ProtonGdkManager } from './core/proton-gdk-manager';
import { AudioCodecFixer } from './core/audio-codec-fixer';
import { Config } from './core/config';
import { DesktopEntry, gameId } from './core/desktop-entry';
import { Launcher } from './core/launcher';
import { SteamShortcuts, shortcutAppId } from './core/steam-shortcuts';

const BANNER = 'xodus-desktop — Xbox Game Pass shortcuts for the Linux desktop & Steam (no launcher fork)';

/** Absolute path to the installed CLI, used as the .desktop / Steam Exec target. */
function selfBin(): string {
  const local = path.join(os.homedir(), '.local', 'bin', 'xodus-desktop');
  return require('fs').existsSync(local) ? local : process.argv[1];
}

function scan(cfg = Config.load()): GdkGameMetadata[] {
  return XodusDetector.scanStandardDirectories(cfg.gameRoots);
}

export function runCli(argv: string[]): void {
  const [command, ...rest] = argv.slice(2);
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const positionals = rest.filter((a) => !a.startsWith('--'));

  switch ((command || 'help').toLowerCase()) {
    case 'sync': {
      const cfg = Config.load();
      const games = scan(cfg);
      console.log(BANNER + '\n');
      if (games.length === 0) {
        console.log('No decrypted titles found. Roots scanned:');
        cfg.gameRoots.forEach((r) => console.log('  - ' + r));
        console.log(`\nDownload one with:  xodus-cli streaming <storeId> ${cfg.gameRoots[0]}/<Name>`);
        return;
      }
      const doSteam = flags.has('--steam');
      console.log(`Found ${games.length} title(s):\n`);
      for (const g of games) {
        const res = DesktopEntry.sync(g, selfBin());
        console.log(`  ${res.created ? '+' : '~'} ${g.displayName}`);
        console.log(`      ${res.desktopFile}`);
        if (doSteam) {
          const launch = `${selfBin()} play ${res.record.id}`;
          const updated = SteamShortcuts.upsert({
            AppName: g.displayName,
            Exe: `"${selfBin()}"`,
            StartDir: `"${path.dirname(selfBin())}"`,
            LaunchOptions: `play ${res.record.id}`,
            tags: ['Xbox Game Pass'],
            appid: shortcutAppId(`"${selfBin()}"`, g.displayName)
          });
          console.log(`      Steam: ${updated.length ? updated.length + ' user(s)' : 'no Steam install found'} — ${launch}`);
        }
      }
      DesktopEntry.refreshMenus();
      console.log('\nDone. Titles now appear in your app menu / Cartridges' + (doSteam ? ' / Steam (restart Steam)' : '') + '.');
      break;
    }

    case 'play': {
      const id = positionals[0];
      if (!id) {
        console.error('usage: xodus-desktop play <id>');
        process.exit(2);
      }
      const cfg = Config.load();
      let rec = DesktopEntry.getRecord(id);
      if (!rec) {
        // fall back to a fresh scan (id may match a title that was never synced)
        const match = scan(cfg).find((g) => gameId(g) === id);
        if (match) {
          rec = DesktopEntry.sync(match, selfBin()).record;
        }
      }
      if (!rec) {
        console.error(`Unknown title id "${id}". Run: xodus-desktop sync`);
        process.exit(1);
      }
      const game: GdkGameMetadata = {
        displayName: rec.displayName,
        titleId: rec.titleId,
        gameDirectory: rec.gameDirectory,
        executableName: rec.executableName,
        executableFullPath: rec.executableFullPath
      };
      const plan = Launcher.plan(game, cfg);
      if (flags.has('--dry-run')) {
        console.log(Launcher.describe(plan));
        return;
      }
      process.exit(Launcher.run(plan));
      break;
    }

    case 'list': {
      const recs = DesktopEntry.allRecords();
      if (recs.length === 0) {
        console.log('No synced titles. Run: xodus-desktop sync');
        return;
      }
      for (const r of recs) {
        console.log(`${r.id.padEnd(28)} ${r.displayName}`);
      }
      break;
    }

    case 'remove': {
      const id = positionals[0];
      if (!id) {
        console.error('usage: xodus-desktop remove <id> [--steam]');
        process.exit(2);
      }
      const rec = DesktopEntry.getRecord(id);
      const ok = DesktopEntry.remove(id);
      if (flags.has('--steam') && rec) SteamShortcuts.removeByName(rec.displayName);
      console.log(ok ? `Removed "${id}".` : `No such id "${id}".`);
      DesktopEntry.refreshMenus();
      break;
    }

    case 'doctor': {
      console.log(BANNER + '\n');
      const cfg = Config.load();
      const s = ProtonGdkManager.getRunnerStatus();
      const fs = require('fs') as typeof import('fs');
      console.log('Config:            ' + Config.path());
      console.log('  xodus-cli:       ' + (fs.existsSync(cfg.xodusCliPath) ? '✅ ' : '❌ ') + cfg.xodusCliPath);
      console.log('  wine (GDK):      ' + (fs.existsSync(cfg.wineBinPath) ? '✅ ' : '❌ ') + cfg.wineBinPath);
      console.log('  WINEPREFIX:      ' + cfg.winePrefix);
      console.log('\nGDK runtime:');
      console.log('  xgameruntime.dll ' + (s.xgameruntimePath ? `✅ ${(s.xgameruntimeSizeBytes! / 1048576).toFixed(1)} MB` : '❌ not found'));
      console.log('  XAudio2 DLLs     ' + (s.hasXAudio2 ? '✅' : '❌'));
      console.log('  GStreamer libav  ' + (s.hasGStreamerPlugins ? '✅' : '❌'));
      const games = scan(cfg);
      console.log(`\nTitles on disk:    ${games.length}`);
      games.forEach((g) => console.log(`  • ${g.displayName} → ${g.executableName}`));
      break;
    }

    case 'fix-audio': {
      const dir = positionals[0];
      if (!dir) {
        console.error('usage: xodus-desktop fix-audio <game-dir>');
        process.exit(2);
      }
      const r = AudioCodecFixer.fixGameAudio(dir);
      console.log(`voice archive: ${r.voiceArchiveLinked ? 'linked' : 'n/a'}`);
      console.log(`XAudio2 DLLs:  ${r.xactDllsDeployed ? 'deployed' : 'present'}`);
      console.log(`subtitles:     ${r.subtitlesEnabled ? 'enabled' : 'ready'}`);
      r.warnings.forEach((w) => console.log('  ! ' + w));
      break;
    }

    case 'config': {
      const p = Config.writeTemplate();
      console.log('Config file: ' + p);
      console.log(JSON.stringify(Config.load(), null, 2));
      break;
    }

    case 'help':
    default: {
      console.log(BANNER);
      console.log(`
  xodus-desktop sync [--steam]   Generate .desktop entries (and Steam shortcuts) for
                                 every downloaded Game Pass title
  xodus-desktop play <id>        Launch a title (this is what the shortcuts call)
  xodus-desktop list             List synced titles and their ids
  xodus-desktop remove <id> [--steam]
  xodus-desktop doctor           Check xodus-cli / GDK wine / codecs / titles
  xodus-desktop fix-audio <dir>  Repair dialogue audio + subtitles for one title
  xodus-desktop config           Write / show ~/.config/xodus-desktop/config.json
`);
      break;
    }
  }
}
