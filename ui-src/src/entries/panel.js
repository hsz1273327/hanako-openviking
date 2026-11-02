// 面板入口：只负责挂载，不写业务逻辑。
//
// 这是试点：本轮只有「共享技能」这一页换成 Vue + naive-ui。
// 另外两页仍然是手写的静态 DOM，由 ./panel.js 驱动（见 ui/panel.html 里的两个
// module script：先 panel.js 绑静态页，再 panel-vue.js 挂这一块）。
//
// 构建时这个文件会变成 ui/assets/panel-vue.js。将来整页迁过来，也只是把别的挂载点
// 加到这里，或新增一个同样只做挂载的入口文件。

import { createApp } from "vue";
import App from "../App.vue";

createApp(App).mount("#skill-route-app");
