const isStoreProfile = process.env.EAS_BUILD_PROFILE === 'production';
const iosAdMobAppId = process.env.ADMOB_IOS_APP_ID || (isStoreProfile ? '' : 'ca-app-pub-3940256099942544~1458002511');
const androidAdMobAppId = process.env.ADMOB_ANDROID_APP_ID || (isStoreProfile ? '' : 'ca-app-pub-3940256099942544~3347511713');
const iosRewardedAdUnitId = process.env.ADMOB_IOS_REWARDED_AD_UNIT_ID || '';
const androidRewardedAdUnitId = process.env.ADMOB_ANDROID_REWARDED_AD_UNIT_ID || '';

if (isStoreProfile && (!iosAdMobAppId || !androidAdMobAppId || !iosRewardedAdUnitId || !androidRewardedAdUnitId)) {
  throw new Error('Production builds require AdMob app IDs and rewarded ad unit IDs for both platforms.');
}

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    'expo-tracking-transparency',
    [
      'react-native-google-mobile-ads',
      {
        iosAppId: iosAdMobAppId,
        androidAppId: androidAdMobAppId,
        delayAppMeasurementInit: true,
        userTrackingUsageDescription: 'This identifier helps AfroReel show relevant ads and measure rewards.'
      }
    ]
  ],
  extra: {
    ...config.extra,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || undefined,
    iosRewardedAdUnitId,
    androidRewardedAdUnitId,
    environment: process.env.APP_ENV || 'development'
  }
});
