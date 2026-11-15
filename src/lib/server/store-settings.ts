import 'server-only';

import { eq } from 'drizzle-orm';
import { getDatabase } from '@/lib/server/db/client';
import { storeSettings } from '@/lib/server/db/schema';
import { DEFAULT_STORE_NAME } from '@/lib/store-branding';

export const defaultStoreSettings = {
  id: 'default',
  storeName: DEFAULT_STORE_NAME,
  tagline: '',
  description: '',
  supportPhone: '',
  logoFile: null,
  seoTitle: '',
  seoDescription: '',
  googleSiteVerification: '',
  bingSiteVerification: '',
  indexNowKey: null,
};

export async function getStoreSettings() {
  const db = getDatabase();
  await db
    .insert(storeSettings)
    .values(defaultStoreSettings)
    .onConflictDoNothing({ target: storeSettings.id });
  const [settings] = await db
    .select()
    .from(storeSettings)
    .where(eq(storeSettings.id, defaultStoreSettings.id))
    .limit(1);
  if (!settings) throw new Error('STORE_SETTINGS_UNAVAILABLE');
  return settings;
}
