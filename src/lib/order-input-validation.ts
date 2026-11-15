import type { ProductCategory } from '@/types/ppob';

export function gameRequiresServerZone(operator: string) {
  const normalized = operator.toLocaleLowerCase('id-ID').replace(/[^a-z0-9]/g, '');
  return normalized === 'mlbb' || normalized.includes('mobilelegends');
}

export function validateOrderDestination(
  category: ProductCategory,
  operator: string,
  destination: string,
  serverZoneId?: string | null,
) {
  const target = destination.trim();
  if (serverZoneId && category !== 'game') {
    return 'INVALID_GAME_SERVER_ID';
  }
  if (category === 'pln') {
    return validatePlnMeterNumber(target) ? null : 'INVALID_PLN_METER_NUMBER';
  }
  if (category !== 'game') {
    return target.length >= 3 && target.length <= 128
      ? null
      : 'INVALID_ORDER_DESTINATION';
  }

  if (!/^[a-zA-Z0-9._-]{4,64}$/.test(target)) {
    return 'INVALID_GAME_USER_ID';
  }
  if (gameRequiresServerZone(operator) && !/^\d{1,10}$/.test(serverZoneId?.trim() ?? '')) {
    return 'INVALID_GAME_SERVER_ID';
  }
  if (serverZoneId && !/^[a-zA-Z0-9._-]{1,32}$/.test(serverZoneId.trim())) {
    return 'INVALID_GAME_SERVER_ID';
  }
  return null;
}

export function validatePlnMeterNumber(value: string) {
  const normalized = value.trim();
  return /^\d{9,16}$/.test(normalized);
}
