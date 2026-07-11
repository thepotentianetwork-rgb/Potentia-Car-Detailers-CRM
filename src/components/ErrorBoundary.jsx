import { Component } from "react";

export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <pre className="text-[#c0392b] bg-[#fdecea] p-5 whitespace-pre-wrap text-[13px] leading-relaxed">
          ERROR: {this.state.error.message || String(this.state.error)}
          {"\n\n"}
          {this.state.error.stack}
        </pre>
      );
    }
    return this.props.children;
  }
}
