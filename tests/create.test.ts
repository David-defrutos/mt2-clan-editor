import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createClan } from '../src/server/create.ts';
import { scanClan } from '../src/server/scan.ts';
import { validateClan } from '../src/server/validate.ts';

test('genera un clan nuevo con dos campeones, seis sendas, dos iniciales y N cartas', async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-clan-editor-create-'));
  const destination = path.join(parent, 'NuevoClan');
  try {
    const root = await createClan({ destination, name: 'Nuevo clan', id: 'NuevoClan', author: 'Pruebas', champions: ['Ámbar', 'Luna'], starters: ['Guardia', 'Hechicera'], draftCount: 7 });
    assert.equal(root, destination);
    const clan = await scanClan(root);
    assert.equal(clan.entries.filter(item => item.section === 'classes').length, 1);
    assert.equal(clan.entries.filter(item => item.section === 'cards').length, 11);
    assert.equal(clan.entries.filter(item => item.section === 'upgrades').length, 18);
    assert.equal(clan.entries.filter(item => item.section === 'card_pools').length, 2);
    assert.equal((clan.entries.find(item => item.section === 'classes')!.data.champions as unknown[]).length, 2);
    assert.equal((await validateClan(clan)).filter(issue => issue.severity === 'error').length, 0);
    assert.ok((await fs.readFile(path.join(root, 'src', 'Plugin.cs'), 'utf8')).includes('json/cards.json'));
    await assert.rejects(() => createClan({ destination, name: 'Nuevo clan', id: 'NuevoClan', author: 'Pruebas', champions: ['A', 'B'], starters: ['C', 'D'], draftCount: 1 }), /ya existe/);
  } finally { await fs.rm(parent, { recursive: true, force: true }); }
});
