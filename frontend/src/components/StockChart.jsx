import React, { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import { calculateSMA, calculateEMA, calculateBollingerBands, calculateRSI, calculateMACD, calculateSNR, calculateSND } from './indicators.js';

export default function StockChart({ data, ticker, name, timeframe, onTimeframeChange }) {
  const chartContainerRef = useRef(null);
  const subChartContainerRef = useRef(null);

  // Indicator toggle states
  const [showSMA20, setShowSMA20] = useState(false);
  const [showEMA50, setShowEMA50] = useState(false);
  const [showEMA200, setShowEMA200] = useState(false);
  const [showBB, setShowBB] = useState(false);
  const [showRSI, setShowRSI] = useState(false);
  const [showMACD, setShowMACD] = useState(false);
  const [showSNR, setShowSNR] = useState(false);
  const [showSND, setShowSND] = useState(false);

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

  // Main chart + sub chart (RSI/MACD panel)
  useEffect(() => {
    if (!chartContainerRef.current || !data || data.length === 0) return;

    const isIntraday = ['m5', 'm15', 'm30', 'h1', 'h4'].includes(timeframe);
    const formattedData = data.map(d => ({ time: d.timestamp, close: d.close, open: d.open, high: d.high, low: d.low, volume: d.volume }));

    // --- Main Chart ---
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

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981', downColor: '#ef4444', borderVisible: false,
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
    });

    const volSeries = chart.addSeries(HistogramSeries, {
      color: '#3b82f6', priceFormat: { type: 'volume' }, priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });

    const chartData = formattedData.map(d => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close }));
    const volData   = formattedData.map(d => ({ time: d.time, value: d.volume, color: d.close >= d.open ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)' }));
    candleSeries.setData(chartData);
    volSeries.setData(volData);

    // --- Overlay Indicators on Main Chart ---
    if (showSMA20 && formattedData.length >= 20) {
      const smaLine = chart.addSeries(LineSeries, { color: '#38bdf8', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      smaLine.setData(calculateSMA(formattedData, 20));
    }
    if (showEMA50 && formattedData.length >= 50) {
      const emaLine = chart.addSeries(LineSeries, { color: '#f472b6', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      emaLine.setData(calculateEMA(formattedData, 50));
    }
    if (showEMA200 && formattedData.length >= 200) {
      const ema200 = chart.addSeries(LineSeries, { color: '#fb923c', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      ema200.setData(calculateEMA(formattedData, 200));
    }
    if (showBB && formattedData.length >= 20) {
      const bb = calculateBollingerBands(formattedData, 20, 2);
      const opts = { lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
      chart.addSeries(LineSeries, { ...opts, color: '#a78bfa' }).setData(bb.upper);
      chart.addSeries(LineSeries, { ...opts, color: '#6366f1', lineStyle: 2 }).setData(bb.middle);
      chart.addSeries(LineSeries, { ...opts, color: '#a78bfa' }).setData(bb.lower);
    }

    // --- SNR: Support & Resistance horizontal price lines ---
    if (showSNR && formattedData.length >= 11) {
      const { resistances, supports } = calculateSNR(formattedData);
      resistances.forEach(lvl => {
        candleSeries.createPriceLine({
          price: lvl.price,
          color: 'rgba(239, 68, 68, 0.75)',
          lineWidth: 1,
          lineStyle: 1, // dashed
          axisLabelVisible: true,
          title: 'R',
        });
      });
      supports.forEach(lvl => {
        candleSeries.createPriceLine({
          price: lvl.price,
          color: 'rgba(16, 185, 129, 0.75)',
          lineWidth: 1,
          lineStyle: 1,
          axisLabelVisible: true,
          title: 'S',
        });
      });
    }

    // --- SND: Supply & Demand zone bands (two LineSeries per zone) ---
    if (showSND && formattedData.length >= 10) {
      const { demandZones, supplyZones } = calculateSND(formattedData);
      const zoneSeriesOpts = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };

      demandZones.forEach(z => {
        // Upper and lower bound of demand zone → green band
        const lineOpts = { ...zoneSeriesOpts, color: 'rgba(16, 185, 129, 0.55)', lineWidth: 1, lineStyle: 0 };
        const upper = chart.addSeries(LineSeries, lineOpts);
        const lower = chart.addSeries(LineSeries, { ...lineOpts, color: 'rgba(16, 185, 129, 0.3)' });
        upper.setData([{ time: z.time, value: z.high }, { time: z.endTime, value: z.high }]);
        lower.setData([{ time: z.time, value: z.low  }, { time: z.endTime, value: z.low  }]);
      });

      supplyZones.forEach(z => {
        // Supply zone → red band
        const lineOpts = { ...zoneSeriesOpts, color: 'rgba(239, 68, 68, 0.55)', lineWidth: 1, lineStyle: 0 };
        const upper = chart.addSeries(LineSeries, lineOpts);
        const lower = chart.addSeries(LineSeries, { ...lineOpts, color: 'rgba(239, 68, 68, 0.3)' });
        upper.setData([{ time: z.time, value: z.high }, { time: z.endTime, value: z.high }]);
        lower.setData([{ time: z.time, value: z.low  }, { time: z.endTime, value: z.low  }]);
      });
    }

    chart.timeScale().fitContent();

    // --- Sub Chart (RSI or MACD) ---
    let subChart = null;
    if ((showRSI || showMACD) && subChartContainerRef.current) {
      subChart = createChart(subChartContainerRef.current, {
        layout: { background: { color: '#0b1120' }, textColor: '#94a3b8', fontSize: 10, fontFamily: 'Outfit, Inter, system-ui, sans-serif' },
        grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
        crosshair: { mode: 1, vertLine: { color: '#6366f1', width: 1, style: 3 }, horzLine: { color: '#475569', width: 1 } },
        rightPriceScale: { borderColor: '#1e293b', scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { borderColor: '#1e293b', timeVisible: isIntraday, secondsVisible: false },
        handleScale: false,
        handleScroll: false,
      });

      if (showRSI && formattedData.length > 15) {
        const rsiData = calculateRSI(formattedData, 14);
        const rsiSeries = subChart.addSeries(LineSeries, { color: '#facc15', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true });
        rsiSeries.setData(rsiData);
        // Overbought / Oversold reference lines via price lines
        rsiSeries.createPriceLine({ price: 70, color: 'rgba(239,68,68,0.5)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '70' });
        rsiSeries.createPriceLine({ price: 30, color: 'rgba(16,185,129,0.5)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '30' });
      }

      if (showMACD && formattedData.length > 40) {
        const { macdLine, signalLine, histogram } = calculateMACD(formattedData);
        subChart.addSeries(HistogramSeries, { color: '#34d399', priceScaleId: 'right' }).setData(histogram);
        subChart.addSeries(LineSeries, { color: '#34d399', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false }).setData(macdLine);
        subChart.addSeries(LineSeries, { color: '#f43f5e', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false }).setData(signalLine);
      }

      subChart.timeScale().fitContent();

      // Sync time-scale scrolling
      chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range && subChart) subChart.timeScale().setVisibleLogicalRange(range);
      });
      subChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range && chart) chart.timeScale().setVisibleLogicalRange(range);
      });
    }

    const handleResize = () => {
      if (chartContainerRef.current) chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      if (subChart && subChartContainerRef.current) subChart.applyOptions({ width: subChartContainerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      if (subChart) subChart.remove();
    };
  }, [data, timeframe, showSMA20, showEMA50, showEMA200, showBB, showRSI, showMACD, showSNR, showSND]);

  const hasSubPanel = showRSI || showMACD;

  return (
    <div className="chart-container">
      <div className="chart-header">
        <div className="chart-title-info">
          <h2>{ticker.replace('.JK', '')}</h2>
          <span className="stock-full-name">{name}</span>
        </div>
        <div className="chart-controls-row">
          <div className="timeframe-selector">
            {['m5', 'm15', 'm30', 'h1', 'h4', 'd1', 'mn'].map((tf) => (
              <button key={tf} className={`timeframe-btn ${timeframe === tf ? 'active' : ''}`} onClick={() => onTimeframeChange(tf)}>
                {tf.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="indicator-toggles">
            {INDICATORS.map(ind => (
              <button
                key={ind.key}
                className={`indicator-toggle-btn ${ind.state ? 'active' : ''}`}
                style={{ '--ind-color': ind.color }}
                onClick={() => ind.set(v => !v)}
                title={`Toggle ${ind.label}`}
              >
                {ind.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div ref={chartContainerRef} className="chart-canvas-wrapper" style={{ height: hasSubPanel ? '340px' : '450px', width: '100%' }} />

      {hasSubPanel && (
        <div className="sub-chart-wrapper">
          <div className="sub-chart-label">
            {showRSI && <span style={{ color: '#facc15' }}>RSI 14</span>}
            {showMACD && <span style={{ color: '#34d399', marginLeft: '12px' }}>MACD (12,26,9)</span>}
          </div>
          <div ref={subChartContainerRef} style={{ height: '130px', width: '100%' }} />
        </div>
      )}
    </div>
  );
}
