export default function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin ${className}`}
    />
  );
}
