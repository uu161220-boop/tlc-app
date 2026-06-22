import React, { useState, useEffect } from 'react';
import './App.css';
import StockSelector from './components/StockSelector';
import StockDetails from './components/StockDetails';
import StockChart from './components/StockChart';
import ErrorBoundary from './components/ErrorBoundary';
import PortfolioPanel from './components/PortfolioPanel';
import AverageCalculator from './components/AverageCalculator';
import TradingJournal from './components/TradingJournal';
import BacktestPanel from './components/BacktestPanel';
import LoginPage from './components/LoginPage';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export default function App() {
  const [stocks, setStocks] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [timeframe, setTimeframe] = useState('d1');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [isAutoSync, setIsAutoSync] = useState(true); // default to enabled
  const [isSilentSyncing, setIsSilentSyncing] = useState(false);
  
  // Auth state — null = not logged in
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  
  // Navigation State
  const [activeTab, setActiveTab] = useState('chart');

  // Paper Trading Portfolio State
  const [portfolio, setPortfolio] = useState({ cash: 10000000.0, holdings: [] });

  // Restore session on mount
  useEffect(() => {
    const token = sessionStorage.getItem('tlc_token');
    if (!token) {
      setAuthChecked(true);
      return;
    }
    fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { 'X-Session-Token': token },
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.user) setCurrentUser(data.user);
        else sessionStorage.removeItem('tlc_token');
      })
      .catch(() => sessionStorage.removeItem('tlc_token'))
      .finally(() => setAuthChecked(true));
  }, []);

  // Real-time Auto Sync effect
  useEffect(() => {
    if (!isAutoSync || !selectedStock) return;

    const intervalId = setInterval(async () => {
      if (isSyncing || isSilentSyncing) return;
      
      setIsSilentSyncing(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/stocks/${selectedStock.ticker}/sync?timeframe=${timeframe}`, {
          method: 'POST'
        });
        const result = await response.json();
        if (response.ok && result.status !== 'error') {
          // Silent reload chart data
          const chartResponse = await fetch(`${API_BASE_URL}/api/stocks/${selectedStock.ticker}/chart?timeframe=${timeframe}`);
          if (chartResponse.ok) {
            const data = await chartResponse.json();
            setChartData(data);
          }
        }
      } catch (err) {
        console.error("Auto sync failed:", err);
      } finally {
        setIsSilentSyncing(false);
      }
    }, 10000); // sync every 10 seconds

    return () => clearInterval(intervalId);
  }, [isAutoSync, selectedStock?.ticker, timeframe, isSyncing, isSilentSyncing]);

  // Fetch stocks on mount
  useEffect(() => {
    async function initApp() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/stocks`);
        if (!response.ok) {
          throw new Error('Gagal mengambil daftar saham dari backend');
        }
        const data = await response.json();
        setStocks(data);
        
        // Select first stock by default (usually BBCA.JK)
        if (data.length > 0) {
          const defaultStock = data[0];
          setSelectedStock(defaultStock);
          await loadChartData(defaultStock.ticker, 'd1');
        }

        // Fetch simulation account portfolio
        await fetchPortfolio();
      } catch (err) {
        console.error(err);
        setError('Koneksi ke backend gagal. Pastikan uvicorn server berjalan di port 8000.');
      } finally {
        setIsLoading(false);
      }
    }
    initApp();
  }, []);

  const fetchPortfolio = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/portfolio`);
      if (response.ok) {
        const data = await response.json();
        setPortfolio(data);
      }
    } catch (err) {
      console.error("Gagal mengambil data portofolio:", err);
    }
  };

  const handleTrade = async (ticker, type, lots, price) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/portfolio/trade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ticker, trade_type: type, lots, price })
      });
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.detail || 'Gagal melakukan transaksi');
      }
      
      alert(result.message);
      await fetchPortfolio(); // refresh portfolio holdings & cash
    } catch (err) {
      console.error(err);
      alert(`Transaksi Gagal: ${err.message}`);
    }
  };

  const handleResetPortfolio = async () => {
    if (window.confirm("Apakah Anda yakin ingin meriset seluruh akun simulasi dan mengembalikan modal ke Rp 10.000.000?")) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/portfolio/reset`, {
          method: 'POST'
        });
        if (response.ok) {
          alert("Akun simulasi berhasil direset.");
          await fetchPortfolio();
        }
      } catch (err) {
        console.error(err);
        alert("Gagal meriset portofolio.");
      }
    }
  };

  // Helper to load chart data
  const loadChartData = async (ticker, tf = timeframe) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/stocks/${ticker}/chart?timeframe=${tf}`);
      if (!response.ok) {
        throw new Error(`Gagal memuat chart untuk ${ticker}`);
      }
      const data = await response.json();
      setChartData(data);
    } catch (err) {
      console.error(err);
      setError(`Gagal memuat data grafik: ${err.message}`);
    }
  };

  const handleSelectStock = async (stock) => {
    setError(null);
    setSelectedStock(stock);
    setChartData([]); // clear old chart while loading
    // Auto switch back to chart view if not in calculator to display the selected stock
    if (activeTab === 'portfolio') {
      setActiveTab('chart');
    }
    await loadChartData(stock.ticker, timeframe);
  };

  const handleTimeframeChange = async (newTf) => {
    if (!selectedStock) return;
    setTimeframe(newTf);
    setChartData([]);
    await loadChartData(selectedStock.ticker, newTf);
  };

  const handleSyncData = async () => {
    if (!selectedStock) return;
    setIsSyncing(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/stocks/${selectedStock.ticker}/sync?timeframe=${timeframe}`, {
        method: 'POST'
      });
      const result = await response.json();
      
      if (result.status === 'error') {
        setError(result.message);
      } else {
        // Refetch chart data after sync
        await loadChartData(selectedStock.ticker, timeframe);
      }
    } catch (err) {
      console.error(err);
      setError('Gagal menyingkronkan data dengan API.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddTicker = async (ticker) => {
    setIsSyncing(true);
    setError(null);
    try {
      // Sync ticker to fetch data from yfinance and save to SQLite
      const response = await fetch(`${API_BASE_URL}/api/stocks/${ticker}/sync?timeframe=${timeframe}`, {
        method: 'POST'
      });
      const result = await response.json();

      if (response.ok && result.status !== 'error') {
        // Fetch fresh stocks list
        const stocksResponse = await fetch(`${API_BASE_URL}/api/stocks`);
        const stocksData = await stocksResponse.json();
        setStocks(stocksData);

        // Find and select the newly added stock
        const newStockObj = stocksData.find(s => s.ticker === ticker) || {
          ticker,
          name: `Saham ${ticker.replace('.JK', '')}`,
          sector: 'Synced Stock'
        };
        setSelectedStock(newStockObj);
        setActiveTab('chart');
        await loadChartData(ticker, timeframe);
        return true;
      } else {
        setError(result.message || 'Gagal menambahkan ticker baru.');
        return false;
      }
    } catch (err) {
      console.error(err);
      setError('Error saat mencoba menghubungi server.');
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = async () => {
    const token = sessionStorage.getItem('tlc_token');
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: token ? { 'X-Session-Token': token } : {},
      credentials: 'include',
    }).catch(() => {});
    sessionStorage.removeItem('tlc_token');
    setCurrentUser(null);
  };

  // Show nothing until auth check done
  if (!authChecked) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>Memeriksa sesi...</p>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!currentUser) {
    return <LoginPage onLoginSuccess={user => setCurrentUser(user)} />;
  }

  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>Memuat Data Saham Indonesia...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <StockSelector
        stocks={stocks}
        selectedTicker={selectedStock?.ticker}
        onSelect={handleSelectStock}
        onAddTicker={handleAddTicker}
        isSyncing={isSyncing}
      />
      
      <main className="main-dashboard">
        {/* Navigation Tabs Bar */}
        <div className="main-nav-tabs">
          <button 
            className={`nav-tab-btn ${activeTab === 'chart' ? 'active' : ''}`}
            onClick={() => setActiveTab('chart')}
          >
            Grafik & Analisis
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'portfolio' ? 'active' : ''}`}
            onClick={() => setActiveTab('portfolio')}
          >
            Simulasi Portofolio (10jt)
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'calculator' ? 'active' : ''}`}
            onClick={() => setActiveTab('calculator')}
          >
            Kalkulator Average
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'journal' ? 'active' : ''}`}
            onClick={() => setActiveTab('journal')}
          >
            Jurnal Trading
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'backtest' ? 'active' : ''}`}
            onClick={() => setActiveTab('backtest')}
          >
            Backtest & Replay
          </button>

          {/* User info + Logout */}
          <div className="nav-user-pill">
            <span className="nav-user-avatar">{currentUser.full_name?.[0]?.toUpperCase() || 'U'}</span>
            <span className="nav-user-name">{currentUser.full_name || currentUser.username}</span>
            <button className="nav-logout-btn" onClick={handleLogout} title="Logout">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 12H2.5A1.5 1.5 0 011 10.5v-7A1.5 1.5 0 012.5 2H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M9 10l4-3-4-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="13" y1="7" x2="5" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              Logout
            </button>
          </div>
        </div>

        {error && (
          <div className="app-error-banner">
            <span>{error}</span>
            <button onClick={() => setError(null)}>&times; Tutup</button>
          </div>
        )}

        {selectedStock && activeTab === 'chart' && (
          <>
            <StockDetails
              ticker={selectedStock.ticker}
              name={selectedStock.name}
              data={chartData}
              isSyncing={isSyncing}
              onSync={handleSyncData}
              onTrade={handleTrade}
              isAutoSync={isAutoSync}
              onToggleAutoSync={setIsAutoSync}
            />

            <ErrorBoundary>
              <StockChart
                ticker={selectedStock.ticker}
                name={selectedStock.name}
                data={chartData}
                timeframe={timeframe}
                onTimeframeChange={handleTimeframeChange}
              />
            </ErrorBoundary>
          </>
        )}

        {selectedStock && activeTab === 'portfolio' && (
          <PortfolioPanel
            portfolio={portfolio}
            stockList={stocks}
            currentStock={selectedStock}
            currentPrice={chartData.length > 0 ? chartData[chartData.length - 1].close : null}
            onTrade={handleTrade}
            onReset={handleResetPortfolio}
          />
        )}

        {selectedStock && activeTab === 'calculator' && (
          <AverageCalculator
            currentStock={selectedStock}
            currentPrice={chartData.length > 0 ? chartData[chartData.length - 1].close : null}
          />
        )}

        {activeTab === 'journal' && (
          <TradingJournal
            stocks={stocks}
            currentStock={selectedStock}
            currentPrice={chartData.length > 0 ? chartData[chartData.length - 1].close : null}
          />
        )}

        {activeTab === 'backtest' && (
          <BacktestPanel
            stocks={stocks}
          />
        )}
      </main>
    </div>
  );
}
