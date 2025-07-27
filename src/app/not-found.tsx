import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <h2 className="mb-4 text-xl">Page Not Found</h2>
        <p className="mb-6 text-gray-600">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/"
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
