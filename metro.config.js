const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

// Expo 57 native DOM export renames assets but leaves split-chunk references stale.
// Bundle the language collection together until Expo fixes shared DOM chunk exports.
process.env.EXPO_NO_BUNDLE_SPLITTING ??= "1";

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push("wasm");

module.exports = withNativewind(config, {
  inlineVariables: false,
});
