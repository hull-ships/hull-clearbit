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
