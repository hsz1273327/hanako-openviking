<script setup>
// 根组件：只负责主题（naive-ui 的深色 + 色板覆盖）。
// 主题配置在 ./theme.js，设置页（SettingsApp.vue）用的也是同一份；
// 其它页迁过来时在这里加一层切换，主题不用跟着动。
import { NConfigProvider, darkTheme } from "naive-ui";
import SkillRoute from "./components/SkillRoute.vue";
import { darkThemeOverrides } from "./theme.js";
</script>

<template>
  <!-- abstract：不额外包一层 div，挂载点里直接就是卡片本体，
       这样 .skill-route 的间距与置灰（.dim）都跟手写面板时期一致。 -->
  <NConfigProvider abstract :theme="darkTheme" :theme-overrides="darkThemeOverrides">
    <SkillRoute />
  </NConfigProvider>
</template>
