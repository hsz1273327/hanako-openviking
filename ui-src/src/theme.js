// naive-ui 的深色主题覆盖：面板（App.vue）与设置页（SettingsApp.vue）共用这一份。
//
// 颜色全部取自手写样式，不引用宿主主题变量（App 的 iframe 里没有 --text / --accent，
// 引用了整条声明会静默作废）：
//   --accent  #6f8f68 / hover #7ea176 / pressed #5f7d59   ui/assets/panel.css .switch
//   --ok      #5d7d56                                     ui/assets/panel.css .pill.ok
//   --bad     #b8564d                                     ui/assets/panel.css .pill.down
//   --text    中性深色主题自带；输入框/按钮用 rgba(128,128,128,…) 与 currentColor 那一套。
//
// 组件里不要再各写一份 themeOverrides：改这里，两页一起变。
export const darkThemeOverrides = {
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
  Switch: {
    railColor: "rgba(128, 128, 128, 0.16)",
    railColorActive: "#6f8f68",
    buttonColor: "#f6f6f6",
  },
  Form: {
    labelTextColor: "rgba(236, 236, 236, 0.62)",
  },
  Input: {
    color: "rgba(128, 128, 128, 0.06)",
    colorFocus: "rgba(128, 128, 128, 0.06)",
    colorDisabled: "rgba(128, 128, 128, 0.04)",
    textColor: "rgba(236, 236, 236, 0.92)",
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
    textColor: "rgba(236, 236, 236, 0.92)",
    textColorHover: "rgba(236, 236, 236, 1)",
    textColorPressed: "rgba(236, 236, 236, 1)",
    textColorFocus: "rgba(236, 236, 236, 1)",
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
