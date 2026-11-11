
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders
    }
  });
}

function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let result = values.slice(0, period)
    .reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < values.length; i++) {
    result = values[i] * k + result * (1 - k);
  }
  return result;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) +
      Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) +
      Math.max(-change, 0)) / period;
  }

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function atr(candles, period = 14) {
  if (candles.length < period + 1) return null;

  const ranges = [];

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];

    ranges.push(Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    ));
  }

  return ranges.slice(-period)
    .reduce((a, b) => a + b, 0) / period;
}

function getSwings(candles, left = 2, right = 2) {
  const highs = [];
  const lows = [];

  for (let i = left; i < candles.length - right; i++) {
    let isHigh = true;
    let isLow = true;

    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;

      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }

    if (isHigh) highs.push({
      index: i,
      price: candles[i].high
    });

    if (isLow) lows.push({
      index: i,
      price: candles[i].low
    });
  }

  return { highs, lows };
}

function findSweep(candles, swings) {
  const start = Math.max(5, candles.length - 12);
  const end = candles.length - 1;

  for (let i = end - 1; i >= start; i--) {
    const previousHighs = swings.highs.filter(s => s.index < i);
    const previousLows = swings.lows.filter(s => s.index < i);

    const high = previousHighs.at(-1);
    const low = previousLows.at(-1);
    const c = candles[i];

    if (low && c.low < low.price && c.close > low.price) {
      return {
        type: "BULLISH_SWEEP",
        index: i,
        level: low.price,
        extreme: c.low
      };
    }

    if (high && c.high > high.price && c.close < high.price) {
      return {
        type: "BEARISH_SWEEP",
        index: i,
        level: high.price,
        extreme: c.high
      };
    }
  }

  return null;
}

function findOrderBlock(candles, sweep, direction) {
  for (let i = candles.length - 2;
       i > sweep.index;
       i--) {
    const c = candles[i];

    if (direction === "BUY" && c.close < c.open) {
      return {
        low: c.low,
        high: c.high,
        index: i
      };
    }

    if (direction === "SELL" && c.close > c.open) {
      return {
        low: c.low,
        high: c.high,
        index: i
      };
    }
  }

  return null;
}

function findFVG(candles, direction) {
  const i = candles.length - 1;
  if (i < 2) return null;

  const first = candles[i - 2];
  const last = candles[i];

  if (direction === "BUY" && last.low > first.high) {
    return {
      low: first.high,
      high: last.low
    };
  }

  if (direction === "SELL" && last.high < first.low) {
    return {
      low: last.high,
      high: first.low
    };
  }

  return null;
}

function roundPrice(value, digits) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function analyzeSMC(candles, digits) {
  const last = candles.at(-1);
  const closes = candles.map(c => c.close);
  const swings = getSwings(candles);
  const volatility = atr(candles);

  if (!volatility || volatility <= 0) {
    return { signal: "WAIT", reason: "ATR belum tersedia." };
  }

  const rangeCandles = candles.slice(-50);
  const rangeHigh = Math.max(...rangeCandles.map(c => c.high));
  const rangeLow = Math.min(...rangeCandles.map(c => c.low));
  const midpoint = (rangeHigh + rangeLow) / 2;

  const sweep = findSweep(candles, swings);

  const candleRange = last.high - last.low;
  const body = Math.abs(last.close - last.open);
  const displacement = candleRange >= volatility * 1.2 &&
    body >= candleRange * 0.6;

  const bullishCandle = last.close > last.open;
  const bearishCandle = last.close < last.open;

  const bullishBOS = sweep &&
    sweep.type === "BULLISH_SWEEP" &&
    last.close > Math.max(
      ...candles.slice(sweep.index + 1, -1)
        .map(c => c.high),
      sweep.level
    );

  const bearishBOS = sweep &&
    sweep.type === "BEARISH_SWEEP" &&
    last.close < Math.min(
      ...candles.slice(sweep.index + 1, -1)
        .map(c => c.low),
      sweep.level
    );

  let signal = "WAIT";
  let reason = "Belum ada konfirmasi SMC yang lengkap.";
  let direction = null;

  if (
    sweep &&
    sweep.type === "BULLISH_SWEEP" &&
    bullishBOS &&
    bullishCandle &&
    displacement &&
    last.close <= midpoint
  ) {
    signal = "BUY";
    direction = "BUY";
    reason = "Sell-side liquidity sweep, bullish BOS, displacement dan Discount.";
  } else if (
    sweep &&
    sweep.type === "BEARISH_SWEEP" &&
    bearishBOS &&
    bearishCandle &&
    displacement &&
    last.close >= midpoint
  ) {
    signal = "SELL";
    direction = "SELL";
    reason = "Buy-side liquidity sweep, bearish BOS, displacement dan Premium.";
  }

  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const currentRsi = rsi(closes, 14);

  if (!direction) {
    return {
      signal,
      reason,
      entry: null,
      sl: null,
      tp: null,
      stopLoss: null,
      takeProfit: null,
      price: last.close,
      ema9,
      ema21,
      rsi: currentRsi,
      atr: roundPrice(volatility, digits),
      structure: {
        sweep: sweep?.type || null,
        midpoint: roundPrice(midpoint, digits),
        rangeHigh: roundPrice(rangeHigh, digits),
        rangeLow: roundPrice(rangeLow, digits)
      }
    };
  }

  const ob = findOrderBlock(candles, sweep, direction);
  const fvg = findFVG(candles, direction);

  const entry = last.close;
  const buffer = volatility * 0.1;

  const sl = direction === "BUY"
    ? sweep.extreme - buffer
    : sweep.extreme + buffer;

  const risk = Math.abs(entry - sl);

  if (risk <= 0) {
    return {
      signal: "WAIT",
      reason: "Struktur SL tidak valid."
    };
  }

  const candidates = direction === "BUY"
    ? swings.highs.map(s => s.price)
        .filter(p => p > entry).sort((a, b) => a - b)
    : swings.lows.map(s => s.price)
        .filter(p => p < entry).sort((a, b) => b - a);

  const rangeTarget = direction === "BUY" ? rangeHigh : rangeLow;
  const validRangeTarget = direction === "BUY"
    ? rangeTarget > entry
    : rangeTarget < entry;

  const targets = [...new Set([
    ...candidates,
    ...(validRangeTarget ? [rangeTarget] : [])
  ])];

  const minimumTarget = direction === "BUY"
    ? entry + risk * 1.5
    : entry - risk * 1.5;

  const validTargets = targets.filter(p =>
    direction === "BUY" ? p >= minimumTarget : p <= minimumTarget
  );

  if (!validTargets.length) {
    return {
      signal: "WAIT",
      reason: "Target likuiditas belum memberikan RR minimal 1:1.5.",
      entry: roundPrice(entry, digits),
      sl: roundPrice(sl, digits),
      tp: null,
      stopLoss: roundPrice(sl, digits),
      takeProfit: null,
      price: last.close
    };
  }

  const tp1 = validTargets[0];
  const tp2 = validTargets[1] || null;
  const tp3 = validTargets[2] || null;

  return {
    signal,
    reason,
    entry: roundPrice(entry, digits),
    sl: roundPrice(sl, digits),
    tp: roundPrice(tp1, digits),
    stopLoss: roundPrice(sl, digits),
    takeProfit: roundPrice(tp1, digits),
    price: last.close,
    ema9,
    ema21,
    rsi: currentRsi,
    atr: roundPrice(volatility, digits),
    risk: roundPrice(risk, digits),
    rr: roundPrice(Math.abs(tp1 - entry) / risk, 2),
    targets: {
      tp1: roundPrice(tp1, digits),
      tp2: tp2 ? roundPrice(tp2, digits) : null,
      tp3: tp3 ? roundPrice(tp3, digits) : null
    },
    zones: {
      orderBlock: ob,
      fvg,
      premiumDiscount: last.close >= midpoint
        ? "PREMIUM" : "DISCOUNT",
      midpoint: roundPrice(midpoint, digits)
    },
    structure: {
      sweep: sweep.type,
      sweepLevel: roundPrice(sweep.level, digits),
      sweepExtreme: roundPrice(sweep.extreme, digits),
      bos: direction === "BUY" ? "BULLISH" : "BEARISH",
      rangeHigh: roundPrice(rangeHigh, digits),
      rangeLow: roundPrice(rangeLow, digits)
    },
    trailing: {
      activationR: 0.5
    }
  };
}

async function analyze(request, env) {
  if (!env.TWELVE_DATA_API_KEY) {
    return json({
      error: "Secret TWELVE_DATA_API_KEY belum dipasang."
    }, 500);
  }

  const url = new URL(request.url);
  const interval = url.searchParams.get("interval") === "5min"
    ? "5min" : "1min";

  const symbol = env.GOLD_SYMBOL || "XAU/USD";
  const apiUrl = new URL(
    "https://api.twelvedata.com/time_series"
  );

  apiUrl.searchParams.set("symbol", symbol);
  apiUrl.searchParams.set("interval", interval);
  apiUrl.searchParams.set("outputsize", "120");
  apiUrl.searchParams.set("apikey", env.TWELVE_DATA_API_KEY);

  const upstream = await fetch(apiUrl.toString());
  const payload = await upstream.json();

  if (
    !upstream.ok ||
    payload.status === "error" ||
    !Array.isArray(payload.values)
  ) {
    return json({
      error: payload.message || "Data market belum tersedia.",
      code: payload.code || upstream.status
    }, 502);
  }

  const raw = payload.values.slice().reverse();

  const candles = raw.map(c => ({
    datetime: c.datetime,
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close)
  })).filter(c =>
    Number.isFinite(c.open) &&
    Number.isFinite(c.high) &&
    Number.isFinite(c.low) &&
    Number.isFinite(c.close)
  );

  // Gunakan candle yang sudah selesai.
  // Candle paling baru dikeluarkan untuk mengurangi risiko repaint.
  const closedCandles = candles.slice(0, -1);

  if (closedCandles.length < 30) {
    return json({
      error: "Candle selesai belum cukup untuk analisa SMC."
    }, 502);
  }

  const decimals = Math.min(6, Math.max(
    2,
    ...raw.slice(0, 20).map(c => {
      const value = String(c.close);
      return value.includes(".")
        ? value.split(".")[1].length : 0;
    })
  ));

  const result = analyzeSMC(closedCandles, decimals);

  return json({
    symbol,
    interval,
    method: "SMC",
    candleTime: closedCandles.at(-1).datetime,
    candleStatus: "CLOSED",
    price: closedCandles.at(-1).close,
    ...result,
    candles: closedCandles
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
        return json({
          error: "Gagal mengambil data market.",
          detail: String(error)
        }, 500);
      }
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);

    return new Response(
      "GOLD SCALP AI PRO Worker aktif.",
      {
        headers: {
          "Content-Type": "text/plain; charset=utf-8"
        }
      }
    );
  }
};
