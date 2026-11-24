'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { authClient } from '@/lib/auth-client';
import {
  CatalogProduct,
  Product,
  ProductCategory,
  Transaction,
  ManualDeposit,
  BalanceMutation,
  UserRole,
  UserAccount,
  PaymentGatewaySettings,
  SupportedPG,
} from '@/types/ppob';
import {
  INITIAL_PG_SETTINGS,
} from '@/data/mock-data';
import { DEFAULT_STORE_NAME } from '@/lib/store-branding';
import { normalizeSocialLinks, type NormalizedSocialLink } from '@/lib/social-links';

export interface ToastMessage {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface PPOBContextType {
  storeName: string;
  storeLogoUrl: string | null;
  storeTagline: string;
  storeSocialLinks: NormalizedSocialLink[];
  updateStoreName: (name: string) => void;
  refreshStoreIdentity: () => Promise<void>;
  // Auth & Roles
  currentUser: UserAccount | null;
  users: UserAccount[];
  role: UserRole; // 'user' | 'agent' | 'admin' or guest if currentUser is null
  isGuest: boolean;
  authPending: boolean;
  logout: () => Promise<void>;
  updateUserBalance: (userId: string, amount: number, note: string) => void;
  updateUserRole: (userId: string, newRole: UserRole) => void;

  // Wallet Balance
  balance: number;
  commissionBalance: number;
  refreshBalance: () => Promise<void>;

  // Products & CRUD
  products: CatalogProduct[];
  catalogPending: boolean;
  refreshProducts: () => Promise<void>;  refreshAdminUsers: () => Promise<void>;
  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<boolean>;
  deleteProduct: (id: string) => void;
  applyBulkMarkup: (type: 'nominal' | 'percent', value: number, category?: ProductCategory) => void;
  syncDigiflazzPrices: () => Promise<void>;

  // Transactions
  transactions: Transaction[];
  transactionTotal: number;
  transactionsPending: boolean;
  deposits: ManualDeposit[];
  depositReviewTotal: number;
  hasMoreAdminDeposits: boolean;
  loadingMoreAdminDeposits: boolean;
  loadMoreAdminDeposits: () => Promise<void>;
  mutations: BalanceMutation[];
  toasts: ToastMessage[];
  addToast: (title: string, message: string, type?: ToastMessage['type']) => void;
  removeToast: (id: string) => void;

  // Purchase Actions
  buyProductWithBalance: (
    productId: string,
    destination: string,
    customerName?: string,
    serverZoneId?: string,
    transactionPin?: string,
  ) => Promise<{ success: boolean; transaction: Transaction; error?: string }>;

  // Deposits
  approveDeposit: (depositId: string, note?: string) => void;
  rejectDeposit: (depositId: string, reason: string) => void;

  // Payment Gateway Settings (Rule: Only 1 active PG at a time)
  pgSettings: PaymentGatewaySettings;
  setActiveGateway: (gateway: SupportedPG) => void;
  toggleQrisly: (enabled: boolean) => void;
  updateStaticQris: (updates: Partial<PaymentGatewaySettings['staticQris']>) => void;
  updateDigiflazzSettings: (updates: Partial<PaymentGatewaySettings['digiflazz']>) => void;

  // Admin Ops
  refundTransaction: (transactionId: string) => void;
  retryTransaction: (transactionId: string) => Promise<void>;
  resetToDefault: () => void;
}

const PPOBContext = createContext<PPOBContextType | undefined>(undefined);

export function PPOBProvider({ children }: { children: React.ReactNode }) {
  const { data: authSession, isPending: authPending } = authClient.useSession();
  const [catalog, setCatalog] = useState<{
    userId: string | null;
    role: string;
    products: CatalogProduct[];
  } | null>(null);
  const [transactionHistory, setTransactionHistory] = useState<{
    userId: string;
    transactions: Transaction[];
    total: number;
  } | null>(null);  const [depositReview, setDepositReview] = useState<{
    adminId: string;
    deposits: ManualDeposit[];
    total: number;
    nextPage: number;
  } | null>(null);
  const [userDirectory, setUserDirectory] = useState<{
    adminId: string;
    users: UserAccount[];
  } | null>(null);
  const [pgSettings] = useState<PaymentGatewaySettings>(INITIAL_PG_SETTINGS);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [storeName, setStoreName] = useState(DEFAULT_STORE_NAME);
  const [storeLogoUrl, setStoreLogoUrl] = useState<string | null>(null);
  const [storeTagline, setStoreTagline] = useState('');
  const [storeSocialLinks, setStoreSocialLinks] = useState<NormalizedSocialLink[]>([]);
  const [walletOverride, setWalletOverride] = useState<{
    userId: string;
    balance: number;
  } | null>(null);
  const purchaseKeys = useRef(new Map<string, string>());
  const depositPageInFlight = useRef(false);
  const [loadingMoreAdminDeposits, setLoadingMoreAdminDeposits] = useState(false);

  const updateStoreName = useCallback((name: string) => {
    if (name.trim()) setStoreName(name.trim());
  }, []);

  const loadStoreIdentity = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('/api/store-settings', {
      cache: 'no-store',
      signal,
    });
    const result = await response.json() as {
      storeName?: unknown;
      tagline?: unknown;
      logoUrl?: unknown;
      socialLinks?: unknown;
      error?: string;
    };
    if (!response.ok || typeof result.storeName !== 'string' || !result.storeName.trim()) {
      throw new Error(result.error ?? 'Identitas toko gagal dimuat.');
    }
    return {
      storeName: result.storeName.trim(),
      tagline: typeof result.tagline === 'string' ? result.tagline : '',
      logoUrl: typeof result.logoUrl === 'string' ? result.logoUrl : null,
      socialLinks: normalizeSocialLinks(result.socialLinks),
    };
  }, []);

  const refreshStoreIdentity = useCallback(async () => {
    const identity = await loadStoreIdentity();
    setStoreName(identity.storeName);
    setStoreLogoUrl(identity.logoUrl);
    setStoreTagline(identity.tagline);
    setStoreSocialLinks(identity.socialLinks);
  }, [loadStoreIdentity]);

  useEffect(() => {
    const controller = new AbortController();
    void loadStoreIdentity(controller.signal)
      .then((identity) => {
        if (controller.signal.aborted) return;
        setStoreName(identity.storeName);
        setStoreLogoUrl(identity.logoUrl);
        setStoreTagline(identity.tagline);
        setStoreSocialLinks(identity.socialLinks);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error('[STORE_NAME_LOAD_FAILED]', error);
        }
      });
    return () => controller.abort();
  }, [loadStoreIdentity]);

  const sessionUser = authSession?.user;
  const sessionUserId = sessionUser?.id ?? null;
  const sessionRole = sessionUser?.role ?? 'guest';
  const catalogReady = Boolean(
    catalog && catalog.userId === sessionUserId && catalog.role === sessionRole,
  );
  const catalogPending = authPending || !catalogReady;
  const products = catalogReady && catalog ? catalog.products : [];
  const transactionsReady = Boolean(
    sessionUserId && transactionHistory?.userId === sessionUserId,
  );
  const transactionsPending = authPending || (Boolean(sessionUserId) && !transactionsReady);
  const transactions = transactionsReady && transactionHistory
    ? transactionHistory.transactions
    : [];
  const transactionTotal = transactionsReady && transactionHistory
    ? transactionHistory.total
    : transactions.length;
  const deposits =
    sessionRole === 'admin' && depositReview?.adminId === sessionUserId
      ? depositReview.deposits
      : [];
  const depositReviewTotal =
    sessionRole === 'admin' && depositReview?.adminId === sessionUserId
      ? depositReview.total
      : 0;
  const hasMoreAdminDeposits = deposits.length < depositReviewTotal;
  const users =
    sessionRole === 'admin' && userDirectory?.adminId === sessionUserId
      ? userDirectory.users
      : [];
  const mutations: BalanceMutation[] = [];

  const currentUser: UserAccount | null = sessionUser
    ? {
      id: sessionUser.id,
      name: sessionUser.name,
      email: sessionUser.email,
      phone: sessionUser.phoneNumber ?? '',
      role: sessionUser.role === 'admin' || sessionUser.role === 'agent'
        ? sessionUser.role
        : 'user',
      balance:
        walletOverride?.userId === sessionUser.id
          ? walletOverride.balance
          : sessionUser.balance ?? 0,
      commissionBalance: sessionUser.commissionBalance ?? 0,
      createdAt: new Date(sessionUser.createdAt).toISOString(),
    }
    : null;

  const toastIdPrefix = useId().replace(/:/g, '');
  const toastSequence = useRef(0);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((
    title: string,
    message: string,
    type: ToastMessage['type'] = 'info',
  ) => {
    toastSequence.current += 1;
    const id = `${toastIdPrefix}-${toastSequence.current}`;
    setToasts((prev) => [...prev, { id, title, message, type }]);
    window.setTimeout(() => {
      removeToast(id);
    }, 4500);
  }, [removeToast, toastIdPrefix]);

  const refreshAdminUsers = useCallback(async () => {
    const response = await fetch('/api/admin/users');
    const result = (await response.json()) as {
      users?: UserAccount[];
      error?: string;
    };
    if (!response.ok || !result.users) {
      throw new Error(result.error ?? 'Daftar pengguna gagal dimuat.');
    }
    if (sessionUserId) {
      setUserDirectory({ adminId: sessionUserId, users: result.users });
    }
  }, [sessionUserId]);

  const refreshProducts = useCallback(async () => {
    const endpoint = sessionRole === 'admin'
      ? '/api/admin/products'
      : '/api/products';
    const response = await fetch(endpoint);
    const result = await response.json() as { products?: CatalogProduct[]; error?: string };
    if (!response.ok || !Array.isArray(result.products)) {
      throw new Error(result.error ?? 'Katalog gagal dimuat ulang.');
    }
    setCatalog({
      userId: sessionUserId,
      role: sessionRole,
      products: result.products,
    });
  }, [sessionRole, sessionUserId]);

  useEffect(() => {
    if (authPending) return;
    let active = true;
    const catalogEndpoint = sessionRole === 'admin'
      ? '/api/admin/products'
      : '/api/products';
    void fetch(catalogEndpoint)
      .then(async (response) => {
        if (!response.ok) throw new Error('Katalog belum tersedia dari server.');
        return (await response.json()) as { products: CatalogProduct[] };
      })
      .then((result) => {
        if (active) {
          setCatalog({
            userId: sessionUserId,
            role: sessionRole,
            products: result.products,
          });
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message =
          error instanceof Error ? error.message : 'Katalog gagal dimuat.';
        // Mark this session as settled so the skeleton does not spin forever.
        setCatalog({ userId: sessionUserId, role: sessionRole, products: [] });
        addToast('Katalog Tidak Tersedia', message, 'warning');
      });

    return () => {
      active = false;
    };
  }, [addToast, authPending, sessionRole, sessionUserId]);

  useEffect(() => {
    if (authPending) return;
    if (!sessionUserId) return;

    let active = true;
    void fetch('/api/transactions', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Riwayat transaksi gagal dimuat.');
        return (await response.json()) as { transactions: Transaction[]; total: number };
      })
      .then((result) => {
        if (active) {
          setTransactionHistory({
            userId: sessionUserId,
            transactions: result.transactions,
            total: result.total,
          });
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message =
          error instanceof Error ? error.message : 'Riwayat transaksi gagal dimuat.';
        setTransactionHistory({ userId: sessionUserId, transactions: [], total: 0 });
        addToast('Riwayat Tidak Tersedia', message, 'warning');
      });

    return () => {
      active = false;
    };
  }, [addToast, authPending, sessionUserId]);

  useEffect(() => {
    if (authPending || sessionRole !== 'admin' || !sessionUserId) return;
    let active = true;
    void fetch('/api/admin/deposits')
      .then(async (response) => {
        if (!response.ok) throw new Error('Daftar deposit gagal dimuat.');
        return (await response.json()) as {
          deposits: ManualDeposit[];
          page: number;
          total: number;
        };
      })
      .then((result) => {
        if (active) {
          setDepositReview({
            adminId: sessionUserId,
            deposits: result.deposits,
            total: result.total,
            nextPage: result.page + 1,
          });
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        addToast(
          'Deposit Tidak Tersedia',
          error instanceof Error ? error.message : 'Daftar deposit gagal dimuat.',
          'warning',
        );
      });

    return () => {
      active = false;
    };
  }, [addToast, authPending, sessionRole, sessionUserId]);

  useEffect(() => {
    if (authPending || sessionRole !== 'admin' || !sessionUserId) return;

    let active = true;
    void fetch('/api/admin/users')
      .then(async (response) => {
        const result = (await response.json()) as {
          users?: UserAccount[];
          error?: string;
        };
        if (!response.ok || !result.users) {
          throw new Error(result.error ?? 'Daftar pengguna gagal dimuat.');
        }
        return result.users;
      })
      .then((result) => {
        if (active) {
          setUserDirectory({ adminId: sessionUserId, users: result });
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        addToast(
          'Pengguna Tidak Tersedia',
          error instanceof Error ? error.message : 'Daftar pengguna gagal dimuat.',
          'warning',
        );
      });

    return () => {
      active = false;
    };
  }, [addToast, authPending, sessionRole, sessionUserId]);

  const role: UserRole = currentUser ? currentUser.role : 'user';
  const isGuest = currentUser === null;
  const balance = currentUser ? currentUser.balance : 0;
  const commissionBalance = currentUser ? currentUser.commissionBalance : 0;

  const logout = async () => {
    const { error } = await authClient.signOut();
    if (error) {
      addToast('Logout Gagal', error.message ?? 'Silakan coba kembali.', 'error');
      return;
    }
    addToast('Logout Berhasil', 'Anda telah keluar dari akun.', 'info');
  };

  const updateUserBalance = (userId: string, amount: number, note: string) => {
    void (async () => {
      try {
        const response = await fetch('/api/admin/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'balance',
            userId,
            delta: amount,
            note,
            requestId: crypto.randomUUID(),
          }),
        });
        const result = (await response.json()) as {
          balance?: number;
          error?: string;
        };
        if (!response.ok || result.balance === undefined) {
          throw new Error(result.error ?? 'Penyesuaian saldo gagal disimpan.');
        }
        if (userId === sessionUserId) {
          setWalletOverride({ userId, balance: result.balance });
        }
        addToast('Saldo Diperbarui', 'Penyesuaian dicatat di ledger.', 'success');
      } catch (error) {
        addToast(
          'Saldo Tidak Diperbarui',
          error instanceof Error ? error.message : 'Penyesuaian saldo gagal disimpan.',
          'error',
        );
        return;
      }

      try {
        await refreshAdminUsers();
      } catch (error) {
        addToast(
          'Daftar Pengguna Gagal Diperbarui',
          error instanceof Error ? error.message : 'Muat ulang panel untuk data terbaru.',
          'warning',
        );
      }
    })();
  };

  const updateUserRole = (userId: string, newRole: UserRole) => {
    void (async () => {
      try {
        const response = await fetch('/api/admin/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'role', userId, role: newRole }),
        });
        const result = (await response.json()) as {
          user?: { id: string; role: UserRole };
          error?: string;
        };
        if (!response.ok || !result.user) {
          throw new Error(result.error ?? 'Peran pengguna gagal diperbarui.');
        }
        addToast('Peran Diperbarui', `Peran pengguna sekarang ${result.user.role}.`, 'success');
      } catch (error) {
        addToast(
          'Peran Tidak Diperbarui',
          error instanceof Error ? error.message : 'Peran pengguna gagal diperbarui.',
          'error',
        );
        return;
      }

      try {
        await refreshAdminUsers();
      } catch (error) {
        addToast(
          'Daftar Pengguna Gagal Diperbarui',
          error instanceof Error ? error.message : 'Muat ulang panel untuk data terbaru.',
          'warning',
        );
      }
    })();
  };

  // Payment Gateway Setting: RULE: User/Admin can only pick 1 active PG at a time!
  const setActiveGateway = (gateway: SupportedPG) => {
    void gateway;
    addToast('Gateway Belum Tersedia', 'Konfigurasi gateway harus disimpan aman di server dan belum diaktifkan.', 'warning');
  };

  const toggleQrisly = (enabled: boolean) => {
    void enabled;
    addToast('Gateway Belum Tersedia', 'Pengaturan pembayaran belum tersimpan di server.', 'warning');
  };

  const updateStaticQris = (updates: Partial<PaymentGatewaySettings['staticQris']>) => {
    void updates;
    addToast('QRIS Belum Tersedia', 'QRIS belum tersimpan di penyimpanan server.', 'warning');
  };

  const updateDigiflazzSettings = (updates: Partial<PaymentGatewaySettings['digiflazz']>) => {
    void updates;
    addToast('Digiflazz Belum Tersedia', 'Simpan kredensial hanya melalui konfigurasi server, bukan browser.', 'warning');
  };

  const syncDigiflazzPrices = async () => {
    addToast('Sinkronisasi Belum Tersedia', 'Saldo dan harga Digiflazz tidak boleh disimulasikan.', 'warning');
  };

  const buyProductWithBalance = async (
    productId: string,
    destination: string,
    customerName?: string,
    serverZoneId?: string,
    transactionPin?: string,
  ): Promise<{ success: boolean; transaction: Transaction; error?: string }> => {
    if (!currentUser) {
      throw new Error('Silakan login untuk membayar menggunakan saldo deposit.');
    }

    const requestKey = `${currentUser.id}:${productId}:${destination}:${serverZoneId ?? ''}`;
    let idempotencyKey = purchaseKeys.current.get(requestKey);
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      purchaseKeys.current.set(requestKey, idempotencyKey);
    }

    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        productId,
        destination,
        customerName,
        serverZoneId,
        transactionPin,
        paymentMethod: 'balance',
      }),
    });

    const result = (await response.json()) as {
      transaction?: Transaction;
      balance?: number;
      error?: string;
      message?: string;
    };

    if (result.balance !== undefined) {
      setWalletOverride({ userId: currentUser.id, balance: result.balance });
    }
    if (!result.transaction) {
      throw new Error(result.message ?? result.error ?? 'Transaksi tidak dapat dibuat.');
    }

    const transaction = result.transaction;
    setTransactionHistory((previous) => ({
      userId: currentUser.id,
      total: (previous?.userId === currentUser.id ? previous.total : 0) +
        ((previous?.userId === currentUser.id &&
          previous.transactions.some((item) => item.id === transaction.id))
          ? 0
          : 1),
      transactions: [
        transaction,
        ...(previous?.userId === currentUser.id ? previous.transactions : [])
          .filter((item) => item.id !== transaction.id),
      ].slice(0, 50),
    }));

    if (transaction.status === 'success') {
      purchaseKeys.current.delete(requestKey);
      addToast('Transaksi Berhasil', `${transaction.productName} berhasil diproses.`, 'success');
      return { success: true, transaction };
    }

    if (transaction.status === 'failed') {
      purchaseKeys.current.delete(requestKey);
      const error = result.error ?? 'Transaksi gagal dan saldo telah dikembalikan.';
      addToast('Transaksi Gagal', error, 'error');
      return { success: false, transaction, error };
    }

    addToast(
      'Transaksi Diproses',
      'Status dari provider belum final. Saldo ditahan sementara; jangan ulangi pesanan.',
      'warning',
    );
    return {
      success: false,
      transaction,
      error: result.error ?? 'Status transaksi masih diproses.',
    };
  };

  const refreshBalance = useCallback(async () => {
    const response = await fetch('/api/user/wallet', { cache: 'no-store' });
    const result = await response.json() as { balance?: number; error?: string };
    if (!response.ok || !Number.isSafeInteger(result.balance)) {
      throw new Error(result.error ?? 'Saldo gagal diperbarui.');
    }
    if (sessionUserId && typeof result.balance === 'number') {
      setWalletOverride({ userId: sessionUserId, balance: result.balance });
    }
  }, [sessionUserId]);

  useEffect(() => {
    if (authPending || !sessionUserId) return;
    let active = true;
    const refresh = () => {
      void refreshBalance().catch((error: unknown) => {
        if (active) console.error('[WALLET_REFRESH_FAILED]', error);
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    refresh();
    const intervalId = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [authPending, refreshBalance, sessionUserId]);

  const refreshAdminDeposits = async () => {
    const response = await fetch('/api/admin/deposits');
    const result = (await response.json()) as {
      deposits?: ManualDeposit[];
      page?: number;
      total?: number;
      error?: string;
    };
    if (
      !response.ok ||
      !result.deposits ||
      typeof result.page !== 'number' ||
      typeof result.total !== 'number'
    ) {
      throw new Error(result.error ?? 'Daftar deposit gagal diperbarui.');
    }
    if (sessionUserId) {
      setDepositReview({
        adminId: sessionUserId,
        deposits: result.deposits,
        total: result.total,
        nextPage: result.page + 1,
      });
    }
  };

  const loadMoreAdminDeposits = async () => {
    const current = depositReview;
    if (
      !sessionUserId ||
      sessionRole !== 'admin' ||
      current?.adminId !== sessionUserId ||
      current.deposits.length >= current.total ||
      depositPageInFlight.current
    ) {
      return;
    }

    depositPageInFlight.current = true;
    setLoadingMoreAdminDeposits(true);
    try {
      const page = current.nextPage;
      const response = await fetch(`/api/admin/deposits?page=${page}`, {
        cache: 'no-store',
      });
      const result = (await response.json()) as {
        deposits?: ManualDeposit[];
        page?: number;
        total?: number;
        error?: string;
      };
      if (
        !response.ok ||
        !result.deposits ||
        result.page !== page ||
        typeof result.total !== 'number'
      ) {
        throw new Error(result.error ?? 'Riwayat deposit tambahan gagal dimuat.');
      }

      setDepositReview((previous) => {
        if (
          previous?.adminId !== sessionUserId ||
          previous.nextPage !== page
        ) {
          return previous;
        }
        const existingIds = new Set(previous.deposits.map((deposit) => deposit.id));
        return {
          adminId: sessionUserId,
          deposits: [
            ...previous.deposits,
            ...result.deposits!.filter((deposit) => !existingIds.has(deposit.id)),
          ],
          total: result.total!,
          nextPage: page + 1,
        };
      });
    } finally {
      depositPageInFlight.current = false;
      setLoadingMoreAdminDeposits(false);
    }
  };

  const approveDeposit = (depositId: string, note: string = 'Verifikasi mutasi rekening valid') => {
    void (async () => {
      try {
        const response = await fetch('/api/admin/deposits', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: depositId, action: 'approve', note }),
        });
        const result = (await response.json()) as {
          error?: string;
          alreadyReviewed?: boolean;
        };
        if (!response.ok) throw new Error(result.error ?? 'Deposit gagal diproses.');
        addToast(
          result.alreadyReviewed ? 'Deposit Sudah Ditinjau' : 'Deposit Disetujui',
          result.alreadyReviewed
            ? 'Deposit ini sebelumnya sudah ditinjau.'
            : 'Saldo berhasil dikreditkan dan dicatat ke ledger.',
          result.alreadyReviewed ? 'info' : 'success',
        );
      } catch (error) {
        addToast(
          'Deposit Gagal Diproses',
          error instanceof Error ? error.message : 'Terjadi kesalahan.',
          'error',
        );
        return;
      }

      try {
        await refreshAdminDeposits();
      } catch (error) {
        addToast(
          'Daftar Deposit Gagal Diperbarui',
          error instanceof Error ? error.message : 'Muat ulang panel untuk melihat status terbaru.',
          'warning',
        );
      }
    })();
  };

  const rejectDeposit = (depositId: string, reason: string) => {
    void (async () => {
      try {
        const response = await fetch('/api/admin/deposits', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: depositId, action: 'reject', note: reason }),
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error ?? 'Deposit gagal ditolak.');
        addToast('Deposit Ditolak', 'Status penolakan disimpan di server.', 'info');
      } catch (error) {
        addToast(
          'Deposit Gagal Ditolak',
          error instanceof Error ? error.message : 'Terjadi kesalahan.',
          'error',
        );
        return;
      }

      try {
        await refreshAdminDeposits();
      } catch (error) {
        addToast(
          'Daftar Deposit Gagal Diperbarui',
          error instanceof Error ? error.message : 'Muat ulang panel untuk melihat status terbaru.',
          'warning',
        );
      }
    })();
  };

  const addProduct = (prodData: Omit<Product, 'id'>) => {
    void fetch('/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prodData),
    })
      .then(async (response) => {
        const result = (await response.json()) as { product?: Product; error?: string };
        if (!response.ok || !result.product) {
          throw new Error(result.error ?? 'Produk gagal disimpan.');
        }
        const savedProduct = result.product;
        setCatalog((previous) => ({
          userId: sessionUserId,
          role: sessionRole,
          products: [savedProduct, ...(previous?.products ?? [])],
        }));
        addToast('Produk Ditambahkan', `${savedProduct.name} tersimpan di database.`, 'success');
      })
      .catch((error: unknown) => {
        addToast(
          'Produk Gagal Disimpan',
          error instanceof Error ? error.message : 'Terjadi kesalahan.',
          'error',
        );
      });
  };

  const updateProduct = async (
    id: string,
    updates: Partial<Product>,
  ): Promise<boolean> => {
    try {
      const response = await fetch('/api/admin/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, updates }),
      });
      const result = (await response.json()) as { product?: Product; error?: string };
      if (!response.ok || !result.product) {
        throw new Error(result.error ?? 'Produk gagal diperbarui.');
      }
      const savedProduct = result.product;
      setCatalog((previous) => ({
        userId: sessionUserId,
        role: sessionRole,
        products: (previous?.products ?? []).map((product) =>
          product.id === id ? savedProduct : product,
        ),
      }));
      addToast('Produk Diperbarui', 'Data produk tersimpan di database.', 'success');
      return true;
    } catch (error) {
      addToast(
        'Produk Gagal Diperbarui',
        error instanceof Error ? error.message : 'Terjadi kesalahan.',
        'error',
      );
      return false;
    }
  };

  const deleteProduct = (id: string) => {
    void fetch(`/api/admin/products?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      .then(async (response) => {
        const result = (await response.json()) as { product?: Product; error?: string };
        if (!response.ok || !result.product) {
          throw new Error(result.error ?? 'Produk gagal dinonaktifkan.');
        }
        const savedProduct = result.product;
        setCatalog((previous) => ({
          userId: sessionUserId,
          role: sessionRole,
          products: (previous?.products ?? []).map((product) =>
            product.id === id ? savedProduct : product,
          ),
        }));
        addToast('Produk Dinonaktifkan', 'Produk dinonaktifkan di database.', 'info');
      })
      .catch((error: unknown) => {
        addToast(
          'Produk Gagal Dinonaktifkan',
          error instanceof Error ? error.message : 'Terjadi kesalahan.',
          'error',
        );
      });
  };

  const applyBulkMarkup = (type: 'nominal' | 'percent', value: number, category?: ProductCategory) => {
    void type;
    void value;
    void category;
    addToast('Markup Belum Tersedia', 'Bulk markup belum terhubung ke database.', 'warning');
  };

  const refundTransaction = (transactionId: string) => {
    void transactionId;
    addToast('Refund Tidak Diproses', 'Refund belum tersedia melalui API server.', 'error');
  };

  const retryTransaction = async (transactionId: string) => {
    void transactionId;
    addToast('Retry Tidak Diproses', 'Retry hanya dapat dilakukan setelah worker provider siap.', 'warning');
  };

  const resetToDefault = () => {
    addToast('Reset Dinonaktifkan', 'Data server tidak dapat direset dari browser.', 'warning');
  };

  return (
    <PPOBContext.Provider
      value={{
        storeName,
        storeLogoUrl,
        storeTagline,
        storeSocialLinks,
        updateStoreName,
        refreshStoreIdentity,
        currentUser,
        refreshBalance,
        users,
        role,
        isGuest,
        logout,
        authPending,
        updateUserBalance,
        updateUserRole,
        balance,
        commissionBalance,
        products,
        catalogPending,
        refreshProducts,
    refreshAdminUsers,
        addProduct,
        updateProduct,
        deleteProduct,
        applyBulkMarkup,
        syncDigiflazzPrices,
        transactions,
        transactionTotal,
    transactionsPending,
        deposits,
        depositReviewTotal,
        hasMoreAdminDeposits,
        loadingMoreAdminDeposits,
        loadMoreAdminDeposits,
        mutations,
        toasts,
        addToast,
        removeToast,
        buyProductWithBalance,
        approveDeposit,
        rejectDeposit,
        pgSettings,
        setActiveGateway,
        toggleQrisly,
        updateStaticQris,
        updateDigiflazzSettings,
        refundTransaction,
        retryTransaction,
        resetToDefault,
      }}
    >
      {children}
    </PPOBContext.Provider>
  );
}

export function usePPOB() {
  const context = useContext(PPOBContext);
  if (!context) throw new Error('usePPOB must be used within PPOBProvider');
  return context;
}
