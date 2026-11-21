# assets/

Everything the site loads lives here. Nothing else is needed at the site root except `index.html`.

```
assets/
├─ favicons/        browser tab + home-screen icons (placeholder set, replace when ready)
├─ cursors/         custom mouse cursors (see cursors/README.txt)
├─ docs/            resume.pdf
├─ icons/
│  └─ tech/         Toolbox logos (SVG, devicon, MIT licence included)
└─ images/
   ├─ profile/      me.png
   ├─ backgrounds/  hero.jpg, footer.jpg
   ├─ projects/     project screenshots (p1.png, p2.png, p3.png, then one per project)
   ├─ certificates/ certificate images (featured certs)
   └─ badges/       Credly / vendor badge images
```


## Favicons
The files in `favicons/` are a placeholder monogram so nothing 404s. To replace them, keep the same file names:
`favicon.ico` (16/32/48), `favicon.svg`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png` (180x180, no transparency),
`android-chrome-192x192.png`, `android-chrome-512x512.png`. Some crawlers ask for `/favicon.ico` at the site root, so copy that one file there too.
