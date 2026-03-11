import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <h1 className="text-6xl font-bold text-foreground-muted">404</h1>
      <p className="text-lg text-foreground-muted mt-2 text-center">
        Page not found. The route you opened does not exist.
      </p>
      <Link
        to="/dashboard"
        className="mt-6 rounded-md bg-primary px-4 py-2 text-primary-inverse font-medium hover:opacity-90"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
