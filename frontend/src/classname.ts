// Classes are stored as slugs (e.g. "boat-pose"). This title-cases them for display,
// splitting on hyphens. Roman-numeral suffixes stay uppercase ("warrior-ii" -> "Warrior II").
const ROMAN = /^(i{1,3}|iv|v|vi{0,3}|ix|x)$/;

export function prettyClass(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => (ROMAN.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}
