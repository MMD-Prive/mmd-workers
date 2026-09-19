# /docs Secret Documents headline lock

The previous Thai hero subtitle is rejected:

```text
เอกสารเฉพาะที่เปิดได้เมื่อมีสิทธิ์
```

Reason: it feels stiff, unclear, and visually heavy when displayed as a large hero headline.

Use this hero lock instead:

```text
Secret Documents
เอกสารลับสำหรับผู้ที่ได้รับรหัสเท่านั้น
```

Mobile-safe shorter option:

```text
Secret Documents
เปิดได้เฉพาะผู้ที่ได้รับรหัส
```

Recommended for Webflow `/docs`:

```html
<h1 id="msd8Title">
  <span data-i18n="hero.title">Secret Documents</span>
  <em data-i18n="hero.subtitle">เปิดได้เฉพาะผู้ที่ได้รับรหัส</em>
</h1>
```

Dictionary patch:

```js
"hero.subtitle": "เปิดได้เฉพาะผู้ที่ได้รับรหัส"
```

English stays:

```js
"hero.subtitle": "Private files, opened only with the right access."
```

Archive card Thai should also be simplified:

```text
ไม่ใช่เอกสารสาธารณะ
เปิดตามรหัสที่ MMD ส่งให้เท่านั้น
```

Dictionary patch:

```js
"archive.title": "ไม่ใช่เอกสารสาธารณะ",
"archive.subtitle": "เปิดตามรหัสที่ MMD ส่งให้เท่านั้น"
```
