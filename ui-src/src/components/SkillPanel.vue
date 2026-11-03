<script setup>
// 共享技能页：卡片本体仍是 SkillRoute.vue（上一轮迁的），这里只负责保留
// 手写时期的挂载点外壳 —— panel.css 里 `#panel-skill > #skill-route-app`
// 那条「不为了填满视野而拉伸」的规则就挂在这个 id 上。
import SkillRoute from "./SkillRoute.vue";
</script>

<template>
  <div id="skill-route-app">
    <SkillRoute />
  </div>
</template>
