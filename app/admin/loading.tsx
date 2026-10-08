/**
 * Instant fallback for every admin section.
 *
 * The pages are force-dynamic live reads, so without a loading boundary a nav
 * click shows nothing until the whole server render (auth + RPCs) finishes, and
 * <Link> has nothing it can prefetch. With it, the layout + this skeleton are
 * prefetched and swap in the moment a section is clicked.
 */
export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-5 animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-4 w-24 rounded-pill bg-muted" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[92px] rounded-stat bg-card" />
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-2.5">
        <div className="h-[130px] rounded-stat bg-card" />
        <div className="h-[130px] rounded-stat bg-card" />
      </div>
      <div className="h-[220px] rounded-card bg-card" />
    </div>
  );
}
