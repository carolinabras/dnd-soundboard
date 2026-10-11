const path = require('path');

/** @type {import('webpack').Configuration} */
module.exports = {
  mode: 'development',
  entry: {
    index: './src/main/index.ts',
    preload: './src/main/preload.ts',
  },
  target: 'electron-main',
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
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist/main'),
  },
  node: {
    __dirname: false,
    __filename: false,
  },
};
