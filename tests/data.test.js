// Gerçek soru dosyalarını kontrol eder: her soru geçerli, kimlikler tekil ve doğru dosyada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREAS } from '../public/src/topics.js';
import { readTopicFile } from '../lib/catalog.js';
import { isValidQuestion } from '../lib/questions.js';

const TOPICS = Object.values(AREAS).flatMap((area) => area.topics);

for (const topic of TOPICS) {
  test(`data/bank/${topic}.json is valid`, async () => {
    const { questions } = await readTopicFile(topic);
    const ids = new Set();
    for (const raw of questions) {
      assert.ok(isValidQuestion(raw), `invalid question: ${raw?.id}`);
      assert.ok(raw.id.startsWith(`${topic}:`), `wrong file: ${raw.id}`);
      assert.ok(raw.id.split(':')[1] === raw.level, `id and level differ: ${raw.id}`);
      assert.ok(!ids.has(raw.id), `duplicate id: ${raw.id}`);
      ids.add(raw.id);
    }
  });
}