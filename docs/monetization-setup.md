# Monetization setup

AfroReel sells the consumable products `com.afroreel.coins.100`,
`com.afroreel.coins.330`, and `com.afroreel.coins.1150`. Configure the same IDs
in App Store Connect and Play Console, using localized price tiers near US
$1.99, $4.99, and $12.99. The app always displays the store-returned price.

## Server secrets

Set the Apple issuer ID, key ID, bundle ID, and base64-encoded In-App Purchase
private key. For Google Play, set the package name, service-account email,
base64-encoded private key, and a long random webhook token. Set the two AdMob
rewarded-unit IDs on both the server and EAS build environment. The complete
variable list is in `.env.example`.

Configure these callbacks using the public HTTPS server origin:

- App Store Server Notifications V2: `/webhooks/apple/app-store`
- Google Play Pub/Sub push: `/webhooks/google/play?token=<GOOGLE_PLAY_WEBHOOK_TOKEN>`
- AdMob rewarded SSV: `/webhooks/admob/reward`

Run `npm run db:migrate` before enabling monetization. In admin Settings, keep
monetization disabled until store sandbox purchases and AdMob SSV callbacks pass.

## Mobile builds and testing

Production EAS builds require both AdMob app IDs and both rewarded-unit IDs.
Development builds use Google's rewarded test unit. Use App Store sandbox/TestFlight
accounts and Google Play license testers; never test production ads by repeatedly
viewing or clicking them yourself.

The server is authoritative: it credits a purchase once after store verification,
and it unlocks an episode only after a signed AdMob callback. Store refunds reverse
the coin credit without relocking episodes already unlocked.
