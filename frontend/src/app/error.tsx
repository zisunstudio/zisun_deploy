"use client";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to console; Sentry (if configured) captures unhandled errors automatically.
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-[#FAF7F2]">
      <p className="font-serif text-7xl font-bold text-[#5C3317]">500</p>
      <h1 className="mt-4 text-xl font-semibold text-gray-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-gray-500 max-w-sm">
        An unexpected error occurred. Please try again — if it keeps happening, come back in a little while.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={reset}
          className="bg-[#5C3317] text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#4A2810] transition-colors"
        >
          Try again
        </button>
        <a
          href="/"
          className="border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
        >
          Go home
        </a>
      </div>
      {error.digest && (
        <p className="mt-4 text-[11px] text-gray-400 font-mono">ref: {error.digest}</p>
      )}
    </div>
  );
}
