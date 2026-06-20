import React from 'react';

export default function PortfolioPanel({ portfolio, stockList, currentStock, currentPrice, onTrade, onReset }) {
  const { cash, holdings } = portfolio;

  // Calculate current market value of all holdings
  // We look up the latest close price for each ticker
  // If the ticker is the currentStock, we use currentPrice. Otherwise, we can estimate or fallback to avg_price.
  let holdingsValue = 0;
  
  const enrichedHoldings = holdings.map((holding) => {
    let curPrice = holding.avg_price; // fallback
    
    if (holding.ticker === currentStock?.ticker && currentPrice) {
      curPrice = currentPrice;
    } else {
      // Find current stock close from stockList or estimate
      // Since we don't have historical prices loaded for all stocks at once, we use avg_price as fallback,
      // but if we have the list, we can show it. For simplicity, if we are not actively viewing the stock,
      // we show a nice estimate or fallback to avg_price. To make it real, let's keep it close or fallback.
      curPrice = holding.avg_price;
    }

    const cost = holding.lots * 100 * holding.avg_price;
    const value = holding.lots * 100 * curPrice;
    const pl = value - cost;
    const plPercent = cost !== 0 ? (pl / cost) * 100 : 0;
    
    holdingsValue += value;

    return {
      ...holding,
      currentPrice: curPrice,
      value,
      pl,
      plPercent
    };
  });

  const totalValue = cash + holdingsValue;
  const totalCost = cash + holdings.reduce((sum, h) => sum + (h.lots * 100 * h.avg_price), 0);
  const totalPL = totalValue - 10000000.0; // P&L compared to starting capital of 10M
  const totalPLPercent = (totalPL / 10000000.0) * 100;
  const isPositive = totalPL >= 0;

  const handleQuickSell = (ticker, lots, price) => {
    if (window.confirm(`Jual seluruh posisi (${lots} lot) saham ${ticker.replace('.JK', '')}?`)) {
      onTrade(ticker, 'SELL', lots, price);
    }
  };

  return (
    <div className="portfolio-panel-container">
      <div className="portfolio-header">
        <div className="portfolio-header-left">
          <h3>Simulasi Portofolio (Paper Trading)</h3>
          <span className="subtitle">Modal Awal: Rp 10.000.000</span>
        </div>
        <button className="reset-portfolio-btn" onClick={onReset}>
          Reset Akun
        </button>
      </div>

      <div className="portfolio-stats-grid">
        <div className="portfolio-stat-card">
          <span className="p-stat-name">Total Nilai Akun</span>
          <span className="p-stat-val">Rp {totalValue.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="portfolio-stat-card">
          <span className="p-stat-name">Dana Tunai (Cash)</span>
          <span className="p-stat-val">Rp {cash.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="portfolio-stat-card">
          <span className="p-stat-name">Nilai Saham</span>
          <span className="p-stat-val">Rp {holdingsValue.toLocaleString('id-ID', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className={`portfolio-stat-card pl-card ${isPositive ? 'positive' : 'negative'}`}>
          <span className="p-stat-name">Total Profit / Loss</span>
          <span className="p-stat-val">
            {isPositive ? '▲' : '▼'} {totalPL.toLocaleString('id-ID', { minimumFractionDigits: 2 })} ({totalPLPercent.toFixed(2)}%)
          </span>
        </div>
      </div>

      <div className="holdings-section">
        <h4>Posisi Terbuka</h4>
        {enrichedHoldings.length === 0 ? (
          <div className="empty-holdings">Belum ada saham yang dibeli. Silakan beli melalui panel transaksi di atas.</div>
        ) : (
          <div className="holdings-table-wrapper">
            <table className="holdings-table">
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Jumlah</th>
                  <th>Avg Price</th>
                  <th>Harga Saat Ini</th>
                  <th>Nilai Pasar</th>
                  <th>P&L (%)</th>
                  <th style={{ textAlign: 'center' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {enrichedHoldings.map((holding) => {
                  const holdingPLPos = holding.pl >= 0;
                  return (
                    <tr key={holding.stock_id}>
                      <td className="holding-ticker"><strong>{holding.ticker.replace('.JK', '')}</strong></td>
                      <td>{holding.lots} lot</td>
                      <td>Rp {holding.avg_price.toLocaleString('id-ID')}</td>
                      <td>Rp {holding.currentPrice.toLocaleString('id-ID')}</td>
                      <td>Rp {holding.value.toLocaleString('id-ID')}</td>
                      <td className={holdingPLPos ? 'text-success' : 'text-danger'}>
                        {holdingPLPos ? '+' : ''}{holding.pl.toLocaleString('id-ID')} ({holding.plPercent.toFixed(2)}%)
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="quick-sell-btn"
                          onClick={() => handleQuickSell(holding.ticker, holding.lots, holding.currentPrice)}
                        >
                          Jual Semua
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
  );
}
