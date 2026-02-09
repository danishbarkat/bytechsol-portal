import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="p-6 bg-red-50 text-red-900 rounded-lg shadow-xl m-4 border border-red-200">
                    <h2 className="text-xl font-bold mb-2">Something went wrong.</h2>
                    <details className="whitespace-pre-wrap text-sm font-mono bg-red-100 p-4 rounded">
                        {this.state.error && this.state.error.toString()}
                        <br />
                        {this.state.error?.stack}
                    </details>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
