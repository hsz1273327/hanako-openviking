// 边栏会话卡入口：只负责挂载，不写业务逻辑。
//
// 构建时变成 ui/assets/card-vue.js。手写的 ui/assets/card.js 还在，但
// ui/card.html 已经不再引用它（留作回退，下一轮清理）。
import { createApp } from "vue";
import CardApp from "../CardApp.vue";

createApp(CardApp).mount("#card-app");
