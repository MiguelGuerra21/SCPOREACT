const webpack = require('webpack');

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      webpackConfig.resolve.fallback = {
        ...(webpackConfig.resolve.fallback || {}),
        process: require.resolve('process/browser.js'), // Agrega extensión .js
        buffer: require.resolve('buffer/'),
        stream: require.resolve('stream-browserify'),
        path: require.resolve('path-browserify'),
        fs: false,
        os: false,
        crypto: false,
      };

      webpackConfig.plugins = [
        ...(webpackConfig.plugins || []),
        new webpack.ProvidePlugin({
          process: 'process/browser.js', // Usa la ruta completa
          Buffer: ['buffer', 'Buffer'],
        }),
      ];

      // Regla para deshabilitar fullySpecified en módulos problemáticos
      webpackConfig.module.rules.unshift({
        test: /\.m?js$/,
        resolve: {
          fullySpecified: false,
        },
        include: /node_modules\/@arcgis\/core/,
      });

      return webpackConfig;
    },
  },
};