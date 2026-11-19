import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface State {
  error: Error | null;
}

/** Keeps one broken page from blanking the whole app. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    // A failed lazy chunk usually means a new version was deployed: a reload fixes it
    const isChunkError = /Loading chunk|dynamically imported module|Failed to fetch/i.test(this.state.error.message);
    return (
      <div className="max-w-md mx-auto mt-16 text-center px-4">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
        <h2 className="mt-3 font-bold text-slate-900">
          {isChunkError ? 'A new version is available' : 'Something went wrong on this page'}
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          {isChunkError ? 'Reload to continue.' : 'The rest of the app still works. Reload to try again.'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white"
        >
          Reload
        </button>
      </div>
    );
  }
}
