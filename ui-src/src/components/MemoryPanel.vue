<script setup>
// 记忆配置页：按会话说明 + 召回管理（下拉 / 展开区 / 通道 / peer 名单）。
//
// 这一页没有按会话的开关：召回判断 / 查询 / 重排跟上面两个开关一样按整台机器算，
// 改了即时生效；按会话的那几项（召回范围等）在对话右侧的 OpenViking 卡片里。
import RecallCard from "./RecallCard.vue";
</script>

<template>
  <p class="scoped-note">
    记忆召回、写回、只读、召回范围是<b>按会话</b>算的，在这段对话右侧的 OpenViking 卡片里改。
  </p>

  <!-- 召回的前两层（判断 / 查询）与「谁能进候选池」合成一栏：
       上面三个下拉并排，下面 peer 名单占满整行、吃满剩余高度。 -->
  <RecallCard />
</template>
