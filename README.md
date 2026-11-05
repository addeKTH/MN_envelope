# M-N interaction capacity

Web version of `Main_gui.m` and `MN_envelope.m` in MN_envelope: M-N capacity of a rectangular section without tensile strength, stress diagrams at failure and the load factor along a load line, with an optional rotation limit. Plain JavaScript, no libraries and no build step.

| File | Content |
|---|---|
| `index.html` | layout, as the MATLAB figure, 560 x 800 px; viewport 600 px, so that a phone shows the whole width |
| `app.js` | GUI: input, tick box, plot, section drawing, drag of p1 and p2 by mouse or finger |
| `mn_envelope.js` | solver, port of MN_envelope.m |

When a file changes, raise `?v=` and "Last modified" in `index.html`.

## Disclaimer

This software is provided for research, education and preliminary assessment. It is provided "as is", without warranty of any kind, express or implied. The results have not been independently certified and do not replace the verification required by the applicable codes, regulations and infrastructure manager requirements. The user is responsible for verifying the results, and the author accepts no liability for their use.
