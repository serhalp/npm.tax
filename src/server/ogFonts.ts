/**
 * Fonts for the OG image.
 *
 * Satori reads ttf/otf/woff but not woff2, so the image cannot reuse the app's
 * woff2 faces, and it ignores `font-stretch`: every Archivo width has to be
 * registered as its own family. These are Google Fonts' static TTF instances
 * (Archivo v25 semi-expanded 700 and condensed 600; IBM Plex Mono v20 600),
 * subset to latin and inlined into the server bundle so rendering never depends
 * on a request-time font fetch. Both families are OFL 1.1; the license text
 * ships in `public/fonts/`.
 */
import archivoCondensed600 from "./fonts/archivo-condensed-600.ttf?inline";
import archivoExpanded700 from "./fonts/archivo-expanded-700.ttf?inline";
import plexMono600 from "./fonts/plex-mono-600.ttf?inline";

/**
 * The card's type registers. Only three ship: the card is all verdict, labels
 * and figures, so a normal-width prose face would be bytes nothing renders in.
 */
export const OG_FONT = {
  /** Wide grotesque: verdict headlines. */
  statement: "Archivo Expanded",
  /** Condensed uppercase: eyebrows and labels. */
  label: "Archivo Condensed",
  /** Every numeric figure and package ref. */
  mono: "IBM Plex Mono",
} as const;

interface OgFont {
  name: string;
  data: ArrayBuffer;
  weight: 600 | 700;
  style: "normal";
}

function decodeFont(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bytes = Buffer.from(base64, "base64");
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

let cached: OgFont[] | undefined;

/** Decoded once per server instance; the byte arrays never change. */
export function ogFonts(): OgFont[] {
  cached ??= [
    { name: OG_FONT.statement, data: decodeFont(archivoExpanded700), weight: 700, style: "normal" },
    { name: OG_FONT.label, data: decodeFont(archivoCondensed600), weight: 600, style: "normal" },
    { name: OG_FONT.mono, data: decodeFont(plexMono600), weight: 600, style: "normal" },
  ];
  return cached;
}
