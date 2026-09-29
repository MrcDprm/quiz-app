// Sunucuya istek gönderir. Ağ hatası, zaman aşımı ve bozuk yanıt sade bir hata koduna çevrilir;
// arayüz sadece { data } ya da { error } görür, hiçbir zaman istisna yakalamak zorunda kalmaz.
const TIMEOUT_MS = 10_000;
const KNOWN_ERRORS = ['no_questions', 'rate_limited', 'invalid_token', 'already_used'];

export async function post(path, body) {
  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.error(error);
    return { error: 'generic' };
  }

  const data = await response.json().catch(() => null);
  if (response.ok && data && typeof data === 'object') return { data };
  return { error: KNOWN_ERRORS.includes(data?.error) ? data.error : 'generic' };
}