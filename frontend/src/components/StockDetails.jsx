import React, { useState } from 'react';

export default function StockDetails({ ticker, name, data, isSyncing, onSync, onTrade, isAutoSync, onToggleAutoSync }) {
  const [tradeLots, setTradeLots] = useState(1);

  if (!data || data.length === 0) {
    return (
      <div className="stock-details-card loading">
        <p>Memuat rincian data...</p>
      </div>
    );
  }

  // Get the two latest entries to calculate daily change
  const latestIndex = data.length - 1;
  const latest = data[latestIndex];
  const previous = data.length > 1 ? data[latestIndex - 1] : latest;

  const currentPrice = latest.close;
  const changeValue = currentPrice - previous.close;
  const changePercent = previous.close !== 0 ? (changeValue / previous.close) * 100 : 0;
  
  const isPositive = changeValue >= 0;
  const formattedChange = `${isPositive ? '+' : ''}${changeValue.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formattedPercent = `${isPositive ? '+' : ''}${changePercent.toFixed(2)}%`;

  const handleTradeClick = (type) => {
    onTrade(ticker, type, tradeLots, currentPrice);
  };

  return (
    <div className="stock-details-container">
      <div className="details-header-row">
        <div className="price-overview-panel">
          <div className="current-price-group">
            <span className="price-label">Harga Terakhir</span>
            <span className="price-value">Rp {currentPrice.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className={`price-change-badge ${isPositive ? 'positive' : 'negative'}`}>
            <span className="arrow">{isPositive ? '▲' : '▼'}</span>
            <span className="change-text">{formattedChange} ({formattedPercent})</span>
          </div>
        </div>

        <div className="details-actions-group">
          {/* Quick Trade Simulation */}
          <div className="quick-trade-form">
            <input
              type="number"
              min="1"
              value={tradeLots}
              onChange={(e) => setTradeLots(Math.max(1, parseInt(e.target.value) || 1))}
              className="quick-trade-lots-input"
              placeholder="Lot"
            />
            <span className="quick-trade-label">Lot</span>
            <button className="quick-trade-btn buy" onClick={() => handleTradeClick('BUY')}>
              Beli
            </button>
            <button className="quick-trade-btn sell" onClick={() => handleTradeClick('SELL')}>
              Jual
            </button>
          </div>

          <label className="realtime-toggle" title="Pantau harga realtime (Auto-sync 10s)">
            <input
              type="checkbox"
              checked={isAutoSync || false}
              onChange={(e) => onToggleAutoSync(e.target.checked)}
            />
            {isAutoSync && <span className="pulse-dot"></span>}
            <span>Realtime</span>
          </label>

          <button 
            onClick={onSync} 
            disabled={isSyncing} 
            className={`sync-data-btn ${isSyncing ? 'spinning' : ''}`}
          >
            <svg className="sync-icon" viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M19 8l-4 4h3c0 3.31-2.69 6-6 6-1.01 0-1.97-.25-2.8-.7l-1.46 1.46C8.97 19.54 10.43 20 12 20c4.42 0 8-3.58 8-8h3l-4-4zM6 12c0-3.31 2.69-6 6-6 1.01 0 1.97.25 2.8.7l1.46-1.46C15.03 4.46 13.57 4 12 4c-4.42 0-8 3.58-8 8H1l4 4 4-4H6z"/>
            </svg>
            {isSyncing ? '...' : 'Sinkron'}
          </button>
        </div>
      </div>

      <div className="stats-cards-grid">
        <div className="stat-card">
          <span className="stat-name">Open</span>
          <span className="stat-val">Rp {latest.open.toLocaleString('id-ID')}</span>
        </div>
        <div className="stat-card">
          <span className="stat-name">High</span>
          <span className="stat-val high">Rp {latest.high.toLocaleString('id-ID')}</span>
        </div>
        <div className="stat-card">
          <span className="stat-name">Low</span>
          <span className="stat-val low">Rp {latest.low.toLocaleString('id-ID')}</span>
        </div>
        <div className="stat-card">
          <span className="stat-name">Close</span>
          <span className="stat-val">Rp {latest.close.toLocaleString('id-ID')}</span>
        </div>
        <div className="stat-card double-width">
          <span className="stat-name">Tanggal Data</span>
          <span className="stat-val date">{latest.date}</span>
        </div>
      </div>
    </div>
  );
}
