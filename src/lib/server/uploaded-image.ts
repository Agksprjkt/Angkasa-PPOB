import 'server-only';

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getValidatedImageExtension } from '@/lib/image-validation';

const maxImageSize = 5 * 1024 * 1024;

export async function validateUploadedImage(file: File) {
  if (file.size < 1 || file.size > maxImageSize) {
    throw new Error('IMAGE_SIZE_INVALID');
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = getValidatedImageExtension(file.type, bytes);
  if (!extension) {
    throw new Error(
      ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
        ? 'IMAGE_CONTENT_INVALID'
        : 'IMAGE_TYPE_INVALID',
    );
  }
  return { bytes, mimeType: file.type, extension };
}

export async function saveUploadedImage(file: File, folder: string, id = randomUUID()) {
  const image = await validateUploadedImage(file);
  const directory = join(process.cwd(), '.data', 'uploads', folder);
  const filename = `${id}.${image.extension}`;
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, filename), image.bytes, { flag: 'wx' });
  return { filename, mimeType: image.mimeType };
}

export function getUploadedImagePath(folder: string, filename: string) {
  if (!/^[\da-f-]{36}\.(jpg|png|webp)$/i.test(filename)) {
    throw new Error('IMAGE_NAME_INVALID');
  }
  return join(process.cwd(), '.data', 'uploads', folder, filename);
}

export function getImageMimeType(filename: string) {
  if (filename.endsWith('.jpg')) return 'image/jpeg';
  if (filename.endsWith('.png')) return 'image/png';
  if (filename.endsWith('.webp')) return 'image/webp';
  throw new Error('IMAGE_NAME_INVALID');
}
