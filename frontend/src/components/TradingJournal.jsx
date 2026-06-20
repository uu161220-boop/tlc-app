import React, { useState, useEffect } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export default function TradingJournal({ stocks, currentStock, currentPrice }) {
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [ticker, setTicker] = useState('');
  const [tradeType, setTradeType] = useState('BUY'); // 'BUY' or 'SELL'
  const [price, setPrice] = useState(0);
  const [lots, setLots] = useState(1);
  const [setup, setSetup] = useState('Breakout');
  const [targetPrice, setTargetPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [notes, setNotes] = useState('');

  // Filter State
  const [filterTicker, setFilterTicker] = useState('');
  const [filterSetup, setFilterSetup] = useState('ALL');

  // Pre-fill ticker and price when current stock changes
  useEffect(() => {
    if (currentStock) {
      setTicker(currentStock.ticker.replace('.JK', ''));
    }
    if (currentPrice) {
      setPrice(currentPrice);
    }
  }, [currentStock, currentPrice]);

  // Fetch entries on load
  const fetchEntries = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/journal`);
      if (!res.ok) {
        throw new Error('Gagal mengambil data jurnal trading');
      }
      const data = await res.json();
      setEntries(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Koneksi ke server gagal. Gagal mengambil catatan jurnal.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!ticker.trim()) {
      alert('Ticker saham harus diisi.');
      return;
    }
    if (price <= 0 || lots <= 0) {
      alert('Harga dan jumlah lot harus lebih dari 0.');
      return;
    }

    // Format ticker (append .JK if missing and not already there)
    let formattedTicker = ticker.trim().toUpperCase();
    if (!formattedTicker.endsWith('.JK') && formattedTicker.length <= 5) {
      formattedTicker = `${formattedTicker}.JK`;
    }

    const payload = {
      date,
      ticker: formattedTicker,
      trade_type: tradeType,
      price: parseFloat(price),
      lots: parseInt(lots),
      setup: setup || null,
      notes: notes.trim() || null,
      target_price: targetPrice ? parseFloat(targetPrice) : null,
      stop_loss: stopLoss ? parseFloat(stopLoss) : null
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/journal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'Gagal menambahkan jurnal.');
      }

      // Reset form fields (keep date & ticker as is for convenience, reset numbers & notes)
      setLots(1);
      setTargetPrice('');
      setStopLoss('');
      setNotes('');
      
      // Refresh journal entries
      await fetchEntries();
      alert('Catatan jurnal berhasil ditambahkan.');
    } catch (err) {
      console.error(err);
      alert(`Gagal menyimpan jurnal: ${err.message}`);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus catatan jurnal ini?')) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/journal/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'Gagal menghapus jurnal');
      }

      await fetchEntries();
      alert('Catatan jurnal berhasil dihapus.');
    } catch (err) {
      console.error(err);
      alert(`Gagal menghapus jurnal: ${err.message}`);
    }
  };

  // Stats Calculations
  const totalTrades = entries.length;
  const buyTradesCount = entries.filter((e) => e.type === 'BUY').length;
  const sellTradesCount = entries.filter((e) => e.type === 'SELL').length;
  
  const totalBuyValue = entries
    .filter((e) => e.type === 'BUY')
    .reduce((acc, e) => acc + e.lots * 100 * e.price, 0);

  const totalSellValue = entries
    .filter((e) => e.type === 'SELL')
    .reduce((acc, e) => acc + e.lots * 100 * e.price, 0);

  // Filters logic
  const filteredEntries = entries.filter((entry) => {
    const tickerMatch = entry.ticker.toLowerCase().includes(filterTicker.toLowerCase());
    const setupMatch = filterSetup === 'ALL' || entry.setup === filterSetup;
    return tickerMatch && setupMatch;
  });

  return (
    <div className="journal-container">
      <div className="journal-header">
        <h3>Jurnal Trading Saham</h3>
        <span className="subtitle">Catat, analisis, dan tingkatkan disiplin trading Anda</span>
      </div>

      {/* Summary Cards */}
      <div className="journal-stats-grid">
        <div className="journal-stat-card">
          <span className="j-stat-name">Total Transaksi</span>
          <span className="j-stat-val">{totalTrades} trade</span>
        </div>
        <div className="journal-stat-card">
          <span className="j-stat-name">Transaksi Beli / Jual</span>
          <span className="j-stat-val">
            <span className="text-success">{buyTradesCount} B</span> / <span className="text-danger">{sellTradesCount} S</span>
          </span>
        </div>
        <div className="journal-stat-card">
          <span className="j-stat-name">Total Modal Logged (Beli)</span>
          <span className="j-stat-val">Rp {totalBuyValue.toLocaleString('id-ID')}</span>
        </div>
        <div className="journal-stat-card">
          <span className="j-stat-name">Total Penjualan Logged</span>
          <span className="j-stat-val">Rp {totalSellValue.toLocaleString('id-ID')}</span>
        </div>
      </div>

      {error && <div className="app-error-banner">{error}</div>}

      <div className="journal-layout">
        {/* Input Form Card */}
        <div className="journal-card form-card">
          <h4>Catat Transaksi Baru</h4>
          <form onSubmit={handleSubmit} className="journal-form">
            <div className="journal-form-row">
              <div className="journal-input-group">
                <label>Tanggal Transaksi</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="journal-input"
                  required
                />
              </div>
              <div className="journal-input-group">
                <label>Ticker Saham (e.g. GOTO)</label>
                <input
                  type="text"
                  placeholder="Kode Saham"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  className="journal-input"
                  required
                />
              </div>
            </div>

            <div className="journal-form-row">
              <div className="journal-input-group">
                <label>Tipe Transaksi</label>
                <div className="trade-type-toggle">
                  <button
                    type="button"
                    className={`toggle-btn buy ${tradeType === 'BUY' ? 'active' : ''}`}
                    onClick={() => setTradeType('BUY')}
                  >
                    BUY
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn sell ${tradeType === 'SELL' ? 'active' : ''}`}
                    onClick={() => setTradeType('SELL')}
                  >
                    SELL
                  </button>
                </div>
              </div>
              <div className="journal-input-group">
                <label>Setup / Strategi</label>
                <select
                  value={setup}
                  onChange={(e) => setSetup(e.target.value)}
                  className="journal-input select-input"
                >
                  <option value="Breakout">Breakout (BO)</option>
                  <option value="Buy on Weakness">Buy on Weakness (BoW)</option>
                  <option value="Support Buy">Buy on Support (BoS)</option>
                  <option value="Trend Following">Trend Following</option>
                  <option value="Scalping">Scalping / Fast Trade</option>
                  <option value="Panic Selling">Panic Selling</option>
                  <option value="Other">Lainnya</option>
                </select>
              </div>
            </div>

            <div className="journal-form-row">
              <div className="journal-input-group">
                <label>Harga Per Lembar (Rp)</label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="journal-input"
                  required
                />
              </div>
              <div className="journal-input-group">
                <label>Jumlah Lot</label>
                <input
                  type="number"
                  value={lots}
                  onChange={(e) => setLots(Math.max(1, parseInt(e.target.value) || 1))}
                  className="journal-input"
                  required
                />
              </div>
            </div>

            <div className="journal-form-row">
              <div className="journal-input-group">
                <label>Stop Loss (SL) - Opsional</label>
                <input
                  type="number"
                  placeholder="Harga SL"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  className="journal-input"
                />
              </div>
              <div className="journal-input-group">
                <label>Target Price (TP) - Opsional</label>
                <input
                  type="number"
                  placeholder="Harga TP"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  className="journal-input"
                />
              </div>
            </div>

            <div className="journal-input-group full-width">
              <label>Catatan / Analisis & Emosi</label>
              <textarea
                placeholder="Kenapa membeli saham ini? Apa rencana exit? Bagaimana kondisi emosi Anda saat trading?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="journal-input textarea-input"
                rows="3"
              />
            </div>

            <button type="submit" className="journal-submit-btn">
              Simpan Jurnal Transaksi
            </button>
          </form>
        </div>

        {/* Log Entries Card */}
        <div className="journal-card log-card">
          <div className="log-card-header">
            <h4>Riwayat Transaksi</h4>
            <div className="log-filters">
              <input
                type="text"
                placeholder="Cari Ticker..."
                value={filterTicker}
                onChange={(e) => setFilterTicker(e.target.value)}
                className="filter-input search"
              />
              <select
                value={filterSetup}
                onChange={(e) => setFilterSetup(e.target.value)}
                className="filter-input select"
              >
                <option value="ALL">Semua Setup</option>
                <option value="Breakout">Breakout</option>
                <option value="Buy on Weakness">Buy on Weakness</option>
                <option value="Support Buy">Buy on Support</option>
                <option value="Trend Following">Trend Following</option>
                <option value="Scalping">Scalping</option>
                <option value="Panic Selling">Panic Selling</option>
                <option value="Other">Lainnya</option>
              </select>
            </div>
          </div>

          {isLoading ? (
            <div className="log-loading">Loading Jurnal...</div>
          ) : filteredEntries.length === 0 ? (
            <div className="empty-logs">Belum ada catatan jurnal trading yang cocok.</div>
          ) : (
            <div className="log-table-wrapper">
              <table className="log-table">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Ticker</th>
                    <th>Tipe</th>
                    <th>Harga</th>
                    <th>Lot</th>
                    <th>Total</th>
                    <th>SL / TP</th>
                    <th>Setup</th>
                    <th>Catatan</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry) => {
                    const totalVal = entry.lots * 100 * entry.price;
                    return (
                      <tr key={entry.id}>
                        <td className="no-wrap">{entry.date}</td>
                        <td className="journal-ticker">{entry.ticker.replace('.JK', '')}</td>
                        <td>
                          <span className={`type-badge ${entry.type.toLowerCase()}`}>
                            {entry.type}
                          </span>
                        </td>
                        <td>{entry.price.toLocaleString('id-ID')}</td>
                        <td>{entry.lots}</td>
                        <td className="no-wrap">Rp {totalVal.toLocaleString('id-ID')}</td>
                        <td className="no-wrap text-secondary">
                          {entry.stop_loss ? `SL: ${entry.stop_loss}` : '-'}
                          <br />
                          {entry.target_price ? `TP: ${entry.target_price}` : '-'}
                        </td>
                        <td>
                          <span className="setup-badge">{entry.setup || 'Other'}</span>
                        </td>
                        <td className="journal-notes-cell" title={entry.notes}>
                          {entry.notes || '-'}
                        </td>
                        <td>
                          <button
                            onClick={() => handleDelete(entry.id)}
                            className="journal-delete-btn"
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
