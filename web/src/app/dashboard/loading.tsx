function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="h-3 w-14 bg-gray-200 rounded animate-pulse" />
        <div className="h-3 w-20 bg-gray-200 rounded-full animate-pulse" />
      </div>
      <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
      <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
      <div className="h-3 w-20 bg-gray-200 rounded animate-pulse mt-auto" />
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="flex items-center justify-between px-8 py-4 bg-white border-b">
        <div className="h-5 w-14 bg-gray-200 rounded animate-pulse" />
        <div className="flex gap-4">
          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="h-7 w-44 bg-gray-200 rounded animate-pulse mb-2" />
        <div className="h-4 w-80 bg-gray-200 rounded animate-pulse mb-8" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </main>
  );
}
