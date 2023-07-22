import type { ModuleContext } from "~/types/context";

export type PluginFunction = (ctx: ModuleContext, ...args: any[]) => any;

class Plugin {
  private _plugins: PluginFunction[];
  constructor() {
    this._plugins = [];
  }

  register(plugin: PluginFunction) {
    this._plugins.push(plugin);
  }

  getPlugins() {
    return this._plugins.concat();
  }

  runAsyncWaterfall(ctx: ModuleContext, ...args: any[]) {
    let current = Promise.resolve();
    return Promise.all(
      this._plugins.map((plugin) => {
        current = current.then(() => plugin(ctx, ...args));
        return current;
      }),
    );
  }
}

export const hook = new Plugin();
