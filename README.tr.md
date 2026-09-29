# Bilgi Yarışması (Quiz App)

[English](README.md) | **Türkçe**

Bilgini arada bir test edebileceğin bir yarışma platformu:
- Eğitim seviyesine göre zorluk
- Yazılım konuları
- Herkese aynı gelen günün sorusu
- Gerçek veriden anlık üretilen sorular

Cevaplar sunucuda kalır, bu yüzden tarayıcıdan bakılarak hile yapılamaz.

> Geliştirme sürüyor. Aşağıdaki plan, proje v1.0'a ulaştığında tam README'ye dönüşecek.

## Özellikler (plan)

**Sorular**
- [ ] Genel konular (Matematik, Fen, Tarih, Coğrafya, Edebiyat ve Sanat, Genel Kültür), 5 seviyede: İlkokul, Ortaokul, Lise, Üniversite, Yüksek Lisans
- [ ] Yazılım alanı, aynı beş seviyeyle: ilkokulda Kodlamaya Giriş; ortaokulda Algoritmalar, HTML ve CSS, Python; lisede (meslek liseleri dahil) JavaScript, SQL, Git, Web Güvenliği ve C# da açılır
- [ ] Wikidata'dan alınan gerçek verilerle (kişiler, ülkeler, kitaplar ve filmler, elementler) şablonlardan anlık üretilen sorular; matematik soruları da üreteçle hazırlanır
- [ ] Soru tipleri:
  - Çoktan seçmeli
  - Bayrak sorusu
  - Kronolojik sıralama (sürükle-bırak ya da klavye)
  - "Bu kod ne yazdırır?"
- [ ] Her cevaptan sonra doğru cevap ve kısa bir açıklama gösterilir

**Oyun**
- [ ] 10 soruluk turlar, süre ve hız bonusu; jokerler (50:50, +10 sn)
- [ ] Günün sorusu: herkese aynı soru, sonucu emoji ile paylaşma
- [ ] Günlük seri, konu ve seviye başına istatistik, başarım rozetleri
- [ ] "Hatalarım" modu: yanlış cevaplanan sorular doğru cevaplanana kadar tekrar gelir

**Güvenlik ve altyapı**
- [ ] Soru üretimi, cevap kontrolü ve puanlama Vercel sunucu fonksiyonlarında yapılır; tarayıcı cevabı önceden göremez
- [ ] Tur durumu şifreli (AES-256-GCM) ve tek kullanımlık bir jetonda tutulur; rate limit ve sunucu tarafı doğrulama
- [ ] Türkçe ve İngilizce arayüz, portfolyo sitemle uyumlu koyu ve açık tema, klavye ve ekran okuyucu desteği
- [ ] Mantık ayrı modüllerde, Node'un yerleşik test aracıyla test edilir

**Sonra eklenecekler**
- Yapay zekâ ile "kendi konunu yaz" turu
- Hesap sistemiyle cihazlar arası seri
- Yeni uzmanlık dalları
- Doğrulanabilir sonuç paylaşma linki

## Kullanılan Teknolojiler

- HTML, CSS, JavaScript (ES modülleri, framework yok, derleme adımı yok)
- Vercel sunucu fonksiyonları (Node.js), Upstash Redis
- Birim testleri için `node --test`
