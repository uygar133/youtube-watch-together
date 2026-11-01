# youtube-watch-together

Bu uygulama, sizin ve arkadaşınızın aynı anda birlikte video izlemesine yardımcı olmak için hazırlanmış basit bir araçtır.

## Gereksinimler

- [Node.js](https://nodejs.org/en/download): Sadece platformunuzu seçin, diğer ayarlar doğrudur.
- [ngrok](https://ngrok.com/download): Adresi açıp platformunuzu seçerek indirebilirsiniz.

## Kurulum

1. Projenin kaynak kodlarını indirin ve klasörü açın.
2. Klasör içinde bir terminal açıp şu komutu çalıştırın:

```bash
npm install
```

3. Ardından sunucuyu başlatın:

```bash
node server.js
```

4. İkinci bir terminal açıp şu komutu çalıştırın:

```bash
ngrok http 3000
```

## Kullanım

1. Son komuttan sonra ngrok'un verdiği bağlantıyı arkadaşınızla birlikte tarayıcıda açın.
2. Arkadaşınız, sizin "Senin Kodun" bölümündeki kodunuzu "Arkadaşına Bağlan" başlığının altına yazıp "İstek Gönder" butonuna basmalıdır.
3. Arkadaşınız butona bastıktan sonra sizde "Gelen İstekler" başlığının altında "Kabul Et" butonu görünür, ona basın.
4. Biraz bekleyince hem size hem arkadaşınıza videolar gelir. Bundan sonra istediğiniz videoyu seçip birlikte izleyebilirsiniz.

> **Not:** Videoyu boşluk (Space) tuşuyla durdurmayın. Sizin videonuzla arkadaşınızın videosu farklı yerlerde oynuyorsa videoyu durdurup yeniden başlatın.
