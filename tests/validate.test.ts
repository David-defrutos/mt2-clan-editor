import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { scanClan } from '../src/server/scan.ts';
import { validateClan } from '../src/server/validate.ts';

test('la validación señala referencias y arte rotos en una copia temporal', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-clan-editor-validation-'));
  try {
    await fs.mkdir(path.join(root, 'json'));
    await fs.mkdir(path.join(root, 'textures'));
    await fs.writeFile(path.join(root, 'textures', 'other.png'), await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ffffff' } }).png().toBuffer());
    const sample = {
      classes: [{ id: 'ClassTest', champions: [{ id: 'Hero', card_data: '@Missing', starter_card: '@Starter', upgrade_tree: [[]] }] }],
      cards: [{ id: 'Starter', cost: 2, card_type: 'spell', unlock_level: 3, pools: ['StarterCardsOnly'] }],
      sprites: [{ id: 'MissingImage', path: 'textures/missing.png' }, { id: 'WrongCase', path: 'textures/Other.png' }]
    };
    await fs.writeFile(path.join(root, 'json', 'clan.json'), JSON.stringify(sample));
    const issues = await validateClan(await scanClan(root));
    for (const code of ['champion-count', 'path-count', 'path-levels', 'champion-reference', 'starter-locked', 'asset-missing', 'asset-case-mismatch']) {
      assert.ok(issues.some(issue => issue.code === code), `Falta ${code}`);
    }
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
