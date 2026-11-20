import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    let display = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; operationType?: string };
      if (parsed.error) {
        display = `Database ${parsed.operationType ?? 'operation'} failed: ${parsed.error}`;
      }
    } catch {
      // keep raw message
    }
    return { hasError: true, message: display };
  }

  componentDidCatch(error: Error) {
    console.error('NutriPulse ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#f4fbfa] dark:bg-[#071615]">
          <div className="max-w-md w-full bg-white dark:bg-[#0d2221] rounded-2xl p-6 border border-[#003f3d]/10 dark:border-white/10 space-y-4">
            <div className="flex items-center gap-3 text-red-700 dark:text-red-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h1 className="text-lg font-bold">Something went wrong</h1>
            </div>
            <p className="text-sm text-[#404848] dark:text-[#b0cbc8] leading-relaxed">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
              className="w-full h-11 rounded-xl bg-[#003f3d] text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#002726] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
