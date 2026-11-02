// 面板 UI 的标准构建配置：.vue 单文件组件 → 入口产物。
//
// 现在有两个入口（panel / settings），刻意写成对象：将来边栏也迁过来，
// 加一页只是多一个键，不用回来改构建。
//
// 过渡期命名约定：构建产物一律带 -vue 后缀（panel-vue.js / settings-vue.js / card-vue.js），
// 手写脚本保留原名（panel.js / settings.js / card.js）。全部迁完之后再删手写脚本，
// 那时把 -vue 后缀去掉。
//
// 产物文件名不带 hash：HTML 是我们自己手写的，引用路径要稳定可读。
// 源码留在仓库给要改的人看；产物也提交进仓库，装了 App 的人不需要 node。
//
// 注意：outDir 里的 panel.css 是手写的（1068 行），不是构建产物。
// 所以 .vue 里不写 <style>，样式一律留在 ../ui/assets/panel.css 里，
// 避免构建把整份面板样式覆盖成只剩这一页的几条规则。

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: resolve(here, "../ui/assets"),
    // 这个目录里除了我们的产物，还有宿主随面板下发的 app-ui.css / app-ui.js /
    // sdk.js，以及手写的 panel.css / panel.js 等文件。构建只能覆盖同名产物，
    // 不能把整个目录清空，否则面板会直接坏掉。
    emptyOutDir: false,
    target: "es2020",
    rollupOptions: {
      // sdk.js 由宿主随面板下发，不能打进 bundle：升级宿主时这份文件会换，
      // 面板不应该为了跟它同步而重新构建。external 后产物里保留
      // import "./sdk.js"，而产物就落在 ui/assets/ 下，正好能解析到宿主的副本。
      external: ["./sdk.js"],
      // 保持 external 的写法原样输出。默认行为会把这个相对路径按源码目录
      // 重算成 ../sdk.js，产物放到 ui/assets/ 后就指错了；我们本来就想让它
      // 相对产物目录解析（ui/assets/sdk.js 由宿主下发），所以关掉重算。
      makeAbsoluteExternalsRelative: false,
      input: {
        // 每个键就是一个页面的入口，产物叫 <键>.js / <键>.css。
        // 键带 -vue 是为了不和手写脚本同名：panel.js / settings.js 仍是手写的，
        // 打开 assets 目录时不会先撞见打包代码。
        "panel-vue": resolve(here, "src/entries/panel.js"),
        "settings-vue": resolve(here, "src/entries/settings.js"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunk-[name].js",
        assetFileNames: "[name].[ext]",
        // 框架代码单独成块：入口文件里只剩这一页自己的代码，视图逻辑一眼能看完。
        manualChunks: { vue: ["vue"] },
      },
    },
  },
});
