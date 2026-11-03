// 边栏会话卡入口：只负责挂载，不写业务逻辑。
//
// 构建时变成 ui/assets/card.js。历史手写实现已删除，现在只有 ui-src/src。
import { createApp } from "vue";
import CardApp from "../CardApp.vue";

createApp(CardApp).mount("#card-app");
