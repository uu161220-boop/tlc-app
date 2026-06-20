import datetime
import math
import random
import os
from db import init_db, add_stock, insert_prices, get_db_connection

# Major Indonesian stocks to seed
STOCKS_TO_SEED = [
    {"ticker": "BBCA.JK", "name": "Bank Central Asia Tbk.", "sector": "Financials"},
    {"ticker": "BBRI.JK", "name": "Bank Rakyat Indonesia (Persero) Tbk.", "sector": "Financials"},
    {"ticker": "TLKM.JK", "name": "Telkom Indonesia (Persero) Tbk.", "sector": "Technology & Telecom"},
    {"ticker": "GOTO.JK", "name": "GoTo Gojek Tokopedia Tbk.", "sector": "Technology & Internet"},
    {"ticker": "ASII.JK", "name": "Astra International Tbk.", "sector": "Industrials & Conglomerate"}
]

TIMEFRAMES = ["m5", "m15", "m30", "h1", "h4", "d1", "mn"]

def get_base_config(ticker):
    baselines = {
        "BBCA.JK": {"price": 9400.0, "volatility": 0.008, "drift": 0.0001},
        "BBRI.JK": {"price": 4900.0, "volatility": 0.010, "drift": 0.0001},
        "TLKM.JK": {"price": 3800.0, "volatility": 0.012, "drift": -0.0001},
        "GOTO.JK": {"price": 80.0, "volatility": 0.030, "drift": -0.0002},
        "ASII.JK": {"price": 4200.0, "volatility": 0.011, "drift": 0.0000}
    }
    return baselines.get(ticker, {"price": 1000.0, "volatility": 0.015, "drift": 0.0})

def generate_timeframe_mock_data(ticker, timeframe):
    """
    Generates realistic candles for a given timeframe.
    Returns list of dicts: {date, timestamp, open, high, low, close, adj_close, volume, timeframe}
    """
    config = get_base_config(ticker)
    start_price = config["price"]
    vol = config["volatility"]
    drift = config["drift"]
    
    # Adjust price volatility and drift based on timeframe interval
    # Base daily parameters need scaling down for intraday
    tf_scales = {
        "m5": {"bars_per_day": 84, "days_back": 5, "scale": 0.07},   # ~84 bars per day (9:00 - 16:00)
        "m15": {"bars_per_day": 28, "days_back": 10, "scale": 0.12},
        "m30": {"bars_per_day": 14, "days_back": 15, "scale": 0.17},
        "h1": {"bars_per_day": 7, "days_back": 30, "scale": 0.25},
        "h4": {"bars_per_day": 2, "days_back": 60, "scale": 0.45},
        "d1": {"bars_per_day": 1, "days_back": 260, "scale": 1.0},
        "mn": {"bars_per_day": 1, "days_back": 1800, "scale": 4.5} # 150 months (~12 years)
    }
    
    scale_info = tf_scales[timeframe]
    bars_per_day = scale_info["bars_per_day"]
    days_back = scale_info["days_back"]
    tf_vol = vol * scale_info["scale"]
    tf_drift = drift * scale_info["scale"]
    
    now = datetime.datetime.now()
    
    # Calculate starting point
    if timeframe in ["d1", "mn"]:
        start_date = datetime.datetime(2016, 1, 1, 9, 0, 0)
    else:
        start_date = now - datetime.timedelta(days=days_back)
        start_date = start_date.replace(hour=9, minute=0, second=0, microsecond=0)
    
    current_price = start_price
    prices = []
    
    # Generate timestamp sequences
    timestamps = []
    
    if timeframe in ["d1", "mn"]:
        # Generate calendar days or calendar months
        curr = start_date
        while curr <= now:
            if timeframe == "d1":
                # Weekdays only
                if curr.weekday() < 5:
                    timestamps.append((curr.strftime("%Y-%m-%d"), int(curr.timestamp())))
                curr += datetime.timedelta(days=1)
            else: # mn (monthly)
                timestamps.append((curr.strftime("%Y-%m-01"), int(curr.timestamp())))
                # Move to next month
                next_month = curr.month + 1 if curr.month < 12 else 1
                next_year = curr.year if curr.month < 12 else curr.year + 1
                curr = curr.replace(year=next_year, month=next_month, day=1)
    else:
        # Intraday generation
        # Trading hours: 09:00 to 16:00
        curr = start_date
        minute_intervals = {
            "m5": 5,
            "m15": 15,
            "m30": 30,
            "h1": 60,
            "h4": 240
        }
        interval_min = minute_intervals[timeframe]
        
        while curr <= now:
            # Only generate on weekdays
            if curr.weekday() < 5:
                hour = curr.hour
                minute = curr.minute
                # Check if within IDX trading session (09:00 - 12:00, 13:30 - 16:00)
                # For simplified continuous rendering: 09:00 to 16:00
                if 9 <= hour <= 15 or (hour == 16 and minute == 0):
                    # Exclude lunch break 12:00 to 13:30 for realistic looks (optional, let's keep it simple: 9:00-16:00)
                    dt_str = curr.strftime("%Y-%m-%d %H:%M:%S")
                    timestamps.append((dt_str, int(curr.timestamp())))
                    
            curr += datetime.timedelta(minutes=interval_min)
            
            # If crossed 16:00, jump to next day 09:00
            if curr.hour > 16 or (curr.hour == 16 and curr.minute > 0):
                curr = curr + datetime.timedelta(days=1)
                curr = curr.replace(hour=9, minute=0)
                
    # Generate prices using random walk
    for dt_str, ts in timestamps:
        # Random walk with slight mean reversion to baseline config price to prevent extreme values over 10 years
        anchoring = -0.005 * (current_price - start_price) / start_price
        pct_change = random.normalvariate(tf_drift, tf_vol) + anchoring
        close_price = current_price * (1 + pct_change)
        
        if close_price <= 0:
            close_price = 1.0
            
        open_price = current_price
        max_price = max(open_price, close_price)
        min_price = min(open_price, close_price)
        
        high_price = max_price * (1 + abs(random.normalvariate(0, tf_vol * 0.4)))
        low_price = min_price * (1 - abs(random.normalvariate(0, tf_vol * 0.4)))
        
        high_price = max(high_price, open_price, close_price)
        low_price = min(low_price, open_price, close_price)
        
        # Volume
        base_vol = 500000 if ticker == "GOTO.JK" else 100000
        # scaled down for intraday
        scaled_vol = base_vol * scale_info["scale"]
        volume = int(scaled_vol * random.uniform(0.5, 2.5))
        
        prices.append({
            "date": dt_str,
            "timestamp": ts,
            "open": round(open_price, 2),
            "high": round(high_price, 2),
            "low": round(low_price, 2),
            "close": round(close_price, 2),
            "adj_close": round(close_price, 2),
            "volume": max(volume, 100),
            "timeframe": timeframe
        })
        
        current_price = close_price
        
    return prices

def main():
    print("Clearing existing MySQL tables for a fresh seeding...")
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("SET FOREIGN_KEY_CHECKS = 0;")
            cursor.execute("DROP TABLE IF EXISTS historical_prices")
            cursor.execute("DROP TABLE IF EXISTS stocks")
            cursor.execute("DROP TABLE IF EXISTS cash_balance")
            cursor.execute("DROP TABLE IF EXISTS portfolio")
            cursor.execute("DROP TABLE IF EXISTS trading_journal")
            cursor.execute("DROP TABLE IF EXISTS users")
            cursor.execute("SET FOREIGN_KEY_CHECKS = 1;")
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Failed to drop tables: {e}. Clearing tables instead.")
            
    print("Initializing Database...")
    init_db()
    
    for stock in STOCKS_TO_SEED:
        ticker = stock["ticker"]
        name = stock["name"]
        sector = stock["sector"]
        
        print(f"\nProcessing {name} ({ticker})...")
        stock_id = add_stock(ticker, name, sector)
        
        # Seed all timeframes
        for tf in TIMEFRAMES:
            print(f"  Generating {tf} timeframe data...")
            prices_data = generate_timeframe_mock_data(ticker, tf)
            if prices_data:
                insert_prices(stock_id, prices_data)
                print(f"  Inserted {len(prices_data)} rows for {tf}.")
                
    print("\nDatabase seeding completed successfully for all timeframes!")

if __name__ == "__main__":
    main()
