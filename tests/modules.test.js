// Tarayıcı modüllerinin birbirinden içe aktardığı adların gerçekten var olduğunu denetler.
// main.js DOM'a dokunduğu için Node'da çalıştırılamaz; bu yüzden içe aktarmalar metin olarak okunur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const SRC = new URL('../public/src/', import.meta.url);
const IMPORT = /import\s*\{([^}]+)\}\s*from\s*'\.\/([\w-]+\.js)'/g;

test('every name imported between browser modules is exported', async () => {
  const files = (await readdir(SRC)).filter((name) => name.endsWith('.js'));
  for (const file of files) {
    const source = await readFile(new URL(file, SRC), 'utf8');
    for (const [, names, target] of source.matchAll(IMPORT)) {
      assert.ok(files.includes(target), `${file} imports missing file ${target}`);
      const module = await import(new URL(target, SRC));
      for (const name of names.split(',').map((item) => item.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
        assert.ok(name in module, `${file} imports ${name} from ${target}, but it is not exported`);
      }
    }
  }
});
