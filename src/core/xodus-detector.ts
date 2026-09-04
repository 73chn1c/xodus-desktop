import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ExecutableResolver } from './executable-resolver';

export interface GdkGameMetadata {
  titleId?: string;
  displayName: string;
  executableName: string;
  executableFullPath: string;
  gameDirectory: string;
  packageFamilyName?: string;
  version?: string;
  iconPath?: string;
  logoPath?: string;
  rawConfig?: string;
}

export class XodusDetector {
  /**
   * Scans a target directory for GDK / Game Pass manifest (MicrosoftGame.config)
   */
  public static inspectGameDirectory(gameDir: string): GdkGameMetadata | null {
    if (!fs.existsSync(gameDir)) {
      return null;
    }

    // A genuine GDK / Game Pass title always ships MicrosoftGame.config. Requiring
    // it keeps GOG/Epic/Steam folders that happen to sit in a scanned root from
    // being picked up as false positives.
    const configPath = path.join(gameDir, 'MicrosoftGame.config');
    if (!fs.existsSync(configPath)) {
      return null;
    }
    let titleId: string | undefined;
    let displayName = path.basename(gameDir);
    let explicitExe: string | undefined;
    let packageFamilyName: string | undefined;
    let version: string | undefined;
    let iconPath: string | undefined;
    let logoPath: string | undefined;
    let rawConfig: string | undefined;

    if (fs.existsSync(configPath)) {
      try {
        rawConfig = fs.readFileSync(configPath, 'utf8');

        // Extract TitleId
        const titleMatch = rawConfig.match(/<TitleId>([a-fA-F0-9]+)<\/TitleId>/i) || rawConfig.match(/TitleId="([a-fA-F0-9]+)"/i);
        if (titleMatch) titleId = titleMatch[1];

        // Extract DisplayName
        const nameMatch = rawConfig.match(/DisplayName="([^"]+)"/i) || rawConfig.match(/<DisplayName>([^<]+)<\/DisplayName>/i);
        if (nameMatch) displayName = nameMatch[1];

        // Extract Executable Name from ExecutableList
        const exeMatch = rawConfig.match(/<Executable\s+Name="([^"]+)"/i);
        if (exeMatch) explicitExe = exeMatch[1];

        // Extract Identity
        const idMatch = rawConfig.match(/<Identity\s+Name="([^"]+)"/i);
        if (idMatch) packageFamilyName = idMatch[1];

        const verMatch = rawConfig.match(/<Identity[^>]*\bVersion="([^"]+)"/i) || rawConfig.match(/\bVersion="([^"]+)"/i);
        if (verMatch) version = verMatch[1];

        // Extract visual elements / icons
        const iconMatch = rawConfig.match(/Square44x44Logo="([^"]+)"/i) || rawConfig.match(/Square150x150Logo="([^"]+)"/i);
        if (iconMatch) {
          const candidateIcon = path.join(gameDir, iconMatch[1].replace(/\\/g, '/'));
          if (fs.existsSync(candidateIcon)) {
            iconPath = candidateIcon;
          }
        }
      } catch {
        // Fallback to heuristic resolution
      }
    }

    const resolved = ExecutableResolver.resolveMainExecutable(gameDir);
    let finalExe: string;
    let finalExePath: string;

    if (resolved && (!explicitExe || explicitExe.toLowerCase().includes('launcher'))) {
      finalExe = resolved.fileName;
      finalExePath = resolved.fullPath;
    } else if (explicitExe && fs.existsSync(path.join(gameDir, explicitExe))) {
      finalExe = explicitExe;
      finalExePath = path.join(gameDir, explicitExe);
    } else if (resolved) {
      finalExe = resolved.fileName;
      finalExePath = resolved.fullPath;
    } else {
      return null;
    }

    return {
      titleId,
      displayName,
      executableName: finalExe,
      executableFullPath: finalExePath,
      gameDirectory: gameDir,
      packageFamilyName,
      version,
      iconPath,
      logoPath,
      rawConfig
    };
  }

  /**
   * Scans the configured game roots for Game Pass / XODUS installed titles.
   * Only directories holding a MicrosoftGame.config are returned (see
   * inspectGameDirectory), so unrelated folders in a shared root are ignored.
   */
  public static scanStandardDirectories(customRoots: string[] = []): GdkGameMetadata[] {
    const home = os.homedir();
    const candidateRoots = Array.from(
      new Set([
        ...customRoots,
        path.join(home, 'Games', 'XODUS'),
        path.join(home, 'Games', 'GamePass')
      ])
    );

    const discovered: GdkGameMetadata[] = [];
    const seen = new Set<string>();

    for (const root of candidateRoots) {
      if (fs.existsSync(root)) {
        try {
          const entries = fs.readdirSync(root, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const gamePath = path.join(root, entry.name);
              const meta = this.inspectGameDirectory(gamePath);
              if (meta && !seen.has(meta.gameDirectory)) {
                seen.add(meta.gameDirectory);
                discovered.push(meta);
              }
            }
          }
        } catch {
          // Ignore unreadable paths
        }
      }
    }

    return discovered;
  }
}
