import{i as Be,r as H,t as Z,d as oe,o as V,c as P,a as m,n as ce,b as A,e as be,p as _e,f as U,g as _,w as D,h as ee,u as O,j as Te,k as Y,l as Fe,m as Ve,q as Ie,s as De,v as Oe}from"./chunk-vue.js";import{d as Ee,c as ne,a as K,b as T,e as y,f as E,g as te,u as re,h as fe,i as ve,j as ae,k as Ae,l as L,m as Q,n as Pe,o as N,p as F,r as he,q as pe,s as ge,t as J,B as Ue,v as ie,z as He,C as Ke}from"./chunk-theme.js";import{f as Me,g as Ne,s as je,a as Le,o as Ge,S as X,c as We,j as le,b as qe}from"./chunk-api.js";import{hana as Ye}from"./sdk.js";var Je={radioSizeSmall:"14px",radioSizeMedium:"16px",radioSizeLarge:"18px",labelPadding:"0 8px",labelFontWeight:"400"};function Qe(t){const{borderColor:o,primaryColor:e,baseColor:n,textColorDisabled:i,inputColorDisabled:l,textColor2:u,opacityDisabled:x,borderRadius:v,fontSizeSmall:f,fontSizeMedium:h,fontSizeLarge:C,heightSmall:p,heightMedium:S,heightLarge:w,lineHeight:$}=t;return{...Je,labelLineHeight:$,buttonHeightSmall:p,buttonHeightMedium:S,buttonHeightLarge:w,fontSizeSmall:f,fontSizeMedium:h,fontSizeLarge:C,boxShadow:`inset 0 0 0 1px ${o}`,boxShadowActive:`inset 0 0 0 1px ${e}`,boxShadowFocus:`inset 0 0 0 1px ${e}, 0 0 0 2px ${ne(e,{alpha:.2})}`,boxShadowHover:`inset 0 0 0 1px ${e}`,boxShadowDisabled:`inset 0 0 0 1px ${o}`,color:n,colorDisabled:l,colorActive:"#0000",textColor:u,textColorDisabled:i,dotColorActive:e,dotColorDisabled:o,buttonBorderColor:o,buttonBorderColorActive:e,buttonBorderColorHover:o,buttonColor:n,buttonColorActive:n,buttonTextColor:u,buttonTextColorActive:e,buttonTextColorHover:e,opacityDisabled:x,buttonBoxShadowFocus:`inset 0 0 0 1px ${e}, 0 0 0 2px ${ne(e,{alpha:.3})}`,buttonBoxShadowHover:"inset 0 0 0 1px #0000",buttonBoxShadow:"inset 0 0 0 1px #0000",buttonBorderRadius:v}}const me={common:Ee,self:Qe};var Xe=K("radio",`
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
`,[T("checked",[y("dot",`
 background-color: var(--n-color-active);
 `)]),y("dot-wrapper",`
 position: relative;
 flex-shrink: 0;
 flex-grow: 0;
 width: var(--n-radio-size);
 `),K("radio-input",`
 position: absolute;
 border: 0;
 width: 0;
 height: 0;
 opacity: 0;
 margin: 0;
 `),y("dot",`
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
 `,[E("&::before",`
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
 `),T("checked",{boxShadow:"var(--n-box-shadow-active)"},[E("&::before",`
 opacity: 1;
 transform: scale(1);
 `)])]),y("label",`
 color: var(--n-text-color);
 padding: var(--n-label-padding);
 font-weight: var(--n-label-font-weight);
 display: inline-block;
 transition: color .3s var(--n-bezier);
 `),te("disabled",`
 cursor: pointer;
 `,[E("&:hover",[y("dot",{boxShadow:"var(--n-box-shadow-hover)"})]),T("focus",[E("&:not(:active)",[y("dot",{boxShadow:"var(--n-box-shadow-focus)"})])])]),T("disabled",`
 cursor: not-allowed;
 `,[y("dot",{boxShadow:"var(--n-box-shadow-disabled)",backgroundColor:"var(--n-color-disabled)"},[E("&::before",{backgroundColor:"var(--n-dot-color-disabled)"}),T("checked",`
 opacity: 1;
 `)]),y("label",{color:"var(--n-text-color-disabled)"}),K("radio-input",`
 cursor: not-allowed;
 `)])]);const xe={name:String,value:{type:[String,Number,Boolean],default:"on"},checked:{type:Boolean,default:void 0},defaultChecked:Boolean,disabled:{type:Boolean,default:void 0},label:String,size:String,onUpdateChecked:[Function,Array],"onUpdate:checked":[Function,Array],checkedValue:{type:Boolean,default:void 0}},we=Ae("n-radio-group");function Ce(t){const o=Be(we,null),{mergedClsPrefixRef:e,mergedComponentPropsRef:n}=re(t),i=fe(t,{mergedSize(b){const{size:d}=t;if(d!==void 0)return d;if(o){const{mergedSizeRef:{value:g}}=o;if(g!==void 0)return g}if(b)return b.mergedSize.value;const c=n?.value?.Radio?.size;return c||"medium"},mergedDisabled(b){return!!(t.disabled||o?.disabledRef.value||b?.disabled.value)}}),{mergedSizeRef:l,mergedDisabledRef:u}=i,x=H(null),v=H(null),f=H(t.defaultChecked),h=Z(t,"checked"),C=ve(h,f),p=ae(()=>o?o.valueRef.value===t.value:C.value),S=ae(()=>{const{name:b}=t;if(b!==void 0)return b;if(o)return o.nameRef.value}),w=H(!1);function $(){if(o){const{doUpdateValue:b}=o,{value:d}=t;L(b,d)}else{const{onUpdateChecked:b,"onUpdate:checked":d}=t,{nTriggerFormInput:c,nTriggerFormChange:g}=i;b&&L(b,!0),d&&L(d,!0),c(),g(),f.value=!0}}function k(){u.value||p.value||$()}function z(){k(),x.value&&(x.value.checked=p.value)}function B(){w.value=!1}function I(){w.value=!0}return{mergedClsPrefix:o?o.mergedClsPrefixRef:e,inputRef:x,labelRef:v,mergedName:S,mergedDisabled:u,renderSafeChecked:p,focus:w,mergedSize:l,handleRadioInputChange:z,handleRadioInputBlur:B,handleRadioInputFocus:I}}const Ze=["value","name","checked","disabled","onChange","onFocus","onBlur"],et={...Q.props,...xe};var tt=oe({name:"Radio",props:et,setup(t){const o=Ce(t),e=Q("Radio","-radio",Xe,me,t,o.mergedClsPrefix),n=A(()=>{const{mergedSize:{value:f}}=o,{common:{cubicBezierEaseInOut:h},self:{boxShadow:C,boxShadowActive:p,boxShadowDisabled:S,boxShadowFocus:w,boxShadowHover:$,color:k,colorDisabled:z,colorActive:B,textColor:I,textColorDisabled:b,dotColorActive:d,dotColorDisabled:c,labelPadding:g,labelLineHeight:M,labelFontWeight:a,[J("fontSize",f)]:r,[J("radioSize",f)]:s}}=e.value;return{"--n-bezier":h,"--n-label-line-height":M,"--n-label-font-weight":a,"--n-box-shadow":C,"--n-box-shadow-active":p,"--n-box-shadow-disabled":S,"--n-box-shadow-focus":w,"--n-box-shadow-hover":$,"--n-color":k,"--n-color-active":B,"--n-color-disabled":z,"--n-dot-color-active":d,"--n-dot-color-disabled":c,"--n-font-size":r,"--n-radio-size":s,"--n-text-color":I,"--n-text-color-disabled":b,"--n-label-padding":g}}),{inlineThemeDisabled:i,mergedClsPrefixRef:l,mergedRtlRef:u}=re(t),x=pe("Radio",u,l),v=i?ge("radio",A(()=>o.mergedSize.value[0]),n,t):void 0;return Object.assign(o,{rtlEnabled:x,cssVars:i?void 0:n,themeClass:v?.themeClass,onRender:v?.onRender})},render(){const{$slots:t,mergedClsPrefix:o,onRender:e,label:n}=this;return e?.(),(()=>{const i=Pe("f8c6901d8cd45c02");return V(),P("label",{class:F([`${o}-radio`,this.themeClass,this.rtlEnabled&&`${o}-radio--rtl`,this.mergedDisabled&&`${o}-radio--disabled`,this.renderSafeChecked&&`${o}-radio--checked`,this.focus&&`${o}-radio--focus`]),style:ce(this.cssVars)},[m("div",{class:F(`${o}-radio__dot-wrapper`)},[i[0]||(i[0]=N(" ",-1)),m("div",{class:F([`${o}-radio__dot`,this.renderSafeChecked&&`${o}-radio__dot--checked`])},null,2),m("input",{ref:"inputRef",type:"radio",class:F(`${o}-radio-input`),value:this.value,name:this.mergedName,checked:this.renderSafeChecked,disabled:this.mergedDisabled,onChange:this.handleRadioInputChange,onFocus:this.handleRadioInputFocus,onBlur:this.handleRadioInputBlur},null,42,Ze)],2),N(()=>he(t.default,l=>!l&&!n?null:(V(),P("div",{ref:"labelRef",class:F(`${o}-radio__label`)},[N(()=>l||n)],2))))],6)})()}});const ot=["value","name","checked","disabled","onChange","onFocus","onBlur"];var se=oe({name:"RadioButton",props:xe,setup:Ce,render(){const{mergedClsPrefix:t}=this;return V(),P("label",{class:F([`${t}-radio-button`,this.mergedDisabled&&`${t}-radio-button--disabled`,this.renderSafeChecked&&`${t}-radio-button--checked`,this.focus&&[`${t}-radio-button--focus`]])},[m("input",{ref:"inputRef",type:"radio",class:F(`${t}-radio-input`),value:this.value,name:this.mergedName,checked:this.renderSafeChecked,disabled:this.mergedDisabled,onChange:this.handleRadioInputChange,onFocus:this.handleRadioInputFocus,onBlur:this.handleRadioInputBlur},null,42,ot),m("div",{class:F(`${t}-radio-button__state-border`)},null,2),N(()=>he(this.$slots.default,o=>!o&&!this.label?null:(V(),P("div",{ref:"labelRef",class:F(`${t}-radio__label`)},[N(()=>o||this.label)],2))))],2)}}),rt=K("radio-group",`
 display: inline-block;
 font-size: var(--n-font-size);
`,[y("splitor",`
 display: inline-block;
 vertical-align: bottom;
 width: 1px;
 transition:
 background-color .3s var(--n-bezier),
 opacity .3s var(--n-bezier);
 background: var(--n-button-border-color);
 `,[T("checked",{backgroundColor:"var(--n-button-border-color-active)"}),T("disabled",{opacity:"var(--n-opacity-disabled)"})]),T("button-group",`
 white-space: nowrap;
 height: var(--n-height);
 line-height: var(--n-height);
 `,[K("radio-button",{height:"var(--n-height)",lineHeight:"var(--n-height)"}),y("splitor",{height:"var(--n-height)"})]),K("radio-button",`
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
 `,[K("radio-input",`
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
 `),y("state-border",`
 z-index: 1;
 pointer-events: none;
 position: absolute;
 box-shadow: var(--n-button-box-shadow);
 transition: box-shadow .3s var(--n-bezier);
 left: -1px;
 bottom: -1px;
 right: -1px;
 top: -1px;
 `),E("&:first-child",`
 border-top-left-radius: var(--n-button-border-radius);
 border-bottom-left-radius: var(--n-button-border-radius);
 border-left: 1px solid var(--n-button-border-color);
 `,[y("state-border",`
 border-top-left-radius: var(--n-button-border-radius);
 border-bottom-left-radius: var(--n-button-border-radius);
 `)]),E("&:last-child",`
 border-top-right-radius: var(--n-button-border-radius);
 border-bottom-right-radius: var(--n-button-border-radius);
 border-right: 1px solid var(--n-button-border-color);
 `,[y("state-border",`
 border-top-right-radius: var(--n-button-border-radius);
 border-bottom-right-radius: var(--n-button-border-radius);
 `)]),te("disabled",`
 cursor: pointer;
 `,[E("&:hover",[y("state-border",`
 transition: box-shadow .3s var(--n-bezier);
 box-shadow: var(--n-button-box-shadow-hover);
 `),te("checked",{color:"var(--n-button-text-color-hover)"})]),T("focus",[E("&:not(:active)",[y("state-border",{boxShadow:"var(--n-button-box-shadow-focus)"})])])]),T("checked",`
 background: var(--n-button-color-active);
 color: var(--n-button-text-color-active);
 border-color: var(--n-button-border-color-active);
 `),T("disabled",`
 cursor: not-allowed;
 opacity: var(--n-opacity-disabled);
 `)])]);const nt=["onFocusin","onFocusout"];function at(t,o,e){const n=[];let i=!1;for(let l=0;l<t.length;++l){const u=t[l],x=u.type?.name;x==="RadioButton"&&(i=!0);const v=u.props;if(x!=="RadioButton"){n.push(u);continue}if(l===0)n.push(u);else{const f=n[n.length-1].props,h=o===f.value,C=f.disabled,p=o===v.value,S=v.disabled,w=(h?2:0)+(C?0:1),$=(p?2:0)+(S?0:1),k={[`${e}-radio-group__splitor--disabled`]:C,[`${e}-radio-group__splitor--checked`]:h},z={[`${e}-radio-group__splitor--disabled`]:S,[`${e}-radio-group__splitor--checked`]:p},B=w<$?z:k;n.push((V(),P("div",{key:1,class:F([`${e}-radio-group__splitor`,B])},null,2)),u)}}return{children:n,isButtonGroup:i}}const it={...Q.props,name:String,options:Array,labelField:{type:String,default:"label"},valueField:{type:String,default:"value"},value:[String,Number,Boolean],defaultValue:{type:[String,Number,Boolean],default:null},size:String,disabled:{type:Boolean,default:void 0},"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array]};var lt=oe({name:"RadioGroup",props:it,setup(t){const o=H(null),{mergedSizeRef:e,mergedDisabledRef:n,nTriggerFormChange:i,nTriggerFormInput:l,nTriggerFormBlur:u,nTriggerFormFocus:x}=fe(t),{mergedClsPrefixRef:v,inlineThemeDisabled:f,mergedRtlRef:h}=re(t),C=Q("Radio","-radio-group",rt,me,t,v),p=H(t.defaultValue),S=Z(t,"value"),w=ve(S,p);function $(d){const{onUpdateValue:c,"onUpdate:value":g}=t;c&&L(c,d),g&&L(g,d),p.value=d,i(),l()}function k(d){const{value:c}=o;c&&(c.contains(d.relatedTarget)||x())}function z(d){const{value:c}=o;c&&(c.contains(d.relatedTarget)||u())}_e(we,{mergedClsPrefixRef:v,nameRef:Z(t,"name"),valueRef:w,disabledRef:n,mergedSizeRef:e,doUpdateValue:$});const B=pe("Radio",h,v),I=A(()=>{const{value:d}=e,{common:{cubicBezierEaseInOut:c},self:{buttonBorderColor:g,buttonBorderColorActive:M,buttonBorderRadius:a,buttonBoxShadow:r,buttonBoxShadowFocus:s,buttonBoxShadowHover:R,buttonColor:G,buttonColorActive:W,buttonTextColor:ye,buttonTextColorActive:Se,buttonTextColorHover:Re,opacityDisabled:ke,[J("buttonHeight",d)]:ze,[J("fontSize",d)]:$e}}=C.value;return{"--n-font-size":$e,"--n-bezier":c,"--n-button-border-color":g,"--n-button-border-color-active":M,"--n-button-border-radius":a,"--n-button-box-shadow":r,"--n-button-box-shadow-focus":s,"--n-button-box-shadow-hover":R,"--n-button-color":G,"--n-button-color-active":W,"--n-button-text-color":ye,"--n-button-text-color-hover":Re,"--n-button-text-color-active":Se,"--n-height":ze,"--n-opacity-disabled":ke}}),b=f?ge("radio-group",A(()=>e.value[0]),I,t):void 0;return{selfElRef:o,rtlEnabled:B,mergedClsPrefix:v,mergedValue:w,handleFocusout:z,handleFocusin:k,cssVars:f?void 0:I,themeClass:b?.themeClass,onRender:b?.onRender}},render(){const{mergedValue:t,mergedClsPrefix:o,handleFocusin:e,handleFocusout:n}=this,{options:i,labelField:l,valueField:u}=this.$props,{children:x,isButtonGroup:v}=at(i?i.map(f=>{const h=f[u];return V(),be(tt,{key:typeof h=="boolean"?`__n_${h}`:h,value:h,disabled:f.disabled,label:f[l]},null,8,["value","disabled","label"])}):Me(Ne(this)),t,o);return this.onRender?.(),V(),P("div",{onFocusin:e,onFocusout:n,ref:"selfElRef",class:F([`${o}-radio-group`,this.rtlEnabled&&`${o}-radio-group--rtl`,this.themeClass,v&&`${o}-radio-group--button-group`]),style:ce(this.cssVars)},[N(()=>x)],46,nt)}});const st=Object.freeze(["autoRecall","autoCapture","readOnly"]),j="recallPeerScope",dt=Object.freeze([...st,j]),ut=Object.freeze(["all","self"]);function de(t,o){return!!t&&Object.prototype.hasOwnProperty.call(t,o)&&t[o]!==null}function ct(t){return Object.keys(t||{}).some(o=>t[o]!==null)}function bt(t){return t?{text:"本会话",title:"点击交回全局"}:{text:"跟随全局",title:"当前跟随全局"}}function ue(t,o,e){return{...t||{},[o]:e}}function ft(t,o){return{...t||{},[o]:null}}function vt(t){return(t?!!t.enabled:!0)?{text:"全局开",tone:"on"}:{text:"全局关",tone:"off"}}function ht(t,o){const e=t?.effective||{};return o&&(e.autoRecall||e.autoCapture)?"ok":"idle"}function pt(t){const o=t?.state?.recall||{},e=t?.state?.capture||{},n=t?.probe?.events||{},i=(n["provider/before-request"]||0)+(n["agent/before-start"]||0),l=[`召回 ${o.turns||0}`,`写回 ${e.turns||0}`];return i&&l.push(`钩子 ${i}`),t?.probe?.lastAt&&l.push(new Date(t.probe.lastAt).toLocaleTimeString()),l.join(" · ")}function gt(t,o){const e=o||t?.peer||"";return e?o?{text:o,title:t?.peer?`会话归属 ${o}；对外门牌 ${t.peer}`:`会话归属 ${o}`}:{text:e,title:t?.peerSource==="merged"?t?.peerAgentDir?`${e}（合并记忆已开启；本会话助手：${t.peerAgentDir}）`:`${e}（合并记忆已开启，本机所有助手共用一个身份）`:e}:{text:"未绑定助手",title:t?.peerSource==="merged"?"合并记忆已开启，但这一段没拿到会话身份。":"拿不到会话路径，无法确定这一段属于哪个助手。"}}function mt({overrides:t,enabled:o,status:e}={}){const n=ct(t);return o?e&&!e.probe?{text:n?"有本会话设置；点小字交回全局。":"",warn:!1}:{text:n?"实心小字是本会话设置，点它交回全局。":"",warn:!1}:{text:"全局总闸关着，这里的开关不会生效。",warn:!0}}function xt(t){const o=je(t)||null,e=typeof t?.agentId=="string"?t.agentId.trim():"",n=t?.title||"";return{sessionKey:o,sessionOwner:e,title:n||(o?o.slice(-8):"无活动会话"),titleTitle:n||o||""}}function wt(t,o,e){const n={...t||{}};return o===j?n[j]=e?.recallScope||"all":e&&typeof e[o]=="boolean"?n[o]=e[o]:delete n[o],n}const Ct=["data-key"],yt={class:"row-label"},St={class:"row-control"},q={__name:"CardRow",props:{rowKey:{type:String,required:!0},label:{type:String,required:!0},overridden:{type:Boolean,default:!1},disabled:{type:Boolean,default:!1},wide:{type:Boolean,default:!1}},emits:["reset"],setup(t){const o=t,e=A(()=>bt(o.overridden));return(n,i)=>(V(),P("div",{class:Y(["row",{"row-wide":t.wide}]),"data-key":t.rowKey},[m("span",yt,U(t.label),1),_(O(Ue),{class:"row-note",text:"",size:"tiny",type:t.overridden?"primary":"default",disabled:t.disabled,title:e.value.title,"aria-pressed":t.overridden?"true":"false",onClick:i[0]||(i[0]=l=>n.$emit("reset"))},{default:D(()=>[ee(U(e.value.text),1)]),_:1},8,["type","disabled","title","aria-pressed"]),m("div",St,[Te(n.$slots,"default")])],10,Ct))}},Rt=["data-session"],kt={class:"head"},zt=["title"],$t={class:"ident"},Bt=["title"],_t={class:"rows"},Tt={class:"stats"},Ft=8e3,Vt={__name:"CardApp",setup(t){const o={...ie,common:{...ie.common,primaryColor:"#537D96",primaryColorHover:"#6A8FA6",primaryColorPressed:"#476B82",primaryColorSuppl:"#537D96"}},e=De({sessionKey:null,sessionOwner:"",title:"无活动会话",titleTitle:"",peerText:"—",peerTitle:"",pillText:"—",pillTone:"",dotTone:"idle",stats:"—",hintText:"",hintWarn:!1,effective:{},overrides:{},enabled:!0,globalStatus:null,hasModel:!1,writing:!1}),n=A(()=>!e.sessionKey||!e.hasModel||e.writing),i=A(()=>{const a={};for(const r of dt)a[r]=de(e.overrides,r);return a}),l=A(()=>e.effective[j]||"all");function u(a,r){e.hintText=a||"",e.hintWarn=!!r}function x(){e.hasModel=!1,e.effective={},e.overrides={},e.peerText="—",e.peerTitle="",e.stats="—",e.pillText="—",e.pillTone="",e.dotTone="idle",u("先打开一个对话，这张卡才会跟会话绑定。",!1)}function v(a){const r=xt(a);e.sessionKey=r.sessionKey,e.sessionOwner=r.sessionOwner,e.title=r.title,e.titleTitle=r.titleTitle}function f(a,r){r&&(e.globalStatus=r),e.hasModel=!0,e.effective={...a.effective||{}},e.overrides={...a.state?.overrides||{}};const s=e.globalStatus?!!e.globalStatus.enabled:!0;e.enabled=s;const R=vt(e.globalStatus);e.pillText=R.text,e.pillTone=R.tone,e.dotTone=ht(a,s),e.stats=pt(a);const G=gt(a,e.sessionOwner);e.peerText=G.text,e.peerTitle=G.title;const W=mt({overrides:e.overrides,enabled:s,status:e.globalStatus});u(W.text,W.warn)}async function h(a){try{return await le(`/status?session=${encodeURIComponent(a)}`)}catch{return null}}async function C(){if(!e.sessionKey&&(v(await We()),!e.sessionKey)){x();return}const a=e.sessionKey;try{const[r,s]=await Promise.all([h(a),le(`/session/${encodeURIComponent(a)}`)]);if(s?.ok===!1){e.hasModel=!1,e.stats="—",u("这个会话对不上任何状态（unknown session key），先重新选一次会话。",!0);return}f(s||{},r)}catch(r){u(String(r?.message||r),!0)}}function p(){return{effective:{...e.effective},overrides:{...e.overrides}}}async function S(a,r){const s=e.sessionKey;if(s){e.writing=!0;try{const R=await qe(`/session/${encodeURIComponent(s)}`,{overrides:a});if(R?.ok===!1)throw new Error(R.error||"写入失败");await C()}catch(R){e.effective=r.effective,e.overrides=r.overrides,u(String(R?.message||R),!0)}finally{e.writing=!1}}}async function w(a,r){if(n.value)return;const s=p(),R=typeof r=="boolean"?r:!e.effective[a];R!==!!e.effective[a]&&(e.effective={...e.effective,[a]:R},e.overrides=ue(e.overrides,a,R),await S({...e.overrides},s))}async function $(a){if(n.value||!ut.includes(a)||a===l.value)return;const r=p();e.effective={...e.effective,[j]:a},e.overrides=ue(e.overrides,j,a),await S({...e.overrides},r)}async function k(a){if(n.value||!de(e.overrides,a))return;const r=p();e.overrides=ft(e.overrides,a),e.effective=wt(e.effective,a,e.globalStatus),await S({...e.overrides},r)}let z=null;function B(){z&&clearInterval(z),z=null}function I(){B(),C(),z=setInterval(C,Ft)}function b(){document.hidden?B():I()}let d=null;const c=H(null);let g=null;function M(){const a=c.value;if(a)try{Ye.ui.resize({height:Math.ceil(a.getBoundingClientRect().height)})}catch{}}return Fe(()=>{Le(),document.addEventListener("visibilitychange",b),d=Ge(()=>{e.sessionKey=null,e.sessionOwner="",e.hasModel=!1,C()}),I(),typeof ResizeObserver=="function"&&c.value&&(g=new ResizeObserver(()=>M()),g.observe(c.value)),M()}),Ve(()=>{B(),document.removeEventListener("visibilitychange",b),d&&d(),g&&(g.disconnect(),g=null)}),(a,r)=>(V(),be(O(Ke),{abstract:"",locale:O(He),"theme-overrides":o},{default:D(()=>[m("div",{ref_key:"rootEl",ref:c,class:"card","data-session":e.sessionKey?"on":"off"},[m("header",kt,[m("span",{class:Y(["dot",e.dotTone]),"aria-hidden":"true"},null,2),m("span",{class:"title",title:e.titleTitle},U(e.title),9,zt),m("span",{class:Y(["pill",e.pillTone])},U(e.pillText),3)]),m("div",$t,[r[7]||(r[7]=m("span",{class:"ident-label"},"peer",-1)),m("span",{class:"ident-value",title:e.peerTitle},U(e.peerText),9,Bt)]),m("div",_t,[_(q,{"row-key":"autoRecall",label:"记忆召回",overridden:i.value.autoRecall,disabled:n.value,onReset:r[1]||(r[1]=s=>k("autoRecall"))},{default:D(()=>[_(O(X),{size:"small","aria-label":"记忆召回",value:!!e.effective.autoRecall,disabled:n.value,"onUpdate:value":r[0]||(r[0]=s=>w("autoRecall",s))},null,8,["value","disabled"])]),_:1},8,["overridden","disabled"]),_(q,{"row-key":"autoCapture",label:"写回",overridden:i.value.autoCapture,disabled:n.value,onReset:r[3]||(r[3]=s=>k("autoCapture"))},{default:D(()=>[_(O(X),{size:"small","aria-label":"写回",value:!!e.effective.autoCapture,disabled:n.value,"onUpdate:value":r[2]||(r[2]=s=>w("autoCapture",s))},null,8,["value","disabled"])]),_:1},8,["overridden","disabled"]),_(q,{"row-key":"readOnly",label:"只读",overridden:i.value.readOnly,disabled:n.value,onReset:r[5]||(r[5]=s=>k("readOnly"))},{default:D(()=>[_(O(X),{size:"small","aria-label":"只读",value:!!e.effective.readOnly,disabled:n.value,"onUpdate:value":r[4]||(r[4]=s=>w("readOnly",s))},null,8,["value","disabled"])]),_:1},8,["overridden","disabled"]),_(q,{"row-key":"recallPeerScope",label:"召回范围",wide:"",overridden:i.value.recallPeerScope,disabled:n.value,onReset:r[6]||(r[6]=s=>k("recallPeerScope"))},{default:D(()=>[_(O(lt),{size:"small","aria-label":"召回范围",value:l.value,disabled:n.value,"onUpdate:value":$},{default:D(()=>[_(O(se),{value:"all"},{default:D(()=>[...r[8]||(r[8]=[ee("跨门牌",-1)])]),_:1}),_(O(se),{value:"self"},{default:D(()=>[...r[9]||(r[9]=[ee("只看本机",-1)])]),_:1})]),_:1},8,["value","disabled"])]),_:1},8,["overridden","disabled"])]),m("p",Tt,U(e.stats),1),e.hintText?(V(),P("p",{key:0,class:Y(["hint",{warn:e.hintWarn}])},U(e.hintText),3)):Ie("",!0)],8,Rt)]),_:1},8,["locale"]))}};Oe(Vt).mount("#card-app");
