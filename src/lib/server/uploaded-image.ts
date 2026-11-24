import 'server-only';

import { randomUUID } from 'node:crypto';
import { getValidatedImageExtension } from '@/lib/image-validation';
import {
  deleteObject,
  getObject,
  imageMimeTypeFor,
  putObject,
} from './storage';

const maxImageSize = 5 * 1024 * 1024;
const imageNamePattern = /^[\da-f-]{36}\.(jpg|png|webp)$/i;

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
  const filename = `${id}.${image.extension}`;
  await putObject(folder, filename, image.bytes, image.mimeType);
  return { filename, mimeType: image.mimeType };
}

export function getImageMimeType(filename: string) {
  return imageMimeTypeFor(filename);
}

export async function readUploadedImage(folder: string, filename: string) {
  if (!imageNamePattern.test(filename)) throw new Error('IMAGE_NAME_INVALID');
  return getObject(folder, filename);
}

export async function uploadedImageExists(folder: string, filename: string) {
  try {
    return (await readUploadedImage(folder, filename)) !== null;
  } catch {
    return false;
  }
}

export async function deleteUploadedImage(folder: string, filename: string) {
  if (!imageNamePattern.test(filename)) throw new Error('IMAGE_NAME_INVALID');
  await deleteObject(folder, filename);
}
