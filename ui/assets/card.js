import{i as Be,r as K,t as J,d as Z,o as T,c as O,a as p,n as le,b as A,e as de,p as _e,f as E,g as $,w as V,h as Q,u as I,j as Te,k as G,l as Fe,m as Ve,q as Ie,s as De,v as Ae}from"./chunk-vue.js";import{d as Oe,c as te,a as P,b as B,e as C,f as D,g as X,u as ee,h as ue,i as ce,j as oe,k as Ee,l as j,m as q,n as Pe,o as M,p as _,r as be,q as fe,s as ve,t as W,B as Ue,v as re,z as He,C as Ke}from"./chunk-theme.js";import{f as Me,g as Ne,s as je,a as Le,o as Ge,S as Y,c as We,j as ne,b as qe}from"./chunk-api.js";import"./sdk.js";var Ye={radioSizeSmall:"14px",radioSizeMedium:"16px",radioSizeLarge:"18px",labelPadding:"0 8px",labelFontWeight:"400"};function Je(t){const{borderColor:o,primaryColor:e,baseColor:a,textColorDisabled:i,inputColorDisabled:s,textColor2:u,opacityDisabled:g,borderRadius:f,fontSizeSmall:b,fontSizeMedium:v,fontSizeLarge:w,heightSmall:h,heightMedium:y,heightLarge:m,lineHeight:k}=t;return{...Ye,labelLineHeight:k,buttonHeightSmall:h,buttonHeightMedium:y,buttonHeightLarge:m,fontSizeSmall:b,fontSizeMedium:v,fontSizeLarge:w,boxShadow:`inset 0 0 0 1px ${o}`,boxShadowActive:`inset 0 0 0 1px ${e}`,boxShadowFocus:`inset 0 0 0 1px ${e}, 0 0 0 2px ${te(e,{alpha:.2})}`,boxShadowHover:`inset 0 0 0 1px ${e}`,boxShadowDisabled:`inset 0 0 0 1px ${o}`,color:a,colorDisabled:s,colorActive:"#0000",textColor:u,textColorDisabled:i,dotColorActive:e,dotColorDisabled:o,buttonBorderColor:o,buttonBorderColorActive:e,buttonBorderColorHover:o,buttonColor:a,buttonColorActive:a,buttonTextColor:u,buttonTextColorActive:e,buttonTextColorHover:e,opacityDisabled:g,buttonBoxShadowFocus:`inset 0 0 0 1px ${e}, 0 0 0 2px ${te(e,{alpha:.3})}`,buttonBoxShadowHover:"inset 0 0 0 1px #0000",buttonBoxShadow:"inset 0 0 0 1px #0000",buttonBorderRadius:f}}const he={common:Oe,self:Je};var Qe=P("radio",`
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
`,[B("checked",[C("dot",`
 background-color: var(--n-color-active);
 `)]),C("dot-wrapper",`
 position: relative;
 flex-shrink: 0;
 flex-grow: 0;
 width: var(--n-radio-size);
 `),P("radio-input",`
 position: absolute;
 border: 0;
 width: 0;
 height: 0;
 opacity: 0;
 margin: 0;
 `),C("dot",`
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
 `,[D("&::before",`
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
 `),B("checked",{boxShadow:"var(--n-box-shadow-active)"},[D("&::before",`
 opacity: 1;
 transform: scale(1);
 `)])]),C("label",`
 color: var(--n-text-color);
 padding: var(--n-label-padding);
 font-weight: var(--n-label-font-weight);
 display: inline-block;
 transition: color .3s var(--n-bezier);
 `),X("disabled",`
 cursor: pointer;
 `,[D("&:hover",[C("dot",{boxShadow:"var(--n-box-shadow-hover)"})]),B("focus",[D("&:not(:active)",[C("dot",{boxShadow:"var(--n-box-shadow-focus)"})])])]),B("disabled",`
 cursor: not-allowed;
 `,[C("dot",{boxShadow:"var(--n-box-shadow-disabled)",backgroundColor:"var(--n-color-disabled)"},[D("&::before",{backgroundColor:"var(--n-dot-color-disabled)"}),B("checked",`
 opacity: 1;
 `)]),C("label",{color:"var(--n-text-color-disabled)"}),P("radio-input",`
 cursor: not-allowed;
 `)])]);const pe={name:String,value:{type:[String,Number,Boolean],default:"on"},checked:{type:Boolean,default:void 0},defaultChecked:Boolean,disabled:{type:Boolean,default:void 0},label:String,size:String,onUpdateChecked:[Function,Array],"onUpdate:checked":[Function,Array],checkedValue:{type:Boolean,default:void 0}},ge=Ee("n-radio-group");function me(t){const o=Be(ge,null),{mergedClsPrefixRef:e,mergedComponentPropsRef:a}=ee(t),i=ue(t,{mergedSize(c){const{size:d}=t;if(d!==void 0)return d;if(o){const{mergedSizeRef:{value:r}}=o;if(r!==void 0)return r}if(c)return c.mergedSize.value;const n=a?.value?.Radio?.size;return n||"medium"},mergedDisabled(c){return!!(t.disabled||o?.disabledRef.value||c?.disabled.value)}}),{mergedSizeRef:s,mergedDisabledRef:u}=i,g=K(null),f=K(null),b=K(t.defaultChecked),v=J(t,"checked"),w=ce(v,b),h=oe(()=>o?o.valueRef.value===t.value:w.value),y=oe(()=>{const{name:c}=t;if(c!==void 0)return c;if(o)return o.nameRef.value}),m=K(!1);function k(){if(o){const{doUpdateValue:c}=o,{value:d}=t;j(c,d)}else{const{onUpdateChecked:c,"onUpdate:checked":d}=t,{nTriggerFormInput:n,nTriggerFormChange:r}=i;c&&j(c,!0),d&&j(d,!0),n(),r(),b.value=!0}}function S(){u.value||h.value||k()}function R(){S(),g.value&&(g.value.checked=h.value)}function z(){m.value=!1}function F(){m.value=!0}return{mergedClsPrefix:o?o.mergedClsPrefixRef:e,inputRef:g,labelRef:f,mergedName:y,mergedDisabled:u,renderSafeChecked:h,focus:m,mergedSize:s,handleRadioInputChange:R,handleRadioInputBlur:z,handleRadioInputFocus:F}}const Xe=["value","name","checked","disabled","onChange","onFocus","onBlur"],Ze={...q.props,...pe};var et=Z({name:"Radio",props:Ze,setup(t){const o=me(t),e=q("Radio","-radio",Qe,he,t,o.mergedClsPrefix),a=A(()=>{const{mergedSize:{value:b}}=o,{common:{cubicBezierEaseInOut:v},self:{boxShadow:w,boxShadowActive:h,boxShadowDisabled:y,boxShadowFocus:m,boxShadowHover:k,color:S,colorDisabled:R,colorActive:z,textColor:F,textColorDisabled:c,dotColorActive:d,dotColorDisabled:n,labelPadding:r,labelLineHeight:l,labelFontWeight:x,[W("fontSize",b)]:U,[W("radioSize",b)]:H}}=e.value;return{"--n-bezier":v,"--n-label-line-height":l,"--n-label-font-weight":x,"--n-box-shadow":w,"--n-box-shadow-active":h,"--n-box-shadow-disabled":y,"--n-box-shadow-focus":m,"--n-box-shadow-hover":k,"--n-color":S,"--n-color-active":z,"--n-color-disabled":R,"--n-dot-color-active":d,"--n-dot-color-disabled":n,"--n-font-size":U,"--n-radio-size":H,"--n-text-color":F,"--n-text-color-disabled":c,"--n-label-padding":r}}),{inlineThemeDisabled:i,mergedClsPrefixRef:s,mergedRtlRef:u}=ee(t),g=fe("Radio",u,s),f=i?ve("radio",A(()=>o.mergedSize.value[0]),a,t):void 0;return Object.assign(o,{rtlEnabled:g,cssVars:i?void 0:a,themeClass:f?.themeClass,onRender:f?.onRender})},render(){const{$slots:t,mergedClsPrefix:o,onRender:e,label:a}=this;return e?.(),(()=>{const i=Pe("f8c6901d8cd45c02");return T(),O("label",{class:_([`${o}-radio`,this.themeClass,this.rtlEnabled&&`${o}-radio--rtl`,this.mergedDisabled&&`${o}-radio--disabled`,this.renderSafeChecked&&`${o}-radio--checked`,this.focus&&`${o}-radio--focus`]),style:le(this.cssVars)},[p("div",{class:_(`${o}-radio__dot-wrapper`)},[i[0]||(i[0]=M(" ",-1)),p("div",{class:_([`${o}-radio__dot`,this.renderSafeChecked&&`${o}-radio__dot--checked`])},null,2),p("input",{ref:"inputRef",type:"radio",class:_(`${o}-radio-input`),value:this.value,name:this.mergedName,checked:this.renderSafeChecked,disabled:this.mergedDisabled,onChange:this.handleRadioInputChange,onFocus:this.handleRadioInputFocus,onBlur:this.handleRadioInputBlur},null,42,Xe)],2),M(()=>be(t.default,s=>!s&&!a?null:(T(),O("div",{ref:"labelRef",class:_(`${o}-radio__label`)},[M(()=>s||a)],2))))],6)})()}});const tt=["value","name","checked","disabled","onChange","onFocus","onBlur"];var ae=Z({name:"RadioButton",props:pe,setup:me,render(){const{mergedClsPrefix:t}=this;return T(),O("label",{class:_([`${t}-radio-button`,this.mergedDisabled&&`${t}-radio-button--disabled`,this.renderSafeChecked&&`${t}-radio-button--checked`,this.focus&&[`${t}-radio-button--focus`]])},[p("input",{ref:"inputRef",type:"radio",class:_(`${t}-radio-input`),value:this.value,name:this.mergedName,checked:this.renderSafeChecked,disabled:this.mergedDisabled,onChange:this.handleRadioInputChange,onFocus:this.handleRadioInputFocus,onBlur:this.handleRadioInputBlur},null,42,tt),p("div",{class:_(`${t}-radio-button__state-border`)},null,2),M(()=>be(this.$slots.default,o=>!o&&!this.label?null:(T(),O("div",{ref:"labelRef",class:_(`${t}-radio__label`)},[M(()=>o||this.label)],2))))],2)}}),ot=P("radio-group",`
 display: inline-block;
 font-size: var(--n-font-size);
`,[C("splitor",`
 display: inline-block;
 vertical-align: bottom;
 width: 1px;
 transition:
 background-color .3s var(--n-bezier),
 opacity .3s var(--n-bezier);
 background: var(--n-button-border-color);
 `,[B("checked",{backgroundColor:"var(--n-button-border-color-active)"}),B("disabled",{opacity:"var(--n-opacity-disabled)"})]),B("button-group",`
 white-space: nowrap;
 height: var(--n-height);
 line-height: var(--n-height);
 `,[P("radio-button",{height:"var(--n-height)",lineHeight:"var(--n-height)"}),C("splitor",{height:"var(--n-height)"})]),P("radio-button",`
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
 `,[P("radio-input",`
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
 `),C("state-border",`
 z-index: 1;
 pointer-events: none;
 position: absolute;
 box-shadow: var(--n-button-box-shadow);
 transition: box-shadow .3s var(--n-bezier);
 left: -1px;
 bottom: -1px;
 right: -1px;
 top: -1px;
 `),D("&:first-child",`
 border-top-left-radius: var(--n-button-border-radius);
 border-bottom-left-radius: var(--n-button-border-radius);
 border-left: 1px solid var(--n-button-border-color);
 `,[C("state-border",`
 border-top-left-radius: var(--n-button-border-radius);
 border-bottom-left-radius: var(--n-button-border-radius);
 `)]),D("&:last-child",`
 border-top-right-radius: var(--n-button-border-radius);
 border-bottom-right-radius: var(--n-button-border-radius);
 border-right: 1px solid var(--n-button-border-color);
 `,[C("state-border",`
 border-top-right-radius: var(--n-button-border-radius);
 border-bottom-right-radius: var(--n-button-border-radius);
 `)]),X("disabled",`
 cursor: pointer;
 `,[D("&:hover",[C("state-border",`
 transition: box-shadow .3s var(--n-bezier);
 box-shadow: var(--n-button-box-shadow-hover);
 `),X("checked",{color:"var(--n-button-text-color-hover)"})]),B("focus",[D("&:not(:active)",[C("state-border",{boxShadow:"var(--n-button-box-shadow-focus)"})])])]),B("checked",`
 background: var(--n-button-color-active);
 color: var(--n-button-text-color-active);
 border-color: var(--n-button-border-color-active);
 `),B("disabled",`
 cursor: not-allowed;
 opacity: var(--n-opacity-disabled);
 `)])]);const rt=["onFocusin","onFocusout"];function nt(t,o,e){const a=[];let i=!1;for(let s=0;s<t.length;++s){const u=t[s],g=u.type?.name;g==="RadioButton"&&(i=!0);const f=u.props;if(g!=="RadioButton"){a.push(u);continue}if(s===0)a.push(u);else{const b=a[a.length-1].props,v=o===b.value,w=b.disabled,h=o===f.value,y=f.disabled,m=(v?2:0)+(w?0:1),k=(h?2:0)+(y?0:1),S={[`${e}-radio-group__splitor--disabled`]:w,[`${e}-radio-group__splitor--checked`]:v},R={[`${e}-radio-group__splitor--disabled`]:y,[`${e}-radio-group__splitor--checked`]:h},z=m<k?R:S;a.push((T(),O("div",{key:1,class:_([`${e}-radio-group__splitor`,z])},null,2)),u)}}return{children:a,isButtonGroup:i}}const at={...q.props,name:String,options:Array,labelField:{type:String,default:"label"},valueField:{type:String,default:"value"},value:[String,Number,Boolean],defaultValue:{type:[String,Number,Boolean],default:null},size:String,disabled:{type:Boolean,default:void 0},"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array]};var it=Z({name:"RadioGroup",props:at,setup(t){const o=K(null),{mergedSizeRef:e,mergedDisabledRef:a,nTriggerFormChange:i,nTriggerFormInput:s,nTriggerFormBlur:u,nTriggerFormFocus:g}=ue(t),{mergedClsPrefixRef:f,inlineThemeDisabled:b,mergedRtlRef:v}=ee(t),w=q("Radio","-radio-group",ot,he,t,f),h=K(t.defaultValue),y=J(t,"value"),m=ce(y,h);function k(d){const{onUpdateValue:n,"onUpdate:value":r}=t;n&&j(n,d),r&&j(r,d),h.value=d,i(),s()}function S(d){const{value:n}=o;n&&(n.contains(d.relatedTarget)||g())}function R(d){const{value:n}=o;n&&(n.contains(d.relatedTarget)||u())}_e(ge,{mergedClsPrefixRef:f,nameRef:J(t,"name"),valueRef:m,disabledRef:a,mergedSizeRef:e,doUpdateValue:k});const z=fe("Radio",v,f),F=A(()=>{const{value:d}=e,{common:{cubicBezierEaseInOut:n},self:{buttonBorderColor:r,buttonBorderColorActive:l,buttonBorderRadius:x,buttonBoxShadow:U,buttonBoxShadowFocus:H,buttonBoxShadowHover:xe,buttonColor:we,buttonColorActive:Ce,buttonTextColor:ye,buttonTextColorActive:Se,buttonTextColorHover:Re,opacityDisabled:ke,[W("buttonHeight",d)]:ze,[W("fontSize",d)]:$e}}=w.value;return{"--n-font-size":$e,"--n-bezier":n,"--n-button-border-color":r,"--n-button-border-color-active":l,"--n-button-border-radius":x,"--n-button-box-shadow":U,"--n-button-box-shadow-focus":H,"--n-button-box-shadow-hover":xe,"--n-button-color":we,"--n-button-color-active":Ce,"--n-button-text-color":ye,"--n-button-text-color-hover":Re,"--n-button-text-color-active":Se,"--n-height":ze,"--n-opacity-disabled":ke}}),c=b?ve("radio-group",A(()=>e.value[0]),F,t):void 0;return{selfElRef:o,rtlEnabled:z,mergedClsPrefix:f,mergedValue:m,handleFocusout:R,handleFocusin:S,cssVars:b?void 0:F,themeClass:c?.themeClass,onRender:c?.onRender}},render(){const{mergedValue:t,mergedClsPrefix:o,handleFocusin:e,handleFocusout:a}=this,{options:i,labelField:s,valueField:u}=this.$props,{children:g,isButtonGroup:f}=nt(i?i.map(b=>{const v=b[u];return T(),de(et,{key:typeof v=="boolean"?`__n_${v}`:v,value:v,disabled:b.disabled,label:b[s]},null,8,["value","disabled","label"])}):Me(Ne(this)),t,o);return this.onRender?.(),T(),O("div",{onFocusin:e,onFocusout:a,ref:"selfElRef",class:_([`${o}-radio-group`,this.rtlEnabled&&`${o}-radio-group--rtl`,this.themeClass,f&&`${o}-radio-group--button-group`]),style:le(this.cssVars)},[M(()=>g)],46,rt)}});const st=Object.freeze(["autoRecall","autoCapture","readOnly"]),N="recallPeerScope",lt=Object.freeze([...st,N]),dt=Object.freeze(["all","self"]);function ie(t,o){return!!t&&Object.prototype.hasOwnProperty.call(t,o)&&t[o]!==null}function ut(t){return Object.keys(t||{}).some(o=>t[o]!==null)}function ct(t){return t?{text:"本会话",title:"点击交回全局"}:{text:"跟随全局",title:"当前跟随全局"}}function se(t,o,e){return{...t||{},[o]:e}}function bt(t,o){return{...t||{},[o]:null}}function ft(t){return(t?!!t.enabled:!0)?{text:"全局开",tone:"on"}:{text:"全局关",tone:"off"}}function vt(t,o){const e=t?.effective||{};return o&&(e.autoRecall||e.autoCapture)?"ok":"idle"}function ht(t){const o=t?.state?.recall||{},e=t?.state?.capture||{},a=t?.probe?.events||{},i=(a["provider/before-request"]||0)+(a["agent/before-start"]||0),s=[`召回 ${o.turns||0}`,`写回 ${e.turns||0}`];return i&&s.push(`钩子 ${i}`),t?.probe?.lastAt&&s.push(new Date(t.probe.lastAt).toLocaleTimeString()),s.join(" · ")}function pt(t,o){const e=o||t?.peer||"";return e?o?{text:o,title:t?.peer?`会话归属 ${o}；对外门牌 ${t.peer}`:`会话归属 ${o}`}:{text:e,title:t?.peerSource==="merged"?t?.peerAgentDir?`${e}（合并记忆已开启；本会话助手：${t.peerAgentDir}）`:`${e}（合并记忆已开启，本机所有助手共用一个身份）`:e}:{text:"未绑定助手",title:t?.peerSource==="merged"?"合并记忆已开启，但这一段没拿到会话身份。":"拿不到会话路径，无法确定这一段属于哪个助手。"}}function gt({overrides:t,enabled:o,status:e}={}){const a=ut(t);return o?e&&!e.probe?{text:a?"有本会话设置；点小字交回全局。":"",warn:!1}:{text:a?"实心小字是本会话设置，点它交回全局。":"",warn:!1}:{text:"全局总闸关着，这里的开关不会生效。",warn:!0}}function mt(t){const o=je(t)||null,e=typeof t?.agentId=="string"?t.agentId.trim():"",a=t?.title||"";return{sessionKey:o,sessionOwner:e,title:a||(o?o.slice(-8):"无活动会话"),titleTitle:a||o||""}}function xt(t,o,e){const a={...t||{}};return o===N?a[N]=e?.recallScope||"all":e&&typeof e[o]=="boolean"?a[o]=e[o]:delete a[o],a}const wt=["data-key"],Ct={class:"row-label"},yt={class:"row-control"},L={__name:"CardRow",props:{rowKey:{type:String,required:!0},label:{type:String,required:!0},overridden:{type:Boolean,default:!1},disabled:{type:Boolean,default:!1},wide:{type:Boolean,default:!1}},emits:["reset"],setup(t){const o=t,e=A(()=>ct(o.overridden));return(a,i)=>(T(),O("div",{class:G(["row",{"row-wide":t.wide}]),"data-key":t.rowKey},[p("span",Ct,E(t.label),1),$(I(Ue),{class:"row-note",text:"",size:"tiny",type:t.overridden?"primary":"default",disabled:t.disabled,title:e.value.title,"aria-pressed":t.overridden?"true":"false",onClick:i[0]||(i[0]=s=>a.$emit("reset"))},{default:V(()=>[Q(E(e.value.text),1)]),_:1},8,["type","disabled","title","aria-pressed"]),p("div",yt,[Te(a.$slots,"default")])],10,wt))}},St=["data-session"],Rt={class:"head"},kt=["title"],zt={class:"ident"},$t=["title"],Bt={class:"rows"},_t={class:"stats"},Tt=8e3,Ft={__name:"CardApp",setup(t){const o={...re,common:{...re.common,primaryColor:"#537D96",primaryColorHover:"#6A8FA6",primaryColorPressed:"#476B82",primaryColorSuppl:"#537D96"}},e=De({sessionKey:null,sessionOwner:"",title:"无活动会话",titleTitle:"",peerText:"—",peerTitle:"",pillText:"—",pillTone:"",dotTone:"idle",stats:"—",hintText:"",hintWarn:!1,effective:{},overrides:{},enabled:!0,globalStatus:null,hasModel:!1,writing:!1}),a=A(()=>!e.sessionKey||!e.hasModel||e.writing),i=A(()=>{const n={};for(const r of lt)n[r]=ie(e.overrides,r);return n}),s=A(()=>e.effective[N]||"all");function u(n,r){e.hintText=n||"",e.hintWarn=!!r}function g(){e.hasModel=!1,e.effective={},e.overrides={},e.peerText="—",e.peerTitle="",e.stats="—",e.pillText="—",e.pillTone="",e.dotTone="idle",u("先打开一个对话，这张卡才会跟会话绑定。",!1)}function f(n){const r=mt(n);e.sessionKey=r.sessionKey,e.sessionOwner=r.sessionOwner,e.title=r.title,e.titleTitle=r.titleTitle}function b(n,r){r&&(e.globalStatus=r),e.hasModel=!0,e.effective={...n.effective||{}},e.overrides={...n.state?.overrides||{}};const l=e.globalStatus?!!e.globalStatus.enabled:!0;e.enabled=l;const x=ft(e.globalStatus);e.pillText=x.text,e.pillTone=x.tone,e.dotTone=vt(n,l),e.stats=ht(n);const U=pt(n,e.sessionOwner);e.peerText=U.text,e.peerTitle=U.title;const H=gt({overrides:e.overrides,enabled:l,status:e.globalStatus});u(H.text,H.warn)}async function v(n){try{return await ne(`/status?session=${encodeURIComponent(n)}`)}catch{return null}}async function w(){if(!e.sessionKey&&(f(await We()),!e.sessionKey)){g();return}const n=e.sessionKey;try{const[r,l]=await Promise.all([v(n),ne(`/session/${encodeURIComponent(n)}`)]);if(l?.ok===!1){e.hasModel=!1,e.stats="—",u("这个会话对不上任何状态（unknown session key），先重新选一次会话。",!0);return}b(l||{},r)}catch(r){u(String(r?.message||r),!0)}}function h(){return{effective:{...e.effective},overrides:{...e.overrides}}}async function y(n,r){const l=e.sessionKey;if(l){e.writing=!0;try{const x=await qe(`/session/${encodeURIComponent(l)}`,{overrides:n});if(x?.ok===!1)throw new Error(x.error||"写入失败");await w()}catch(x){e.effective=r.effective,e.overrides=r.overrides,u(String(x?.message||x),!0)}finally{e.writing=!1}}}async function m(n,r){if(a.value)return;const l=h(),x=typeof r=="boolean"?r:!e.effective[n];x!==!!e.effective[n]&&(e.effective={...e.effective,[n]:x},e.overrides=se(e.overrides,n,x),await y({...e.overrides},l))}async function k(n){if(a.value||!dt.includes(n)||n===s.value)return;const r=h();e.effective={...e.effective,[N]:n},e.overrides=se(e.overrides,N,n),await y({...e.overrides},r)}async function S(n){if(a.value||!ie(e.overrides,n))return;const r=h();e.overrides=bt(e.overrides,n),e.effective=xt(e.effective,n,e.globalStatus),await y({...e.overrides},r)}let R=null;function z(){R&&clearInterval(R),R=null}function F(){z(),w(),R=setInterval(w,Tt)}function c(){document.hidden?z():F()}let d=null;return Fe(()=>{Le(),document.addEventListener("visibilitychange",c),d=Ge(()=>{e.sessionKey=null,e.sessionOwner="",e.hasModel=!1,w()}),F()}),Ve(()=>{z(),document.removeEventListener("visibilitychange",c),d&&d()}),(n,r)=>(T(),de(I(Ke),{abstract:"",locale:I(He),"theme-overrides":o},{default:V(()=>[p("div",{class:"card","data-session":e.sessionKey?"on":"off"},[p("header",Rt,[p("span",{class:G(["dot",e.dotTone]),"aria-hidden":"true"},null,2),p("span",{class:"title",title:e.titleTitle},E(e.title),9,kt),p("span",{class:G(["pill",e.pillTone])},E(e.pillText),3)]),p("div",zt,[r[7]||(r[7]=p("span",{class:"ident-label"},"peer",-1)),p("span",{class:"ident-value",title:e.peerTitle},E(e.peerText),9,$t)]),p("div",Bt,[$(L,{"row-key":"autoRecall",label:"记忆召回",overridden:i.value.autoRecall,disabled:a.value,onReset:r[1]||(r[1]=l=>S("autoRecall"))},{default:V(()=>[$(I(Y),{size:"small","aria-label":"记忆召回",value:!!e.effective.autoRecall,disabled:a.value,"onUpdate:value":r[0]||(r[0]=l=>m("autoRecall",l))},null,8,["value","disabled"])]),_:1},8,["overridden","disabled"]),$(L,{"row-key":"autoCapture",label:"写回",overridden:i.value.autoCapture,disabled:a.value,onReset:r[3]||(r[3]=l=>S("autoCapture"))},{default:V(()=>[$(I(Y),{size:"small","aria-label":"写回",value:!!e.effective.autoCapture,disabled:a.value,"onUpdate:value":r[2]||(r[2]=l=>m("autoCapture",l))},null,8,["value","disabled"])]),_:1},8,["overridden","disabled"]),$(L,{"row-key":"readOnly",label:"只读",overridden:i.value.readOnly,disabled:a.value,onReset:r[5]||(r[5]=l=>S("readOnly"))},{default:V(()=>[$(I(Y),{size:"small","aria-label":"只读",value:!!e.effective.readOnly,disabled:a.value,"onUpdate:value":r[4]||(r[4]=l=>m("readOnly",l))},null,8,["value","disabled"])]),_:1},8,["overridden","disabled"]),$(L,{"row-key":"recallPeerScope",label:"召回范围",wide:"",overridden:i.value.recallPeerScope,disabled:a.value,onReset:r[6]||(r[6]=l=>S("recallPeerScope"))},{default:V(()=>[$(I(it),{size:"small","aria-label":"召回范围",value:s.value,disabled:a.value,"onUpdate:value":k},{default:V(()=>[$(I(ae),{value:"all"},{default:V(()=>[...r[8]||(r[8]=[Q("跨门牌",-1)])]),_:1}),$(I(ae),{value:"self"},{default:V(()=>[...r[9]||(r[9]=[Q("只看本机",-1)])]),_:1})]),_:1},8,["value","disabled"])]),_:1},8,["overridden","disabled"])]),p("p",_t,E(e.stats),1),e.hintText?(T(),O("p",{key:0,class:G(["hint",{warn:e.hintWarn}])},E(e.hintText),3)):Ie("",!0)],8,St)]),_:1},8,["locale"]))}};Ae(Ft).mount("#card-app");
