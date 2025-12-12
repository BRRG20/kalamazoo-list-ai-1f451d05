import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
  showHomeButton?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleRefresh = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      const { fallbackMessage = 'Something went wrong on this page.', showHomeButton = true } = this.props;
      
      return (
        <div className="min-h-[300px] flex flex-col items-center justify-center p-8 bg-background text-foreground">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Oops!</h2>
              <p className="text-muted-foreground">{fallbackMessage}</p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={this.handleRetry} variant="outline" className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Try Again
              </Button>
              <Button onClick={this.handleRefresh} variant="outline" className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Refresh Page
              </Button>
              {showHomeButton && (
                <Button onClick={this.handleGoHome} variant="default" className="gap-2">
                  <Home className="w-4 h-4" />
                  Go Home
                </Button>
              )}
            </div>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-6 text-left text-xs bg-muted/50 rounded-lg p-4">
                <summary className="cursor-pointer font-medium text-muted-foreground mb-2">
                  Error Details (Development Only)
                </summary>
                <pre className="whitespace-pre-wrap text-destructive overflow-auto max-h-48">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for wrapping functional components
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallbackMessage?: string
) {
  return function WithErrorBoundaryWrapper(props: P) {
    return (
      <ErrorBoundary fallbackMessage={fallbackMessage}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}
