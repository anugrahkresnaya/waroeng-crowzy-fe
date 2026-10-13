// Run after `next build`: bundles sw/sw.ts into out/sw.js with the list of exported files to precache.
const config = {
  swSrc: "sw/sw.ts",
  swDest: "out/sw.js",
  globDirectory: "out",
  globPatterns: ["**/*.{html,js,css,svg,json,webmanifest,png,ico,txt,woff2}"],
  globIgnores: ["sw.js", "**/*.map"],
  maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
};

export default config;
