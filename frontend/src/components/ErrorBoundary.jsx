import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.href = '/';
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isEn = this.props.lang === 'en';
      return (
        <div className="min-h-[380px] w-full flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white border-2 border-black rounded-xl p-6 shadow-[4px_4px_0px_#000000] text-black">
            <div className="flex items-center gap-3 pb-4 border-b-2 border-black">
              <div className="w-10 h-10 rounded-lg border-2 border-black bg-black text-white flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold font-display uppercase tracking-tight">
                  {isEn ? 'Something Went Wrong' : 'Terjadi Kendala Tampilan'}
                </h2>
                <p className="text-xs text-neutral-600 mt-0.5">
                  {isEn ? 'An unexpected rendering error was safely intercepted.' : 'Komponen mengalami kendala dan dialihkan secara aman.'}
                </p>
              </div>
            </div>

            <p className="text-xs text-neutral-700 mt-4 leading-relaxed font-medium">
              {isEn 
                ? 'The interface encountered an error while displaying this content. You can reload the page or return to the main dashboard.'
                : 'Sistem berhasil mengamankan halaman dari layar putih. Anda dapat memuat ulang halaman atau kembali ke menu utama.'}
            </p>

            {this.state.error?.message && (
              <div className="mt-3 p-2.5 rounded bg-neutral-100 border border-black/30 font-mono text-[11px] text-neutral-800 break-words">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-2.5 mt-5 pt-3 border-t-2 border-black">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:flex-1 py-2.5 px-4 rounded-lg border-2 border-black bg-black text-white font-extrabold text-xs shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 stroke-[2.2]" />
                <span>{isEn ? 'Reload Page' : 'Muat Ulang Halaman'}</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="w-full sm:flex-1 py-2.5 px-4 rounded-lg border-2 border-black bg-white hover:bg-neutral-100 text-black font-extrabold text-xs shadow-[2px_2px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Home className="w-3.5 h-3.5 stroke-[2.2]" />
                <span>{isEn ? 'Return Home' : 'Kembali ke Beranda'}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

