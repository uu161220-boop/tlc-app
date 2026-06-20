import React, { useState, useEffect } from 'react';

export default function AverageCalculator({ currentStock, currentPrice }) {
  const [avgPrice1, setAvgPrice1] = useState(9000);
  const [lots1, setLots1] = useState(10);
  const [buyPrice2, setBuyPrice2] = useState(8500);
  const [lots2, setLots2] = useState(10);

  // Auto-populate when current stock changes
  useEffect(() => {
    if (currentPrice) {
      setAvgPrice1(currentPrice);
      // set purchase price slightly lower for average down simulation
      setBuyPrice2(Math.round(currentPrice * 0.95));
    }
  }, [currentStock, currentPrice]);

  // Calculations
  const qty1 = lots1 * 100;
  const cost1 = qty1 * avgPrice1;

  const qty2 = lots2 * 100;
  const cost2 = qty2 * buyPrice2;

  const totalLots = lots1 + lots2;
  const totalQty = qty1 + qty2;
  const totalCapital = cost1 + cost2;
  
  const newAvgPrice = totalQty !== 0 ? totalCapital / totalQty : 0;
  
  const priceDiff = newAvgPrice - avgPrice1;
  const priceDiffPercent = avgPrice1 !== 0 ? (priceDiff / avgPrice1) * 100 : 0;

  const isAverageDown = buyPrice2 < avgPrice1;

  const handlePrefillCurrentPrice = () => {
    if (currentPrice) {
      setBuyPrice2(currentPrice);
    }
  };

  return (
    <div className="calculator-container">
      <div className="calculator-header">
        <h3>Kalkulator Average Saham (Down/Up)</h3>
        <span className="subtitle">Hitung rata-rata harga saham Anda setelah pembelian baru</span>
      </div>

      <div className="calculator-layout">
        {/* Input Card */}
        <div className="calc-card input-card">
          <h4>Parameter Pembelian</h4>
          
          {currentStock && (
            <div className="calc-stock-badge">
              <span>Menggunakan data saham: <strong>{currentStock.ticker.replace('.JK', '')}</strong> (Rp {currentPrice?.toLocaleString('id-ID')})</span>
            </div>
          )}

          <div className="calc-sections-group">
            {/* Purchase 1 (Current Holding) */}
            <div className="calc-form-section">
              <h5>Kepemilikan Saat Ini (Pembelian 1)</h5>
              <div className="calc-input-row">
                <div className="calc-input-group">
                  <label>Avg. Price (Rp)</label>
                  <input
                    type="number"
                    value={avgPrice1}
                    onChange={(e) => setAvgPrice1(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="calc-input"
                  />
                </div>
                <div className="calc-input-group">
                  <label>Jumlah (Lot)</label>
                  <input
                    type="number"
                    value={lots1}
                    onChange={(e) => setLots1(Math.max(0, parseInt(e.target.value) || 0))}
                    className="calc-input"
                  />
                </div>
              </div>
              <div className="calc-subtotal-text">
                Modal Awal: Rp {cost1.toLocaleString('id-ID')} ({qty1.toLocaleString('id-ID')} lembar)
              </div>
            </div>

            {/* Purchase 2 (New Buy) */}
            <div className="calc-form-section">
              <div className="section-title-with-action">
                <h5>Pembelian Baru (Pembelian 2)</h5>
                {currentPrice && (
                  <button className="prefill-btn" onClick={handlePrefillCurrentPrice}>
                    Gunakan Harga Running
                  </button>
                )}
              </div>
              <div className="calc-input-row">
                <div className="calc-input-group">
                  <label>Harga Beli Baru (Rp)</label>
                  <input
                    type="number"
                    value={buyPrice2}
                    onChange={(e) => setBuyPrice2(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="calc-input"
                  />
                </div>
                <div className="calc-input-group">
                  <label>Jumlah (Lot)</label>
                  <input
                    type="number"
                    value={lots2}
                    onChange={(e) => setLots2(Math.max(0, parseInt(e.target.value) || 0))}
                    className="calc-input"
                  />
                </div>
              </div>
              <div className="calc-subtotal-text">
                Modal Baru: Rp {cost2.toLocaleString('id-ID')} ({qty2.toLocaleString('id-ID')} lembar)
              </div>
            </div>
          </div>
        </div>

        {/* Result Card */}
        <div className="calc-card result-card">
          <h4>Hasil Kalkulasi</h4>
          
          <div className="calc-results-display">
            <div className="result-main-group">
              <span className="result-main-label">Harga Rata-Rata Baru (New Average)</span>
              <span className="result-main-val">Rp {newAvgPrice.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>

            <div className={`result-badge-indicator ${priceDiff <= 0 ? 'avg-down' : 'avg-up'}`}>
              <span className="badge-arrow">{priceDiff <= 0 ? '▼' : '▲'}</span>
              <span>
                Average {isAverageDown ? 'Down' : 'Up'} sebesar {Math.abs(priceDiff).toLocaleString('id-ID', { maximumFractionDigits: 2 })} Rupiah ({priceDiffPercent.toFixed(2)}%)
              </span>
            </div>

            <div className="result-grid">
              <div className="result-item">
                <span className="res-name">Total Modal</span>
                <span className="res-val">Rp {totalCapital.toLocaleString('id-ID')}</span>
              </div>
              <div className="result-item">
                <span className="res-name">Total Jumlah Lot</span>
                <span className="res-val">{totalLots} lot</span>
              </div>
              <div className="result-item">
                <span className="res-name">Total Lembar Saham</span>
                <span className="res-val">{totalQty.toLocaleString('id-ID')} lembar</span>
              </div>
              <div className="result-item">
                <span className="res-name">Avg. Price Awal</span>
                <span className="res-val">Rp {avgPrice1.toLocaleString('id-ID')}</span>
              </div>
            </div>

            {totalLots > 0 && (
              <div className="calc-analysis-box">
                <h5>Analisis Singkat:</h5>
                <p>
                  Dengan membeli <strong>{lots2} lot</strong> baru di harga <strong>Rp {buyPrice2.toLocaleString('id-ID')}</strong>, 
                  Anda telah {isAverageDown ? 'menurunkan' : 'menaikkan'} harga rata-rata beli dari 
                  Rp {avgPrice1.toLocaleString('id-ID')} menjadi <strong>Rp {newAvgPrice.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</strong>. 
                  Porsi kepemilikan baru Anda adalah sebesar <strong>{((lots2/totalLots)*100).toFixed(0)}%</strong> dari keseluruhan kepemilikan Anda.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
