// naive-ui 的亮色主题覆盖：面板（App.vue）与设置页（SettingsApp.vue）共用这一份。
//
// 宿主页面是亮色（米白底），所以这里刻意**不**引 darkTheme，也**不**覆盖任何
// 文字颜色：标签、输入值、按钮文案、caret 之外的一切文字都交给 naive-ui
// 亮色默认值（深色字）。
//
// 这一版只留品牌色 —— 三组颜色取自手写样式：
//   --accent  #6f8f68 / hover #7ea176 / pressed #5f7d59   ui/assets/panel.css .switch
//   --ok      #5d7d56                                     ui/assets/panel.css .pill.ok
//   --bad     #b8564d                                     ui/assets/panel.css .pill.down
//
// 组件级覆盖（Input / Button / Alert）和 common.borderRadius 全部删掉了：
// 那些「中性灰底 + 自绘边框 + 9px 圆角」的写法等于把 naive-ui 当画板重画一遍，
// 每次升级都要跟着调。现在输入框、按钮、卡片、圆角、阴影一律用 naive-ui 自己的
// 亮色默认值，只把品牌色钉住。
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
};
