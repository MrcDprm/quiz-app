// Geri bildirim penceresi. Mesaj portfolyodaki /api/feedback ucuna gider;
// orada doğrulanır, kaydedilir ve e-postayla bildirilir.
export const FEEDBACK_URL = 'https://www.miracdeprem.com/api/feedback';

const MIN_MESSAGE_LENGTH = 5;
const TIMEOUT_MS = 10000;

// Sunucunun hata kodlarını i18n anahtarlarına çevirir
const SERVER_ERRORS = {
  invalid_contact: 'feedbackBadContact',
  invalid_message: 'feedbackNeedMessage',
  rate_limited: 'feedbackTooMany',
  too_fast: 'feedbackTooMany',
};

// Tarayıcı tarafı ön kontrol: sorun yoksa null, varsa gösterilecek mesajın anahtarı
export function checkFeedback({ contact, message }) {
  if (!contact.trim()) return 'feedbackNeedContact';
  if (message.trim().length < MIN_MESSAGE_LENGTH) return 'feedbackNeedMessage';
  return null;
}

export function initFeedback(t) {
  const $ = (id) => document.getElementById(id);
  const dialog = $('fb-dialog');
  const form = $('fb-form');
  const status = $('fb-status');
  const submit = $('fb-submit');
  let openedAt = 0;

  $('fb-open').addEventListener('click', () => {
    openedAt = Date.now();
    status.textContent = '';
    dialog.showModal();
  });
  $('fb-close').addEventListener('click', () => dialog.close());

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = {
      name: $('fb-name').value.trim(),
      contact: $('fb-contact').value.trim(),
      message: $('fb-message').value.trim(),
      website: $('fb-website').value,
      timestamp: openedAt,
    };

    const problem = checkFeedback(data);
    if (problem) {
      status.textContent = t(problem);
      return;
    }

    submit.disabled = true;
    status.textContent = t('feedbackSending');
    try {
      const response = await fetch(FEEDBACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.success) {
        form.reset();
        status.textContent = t('feedbackThanks');
      } else {
        status.textContent = t(SERVER_ERRORS[result.error] ?? 'feedbackFailed');
      }
    } catch {
      status.textContent = t('feedbackFailed');
    } finally {
      submit.disabled = false;
    }
  });
}