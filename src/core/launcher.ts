import * as fs from 'fs';
import { spawnSync } from 'child_process';
import { XodusDesktopConfig } from './config';
import { GdkGameMetadata } from './xodus-detector';
import { ProtonGdkManager } from './proton-gdk-manager';

export interface LaunchPlan {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/** PRIME render-offload vars for forcing the dedicated (NVIDIA) GPU on Optimus laptops. */
const PRIME_ENV: Record<string, string> = {
  __NV_PRIME_RENDER_OFFLOAD: '1',
  __GLX_VENDOR_LIBRARY_NAME: 'nvidia',
  __VK_LAYER_NV_optimus: 'NVIDIA_only',
  DXVK_FILTER_DEVICE_NAME: ''
};

export class Launcher {
  private static hasGameMode(): boolean {
    const r = spawnSync('sh', ['-c', 'command -v gamemoderun'], { encoding: 'utf8' });
    return r.status === 0 && !!r.stdout.trim();
  }

  /**
   * Build the exact process invocation for a title:
   *   [gamemoderun] <xodus-cli> run <gameDir> <wineBin> --exe <exe>
   * with the GDK env, WINEPREFIX and (optionally) PRIME offload applied.
   */
  public static plan(game: GdkGameMetadata, cfg: XodusDesktopConfig): LaunchPlan {
    const env: Record<string, string> = {
      ...ProtonGdkManager.getOptimalEnvironment(),
      WINEPREFIX: cfg.winePrefix,
      ...(cfg.primeOffload ? PRIME_ENV : {}),
      ...cfg.extraEnv
    };

    const cliArgs = ['run', game.gameDirectory, cfg.wineBinPath, '--exe', game.executableName];

    if (cfg.useGameMode && this.hasGameMode()) {
      return { command: 'gamemoderun', args: [cfg.xodusCliPath, ...cliArgs], env };
    }
    return { command: cfg.xodusCliPath, args: cliArgs, env };
  }

  /** Run the plan, inheriting stdio, and return the child exit code. */
  public static run(plan: LaunchPlan): number {
    if (plan.command !== 'gamemoderun' && !fs.existsSync(plan.command)) {
      console.error(`xodus-cli not found at: ${plan.command}\nSet "xodusCliPath" in ${'~/.config/xodus-desktop/config.json'}`);
      return 127;
    }
    const child = spawnSync(plan.command, plan.args, {
      stdio: 'inherit',
      env: { ...process.env, ...plan.env }
    });
    return child.status ?? 1;
  }

  /** Human-readable one-liner for `--dry-run` / logs. */
  public static describe(plan: LaunchPlan): string {
    const envStr = Object.entries(plan.env)
      .filter(([k]) => ['WINEPREFIX', '__NV_PRIME_RENDER_OFFLOAD', 'VKD3D_CONFIG'].includes(k))
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    return `${envStr} ${plan.command} ${plan.args.join(' ')}`.trim();
  }
}
