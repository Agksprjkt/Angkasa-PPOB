import { randomBytes } from 'node:crypto';

const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function createOrderCode(prefix: 'INV' | 'PAY') {
  const bytes = randomBytes(5);
  let suffix = '';
  let accumulator = 0;
  let bitsAvailable = 0;
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bitsAvailable += 8;
    while (bitsAvailable >= 5) {
      bitsAvailable -= 5;
      suffix += alphabet[(accumulator >> bitsAvailable) & 31];
      accumulator &= (1 << bitsAvailable) - 1;
    }
  }
  return `${prefix}-${suffix}`;
}
