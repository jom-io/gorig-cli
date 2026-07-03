import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import fs from 'fs-extra';

import { parseCreateArgs } from '../commands/create.js';
import { parseInitArgs } from '../commands/init.js';

const cliPath = path.resolve('bin/cli.js');
const localGorig = path.resolve('..', 'gorig');

test('parseInitArgs returns deterministic defaults', () => {
  assert.deepEqual(parseInitArgs(['demo-api']), {
    projectName: 'demo-api',
    moduleName: 'demo-api',
    gorigVersion: 'latest',
    gorigReplace: '',
    port: 9527,
    force: false,
    start: false,
    git: true,
  });
});

test('parseInitArgs accepts automation options', () => {
  const options = parseInitArgs([
    'demo-api',
    '--module', 'example.com/demo-api',
    '--gorig-version=v0.0.52',
    '--gorig-replace', '../gorig',
    '--port', '19527',
    '--force',
    '--no-start',
    '--no-git',
  ]);

  assert.equal(options.moduleName, 'example.com/demo-api');
  assert.equal(options.gorigVersion, 'v0.0.52');
  assert.equal(options.gorigReplace, '../gorig');
  assert.equal(options.port, 19527);
  assert.equal(options.force, true);
  assert.equal(options.start, false);
  assert.equal(options.git, false);
});

test('parseInitArgs rejects unsafe or conflicting input', () => {
  assert.throws(() => parseInitArgs(['../demo']), /Project name may contain/);
  assert.throws(() => parseInitArgs(['demo', '--port', '70000']), /Port must be/);
  assert.throws(
    () => parseInitArgs(['demo', '--start', '--no-start']),
    /Use only one of --start or --no-start/,
  );
});

test('parseCreateArgs supports basic and persistent CRUD profiles', () => {
  assert.deepEqual(parseCreateArgs(['order']), {
    moduleName: 'order',
    ModuleName: 'Order',
    crud: false,
    db: '',
    dbName: '',
    http: true,
  });

  assert.deepEqual(parseCreateArgs(['order_item', '--crud', '--db', 'mysql']), {
    moduleName: 'order_item',
    ModuleName: 'OrderItem',
    crud: true,
    db: 'mysql',
    dbName: 'Main',
    http: true,
  });

  assert.deepEqual(parseCreateArgs(['order_item', '--database=mongodb', '--db-name', 'biz', '--no-http']), {
    moduleName: 'order_item',
    ModuleName: 'OrderItem',
    crud: true,
    db: 'mongo',
    dbName: 'biz',
    http: false,
  });

  assert.throws(() => parseCreateArgs(['Order']), /lower snake_case/);
  assert.throws(() => parseCreateArgs(['order', '--crud']), /--db mysql or --db mongo/);
  assert.throws(() => parseCreateArgs(['order', '--db', 'postgres']), /--db mysql or --db mongo/);
  assert.throws(() => parseCreateArgs(['order', '--db', 'mysql', '--db-name', 'bad-name']), /connection name/);
});

test('CLI generates a buildable basic project from a local Gorig source', { timeout: 120_000 }, async (t) => {
  if (!await fs.pathExists(path.join(localGorig, 'go.mod'))) {
    t.skip(`Local Gorig source not found: ${localGorig}`);
    return;
  }

  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'gorig-init-test-'));
  t.after(() => fs.remove(sandbox));
  const projectName = 'phase1-app';
  const projectDir = path.join(sandbox, projectName);
  const env = {
    ...process.env,
    GOCACHE: path.join(os.tmpdir(), 'gorig-go-cache'),
    GOPROXY: 'off',
    GOSUMDB: 'off',
  };

  const generated = spawnSync(
    process.execPath,
    [
      cliPath,
      'init', projectName,
      '--module', 'example.com/phase1-app',
      '--gorig-replace', localGorig,
      '--port', '19627',
      '--no-start',
    ],
    { cwd: sandbox, env, encoding: 'utf8', timeout: 120_000 },
  );

  assert.equal(generated.status, 0, `${generated.stdout}\n${generated.stderr}`);
  assert.match(generated.stdout, /Project created at/);

  const required = [
    '_bin/local.yaml',
    '_bin/dev.yaml',
    '_bin/prod.yaml',
    '_cmd/main.go',
    'domain/init.go',
    'domain/hello/router.go',
    'domain/hello/controller.go',
    'domain/hello/service.go',
    'global/config.go',
    'test/_bin/local.yaml',
    'test/hello_test.go',
    'README.md',
    'go.mod',
    'go.sum',
    '.git/HEAD',
  ];
  for (const relativePath of required) {
    assert.equal(
      await fs.pathExists(path.join(projectDir, relativePath)),
      true,
      `missing ${relativePath}`,
    );
  }

  const goMod = await fs.readFile(path.join(projectDir, 'go.mod'), 'utf8');
  assert.match(goMod, /module example\.com\/phase1-app/);
  assert.match(goMod, /replace github\.com\/jom-io\/gorig => /);

  for (const [command, args] of [
    ['go', ['vet', './...']],
    ['go', ['build', './...']],
    ['go', ['test', './...', '-v']],
  ]) {
    const result = spawnSync(command, args, {
      cwd: projectDir,
      env,
      encoding: 'utf8',
      timeout: 120_000,
    });
    assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  }

  const moduleGenerated = spawnSync(
    process.execPath,
    [cliPath, 'create', 'supply_order'],
    { cwd: projectDir, env, encoding: 'utf8', timeout: 120_000 },
  );

  assert.equal(moduleGenerated.status, 0, `${moduleGenerated.stdout}\n${moduleGenerated.stderr}`);
  assert.match(moduleGenerated.stdout, /domain\/supply_order/);

  const moduleRequired = [
    'domain/supply_order/router.go',
    'domain/supply_order/controller.go',
    'domain/supply_order/service.go',
    'domain/supply_order/dto.go',
    'domain/supply_order/model/supply_order.go',
  ];
  for (const relativePath of moduleRequired) {
    assert.equal(
      await fs.pathExists(path.join(projectDir, relativePath)),
      true,
      `missing ${relativePath}`,
    );
  }
  for (const legacyPath of [
    'domain/supply_order/api',
    'domain/supply_order/internal',
  ]) {
    assert.equal(await fs.pathExists(path.join(projectDir, legacyPath)), false, `unexpected ${legacyPath}`);
  }

  const domainInit = await fs.readFile(path.join(projectDir, 'domain/init.go'), 'utf8');
  assert.match(domainInit, /example\.com\/phase1-app\/domain\/supply_order/);

  for (const [moduleName, db] of [
    ['order_mysql', 'mysql'],
    ['order_mongo', 'mongo'],
  ]) {
    const crudGenerated = spawnSync(
      process.execPath,
      [cliPath, 'create', moduleName, '--crud', '--db', db],
      { cwd: projectDir, env, encoding: 'utf8', timeout: 120_000 },
    );

    assert.equal(crudGenerated.status, 0, `${crudGenerated.stdout}\n${crudGenerated.stderr}`);
    assert.match(crudGenerated.stdout, new RegExp(`persistent CRUD \\(${db}\\)`));

    for (const relativePath of [
      `domain/${moduleName}/router.go`,
      `domain/${moduleName}/controller.go`,
      `domain/${moduleName}/service.go`,
      `domain/${moduleName}/dto.go`,
      `domain/${moduleName}/model/${moduleName}.go`,
      `domain/${moduleName}/README.md`,
      `doc/${moduleName}.md`,
      `test/${moduleName}_test.go`,
      `test/${moduleName}_integration_test.go`,
      `test/init_${db}_integration_test.go`,
    ]) {
      assert.equal(
        await fs.pathExists(path.join(projectDir, relativePath)),
        true,
        `missing ${relativePath}`,
      );
    }

    const crudService = await fs.readFile(
      path.join(projectDir, `domain/${moduleName}/service.go`),
      'utf8',
    );
    assert.match(crudService, /Like\("name", req\.Name\)/);
    assert.match(crudService, /Eq\("status", req\.Status\)/);
    assert.doesNotMatch(crudService, /req\.(Name|Status) == ""/);

    const integrationTest = await fs.readFile(
      path.join(projectDir, `test/${moduleName}_integration_test.go`),
      'utf8',
    );
    assert.match(integrationTest, /len\(list\) != 1 \|\| list\[0\]\.ID != id/);
    assert.match(integrationTest, /page\.Result\.\(\[\]\*/);
  }

  const serviceOnlyGenerated = spawnSync(
    process.execPath,
    [cliPath, 'create', 'invoice_mysql', '--crud', '--db', 'mysql', '--no-http'],
    { cwd: projectDir, env, encoding: 'utf8', timeout: 120_000 },
  );
  assert.equal(serviceOnlyGenerated.status, 0, `${serviceOnlyGenerated.stdout}\n${serviceOnlyGenerated.stderr}`);
  assert.equal(await fs.pathExists(path.join(projectDir, 'domain/invoice_mysql/service.go')), true);
  assert.equal(await fs.pathExists(path.join(projectDir, 'test/invoice_mysql_integration_test.go')), true);
  assert.equal(await fs.pathExists(path.join(projectDir, 'domain/invoice_mysql/router.go')), false);
  assert.equal(await fs.pathExists(path.join(projectDir, 'domain/invoice_mysql/controller.go')), false);
  assert.equal(await fs.pathExists(path.join(projectDir, 'doc/invoice_mysql.md')), false);

  const updatedDomainInit = await fs.readFile(path.join(projectDir, 'domain/init.go'), 'utf8');
  assert.match(updatedDomainInit, /example\.com\/phase1-app\/domain\/order_mysql/);
  assert.match(updatedDomainInit, /example\.com\/phase1-app\/domain\/order_mongo/);

  for (const relativePath of [
    '_bin/local.yaml',
    '_bin/dev.yaml',
    '_bin/prod.yaml',
    'test/_bin/local.yaml',
  ]) {
    const config = await fs.readFile(path.join(projectDir, relativePath), 'utf8');
    assert.match(config, /Mysql:\n  Main:/, `${relativePath} missing MySQL connection`);
    assert.match(config, /GORIG_MYSQL_MAIN_WRITE_PASS/, `${relativePath} missing MySQL guidance`);
    assert.match(config, /mongo:\n  main:/, `${relativePath} missing MongoDB connection`);
    assert.match(config, /GORIG_MONGO_MAIN_AUTH_PASSWORD/, `${relativePath} missing MongoDB guidance`);
    assert.equal((config.match(/^  Main:$/gm) || []).length, 1, `${relativePath} duplicated MySQL connection`);
  }

  for (const backend of ['mysql', 'mongo']) {
    const result = spawnSync('go', [
      'test', '-c', `-tags=integration,${backend}`,
      '-o', path.join(sandbox, `${backend}.test`),
      './test',
    ], {
      cwd: projectDir,
      env,
      encoding: 'utf8',
      timeout: 120_000,
    });
    assert.equal(result.status, 0, `integration ${backend} compile\n${result.stdout}\n${result.stderr}`);
  }

  for (const [command, args] of [
    ['go', ['fmt', './...']],
    ['go', ['vet', './...']],
    ['go', ['build', './...']],
    ['go', ['test', './...', '-v']],
  ]) {
    const result = spawnSync(command, args, {
      cwd: projectDir,
      env,
      encoding: 'utf8',
      timeout: 120_000,
    });
    assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  }
});
