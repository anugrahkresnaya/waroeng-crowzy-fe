import { assetUrl } from "@/lib/assets";

/** A drawn asset from public/assets, by manifest id. SVGs carry their own styles, so <img> is enough. */
export function Art({ id, className = "" }: { id: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={assetUrl(id)} alt="" draggable={false} className={`block h-auto w-full select-none ${className}`} />
  );
}
