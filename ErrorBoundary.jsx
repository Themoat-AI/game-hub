import { Component } from 'react';

/** Keeps a crash in one page/game from blanking the whole hub. */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ui] render error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="panel mx-auto mt-10 max-w-lg p-8 text-center">
        <div className="mb-3 text-4xl">💥</div>
        <h2 className="font-display text-lg font-bold text-neon-pink">Game over (for this page)</h2>
        <p className="mt-2 text-sm text-ink-200">Something broke while rendering. Your progress is safe.</p>
        <div className="mt-5 flex justify-center gap-3">
          <button className="btn-primary" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <a className="btn-ghost" href="/">
            Back to hub
          </a>
        </div>
      </div>
    );
  }
}
