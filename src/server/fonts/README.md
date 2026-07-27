# OG image fonts

Static TTF instances, subset to latin, inlined into the server bundle by
`../ogFonts.ts`. Satori (via `@vercel/og`) reads ttf/otf/woff but **not woff2**,
so the OG image cannot reuse the app's woff2 faces in `public/fonts/`.

| File                        | Family / instance                        | Upstream                                                        |
| --------------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| `archivo-expanded-700.ttf`  | Archivo, semi-expanded width, weight 700 | [Omnibus-Type/Archivo](https://github.com/Omnibus-Type/Archivo) |
| `archivo-condensed-600.ttf` | Archivo, condensed width, weight 600     | [Omnibus-Type/Archivo](https://github.com/Omnibus-Type/Archivo) |
| `plex-mono-600.ttf`         | IBM Plex Mono, weight 600                | [IBM/plex](https://github.com/IBM/plex)                         |

Satori ignores `font-stretch`, which is why each Archivo width ships as its own
family rather than one variable face.

Both families are SIL Open Font License 1.1. These subsets are derivative works;
the license texts travel with them in `../../../public/fonts/Archivo-OFL.txt`
and `../../../public/fonts/IBMPlexMono-OFL.txt`.
