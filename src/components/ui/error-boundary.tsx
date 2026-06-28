"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  page: string;
}

interface State {
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error(`[ErrorBoundary:${this.props.page}]`, error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
          <p className="text-sm font-semibold text-red-500">
            Error en {this.props.page}
          </p>
          <p className="mt-2 font-mono text-xs text-red-400">
            {this.state.error.message}
          </p>
          <pre className="mt-2 max-w-full overflow-auto text-left text-xs text-muted-foreground">
            {String(this.state.error.stack ?? "")
              .split("\n")
              .slice(0, 5)
              .join("\n")}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
