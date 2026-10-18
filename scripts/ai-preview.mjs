// Yapay zekâ havuzunu yerelde dener: bir konu ve zorluk için soru yazdırır, doğrulatır ve sonucu yazdırır.
// Hiçbir şey kaydedilmez (bellek içi depo). Kullanım: node scripts/ai-preview.mjs history medium
// .env içinde GEMINI_API_KEY ve GROQ_API_KEY gerekir.
import { join, resolve } from 'node:path';
import { createMemoryStore } from '../lib/store.js';
import { createPool } from '../lib/ai/pool.js';
import { createLlm } from '../lib/ai/llm.js';
import { BUCKETS, refill } from '../lib/ai/refill.js';
import { mulberry32 } from '../lib/random.js';

try {
  process.loadEnvFile(join(resolve(import.meta.dirname, '..'), '.env'));
} catch {
  console.warn('No .env file found.');
}

const [topic = 'history', difficulty = 'medium'] = process.argv.slice(2);
const index = BUCKETS.findIndex((bucket) => bucket.topic === topic && bucket.difficulty === difficulty);
if (index === -1) throw new Error(`Unknown topic or difficulty: ${topic} ${difficulty}`);

const llm = createLlm();
if (!llm.configured) throw new Error('GEMINI_API_KEY and GROQ_API_KEY are needed in .env');
const store = createMemoryStore();
const pool = createPool(() => store);

// refill bir "gün" için kayan pencere seçer; tek havuzlu pencerede gün numarası havuzun sırasıdır
const [report] = await refill({ llm, pool, random: mulberry32(Date.now() % 0xffffffff), day: index, perRun: 1 });
console.log(report);
for (const item of await pool.list(topic, difficulty)) {
  console.log(`\n${item.q.tr}\n  ✓ ${item.options.tr[0]} · ✗ ${item.options.tr.slice(1).join(' · ')}\n  ${item.explain.tr}`);
  console.log(`${item.q.en}\n  ✓ ${item.options.en[0]} · ✗ ${item.options.en.slice(1).join(' · ')}`);
}
