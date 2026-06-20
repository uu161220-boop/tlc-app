from fastapi import FastAPI, HTTPException, Query, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import datetime
import math
import uuid
import db

# In-memory session store: { token: user_dict }
_sessions: dict = {}

app = FastAPI(title="Indonesian Stock Market API", description="Serves SQL stock prices for IDX candlesticks with multiple timeframes.")

# Initialize database on startup
db.init_db()

# Auto-migrate from SQLite to MySQL on startup if MySQL is empty and SQLite database.db exists
try:
    import os
    sqlite_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database.db")
    if os.path.exists(sqlite_path):
        conn = db.get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS cnt FROM stocks")
            has_stocks = cur.fetchone()["cnt"] > 0
        conn.close()

        if not has_stocks:
            print("MySQL database is empty. Triggering auto-migration from SQLite database.db...")
            from migrate import migrate
            migrate()
            print("Auto-migration completed successfully!")
except Exception as e:
    print(f"Failed to auto-migrate SQLite to MySQL on startup: {e}")


# CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class StockResponse(BaseModel):
    id: int
    ticker: str
    name: str
    sector: str | None = None

class PriceResponse(BaseModel):
    date: str
    timestamp: int
    open: float
    high: float
    low: float
    close: float
    adj_close: float | None = None
    volume: int
    timeframe: str

class LoginRequest(BaseModel):
    username: str
    password: str

# ─── Auth Endpoints ───

@app.post("/api/auth/login")
def login(payload: LoginRequest, response: Response):
    user = db.verify_password(payload.username, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Username atau password salah.")
    token = str(uuid.uuid4())
    _sessions[token] = {
        "id":        user["id"],
        "username":  user["username"],
        "full_name": user.get("full_name") or user["username"],
        "role":      user["role"],
    }
    response.set_cookie(
        key="tlc_session",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,  # 7 days
    )
    return {"token": token, "user": _sessions[token]}

@app.get("/api/auth/me")
def get_me(request: Request):
    token = request.cookies.get("tlc_session") or request.headers.get("X-Session-Token", "")
    user = _sessions.get(token)
    if not user:
        raise HTTPException(status_code=401, detail="Sesi tidak valid. Silakan login kembali.")
    return {"user": user}

@app.post("/api/auth/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get("tlc_session") or request.headers.get("X-Session-Token", "")
    _sessions.pop(token, None)
    response.delete_cookie("tlc_session")
    return {"message": "Berhasil logout."}

@app.get("/")
def read_root():
    return {"message": "Indonesian Stock Market API with Timeframes is running!"}

@app.get("/api/stocks", response_model=list[StockResponse])
def get_stocks_api():
    try:
        stocks = db.get_stocks()
        return stocks
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/api/stocks/{ticker}/chart", response_model=list[PriceResponse])
def get_chart_api(ticker: str, timeframe: str = Query("d1", description="m5, m15, m30, h1, h4, d1, mn")):
    ticker_upper = ticker.upper()
    if not ticker_upper.endswith(".JK"):
        ticker_upper = f"{ticker_upper}.JK"
        
    stock = db.get_stock_by_ticker(ticker_upper)
    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock ticker {ticker_upper} not found in database.")
        
    try:
        prices = db.get_historical_prices(stock["id"], timeframe)
        return prices
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.post("/api/stocks/{ticker}/sync")
def sync_stock_api(ticker: str, timeframe: str = Query("d1", description="m5, m15, m30, h1, h4, d1, mn")):
    ticker_upper = ticker.upper()
    if not ticker_upper.endswith(".JK"):
        ticker_upper = f"{ticker_upper}.JK"
        
    stock = db.get_stock_by_ticker(ticker_upper)
    if not stock:
        name = f"Saham {ticker_upper.replace('.JK', '')}"
        stock_id = db.add_stock(ticker_upper, name, "Synced Stock")
        stock = {"id": stock_id, "ticker": ticker_upper, "name": name, "sector": "Synced Stock"}
    else:
        stock_id = stock["id"]
        
    try:
        import yfinance as yf
        print(f"Syncing data for {ticker_upper} timeframe {timeframe}...")
        
        # Mappings for yfinance intervals and periods
        tf_mapping = {
            "m5": ("5m", "7d"),
            "m15": ("15m", "30d"),
            "m30": ("30m", "30d"),
            "h1": ("1h", "60d"),
            "h4": ("1h", "60d"), # will aggregate hourly to 4h
            "d1": ("1d", "1y"),
            "mn": ("1mo", "max")
        }
        
        if timeframe not in tf_mapping:
            raise Exception("Invalid timeframe")
            
        interval, period = tf_mapping[timeframe]
        
        if timeframe in ["d1", "mn"]:
            today_str = datetime.date.today().strftime("%Y-%m-%d")
            df = yf.download(ticker_upper, start="2016-01-01", end=today_str, interval=interval)
        else:
            df = yf.download(ticker_upper, period=period, interval=interval)
        if df.empty:
            raise Exception("No data returned from Yahoo Finance.")
            
        raw_prices = []
        for date, row in df.iterrows():
            try:
                o = float(row['Open'])
                h = float(row['High'])
                l = float(row['Low'])
                c = float(row['Close'])
                ac = float(row['Adj Close']) if 'Adj Close' in row else float(row['Close'])
                v = int(row['Volume'])
            except Exception:
                o = float(row.iloc[0])
                h = float(row.iloc[1])
                l = float(row.iloc[2])
                c = float(row.iloc[3])
                ac = float(row.iloc[4])
                v = int(row.iloc[5])
                
            if math.isnan(o) or math.isnan(h) or math.isnan(l) or math.isnan(c):
                continue
                
            ts = int(date.timestamp())
            
            # Format date representation string
            if timeframe in ["d1", "mn"]:
                dt_str = date.strftime("%Y-%m-%d")
            else:
                dt_str = date.strftime("%Y-%m-%d %H:%M:%S")
                
            raw_prices.append({
                "date": dt_str,
                "timestamp": ts,
                "open": round(o, 2),
                "high": round(h, 2),
                "low": round(l, 2),
                "close": round(c, 2),
                "adj_close": round(ac, 2),
                "volume": v,
                "timeframe": timeframe if timeframe != "h4" else "h1" # initially save as h1 if we are building h4
            })
            
        if timeframe == "h4":
            # Aggregate h1 to h4
            # We group every 4 hourly bars
            aggregated = []
            for i in range(0, len(raw_prices), 4):
                chunk = raw_prices[i:i+4]
                if not chunk:
                    continue
                o = chunk[0]["open"]
                c = chunk[-1]["close"]
                h = max(item["high"] for item in chunk)
                l = min(item["low"] for item in chunk)
                v = sum(item["volume"] for item in chunk)
                dt = chunk[0]["date"]
                ts = chunk[0]["timestamp"]
                aggregated.append({
                    "date": dt,
                    "timestamp": ts,
                    "open": o,
                    "high": h,
                    "low": l,
                    "close": c,
                    "adj_close": c,
                    "volume": v,
                    "timeframe": "h4"
                })
            prices_data = aggregated
        else:
            prices_data = raw_prices
            
        if prices_data:
            db.insert_prices(stock_id, prices_data)
            return {
                "status": "success",
                "message": f"Successfully synced {len(prices_data)} rows for {ticker_upper} ({timeframe}).",
                "synced_rows": len(prices_data)
            }
        else:
            return {"status": "info", "message": "No new data to insert."}
            
    except Exception as e:
        print(f"Error syncing {ticker_upper} ({timeframe}): {str(e)}")
        return {
            "status": "error",
            "message": f"Failed to sync real-time data: {str(e)}. Using cached database instead."
        }

class TradeRequest(BaseModel):
    ticker: str
    trade_type: str  # 'BUY' or 'SELL'
    lots: int
    price: float

class JournalEntryRequest(BaseModel):
    date: str
    ticker: str
    trade_type: str  # 'BUY' or 'SELL'
    price: float
    lots: int
    setup: str | None = None
    notes: str | None = None
    target_price: float | None = None
    stop_loss: float | None = None


@app.get("/api/portfolio")
def get_portfolio_api():
    try:
        cash = db.get_cash_balance()
        holdings = db.get_portfolio()
        return {
            "cash": cash,
            "holdings": holdings
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/portfolio/trade")
def trade_api(request: TradeRequest):
    res = db.execute_trade(request.ticker, request.trade_type, request.lots, request.price)
    if res["status"] == "error":
        raise HTTPException(status_code=400, detail=res["message"])
    return res

@app.post("/api/portfolio/reset")
def reset_portfolio_api():
    try:
        db.reset_simulation_account()
        return {"status": "success", "message": "Akun simulasi berhasil direset ke Rp 10.000.000"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/journal")
def get_journal_api():
    try:
        return db.get_journal_entries()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/journal")
def add_journal_api(request: JournalEntryRequest):
    try:
        entry_id = db.add_journal_entry(
            date=request.date,
            ticker=request.ticker,
            trade_type=request.trade_type,
            price=request.price,
            lots=request.lots,
            setup=request.setup,
            notes=request.notes,
            target_price=request.target_price,
            stop_loss=request.stop_loss
        )
        return {"status": "success", "message": "Jurnal berhasil ditambahkan", "id": entry_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/journal/{entry_id}")
def delete_journal_api(entry_id: int):
    try:
        success = db.delete_journal_entry(entry_id)
        if not success:
            raise HTTPException(status_code=404, detail="Jurnal tidak ditemukan")
        return {"status": "success", "message": "Jurnal berhasil dihapus"}
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


