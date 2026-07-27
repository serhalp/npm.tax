# Fonts

Self-hosted so the app ships no font dependencies of its own. Both families are
licensed under the SIL Open Font License 1.1; the license text ships alongside
each, as the OFL requires.

| File                           | Family                                                          | Source                                                                           | License               |
| ------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------- |
| `archivo-variable-latin.woff2` | Archivo (variable: `wght` 100–900, `wdth` 62–125), latin subset | [Omnibus-Type/Archivo](https://github.com/Omnibus-Type/Archivo) via Google Fonts | `Archivo-OFL.txt`     |
| `plex-mono-400-latin.woff2`    | IBM Plex Mono 400, latin subset                                 | [IBM/plex](https://github.com/IBM/plex) via Google Fonts                         | `IBMPlexMono-OFL.txt` |
| `plex-mono-600-latin.woff2`    | IBM Plex Mono 600, latin subset                                 | [IBM/plex](https://github.com/IBM/plex) via Google Fonts                         | `IBMPlexMono-OFL.txt` |

Archivo carries the type hierarchy on both axes: wide for verdict headlines,
condensed for the uppercase label scaffolding. IBM Plex Mono sets every figure.
Declared in `src/styles.css`; the two most-used files are preloaded in
`src/routes/__root.tsx`.
