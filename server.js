const express = require("express");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, "public")));

function ema(values, period) {
  const k = 2 / (period + 1);
  let value = values[0];
  for (let i = 1; i < values.length; i++) value = values[i] * k + value * (1 - k);
  return value;
}
function rsi(values, period = 14) {
  let gains = 0, losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period, avgLoss = losses / period;
  return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
}
function atr(candles, period = 14) {
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const last = trs.slice(-period);
  return last.reduce((a, b) => a + b, 0) / last.length;
}
app.get("/api/analyze", async (req, res) => {
  try {
    const interval = req.query.interval === "1min" ? "1min" : "5min";
    const apiKey = process.env.TWELVE_DATA_API_KEY;
    if (!apiKey) return res.status(503).json({ error: "API key belum dipasang di environment server." });
    const url = new URL("https://api.twelvedata.com/time_series");
    url.search = new URLSearchParams({
      symbol: process.env.GOLD_SYMBOL || "XAU/USD",
      interval, outputsize: "100", apikey: apiKey, format: "JSON"
    }).toString();
    const upstream = await fetch(url);
    const payload = await upstream.json();
    if (!upstream.ok || payload.status === "error" || !payload.values) {
      return res.status(502).json({ error: payload.message || "Data XAU/USD tidak tersedia dari penyedia data." });
    }
    const candles = payload.values.slice().reverse().map(v => ({
      datetime: v.datetime, open: +v.open, high: +v.high, low: +v.low, close: +v.close
    }));
    if (candles.length < 30) return res.status(502).json({ error: "Data candle kurang untuk analisa." });
    const closes = candles.map(c => c.close);
    const fast = ema(closes.slice(-35), 9), slow = ema(closes.slice(-55), 21);
    const momentum = rsi(closes), volatility = atr(candles), last = candles[candles.length - 1];
    let signal = "WAIT", reason = "Belum ada konfirmasi tren, momentum, dan candle yang searah.";
    if (fast > slow && momentum >= 50 && momentum <= 70 && last.close > last.open) {
      signal = "BUY"; reason = "EMA 9 di atas EMA 21, RSI mendukung momentum bullish, candle terakhir bullish.";
    } else if (fast < slow && momentum >= 30 && momentum <= 50 && last.close < last.open) {
      signal = "SELL"; reason = "EMA 9 di bawah EMA 21, RSI mendukung momentum bearish, candle terakhir bearish.";
    }
    res.json({
      symbol: process.env.GOLD_SYMBOL || "XAU/USD", interval, signal, reason,
      entry: last.close, rsi: momentum, ema9: fast, ema21: slow, atr: volatility,
      candleTime: last.datetime, fetchedAt: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: "Kesalahan server saat mengambil data market." });
  }
});
app.get("/health", (_req, res) => res.json({ ok: true }));
app.listen(PORT, () => console.log(`GOLD SCALP AI PRO running on ${PORT}`));
