/** "Rp12.500", the Indonesian way. */
export function rp(n: number): string {
  const v = Math.round(Math.abs(n));
  return `${n < 0 ? "-" : ""}Rp${v.toLocaleString("id-ID")}`;
}

/** "4,5rb" for compact price tags. */
export function rb(n: number): string {
  return `${(Math.round(n / 100) / 10).toString().replace(".", ",")}rb`;
}
