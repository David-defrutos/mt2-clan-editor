import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { commitClan, publishStatus } from '../src/server/publish.ts';

test('el commit se limita a la carpeta del clan dentro de un repositorio compartido', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mt2-clan-editor-git-'));
  const clan = path.join(root, 'clan');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  try {
    await fs.mkdir(clan);
    git('init'); git('config', 'user.email', 'test@example.local'); git('config', 'user.name', 'Test');
    await fs.writeFile(path.join(clan, 'card.json'), '{}');
    await fs.writeFile(path.join(root, 'other.txt'), 'old');
    git('add', '--all'); git('commit', '-m', 'initial');
    await fs.writeFile(path.join(clan, 'card.json'), '{"cost":2}');
    await fs.writeFile(path.join(clan, 'new.json'), '{"id":"New"}');
    await fs.writeFile(path.join(root, 'other.txt'), 'new');
    const before = await publishStatus(clan);
    assert.deepEqual('error' in before ? [] : before.files, [' M card.json', '?? new.json']);
    const after = await commitClan(clan, 'edit card');
    assert.deepEqual('error' in after ? [] : after.files, []);
    assert.deepEqual(git('show', '--pretty=format:', '--name-only', 'HEAD').split(/\r?\n/).sort(), ['clan/card.json', 'clan/new.json']);
    assert.equal(git('status', '--short', '--', 'other.txt'), 'M other.txt');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
