export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded-xl ${className}`} />
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="w-full aspect-[3/4] rounded-2xl" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

export function CategoryCardSkeleton() {
  return (
    <div className="flex-shrink-0 w-[138px] flex flex-col gap-2">
      <Skeleton className="w-[138px] h-[172px] rounded-2xl" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

export function ProductDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-5">
      <Skeleton className="w-full h-[60vw] max-h-[320px] rounded-3xl" />
      <Skeleton className="h-7 w-3/4" />
      <Skeleton className="h-6 w-1/3" />
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="w-10 h-10 rounded-full" />)}
      </div>
      <Skeleton className="h-14 rounded-full" />
    </div>
  );
}
