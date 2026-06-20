import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import { calculateSMA, calculateEMA, calculateBollingerBands, calculateRSI, calculateMACD, calculateSNR, calculateSND } from './indicators.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export default function BacktestPanel({ stocks }) {
  // Config state
  const [ticker, setTicker] = useState('');
  const [timeframe, setTimeframe] = useState('d1');
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState('2026-06-01');
  const [speed, setSpeed] = useState(2);

  // Replay status
  const [isBacktestActive, setIsBacktestActive] = useState(false);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Replay data
  const [historyData, setHistoryData] = useState([]);
  const [replayData, setReplayData] = useState([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [currentDate, setCurrentDate] = useState('');

  // Visible bars for indicator recalc
  const visibleBarsRef = useRef([]);

  // Sandbox portfolio
  const [portfolio, setPortfolio] = useState({ cash: 10000000.0, holdings: {} });
  const [lotsToTrade, setLotsToTrade] = useState(1);
  const [tradeHistory, setTradeHistory] = useState([]);

  // Indicator toggles
  const [showSMA20, setShowSMA20]   = useState(false);
  const [showEMA50, setShowEMA50]   = useState(false);
  const [showEMA200, setShowEMA200] = useState(false);
  const [showBB, setShowBB]         = useState(false);
  const [showRSI, setShowRSI]       = useState(false);
  const [showMACD, setShowMACD]     = useState(false);
  const [showSNR, setShowSNR]       = useState(false);
  const [showSND, setShowSND]       = useState(false);

  const INDICATORS = [
    { key: 'sma20',  label: 'SMA 20',  color: '#38bdf8', state: showSMA20,  set: setShowSMA20 },
    { key: 'ema50',  label: 'EMA 50',  color: '#f472b6', state: showEMA50,  set: setShowEMA50 },
    { key: 'ema200', label: 'EMA 200', color: '#fb923c', state: showEMA200, set: setShowEMA200 },
    { key: 'bb',     label: 'BB 20',   color: '#a78bfa', state: showBB,     set: setShowBB },
    { key: 'rsi',    label: 'RSI 14',  color: '#facc15', state: showRSI,    set: setShowRSI },
    { key: 'macd',   label: 'MACD',    color: '#34d399', state: showMACD,   set: setShowMACD },
    { key: 'snr',    label: 'S&R',     color: '#e2e8f0', state: showSNR,    set: setShowSNR },
    { key: 'snd',    label: 'S&D',     color: '#fcd34d', state: showSND,    set: setShowSND },
  ];

  // Chart refs
  const chartContainerRef    = useRef(null);
  const subChartContainerRef = useRef(null);
  const chartRef             = useRef(null);
  const subChartRef          = useRef(null);
  const candlestickSeriesRef = useRef(null);
  const volumeSeriesRef      = useRef(null);
  const indicatorSeriesRef   = useRef({}); // keyed by indicator id
  const playbackTimerRef     = useRef(null);

  // Playback index ref (for interval closure)
  const playbackIndexRef  = useRef(0);
  const replayDataRef     = useRef([]);
  const isPlayingRef      = useRef(false);

  // Set default ticker
  useEffect(() => {
    if (stocks && stocks.length > 0) setTicker(stocks[0].ticker.replace('.JK', ''));
  }, [stocks]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (playbackTimerRef.current) clearInterval(playbackTimerRef.current); };
  }, []);

  // ─── Helper: rebuild indicator series on current visible bars ───
  const rebuildIndicators = useCallback((chart) => {
    const bars = visibleBarsRef.current;
    if (!chart || bars.length === 0) return;
    const existingSeries = indicatorSeriesRef.current;

    // Remove old indicator series
    Object.values(existingSeries).forEach(s => { try { chart.removeSeries(s); } catch (_) {} });
    indicatorSeriesRef.current = {};

    const opts = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };

    if (showSMA20 && bars.length >= 20) {
      const s = chart.addSeries(LineSeries, { ...opts, color: '#38bdf8', lineWidth: 1.5 });
      s.setData(calculateSMA(bars, 20));
      indicatorSeriesRef.current.sma20 = s;
    }
    if (showEMA50 && bars.length >= 50) {
      const s = chart.addSeries(LineSeries, { ...opts, color: '#f472b6', lineWidth: 1.5 });
      s.setData(calculateEMA(bars, 50));
      indicatorSeriesRef.current.ema50 = s;
    }
    if (showEMA200 && bars.length >= 200) {
      const s = chart.addSeries(LineSeries, { ...opts, color: '#fb923c', lineWidth: 1.5 });
      s.setData(calculateEMA(bars, 200));
      indicatorSeriesRef.current.ema200 = s;
    }
    if (showBB && bars.length >= 20) {
      const bb = calculateBollingerBands(bars, 20, 2);
      const bbOpts = { ...opts, lineWidth: 1 };
      const u = chart.addSeries(LineSeries, { ...bbOpts, color: '#a78bfa' }); u.setData(bb.upper);
      const m = chart.addSeries(LineSeries, { ...bbOpts, color: '#6366f1', lineStyle: 2 }); m.setData(bb.middle);
      const l = chart.addSeries(LineSeries, { ...bbOpts, color: '#a78bfa' }); l.setData(bb.lower);
      indicatorSeriesRef.current.bbU = u;
      indicatorSeriesRef.current.bbM = m;
      indicatorSeriesRef.current.bbL = l;
    }

    // --- SNR: Support & Resistance horizontal price lines ---
    if (showSNR && bars.length >= 11 && candlestickSeriesRef.current) {
      const { resistances, supports } = calculateSNR(bars);
      // Price lines are attached to the candle series — recreated on each rebuild
      resistances.forEach(lvl => {
        candlestickSeriesRef.current.createPriceLine({
          price: lvl.price,
          color: 'rgba(239, 68, 68, 0.75)',
          lineWidth: 1,
          lineStyle: 1,
          axisLabelVisible: true,
          title: 'R',
        });
      });
      supports.forEach(lvl => {
        candlestickSeriesRef.current.createPriceLine({
          price: lvl.price,
          color: 'rgba(16, 185, 129, 0.75)',
          lineWidth: 1,
          lineStyle: 1,
          axisLabelVisible: true,
          title: 'S',
        });
      });
    }

    // --- SND: Supply & Demand zone bands ---
    if (showSND && bars.length >= 10) {
      const { demandZones, supplyZones } = calculateSND(bars);
      const zOpts = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };

      demandZones.forEach((z, i) => {
        const u = chart.addSeries(LineSeries, { ...zOpts, color: 'rgba(16,185,129,0.55)', lineWidth: 1 });
        const l = chart.addSeries(LineSeries, { ...zOpts, color: 'rgba(16,185,129,0.3)',  lineWidth: 1 });
        u.setData([{ time: z.time, value: z.high }, { time: z.endTime, value: z.high }]);
        l.setData([{ time: z.time, value: z.low  }, { time: z.endTime, value: z.low  }]);
        indicatorSeriesRef.current[`demU${i}`] = u;
        indicatorSeriesRef.current[`demL${i}`] = l;
      });

      supplyZones.forEach((z, i) => {
        const u = chart.addSeries(LineSeries, { ...zOpts, color: 'rgba(239,68,68,0.55)', lineWidth: 1 });
        const l = chart.addSeries(LineSeries, { ...zOpts, color: 'rgba(239,68,68,0.3)',  lineWidth: 1 });
        u.setData([{ time: z.time, value: z.high }, { time: z.endTime, value: z.high }]);
        l.setData([{ time: z.time, value: z.low  }, { time: z.endTime, value: z.low  }]);
        indicatorSeriesRef.current[`supU${i}`] = u;
        indicatorSeriesRef.current[`supL${i}`] = l;
      });
    }
  }, [showSMA20, showEMA50, showEMA200, showBB, showSNR, showSND]);

  const rebuildSubChart = useCallback(() => {
    const bars = visibleBarsRef.current;
    // Destroy old sub-chart
    if (subChartRef.current) {
      try { subChartRef.current.remove(); } catch (_) {}
      subChartRef.current = null;
    }
    if ((!showRSI && !showMACD) || !subChartContainerRef.current || bars.length < 30) return;

    const isIntraday = ['m5', 'm15', 'm30', 'h1', 'h4'].includes(timeframe);
    const sc = createChart(subChartContainerRef.current, {
      layout: { background: { color: '#0b1120' }, textColor: '#94a3b8', fontSize: 10, fontFamily: 'Outfit, Inter, system-ui, sans-serif' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      crosshair: { mode: 1, vertLine: { color: '#6366f1', width: 1, style: 3 } },
      rightPriceScale: { borderColor: '#1e293b' },
      timeScale: { borderColor: '#1e293b', timeVisible: isIntraday, secondsVisible: false },
      handleScale: false,
      handleScroll: false,
    });

    if (showRSI && bars.length > 15) {
      const rsiData = calculateRSI(bars, 14);
      const rsiS = sc.addSeries(LineSeries, { color: '#facc15', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true });
      rsiS.setData(rsiData);
      rsiS.createPriceLine({ price: 70, color: 'rgba(239,68,68,0.5)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '70' });
      rsiS.createPriceLine({ price: 30, color: 'rgba(16,185,129,0.5)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '30' });
    }
    if (showMACD && bars.length > 40) {
      const { macdLine, signalLine, histogram } = calculateMACD(bars);
      sc.addSeries(HistogramSeries, { color: '#34d399' }).setData(histogram);
      sc.addSeries(LineSeries, { color: '#34d399', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false }).setData(macdLine);
      sc.addSeries(LineSeries, { color: '#f43f5e', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false }).setData(signalLine);
    }

    sc.timeScale().fitContent();
    subChartRef.current = sc;

    // Sync scroll
    if (chartRef.current) {
      chartRef.current.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range && sc) sc.timeScale().setVisibleLogicalRange(range);
      });
      sc.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range && chartRef.current) chartRef.current.timeScale().setVisibleLogicalRange(range);
      });
    }
  }, [showRSI, showMACD, timeframe]);

  // Reinitialize chart when backtest becomes active
  useEffect(() => {
    if (!isBacktestActive || !chartContainerRef.current) return;

    const isIntraday = ['m5', 'm15', 'm30', 'h1', 'h4'].includes(timeframe);

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { color: '#0f172a' }, textColor: '#94a3b8', fontSize: 11, fontFamily: 'Outfit, Inter, system-ui, sans-serif' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      crosshair: {
        mode: 1,
        vertLine: { color: '#6366f1', width: 1, style: 3, labelBackgroundColor: '#6366f1' },
        horzLine: { color: '#6366f1', width: 1, style: 3, labelBackgroundColor: '#6366f1' },
      },
      rightPriceScale: { borderColor: '#1e293b' },
      timeScale: { borderColor: '#1e293b', timeVisible: isIntraday, secondsVisible: false },
    });
    chartRef.current = chart;

    const cSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981', downColor: '#ef4444', borderVisible: false,
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
    });
    candlestickSeriesRef.current = cSeries;

    const vSeries = chart.addSeries(HistogramSeries, { color: '#3b82f6', priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
    volumeSeriesRef.current = vSeries;
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });

    // Populate history bars
    const initBars = historyData.map(d => ({ time: d.timestamp, close: d.close, open: d.open, high: d.high, low: d.low, volume: d.volume }));
    visibleBarsRef.current = initBars;

    if (initBars.length > 0) {
      cSeries.setData(initBars.map(d => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close })));
      vSeries.setData(initBars.map(d => ({ time: d.time, value: d.volume, color: d.close >= d.open ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)' })));
    }
    chart.timeScale().fitContent();

    rebuildIndicators(chart);
    rebuildSubChart();

    const handleResize = () => {
      if (chartContainerRef.current) chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      if (subChartRef.current && subChartContainerRef.current) subChartRef.current.applyOptions({ width: subChartContainerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      if (subChartRef.current) { try { subChartRef.current.remove(); } catch (_) {} subChartRef.current = null; }
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    };
  }, [isBacktestActive]);

  // Rebuild indicators when toggle changes (while chart exists)
  useEffect(() => {
    if (isBacktestActive && chartRef.current) {
      rebuildIndicators(chartRef.current);
      rebuildSubChart();
    }
  }, [showSMA20, showEMA50, showEMA200, showBB, showRSI, showMACD, showSNR, showSND]);

  // ─── Backtest Configuration ───
  const handleStartBacktest = async (e) => {
    e.preventDefault();
    if (!ticker) { alert('Pilih saham terlebih dahulu.'); return; }
    if (startDate >= endDate) { alert('Tanggal mulai harus lebih awal dari tanggal selesai.'); return; }

    setLoadingData(true);
    setErrorMsg(null);

    const fTicker = ticker.endsWith('.JK') ? ticker : `${ticker}.JK`;
    try {
      const res = await fetch(`${API_BASE_URL}/api/stocks/${fTicker}/chart?timeframe=${timeframe}`);
      if (!res.ok) throw new Error('Gagal mengambil data chart dari backend.');
      const raw = await res.json();
      if (raw.length === 0) throw new Error('Data chart kosong. Coba sync data terlebih dahulu.');

      const sorted = [...raw].sort((a, b) => a.timestamp - b.timestamp);
      const startIdx = sorted.findIndex(d => d.date.substring(0, 10) >= startDate);
      const endIdx   = sorted.findLastIndex(d => d.date.substring(0, 10) <= endDate);

      if (startIdx === -1 || endIdx === -1 || startIdx > endIdx)
        throw new Error(`Tidak ada data untuk rentang ${startDate} – ${endDate}.`);

      const hist   = sorted.slice(0, startIdx);
      const replay = sorted.slice(startIdx, endIdx + 1);

      setHistoryData(hist);
      setReplayData(replay);
      replayDataRef.current = replay;

      const initPrice = hist.length > 0 ? hist[hist.length - 1].close : replay[0].open;
      const initDate  = hist.length > 0 ? hist[hist.length - 1].date  : replay[0].date;
      setCurrentPrice(initPrice);
      setCurrentDate(initDate);
      setPlaybackIndex(0);
      playbackIndexRef.current = 0;

      setPortfolio({ cash: 10000000.0, holdings: {} });
      setTradeHistory([]);
      setIsBacktestActive(true);
      setIsReplayPlaying(false);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoadingData(false);
    }
  };

  // ─── Replay Controls ───
  const advanceOneBar = useCallback(() => {
    const idx  = playbackIndexRef.current;
    const data = replayDataRef.current;
    if (idx >= data.length) {
      clearInterval(playbackTimerRef.current);
      isPlayingRef.current = false;
      setIsReplayPlaying(false);
      alert('Backtest Selesai! Seluruh lilin sudah direproduksi.');
      return;
    }
    const candle = data[idx];

    // Append to candle + volume series
    if (candlestickSeriesRef.current) {
      candlestickSeriesRef.current.update({ time: candle.timestamp, open: candle.open, high: candle.high, low: candle.low, close: candle.close });
    }
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.update({ time: candle.timestamp, value: candle.volume, color: candle.close >= candle.open ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)' });
    }

    // Update visible bars for indicators
    const newBar = { time: candle.timestamp, close: candle.close, open: candle.open, high: candle.high, low: candle.low, volume: candle.volume };
    visibleBarsRef.current = [...visibleBarsRef.current, newBar];

    // Rebuild overlay indicators incrementally (every 5 bars to avoid performance hit)
    if (chartRef.current && (idx % 5 === 0 || idx === data.length - 1)) {
      rebuildIndicators(chartRef.current);
    }

    setCurrentPrice(candle.close);
    setCurrentDate(candle.date);
    playbackIndexRef.current = idx + 1;
    setPlaybackIndex(idx + 1);
  }, [rebuildIndicators]);

  const startReplay = () => {
    if (isPlayingRef.current) return;
    const delayMap = { 1: 1000, 2: 500, 5: 200, 10: 100 };
    const delay = delayMap[speed] || 500;
    isPlayingRef.current = true;
    setIsReplayPlaying(true);
    playbackTimerRef.current = setInterval(advanceOneBar, delay);
  };

  const pauseReplay = () => {
    clearInterval(playbackTimerRef.current);
    isPlayingRef.current = false;
    setIsReplayPlaying(false);
  };

  // Restart timer when speed changes mid-play
  useEffect(() => {
    if (isPlayingRef.current) { pauseReplay(); startReplay(); }
  }, [speed]);

  const handleStopBacktest = () => {
    pauseReplay();
    setIsBacktestActive(false);
    setHistoryData([]); setReplayData([]); replayDataRef.current = [];
    setPlaybackIndex(0); playbackIndexRef.current = 0;
    setCurrentPrice(0); setCurrentDate('');
    visibleBarsRef.current = [];
  };

  // ─── Sandbox Trading ───
  const handleBuy = () => {
    if (currentPrice <= 0) return;
    const cost = lotsToTrade * 100 * currentPrice;
    if (portfolio.cash < cost) { alert(`Dana tidak cukup! Butuh Rp ${cost.toLocaleString('id-ID')}`); return; }
    const key = ticker.toUpperCase();
    const h   = { ...portfolio.holdings };
    if (h[key]) {
      const newLots = h[key].lots + lotsToTrade;
      const newAvg  = ((h[key].lots * 100 * h[key].avgPrice) + cost) / (newLots * 100);
      h[key] = { lots: newLots, avgPrice: newAvg };
    } else {
      h[key] = { lots: lotsToTrade, avgPrice: currentPrice };
    }
    setPortfolio({ cash: portfolio.cash - cost, holdings: h });
    setTradeHistory(prev => [{ id: Date.now(), date: currentDate, type: 'BUY', price: currentPrice, lots: lotsToTrade, total: cost }, ...prev]);
  };

  const handleSell = () => {
    const key = ticker.toUpperCase();
    const h   = { ...portfolio.holdings };
    if (!h[key] || h[key].lots < lotsToTrade) { alert(`Saham tidak cukup! Anda memiliki ${h[key]?.lots || 0} lot`); return; }
    const revenue = lotsToTrade * 100 * currentPrice;
    const rem = h[key].lots - lotsToTrade;
    if (rem === 0) delete h[key]; else h[key].lots = rem;
    setPortfolio({ cash: portfolio.cash + revenue, holdings: h });
    setTradeHistory(prev => [{ id: Date.now(), date: currentDate, type: 'SELL', price: currentPrice, lots: lotsToTrade, total: revenue }, ...prev]);
  };

  // ─── Derived Values ───
  const stockKey = ticker.toUpperCase();
  const posLots  = portfolio.holdings[stockKey]?.lots    || 0;
  const posAvg   = portfolio.holdings[stockKey]?.avgPrice || 0;
  const posVal   = posLots * 100 * currentPrice;
  const posCost  = posLots * 100 * posAvg;
  const uPL      = posVal - posCost;
  const uPLPct   = posCost > 0 ? (uPL / posCost) * 100 : 0;
  const totalVal = portfolio.cash + posVal;
  const totalPL  = totalVal - 10000000;
  const totalPct = (totalPL / 10000000) * 100;
  const hasSubPanel = showRSI || showMACD;

  return (
    <div className="backtest-container">
      <div className="backtest-header">
        <h3>Backtest & Bar Replay</h3>
        <span className="subtitle">Latih strategi trading Anda di data historis dengan kecepatan lilin terkontrol</span>
      </div>

      {!isBacktestActive ? (
        <div className="backtest-config-card">
          <h4>Konfigurasi Sesi Replay</h4>
          {errorMsg && <div className="app-error-banner">{errorMsg}</div>}

          <form onSubmit={handleStartBacktest} className="backtest-config-form">
            <div className="config-form-row">
              <div className="config-group">
                <label>Kode Saham</label>
                <select value={ticker} onChange={e => setTicker(e.target.value)} className="config-input">
                  {stocks.map(s => {
                    const ct = s.ticker.replace('.JK', '');
                    return <option key={s.id} value={ct}>{ct} – {s.name}</option>;
                  })}
                </select>
              </div>
              <div className="config-group">
                <label>Timeframe</label>
                <select value={timeframe} onChange={e => setTimeframe(e.target.value)} className="config-input">
                  <option value="m5">5 Menit (M5)</option>
                  <option value="m15">15 Menit (M15)</option>
                  <option value="m30">30 Menit (M30)</option>
                  <option value="h1">1 Jam (H1)</option>
                  <option value="h4">4 Jam (H4)</option>
                  <option value="d1">Harian (D1)</option>
                  <option value="mn">Bulanan (MN)</option>
                </select>
              </div>
            </div>

            <div className="config-form-row">
              <div className="config-group">
                <label>Tanggal Mulai Replay</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="config-input" required />
              </div>
              <div className="config-group">
                <label>Tanggal Akhir Replay</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="config-input" required />
              </div>
            </div>

            <div className="config-group">
              <label>Kecepatan Awal Lilin</label>
              <div className="speed-buttons-group">
                {[1, 2, 5, 10].map(s => (
                  <button key={s} type="button" className={`speed-tab-btn ${speed === s ? 'active' : ''}`} onClick={() => setSpeed(s)}>
                    {s}x {s === 1 ? '(1 lilin/dtk)' : `(${s} lilin/dtk)`}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" className="config-submit-btn" disabled={loadingData}>
              {loadingData ? 'Memuat Data Historis...' : 'Mulai Sesi Backtest'}
            </button>
          </form>
        </div>
      ) : (
        <div className="backtest-workspace">
          {/* Player Bar */}
          <div className="replay-player-bar">
            <div className="player-meta">
              <span className="ticker-badge">{ticker}</span>
              <span className="timeframe-badge">{timeframe.toUpperCase()}</span>
              <span className="replay-date-display">{currentDate}</span>
              <span className="replay-price-display">Rp {currentPrice.toLocaleString('id-ID')}</span>
            </div>
            <div className="player-controls">
              {isReplayPlaying
                ? <button className="player-btn pause" onClick={pauseReplay}>⏸ Pause</button>
                : <button className="player-btn play"  onClick={startReplay}>▶ Play</button>}
              <button className="player-btn step" onClick={advanceOneBar} disabled={isReplayPlaying}>⏭ Next Bar</button>
              <button className="player-btn stop" onClick={handleStopBacktest}>⏹ Keluar</button>
            </div>
            <div className="player-speed-wrapper">
              <span className="speed-label">Kecepatan:</span>
              <div className="speed-selector-pill">
                {[1, 2, 5, 10].map(s => (
                  <button key={s} className={`speed-pill-btn ${speed === s ? 'active' : ''}`} onClick={() => setSpeed(s)}>{s}x</button>
                ))}
              </div>
            </div>
            <div className="player-progress">Lilin {playbackIndex} / {replayData.length}</div>
          </div>

          {/* Indicator Toggles for Backtest Chart */}
          <div className="backtest-indicator-bar">
            <span className="ind-bar-label">Indikator:</span>
            {INDICATORS.map(ind => (
              <button
                key={ind.key}
                className={`indicator-toggle-btn ${ind.state ? 'active' : ''}`}
                style={{ '--ind-color': ind.color }}
                onClick={() => ind.set(v => !v)}
              >
                {ind.label}
              </button>
            ))}
          </div>

          {/* Main Chart */}
          <div ref={chartContainerRef} className="backtest-chart-container" style={{ height: hasSubPanel ? '300px' : '380px', width: '100%' }} />

          {/* Sub Chart (RSI / MACD) */}
          {hasSubPanel && (
            <div className="sub-chart-wrapper">
              <div className="sub-chart-label">
                {showRSI  && <span style={{ color: '#facc15' }}>RSI 14</span>}
                {showMACD && <span style={{ color: '#34d399', marginLeft: '12px' }}>MACD (12,26,9)</span>}
              </div>
              <div ref={subChartContainerRef} style={{ height: '110px', width: '100%' }} />
            </div>
          )}

          {/* Trading Desk */}
          <div className="backtest-trading-desk">
            <div className="desk-card trade-actions">
              <h4>Eksekusi Simulasi Replay</h4>
              <div className="trade-pre-stats">
                <div className="pre-stat-item">
                  <span className="pre-label">Harga Replay Aktif</span>
                  <span className="pre-val">Rp {currentPrice.toLocaleString('id-ID')}</span>
                </div>
                <div className="pre-stat-item">
                  <span className="pre-label">Kas Tersedia</span>
                  <span className="pre-val">Rp {portfolio.cash.toLocaleString('id-ID')}</span>
                </div>
              </div>
              <div className="trade-lots-input-group">
                <label>Jumlah Transaksi (Lot)</label>
                <input type="number" value={lotsToTrade} onChange={e => setLotsToTrade(Math.max(1, parseInt(e.target.value) || 1))} className="trade-lots-input" />
              </div>
              <div className="trade-desk-buttons">
                <button className="trade-desk-btn buy"  onClick={handleBuy}>BUY (Beli)</button>
                <button className="trade-desk-btn sell" onClick={handleSell}>SELL (Jual)</button>
              </div>
            </div>

            <div className="desk-card portfolio-status">
              <h4>Portofolio Sesi Backtest</h4>
              <div className="desk-portfolio-stats">
                <div className="p-stat">
                  <span className="ps-label">Total Nilai Aset</span>
                  <span className="ps-val">Rp {totalVal.toLocaleString('id-ID')}</span>
                </div>
                <div className="p-stat">
                  <span className="ps-label">Total P&L</span>
                  <span className={`ps-val ${totalPL >= 0 ? 'text-success' : 'text-danger'}`}>
                    Rp {totalPL.toLocaleString('id-ID')} ({totalPct.toFixed(2)}%)
                  </span>
                </div>
                <div className="p-stat">
                  <span className="ps-label">Posisi Saat Ini</span>
                  <span className="ps-val">{posLots} lot</span>
                </div>
                <div className="p-stat">
                  <span className="ps-label">Unrealized P&L</span>
                  <span className={`ps-val ${uPL >= 0 ? 'text-success' : 'text-danger'}`}>
                    Rp {uPL.toLocaleString('id-ID')} ({uPLPct.toFixed(2)}%)
                  </span>
                </div>
              </div>
              <div className="holdings-sub-table">
                {posLots > 0 ? (
                  <table className="desk-table">
                    <thead><tr><th>Kode</th><th>Lot</th><th>Avg. Price</th><th>Value</th></tr></thead>
                    <tbody>
                      <tr>
                        <td>{ticker}</td>
                        <td>{posLots}</td>
                        <td>Rp {posAvg.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</td>
                        <td>Rp {posVal.toLocaleString('id-ID')}</td>
                      </tr>
                    </tbody>
                  </table>
                ) : <div className="desk-empty-state">Tidak ada kepemilikan saham aktif.</div>}
              </div>
            </div>

            <div className="desk-card trade-logs">
              <h4>Jurnal Transaksi Sesi Ini</h4>
              <div className="desk-table-wrapper">
                {tradeHistory.length > 0 ? (
                  <table className="desk-table">
                    <thead><tr><th>Tanggal</th><th>Tipe</th><th>Harga</th><th>Lot</th><th>Total</th></tr></thead>
                    <tbody>
                      {tradeHistory.map(h => (
                        <tr key={h.id}>
                          <td>{h.date}</td>
                          <td><span className={`type-badge ${h.type.toLowerCase()}`}>{h.type}</span></td>
                          <td>{h.price.toLocaleString('id-ID')}</td>
                          <td>{h.lots}</td>
                          <td>Rp {h.total.toLocaleString('id-ID')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div className="desk-empty-state">Belum ada transaksi di sesi ini.</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
