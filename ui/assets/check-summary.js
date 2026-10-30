// 服务端检查项的措辞。纯函数，不碰 DOM，dev/smoke.mjs 直接 import。
//
// 五个检查项（agfs / vectordb / api_key_manager / embedding / ollama）平时对用户
// 没用，只在排查「连上了但召回是空的」时才有价值。所以面板里只留一行摘要，
// 有问题时再把不对的那几项平铺出来——正常的项永远不出现，不重复「就绪」。
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
 * 一行摘要 + 明细所需的问题项。
 *
 *   summarizeChecks(五项全 ok)             → text「服务端就绪 5/5」, problems []
 *   summarizeChecks(ollama not_configured) → text「服务端 4/5 就绪」, problems [ollama 未配置]
 *   summarizeChecks(ollama error)          → text「服务端 4/5 就绪」, problems [ollama 异常]
 *
 * 摘要只说比例，不把项名塞进同一行：面板下面是逐项平铺的问题列表，
 * 再在行尾复述一遍名字就是同一件事说两遍。text 与 problems 必须同源，
 * 否则会出现「说 4/5 却列不出那一项」的错位。
 *
 * 只数顶层项：agfs 的 details 是子项，只进 title，不算进分母。
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
    return { total: 0, ok: 0, problems, tone: TONE_MUTED, text: UNKNOWN_TEXT };
  }

  const allOk = ok === total;
  const bad = problems.some((problem) => statusTone(problem.status) === TONE_BAD);

  return {
    total,
    ok,
    problems,
    tone: allOk ? TONE_OK : bad ? TONE_BAD : TONE_MUTED,
    text: allOk ? `服务端就绪 ${total}/${total}` : `服务端 ${ok}/${total} 就绪`,
  };
}
