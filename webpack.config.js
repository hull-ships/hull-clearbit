const path = require("path");
const webpack = require("webpack");
let plugins = [];

if (process.env.NODE_ENV === "production") {
  plugins = [
    new webpack.optimize.UglifyJsPlugin({
      compressor: {
        warnings: false,
        screw_ie8: false
      }
    }),
    new webpack.DefinePlugin({
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV)
    })
  ];
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
  plugins,
  resolve: { extensions: ["", ".js"] },
  module: {
    loaders: [
      { test: /\.(css|scss)$/, loaders: ["style?singleton=true", "css?modules&importLoaders=1"] },
      { test: /\.svg$/, loader: "svg-inline" },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: "babel",
        query: {
          presets: ["es2015", "stage-0"]
        }
      }
    ]
  }
};
