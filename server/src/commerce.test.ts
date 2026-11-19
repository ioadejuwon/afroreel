import { describe, expect, it } from "vitest";
import { coinProducts, coinsForProduct } from "./commerce";

describe("coin product catalog", () => {
  it("maps only allow-listed store product identifiers", () => {
    expect(coinsForProduct("com.afroreel.coins.330")).toBe(330);
    expect(coinsForProduct("client-supplied-999999")).toBeNull();
  });

  it("uses unique identifiers and positive coin amounts", () => {
    expect(new Set(coinProducts.map((product) => product.productId)).size).toBe(coinProducts.length);
    expect(coinProducts.every((product) => product.coins > 0)).toBe(true);
  });
});
