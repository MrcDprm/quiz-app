// Geri bildirim formunun tarayıcı tarafı ön kontrolü. Asıl doğrulama portfolyodaki /api/feedback ucunda yapılır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFeedback, FEEDBACK_URL } from '../public/src/feedback.js';

test('contact is required', () => {
  assert.equal(checkFeedback({ contact: '   ', message: 'Harika bir oyun' }), 'feedbackNeedContact');
});

test('message needs at least 5 characters', () => {
  assert.equal(checkFeedback({ contact: 'a@b.co', message: ' hi ' }), 'feedbackNeedMessage');
});

test('email or phone with a message passes', () => {
  assert.equal(checkFeedback({ contact: 'a@b.co', message: 'Harika bir oyun' }), null);
  assert.equal(checkFeedback({ contact: '+90 532 111 22 33', message: 'Soru 3 hatalı' }), null);
});

test('feedback goes to the portfolio over https', () => {
  assert.equal(FEEDBACK_URL, 'https://www.miracdeprem.com/api/feedback');
});
