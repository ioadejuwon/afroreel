import Constants from 'expo-constants';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { Platform } from 'react-native';
import {
  endConnection,
  fetchProducts,
  finishTransaction,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type Product,
  type Purchase,
  type PurchaseError,
} from 'react-native-iap';
import mobileAds, {
  AdEventType,
  AdsConsent,
  AdsConsentStatus,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';
import { fetchJson } from './api';
import type { AuthUser } from '@/types/api.types';

declare const __DEV__: boolean;

export const COIN_PRODUCTS = [
  { productId: 'com.afroreel.coins.100', coins: 100, label: 'Starter' },
  { productId: 'com.afroreel.coins.330', coins: 330, label: 'Plus' },
  { productId: 'com.afroreel.coins.1150', coins: 1150, label: 'Premium' },
] as const;

export type StoreCoinProduct = {
  productId: string;
  coins: number;
  label: string;
  title: string;
  displayPrice: string;
};

type PurchaseResult = { user: AuthUser; productId: string; coinsAdded: number; alreadyProcessed: boolean };
type AdClaim = { nonce: string; episodeId: string; expiresInSeconds: number; remaining: number };
type AdClaimStatus = { status: 'pending' | 'verified' | 'expired' | 'rejected'; episodeId: string; reason: string | null };

let personalizedAdsAllowed = false;
let adsReady = false;

export async function initializeAdvertisingConsent(): Promise<void> {
  try {
    const consent = await AdsConsent.gatherConsent();
    if (!consent.canRequestAds) return;
    const choices = await AdsConsent.getUserChoices();
    personalizedAdsAllowed = consent.status === AdsConsentStatus.NOT_REQUIRED || choices.selectPersonalisedAds;
    if (Platform.OS === 'ios' && personalizedAdsAllowed) {
      const tracking = await requestTrackingPermissionsAsync();
      personalizedAdsAllowed = personalizedAdsAllowed && tracking.status === 'granted';
    }
    await mobileAds().initialize();
    adsReady = true;
  } catch {
    // Coin purchases and playback remain available when consent or ad initialization fails.
    personalizedAdsAllowed = false;
  }
}

export async function connectCoinStore(callbacks: {
  onProducts: (products: StoreCoinProduct[]) => void;
  onPurchase: (result: PurchaseResult) => void;
  onError: (message: string) => void;
}): Promise<() => void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    callbacks.onError('Coin purchases are available in the iOS and Android apps.');
    return () => undefined;
  }
  await initConnection();
  const purchaseSubscription = purchaseUpdatedListener((purchase) => {
    void verifyAndFinishPurchase(purchase).then(callbacks.onPurchase).catch((error) => {
      callbacks.onError(error instanceof Error ? error.message : 'Could not verify this store purchase.');
    });
  });
  const errorSubscription = purchaseErrorListener((error: PurchaseError) => {
    callbacks.onError(error.code === 'user-cancelled' ? 'Purchase cancelled.' : error.message || 'The store could not complete this purchase.');
  });

  try {
    const productIds = COIN_PRODUCTS.map(item => item.productId);
    const products = await fetchProducts({ skus: productIds, type: 'in-app' });
    callbacks.onProducts(mapStoreProducts((products ?? []).filter(product => product.type === 'in-app') as Product[]));
  } catch (error) {
    purchaseSubscription.remove();
    errorSubscription.remove();
    await endConnection();
    throw error;
  }

  return () => {
    purchaseSubscription.remove();
    errorSubscription.remove();
    void endConnection();
  };
}

function mapStoreProducts(products: Product[]): StoreCoinProduct[] {
  const byId = new Map(products.map(product => [product.id, product]));
  return COIN_PRODUCTS.flatMap((definition) => {
    const product = byId.get(definition.productId);
    return product ? [{
      productId: definition.productId,
      coins: definition.coins,
      label: definition.label,
      title: product.title,
      displayPrice: product.displayPrice,
    }] : [];
  });
}

export async function requestCoinPurchase(productId: string): Promise<void> {
  if (!COIN_PRODUCTS.some(product => product.productId === productId)) throw new Error('Choose a valid coin pack.');
  await requestPurchase({
    request: Platform.OS === 'ios' ? { apple: { sku: productId } } : { google: { skus: [productId] } },
    type: 'in-app',
  });
}

async function verifyAndFinishPurchase(purchase: Purchase): Promise<PurchaseResult> {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const transactionId = purchase.transactionId || purchase.id;
  const result = await fetchJson<PurchaseResult>('/api/store/purchases', {
    method: 'POST',
    body: JSON.stringify({
      platform,
      productId: purchase.productId,
      transactionId,
      purchaseToken: purchase.purchaseToken,
    }),
  });
  await finishTransaction({ purchase, isConsumable: true });
  return result;
}

function rewardedAdUnitId(): string {
  if (__DEV__) return TestIds.REWARDED;
  const extra = (Constants.expoConfig?.extra ?? {}) as { iosRewardedAdUnitId?: string; androidRewardedAdUnitId?: string };
  const value = Platform.OS === 'ios' ? extra.iosRewardedAdUnitId : extra.androidRewardedAdUnitId;
  if (!value) throw new Error('Rewarded ads are not configured for this build.');
  return value;
}

export async function unlockEpisodeWithRewardedAd(userId: string, episodeId: string): Promise<{ remaining: number }> {
  if (!adsReady) await initializeAdvertisingConsent();
  if (!adsReady) throw new Error('Ads are unavailable. You can still unlock this episode with coins.');
  const claim = await fetchJson<AdClaim>('/api/ad-rewards/claims', {
    method: 'POST',
    body: JSON.stringify({ episodeId }),
  });
  const ad = RewardedAd.createForAdRequest(rewardedAdUnitId(), {
    requestNonPersonalizedAdsOnly: !personalizedAdsAllowed,
    serverSideVerificationOptions: { userId, customData: claim.nonce },
  });
  await new Promise<void>((resolve, reject) => {
    let earned = false;
    let settled = false;
    const timeout = setTimeout(() => finish(new Error('The ad took too long to load. Please try again.')), 30_000);
    const subscriptions = [
      ad.addAdEventListener(RewardedAdEventType.LOADED, () => { void ad.show().catch(finish); }),
      ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => { earned = true; }),
      ad.addAdEventListener(AdEventType.ERROR, (error) => finish(new Error(error.message || 'No ad is available right now.'))),
      ad.addAdEventListener(AdEventType.CLOSED, () => {
        if (!earned) finish(new Error('Finish the ad to unlock this episode.'));
        else void waitForClaim(claim.nonce, claim.expiresInSeconds).then(() => finish()).catch(finish);
      }),
    ];
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      subscriptions.forEach(unsubscribe => unsubscribe());
      ad.destroy();
      if (error) reject(error); else resolve();
    }
    ad.load();
  });
  return { remaining: Math.max(0, claim.remaining - 1) };
}

async function waitForClaim(nonce: string, expiresInSeconds: number): Promise<void> {
  const deadline = Date.now() + Math.min(expiresInSeconds * 1000, 30_000);
  while (Date.now() < deadline) {
    const claim = await fetchJson<AdClaimStatus>(`/api/ad-rewards/claims/${nonce}`);
    if (claim.status === 'verified') return;
    if (claim.status !== 'pending') throw new Error(claim.reason || 'The ad reward could not be verified.');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Ad verification is delayed. Check the episode again in a moment.');
}
