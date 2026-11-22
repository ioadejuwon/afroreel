import { describe, expect, it } from "vitest";
import { MediaError } from "./cloudflare";
import { verifyAdMobCallback, verifyStorePurchase } from "./monetization";

describe("monetization trust boundaries", () => {
  it("rejects client-defined coin products before contacting a store", async () => {
    await expect(verifyStorePurchase({
      platform: "ios",
      productId: "com.afroreel.coins.999999",
      transactionId: "1234567890",
      purchaseToken: "",
    })).rejects.toMatchObject<Partial<MediaError>>({ status: 400 });
  });

  it("rejects unsigned AdMob reward callbacks", async () => {
    await expect(verifyAdMobCallback("transaction_id=fake&custom_data=fake"))
      .rejects.toMatchObject<Partial<MediaError>>({ status: 401 });
  });
});
