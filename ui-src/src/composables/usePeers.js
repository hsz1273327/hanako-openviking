// peer 名单：GET /peers 读，POST /peers 写（整单替换排除名单）。
//
// 行文案、是否可点、本机 / 外部、绿框 / 灰框全部由 lib/panel-view.js 的
// peerMetaText / peerTitle / peerTappable / peerExcluded 决定，组件只排版。
// 点击的乐观更新与失败回滚在 store 里（togglePeer），组件不碰状态。

import { computed } from "vue";
import { useConfig } from "./useConfig.js";

export function usePeers() {
  const { state, store } = useConfig();

  return {
    peers: computed(() => state.peers),
    rows: computed(() => store.peerRows()),
    count: computed(() => store.peerCountText()),
    emptyText: computed(() => store.peerEmptyText()),
    hintVisible: computed(() => store.peerHintVisible()),
    pending: computed(() => state.peers.pending),
    toggle: (name) => store.togglePeer(name),
  };
}
