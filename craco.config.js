const webpack = require('webpack');

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Polyfills necesarios
      webpackConfig.resolve.fallback = {
        ...(webpackConfig.resolve.fallback || {}),
        process: require.resolve('process/browser.js'),
        buffer: require.resolve('buffer/'),
        stream: require.resolve('stream-browserify'),
        path: require.resolve('path-browserify'),
        assert: require.resolve("assert/"), 
        fs: false,
        os: false,
        crypto: false,
      };

      // Polyfill global para process y Buffer
      webpackConfig.plugins = [
        ...(webpackConfig.plugins || []),
        new webpack.ProvidePlugin({
          process: 'process/browser.js',
          Buffer: ['buffer', 'Buffer'],
        }),
      ];

      // Fix para ArcGIS Core
      webpackConfig.module.rules.unshift({
        test: /\.m?js$/,
        resolve: {
          fullySpecified: false,
        },
        include: /node_modules\/@arcgis\/core/,
      });

      // Soporte para Web Workers *.worker.js
      webpackConfig.module.rules.push({
        test: /\.worker\.js$/,
        use: { loader: 'worker-loader' },
      });

      return webpackConfig;
    },
  },
};
