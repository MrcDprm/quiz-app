// Wikidata'dan soru üretmek için veri çeker ve data/generated/ altına yazar.
// Elle çalıştırılır: node scripts/fetch-data.mjs people
// Wikidata verisi CC0 lisanslıdır (kamu malı).
import { writeFile, mkdir } from 'node:fs/promises';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'QuizAppDataBot/1.0 (https://github.com/MrcDprm/quiz-app)';
const OUT_DIR = new URL('../data/generated/', import.meta.url);
const BATCH_SIZE = 50;
const RETRIES = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sparql(query) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ query }),
      signal: AbortSignal.timeout(90_000),
    });
    await sleep(1000); // Wikidata'ya nazik davran: istekler arasında bekle.
    if (response.ok) return (await response.json()).results.bindings;
    // 429 (çok istek) ve 5xx (zaman aşımı) geçici olabilir; biraz bekleyip yeniden dene.
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === RETRIES) throw new Error(`Wikidata responded with ${response.status}`);
    console.warn(`Wikidata ${response.status}, retrying (${attempt}/${RETRIES})`);
    await sleep(5000 * attempt);
  }
}

// Uzun kimlik listelerini parçalar hâlinde sorgular.
async function sparqlInBatches(ids, buildQuery) {
  const rows = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const values = ids.slice(i, i + BATCH_SIZE).map((id) => `wd:${id}`).join(' ');
    rows.push(...(await sparql(buildQuery(values))));
  }
  return rows;
}

const qid = (cell) => cell.value.split('/').pop();

// Sadece harf, rakam ve birkaç noktalama işareti; HTML ya da tuhaf karakter içeren etiket atılır.
const SAFE_LABEL = /^[\p{L}\p{M}\p{N} .,'’()\-&:!?]{1,60}$/u;
const cleanLabel = (cell) => {
  const text = cell?.value?.trim();
  return text && SAFE_LABEL.test(text) ? text : null;
};

// "1879-03-14T00:00:00Z" → 1879. Wikidata MÖ yıllarını astronomik sayar (0 = MÖ 1),
// bu yüzden "-0383" MÖ 384 demektir ve -384 olarak saklanır.
const yearOf = (cell) => {
  const match = cell?.value?.match(/^(-?\d{1,4})-/);
  if (!match) return null;
  const year = Number(match[1]);
  return year <= 0 ? year - 1 : year;
};

async function save(name, items) {
  await mkdir(OUT_DIR, { recursive: true });
  const data = { source: 'Wikidata', license: 'CC0-1.0', fetchedAt: new Date().toISOString().slice(0, 10), items };
  await writeFile(new URL(`${name}.json`, OUT_DIR), `${JSON.stringify(data, null, 1)}\n`);
  console.log(`${name}: ${items.length} items`);
}

// --- Kişiler -------------------------------------------------------------

// Meslek grupları ve her grubun Wikidata meslek kimlikleri.
const PEOPLE_GROUPS = {
  scientist: ['Q169470', 'Q593644', 'Q170790', 'Q864503', 'Q11063', 'Q205375'],
  writer: ['Q36180', 'Q49757', 'Q6625963', 'Q214917'],
  painter: ['Q1028181', 'Q1281618'],
  composer: ['Q36834'],
  singer: ['Q177220'],
  actor: ['Q33999', 'Q10800557'],
  director: ['Q2526255'],
  footballer: ['Q937857'],
  basketball: ['Q3665646'],
  tennis: ['Q10833314'],
  philosopher: ['Q4964182'],
  politician: ['Q82955'],
  explorer: ['Q11900058'],
  astronaut: ['Q11631'],
};
const PEOPLE_PER_GROUP = 70;
const MIN_SITELINKS = 60;

async function fetchPeople() {
  const candidates = new Map();
  for (const [group, occupations] of Object.entries(PEOPLE_GROUPS)) {
    const rows = await sparql(`
      SELECT ?item (MAX(?links) AS ?fame) WHERE {
        VALUES ?occupation { ${occupations.map((id) => `wd:${id}`).join(' ')} }
        ?item wdt:P106 ?occupation; wikibase:sitelinks ?links.
        FILTER(?links >= ${MIN_SITELINKS})
      } GROUP BY ?item ORDER BY DESC(?fame) LIMIT ${PEOPLE_PER_GROUP}`);
    for (const row of rows) candidates.set(qid(row.item), Number(row.fame.value));
    console.log(`people/${group}: ${rows.length}`);
  }

  // Ayrıntılar: iki dilde ad, doğum yılı ve kişinin sahip olduğu bütün meslekler.
  const allOccupations = Object.values(PEOPLE_GROUPS).flat().map((id) => `wd:${id}`).join(' ');
  const rows = await sparqlInBatches([...candidates.keys()], (values) => `
    SELECT ?item ?en ?tr (MIN(?birth) AS ?born) (GROUP_CONCAT(DISTINCT ?occupation) AS ?jobs) WHERE {
      VALUES ?item { ${values} }
      VALUES ?occupation { ${allOccupations} }
      ?item wdt:P31 wd:Q5; wdt:P569 ?birth; wdt:P106 ?occupation;
            rdfs:label ?en; rdfs:label ?tr.
      FILTER(lang(?en) = 'en' && lang(?tr) = 'tr')
    } GROUP BY ?item ?en ?tr`);

  const groupOf = new Map(Object.entries(PEOPLE_GROUPS).flatMap(([group, ids]) => ids.map((id) => [id, group])));
  const people = [];
  for (const row of rows) {
    const id = qid(row.item);
    const name = { tr: cleanLabel(row.tr), en: cleanLabel(row.en) };
    const born = yearOf(row.born);
    if (!name.tr || !name.en || born === null || born > 2015) continue;
    const groups = [...new Set(row.jobs.value.split(' ').map((uri) => groupOf.get(uri.split('/').pop())))];
    people.push({ id, name, born, groups, fame: candidates.get(id) });
  }
  people.sort((a, b) => b.fame - a.fame);
  await save('people', people);
}

const DATASETS = { people: fetchPeople };

const names = process.argv.slice(2);
for (const name of names.length ? names : Object.keys(DATASETS)) {
  if (!DATASETS[name]) throw new Error(`Unknown dataset: ${name}`);
  await DATASETS[name]();
}