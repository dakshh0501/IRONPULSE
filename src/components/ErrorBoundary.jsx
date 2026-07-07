import { Component } from 'react'
export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null, errorInfo: null } }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    if (typeof this.props.onError === 'function') {
      this.props.onError(error, errorInfo)
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding: 40, textAlign: 'center', color: 'var(--text-tertiary)'}}>
          <div style={{fontSize: 48, marginBottom: 12}}>⚠️</div>
          <h3>Something went wrong</h3>
          <p style={{fontSize: 13, color: 'var(--text-muted)', marginTop: 4}}>{this.state.error?.message}</p>
          {process.env.NODE_ENV !== 'production' && this.state.errorInfo && (
            <pre style={{fontSize: 11, color: 'var(--text-muted)', marginTop: 12, maxWidth: 600, overflow: 'auto', textAlign: 'left', background: 'var(--bg-secondary)', padding: 12, borderRadius: 8}}>
              {this.state.errorInfo.componentStack}
            </pre>
          )}
          <button onClick={() => window.location.reload()} style={{marginTop: 16, padding: '8px 24px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer'}}>Reload Page</button>
        </div>
      )
    }
    return this.props.children
  }
}
