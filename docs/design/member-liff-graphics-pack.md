# Member LIFF graphics pack

The live `/member/liff` shell already imports `liff-customer-graphics.js`, `liff-approved-entry.js`, `liff-customer-brand-v6.js` and Personal Main artwork. These modules remain the source of truth; generated files are portable copies, not a second runtime catalog.

From the repository root:

```sh
python3 scripts/pack-member-liff-graphics.py --out /tmp/member-liff-graphics --download
```

The command exports embedded images and SVGs, downloads six approved hosted illustrations, deduplicates by SHA-256, writes `manifest.json`, and creates a responsive `index.html` contact sheet. Without `--download` it is offline and leaves hosted images as references. A failed image download fails the command rather than claiming a complete pack. Run it into a fresh output folder.

Validation on 2026-10-31: 32 unique assets, six hosted images; all output checksums and raster decodes verified. Anonymous production HTML contains 13 embedded images, 29 decorative graphic markers and eight SVG icon markers. This confirms use in rendered HTML; authenticated LINE acceptance is separate. Exporting the pack does not require a Worker deployment or alter identity, membership, payment, points, or visibility behavior.
