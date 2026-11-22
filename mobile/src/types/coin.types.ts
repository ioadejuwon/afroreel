/**
 * AfroReel — Coin & Monetization Types
 */

// ── Coin Packages (matches PRD pricing) ──────────────────
export interface CoinPackage {
  productId: string;
  label: string;
  coins: number;
}

export const COIN_PACKAGES: CoinPackage[] = [
  {
    productId: 'com.afroreel.coins.100',
    label: 'Starter',
    coins: 100,
  },
  {
    productId: 'com.afroreel.coins.330',
    label: 'Plus',
    coins: 330,
  },
  {
    productId: 'com.afroreel.coins.1150',
    label: 'Premium',
    coins: 1150,
  },
];

// Prices are always supplied by App Store or Google Play product metadata.
export const DAILY_AD_UNLOCK_LIMIT = 3;
export const EPISODE_UNLOCK_COST = 5; // 1 episode = 5 coins (per PRD)
export const FREE_EPISODES_COUNT = 5; // First 5 episodes free (per PRD)

// ── Transaction Types ─────────────────────────────────────
export type CoinTransactionType =
  | 'purchase'      // Bought a coin pack
  | 'episode_unlock';// Spent coins to unlock

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
}

// ── Purchase Payload ──────────────────────────────────────
export interface PurchaseCoinPayload {
  platform: 'ios' | 'android';
  productId: string;
  transactionId: string;
  purchaseToken?: string;
}

export interface PurchaseCoinResponse {
  success: boolean;
  coinsAdded: number;
  productId: string;
  alreadyProcessed: boolean;
}
