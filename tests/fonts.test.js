// Yazı tipi paketlerinde "ı" (U+0131) Latin dosyasında durur, ek dosyada yoktur. Ek dosyaya yönlendirilirse
// tarayıcı harfi bulamaz ve sistem yazı tipine düşer: "kazandı" kelimesinde tek harf başka yazı tipiyle çizilir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const DOTLESS_I = 0x131;
const covers = (range, code) => range.split(',').some((part) => {
  const [low, high = low] = part.trim().replace('U+', '').split('-');
  return code >= parseInt(low, 16) && code <= parseInt(high, 16);
});

test('every font face sends the dotless i to the file that really has it', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  const faces = css.match(/@font-face\s*\{[^}]*\}/g);
  assert.ok(faces.length >= 2);
  for (const face of faces) {
    const file = face.match(/url\('([^']+)'\)/)[1];
    const range = face.match(/unicode-range:\s*([^;]+);/)[1];
    assert.equal(covers(range, DOTLESS_I), !file.includes('latin-ext'), file);
  }
});
