// Tohumlu rastgele sayılar ve karıştırma yardımcıları.
// Aynı tohum her zaman aynı diziyi verir: testler ve günün sorusu buna dayanır.

// mulberry32: küçük ve hızlı 32 bitlik bir üreteç.
// Math.random tohum almadığı için kendi üretecimizi kullanıyoruz.
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a: bir metni (ör. "2026-09-29") 32 bitlik bir tohuma çevirir.
export function hashString(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// min ve max dahil rastgele tam sayı.
export function randomInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

// Fisher-Yates: her sıralama eşit olasılıklı. Orijinal diziye dokunmaz.
export function shuffle(random, list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Listeden tekrarsız count eleman seçer.
export function sample(random, list, count) {
  return shuffle(random, list).slice(0, count);
}