// 设置页入口：只负责挂载，不写业务逻辑。
//
// 构建时这个文件会变成 ui/assets/settings-vue.js；同名的手写脚本
// ui/assets/settings.js 还在，但 ui/settings.html 已经不再引用它（下一轮清理）。
import { createApp } from "vue";
import SettingsApp from "../SettingsApp.vue";

createApp(SettingsApp).mount("#settings-app");
