// Yapay zekâ havuzunun konuları ve modellere giden talimatlar.
// Talimatlar İngilizce (modeller en tutarlı orada çalışıyor); sorular Türkçe ve İngilizce üretilir.

// Matematik dışarıda: sayısal sorular şablonlarla her seferinde doğru üretiliyor. "Karışık" seçim kendi havuzunu kullanmaz.
export const AI_TOPICS = [
  'history', 'geography', 'science', 'literature', 'sport', 'film-music', 'general',
  'basics', 'algorithms', 'html-css', 'python', 'javascript', 'sql', 'git', 'security', 'csharp',
];

// Her çağrıda rastgele bir alt konu verilir; havuz tek bir dar alana yığılmasın.
export const SUBTOPICS = {
  history: ['Ancient civilisations', 'The Ottoman Empire', 'The Republic of Türkiye', 'Medieval Europe', 'The World Wars', 'The Cold War', 'Asian history', 'Revolutions and independence movements', 'Seljuks and early Turkic states'],
  geography: ['Capitals and cities', 'Rivers, lakes and seas', 'Mountains and landforms', 'Climate and biomes', 'Geography of Türkiye', 'Countries and borders', 'Islands and straits', 'Population and economy'],
  science: ['Human body and health', 'Physics in daily life', 'Chemistry basics', 'Space and astronomy', 'Animals and plants', 'Earth science', 'Famous scientists and discoveries', 'Energy and electricity'],
  literature: ['Turkish literature', 'World classics', 'Poetry', 'Painting and painters', 'Architecture', 'Mythology', 'Literary terms', 'Theatre and opera'],
  sport: ['Football', 'Basketball', 'Tennis', 'Olympic sports', 'Turkish sport history', 'Formula 1 and motor sports', 'Rules of popular sports', 'Athletics and swimming'],
  'film-music': ['Classic cinema', 'Turkish cinema', 'Animated films', 'Film awards and festivals', 'Classical music', 'Turkish music', 'Pop and rock music', 'Musical instruments'],
  general: ['Inventions and everyday objects', 'Languages and alphabets', 'Food and cuisine', 'World landmarks', 'Flags and symbols', 'Economy and money', 'Famous companies and brands', 'Records and superlatives that do not change'],
  basics: ['Variables and data types', 'Conditions and loops', 'Algorithms in daily life', 'Binary and number systems', 'How computers work', 'Debugging'],
  algorithms: ['Sorting algorithms', 'Searching', 'Big-O complexity', 'Recursion', 'Graphs and trees', 'Data structures'],
  'html-css': ['HTML elements and semantics', 'CSS selectors and specificity', 'Flexbox and Grid', 'Responsive design', 'Accessibility', 'Forms'],
  python: ['Built-in types', 'Functions and scope', 'Lists, dicts and comprehensions', 'Standard library', 'Errors and exceptions', 'Classes'],
  javascript: ['Types and coercion', 'Scope and closures', 'Arrays and objects', 'Asynchronous code and promises', 'The DOM', 'Modern syntax (ES2015+)'],
  sql: ['SELECT and filtering', 'JOINs', 'Aggregation and GROUP BY', 'Keys and constraints', 'Indexes and performance', 'Transactions'],
  git: ['Basic commands', 'Branches and merging', 'Remotes and collaboration', 'Undoing changes', 'History and logs', 'Ignoring files'],
  security: ['XSS', 'SQL injection', 'Passwords and hashing', 'HTTPS and TLS', 'Authentication and sessions', 'CORS and CSRF'],
  csharp: ['Types and variables', 'Classes and interfaces', 'Collections and LINQ', 'Exceptions', 'async and await', '.NET basics'],
};

const TOPIC_NAMES = {
  history: 'History (world and Turkish history)',
  geography: 'Geography',
  science: 'Science (physics, chemistry, biology, astronomy)',
  literature: 'Literature and the arts',
  sport: 'Sport',
  'film-music': 'Film and music',
  general: 'General knowledge',
  basics: 'Introduction to programming',
  algorithms: 'Algorithms and data structures',
  'html-css': 'HTML and CSS',
  python: 'Python',
  javascript: 'JavaScript',
  sql: 'SQL',
  git: 'Git',
  security: 'Web security',
  csharp: 'C#',
};

const DIFFICULTY_GUIDE = {
  easy: 'EASY: facts most adults or middle-school students know; famous names, places and events.',
  medium: 'MEDIUM: needs solid general culture or a keen interest; high-school level.',
  hard: 'HARD: specialist knowledge for enthusiasts or university students, but still a clear, checkable fact.',
};

export const GENERATION_SYSTEM = `You write multiple-choice quiz questions for a free Turkish and English quiz website.
Rules for every question:
- Exactly one correct answer and three wrong options. The wrong options must be clearly wrong, of the same kind and similar length as the correct one.
- Only facts that are well established, undisputed and will not change: nothing about "current", "latest", "today", living records, ongoing events or anything after 2023. Every statement in the question and the explanation must be accurate; leave out disputed claims (for example who "founded" something when historians disagree).
- No "all of the above", "none of the above", "which is NOT", trick wording or opinions.
- The question must not contain or hint at the answer.
- Write natural, correct Turkish with proper Turkish letters (ç, ğ, ı, İ, ö, ş, ü), not a word-for-word translation, and natural English. Both versions ask the same thing and have the same options in the same order. Use the usual Turkish names of people and places (for example "Fatih Sultan Mehmet", "Büyük İskender", "Londra").
- Programming questions are about concepts and behaviour; do not include code longer than one short expression.
- The explanation is one or two short sentences giving the key fact.
- Plain text only: no Markdown, HTML, emojis or line breaks.`;

export function generationPrompt({ topic, difficulty, subtopic, count, avoid }) {
  const avoidList = avoid.length ? `\nDo not repeat or closely paraphrase these existing questions:\n${avoid.map((text) => `- ${text}`).join('\n')}` : '';
  return `Write ${count} different questions.
Category: ${TOPIC_NAMES[topic]}. Focus: ${subtopic}.
Difficulty: ${DIFFICULTY_GUIDE[difficulty]}${avoidList}`;
}

// Gemini'nin yapılandırılmış çıktı şeması (OpenAPI alt kümesi).
const TEXT = { type: 'STRING' };
const TRIPLE = { type: 'ARRAY', items: TEXT, minItems: 3, maxItems: 3 };
export const GENERATION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question_tr: TEXT,
          question_en: TEXT,
          correct_tr: TEXT,
          correct_en: TEXT,
          wrong_tr: TRIPLE,
          wrong_en: TRIPLE,
          explanation_tr: TEXT,
          explanation_en: TEXT,
        },
        required: ['question_tr', 'question_en', 'correct_tr', 'correct_en', 'wrong_tr', 'wrong_en', 'explanation_tr', 'explanation_en'],
      },
    },
  },
  required: ['questions'],
};

export const VERIFY_SYSTEM = `You are a strict fact-checker for quiz questions. Each question is given in English and Turkish with options A-D in the same order.
For each question, answer it yourself and judge it. Reply with JSON only:
{"results":[{"index":0,"answer":"A","single_correct":true,"accurate":true,"languages_match":true,"turkish_ok":true,"stable_fact":true,"note":"short reason"}]}
- answer: the letter of the correct option, or "none" if no option is correct.
- single_correct: false if more than one option could be argued to be correct or the question is ambiguous.
- accurate: false if any statement in the question or its wording is wrong, disputed among experts, or misleading.
- languages_match: false if the English and Turkish versions ask different things or the options differ in meaning.
- turkish_ok: false if the Turkish is unnatural, misspelled, grammatically wrong, or written without Turkish letters (for example "yilinda" instead of "yılında").
- stable_fact: false if the answer depends on the current date or could change.
When in doubt, mark the question as failing: a rejected good question costs nothing, a wrong question reaches players.`;

const LETTERS = ['A', 'B', 'C', 'D'];

/** items: [{ q, options (shown order) }] — her soru iki dilde, şıklar harfli. */
export function verifyPrompt(items) {
  return items
    .map(({ q, options }, index) => {
      const lines = LETTERS.map((letter, i) => `${letter}) ${options.en[i]} / ${options.tr[i]}`);
      return `Question ${index}:\nEN: ${q.en}\nTR: ${q.tr}\n${lines.join('\n')}`;
    })
    .join('\n\n');
}

export const letterOf = (index) => LETTERS[index];
