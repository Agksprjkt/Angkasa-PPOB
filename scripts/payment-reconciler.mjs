const endpoint = process.env.PAYMENT_RECONCILER_URL
  ?? 'http://app:3000/api/internal/reconcile-payments';
const productSyncEndpoint = process.env.DIGIFLAZZ_SYNC_URL
  ?? 'http://app:3000/api/internal/digiflazz-product-sync';
const secret = process.env.PAYMENT_RECONCILER_SECRET;
const intervalMs = 60_000;

if (!secret || Buffer.byteLength(secret) < 32) {
  console.error('PAYMENT_RECONCILER_SECRET must contain at least 32 bytes.');
  process.exit(1);
}

while (true) {
  for (const [label, url] of [
    ['Payment reconciliation', endpoint],
    ['Digiflazz product sync check', productSyncEndpoint],
  ]) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) {
        console.error(`${label} failed with HTTP ${response.status}.`);
      } else {
        console.info(`${label} completed with HTTP ${response.status}.`);
      }
    } catch (error) {
      console.error(
        `${label} request failed.`,
        error instanceof Error ? error.message : 'Unknown request error',
      );
    }
  }
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
