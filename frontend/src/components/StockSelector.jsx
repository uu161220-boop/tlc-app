import React, { useState } from 'react';

export default function StockSelector({ stocks, selectedTicker, onSelect, onAddTicker, isSyncing }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [newTicker, setNewTicker] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const filteredStocks = stocks.filter((stock) => {
    const query = searchQuery.toLowerCase();
    return (
      stock.ticker.toLowerCase().includes(query) ||
      stock.name.toLowerCase().includes(query) ||
      (stock.sector && stock.sector.toLowerCase().includes(query))
    );
  });

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!newTicker.trim()) return;
    
    let tickerUpper = newTicker.trim().toUpperCase();
    if (!tickerUpper.endsWith('.JK')) {
      tickerUpper = `${tickerUpper}.JK`;
    }

    // Check if already exists in list
    if (stocks.some(s => s.ticker === tickerUpper)) {
      setErrorMsg('Ticker sudah ada di daftar.');
      return;
    }

    setErrorMsg('');
    const success = await onAddTicker(tickerUpper);
    if (success) {
      setNewTicker('');
    } else {
      setErrorMsg('Gagal menambahkan ticker. Cek koneksi atau kode ticker.');
    }
  };

  return (
    <div className="stock-selector-sidebar">
      <div className="sidebar-header">
        <h3>Indonesian Stocks (IDX)</h3>
        <span className="subtitle">Real SQL-stored prices</span>
      </div>

      <div className="search-bar-container">
        <input
          type="text"
          placeholder="Cari kode saham atau nama..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        {searchQuery && (
          <button className="clear-search" onClick={() => setSearchQuery('')}>
            &times;
          </button>
        )}
      </div>

      <div className="stock-list-container">
        {filteredStocks.length === 0 ? (
          <div className="empty-state">Saham tidak ditemukan</div>
        ) : (
          filteredStocks.map((stock) => {
            const isSelected = stock.ticker === selectedTicker;
            return (
              <div
                key={stock.id || stock.ticker}
                className={`stock-item-card ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelect(stock)}
              >
                <div className="stock-card-left">
                  <span className="ticker-badge">{stock.ticker.replace('.JK', '')}</span>
                  <span className="stock-name-label">{stock.name}</span>
                </div>
                <div className="stock-card-right">
                  <span className="sector-tag">{stock.sector || 'IDX'}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="add-ticker-section">
        <h4>Tambah Saham Baru</h4>
        <form onSubmit={handleAddSubmit} className="add-ticker-form">
          <input
            type="text"
            placeholder="Contoh: UNVR, PGAS, ADRO"
            value={newTicker}
            onChange={(e) => {
              setNewTicker(e.target.value);
              setErrorMsg('');
            }}
            className="add-input"
            disabled={isSyncing}
          />
          <button type="submit" className="add-btn" disabled={isSyncing}>
            {isSyncing ? 'Loading...' : 'Tambah'}
          </button>
        </form>
        {errorMsg && <p className="error-text">{errorMsg}</p>}
      </div>
    </div>
  );
}
