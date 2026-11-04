<script setup>
// 记忆配置页：按会话说明 → 召回 → 重排 → 候选池 → 页面级提示位。
//
// 这一页没有按会话的开关：召回判断 / 查询 / 重排跟上面两个开关一样按整台机器算，
// 改了即时生效；按会话的那几项（召回范围等）在对话右侧的 OpenViking 卡片里。
//
// 拆卡是有意的：召回管「查不查、拿什么查」，重排管「查回来之后怎么排序」，
// 候选池管「谁能进来」——三件事三张卡。整单提交靠 lib/panel-store.js 的
// readLayers()（每个组件都只调 store 的 setForm / setPrompt，各卡各发各的那是错）。
//
// 高度：只有候选池卡吃满剩余（peer 名单在自己的 NScrollbar 里滚），
// 召回卡与重排卡按内容定高（见 panel.css 的 .peers-card 那组规则）。
import { NCard } from "naive-ui";
import { usePeers } from "../composables/usePeers.js";
import { useConfig } from "../composables/useConfig.js";
import RecallCard from "./RecallCard.vue";
import RerankCard from "./RerankCard.vue";
import PeerList from "./PeerList.vue";

const { state } = useConfig();
const { count: peerCountText } = usePeers();
</script>

<template>
  <p class="scoped-note">
    记忆召回、写回、只读、召回范围是<b>按会话</b>算的，在这段对话右侧的 OpenViking 卡片里改。
  </p>

  <RecallCard />
  <RerankCard />

  <!-- 候选池：谁能进召回范围。卡片吃满本页剩余高度，名单在卡内自己滚。 -->
  <NCard
    class="peers-card"
    size="small"
    title="候选池"
    :bordered="false"
    header-style="padding: 4px 16px"
    content-style="padding: 16px"
  >
    <template #header-extra>
      <span id="peerCount" class="peer-count">{{ peerCountText }}</span>
    </template>

    <PeerList />
  </NCard>

  <!-- 提示位在一页的底部：这一页上的写入（peer 排除 / 召回策略）如果只在
       全局页报错，用户在这一页根本看不见。文案与全局页同源（store.note）。 -->
  <p class="save-hint" :class="{ ok: !state.note.bad, bad: state.note.bad }">{{ state.note.text }}</p>
</template>
