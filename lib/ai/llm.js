// Model sağlayıcıları: Gemini (soru yazar) ve Groq (doğrular), düz fetch ile (ek paket yok).
// Bir model kota dolu / kapalı / bozuk çıktı verirse zincirdeki sıradakine geçilir.
// Doğrulayan model, soruyu yazan modelle asla aynı olmaz.

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GENERATORS = 'gemini:gemini-3.8-flash,gemini:gemini-3.5-flash,gemini:gemini-3.1-flash-lite';
const DEFAULT_VERIFIERS = 'groq:openai/gpt-oss-120b,groq:qwen/qwen3.8-27b,gemini:gemini-3.1-flash-lite';
const TIMEOUT_MS = 60_000;

export class LlmError extends Error {
  constructor(code) {
    super(code);
    this.code = code; // quota | unavailable | bad_output
  }
}

/** "gemini:gemini-2.5-flash,groq:…" → [{ provider, model }]; anahtarı olmayan sağlayıcı atlanır. */
export function parseChain(value, keys) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [provider, ...rest] = item.split(':');
      return { provider, model: rest.join(':') };
    })
    .filter(({ provider, model }) => model && keys[provider]);
}

/** Model metnindeki ilk JSON nesnesini okur (bazı modeller başına/sonuna açıklama ekleyebilir). */
export function parseJsonText(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function post(fetchFn, url, headers, body) {
  let response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new LlmError('unavailable');
  }
  if (response.status === 429) throw new LlmError('quota');
  if (!response.ok) throw new LlmError('unavailable');
  return response.json().catch(() => {
    throw new LlmError('bad_output');
  });
}

async function callGemini(fetchFn, key, model, { system, prompt, schema, temperature }) {
  const data = await post(fetchFn, `${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': key }, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      responseMimeType: 'application/json',
      ...(schema && { responseSchema: schema }),
    },
  });
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parseJsonText(parts.filter((part) => !part.thought).map((part) => part.text ?? '').join(''));
}

async function callGroq(fetchFn, key, model, { system, prompt, temperature }) {
  // Akıl yürüten modellerde doğrulama için orta düzey düşünme yeterli
  const reasoning = model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'medium' } : model.startsWith('qwen/') ? { reasoning_effort: 'default' } : {};
  const data = await post(fetchFn, GROQ_URL, { Authorization: `Bearer ${key}` }, {
    model,
    temperature,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    ...reasoning,
  });
  return parseJsonText(data?.choices?.[0]?.message?.content);
}

/**
 * env: GEMINI_API_KEY, GROQ_API_KEY ve isteğe bağlı AI_GENERATORS / AI_VERIFIERS zincirleri.
 * generate/verify: { system, prompt, schema? } alır, { model, data } döndürür; hepsi başarısızsa LlmError.
 */
export function createLlm(env = process.env, fetchFn = fetch) {
  const keys = { gemini: env.GEMINI_API_KEY?.trim(), groq: env.GROQ_API_KEY?.trim() };
  const generators = parseChain(env.AI_GENERATORS ?? DEFAULT_GENERATORS, keys);
  const verifiers = parseChain(env.AI_VERIFIERS ?? DEFAULT_VERIFIERS, keys);

  async function run(chain, request, exclude) {
    let last = new LlmError('unavailable');
    for (const { provider, model } of chain) {
      if (model === exclude) continue;
      try {
        const call = provider === 'gemini' ? callGemini : callGroq;
        const data = await call(fetchFn, keys[provider], model, request);
        if (!data) throw new LlmError('bad_output');
        return { model, data };
      } catch (error) {
        last = error instanceof LlmError ? error : new LlmError('unavailable');
        // Sadece model adı ve hata kodu loglanır
        console.warn(`ai: ${model} skipped (${last.code})`);
      }
    }
    throw last;
  }

  return {
    configured: generators.length > 0 && verifiers.length > 0,
    generate: (request) => run(generators, { temperature: 0.9, ...request }),
    verify: (request, generatorModel) => run(verifiers, { temperature: 0, ...request }, generatorModel),
  };
}
