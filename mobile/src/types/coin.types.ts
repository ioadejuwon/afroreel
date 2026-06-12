/**
 * AfroReel — Coin & Monetization Types
 */

// ── Coin Packages (matches PRD pricing) ──────────────────
export type CoinPackageId = 'starter' | 'plus' | 'premium';

export interface CoinPackage {
  id: CoinPackageId;
  label: string;        // e.g. 'Starter'
  coins: number;        // e.g. 100
  price: number;        // in USD cents, e.g. 99 = $0.99
  priceDisplay: string; // e.g. '$0.99'
  isFeatured: boolean;
  badge?: string;       // e.g. 'BEST VALUE'
}

export const COIN_PACKAGES: CoinPackage[] = [
  {
    id: 'starter',
    label: 'Starter',
    coins: 100,
    price: 99,
    priceDisplay: '$0.99',
    isFeatured: false,
  },
  {
    id: 'plus',
    label: 'Plus',
    coins: 300,
    price: 199,
    priceDisplay: '$1.99',
    isFeatured: true,
    badge: 'POPULAR',
  },
  {
    id: 'premium',
    label: 'Premium',
    coins: 1000,
    price: 499,
    priceDisplay: '$4.99',
    isFeatured: false,
    badge: 'BEST VALUE',
  },
];

// ── Ad Reward ─────────────────────────────────────────────
export const AD_REWARD_COINS = 5;     // 1 ad = 5 coins (per PRD)
export const EPISODE_UNLOCK_COST = 5; // 1 episode = 5 coins (per PRD)
export const FREE_EPISODES_COUNT = 5; // First 5 episodes free (per PRD)

// ── Transaction Types ─────────────────────────────────────
export type CoinTransactionType =
  | 'purchase'      // Bought a coin pack
  | 'ad_reward'     // Watched an ad
  | 'episode_unlock'// Spent coins to unlock
  | 'daily_checkin' // Daily bonus
  | 'referral'      // Referred a friend (Phase 2)
  | 'streak_bonus'; // Streak reward

export interface CoinTransaction {
  id: string;
  type: CoinTransactionType;
  amount: number;           // Positive = earned, negative = spent
  balanceAfter: number;
  description: string;
  createdAt: string;
}

// ── Wallet State ──────────────────────────────────────────
export interface CoinWallet {
  balance: number;
  transactions: CoinTransaction[];
  streakDays: number;
  lastCheckinDate?: string;
}

// ── Purchase Payload ──────────────────────────────────────
export interface PurchaseCoinPayload {
  packageId: CoinPackageId;
  paymentMethod: 'card' | 'flutterwave' | 'apple_pay' | 'google_pay';
}

export interface PurchaseCoinResponse {
  success: boolean;
  coinsAdded: number;
  newBalance: number;
  transactionId: string;
}
