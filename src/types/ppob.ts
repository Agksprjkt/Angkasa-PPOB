export type UserRole = 'user' | 'agent' | 'admin';

export type ProductCategory =
  | 'pulsa'
  | 'data'
  | 'voucher'
  | 'pln'
  | 'tagihan'
  | 'ewallet'
  | 'game';

export interface Product {
  id: string;
  vendorCode: string;
  name: string;
  category: ProductCategory;
  operator: string; // e.g. 'Telkomsel', 'Indosat', 'XL', 'Tri', 'Smartfren', 'PLN', 'PDAM', 'BPJS', 'DANA', 'GoPay', 'OVO', 'ShopeePay', 'Mobile Legends', 'Free Fire', 'PUBG Mobile'
  description: string;
  basePrice: number; // Modal vendor Digiflazz
  sellPriceUser: number; // Harga jual umum
  sellPriceAgent: number; // Harga jual khusus agen
  compareAtPrice?: number | null;
  providerIconUrl?: string | null;
  providerCoverUrl?: string | null;
  providerDescription?: string;
  status: 'active' | 'inactive';
  vendor: 'Digiflazz' | 'Manual';
}

export type CatalogProduct = Omit<Product, 'sellPriceAgent'> & {
  sellPriceAgent?: number;
};

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  phone: string;
  password?: string;
  role: UserRole;
  balance: number;
  commissionBalance: number; // Untuk agen
  createdAt: string;
}

export type TransactionStatus = 'pending' | 'success' | 'failed';

export interface Transaction {
  id: string;
  referenceId: string;
  userId?: string; // Optional if guest / anonymous
  customerPhone?: string;
  productId: string;
  productName: string;
  category: ProductCategory;
  operator: string;
  destination: string; // Nomor HP, ID Meter, atau ID Game + Server
  serverZoneId?: string | null;
  customerName?: string;
  amount: number;
  profit: number;
  status: TransactionStatus;
  paymentMethod: 'balance' | 'midtrans' | 'xendit' | 'doku' | 'qrisly' | 'manual_bank' | 'static_qris';
  needsManualReview?: boolean;
  manualReviewAt?: string | Date | null;
  sn?: string; // SN atau Token / Kode Voucher
  vendorResponse?: {
    code: string;
    message: string;
    rc: string;
    rawTime: string;
    retryHistory?: {
      referenceId: string;
      attemptedAt: string;
      status: TransactionStatus;
      adminId: string;
      code?: string;
      message?: string;
      rc?: string;
    }[];
    reconciliation?: {
      buyerSkuCode: string;
      customerNo: string;
      mode?: 'sandbox' | 'production';
    };
  };
  createdAt: string;
  updatedAt: string;
}

export interface BalanceMutation {
  id: string;
  userId: string;
  type: 'credit' | 'debit';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reference: string;
  note: string;
  createdAt: string;
}

export type DepositStatus = 'pending' | 'approved' | 'rejected';

export interface ManualDeposit {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  amount: number;
  type: 'bank_transfer' | 'static_qris' | 'qrisly';
  targetBank?: string | null;
  paymentMethodLabel?: string | null;
  proofPath: string | null;
  providerReference?: string | null;
  expiresAt?: string | null;
  status: DepositStatus;
  adminNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface ManualPaymentMethod {
  id: string;
  type: 'bank_transfer' | 'static_qris';
  label: string;
  bankName: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
  qrImageUrl: string | null;
  instructions: string;
  enabled: boolean;
}

export interface BankAccount {
  bank: 'BCA' | 'Mandiri' | 'BRI' | 'BSI';
  accountNumber: string;
  accountHolder: string;
  logoText: string;
}

// Payment Gateway Configuration
export type SupportedPG = 'qrisly' | 'doku' | 'midtrans' | 'xendit';

export interface PaymentGatewaySettings {
  activeGateway: SupportedPG | null;
  qrislyEnabled: boolean; // RajaOngkir Qrisly alternative
  staticQris: {
    enabled: boolean;
    qrImageUrl: string;
    merchantName: string;
    nmid: string;
  };
  bankTransfer: {
    enabled: boolean;
    accounts: BankAccount[];
  };
  digiflazz: {
    username: string;
    apiKey: string;
    webhookSecret: string;
    mode: 'sandbox' | 'production';
    balance: number;
  };
}

// Anonymous / Direct Order Invoice
export interface OrderInvoice {
  id: string;
  invoiceNumber: string;
  customerPhone: string;
  customerEmail?: string;
  productId: string;
  productName: string;
  category: ProductCategory;
  operator: string;
  destination: string;
  serverZoneId?: string;
  productPrice: number;
  adminFee: number;
  totalPay: number;
  paymentMethod: 'balance' | 'midtrans' | 'xendit' | 'doku' | 'qrisly' | 'manual_bank' | 'static_qris';
  paymentStatus: 'unpaid' | 'paid' | 'expired' | 'review';
  transactionStatus: 'pending' | 'processing' | 'success' | 'failed';
  sn?: string;
  qrCodeUrl?: string;
  vaNumber?: string;
  proofUrl?: string;
  createdAt: string;
  expiresAt: string;
}
