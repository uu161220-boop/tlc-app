import pymysql
import os

try:
    conn = pymysql.connect(
        host=os.getenv("MYSQL_HOST", "localhost"),
        port=int(os.getenv("MYSQL_PORT", "3306")),
        user=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD", ""),
    )
    print("Successfully connected to MySQL server!")
    with conn.cursor() as cur:
        cur.execute("SHOW DATABASES")
        dbs = [row[0] for row in cur.fetchall()]
        print("Existing databases:", dbs)
    conn.close()
except Exception as e:
    print("Failed to connect to MySQL server:", e)
