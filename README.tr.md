# Bilgi Yarışması (Quiz App)

[English](README.md) | **Türkçe**

Sade HTML, CSS ve JavaScript ile yazılmış, soruları Türkçe ve İngilizce JSON dosyalarından okuyan, süreli bir bilgi yarışması.

> Geliştirme sürüyor. Aşağıdaki plan, proje v1.0'a ulaştığında tam README'ye dönüşecek.

## Özellikler (plan)

**MVP**
- [ ] Her birinde 25 soru olan 8 kategori (genel kültür, bilim, tarih, coğrafya, teknoloji, spor, sanat ve edebiyat, sinema ve müzik); Türkçe ve İngilizce için ayrı dosyalar, toplam 400 soru
- [ ] Bir kategoriden ya da bütün kategorilerden karışık 10 rastgele soruluk tur; şıkların sırası karıştırılır
- [ ] Her soru için 20 saniyelik süre; süre biterse cevap yanlış sayılır
- [ ] Puanlama: doğru cevaba 10 puan ve hız bonusu
- [ ] Her cevaptan sonra doğru şık gösterilir
- [ ] Sonuç ekranı: puan, doğru sayısı, süre ve her sorunun gözden geçirilmesi
- [ ] Her kategori için en yüksek puan; sayfa yenilense de korunur
- [ ] Klavyeyle oynama (cevap için 1-4, sonraki soru için Enter) ve ekran okuyucu duyuruları
- [ ] Türkçe ve İngilizce arayüz, portfolyo sitemle uyumlu koyu ve açık tema
- [ ] Yarışma mantığı ayrı modüllerde, Node'un yerleşik test aracıyla test edilir
- [ ] Vercel'de yayında

**Sonra eklenecekler**
- %50 joker hakkı
- Zorluk seviyeleri
- Sonucu paylaşma

## Kullanılan Teknolojiler

- HTML, CSS, JavaScript (ES modülleri, framework yok, derleme adımı yok)
- Birim testleri için `node --test`
- Yayın için Vercel
