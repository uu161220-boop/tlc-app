/**
 * Technical Indicator Calculation Utilities
 * All functions accept an array of close prices (numbers)
 * and return arrays of {time, value} suitable for LineSeries
 */

/**
 * Simple Moving Average (SMA)
 */
export function calculateSMA(data, period) {
  const results = [];
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const sum = slice.reduce((acc, d) => acc + d.close, 0);
    results.push({ time: data[i].time, value: parseFloat((sum / period).toFixed(2)) });
  }
  return results;
}

/**
 * Exponential Moving Average (EMA)
 */
export function calculateEMA(data, period) {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const results = [];

  // Seed with first SMA
  const seedSlice = data.slice(0, period);
  let ema = seedSlice.reduce((acc, d) => acc + d.close, 0) / period;
  results.push({ time: data[period - 1].time, value: parseFloat(ema.toFixed(2)) });

  for (let i = period; i < data.length; i++) {
    ema = data[i].close * k + ema * (1 - k);
    results.push({ time: data[i].time, value: parseFloat(ema.toFixed(2)) });
  }
  return results;
}

/**
 * Bollinger Bands (period=20, stdDevMultiplier=2)
 * Returns { upper, middle, lower }
 */
export function calculateBollingerBands(data, period = 20, stdDevMult = 2) {
  const upper = [];
  const middle = [];
  const lower = [];

  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const closes = slice.map(d => d.close);
    const avg = closes.reduce((a, b) => a + b, 0) / period;
    const variance = closes.reduce((acc, c) => acc + Math.pow(c - avg, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    const t = data[i].time;
    middle.push({ time: t, value: parseFloat(avg.toFixed(2)) });
    upper.push({ time: t, value: parseFloat((avg + stdDevMult * stdDev).toFixed(2)) });
    lower.push({ time: t, value: parseFloat((avg - stdDevMult * stdDev).toFixed(2)) });
  }
  return { upper, middle, lower };
}

/**
 * RSI (Relative Strength Index) — period=14
 * Returns array of {time, value}
 */
export function calculateRSI(data, period = 14) {
  if (data.length < period + 1) return [];
  const results = [];

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const delta = data[i].close - data[i - 1].close;
    if (delta > 0) gains += delta;
    else losses -= delta;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  const rsi = (rsiVal) => 100 - 100 / (1 + rsiVal);

  results.push({ time: data[period].time, value: parseFloat(rsi(avgGain / (avgLoss || 1e-10)).toFixed(2)) });

  for (let i = period + 1; i < data.length; i++) {
    const delta = data[i].close - data[i - 1].close;
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    results.push({ time: data[i].time, value: parseFloat(rsi(avgGain / (avgLoss || 1e-10)).toFixed(2)) });
  }

  return results;
}

/**
 * MACD (12, 26, 9)
 * Returns { macdLine, signalLine, histogram }
 */
export function calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const ema12 = calculateEMA(data, fastPeriod);
  const ema26 = calculateEMA(data, slowPeriod);

  // Align by time
  const ema12Map = Object.fromEntries(ema12.map(d => [d.time, d.value]));
  const ema26Map = Object.fromEntries(ema26.map(d => [d.time, d.value]));

  const macdRaw = ema26.map(d => ({
    time: d.time,
    close: ema12Map[d.time] !== undefined ? ema12Map[d.time] - d.value : 0
  })).filter(d => ema12Map[d.time] !== undefined);

  const signalRaw = calculateEMA(macdRaw, signalPeriod);
  const signalMap = Object.fromEntries(signalRaw.map(d => [d.time, d.value]));

  const macdLine = macdRaw.map(d => ({ time: d.time, value: parseFloat(d.close.toFixed(4)) }));
  const signalLine = signalRaw;
  const histogram = macdRaw
    .filter(d => signalMap[d.time] !== undefined)
    .map(d => ({
      time: d.time,
      value: parseFloat((d.close - (signalMap[d.time] || 0)).toFixed(4)),
      color: d.close >= (signalMap[d.time] || 0) ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)'
    }));

  return { macdLine, signalLine, histogram };
}

/**
 * SNR — Support & Resistance Levels
 *
 * Detects swing highs (resistance) and swing lows (support).
 * Returns arrays of level objects used to draw price lines on the chart.
 *
 * @param {Array}  data       - bars [{time, open, high, low, close}]
 * @param {number} lookback   - candles on each side required to qualify as swing
 * @param {number} maxLevels  - max levels per type (most recent kept)
 * @param {number} clusterPct - fractional threshold to merge nearby levels
 */
export function calculateSNR(data, lookback = 5, maxLevels = 8, clusterPct = 0.008) {
  if (data.length < lookback * 2 + 1) return { resistances: [], supports: [] };

  const rawRes = [];
  const rawSup = [];

  for (let i = lookback; i < data.length - lookback; i++) {
    const d = data[i];

    let isHigh = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && data[j].high >= d.high) { isHigh = false; break; }
    }

    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && data[j].low <= d.low) { isLow = false; break; }
    }

    if (isHigh) rawRes.push({ price: d.high, time: d.time, idx: i });
    if (isLow)  rawSup.push({ price: d.low,  time: d.time, idx: i });
  }

  // Merge levels within clusterPct of each other, keeping the most recent
  const cluster = (levels) => {
    const sorted = [...levels].sort((a, b) => b.idx - a.idx);
    const merged = [];
    for (const lvl of sorted) {
      const hit = merged.find(m => Math.abs(m.price - lvl.price) / lvl.price < clusterPct);
      if (!hit) merged.push({ ...lvl });
    }
    return merged.slice(0, maxLevels);
  };

  return { resistances: cluster(rawRes), supports: cluster(rawSup) };
}

/**
 * SND — Supply & Demand Zones
 *
 * Identifies Supply zones (areas that caused a sharp bearish move) and
 * Demand zones (areas that caused a sharp bullish move).
 * Zones that were later broken through by price are automatically removed.
 *
 * Returns:
 *   demandZones: [{ high, low, time, endTime, idx }]
 *   supplyZones: [{ high, low, time, endTime, idx }]
 *
 * @param {Array}  data              - bars [{time, open, high, low, close}]
 * @param {number} impulseMultiplier - body must be > N × avgBody to count as impulse
 * @param {number} maxZones          - max valid zones per type to return
 */
export function calculateSND(data, impulseMultiplier = 2.2, maxZones = 6) {
  if (data.length < 10) return { demandZones: [], supplyZones: [] };

  const avgBody = data.reduce((s, d) => s + Math.abs(d.close - d.open), 0) / data.length;
  const lastTime = data[data.length - 1].time;

  const rawDemand = [];
  const rawSupply = [];

  for (let i = 1; i < data.length; i++) {
    const d    = data[i];
    const body = Math.abs(d.close - d.open);
    if (body < impulseMultiplier * avgBody) continue;

    const base = data[i - 1]; // candle immediately before the impulse
    const zoneHigh = Math.max(base.open, base.close);
    const zoneLow  = Math.min(base.open, base.close);

    if (d.close > d.open) {
      // Bullish impulse → Demand zone
      rawDemand.push({ high: zoneHigh, low: zoneLow, time: base.time, endTime: lastTime, idx: i });
    } else {
      // Bearish impulse → Supply zone
      rawSupply.push({ high: zoneHigh, low: zoneLow, time: base.time, endTime: lastTime, idx: i });
    }
  }

  // Remove zones broken through by subsequent candle closes
  const filterValid = (zones, type) =>
    zones.filter(z => {
      for (let j = z.idx + 1; j < data.length; j++) {
        if (type === 'demand' && data[j].close < z.low)  return false;
        if (type === 'supply' && data[j].close > z.high) return false;
      }
      return true;
    });

  return {
    demandZones: filterValid(rawDemand, 'demand').sort((a, b) => b.idx - a.idx).slice(0, maxZones),
    supplyZones: filterValid(rawSupply, 'supply').sort((a, b) => b.idx - a.idx).slice(0, maxZones),
  };
}

