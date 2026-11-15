export function getValidatedImageExtension(mimeType: string, bytes: Buffer) {
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
      ? 'jpg'
      : null;
  }
  if (mimeType === 'image/png') {
    return bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      ? 'png'
      : null;
  }
  if (mimeType === 'image/webp') {
    return bytes.length >= 12 &&
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP'
      ? 'webp'
      : null;
  }
  return null;
}
