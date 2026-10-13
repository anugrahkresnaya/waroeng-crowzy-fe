import manifest from "@/public/assets/manifest.json";

interface AssetEntry {
  id: string;
  file: string;
  viewBox: string;
}

const byId = new Map<string, AssetEntry>((manifest as AssetEntry[]).map((a) => [a.id, a]));

/** URL of a drawn asset, by the id in public/assets/manifest.json. */
export function assetUrl(id: string): string {
  const entry = byId.get(id);
  if (!entry) throw new Error(`Unknown asset "${id}"`);
  return `/assets/${entry.file}`;
}
