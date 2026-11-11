// naive-ui 的亮色主题覆盖：面板（App.vue）与设置页（SettingsApp.vue）共用这一份。
//
// 宿主页面是亮色（米白底），所以这里刻意**不**引 darkTheme，也**不**覆盖任何
// 文字颜色：标签、输入值、按钮文案、caret 之外的一切文字都交给 naive-ui
// 亮色默认值（深色字）。
//
// 这一版只留品牌色 —— 三组颜色取自手写样式：
//   --accent  #6f8f68 / hover #7ea176 / pressed #5f7d59   ui/assets/panel.css .dot.ok
//   --ok      #5d7d56                                     ui/assets/panel.css .pill.ok
//   --bad     #b8564d                                     ui/assets/panel.css .pill.down
//
// 组件级覆盖只留三条：卡片圆角统一 6px；标签字号沿用原来的 12px（naive-ui
// small 档默认 14px，放大字号等于破版）；卡片标题字号从 naive 的 16px 降到 13px，
// 字重 600。
//
// 为什么卡片标题要降：面板的层级是 tab 12px（一级，既有约定，字号不放大）/
// 卡片标题（二级）/ 分组标题 12px（三级）/ 字段标签 11.5px / 提示字 10.5px。
// 卡片标题吃 naive 默认值时是 16px，比 tab 高出四个像素——一跳两档，看着像另一个控件。
// 降到 13px：只比 tab 高一级（字重 600 拉开分量），往下到分组标题 12px 再到 11.5 / 10.5
// 逐级递减，整条链每一档都差一点点，不再有断崖。
// 这一降是全局的：面板里所有卡片都是 size="small"，所以只改 titleFontSizeSmall，
// 不在 panel.css 里给某一张卡再钉一套（两套会互相盖，改一处漏一处）。
// 其余输入框、按钮、卡片、阴影一律用 naive-ui 自己的亮色默认值。
//
// 不引用宿主主题变量：App 的 iframe 里没有 --text / --accent 这类变量，
// 引用了整条声明会静默作废，且不报错。
//
// 组件里不要再各写一份 themeOverrides：改这里，两页一起变。

export const lightThemeOverrides = {
  common: {
    primaryColor: "#6f8f68",
    primaryColorHover: "#7ea176",
    primaryColorPressed: "#5f7d59",
    primaryColorSuppl: "#6f8f68",
    successColor: "#5d7d56",
    successColorHover: "#6f8f68",
    successColorPressed: "#4f6b49",
    successColorSuppl: "#5d7d56",
    errorColor: "#b8564d",
    errorColorHover: "#c2554b",
    errorColorPressed: "#a84a42",
    errorColorSuppl: "#b8564d",
  },
  // 卡片不再画 1px 边框，靠底色分层；圆角 3px 偏硬，统一到 6px。
  //
  // colorEmbedded 只服务「卡片嵌卡片」：打分服务每项是一张 embedded NCard，
  // 坐在前置卡的白底上。naive 亮色默认的 actionColor（2% 黑）在白底上几乎
  // 看不见，两张子卡看起来就是一片空白，所以这里给到 3.5%。
  // 外面那层卡片的 color 不动：页面里其它卡片仍然只靠「白底 vs 页底 2% 灰」分层。
  Card: {
    borderRadius: "6px",
    colorEmbedded: "rgba(0, 0, 0, 0.035)",
    // 卡片标题：层级倒挂的修正点，值写在一处（详见文件头的说明）。
    titleFontSizeSmall: "13px",
    titleFontWeight: "600",
  },
  // 标签栏是页头顶层导航，字号沿用原来手写版的 12px（small 档默认 14px）。
  Tabs: {
    tabFontSizeSmall: "12px",
  },
};
