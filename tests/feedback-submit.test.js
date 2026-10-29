// Gönder butonu istek sürerken odağı kaybetmemeli ve form iki kez gönderilmemeli.
// Node'da DOM yok; initFeedback'in kullandığı birkaç öğe küçük sahte nesnelerle kuruluyor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initFeedback } from '../public/src/feedback.js';

function fakePage() {
  const handlers = {};
  const attrs = {};
  const el = (id, extra = {}) => ({
    id,
    value: '',
    textContent: '',
    addEventListener: (type, fn) => { handlers[`${id}:${type}`] = fn; },
    ...extra,
  });
  const elements = {
    'fb-dialog': el('fb-dialog', { showModal() {}, close() {} }),
    'fb-form': el('fb-form', { reset() {} }),
    'fb-status': el('fb-status'),
    'fb-submit': el('fb-submit', {
      disabled: false,
      setAttribute: (name, value) => { attrs[name] = value; },
      removeAttribute: (name) => { delete attrs[name]; },
    }),
    'fb-open': el('fb-open'),
    'fb-close': el('fb-close'),
    'fb-name': el('fb-name'),
    'fb-contact': el('fb-contact', { value: 'a@b.co' }),
    'fb-message': el('fb-message', { value: 'Harika bir oyun' }),
    'fb-website': el('fb-website'),
  };
  globalThis.document = { getElementById: (id) => elements[id] };
  const submit = () => handlers['fb-form:submit']({ preventDefault() {} });
  return { submit, button: elements['fb-submit'], attrs };
}

test('the submit button stays focusable and the form is sent once while a request runs', async () => {
  const page = fakePage();
  let calls = 0;
  let finish;
  globalThis.fetch = () => {
    calls += 1;
    return new Promise((resolve) => { finish = () => resolve({ ok: true, json: async () => ({ success: true }) }); });
  };
  initFeedback((key) => key);

  const first = page.submit();
  assert.equal(page.attrs['aria-disabled'], 'true');
  assert.equal(page.button.disabled, false, 'disabled would drop keyboard focus to <body>');

  await page.submit(); // Enter again while sending
  assert.equal(calls, 1);

  finish();
  await first;
  assert.equal(page.attrs['aria-disabled'], undefined);

  const second = page.submit();
  finish();
  await second;
  assert.equal(calls, 2);
});
