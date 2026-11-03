// 设置页入口：只负责挂载，不写业务逻辑。
//
// 构建时这个文件会变成 ui/assets/settings.js；历史手写实现已删除，
// 现在只有 ui-src/src。
import { createApp } from "vue";
import SettingsApp from "../SettingsApp.vue";

createApp(SettingsApp).mount("#settings-app");
