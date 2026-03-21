import React from 'react';

type AppErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string;
};

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  declare props: AppErrorBoundaryProps;
  state: AppErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Something went wrong while rendering LiveDrop.',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[LiveDrop] App shell render failed', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
          <div className="mx-auto max-w-[430px] rounded-[2rem] border border-rose-100 bg-white p-6 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-500">App Error</p>
            <h1 className="mt-1 text-2xl font-black text-slate-900">LiveDrop hit a render problem</h1>
            <p className="mt-2 text-sm text-slate-500">{this.state.errorMessage}</p>
            <button
              onClick={() => window.location.assign('/')}
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-indigo-600 px-4 text-[11px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-indigo-500"
            >
              Return to App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
