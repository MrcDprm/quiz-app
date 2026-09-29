// Tema: sayfaya uygulama ve açık/koyu arasında geçiş.
// İlk boyamadan önceki uygulama theme-init.js'te; bu modül sayfa açıldıktan sonrasını yönetir.
const THEME_COLORS = { dark: '#0b0f15', light: '#dee4ec' };

/** Temayı <html data-theme="..."> ile uygular; tarayıcı çubuğunun rengini de (mobil) eşler. */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = THEME_COLORS[theme];
}

export function nextTheme(theme) {
  return theme === 'dark' ? 'light' : 'dark';
}