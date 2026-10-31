// 模型目录路由：面板里「自选模型」的两个下拉用它填选项。
//
// 只读，且是 credential-free 的：ctx.models.list() 回的就是宿主对 App 公开的
// 那份投影，不含 apiKey / endpoint。这里原样透传 models 数组，不猜字段名。
//
// 失败与 /status、/peers 同一套约定：HTTP 200，成功失败都放在 body 里，
// 让面板能照常把其它区块画出来，只在模型下拉旁边说明原因。

export default function registerModelsRoutes(app, ctx) {
  app.get("/models", async (c) => {
    try {
      const out = await ctx.models.list();
      const models = Array.isArray(out?.models) ? out.models : [];
      return c.json({ ok: true, models }, 200);
    } catch (error) {
      return c.json({ ok: false, error: String(error?.message || error) }, 200);
    }
  });
}
