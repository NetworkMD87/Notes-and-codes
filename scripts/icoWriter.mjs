// Pure: assemble .ico bytes from PNG frames. No I/O, no deps — unit-tested.
//
// Layout: 6-byte header, one 16-byte directory entry per frame, then the payloads.
// Each payload is a complete PNG file. Every frame of the icon this repo has shipped
// since 1.0 is PNG-compressed, so this matches the proven structure — and it keeps
// build/icon.ico around 18KB, where an uncompressed-BMP writer produces ~288KB.

export function writeIco(frames) {
  const n = frames.length
  const dir = Buffer.alloc(6 + n * 16)
  dir.writeUInt16LE(0, 0) // reserved
  dir.writeUInt16LE(1, 2) // type: 1 = icon
  dir.writeUInt16LE(n, 4) // frame count

  let offset = 6 + n * 16
  frames.forEach((f, i) => {
    const o = 6 + i * 16
    // Width/height are single bytes, so 256 has to be written as 0.
    const dim = f.size >= 256 ? 0 : f.size
    dir.writeUInt8(dim, o)        // width
    dir.writeUInt8(dim, o + 1)    // height
    dir.writeUInt8(0, o + 2)      // palette colours (0 = truecolour)
    dir.writeUInt8(0, o + 3)      // reserved
    dir.writeUInt16LE(1, o + 4)   // colour planes
    dir.writeUInt16LE(32, o + 6)  // bits per pixel
    dir.writeUInt32LE(f.png.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += f.png.length
  })

  return Buffer.concat([dir, ...frames.map((f) => f.png)])
}
