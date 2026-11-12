import{A as ze,a3 as pe,E as I,Y as g,F as i,G as _,X as ee,I as re,af as we,a1 as ye,O as Re,N as Me,a2 as W,H as X,D as Ue,a as R,n as x,r as L,$ as $e,J as Ce,K as T,ad as ke,a0 as be,W as he,V,a7 as He,ae as Ne}from"./chunk-theme.js";import{e as Le,F as Oe,C as We,z as Ge,l as j,E as te,d as Se,o as k,c as A,a as D,q as oe,f as O,i as ge,A as Ke,H as Ye}from"./chunk-vue.js";import{hana as G}from"./sdk.js";function me(e,t=!0,o=[]){return e.forEach(r=>{if(r!==null){if(typeof r!="object"){(typeof r=="string"||typeof r=="number")&&o.push(Le(String(r)));return}if(Array.isArray(r)){me(r,t,o);return}if(r.type===Oe){if(r.children===null)return;Array.isArray(r.children)&&me(r.children,t,o)}else{if(r.type===We&&t)return;o.push(r)}}}),o}var Xe={radioSizeSmall:"14px",radioSizeMedium:"16px",radioSizeLarge:"18px",labelPadding:"0 8px",labelFontWeight:"400"};function Je(e){const{borderColor:t,primaryColor:o,baseColor:r,textColorDisabled:n,inputColorDisabled:a,textColor2:l,opacityDisabled:c,borderRadius:b,fontSizeSmall:h,fontSizeMedium:u,fontSizeLarge:y,heightSmall:s,heightMedium:p,heightLarge:w,lineHeight:C}=e;return{...Xe,labelLineHeight:C,buttonHeightSmall:s,buttonHeightMedium:p,buttonHeightLarge:w,fontSizeSmall:h,fontSizeMedium:u,fontSizeLarge:y,boxShadow:`inset 0 0 0 1px ${t}`,boxShadowActive:`inset 0 0 0 1px ${o}`,boxShadowFocus:`inset 0 0 0 1px ${o}, 0 0 0 2px ${pe(o,{alpha:.2})}`,boxShadowHover:`inset 0 0 0 1px ${o}`,boxShadowDisabled:`inset 0 0 0 1px ${t}`,color:r,colorDisabled:a,colorActive:"#0000",textColor:l,textColorDisabled:n,dotColorActive:o,dotColorDisabled:t,buttonBorderColor:t,buttonBorderColorActive:o,buttonBorderColorHover:t,buttonColor:r,buttonColorActive:r,buttonTextColor:l,buttonTextColorActive:o,buttonTextColorHover:o,opacityDisabled:c,buttonBoxShadowFocus:`inset 0 0 0 1px ${o}, 0 0 0 2px ${pe(o,{alpha:.3})}`,buttonBoxShadowHover:"inset 0 0 0 1px #0000",buttonBoxShadow:"inset 0 0 0 1px #0000",buttonBorderRadius:b}}const Te={name:"Radio",common:ze,self:Je};var qe=I("radio",`
 line-height: var(--n-label-line-height);
 outline: none;
 position: relative;
 user-select: none;
 -webkit-user-select: none;
 display: inline-flex;
 align-items: flex-start;
 flex-wrap: nowrap;
 font-size: var(--n-font-size);
 word-break: break-word;
`,[g("checked",[i("dot",`
 background-color: var(--n-color-active);
 `)]),i("dot-wrapper",`
 position: relative;
 flex-shrink: 0;
 flex-grow: 0;
 width: var(--n-radio-size);
 `),I("radio-input",`
 position: absolute;
 border: 0;
 width: 0;
 height: 0;
 opacity: 0;
 margin: 0;
 `),i("dot",`
 position: absolute;
 top: 50%;
 left: 0;
 transform: translateY(-50%);
 height: var(--n-radio-size);
 width: var(--n-radio-size);
 background: var(--n-color);
 box-shadow: var(--n-box-shadow);
 border-radius: 50%;
 transition:
 background-color .3s var(--n-bezier),
 box-shadow .3s var(--n-bezier);
 `,[_("&::before",`
 content: "";
 opacity: 0;
 position: absolute;
 left: 4px;
 top: 4px;
 height: calc(100% - 8px);
 width: calc(100% - 8px);
 border-radius: 50%;
 transform: scale(.8);
 background: var(--n-dot-color-active);
 transition: 
 opacity .3s var(--n-bezier),
 background-color .3s var(--n-bezier),
 transform .3s var(--n-bezier);
 `),g("checked",{boxShadow:"var(--n-box-shadow-active)"},[_("&::before",`
 opacity: 1;
 transform: scale(1);
 `)])]),i("label",`
 color: var(--n-text-color);
 padding: var(--n-label-padding);
 font-weight: var(--n-label-font-weight);
 display: inline-block;
 transition: color .3s var(--n-bezier);
 `),ee("disabled",`
 cursor: pointer;
 `,[_("&:hover",[i("dot",{boxShadow:"var(--n-box-shadow-hover)"})]),g("focus",[_("&:not(:active)",[i("dot",{boxShadow:"var(--n-box-shadow-focus)"})])])]),g("disabled",`
 cursor: not-allowed;
 `,[i("dot",{boxShadow:"var(--n-box-shadow-disabled)",backgroundColor:"var(--n-color-disabled)"},[_("&::before",{backgroundColor:"var(--n-dot-color-disabled)"}),g("checked",`
 opacity: 1;
 `)]),i("label",{color:"var(--n-text-color-disabled)"}),I("radio-input",`
 cursor: not-allowed;
 `)])]);const Qe={name:String,value:{type:[String,Number,Boolean],default:"on"},checked:{type:Boolean,default:void 0},defaultChecked:Boolean,disabled:{type:Boolean,default:void 0},label:String,size:String,onUpdateChecked:[Function,Array],"onUpdate:checked":[Function,Array],checkedValue:{type:Boolean,default:void 0}},Be=Me("n-radio-group");function Ze(e){const t=Ge(Be,null),{mergedClsPrefixRef:o,mergedComponentPropsRef:r}=re(e),n=we(e,{mergedSize(m){const{size:f}=e;if(f!==void 0)return f;if(t){const{mergedSizeRef:{value:S}}=t;if(S!==void 0)return S}if(m)return m.mergedSize.value;const v=r?.value?.Radio?.size;return v||"medium"},mergedDisabled(m){return!!(e.disabled||t?.disabledRef.value||m?.disabled.value)}}),{mergedSizeRef:a,mergedDisabledRef:l}=n,c=j(null),b=j(null),h=j(e.defaultChecked),u=te(e,"checked"),y=ye(u,h),s=Re(()=>t?t.valueRef.value===e.value:y.value),p=Re(()=>{const{name:m}=e;if(m!==void 0)return m;if(t)return t.nameRef.value}),w=j(!1);function C(){if(t){const{doUpdateValue:m}=t,{value:f}=e;W(m,f)}else{const{onUpdateChecked:m,"onUpdate:checked":f}=e,{nTriggerFormInput:v,nTriggerFormChange:S}=n;m&&W(m,!0),f&&W(f,!0),v(),S(),h.value=!0}}function F(){l.value||s.value||C()}function E(){F(),c.value&&(c.value.checked=s.value)}function P(){w.value=!1}function M(){w.value=!0}return{mergedClsPrefix:t?t.mergedClsPrefixRef:o,inputRef:c,labelRef:b,mergedName:p,mergedDisabled:l,renderSafeChecked:s,focus:w,mergedSize:a,handleRadioInputChange:E,handleRadioInputBlur:P,handleRadioInputFocus:M}}const et=["value","name","checked","disabled","onChange","onFocus","onBlur"],tt={...X.props,...Qe};var ot=Se({name:"Radio",props:tt,setup(e){const t=Ze(e),o=X("Radio","-radio",qe,Te,e,t.mergedClsPrefix),r=O(()=>{const{mergedSize:{value:h}}=t,{common:{cubicBezierEaseInOut:u},self:{boxShadow:y,boxShadowActive:s,boxShadowDisabled:p,boxShadowFocus:w,boxShadowHover:C,color:F,colorDisabled:E,colorActive:P,textColor:M,textColorDisabled:m,dotColorActive:f,dotColorDisabled:v,labelPadding:S,labelLineHeight:K,labelFontWeight:d,[T("fontSize",h)]:$,[T("radioSize",h)]:U}}=o.value;return{"--n-bezier":u,"--n-label-line-height":K,"--n-label-font-weight":d,"--n-box-shadow":y,"--n-box-shadow-active":s,"--n-box-shadow-disabled":p,"--n-box-shadow-focus":w,"--n-box-shadow-hover":C,"--n-color":F,"--n-color-active":P,"--n-color-disabled":E,"--n-dot-color-active":f,"--n-dot-color-disabled":v,"--n-font-size":$,"--n-radio-size":U,"--n-text-color":M,"--n-text-color-disabled":m,"--n-label-padding":S}}),{inlineThemeDisabled:n,mergedClsPrefixRef:a,mergedRtlRef:l}=re(e),c=$e("Radio",l,a),b=n?Ce("radio",O(()=>t.mergedSize.value[0]),r,e):void 0;return Object.assign(t,{rtlEnabled:c,cssVars:n?void 0:r,themeClass:b?.themeClass,onRender:b?.onRender})},render(){const{$slots:e,mergedClsPrefix:t,onRender:o,label:r}=this;return o?.(),(()=>{const n=Ue("f8c6901d8cd45c02");return k(),A("label",{class:x([`${t}-radio`,this.themeClass,this.rtlEnabled&&`${t}-radio--rtl`,this.mergedDisabled&&`${t}-radio--disabled`,this.renderSafeChecked&&`${t}-radio--checked`,this.focus&&`${t}-radio--focus`]),style:oe(this.cssVars)},[D("div",{class:x(`${t}-radio__dot-wrapper`)},[n[0]||(n[0]=R(" ",-1)),D("div",{class:x([`${t}-radio__dot`,this.renderSafeChecked&&`${t}-radio__dot--checked`])},null,2),D("input",{ref:"inputRef",type:"radio",class:x(`${t}-radio-input`),value:this.value,name:this.mergedName,checked:this.renderSafeChecked,disabled:this.mergedDisabled,onChange:this.handleRadioInputChange,onFocus:this.handleRadioInputFocus,onBlur:this.handleRadioInputBlur},null,42,et)],2),R(()=>L(e.default,a=>!a&&!r?null:(k(),A("div",{ref:"labelRef",class:x(`${t}-radio__label`)},[R(()=>a||r)],2))))],6)})()}});function rt(e,t="default",o=[]){const r=e.$slots[t];return r===void 0?o:r()}var nt=I("radio-group",`
 display: inline-block;
 font-size: var(--n-font-size);
`,[i("splitor",`
 display: inline-block;
 vertical-align: bottom;
 width: 1px;
 transition:
 background-color .3s var(--n-bezier),
 opacity .3s var(--n-bezier);
 background: var(--n-button-border-color);
 `,[g("checked",{backgroundColor:"var(--n-button-border-color-active)"}),g("disabled",{opacity:"var(--n-opacity-disabled)"})]),g("button-group",`
 white-space: nowrap;
 height: var(--n-height);
 line-height: var(--n-height);
 `,[I("radio-button",{height:"var(--n-height)",lineHeight:"var(--n-height)"}),i("splitor",{height:"var(--n-height)"})]),I("radio-button",`
 vertical-align: bottom;
 outline: none;
 position: relative;
 user-select: none;
 -webkit-user-select: none;
 display: inline-block;
 box-sizing: border-box;
 padding-left: 14px;
 padding-right: 14px;
 white-space: nowrap;
 transition:
 background-color .3s var(--n-bezier),
 opacity .3s var(--n-bezier),
 border-color .3s var(--n-bezier),
 color .3s var(--n-bezier);
 background: var(--n-button-color);
 color: var(--n-button-text-color);
 border-top: 1px solid var(--n-button-border-color);
 border-bottom: 1px solid var(--n-button-border-color);
 `,[I("radio-input",`
 pointer-events: none;
 position: absolute;
 border: 0;
 border-radius: inherit;
 left: 0;
 right: 0;
 top: 0;
 bottom: 0;
 opacity: 0;
 z-index: 1;
 `),i("state-border",`
 z-index: 1;
 pointer-events: none;
 position: absolute;
 box-shadow: var(--n-button-box-shadow);
 transition: box-shadow .3s var(--n-bezier);
 left: -1px;
 bottom: -1px;
 right: -1px;
 top: -1px;
 `),_("&:first-child",`
 border-top-left-radius: var(--n-button-border-radius);
 border-bottom-left-radius: var(--n-button-border-radius);
 border-left: 1px solid var(--n-button-border-color);
 `,[i("state-border",`
 border-top-left-radius: var(--n-button-border-radius);
 border-bottom-left-radius: var(--n-button-border-radius);
 `)]),_("&:last-child",`
 border-top-right-radius: var(--n-button-border-radius);
 border-bottom-right-radius: var(--n-button-border-radius);
 border-right: 1px solid var(--n-button-border-color);
 `,[i("state-border",`
 border-top-right-radius: var(--n-button-border-radius);
 border-bottom-right-radius: var(--n-button-border-radius);
 `)]),ee("disabled",`
 cursor: pointer;
 `,[_("&:hover",[i("state-border",`
 transition: box-shadow .3s var(--n-bezier);
 box-shadow: var(--n-button-box-shadow-hover);
 `),ee("checked",{color:"var(--n-button-text-color-hover)"})]),g("focus",[_("&:not(:active)",[i("state-border",{boxShadow:"var(--n-button-box-shadow-focus)"})])])]),g("checked",`
 background: var(--n-button-color-active);
 color: var(--n-button-text-color-active);
 border-color: var(--n-button-border-color-active);
 `),g("disabled",`
 cursor: not-allowed;
 opacity: var(--n-opacity-disabled);
 `)])]);const it=["onFocusin","onFocusout"];function at(e,t,o){const r=[];let n=!1;for(let a=0;a<e.length;++a){const l=e[a],c=l.type?.name;c==="RadioButton"&&(n=!0);const b=l.props;if(c!=="RadioButton"){r.push(l);continue}if(a===0)r.push(l);else{const h=r[r.length-1].props,u=t===h.value,y=h.disabled,s=t===b.value,p=b.disabled,w=(u?2:0)+(y?0:1),C=(s?2:0)+(p?0:1),F={[`${o}-radio-group__splitor--disabled`]:y,[`${o}-radio-group__splitor--checked`]:u},E={[`${o}-radio-group__splitor--disabled`]:p,[`${o}-radio-group__splitor--checked`]:s},P=w<C?E:F;r.push((k(),A("div",{key:1,class:x([`${o}-radio-group__splitor`,P])},null,2)),l)}}return{children:r,isButtonGroup:n}}const st={...X.props,name:String,options:Array,labelField:{type:String,default:"label"},valueField:{type:String,default:"value"},value:[String,Number,Boolean],defaultValue:{type:[String,Number,Boolean],default:null},size:String,disabled:{type:Boolean,default:void 0},"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array]};var Pt=Se({name:"RadioGroup",props:st,setup(e){const t=j(null),{mergedSizeRef:o,mergedDisabledRef:r,nTriggerFormChange:n,nTriggerFormInput:a,nTriggerFormBlur:l,nTriggerFormFocus:c}=we(e),{mergedClsPrefixRef:b,inlineThemeDisabled:h,mergedRtlRef:u}=re(e),y=X("Radio","-radio-group",nt,Te,e,b),s=j(e.defaultValue),p=te(e,"value"),w=ye(p,s);function C(f){const{onUpdateValue:v,"onUpdate:value":S}=e;v&&W(v,f),S&&W(S,f),s.value=f,n(),a()}function F(f){const{value:v}=t;v&&(v.contains(f.relatedTarget)||c())}function E(f){const{value:v}=t;v&&(v.contains(f.relatedTarget)||l())}Ke(Be,{mergedClsPrefixRef:b,nameRef:te(e,"name"),valueRef:w,disabledRef:r,mergedSizeRef:o,doUpdateValue:C});const P=$e("Radio",u,b),M=O(()=>{const{value:f}=o,{common:{cubicBezierEaseInOut:v},self:{buttonBorderColor:S,buttonBorderColorActive:K,buttonBorderRadius:d,buttonBoxShadow:$,buttonBoxShadowFocus:U,buttonBoxShadowHover:Y,buttonColor:J,buttonColorActive:q,buttonTextColor:ne,buttonTextColorActive:ie,buttonTextColorHover:ae,opacityDisabled:se,[T("buttonHeight",f)]:B,[T("fontSize",f)]:le}}=y.value;return{"--n-font-size":le,"--n-bezier":v,"--n-button-border-color":S,"--n-button-border-color-active":K,"--n-button-border-radius":d,"--n-button-box-shadow":$,"--n-button-box-shadow-focus":U,"--n-button-box-shadow-hover":Y,"--n-button-color":J,"--n-button-color-active":q,"--n-button-text-color":ne,"--n-button-text-color-hover":ae,"--n-button-text-color-active":ie,"--n-height":B,"--n-opacity-disabled":se}}),m=h?Ce("radio-group",O(()=>o.value[0]),M,e):void 0;return{selfElRef:t,rtlEnabled:P,mergedClsPrefix:b,mergedValue:w,handleFocusout:E,handleFocusin:F,cssVars:h?void 0:M,themeClass:m?.themeClass,onRender:m?.onRender}},render(){const{mergedValue:e,mergedClsPrefix:t,handleFocusin:o,handleFocusout:r}=this,{options:n,labelField:a,valueField:l}=this.$props,{children:c,isButtonGroup:b}=at(n?n.map(h=>{const u=h[l];return k(),ge(ot,{key:typeof u=="boolean"?`__n_${u}`:u,value:u,disabled:h.disabled,label:h[a]},null,8,["value","disabled","label"])}):me(rt(this)),e,t);return this.onRender?.(),k(),A("div",{onFocusin:o,onFocusout:r,ref:"selfElRef",class:x([`${t}-radio-group`,this.rtlEnabled&&`${t}-radio-group--rtl`,this.themeClass,b&&`${t}-radio-group--button-group`]),style:oe(this.cssVars)},[R(()=>c)],46,it)}}),lt={buttonHeightSmall:"14px",buttonHeightMedium:"18px",buttonHeightLarge:"22px",buttonWidthSmall:"14px",buttonWidthMedium:"18px",buttonWidthLarge:"22px",buttonWidthPressedSmall:"20px",buttonWidthPressedMedium:"24px",buttonWidthPressedLarge:"28px",railHeightSmall:"18px",railHeightMedium:"22px",railHeightLarge:"26px",railWidthSmall:"32px",railWidthMedium:"40px",railWidthLarge:"48px"};function dt(e){const{primaryColor:t,opacityDisabled:o,borderRadius:r,textColor3:n}=e;return{...lt,iconColor:n,textColor:"white",loadingColor:t,opacityDisabled:o,railColor:"rgba(0, 0, 0, .14)",railColorActive:t,buttonBoxShadow:"0 1px 4px 0 rgba(0, 0, 0, 0.3), inset 0 0 1px 0 rgba(0, 0, 0, 0.05)",buttonColor:"#FFF",railBorderRadiusSmall:r,railBorderRadiusMedium:r,railBorderRadiusLarge:r,buttonBorderRadiusSmall:r,buttonBorderRadiusMedium:r,buttonBorderRadiusLarge:r,boxShadowFocus:`0 0 0 2px ${pe(t,{alpha:.2})}`}}const ct={common:ze,self:dt};var ut=I("switch",`
 height: var(--n-height);
 min-width: var(--n-width);
 vertical-align: middle;
 user-select: none;
 -webkit-user-select: none;
 display: inline-flex;
 outline: none;
 justify-content: center;
 align-items: center;
`,[i("children-placeholder",`
 height: var(--n-rail-height);
 display: flex;
 flex-direction: column;
 overflow: hidden;
 pointer-events: none;
 visibility: hidden;
 `),i("rail-placeholder",`
 display: flex;
 flex-wrap: none;
 `),i("button-placeholder",`
 width: calc(1.75 * var(--n-rail-height));
 height: var(--n-rail-height);
 `),I("base-loading",`
 position: absolute;
 top: 50%;
 left: 50%;
 transform: translateX(-50%) translateY(-50%);
 font-size: calc(var(--n-button-width) - 4px);
 color: var(--n-loading-color);
 transition: color .3s var(--n-bezier);
 `,[ke({left:"50%",top:"50%",originalTransform:"translateX(-50%) translateY(-50%)"})]),i("checked, unchecked",`
 transition: color .3s var(--n-bezier);
 color: var(--n-text-color);
 box-sizing: border-box;
 position: absolute;
 white-space: nowrap;
 top: 0;
 bottom: 0;
 display: flex;
 align-items: center;
 line-height: 1;
 `),i("checked",`
 right: 0;
 padding-right: calc(1.25 * var(--n-rail-height) - var(--n-offset));
 `),i("unchecked",`
 left: 0;
 justify-content: flex-end;
 padding-left: calc(1.25 * var(--n-rail-height) - var(--n-offset));
 `),_("&:focus",[i("rail",`
 box-shadow: var(--n-box-shadow-focus);
 `)]),g("round",[i("rail","border-radius: calc(var(--n-rail-height) / 2);",[i("button","border-radius: calc(var(--n-button-height) / 2);")])]),ee("disabled",[ee("icon",[g("rubber-band",[g("pressed",[i("rail",[i("button","max-width: var(--n-button-width-pressed);")])]),i("rail",[_("&:active",[i("button","max-width: var(--n-button-width-pressed);")])]),g("active",[g("pressed",[i("rail",[i("button","left: calc(100% - var(--n-offset) - var(--n-button-width-pressed));")])]),i("rail",[_("&:active",[i("button","left: calc(100% - var(--n-offset) - var(--n-button-width-pressed));")])])])])])]),g("active",[i("rail",[i("button","left: calc(100% - var(--n-button-width) - var(--n-offset))")])]),i("rail",`
 overflow: hidden;
 height: var(--n-rail-height);
 min-width: var(--n-rail-width);
 border-radius: var(--n-rail-border-radius);
 cursor: pointer;
 position: relative;
 transition:
 opacity .3s var(--n-bezier),
 background .3s var(--n-bezier),
 box-shadow .3s var(--n-bezier);
 background-color: var(--n-rail-color);
 `,[i("button-icon",`
 color: var(--n-icon-color);
 transition: color .3s var(--n-bezier);
 font-size: calc(var(--n-button-height) - 4px);
 position: absolute;
 left: 0;
 right: 0;
 top: 0;
 bottom: 0;
 display: flex;
 justify-content: center;
 align-items: center;
 line-height: 1;
 `,[ke()]),i("button",`
 align-items: center; 
 top: var(--n-offset);
 left: var(--n-offset);
 height: var(--n-button-height);
 width: var(--n-button-width-pressed);
 max-width: var(--n-button-width);
 border-radius: var(--n-button-border-radius);
 background-color: var(--n-button-color);
 box-shadow: var(--n-button-box-shadow);
 box-sizing: border-box;
 cursor: inherit;
 content: "";
 position: absolute;
 transition:
 background-color .3s var(--n-bezier),
 left .3s var(--n-bezier),
 opacity .3s var(--n-bezier),
 max-width .3s var(--n-bezier),
 box-shadow .3s var(--n-bezier);
 `)]),g("active",[i("rail","background-color: var(--n-rail-color-active);")]),g("loading",[i("rail",`
 cursor: wait;
 `)]),g("disabled",[i("rail",`
 cursor: not-allowed;
 opacity: .5;
 `)])]);const bt=["aria-checked","tabindex","onClick","onFocus","onBlur","onKeyup","onKeydown"],ht={...X.props,size:String,value:{type:[String,Number,Boolean],default:void 0},loading:Boolean,defaultValue:{type:[String,Number,Boolean],default:!1},disabled:{type:Boolean,default:void 0},round:{type:Boolean,default:!0},"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array],checkedValue:{type:[String,Number,Boolean],default:!0},uncheckedValue:{type:[String,Number,Boolean],default:!1},railStyle:Function,rubberBand:{type:Boolean,default:!0},spinProps:Object,onChange:[Function,Array]};let Z;var Vt=Se({name:"Switch",props:ht,slots:Object,setup(e){Z===void 0&&(typeof CSS<"u"?typeof CSS.supports<"u"?Z=CSS.supports("width","max(1px)"):Z=!1:Z=!0);const{mergedClsPrefixRef:t,inlineThemeDisabled:o,mergedComponentPropsRef:r}=re(e),n=X("Switch","-switch",ut,ct,e,t),a=we(e,{mergedSize(d){if(e.size!==void 0)return e.size;if(d)return d.mergedSize.value;const $=r?.value?.Switch?.size;return $||"medium"}}),{mergedSizeRef:l,mergedDisabledRef:c}=a,b=j(e.defaultValue),h=te(e,"value"),u=ye(h,b),y=O(()=>u.value===e.checkedValue),s=j(!1),p=j(!1),w=O(()=>{const{railStyle:d}=e;if(d)return d({focused:p.value,checked:y.value})});function C(d){const{"onUpdate:value":$,onChange:U,onUpdateValue:Y}=e,{nTriggerFormInput:J,nTriggerFormChange:q}=a;$&&W($,d),Y&&W(Y,d),U&&W(U,d),b.value=d,J(),q()}function F(){const{nTriggerFormFocus:d}=a;d()}function E(){const{nTriggerFormBlur:d}=a;d()}function P(){e.loading||c.value||(u.value!==e.checkedValue?C(e.checkedValue):C(e.uncheckedValue))}function M(){p.value=!0,F()}function m(){p.value=!1,E(),s.value=!1}function f(d){e.loading||c.value||d.key===" "&&(u.value!==e.checkedValue?C(e.checkedValue):C(e.uncheckedValue),s.value=!1)}function v(d){e.loading||c.value||d.key===" "&&(d.preventDefault(),s.value=!0)}const S=O(()=>{const{value:d}=l,{self:{opacityDisabled:$,railColor:U,railColorActive:Y,buttonBoxShadow:J,buttonColor:q,boxShadowFocus:ne,loadingColor:ie,textColor:ae,iconColor:se,[T("buttonHeight",d)]:B,[T("buttonWidth",d)]:le,[T("buttonWidthPressed",d)]:Ve,[T("railHeight",d)]:H,[T("railWidth",d)]:Q,[T("railBorderRadius",d)]:De,[T("buttonBorderRadius",d)]:Ie},common:{cubicBezierEaseInOut:je}}=n.value;let de,ce,ue;return Z?(de=`calc((${H} - ${B}) / 2)`,ce=`max(${H}, ${B})`,ue=`max(${Q}, calc(${Q} + ${B} - ${H}))`):(de=he((V(H)-V(B))/2),ce=he(Math.max(V(H),V(B))),ue=V(H)>V(B)?Q:he(V(Q)+V(B)-V(H))),{"--n-bezier":je,"--n-button-border-radius":Ie,"--n-button-box-shadow":J,"--n-button-color":q,"--n-button-width":le,"--n-button-width-pressed":Ve,"--n-button-height":B,"--n-height":ce,"--n-offset":de,"--n-opacity-disabled":$,"--n-rail-border-radius":De,"--n-rail-color":U,"--n-rail-color-active":Y,"--n-rail-height":H,"--n-rail-width":Q,"--n-width":ue,"--n-box-shadow-focus":ne,"--n-loading-color":ie,"--n-text-color":ae,"--n-icon-color":se}}),K=o?Ce("switch",O(()=>l.value[0]),S,e):void 0;return{handleClick:P,handleBlur:m,handleFocus:M,handleKeyup:f,handleKeydown:v,mergedRailStyle:w,pressed:s,mergedClsPrefix:t,mergedValue:u,checked:y,mergedDisabled:c,cssVars:o?void 0:S,themeClass:K?.themeClass,onRender:K?.onRender}},render(){const{mergedClsPrefix:e,mergedDisabled:t,checked:o,mergedRailStyle:r,onRender:n,$slots:a}=this;n?.();const{checked:l,unchecked:c,icon:b,"checked-icon":h,"unchecked-icon":u}=a,y=!(be(b)&&be(h)&&be(u));return k(),A("div",{role:"switch","aria-checked":o,class:x([`${e}-switch`,this.themeClass,y&&`${e}-switch--icon`,o&&`${e}-switch--active`,t&&`${e}-switch--disabled`,this.round&&`${e}-switch--round`,this.loading&&`${e}-switch--loading`,this.pressed&&`${e}-switch--pressed`,this.rubberBand&&`${e}-switch--rubber-band`]),tabindex:this.mergedDisabled?void 0:0,style:oe(this.cssVars),onClick:this.handleClick,onFocus:this.handleFocus,onBlur:this.handleBlur,onKeyup:this.handleKeyup,onKeydown:this.handleKeydown},[D("div",{class:x(`${e}-switch__rail`),"aria-hidden":"true",style:oe(r)},[R(()=>L(l,s=>L(c,p=>s||p?(k(),A("div",{key:4,"aria-hidden":!0,class:x(`${e}-switch__children-placeholder`)},[D("div",{class:x(`${e}-switch__rail-placeholder`)},[D("div",{class:x(`${e}-switch__button-placeholder`)},null,2),R(()=>s)],2),D("div",{class:x(`${e}-switch__rail-placeholder`)},[D("div",{class:x(`${e}-switch__button-placeholder`)},null,2),R(()=>p)],2)],2)):null))),D("div",{class:x(`${e}-switch__button`)},[R(()=>L(b,s=>L(h,p=>L(u,w=>(k(),ge(Ne,null,{default:()=>this.loading?(k(),ge(He,Ye({key:"loading",clsPrefix:e,strokeWidth:20},this.spinProps),null,16,["clsPrefix"])):this.checked&&(p||s)?(k(),A("div",{class:x(`${e}-switch__button-icon`),key:p?"checked-icon":"icon"},[R(()=>p||s)],2)):!this.checked&&(w||s)?(k(),A("div",{class:x(`${e}-switch__button-icon`),key:w?"unchecked-icon":"icon"},[R(()=>w||s)],2)):null},1024)))))),R(()=>L(l,s=>s&&(k(),A("div",{key:"checked",class:x(`${e}-switch__checked`)},[R(()=>s)],2)))),R(()=>L(c,s=>s&&(k(),A("div",{key:"unchecked",class:x(`${e}-switch__unchecked`)},[R(()=>s)],2))))],2)],6)],46,bt)}});const ft=/^[0-9a-f]{8}-[0-9a-f]{4}/;function pt(e){return e.slice(e.lastIndexOf("_")+1)}function gt(e){const t=typeof e?.sessionPath=="string"?e.sessionPath:"";return mt(t)}function mt(e){if(typeof e!="string")return"";const t=e.trim();if(!t)return"";const r=(t.split(/[/\\]/).filter(Boolean).pop()||"").replace(/\.jsonl$/i,"").replace(/\.json$/i,"");if(!r||r==="."||r===".."||r.startsWith("sess_"))return"";const n=pt(r);return!n||n.startsWith("sess_")||!ft.test(n)?"":n}async function Dt(e){return(await G.api.fetch(e)).json()}async function It(e,t){return(await G.api.fetch(e,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)})).json()}async function jt(e,t){return(await G.api.fetch(e,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)})).json()}async function Mt(e){return(await G.api.fetch(e,{method:"DELETE"})).json()}function Ut(){G.ready()}async function vt(){try{return await G.sessions.getActive()}catch{return null}}async function Ht(){return gt(await vt())||null}function Nt(e){try{const t=G.sessions.onActiveChanged(e);return typeof t=="function"?t:null}catch{return null}}const N="暂无",xt=2e3,wt=4e3,Ae=["下面有几个已知话题，和一段新的对话。","","先判断这段对话在讲什么，给它起个名字，再决定它属于哪个话题。","","名字要像标题，30 个字以内，不要路径、命令、代码或 markdown 符号。","简述按要素写，讲清楚就行，不要为了写长而铺陈。500 个字是上限，不是要求。"].join(`
`);function Fe(e){return typeof e!="string"||!e?"":Array.from(e).slice(0,xt).join("")}function Lt(e,t=!1){const o=Fe(e);return o||(t?"":Ae)}function Ot(e){const t=Fe(e);return t===Ae?"当前为默认题面":t.trim()?"已修改":"已修改 · 题面为空时使用内置默认"}const Ee=["{{question}}","","已有话题：","{{candidates}}","","之前（供参考）：","{{previous}}","","对话：","{{current}}","","{{format}}"].join(`
`);function Pe(e){return typeof e!="string"||!e?"":Array.from(e).slice(0,wt).join("")}function Wt(e,t=!1){const o=Pe(e);return o||(t?"":Ee)}function Gt(e){const t=Pe(e);return t===Ee?"当前为默认模板":t.trim()?"已修改":"已修改 · 模板为空时使用内置默认"}const Kt=Object.freeze([1,100]),Yt=Object.freeze([1,20]),Xt=Object.freeze([1,50]),Jt=Object.freeze([1,20]),qt=Object.freeze([60,86400]),yt=Object.freeze({captureServiceUrl:"判别服务地址",systemoneServiceModel:"决策服务模型"});function Ct(e){if(e==null)return"";const t=typeof e=="number"?e:Date.parse(e);if(!Number.isFinite(t))return"";try{return new Date(t).toLocaleString("zh-CN")}catch{return""}}function fe(e){if(e==null)return"";const t=Number(e);return!Number.isFinite(t)||t<0?"":String(Math.floor(t))}function St(e,t={}){const o=!!e&&typeof e=="object";if(t.active===!1||t.autoCapture===!1||!o)return{written:N,lastCommit:N,pending:N,topics:N,disabled:!0};const n=fe(e.written),a=Ct(e.lastCommitAt),l=fe(e.pendingTurns),c=fe(e.topics);return{written:n!==""?`${n} 条`:N,lastCommit:a||N,pending:l!==""?`${l} 轮`:N,topics:c!==""?`${c} 个`:N,disabled:!1}}function Qt(e,t={}){const o=St(e,t);return[{key:"written",label:"本会话已写",value:o.written},{key:"lastCommit",label:"上次提交",value:o.lastCommit},{key:"pending",label:"待提交",value:o.pending},{key:"topics",label:"本会话话题数",value:o.topics}]}function Zt(e){if(!e||typeof e!="object"||e.early===!0||e.earlyStored!==!0)return"";const t=(Array.isArray(e.missing)?e.missing:[]).map(o=>yt[o]||String(o||"")).filter(Boolean);return t.length?`当前不提前提交：还缺 ${t.join("、")}`:"当前不提前提交"}const ve=60*1e3,xe=60*ve,_e=24*xe;function Rt(e){if(typeof e=="number")return Number.isFinite(e)?e:null;if(typeof e!="string")return null;const t=e.trim();if(!t)return null;if(/^-?\d+$/.test(t)){const r=Number(t);return Number.isFinite(r)?r:null}const o=Date.parse(t);return Number.isFinite(o)?o:null}function kt(e,t){const o=Rt(e);if(o===null)return"—";const n=(Number.isFinite(Number(t))?Number(t):Date.now())-o;return n<ve?"刚刚":n<xe?`${Math.floor(n/ve)} 分钟前`:n<_e?`${Math.floor(n/xe)} 小时前`:`${Math.floor(n/_e)} 天前`}const _t=200,zt=1.5,$t=/^[0-9a-f]{8}-[0-9a-f]{4}/i;function z(e){if(typeof e=="number"&&Number.isFinite(e))return Math.max(0,Math.floor(e));if(typeof e=="string"&&e.trim()){const t=Number(e.trim());if(Number.isFinite(t))return Math.max(0,Math.floor(t))}return 0}function Tt(e){const t=typeof e=="string"?e.trim():"";return $t.test(t)?t.slice(0,8):""}function eo(e){if(e==null)return"—";const t=z(e);return t>0?`欠 ${t} 段`:"已补完"}function to(e,t,o={}){const r=e&&typeof e=="object"?e:{},n=typeof r.sessionId=="string"?r.sessionId:"",a=o.running===!0,l=typeof r.title=="string"?r.title.trim():"";return{sessionId:n,shortId:Tt(n),idTitle:[n,typeof r.file=="string"?r.file:""].filter(Boolean).join(`
`),titleText:l||"（无标题会话）",titleFull:l,agentText:typeof r.agent=="string"?r.agent:"",messagesText:String(z(r.messages)),writtenText:String(z(r.written)),pendingText:`${z(r.pendingSegments)} 段`,seenText:kt(r.lastActivityAt,t),busy:a&&n!==""&&o.currentSessionId===n,cancelDisabled:!a}}function oo(e){const t=e&&typeof e=="object"?e:{};return`${z(t.sessions)} 个会话、共 ${z(t.segments)} 段`}function Bt(e){const t=z(e)*zt;return t<60?"不到 1 分钟":`约 ${Math.round(t/60)} 分钟`}function ro({sessions:e,segments:t,max:o}={}){const r=z(e),n=z(t),a=o==null?_t:z(o),l=Bt(n);return[`补交全部：共 ${r} 个会话、${n} 段，${l}。`,"补交会把这些历史对话写进 OpenViking 并抽取记忆，写出去的记忆不会自动撤销；",`单次最多 ${a} 段，超出部分要再点一次。`].join(`
`)}function no(e){const t=e&&typeof e=="object"?e:{},o=z(t.done),r=z(t.total);if(t.running===!0)return`补交中 · ${typeof t.currentLabel=="string"?t.currentLabel:""}（${o}/${r} 段）`;const n=typeof t.error=="string"?t.error.trim():"";return n?`上次补交出错：${n}`:o>0?`上次补交完成 ${o}/${r} 段`:""}export{no as A,to as B,qt as C,Ae as D,_t as E,ro as F,kt as G,Mt as H,jt as I,xt as J,wt as K,Zt as L,Ht as M,Pt as R,Vt as S,gt as a,Ut as b,Qt as c,vt as d,Dt as e,me as f,Te as g,ot as h,rt as i,It as j,Gt as k,Ot as l,Yt as m,Xt as n,Nt as o,eo as p,Jt as q,Qe as r,Ze as s,Kt as t,Pe as u,Fe as v,Lt as w,Wt as x,Ee as y,oo as z};
