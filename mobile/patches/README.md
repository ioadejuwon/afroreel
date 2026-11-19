# Expo launcher compatibility

`expo-dev-launcher+58.0.21.patch` keeps the development launcher's default
toolbar placement instead of calling `axisBehavior`, an iOS 27.1 API missing
from Xcode 27.0's SDK. The upstream `compiler(>=6.4)` check also matches Xcode
27.0, so its runtime availability check does not prevent a compile error.

The mobile `postinstall` script reapplies the versioned patch with
`patch-package --error-on-fail`. After upgrading expo-dev-client, review the
upstream toolbar implementation and remove this patch when it supports Xcode
27.0. This changes only the development launcher's toolbar preference.
