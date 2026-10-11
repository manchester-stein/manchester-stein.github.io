import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const names = ['index', 'programme', 'registration', 'travel', 'privacy'];
const tempRoot = path.resolve(process.env.STEIN_TEST_TMP || os.tmpdir());
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(tempRoot, 'stein-build-test-'));
  for (const folder of ['scripts', 'partials']) fs.mkdirSync(path.join(dir, folder));
  for (const file of [...names.map(n => n + '.html'), 'scripts/build.mjs', 'partials/header.html', 'partials/footer.html']) {
    fs.copyFileSync(path.join(root, file), path.join(dir, file));
  }
  t.after(() => {
    // Delete only the unique temporary directory created by this test.
    assert.equal(path.dirname(dir), tempRoot);
    assert.ok(path.basename(dir).startsWith('stein-build-test-'));
    fs.rmSync(dir, { recursive: true });
  });
  return dir;
}
function build(dir, ...args) { return execFileSync(process.execPath, [path.join(dir, 'scripts/build.mjs'), ...args]); }
function outsideShared(text) {
  return text.replace(/(<!-- BEGIN SHARED (header|footer):[^>]*-->)[\s\S]*?(<!-- END SHARED \2 -->)/g, '$1$3');
}
test('shared changes preserve manual page bytes and build idempotently', t => {
  const dir = fixture(t);
  const travel = path.join(dir, 'travel.html');
  const sentinel = '<p>Manual spacing: <a href="example.html">linked text</a>  stays.</p>\r\n';
  fs.writeFileSync(travel, fs.readFileSync(travel, 'utf8').replace('</main>', sentinel + '</main>'));
  const before = Object.fromEntries(names.map(n => [n, outsideShared(fs.readFileSync(path.join(dir, n + '.html'), 'utf8'))]));
  const header = path.join(dir, 'partials/header.html');
  fs.writeFileSync(header, fs.readFileSync(header, 'utf8').replace('MANCHESTER 2027', 'UPDATED SHARED TITLE'));
  assert.equal(spawnSync(process.execPath, [path.join(dir, 'scripts/build.mjs'), '--check']).status, 1);
  build(dir);
  for (const name of names) {
    const file = path.join(dir, name + '.html');
    const text = fs.readFileSync(file, 'utf8');
    assert.equal(outsideShared(text), before[name]);
    assert.ok(text.includes('UPDATED SHARED TITLE'));
    assert.ok(text.includes(`href="${name}.html" aria-current="page"`));
    assert.equal((text.match(/aria-current="page"/g) || []).length, 1);
  }
  const built = names.map(n => fs.readFileSync(path.join(dir, n + '.html')));
  build(dir);
  build(dir, '--check');
  names.forEach((n,i) => assert.deepEqual(fs.readFileSync(path.join(dir,n+'.html')), built[i]));
});
test('invalid markers stop the build before any page is written', t => {
  const dir = fixture(t);
  const footer = path.join(dir, 'partials/footer.html');
  fs.writeFileSync(footer, fs.readFileSync(footer, 'utf8').replace('Robert Gaunt', 'Shared edit'));
  const file = path.join(dir, 'travel.html');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('<!-- END SHARED footer -->','<!-- missing marker -->'));
  const before = names.map(n => fs.readFileSync(path.join(dir,n+'.html')));
  const failed = spawnSync(process.execPath, [path.join(dir,'scripts/build.mjs')]);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr.toString(), /missing, duplicate or out-of-order footer markers/);
  names.forEach((n,i) => assert.deepEqual(fs.readFileSync(path.join(dir,n+'.html')), before[i]));
});
