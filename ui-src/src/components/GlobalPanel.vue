<script setup>
// 全局配置页：总闸 → 中枢 / 身份 → 前置。
//
// 顺序是有理由的（别随手调）：先定「开不开」，再说「接到哪儿、我是谁」，
// 最后是辅助设施（探针 / 打分服务）。
// 本页只有前置卡可以让步：它吃满剩余高度，说明行贴到卡底（见 panel.css 的
// #panel-global > .prelude 那组规则）。尾部那块已经是独立的第四页。
import MasterCard from "./MasterCard.vue";
import HubIdentity from "./HubIdentity.vue";
import PreludeCard from "./PreludeCard.vue";
</script>

<template>
  <MasterCard />
  <HubIdentity />
  <PreludeCard />
</template>
