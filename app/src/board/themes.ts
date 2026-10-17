import type { BoardStyle } from "../store/prefs";

/** Board backgrounds as SVG data URIs (rendered once, cached by the browser). */

function squares(fill: (dark: boolean) => string): string {
  let out = "";
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const dark = (r + f) % 2 === 1;
      out += `<rect x="${f}" y="${r}" width="1" height="1" fill="${fill(dark)}"/>`;
    }
  return out;
}

function uri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const wood = uri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges">` +
    `<defs><filter id="g" x="0" y="0" width="1" height="1">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.08 1.6" numOctaves="2" seed="7"/>` +
    `<feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.2  0 0 0 0 0.08  0 0 0 0.10 0"/>` +
    `<feComposite in2="SourceGraphic" operator="in"/></filter></defs>` +
    squares((d) => (d ? "#b07d55" : "#ecd5ad")) +
    `<rect width="8" height="8" fill="#000" opacity="1" filter="url(#g)"/>` +
    `</svg>`,
);

const print = uri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8">` +
    `<defs><pattern id="h" width="0.11" height="0.11" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<rect width="0.11" height="0.11" fill="#fbf8f1"/><rect width="0.036" height="0.11" fill="#3a352d"/></pattern></defs>` +
    squares((d) => (d ? "url(#h)" : "#fbf8f1")) +
    `</svg>`,
);

const slate = uri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges">` +
    squares((d) => (d ? "#8aa0ab" : "#dfe5e7")) +
    `</svg>`,
);

/** Plain data URIs (for SVG <image>). */
export const BOARD_DATA: Record<BoardStyle, string> = { wood, print, slate };
/** CSS url() values (for backgrounds). */
export const BOARD_IMAGES: Record<BoardStyle, string> = {
  wood: `url("${wood}")`,
  print: `url("${print}")`,
  slate: `url("${slate}")`,
};

export const BOARD_LABELS: Record<BoardStyle, string> = {
  wood: "Wood",
  print: "Book print",
  slate: "Slate",
};
