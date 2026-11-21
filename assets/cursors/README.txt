Custom cursors. Until a file exists the browser shows its normal cursor, so nothing breaks.

Format: .cur (best, hotspot is stored inside) or PNG. Max 128x128, 32x32 recommended.
"Hotspot" = the exact pixel that counts as the click point; the numbers in index.html (the `--cur-*` lines) are used for PNGs.

File             Shown when                                   Hotspot (x y)
default.cur      normal pointer everywhere                    4 4   (tip of the arrow)
pointer.cur      links, buttons, cards, tabs                  8 4   (tip of the finger)
text.cur         over text and inside form fields (I-beam)    16 16 (centre)
wait.cur         while the contact form is sending            16 16
progress.cur     busy but still clickable (aria-busy)         4 4
not-allowed.cur  disabled buttons                             16 16
help.cur         abbr[title] hints                            4 4
grab.cur         draggable things (ready, not used yet)       16 16
grabbing.cur     while dragging (not used yet)                16 16

Keep the same names; to change a hotspot edit the matching --cur-* line in index.html.
