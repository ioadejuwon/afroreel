export const coinProducts = [
  { productId: "com.afroreel.coins.100", coins: 100 },
  { productId: "com.afroreel.coins.330", coins: 330 },
  { productId: "com.afroreel.coins.1150", coins: 1150 },
] as const;

export function coinsForProduct(productId: string): number | null {
  return coinProducts.find((product) => product.productId === productId)?.coins ?? null;
}
