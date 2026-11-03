<script setup>
// 根组件：只负责主题（naive-ui 亮色默认 + 品牌色覆盖）。
// 宿主是亮色页面，所以不传 theme（传 darkTheme 会让浅色字打在浅色底上）。
// 主题配置在 ./theme.js，设置页（SettingsApp.vue）用的也是同一份；
// 其它页迁过来时在这里加一层切换，主题不用跟着动。
import { NConfigProvider } from "naive-ui";
import SkillRoute from "./components/SkillRoute.vue";
import { lightThemeOverrides } from "./theme.js";
</script>

<template>
  <!-- abstract：不额外包一层 div，挂载点里直接就是卡片本体，
       这样 .skill-route 的间距与置灰（.dim）都跟手写面板时期一致。 -->
  <NConfigProvider abstract :theme-overrides="lightThemeOverrides">
    <SkillRoute />
  </NConfigProvider>
</template>
