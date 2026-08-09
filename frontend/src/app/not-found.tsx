import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-[#FAF7F2]">
      <p className="font-serif text-7xl font-bold text-[#5C3317]">404</p>
      <h1 className="mt-4 text-xl font-semibold text-gray-900">Page not found</h1>
      <p className="mt-2 text-sm text-gray-500 max-w-sm">
        The page you&#39;re looking for doesn&#39;t exist or has moved.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block bg-[#5C3317] text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#4A2810] transition-colors"
      >
        Back to home
      </Link>
    </div>
  );
}
