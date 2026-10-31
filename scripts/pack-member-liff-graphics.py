#!/usr/bin/env python3
"""Export the graphics used by /member/liff without executing Worker code."""
import argparse, base64, hashlib, html, json, re
from pathlib import Path
from urllib.request import urlopen

SOURCES = [
    'member-pages-worker/src/liff-customer-graphics.js',
    'member-pages-worker/src/liff-customer-brand-v6.js',
    'member-pages-worker/src/liff-approved-entry.js',
    'member-pages-worker/src/liff-personal-main-public-images.js',
    'shared/personal-main-catalog.mjs',
    'member-dashboard-chat-worker/src/my-mmd-visual-assets.js',
]

def export(root, output, download=False):
    output.mkdir(parents=True, exist_ok=True)
    records, seen = [], {}
    def save(data, ext, source, origin):
        digest = hashlib.sha256(data).hexdigest()
        if digest in seen:
            seen[digest]['sources'].append(source)
            return
        name = f'{Path(source).stem}-{len(records)+1:02d}.{ext}'
        (output/name).write_bytes(data)
        record = dict(file=name, bytes=len(data), sha256=digest, sources=[source], origin=origin)
        records.append(record)
        seen[digest] = record
    remote = set()
    for source in SOURCES:
        text = (root/source).read_text()
        for match in re.finditer(r'data:image/(webp|png|jpeg|svg\+xml);base64,([A-Za-z0-9+/=]+)', text):
            kind, value = match.groups()
            save(base64.b64decode(value, validate=True), {'svg+xml':'svg','jpeg':'jpg'}.get(kind, kind), source, 'embedded')
        for value in re.findall(r'"svg"\s*:\s*("(?:\\.|[^"\\])*")', text):
            save(json.loads(value).encode(), 'svg', source, 'inline-svg')
        remote.update(re.findall(r'https://[^\s\x27"<>`]+\.(?:webp|png|svg|jpg)', text))
        if source == 'shared/personal-main-catalog.mjs':
            cdn = re.search(r"const CDN = '([^']+)'", text).group(1)
            remote.update(cdn+x for x in re.findall(r"image:CDN\+'([^']+)'", text))
    references = []
    for url in sorted(remote):
        if download:
            with urlopen(url, timeout=30) as response:
                data = response.read(10*1024*1024+1)
                if len(data)>10*1024*1024: raise ValueError('image exceeds limit')
                if not response.headers.get_content_type().startswith('image/'): raise ValueError('not an image')
            save(data, url.rsplit('.',1)[1], 'hosted-artwork', url)
        references.append(dict(url=url, downloaded=download))
    manifest = dict(route='/member/liff', sources=SOURCES, assets=records, hosted_references=references)
    (output/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    cards=''.join('<figure><img src="'+html.escape(x['file'])+'" alt=""><figcaption>'+html.escape(x['file'])+'</figcaption></figure>' for x in records)
    (output/'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Member LIFF graphics</title><style>body{background:#171b1d;color:#f3f0e8;font:16px system-ui;margin:20px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:16px}figure{margin:0;padding:16px;background:#292d2f;border:1px solid #77664a;border-radius:12px;min-width:0}img{width:100%;height:180px;object-fit:contain}figcaption{overflow-wrap:anywhere;margin-top:12px}</style><h1>MY MMD · /member/liff</h1><main>'+cards+'</main></html>')
    return manifest

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=Path('.'))
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--download',action='store_true',help='Include the approved hosted image binaries')
    args=parser.parse_args()
    result=export(args.root,args.out,args.download)
    print(json.dumps(dict(assets=len(result['assets']),hosted=len(result['hosted_references']))))
