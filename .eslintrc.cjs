module.exports = {
  ...require("@innei/eslint-config-ts"),
  rules: {
    ...require("@innei/eslint-config-ts").rules,
    "import/no-default-export": "off",
  },
};
