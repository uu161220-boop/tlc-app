import React, { useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export default function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Username dan password tidak boleh kosong.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Login gagal.');
      }

      // Store token in sessionStorage for API calls
      sessionStorage.setItem('tlc_token', data.token);
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Animated background blobs */}
      <div className="login-bg-blob blob-1" />
      <div className="login-bg-blob blob-2" />
      <div className="login-bg-blob blob-3" />

      <div className="login-card">
        {/* Logo / Brand */}
        <div className="login-brand">
          <div className="login-logo">
            <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
              <rect width="38" height="38" rx="10" fill="url(#lg1)" />
              <path d="M10 27L18 13L23 21L27 16L33 27H10Z" fill="white" fillOpacity="0.9" />
              <defs>
                <linearGradient id="lg1" x1="0" y1="0" x2="38" y2="38" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <h1 className="login-app-name">TLC Trading</h1>
            <p className="login-app-tagline">Indonesian Stock Market Platform</p>
          </div>
        </div>

        <div className="login-divider" />

        <h2 className="login-title">Selamat Datang Kembali</h2>
        <p className="login-subtitle">Masuk ke akun Anda untuk melanjutkan analisis</p>

        {error && (
          <div className="login-error-banner">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="#ef4444" strokeWidth="1.5" />
              <path d="M8 5v3M8 10.5v.5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form" autoComplete="on">
          <div className="login-field-group">
            <label htmlFor="login-username" className="login-label">Username</label>
            <div className="login-input-wrapper">
              <svg className="login-input-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M2 13c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input
                id="login-username"
                type="text"
                className="login-input"
                placeholder="Masukkan username"
                value={username}
                onChange={e => { setUsername(e.target.value); setError(null); }}
                autoComplete="username"
                disabled={loading}
              />
            </div>
          </div>

          <div className="login-field-group">
            <label htmlFor="login-password" className="login-label">Password</label>
            <div className="login-input-wrapper">
              <svg className="login-input-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M5.5 7V5.5a2.5 2.5 0 015 0V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className="login-input"
                placeholder="Masukkan password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(null); }}
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                className="login-show-pw-btn"
                onClick={() => setShowPassword(v => !v)}
                tabIndex={-1}
                title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M2 8s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4Z" stroke="currentColor" strokeWidth="1.4" />
                    <circle cx="8" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.4" />
                    <line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M2 8s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4Z" stroke="currentColor" strokeWidth="1.4" />
                    <circle cx="8" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? (
              <>
                <span className="login-spinner" />
                Memverifikasi...
              </>
            ) : (
              <>
                Masuk ke Dashboard
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            )}
          </button>
        </form>

        <div className="login-footer">
          <p className="login-hint">
            <span className="login-hint-icon">🔒</span>
            Akun default: <code>admin</code> / <code>admin123</code>
          </p>
        </div>
      </div>
    </div>
  );
}
