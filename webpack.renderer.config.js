const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

/** @type {import('webpack').Configuration} */
module.exports = {
  mode: 'development',
  devtool: 'source-map',
  entry: './src/renderer/index.ts',
  target: 'electron-renderer',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/renderer/index.html',
      filename: 'index.html',
    }),
  ],
  output: {
    filename: 'renderer.bundle.js',
    path: path.resolve(__dirname, 'dist/renderer'),
  },
  node: {
    __dirname: false,
    __filename: false,
  },
};
