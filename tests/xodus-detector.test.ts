import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { XodusDetector } from '../src/core/xodus-detector';

describe('XodusDetector', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xodus-detect-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('parses MicrosoftGame.config and extracts metadata', () => {
    const configXml = `<?xml version="1.0" encoding="utf-8"?>
<Game configVersion="1">
  <Identity Name="Bethesda.Fallout4PC" Publisher="CN=Bethesda" Version="1.10.984.0" />
  <ExecutableList>
    <Executable Name="Fallout4Launcher.exe" TargetDeviceFamily="PC" />
  </ExecutableList>
  <ShellVisualElements DisplayName="Fallout 4" Square150x150Logo="Assets\\Logo.png" />
  <ExtendedAttributeList>
    <ExtendedAttribute Name="TitleId" Value="4AE8F9B2" />
  </ExtendedAttributeList>
</Game>`;

    fs.writeFileSync(path.join(tempDir, 'MicrosoftGame.config'), configXml, 'utf8');
    fs.writeFileSync(path.join(tempDir, 'Fallout4.exe'), Buffer.alloc(1024 * 1024 * 40));
    fs.writeFileSync(path.join(tempDir, 'Fallout4Launcher.exe'), Buffer.alloc(1024 * 200));

    const meta = XodusDetector.inspectGameDirectory(tempDir);
    expect(meta).not.toBeNull();
    expect(meta?.displayName).toBe('Fallout 4');
    expect(meta?.packageFamilyName).toBe('Bethesda.Fallout4PC');
    expect(meta?.version).toBe('1.10.984.0');
    expect(meta?.executableName).toBe('Fallout4.exe');
  });

  test('a directory without MicrosoftGame.config is not a GDK title', () => {
    fs.writeFileSync(path.join(tempDir, 'SomeGogGame.exe'), Buffer.alloc(1024 * 1024 * 40));
    expect(XodusDetector.inspectGameDirectory(tempDir)).toBeNull();
  });

  test('scanStandardDirectories skips non-GDK folders in a shared root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xodus-root-'));
    fs.mkdirSync(path.join(root, 'GogGame'));
    fs.writeFileSync(path.join(root, 'GogGame', 'game.exe'), Buffer.alloc(1024 * 1024));
    fs.mkdirSync(path.join(root, 'GamePassGame'));
    fs.writeFileSync(
      path.join(root, 'GamePassGame', 'MicrosoftGame.config'),
      '<Game><ShellVisualElements DisplayName="GP Title" /><ExecutableList><Executable Name="gp.exe" /></ExecutableList></Game>'
    );
    fs.writeFileSync(path.join(root, 'GamePassGame', 'gp.exe'), Buffer.alloc(1024 * 1024 * 10));

    const found = XodusDetector.scanStandardDirectories([root]);
    fs.rmSync(root, { recursive: true, force: true });
    expect(found.map((g) => g.displayName)).toEqual(['GP Title']);
  });
});
