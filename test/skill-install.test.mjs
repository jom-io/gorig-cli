import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import fs from 'fs-extra';

import { installSkill, resolveInstalls } from '../commands/skill.js';

const templateRoot = path.resolve('templates/skills');
const cliPath = path.resolve('bin/cli.js');

const makeSandbox = async () => fs.mkdtemp(path.join(os.tmpdir(), 'gorig-skill-test-'));

test('resolveInstalls applies user scope consistently', () => {
  const installs = resolveInstalls('all', 'user', {
    cwd: '/workspace/project',
    home: '/home/tester',
    templateRoot,
  });

  assert.deepEqual(
    installs.map((item) => item.destination),
    [
      '/home/tester/.agents/skills/gorig-backend',
      '/home/tester/.claude/skills/gorig-backend',
    ],
  );
  assert.equal(installs[0].source, installs[1].source);
});

test('resolveInstalls applies project scope consistently', () => {
  const installs = resolveInstalls('all', 'project', {
    cwd: '/workspace/project',
    home: '/home/tester',
    templateRoot,
  });

  assert.deepEqual(
    installs.map((item) => item.destination),
    [
      '/workspace/project/.agents/skills/gorig-backend',
      '/workspace/project/.claude/skills/gorig-backend',
    ],
  );
});

test('installSkill installs identical canonical content and removes stale files', async (t) => {
  const sandbox = await makeSandbox();
  t.after(() => fs.remove(sandbox));

  const codexDestination = path.join(sandbox, '.agents/skills/gorig-backend');
  await fs.ensureDir(codexDestination);
  await fs.writeFile(path.join(codexDestination, 'stale.txt'), 'stale');

  const installs = await installSkill('all', 'project', {
    cwd: sandbox,
    home: sandbox,
    templateRoot,
  });

  const claudeDestination = path.join(sandbox, '.claude/skills/gorig-backend');
  const codexSkill = await fs.readFile(path.join(codexDestination, 'SKILL.md'), 'utf8');
  const claudeSkill = await fs.readFile(path.join(claudeDestination, 'SKILL.md'), 'utf8');

  assert.equal(installs.length, 2);
  assert.equal(codexSkill, claudeSkill);
  assert.equal(await fs.pathExists(path.join(codexDestination, 'stale.txt')), false);
  assert.equal(await fs.pathExists(path.join(codexDestination, 'agents/openai.yaml')), true);
  assert.equal(await fs.pathExists(path.join(claudeDestination, 'scripts/detect-gorig-context.sh')), true);
});

test('installSkill validates sources before replacing an existing install', async (t) => {
  const sandbox = await makeSandbox();
  t.after(() => fs.remove(sandbox));

  const destination = path.join(sandbox, '.agents/skills/gorig-backend');
  await fs.ensureDir(destination);
  await fs.writeFile(path.join(destination, 'keep.txt'), 'keep');

  await assert.rejects(
    installSkill('codex', 'project', {
      cwd: sandbox,
      home: sandbox,
      templateRoot: path.join(sandbox, 'missing-templates'),
    }),
    /Skill template not found/,
  );

  assert.equal(await fs.readFile(path.join(destination, 'keep.txt'), 'utf8'), 'keep');
});

test('CLI installs both project-scoped skills from the canonical source', async (t) => {
  const sandbox = await makeSandbox();
  t.after(() => fs.remove(sandbox));

  const result = spawnSync(
    process.execPath,
    [cliPath, 'skill', 'install', 'all', 'project'],
    {
      cwd: sandbox,
      env: { ...process.env, HOME: sandbox },
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Installed Codex \(project\)/);
  assert.match(result.stdout, /Installed Claude \(project\)/);
  assert.equal(
    await fs.readFile(path.join(sandbox, '.agents/skills/gorig-backend/SKILL.md'), 'utf8'),
    await fs.readFile(path.join(sandbox, '.claude/skills/gorig-backend/SKILL.md'), 'utf8'),
  );
});

test('CLI rejects an invalid scope with exit code 1', () => {
  const result = spawnSync(
    process.execPath,
    [cliPath, 'skill', 'install', 'codex', 'invalid'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown skill scope: invalid/);
});
