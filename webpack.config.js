const path = require("path");
const webpack = require("webpack");
const TerserPlugin = require("terser-webpack-plugin");

let plugins = [];
let optimization = {};

if (process.env.NODE_ENV === "production") {
  plugins = [
    new webpack.DefinePlugin({
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV)
    })
  ];
  optimization = {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          ie8: true,
          sourceMap: true
        }
      })
    ],
  }
}

module.exports = {
  devtool: "#source-map",
  entry: {
    admin: path.join(__dirname, "src/index.js"),
  },
  output: {
    path: path.join(__dirname, "/dist/"),
    filename: "[name].js",
    publicPath: "/"
  },
  optimization,
  plugins,
  resolve: { extensions: [".css", ".scss", ".js", ".svg", ".jsx"] },
  module: {
    rules: [
      {
        test: /\.(css|scss)$/,
        use: [
          { loader: "style-loader", options: { singleton: true } },
          { loader: "css-loader", options: { modules: true, importLoaders: 2 } },
        ]
      },
      { test: /\.svg$/, loader: "svg-inline-loader" },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: "babel-loader",
        query: {
          presets: ["es2015", "stage-0"]
        }
      }
    ]
  }
};
