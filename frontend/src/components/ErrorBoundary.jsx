import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-card" style={{
          padding: '24px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid #ef4444',
          borderRadius: '16px',
          color: '#fca5a5',
          fontFamily: 'monospace',
          fontSize: '0.9rem',
          margin: '20px 0'
        }}>
          <h3 style={{ marginBottom: '12px', color: '#f87171' }}>Grafik gagal dimuat (Render Error)</h3>
          <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>{this.state.error?.toString()}</p>
          <pre style={{ 
            whiteSpace: 'pre-wrap', 
            background: 'rgba(0, 0, 0, 0.3)', 
            padding: '12px', 
            borderRadius: '8px',
            maxHeight: '200px',
            overflowY: 'auto'
          }}>
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
