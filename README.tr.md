# Bilgi Yarışması (Quiz App)

[English](README.md) | **Türkçe**

Bilgini ara ara test edebileceğin bir yarışma platformu:
- İlkokuldan yüksek lisansa kadar seviyene uygun sorular.
- Yazılım alanı.
- Herkese aynı gelen günün sorusu.
- Gerçek veriden üretilen binlerce soru.

Cevaplar, sen cevaplamadan önce tarayıcıya hiç gelmez. Bu yüzden geliştirici araçlarını açarak hile yapılamaz.

**Canlı demo:** [quiz.miracdeprem.com](https://quiz.miracdeprem.com)

![Cevaplandıktan sonra açıklamasıyla bir JavaScript kod sorusu](docs/screenshot-code.png)

## Özellikler

- **Her alanda beş seviye:** İlkokul, Ortaokul, Lise, Üniversite ve Yüksek Lisans.
  - **Genel konular:** Matematik, Fen Bilimleri, Tarih, Coğrafya, Edebiyat ve Sanat, Genel Kültür ya da hepsi karışık.
  - **Yazılım:** Konular seviye seviye açılır.
    - İlkokulda Kodlamaya Giriş.
    - Ortaokulda Algoritmalar, HTML ve CSS ile Python eklenir.
    - Lisede (meslek liseleri dahil) JavaScript, SQL, Git, Web Güvenliği ve C# eklenir.
- **İki kaynaktan sorular:**
  - **Elle yazılmış 796 soruluk banka:** Türkçe ve İngilizce, her birinde kısa bir açıklama var. "Bu kod ne yazdırır?" sorularının hepsi, kod gerçekten Python, Node.js ya da .NET ile çalıştırılarak doğrulandı.
  - **Gerçek veriden üretilen sorular:** Şablonlar kişilerden (Wikidata), 129 ülkeden, ünlü eserlerden ve kimyasal elementlerden yeni sorular kurar. Matematik soruları her seferinde yeni sayılarla gelir.
- **Dört soru tipi:**
  - Çoktan seçmeli.
  - Bayrak sorusu.
  - Kronolojik sıralama: sürükle-bırak ya da ↑/↓ düğmeleriyle.
  - "Bu kod ne yazdırır?"
- **10 soruluk turlar:**
  - Süre ve hız bonusu.
  - İki joker: 50:50 ve +10 saniye.
  - Her sorudan sonra doğru cevap ve açıklama; turun sonunda bütün soruların özeti.
- **Her konu ve seviyenin kendi adresi:** örneğin [/matematik/ortaokul](https://quiz.miracdeprem.com/matematik/ortaokul) ya da [/python/lise](https://quiz.miracdeprem.com/python/lise) yarışmayı o seçimle açar; Türkçe ya da İngilizce (`?lang=en`).
- **Tekrar yok:** Bir konuda gördüğün sorular, havuz bitene kadar tekrar sorulmaz.
- **Günün sorusu:** Herkese aynı soru, günde bir deneme. Sonuç WhatsApp, X, LinkedIn, Telegram, Facebook ya da Instagram'da paylaşılabilir veya kopyalanabilir.
- **İlerleme** (hepsi kendi tarayıcında saklanır):
  - Günlük seri.
  - Başarı istatistikleri ve konu-seviye başına en iyi puan.
  - 11 rozet.
  - Yanlış yaptığın soruları doğru cevaplayana kadar tekrar soran **"Hatalarım"** turu.
- **Türkçe ve İngilizce**, [portfolyo sitemle](https://www.miracdeprem.com) uyumlu koyu ve açık tema.
- **Erişilebilir:**
  - Cevap için 1-4 tuşları, devam için Enter.
  - Ekran okuyucu duyuruları.
  - "Hareketi azalt" ayarına uyar.
- **Geri bildirim:** Küçük bir düğme; ad (isteğe bağlı), e-posta ya da telefon ve mesaj içeren formu açar. Mesaj portfolyo sitem üzerinden doğrudan bana ulaşır.

## Hile nasıl önleniyor

Yarışmanın tamamı sunucuda (Vercel Functions) çalışıyor.

| Ne | Nasıl |
|---|---|
| Cevaplar | Soru bankası, yayınlanmayan bir klasörde duruyor. Tarayıcıya her seferinde tek soru, cevabı olmadan gidiyor. |
| Tur durumu | **AES-256-GCM** ile şifrelenmiş bir jetonda tutuluyor. Tarayıcı jetonu saklıyor ama ne okuyabiliyor ne değiştirebiliyor. |
| Jetonu tekrar kullanmak | Her jeton **bir kez** kullanılabiliyor; kullanılanları Upstash Redis hatırlıyor. "Sahte cevap gönder, doğruyu öğren, sonra doğruyu seç" hilesi çalışmıyor. |
| Süre ve puan | Sunucuda ölçülüp hesaplanıyor. Tarayıcıdaki süre çubuğu sadece gösterim. |
| Bayrak resimleri | Sorunun içinde data URL olarak gidiyor; içlerindeki ülke kodları temizlendi. Dosya adı cevabı ele veremiyor. |
| Kötüye kullanım | IP başına dakikada 120 istek sınırı, her alanın sunucuda doğrulanması, aynı kaynak kontrolü ve genel hata mesajları. |

**Bilinen sınırlar:** Hesap sistemi olmadığı için bazı şeyler zorlanamıyor:
- Günün sorusundaki "günde bir deneme" tarayıcı başına geçerli.
- Seri ve istatistikler tarayıcının yerel deposunda duruyor.
- Repo herkese açık olduğu için soru bankası GitHub'da okunabiliyor.

## Ekran Görüntüleri

| Ana sayfa: günün sorusu, seri, rozetler | Sıralama sorusu (Türkçe, açık tema) | Telefonda bayrak sorusu |
|---|---|---|
| ![Günün sorusu, ilerleme ve rozetlerle ana sayfa](docs/screenshot-home.png) | ![Kronolojik sıralama sorusu](docs/screenshot-order.png) | ![Telefonda bayrak sorusu](docs/screenshot-flag-mobile.png) |

![Puan, sonuç ızgarası ve soru özetiyle sonuç ekranı](docs/screenshot-result.png)

## Kullanılan Teknolojiler

- HTML, CSS, JavaScript (ES modülleri, framework yok, derleme adımı yok)
- API için Vercel Functions (Node.js); Upstash Redis (REST API'si üzerinden, SDK'sız)
- AES-256-GCM jetonları ve güvenli rastgele sayılar için `node:crypto`
- `node --test`: 142 birim testi
- **Hiç npm bağımlılığı yok**

## Kurulum ve Çalıştırma

[quiz.miracdeprem.com](https://quiz.miracdeprem.com) adresinden çevrim içi oynayabilir ya da kendi bilgisayarında çalıştırabilirsin (Node.js 20.12 veya üstü).

1. Depoyu indir:
   ```bash
   git clone https://github.com/MrcDprm/quiz-app.git
   cd quiz-app
   ```
2. `.env` dosyasını oluştur. `.env.example`'ı kopyala ve `QUIZ_TOKEN_KEY` alanına rastgele bir anahtar yaz:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
   Redis yerine bellek içi depo kullanmak için `QUIZ_DEV=1` satırını bırak.
3. Yerel sunucuyu başlat:
   ```bash
   npm run dev
   ```
4. `http://localhost:5173` adresini aç. Geliştirme sunucusu `public/` klasörünü sunar ve Vercel'deki API fonksiyonlarının aynısını çalıştırır.

Testleri çalıştırmak için:
```bash
npm test
```

### Proje yapısı

```
public/                 Yayınlanan tek klasör: sayfa, stiller, tarayıcı modülleri
  src/main.js           Ekranlar, süre, cevaplar, sonuç
  src/progress.js       İstatistik, Hatalarım listesi, görülen sorular, rozetler
  src/storage.js        localStorage'daki ayarlar; her okumada doğrulanır
api/                    Vercel Functions: round, daily, review, answer, joker ve her adresi kendi başlığıyla sunan page
lib/
  quiz.js               Tur kuralları: süre, puan, jokerler
  token.js              AES-256-GCM tur jetonları
  store.js              Tek kullanımlık jeton ve rate limit (Upstash REST ya da bellek)
  http.js               Doğrulama, kaynak kontrolü, rate limit, genel hata mesajları
  catalog.js            Bankayı yükler, banka ve üretilmiş soruları karıştırır, görülenleri atlar
  generators.js         Şablon motoru; templates/ içinde kişi, ülke, eser, element, matematik şablonları
data/                   Soru bankası, üreteç verileri, bayraklar ve sayfa şablonu app.html (yayınlanmaz)
scripts/                Yerel sunucu ve Wikidata veri betiği
tests/                  Birim testleri
```

## Öğrendiklerim

- **Tarayıcıya asla güvenmemek.** İlk planım soruları cevaplarıyla birlikte göndermekti. Sonra herkesin ağ sekmesini açıp cevapları okuyabileceğini fark ettim. Kuralları, süreyi ve puanı sunucuya taşıdım; tarayıcı artık sadece o anki soruyu gösteriyor. Şıkları karıştıran rastgele tohum bile gizli kalıyor, çünkü tohum ve açık kaynak kodla cevap hesaplanabilirdi.
- **Şifreli jetonla durumsuz sunucu.** Her turu bir veritabanında tutmak yerine tur durumunu AES-256-GCM ile şifreleyip tarayıcıya verdim. GCM hem veriyi gizliyor hem de en küçük değişikliği fark ediyor. Aynı jetonun iki kez kullanılmaması için kimliğini Redis'e `SET ... NX` ile bir kez yazıyorum; bu komut atomik çalışıyor.
- **Tohumlu rastgelelik.** Küçük bir tohumlu üreteçle (mulberry32) aynı tohum hep aynı karıştırmayı veriyor. Bu, testleri tekrarlanabilir yaptı ve günün sorusunu bedavaya getirdi: tarih tohum oluyor, böylece hiçbir yerde saklamadan herkes aynı soruyu görüyor.
- **Veriden soru üretmek.** SPARQL ile Wikidata'dan tanınmış kişileri çeken bir betik yazdım. Üretilen soruların adil olmasını da öğrendim: yanlış şıklar aynı türden seçiliyor, iki şıkkın birden doğru olabileceği sorular hiç sorulmuyor.
- **Yazdığımı test etmek.** Her kod sorusu bankaya girmeden önce gerçekten çalıştırıldı; bu, kendi yaptığım birkaç hatayı yakaladı. Tarayıcı modüllerinin içe aktarmalarını denetleyen bir test de boş commit'lediğim bir dosyayı yakaladı.
- **Pointer Events.** Sürükle-bırakta tek bir olay kümesi fareyi, dokunmatik ekranı ve kalemi birlikte yönetiyor. Klavye ve ekran okuyucu kullananlar için ↑/↓ düğmeleri de kaldı.
- **Bağımlılıksız geliştirmek.** Tek dış hizmet Redis; onu da REST API'si üzerinden `fetch` ile çağırıyorum. Kurulacak paket yok, güncellenmesi gereken açıklı bir paket de yok.

## Kaynaklar

- Kişi verileri: [Wikidata](https://www.wikidata.org) (CC0).
- Bayraklar: Panayiotis Lipiridis'in [flag-icons](https://github.com/lipis/flag-icons) paketi (MIT). Lisans metni `data/flags/LICENSE` dosyasında.

## Gelecek Planları

- Hesap sistemi: seri ve istatistiklerin cihazlar arasında taşınması ve günün sorusu için liderlik tablosu.
- Yazdığın herhangi bir konuda yapay zekâyla üretilen turlar.
- Yazılım dışında yeni uzmanlık alanları.
- Paylaşım için doğrulanabilir sonuç linkleri.

## Lisans

[MIT](LICENSE)
