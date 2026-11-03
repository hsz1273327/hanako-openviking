<script setup>
// 全局配置页：总闸 → 中枢 / 身份 → 前置 → 日志。
//
// 顺序是有理由的（别随手调）：先定「开不开」，再说「接到哪儿、我是谁」，
// 然后是辅助设施（探针 / 打分服务），最后才是日志。
// 页面内只有日志卡可以让步（见 panel.css 的 #panel-global > .master 那组规则）。
import MasterCard from "./MasterCard.vue";
import HubIdentity from "./HubIdentity.vue";
import PreludeCard from "./PreludeCard.vue";
import LogsCard from "./LogsCard.vue";
</script>

<template>
  <MasterCard />
  <HubIdentity />
  <PreludeCard />
  <LogsCard />
</template>
