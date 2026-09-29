import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildClan, buildStatus } from '../src/server/build.ts';

test('detecta proyectos C# y solo permite compilar uno dentro del clan', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-clan-editor-build-'));
  try {
    await fs.mkdir(path.join(root, 'src', 'bin'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'Clan.Plugin.csproj'), '<Project Sdk="Microsoft.NET.Sdk"/>');
    await fs.writeFile(path.join(root, 'src', 'bin', 'Ignorado.csproj'), '<Project/>');
    const status = await buildStatus(root);
    assert.deepEqual(status.projects, ['src/Clan.Plugin.csproj']);
    await assert.rejects(() => buildClan(root, '../Otro.csproj'), /dentro del clan/);
    await assert.rejects(() => buildClan(root, 'src/bin/Ignorado.csproj'), /dentro del clan/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('encuentra la DLL aunque AssemblyName sea distinto al nombre del proyecto', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-clan-editor-assembly-'));
  const previousAppData = process.env.APPDATA;
  try {
    const sdk = await buildStatus(root);
    if (!sdk.sdkVersion) { t.skip('SDK .NET no disponible.'); return; }
    if (process.platform === 'win32') process.env.APPDATA = path.join(root, 'appdata');
    await fs.writeFile(path.join(root, 'Example.csproj'), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><AssemblyName>DifferentName</AssemblyName></PropertyGroup></Project>');
    await fs.writeFile(path.join(root, 'Example.cs'), 'public class Example {}');
    await fs.writeFile(path.join(root, 'NuGet.Config'), '<configuration><packageSources><clear /></packageSources></configuration>');
    const result = await buildClan(root, 'Example.csproj');
    assert.equal(result.ok, true, result.log);
    assert.equal(path.basename(result.dll ?? ''), 'DifferentName.dll');
    assert.match(result.sha256 ?? '', /^[a-f0-9]{64}$/);
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    await fs.rm(root, { recursive: true, force: true });
  }
});
