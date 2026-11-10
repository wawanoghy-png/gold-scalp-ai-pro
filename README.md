# GOLD SCALP AI PRO

Website XAUUSD signal dashboard (M1/M5), TradingView chart, Twelve Data candles, EMA 9/21, RSI 14, ATR 14, indikasi Entry/SL/TP, dan auto-refresh.

## Jalankan lokal
1. Install Node.js 18+.
2. Di folder project: `npm install`
3. Set environment variable `TWELVE_DATA_API_KEY` dengan API key Twelve Data.
4. Opsional: set `GOLD_SYMBOL` (default `XAU/USD`).
5. Jalankan `npm start`, lalu buka `http://localhost:3000`.

## Deploy online (contoh Render)
1. Upload semua isi folder ini ke repository GitHub.
2. Buat Web Service dari repository tersebut.
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Tambahkan Environment Variable:
   - Key: `TWELVE_DATA_API_KEY`
   - Value: API key Twelve Data kamu
   - Opsional `GOLD_SYMBOL`: `XAU/USD`
6. Deploy, lalu buka URL website yang diberikan hosting.

Jangan menaruh API key di `public/index.html`, GitHub, atau chat. Simpan hanya sebagai environment variable server.

## Catatan analisa
Signal rule-based: BUY jika EMA9 > EMA21, RSI 50–70, dan candle terakhir bullish; SELL jika EMA9 < EMA21, RSI 30–50, dan candle terakhir bearish; selain itu WAIT. SL/TP dihitung di browser dari harga candle terakhir dan definisi pip yang bisa diubah.

Default pip = $0.01 hanya asumsi. Cocokkan dengan spesifikasi kontrak XAUUSD broker. Sistem ini tidak mengeksekusi transaksi dan tidak menjamin profit. Uji di demo.


## PWA / pasang seperti aplikasi
Versi ini sudah memiliki `manifest.webmanifest`, service worker, ikon 192/512, dan dukungan tombol install bila browser menampilkan prompt. Hosting wajib menggunakan HTTPS (Render memberi HTTPS).
Setelah deploy:
- Buka URL website melalui Chrome Android.
- Jika tombol INSTALL APP muncul, tekan tombol tersebut.
- Jika tidak muncul: menu Chrome (⋮) > Tambahkan ke layar utama / Install app.
- Data market dan analisa tetap memerlukan koneksi internet; cache hanya menyimpan kerangka tampilan.
