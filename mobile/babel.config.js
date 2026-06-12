module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Required for path aliases (matches tsconfig paths)
      [
        'module-resolver',
        {
          root: ['./src'],
          alias: {
            '@': './src',
            '@components': './src/components',
            '@screens': './src/screens',
            '@constants': './src/constants',
            '@store': './src/store',
            '@hooks': './src/hooks',
            '@services': './src/services',
            '@types': './src/types',
            '@utils': './src/utils',
          },
        },
      ],
      // Reanimated plugin MUST be last
      'react-native-reanimated/plugin',
    ],
  };
};
