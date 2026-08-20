import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../tokens.css", import.meta.url), "utf8");
const tokens = new Map(
  [...css.matchAll(/--([\w-]+):\s*oklch\(([^)]+)\)/g)].map((match) => [match[1], match[2]]),
);

function parse(token) {
  const raw = tokens.get(`color-${token}`);
  if (!raw) throw new Error(`Missing color token: ${token}`);
  const [lightness, chroma, hue] = raw.split(/[\s/]+/).slice(0, 3);
  return [Number.parseFloat(lightness) / 100, Number(chroma), Number(hue)];
}

function linearSrgb([lightness, chroma, hue]) {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function luminance(token) {
  const [red, green, blue] = linearSrgb(parse(token)).map((channel) =>
    Math.max(0, Math.min(1, channel)),
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const pairs = [
  ["ink", "paper", 4.5],
  ["ink", "canvas", 4.5],
  ["ink-2", "paper", 4.5],
  ["muted", "paper", 4.5],
  ["muted", "paper-2", 4.5],
  ["accent-ink", "accent", 4.5],
  ["accent", "accent-soft", 4.5],
  ["success", "success-soft", 4.5],
  ["error", "error-soft", 4.5],
  ["paper", "graphite", 4.5],
  ["rule-2", "graphite", 4.5],
  ["focus", "paper", 3],
];

let failed = false;
for (const [foreground, background, minimum] of pairs) {
  const ratio = contrast(foreground, background);
  const passed = ratio >= minimum;
  failed ||= !passed;
  console.log(
    `${passed ? "PASS" : "FAIL"} ${foreground}/${background}: ${ratio.toFixed(2)} (min ${minimum})`,
  );
}
if (failed) process.exitCode = 1;
