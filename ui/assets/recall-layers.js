// 召回前两层（判断 / 查询）的界面状态：面板那排下拉用它。
//
// /recall-mode 是整单校验：同一次提交里只要有一个值不合法，一个键都不落库。
// 所以这里也只发一单，两个键一起带走，界面就不可能停在「一半生效」上。
// 提交失败必须把下拉退回上一次确认过的值，否则会显示成已经改了。

export const RECALL_GATES = Object.freeze(["off", "rules"]);
export const QUERY_MODES = Object.freeze(["last", "context"]);

// 服务端回的投影 -> 下拉值。宿主回半个形状时回退默认值，别让下拉变空。
// 判定口径与 src/ov/settings.js 的 normalizeRecallGate / normalizeQueryMode 一致。
export function paintLayers(out) {
  return {
    recallGate: RECALL_GATES.includes(out?.recallGate) ? out.recallGate : "off",
    queryMode: QUERY_MODES.includes(out?.queryMode) ? out.queryMode : "last",
  };
}

/**
 * 提交整单并收笔。
 *
 * send(body) 负责一次 POST，返回服务端投影；网络错自己抛，业务拒（ok:false）由这里判。
 * apply(layers) 把下拉刷成给定值——成功时是服务端回的投影，失败时是回滚值。
 * 返回值 { ok, layers }：layers 永远是界面此刻显示的值。
 */
export async function commitLayers({ before, next, send, apply, flash }) {
  const previous = paintLayers(before);
  try {
    const body = {
      recallGate: String(next?.recallGate ?? ""),
      queryMode: String(next?.queryMode ?? ""),
    };
    const out = await send(body);
    if (!out || out.ok === false) throw new Error(out?.error || "写入失败");
    const layers = paintLayers(out);
    apply(layers);
    flash("召回策略已生效", false);
    return { ok: true, layers };
  } catch (error) {
    // 回滚：宁可显示旧值，也不让界面谎报新值已生效。
    apply(previous);
    flash(String(error?.message || error), true);
    return { ok: false, layers: previous };
  }
}
