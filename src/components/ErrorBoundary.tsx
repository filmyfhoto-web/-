import { Component, ReactNode } from "react";

interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: any) {
    console.error("[ErrorBoundary]", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen grid place-items-center p-6 bg-gradient-soft">
          <div className="max-w-lg w-full bg-card border border-border rounded-2xl p-6 shadow-card">
            <h2 className="text-lg font-bold mb-2">เกิดข้อผิดพลาดในหน้านี้</h2>
            <p className="text-sm text-muted-foreground mb-4">
              ลองรีเฟรชหน้าเว็บอีกครั้ง หากยังไม่หาย โปรดส่งข้อความด้านล่างให้ทีมงาน
            </p>
            <pre className="text-xs bg-muted/50 rounded p-3 overflow-auto max-h-60 whitespace-pre-wrap">
{String(this.state.error?.stack || this.state.error?.message || this.state.error)}
            </pre>
            <button
              onClick={() => { this.setState({ error: null }); location.reload(); }}
              className="mt-4 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm"
            >รีเฟรช</button>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}