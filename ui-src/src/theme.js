// naive-ui 的亮色主题覆盖：面板（App.vue）与设置页（SettingsApp.vue）共用这一份。
//
// 宿主页面是亮色（米白底），所以这里刻意**不**引 darkTheme，也**不**覆盖任何
// 文字颜色：标签、输入值、按钮文案、caret 之外的一切文字都交给 naive-ui
// 亮色默认值（深色字）。
//
// 上一版把 Form.labelTextColor / Input.textColor / Button.textColor 写成
// rgba(236, 236, 236, …)，浅色字打在浅色底上：值其实一直在 DOM 里，
// 只是看不见（输入框看着是空的、按钮看着没字）。颜色覆盖只做两件事：
//
//   1. 品牌色，取自手写样式：
//        --accent  #6f8f68 / hover #7ea176 / pressed #5f7d59   ui/assets/panel.css .switch
//        --ok      #5d7d56                                     ui/assets/panel.css .pill.ok
//        --bad     #b8564d                                     ui/assets/panel.css .pill.down
//   2. 中性底色：输入框/按钮用 rgba(128,128,128,…)，亮底暗底都成立。
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
    borderRadius: "9px",
  },
  // 开关交给 naive-ui 亮色默认：关 = 深灰半透轨道 + 带阴影的白钮，
  // 开 = primaryColor 轨道。之前那版把钮写成 #f6f6f6 又不带阴影，
  // 亮底上就是一个看不见的白点，所以这里不再覆盖 Switch。
  Input: {
    color: "rgba(128, 128, 128, 0.06)",
    colorFocus: "rgba(111, 143, 104, 0.08)",
    colorDisabled: "rgba(128, 128, 128, 0.04)",
    // 品牌绿是光标，不是文字色：值本身仍是 naive-ui 默认的深色字。
    caretColor: "#6f8f68",
    placeholderColor: "rgba(128, 128, 128, 0.55)",
    placeholderColorDisabled: "rgba(128, 128, 128, 0.4)",
    border: "1px solid rgba(128, 128, 128, 0.34)",
    borderHover: "1px solid rgba(111, 143, 104, 0.5)",
    borderFocus: "1px solid rgba(111, 143, 104, 0.75)",
    boxShadowFocus: "0 0 0 2px rgba(111, 143, 104, 0.16)",
    borderRadius: "9px",
  },
  Button: {
    borderRadiusMedium: "9px",
    color: "rgba(128, 128, 128, 0.07)",
    colorHover: "rgba(128, 128, 128, 0.15)",
    colorPressed: "rgba(128, 128, 128, 0.15)",
    colorFocus: "rgba(128, 128, 128, 0.15)",
    border: "1px solid rgba(128, 128, 128, 0.3)",
    borderHover: "1px solid rgba(128, 128, 128, 0.3)",
    borderPressed: "1px solid rgba(128, 128, 128, 0.3)",
    borderFocus: "1px solid rgba(111, 143, 104, 0.75)",
  },
  Alert: {
    borderRadius: "9px",
    borderError: "1px solid rgba(184, 86, 77, 0.4)",
    colorError: "rgba(184, 86, 77, 0.12)",
    iconColorError: "#b8564d",
    contentTextColorError: "#b8564d",
    borderSuccess: "1px solid rgba(111, 143, 104, 0.4)",
    colorSuccess: "rgba(111, 143, 104, 0.12)",
    iconColorSuccess: "#5d7d56",
    contentTextColorSuccess: "#5d7d56",
  },
};
