// deterministic hue per class slug, so a class draws the same box color everywhere
function hueFor(label: string): number {
  let h = 0;
  for (let i = 0; i < label.length; i++)
    h = (h * 31 + label.charCodeAt(i)) % 360;
  return h;
}

export function boxColor(label: string): string {
  return `hsl(${hueFor(label)} 80% 55%)`;
}
