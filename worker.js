const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
  });
}

function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let result = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    result = values[i] * k + result * (1 - k);
  }
  return result;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

async function analyze(request, env) {
  if (!env.TWELVE_DATA_API_KEY) {
    return json({ error: "Secret TWELVE_DATA_API_KEY belum dipasang di Cloudflare." }, 500);
  }

  const url = new URL(request.url);
  const interval = url.searchParams.get("interval") === "5min" ? "5min" : "1min";
  const symbol = env.GOLD_SYMBOL || "XAU/USD";
  const apiUrl = new URL("https://api.twelvedata.com/time_series");
  apiUrl.searchParams.set("symbol", symbol);
  apiUrl.searchParams.set("interval", interval);
  apiUrl.searchParams.set("outputsize", "100");
  apiUrl.searchParams.set("apikey", env.TWELVE_DATA_API_KEY);

  const upstream = await fetch(apiUrl.toString());
  const payload = await upstream.json();

  if (!upstream.ok || payload.status === "error" || !Array.isArray(payload.values)) {
    return json({
      error: payload.message || "Data Twelve Data belum tersedia.",
      code: payload.code || upstream.status
    }, 502);
  }

  const candles = payload.values.slice().reverse().map(c => ({
    datetime: c.datetime,
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close)
  })).filter(c => Number.isFinite(c.close));

  const closes = candles.map(c => c.close);
  if (closes.length < 25) return json({ error: "Data candle belum cukup untuk analisa." }, 502);

  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const currentRsi = rsi(closes, 14);
  const last = candles[candles.length - 1];
  const bullish = last.close > last.open;
  const bearish = last.close < last.open;

  let signal = "WAIT";
  let reason = "Belum ada konfirmasi yang cukup.";
  if (ema9 > ema21 && currentRsi >= 50 && currentRsi <= 70 && bullish) {
    signal = "BUY";
    reason = "EMA 9 di atas EMA 21, RSI mendukung, candle terakhir bullish.";
  } else if (ema9 < ema21 && currentRsi >= 30 && currentRsi <= 50 && bearish) {
    signal = "SELL";
    reason = "EMA 9 di bawah EMA 21, RSI mendukung, candle terakhir bearish.";
  }

  // Default planning distances: 20 pips SL and 50 pips TP.
  // Pip size is set to 0.01 here; confirm your broker's XAUUSD quote convention.
  const pipSize = 0.01;
  const entry = last.close;
  const slDistance = 20 * pipSize;
  const tpDistance = 50 * pipSize;
  const sl = signal === "BUY" ? entry - slDistance : signal === "SELL" ? entry + slDistance : null;
  const tp = signal === "BUY" ? entry + tpDistance : signal === "SELL" ? entry - tpDistance : null;

  return json({
    symbol,
    interval,
    signal,
    reason,
    entry,
    sl,
    tp,
    stopLoss: sl,
    takeProfit: tp,
    price: last.close,
    ema9,
    ema21,
    rsi: currentRsi,
    candleTime: last.datetime,
    candles
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    const url = new URL(request.url);
    if (url.pathname === "/api/analyze") {
      try {
        return await analyze(request, env);
      } catch (error) {
        return json({ error: "Gagal mengambil data market.", detail: String(error) }, 500);
      }
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("GOLD SCALP AI PRO Worker aktif. File website belum tersedia di folder public.", {
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
};
