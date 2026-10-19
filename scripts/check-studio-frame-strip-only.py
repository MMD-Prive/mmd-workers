"""Read-only check: owner edits must stay in the small original right-edge strip."""
import hashlib
import json
import struct
import sys
import zlib
from pathlib import Path


def rgba(path):
    data = Path(path).read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not_png")
    offset, compressed, header = 8, bytearray(), None
    while offset < len(data):
        length = struct.unpack_from(">I", data, offset)[0]
        kind = data[offset + 4:offset + 8]
        body = data[offset + 8:offset + 8 + length]
        if kind == b"IHDR":
            header = struct.unpack(">IIBBBBB", body)
        elif kind == b"IDAT":
            compressed.extend(body)
        offset += length + 12
    width, height, depth, color, compression, filtering, interlace = header
    if depth != 8 or color not in (2, 6) or compression or filtering or interlace:
        raise ValueError("unsupported_png_encoding")
    channels = 4 if color == 6 else 3
    stride = width * channels
    raw = zlib.decompress(compressed)
    if len(raw) != (stride + 1) * height:
        raise ValueError("invalid_scanline_size")
    previous = bytearray(stride)
    pixels = bytearray()
    for y in range(height):
        start = y * (stride + 1)
        mode = raw[start]
        row = bytearray(raw[start + 1:start + 1 + stride])
        for x in range(stride):
            left = row[x - channels] if x >= channels else 0
            up = previous[x]
            corner = previous[x - channels] if x >= channels else 0
            if mode == 1:
                predictor = left
            elif mode == 2:
                predictor = up
            elif mode == 3:
                predictor = (left + up) // 2
            elif mode == 4:
                p = left + up - corner
                distances = (abs(p - left), abs(p - up), abs(p - corner))
                predictor = (left, up, corner)[distances.index(min(distances))]
            elif mode == 0:
                predictor = 0
            else:
                raise ValueError("invalid_png_filter")
            row[x] = (row[x] + predictor) & 255
        if channels == 4:
            pixels.extend(row)
        else:
            for x in range(0, stride, 3):
                pixels.extend(row[x:x + 3])
                pixels.append(255)
        previous = row
    return width, height, pixels


def compare(original, candidate):
    width, height, before = rgba(original)
    new_width, new_height, after = rgba(candidate)
    if (width, height) != (new_width, new_height):
        raise ValueError("frame_dimensions_changed")
    changed = []
    for offset in range(0, len(before), 4):
        if before[offset:offset + 4] != after[offset:offset + 4]:
            pixel = offset // 4
            changed.append((pixel % width, pixel // width))
    bounds = None
    if changed:
        xs, ys = zip(*changed)
        bounds = [min(xs), min(ys), max(xs) + 1, max(ys) + 1]
        if bounds[0] < width * .94 or bounds[3] - bounds[1] > height * .25 or len(changed) > width * height * .02:
            raise ValueError("changes_extend_beyond_small_right_edge_strip: " + json.dumps({"bounds": bounds, "changed_pixels": len(changed)}))
    return {"width": width, "height": height, "changed_pixels": len(changed), "changed_bounds_xyxy": bounds, "outside_changed_bounds_identical": True, "sha256": hashlib.sha256(Path(candidate).read_bytes()).hexdigest()}


if __name__ == "__main__":
    try:
        if len(sys.argv) != 3:
            raise ValueError("usage: check-studio-frame-strip-only.py ORIGINAL CANDIDATE")
        print(json.dumps(compare(sys.argv[1], sys.argv[2])))
    except (ValueError, OSError, struct.error, zlib.error) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
