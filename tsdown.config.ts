import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/server.ts"],
  format: "esm",
  platform: "node",
  target: "node22",
  clean: true,
  dts: false,
  sourcemap: true,
  noExternal: [/.*/],
  alias: {
    "~": "./src",
    "~/": "./src/",
  },
});
