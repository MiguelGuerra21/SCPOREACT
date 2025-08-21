const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require('path');

// Detectar si es Electron mediante la variable de entorno
const isElectron = process.env.IS_ELECTRON === 'true';

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Polyfills necesarios para ArcGIS y Node modules en navegador
      webpackConfig.resolve.fallback = {
        ...(webpackConfig.resolve.fallback || {}),
        process: require.resolve('process/browser.js'),
        buffer: require.resolve('buffer/'),
        stream: require.resolve('stream-browserify'),
        path: require.resolve('path-browserify'),
        assert: require.resolve('assert/'),
        fs: false,
        os: false,
        crypto: false,
      };

      webpackConfig.plugins = [
        ...(webpackConfig.plugins || []),

        // Proveer process y Buffer globales
        new webpack.ProvidePlugin({
          process: 'process/browser.js',
          Buffer: ['buffer', 'Buffer'],
        }),

        // Copiar assets: libs, workers y tiles
        new CopyWebpackPlugin({
          patterns: [
            {
              from: path.resolve(__dirname, 'src/libs'),
              to: path.resolve(__dirname, 'build/libs'),
              noErrorOnMissing: true,
            },
            {
              from: path.resolve(__dirname, 'src/workers'),
              to: path.resolve(__dirname, 'build/workers'),
              noErrorOnMissing: true,
            },
            {
              from: path.resolve(__dirname, 'public/tiles'),
              to: path.resolve(__dirname, 'build/tiles'),
              noErrorOnMissing: true,
            },
          ],
        }),
      ];

      // Fix para ArcGIS Core
      webpackConfig.module.rules.unshift({
        test: /\.m?js$/,
        resolve: { fullySpecified: false },
        include: /node_modules\/@arcgis\/core/,
      });

      // Output para web vs Electron
      webpackConfig.output = {
        ...webpackConfig.output,
        globalObject: 'this'
      };

      return webpackConfig;
    },
  },
};
