// 服务端检查项的措辞与摘要。纯函数，不碰 DOM，dev/smoke.mjs 直接 import。
//
// 五个检查项（agfs / vectordb / api_key_manager / embedding / ollama）平时对用户
// 没用，只在排查「连上了但召回是空的」时才有价值。所以面板里只留一行摘要，
// 点开才看明细。摘要怎么造词这件事必须能测，就抽到这里。
//
// 档位复用 assets/check-tone.js 的 statusTone：绿 = 全好，灰 = 只是没配/不支持，
// 红 = 有认不出来的状态（含 error）。

import { TONE_BAD, TONE_MUTED, TONE_OK, statusTone } from "./check-tone.js";

// 状态词：ok 之外都念给用户听，别把服务端的蛇形枚举直接甩到脸上。
const STATUS_WORDS = {
  ok: "就绪",
  not_configured: "未配置",
  not_supported: "不支持",
  disabled: "已禁用",
};

const UNKNOWN_TEXT = "服务端检查项未知";

export function checkStatusLabel(status) {
  const value = String(status ?? "").trim();
  return STATUS_WORDS[value] || "异常";
}

/**
 * 一行摘要 + 明细所需的元信息。
 *
 *   summarizeChecks(五项全 ok).text        → 「服务端就绪 5/5」
 *   summarizeChecks(ollama not_configured) → 「服务端 4/5 就绪 · ollama 未配置」
 *   summarizeChecks(ollama error)          → 「服务端 4/5 就绪 · ollama 异常」
 *
 * 只数顶层项：agfs 的 details 是子项，进 title，不算进分母。
 * open 表示「默认展开」：只有红项（statusTone === bad）才自动摊开。
 */
export function summarizeChecks(checks) {
  const list = (Array.isArray(checks) ? checks : []).filter(
    (check) => check && typeof check === "object",
  );
  const total = list.length;
  let ok = 0;
  const problems = [];

  for (const check of list) {
    const status = String(check.status ?? "").trim();
    const name = String(check.name ?? "").trim() || "未命名";
    if (statusTone(status) === TONE_OK) {
      ok += 1;
      continue;
    }
    problems.push({ name, status, label: checkStatusLabel(status) });
  }

  if (!total) {
    return { total: 0, ok: 0, problems, tone: TONE_MUTED, open: false, text: UNKNOWN_TEXT };
  }

  const head = ok === total ? `服务端就绪 ${total}/${total}` : `服务端 ${ok}/${total} 就绪`;
  const bad = problems.some((problem) => statusTone(problem.status) === TONE_BAD);
  const text = problems.length
    ? `${head} · ${problems.map((problem) => `${problem.name} ${problem.label}`).join("、")}`
    : head;

  return {
    total,
    ok,
    problems,
    tone: problems.length ? (bad ? TONE_BAD : TONE_MUTED) : TONE_OK,
    open: bad,
    text,
  };
}
