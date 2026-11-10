import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { logError } from '../../data/app';
import { hasBridge, isDesktopRuntime } from '../../data/client';
import { submitToTaskBridge } from '../../lib/taskbridge';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught React Error:', error, errorInfo);
    if (isDesktopRuntime() && hasBridge('logError')) {
      logError(`React Crash: ${error.message}`, {
        stack: error.stack,
        componentStack: errorInfo.componentStack
      });
    }

    // Auto-report critical crash to TaskBridge
    submitToTaskBridge({
      title: `Crash: ${error.message || 'Unhandled React Exception'}`,
      description: `Stack trace:\n${error.stack || ''}\n\nComponent stack:\n${errorInfo.componentStack || ''}`,
      type: 'BUG',
      severity: 'HIGH',
      context: {
        source: 'ErrorBoundary',
        errorName: error.name,
        errorMessage: error.message,
      },
    }).catch((err: unknown) => {
      console.warn('Failed to auto-report exception to TaskBridge:', err);
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full bg-card border border-destructive/20 shadow-2xl rounded-2xl p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-6">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Something went wrong</h1>
            <p className="text-muted-foreground text-sm mb-6">
              An unexpected error occurred in the application. The error has been logged.
            </p>
            {this.state.error && (
              <div className="w-full bg-muted/50 border border-border rounded-lg p-4 mb-6 text-left overflow-auto max-h-32">
                <code className="text-xs text-destructive font-mono break-words">
                  {this.state.error.toString()}
                </code>
              </div>
            )}
            <button
              onClick={this.handleReload}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-3 px-4 rounded-xl font-bold transition-all shadow-sm"
            >
              <RefreshCw className="w-5 h-5" />
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
