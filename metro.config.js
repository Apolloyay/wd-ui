// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web build loads a wa-sqlite WASM binary; Metro needs to know
// to treat .wasm as a bundled asset rather than trying to parse it as JS.
// https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/#web-support
config.resolver.assetExts.push('wasm');

module.exports = config;
