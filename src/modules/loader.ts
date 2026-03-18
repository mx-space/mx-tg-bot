import { createNamespaceLogger } from "~/lib/logger";
import { hook } from "~/lib/plugin";

import { register as bilibiliRegister } from "./bilibili";
import { register as githubRegister } from "./github";
import { register as mxSpaceRegister } from "./mx-space";
import { register as utilsRegister } from "./utils";

const logger = createNamespaceLogger("module-loader");

const modules = [
  { name: "bilibili", register: bilibiliRegister },
  { name: "github", register: githubRegister },
  { name: "mx-space", register: mxSpaceRegister },
  { name: "utils", register: utilsRegister },
];

export const registerModules = () => {
  for (const mod of modules) {
    logger.log(`register module: ${mod.name}`);
    hook.register(mod.register);
  }
};
