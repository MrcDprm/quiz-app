// Sayfa çizilmeden önce kayıtlı temayı uygular (açık temada koyu ekranın bir an yanıp sönmemesi için).
try {
  if (JSON.parse(localStorage.getItem('quiz-settings'))?.theme === 'light') {
    document.documentElement.dataset.theme = 'light';
  }
} catch {
  // Depolama kapalıysa varsayılan koyu tema kalır
}