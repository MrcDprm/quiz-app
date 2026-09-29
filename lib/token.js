// Tur durumunu şifreli ve değiştirilemez bir jetona çevirir (AES-256-GCM).
// Jeton tarayıcıda durur ama içi okunamaz; tek bir bayt değişirse açılmaz.
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_TOKEN_LENGTH = 16_384;
export const TOKEN_TTL_MS = 60 * 60 * 1000;

// Anahtar ortam değişkeninden base64 olarak gelir ve tam 32 bayt olmalı.
export function parseKey(base64) {
  const key = Buffer.from(base64 ?? '', 'base64');
  if (key.length !== 32) {
    throw new Error('QUIZ_TOKEN_KEY must be 32 bytes encoded as base64');
  }
  return key;
}

// Jeton biçimi: "v1.<base64url(iv + tag + şifreli metin)>"
export function seal(data, key, now) {
  const body = JSON.stringify({ jti: randomUUID(), exp: now + TOKEN_TTL_MS, data });
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(body, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}.${Buffer.concat([iv, tag, encrypted]).toString('base64url')}`;
}

// { jti, data } döner; bozuk, değiştirilmiş ya da süresi dolmuş jetonda null.
export function open(token, key, now) {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) return null;
  const [version, body, extra] = token.split('.');
  if (version !== VERSION || !body || extra !== undefined) return null;

  const raw = Buffer.from(body, 'base64url');
  if (raw.length <= IV_BYTES + TAG_BYTES) return null;

  try {
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(tag);
    const text = Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');

    const { jti, exp, data } = JSON.parse(text);
    if (typeof jti !== 'string' || typeof exp !== 'number' || now > exp) return null;
    return { jti, data };
  } catch {
    return null;
  }
}