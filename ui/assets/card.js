import{i as $e,r as M,t as oe,d as ne,o as z,c as V,a as v,n as ve,b as I,e as he,p as Be,f as O,g as A,w as H,h as re,u as K,j as Te,k as W,l as Fe,m as Ie,F as Ve,q as De,s as Ee,v as Ae,x as Oe}from"./chunk-vue.js";import{d as Pe,c as se,a as j,b as B,e as S,f as P,g as ae,u as ie,h as pe,i as ge,j as le,k as Ue,l as q,m as Z,n as He,o as L,p as T,r as me,q as xe,s as we,t as X,B as Ke,v as de,z as Me,C as je}from"./chunk-theme.js";import{f as Ne,g as Le,s as Ge,a as We,o as qe,S as ue,c as Ye,b as Je,j as ee,d as Qe}from"./chunk-capture-view.js";import{hana as Xe}from"./sdk.js";var Ze={radioSizeSmall:"14px",radioSizeMedium:"16px",radioSizeLarge:"18px",labelPadding:"0 8px",labelFontWeight:"400"};function et(t){const{borderColor:o,primaryColor:e,baseColor:r,textColorDisabled:i,inputColorDisabled:l,textColor2:c,opacityDisabled:p,borderRadius:u,fontSizeSmall:h,fontSizeMedium:g,fontSizeLarge:k,heightSmall:w,heightMedium:C,heightLarge:x,lineHeight:R}=t;return{...Ze,labelLineHeight:R,buttonHeightSmall:w,buttonHeightMedium:C,buttonHeightLarge:x,fontSizeSmall:h,fontSizeMedium:g,fontSizeLarge:k,boxShadow:`inset 0 0 0 1px ${o}`,boxShadowActive:`inset 0 0 0 1px ${e}`,boxShadowFocus:`inset 0 0 0 1px ${e}, 0 0 0 2px ${se(e,{alpha:.2})}`,boxShadowHover:`inset 0 0 0 1px ${e}`,boxShadowDisabled:`inset 0 0 0 1px ${o}`,color:r,colorDisabled:l,colorActive:"#0000",textColor:c,textColorDisabled:i,dotColorActive:e,dotColorDisabled:o,buttonBorderColor:o,buttonBorderColorActive:e,buttonBorderColorHover:o,buttonColor:r,buttonColorActive:r,buttonTextColor:c,buttonTextColorActive:e,buttonTextColorHover:e,opacityDisabled:p,buttonBoxShadowFocus:`inset 0 0 0 1px ${e}, 0 0 0 2px ${se(e,{alpha:.3})}`,buttonBoxShadowHover:"inset 0 0 0 1px #0000",buttonBoxShadow:"inset 0 0 0 1px #0000",buttonBorderRadius:u}}const Ce={common:Pe,self:et};var tt=j("radio",`
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
`,[B("checked",[S("dot",`
 background-color: var(--n-color-active);
 `)]),S("dot-wrapper",`
 position: relative;
 flex-shrink: 0;
 flex-grow: 0;
 width: var(--n-radio-size);
 `),j("radio-input",`
 position: absolute;
 border: 0;
 width: 0;
 height: 0;
 opacity: 0;
 margin: 0;
 `),S("dot",`
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
 `,[P("&::before",`
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
 `),B("checked",{boxShadow:"var(--n-box-shadow-active)"},[P("&::before",`
 opacity: 1;
 transform: scale(1);
 `)])]),S("label",`
 color: var(--n-text-color);
 padding: var(--n-label-padding);
 font-weight: var(--n-label-font-weight);
 display: inline-block;
 transition: color .3s var(--n-bezier);
 `),ae("disabled",`
 cursor: pointer;
 `,[P("&:hover",[S("dot",{boxShadow:"var(--n-box-shadow-hover)"})]),B("focus",[P("&:not(:active)",[S("dot",{boxShadow:"var(--n-box-shadow-focus)"})])])]),B("disabled",`
 cursor: not-allowed;
 `,[S("dot",{boxShadow:"var(--n-box-shadow-disabled)",backgroundColor:"var(--n-color-disabled)"},[P("&::before",{backgroundColor:"var(--n-dot-color-disabled)"}),B("checked",`
 opacity: 1;
 `)]),S("label",{color:"var(--n-text-color-disabled)"}),j("radio-input",`
 cursor: not-allowed;
 `)])]);const ye={name:String,value:{type:[String,Number,Boolean],default:"on"},checked:{type:Boolean,default:void 0},defaultChecked:Boolean,disabled:{type:Boolean,default:void 0},label:String,size:String,onUpdateChecked:[Function,Array],"onUpdate:checked":[Function,Array],checkedValue:{type:Boolean,default:void 0}},Se=Ue("n-radio-group");function Re(t){const o=$e(Se,null),{mergedClsPrefixRef:e,mergedComponentPropsRef:r}=ie(t),i=pe(t,{mergedSize(b){const{size:d}=t;if(d!==void 0)return d;if(o){const{mergedSizeRef:{value:y}}=o;if(y!==void 0)return y}if(b)return b.mergedSize.value;const f=r?.value?.Radio?.size;return f||"medium"},mergedDisabled(b){return!!(t.disabled||o?.disabledRef.value||b?.disabled.value)}}),{mergedSizeRef:l,mergedDisabledRef:c}=i,p=M(null),u=M(null),h=M(t.defaultChecked),g=oe(t,"checked"),k=ge(g,h),w=le(()=>o?o.valueRef.value===t.value:k.value),C=le(()=>{const{name:b}=t;if(b!==void 0)return b;if(o)return o.nameRef.value}),x=M(!1);function R(){if(o){const{doUpdateValue:b}=o,{value:d}=t;q(b,d)}else{const{onUpdateChecked:b,"onUpdate:checked":d}=t,{nTriggerFormInput:f,nTriggerFormChange:y}=i;b&&q(b,!0),d&&q(d,!0),f(),y(),h.value=!0}}function F(){c.value||w.value||R()}function D(){F(),p.value&&(p.value.checked=w.value)}function _(){x.value=!1}function $(){x.value=!0}return{mergedClsPrefix:o?o.mergedClsPrefixRef:e,inputRef:p,labelRef:u,mergedName:C,mergedDisabled:c,renderSafeChecked:w,focus:x,mergedSize:l,handleRadioInputChange:D,handleRadioInputBlur:_,handleRadioInputFocus:$}}const ot=["value","name","checked","disabled","onChange","onFocus","onBlur"],rt={...Z.props,...ye};var at=ne({name:"Radio",props:rt,setup(t){const o=Re(t),e=Z("Radio","-radio",tt,Ce,t,o.mergedClsPrefix),r=I(()=>{const{mergedSize:{value:h}}=o,{common:{cubicBezierEaseInOut:g},self:{boxShadow:k,boxShadowActive:w,boxShadowDisabled:C,boxShadowFocus:x,boxShadowHover:R,color:F,colorDisabled:D,colorActive:_,textColor:$,textColorDisabled:b,dotColorActive:d,dotColorDisabled:f,labelPadding:y,labelLineHeight:U,labelFontWeight:E,[X("fontSize",h)]:N,[X("radioSize",h)]:n}}=e.value;return{"--n-bezier":g,"--n-label-line-height":U,"--n-label-font-weight":E,"--n-box-shadow":k,"--n-box-shadow-active":w,"--n-box-shadow-disabled":C,"--n-box-shadow-focus":x,"--n-box-shadow-hover":R,"--n-color":F,"--n-color-active":_,"--n-color-disabled":D,"--n-dot-color-active":d,"--n-dot-color-disabled":f,"--n-font-size":N,"--n-radio-size":n,"--n-text-color":$,"--n-text-color-disabled":b,"--n-label-padding":y}}),{inlineThemeDisabled:i,mergedClsPrefixRef:l,mergedRtlRef:c}=ie(t),p=xe("Radio",c,l),u=i?we("radio",I(()=>o.mergedSize.value[0]),r,t):void 0;return Object.assign(o,{rtlEnabled:p,cssVars:i?void 0:r,themeClass:u?.themeClass,onRender:u?.onRender})},render(){const{$slots:t,mergedClsPrefix:o,onRender:e,label:r}=this;return e?.(),(()=>{const i=He("f8c6901d8cd45c02");return z(),V("label",{class:T([`${o}-radio`,this.themeClass,this.rtlEnabled&&`${o}-radio--rtl`,this.mergedDisabled&&`${o}-radio--disabled`,this.renderSafeChecked&&`${o}-radio--checked`,this.focus&&`${o}-radio--focus`]),style:ve(this.cssVars)},[v("div",{class:T(`${o}-radio__dot-wrapper`)},[i[0]||(i[0]=L(" ",-1)),v("div",{class:T([`${o}-radio__dot`,this.renderSafeChecked&&`${o}-radio__dot--checked`])},null,2),v("input",{ref:"inputRef",type:"radio",class:T(`${o}-radio-input`),value:this.value,name:this.mergedName,checked:this.renderSafeChecked,disabled:this.mergedDisabled,onChange:this.handleRadioInputChange,onFocus:this.handleRadioInputFocus,onBlur:this.handleRadioInputBlur},null,42,ot)],2),L(()=>me(t.default,l=>!l&&!r?null:(z(),V("div",{ref:"labelRef",class:T(`${o}-radio__label`)},[L(()=>l||r)],2))))],6)})()}});const nt=["value","name","checked","disabled","onChange","onFocus","onBlur"];var ce=ne({name:"RadioButton",props:ye,setup:Re,render(){const{mergedClsPrefix:t}=this;return z(),V("label",{class:T([`${t}-radio-button`,this.mergedDisabled&&`${t}-radio-button--disabled`,this.renderSafeChecked&&`${t}-radio-button--checked`,this.focus&&[`${t}-radio-button--focus`]])},[v("input",{ref:"inputRef",type:"radio",class:T(`${t}-radio-input`),value:this.value,name:this.mergedName,checked:this.renderSafeChecked,disabled:this.mergedDisabled,onChange:this.handleRadioInputChange,onFocus:this.handleRadioInputFocus,onBlur:this.handleRadioInputBlur},null,42,nt),v("div",{class:T(`${t}-radio-button__state-border`)},null,2),L(()=>me(this.$slots.default,o=>!o&&!this.label?null:(z(),V("div",{ref:"labelRef",class:T(`${t}-radio__label`)},[L(()=>o||this.label)],2))))],2)}}),it=j("radio-group",`
 display: inline-block;
 font-size: var(--n-font-size);
`,[S("splitor",`
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
 `,[j("radio-button",{height:"var(--n-height)",lineHeight:"var(--n-height)"}),S("splitor",{height:"var(--n-height)"})]),j("radio-button",`
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
 `,[j("radio-input",`
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
 `),S("state-border",`
 z-index: 1;
 pointer-events: none;
 position: absolute;
 box-shadow: var(--n-button-box-shadow);
 transition: box-shadow .3s var(--n-bezier);
 left: -1px;
 bottom: -1px;
 right: -1px;
 top: -1px;
 `),P("&:first-child",`
 border-top-left-radius: var(--n-button-border-radius);
 border-bottom-left-radius: var(--n-button-border-radius);
 border-left: 1px solid var(--n-button-border-color);
 `,[S("state-border",`
 border-top-left-radius: var(--n-button-border-radius);
 border-bottom-left-radius: var(--n-button-border-radius);
 `)]),P("&:last-child",`
 border-top-right-radius: var(--n-button-border-radius);
 border-bottom-right-radius: var(--n-button-border-radius);
 border-right: 1px solid var(--n-button-border-color);
 `,[S("state-border",`
 border-top-right-radius: var(--n-button-border-radius);
 border-bottom-right-radius: var(--n-button-border-radius);
 `)]),ae("disabled",`
 cursor: pointer;
 `,[P("&:hover",[S("state-border",`
 transition: box-shadow .3s var(--n-bezier);
 box-shadow: var(--n-button-box-shadow-hover);
 `),ae("checked",{color:"var(--n-button-text-color-hover)"})]),B("focus",[P("&:not(:active)",[S("state-border",{boxShadow:"var(--n-button-box-shadow-focus)"})])])]),B("checked",`
 background: var(--n-button-color-active);
 color: var(--n-button-text-color-active);
 border-color: var(--n-button-border-color-active);
 `),B("disabled",`
 cursor: not-allowed;
 opacity: var(--n-opacity-disabled);
 `)])]);const st=["onFocusin","onFocusout"];function lt(t,o,e){const r=[];let i=!1;for(let l=0;l<t.length;++l){const c=t[l],p=c.type?.name;p==="RadioButton"&&(i=!0);const u=c.props;if(p!=="RadioButton"){r.push(c);continue}if(l===0)r.push(c);else{const h=r[r.length-1].props,g=o===h.value,k=h.disabled,w=o===u.value,C=u.disabled,x=(g?2:0)+(k?0:1),R=(w?2:0)+(C?0:1),F={[`${e}-radio-group__splitor--disabled`]:k,[`${e}-radio-group__splitor--checked`]:g},D={[`${e}-radio-group__splitor--disabled`]:C,[`${e}-radio-group__splitor--checked`]:w},_=x<R?D:F;r.push((z(),V("div",{key:1,class:T([`${e}-radio-group__splitor`,_])},null,2)),c)}}return{children:r,isButtonGroup:i}}const dt={...Z.props,name:String,options:Array,labelField:{type:String,default:"label"},valueField:{type:String,default:"value"},value:[String,Number,Boolean],defaultValue:{type:[String,Number,Boolean],default:null},size:String,disabled:{type:Boolean,default:void 0},"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array]};var ut=ne({name:"RadioGroup",props:dt,setup(t){const o=M(null),{mergedSizeRef:e,mergedDisabledRef:r,nTriggerFormChange:i,nTriggerFormInput:l,nTriggerFormBlur:c,nTriggerFormFocus:p}=pe(t),{mergedClsPrefixRef:u,inlineThemeDisabled:h,mergedRtlRef:g}=ie(t),k=Z("Radio","-radio-group",it,Ce,t,u),w=M(t.defaultValue),C=oe(t,"value"),x=ge(C,w);function R(d){const{onUpdateValue:f,"onUpdate:value":y}=t;f&&q(f,d),y&&q(y,d),w.value=d,i(),l()}function F(d){const{value:f}=o;f&&(f.contains(d.relatedTarget)||p())}function D(d){const{value:f}=o;f&&(f.contains(d.relatedTarget)||c())}Be(Se,{mergedClsPrefixRef:u,nameRef:oe(t,"name"),valueRef:x,disabledRef:r,mergedSizeRef:e,doUpdateValue:R});const _=xe("Radio",g,u),$=I(()=>{const{value:d}=e,{common:{cubicBezierEaseInOut:f},self:{buttonBorderColor:y,buttonBorderColorActive:U,buttonBorderRadius:E,buttonBoxShadow:N,buttonBoxShadowFocus:n,buttonBoxShadowHover:a,buttonColor:s,buttonColorActive:m,buttonTextColor:Y,buttonTextColorActive:J,buttonTextColorHover:Q,opacityDisabled:ke,[X("buttonHeight",d)]:ze,[X("fontSize",d)]:_e}}=k.value;return{"--n-font-size":_e,"--n-bezier":f,"--n-button-border-color":y,"--n-button-border-color-active":U,"--n-button-border-radius":E,"--n-button-box-shadow":N,"--n-button-box-shadow-focus":n,"--n-button-box-shadow-hover":a,"--n-button-color":s,"--n-button-color-active":m,"--n-button-text-color":Y,"--n-button-text-color-hover":Q,"--n-button-text-color-active":J,"--n-height":ze,"--n-opacity-disabled":ke}}),b=h?we("radio-group",I(()=>e.value[0]),$,t):void 0;return{selfElRef:o,rtlEnabled:_,mergedClsPrefix:u,mergedValue:x,handleFocusout:D,handleFocusin:F,cssVars:h?void 0:$,themeClass:b?.themeClass,onRender:b?.onRender}},render(){const{mergedValue:t,mergedClsPrefix:o,handleFocusin:e,handleFocusout:r}=this,{options:i,labelField:l,valueField:c}=this.$props,{children:p,isButtonGroup:u}=lt(i?i.map(h=>{const g=h[c];return z(),he(at,{key:typeof g=="boolean"?`__n_${g}`:g,value:g,disabled:h.disabled,label:h[l]},null,8,["value","disabled","label"])}):Ne(Le(this)),t,o);return this.onRender?.(),z(),V("div",{onFocusin:e,onFocusout:r,ref:"selfElRef",class:T([`${o}-radio-group`,this.rtlEnabled&&`${o}-radio-group--rtl`,this.themeClass,u&&`${o}-radio-group--button-group`]),style:ve(this.cssVars)},[L(()=>p)],46,st)}});const ct=Object.freeze(["autoRecall","readOnly"]),G="recallPeerScope",bt=Object.freeze([...ct,G]),ft=Object.freeze(["all","self"]);function be(t,o){return!!t&&Object.prototype.hasOwnProperty.call(t,o)&&t[o]!==null}function vt(t){return Object.keys(t||{}).some(o=>t[o]!==null)}function ht(t){return t?{text:"本会话",title:"点击交回全局"}:{text:"跟随全局",title:"当前跟随全局"}}function fe(t,o,e){return{...t||{},[o]:e}}function pt(t,o){return{...t||{},[o]:null}}function gt(t){return(t?!!t.enabled:!0)?{text:"全局开",tone:"on"}:{text:"全局关",tone:"off"}}function mt(t,o){const e=t?.effective||{};return o&&(e.autoRecall||e.autoCapture)?"ok":"idle"}function xt(t){const o=t?.state?.recall||{},e=t?.state?.capture||{},r=t?.probe?.events||{},i=(r["provider/before-request"]||0)+(r["agent/before-start"]||0),l=[`召回 ${o.turns||0}`,`写回 ${e.turns||0}`];return i&&l.push(`钩子 ${i}`),t?.probe?.lastAt&&l.push(new Date(t.probe.lastAt).toLocaleTimeString()),l.join(" · ")}function wt(t,o){const e=o||t?.peer||"";return e?o?{text:o,title:t?.peer?`会话归属 ${o}；对外门牌 ${t.peer}`:`会话归属 ${o}`}:{text:e,title:t?.peerSource==="merged"?t?.peerAgentDir?`${e}（合并记忆已开启；本会话助手：${t.peerAgentDir}）`:`${e}（合并记忆已开启，本机所有助手共用一个身份）`:e}:{text:"未绑定助手",title:t?.peerSource==="merged"?"合并记忆已开启，但这一段没拿到会话身份。":"拿不到会话路径，无法确定这一段属于哪个助手。"}}function Ct({overrides:t,enabled:o,status:e}={}){const r=vt(t);return o?e&&!e.probe?{text:r?"有本会话设置；点小字交回全局。":"",warn:!1}:{text:r?"实心小字是本会话设置，点它交回全局。":"",warn:!1}:{text:"全局总闸关着，这里的开关不会生效。",warn:!0}}function yt(t){const o=Ge(t)||null,e=typeof t?.agentId=="string"?t.agentId.trim():"",r=t?.title||"";return{sessionKey:o,sessionOwner:e,title:r||(o?o.slice(-8):"无活动会话"),titleTitle:r||o||""}}function St(t,o,e){const r={...t||{}};return o===G?r[G]=e?.recallScope||"all":e&&typeof e[o]=="boolean"?r[o]=e[o]:delete r[o],r}const Rt=["data-key"],kt={class:"row-label"},zt={class:"row-control"},te={__name:"CardRow",props:{rowKey:{type:String,required:!0},label:{type:String,required:!0},overridden:{type:Boolean,default:!1},disabled:{type:Boolean,default:!1},wide:{type:Boolean,default:!1}},emits:["reset"],setup(t){const o=t,e=I(()=>ht(o.overridden));return(r,i)=>(z(),V("div",{class:W(["row",{"row-wide":t.wide}]),"data-key":t.rowKey},[v("span",kt,O(t.label),1),A(K(Ke),{class:"row-note",text:"",size:"tiny",type:t.overridden?"primary":"default",disabled:t.disabled,title:e.value.title,"aria-pressed":t.overridden?"true":"false",onClick:i[0]||(i[0]=l=>r.$emit("reset"))},{default:H(()=>[re(O(e.value.text),1)]),_:1},8,["type","disabled","title","aria-pressed"]),v("div",zt,[Te(r.$slots,"default")])],10,Rt))}},_t=["data-session"],$t={class:"head"},Bt=["title"],Tt={class:"ident"},Ft=["title"],It={class:"rows"},Vt=["aria-disabled"],Dt=["data-row"],Et={class:"capture-label"},At={class:"capture-value"},Ot={class:"stats"},Pt=8e3,Ut={__name:"CardApp",setup(t){const o={...de,common:{...de.common,primaryColor:"#537D96",primaryColorHover:"#6A8FA6",primaryColorPressed:"#476B82",primaryColorSuppl:"#537D96"}},e=Ae({sessionKey:null,sessionOwner:"",title:"无活动会话",titleTitle:"",peerText:"—",peerTitle:"",pillText:"—",pillTone:"",dotTone:"idle",stats:"—",hintText:"",hintWarn:!1,effective:{},overrides:{},enabled:!0,globalStatus:null,hasModel:!1,writing:!1,capture:{active:!1,autoCapture:!1,data:null}}),r=I(()=>!e.sessionKey||!e.hasModel||e.writing),i=I(()=>!e.capture.active||!e.capture.autoCapture),l=I(()=>Ye(e.capture.data,{active:e.capture.active,autoCapture:e.capture.autoCapture})),c=I(()=>{const n={};for(const a of bt)n[a]=be(e.overrides,a);return n}),p=I(()=>e.effective[G]||"all");function u(n,a){e.hintText=n||"",e.hintWarn=!!a}function h(){e.hasModel=!1,e.effective={},e.overrides={},e.peerText="—",e.peerTitle="",e.capture={active:!1,autoCapture:!1,data:null},e.stats="—",e.pillText="—",e.pillTone="",e.dotTone="idle",u("先打开一个对话，这张卡才会跟会话绑定。",!1)}function g(n){const a=yt(n);e.sessionKey=a.sessionKey,e.sessionOwner=a.sessionOwner,e.title=a.title,e.titleTitle=a.titleTitle}function k(n,a,s){a&&(e.globalStatus=a),s&&typeof s=="object"&&(e.capture={active:s.active===!0,autoCapture:s.autoCapture===!0,data:s}),e.hasModel=!0,e.effective={...n.effective||{}},e.overrides={...n.state?.overrides||{}};const m=e.globalStatus?!!e.globalStatus.enabled:!0;e.enabled=m;const Y=gt(e.globalStatus);e.pillText=Y.text,e.pillTone=Y.tone,e.dotTone=mt(n,m),e.stats=xt(n);const J=wt(n,e.sessionOwner);e.peerText=J.text,e.peerTitle=J.title;const Q=Ct({overrides:e.overrides,enabled:m,status:e.globalStatus});u(Q.text,Q.warn)}async function w(n){try{return await ee(`/status?session=${encodeURIComponent(n)}`)}catch{return null}}async function C(){if(!e.sessionKey&&(g(await Je()),!e.sessionKey)){h();return}const n=e.sessionKey;try{const[a,s,m]=await Promise.all([w(n),ee(`/session/${encodeURIComponent(n)}`),ee(`/capture-status?sessionId=${encodeURIComponent(n)}`).catch(()=>null)]);if(s?.ok===!1){e.hasModel=!1,e.stats="—",e.capture={active:!1,autoCapture:!1,data:null},u("这个会话对不上任何状态（unknown session key），先重新选一次会话。",!0);return}k(s||{},a,m)}catch(a){u(String(a?.message||a),!0)}}function x(){return{effective:{...e.effective},overrides:{...e.overrides}}}async function R(n,a){const s=e.sessionKey;if(s){e.writing=!0;try{const m=await Qe(`/session/${encodeURIComponent(s)}`,{overrides:n});if(m?.ok===!1)throw new Error(m.error||"写入失败");await C()}catch(m){e.effective=a.effective,e.overrides=a.overrides,u(String(m?.message||m),!0)}finally{e.writing=!1}}}async function F(n,a){if(r.value)return;const s=x(),m=typeof a=="boolean"?a:!e.effective[n];m!==!!e.effective[n]&&(e.effective={...e.effective,[n]:m},e.overrides=fe(e.overrides,n,m),await R({...e.overrides},s))}async function D(n){if(r.value||!ft.includes(n)||n===p.value)return;const a=x();e.effective={...e.effective,[G]:n},e.overrides=fe(e.overrides,G,n),await R({...e.overrides},a)}async function _(n){if(r.value||!be(e.overrides,n))return;const a=x();e.overrides=pt(e.overrides,n),e.effective=St(e.effective,n,e.globalStatus),await R({...e.overrides},a)}let $=null;function b(){$&&clearInterval($),$=null}function d(){b(),C(),$=setInterval(C,Pt)}function f(){document.hidden?b():d()}let y=null;const U=M(null);let E=null;function N(){const n=U.value;if(n)try{Xe.ui.resize({height:Math.ceil(n.getBoundingClientRect().height)})}catch{}}return Fe(()=>{We(),document.addEventListener("visibilitychange",f),y=qe(()=>{e.sessionKey=null,e.sessionOwner="",e.hasModel=!1,C()}),d(),typeof ResizeObserver=="function"&&U.value&&(E=new ResizeObserver(()=>N()),E.observe(U.value)),N()}),Ie(()=>{b(),document.removeEventListener("visibilitychange",f),y&&y(),E&&(E.disconnect(),E=null)}),(n,a)=>(z(),he(K(je),{abstract:"",locale:K(Me),"theme-overrides":o},{default:H(()=>[v("div",{ref_key:"rootEl",ref:U,class:"card","data-session":e.sessionKey?"on":"off"},[v("header",$t,[v("span",{class:W(["dot",e.dotTone]),"aria-hidden":"true"},null,2),v("span",{class:"title",title:e.titleTitle},O(e.title),9,Bt),v("span",{class:W(["pill",e.pillTone])},O(e.pillText),3)]),v("div",Tt,[a[5]||(a[5]=v("span",{class:"ident-label"},"peer",-1)),v("span",{class:"ident-value",title:e.peerTitle},O(e.peerText),9,Ft)]),v("div",It,[A(te,{"row-key":"autoRecall",label:"记忆召回",overridden:c.value.autoRecall,disabled:r.value,onReset:a[1]||(a[1]=s=>_("autoRecall"))},{default:H(()=>[A(K(ue),{size:"small","aria-label":"记忆召回",value:!!e.effective.autoRecall,disabled:r.value,"onUpdate:value":a[0]||(a[0]=s=>F("autoRecall",s))},null,8,["value","disabled"])]),_:1},8,["overridden","disabled"]),A(te,{"row-key":"readOnly",label:"只读",overridden:c.value.readOnly,disabled:r.value,onReset:a[3]||(a[3]=s=>_("readOnly"))},{default:H(()=>[A(K(ue),{size:"small","aria-label":"只读",value:!!e.effective.readOnly,disabled:r.value,"onUpdate:value":a[2]||(a[2]=s=>F("readOnly",s))},null,8,["value","disabled"])]),_:1},8,["overridden","disabled"]),A(te,{"row-key":"recallPeerScope",label:"召回范围",wide:"",overridden:c.value.recallPeerScope,disabled:r.value,onReset:a[4]||(a[4]=s=>_("recallPeerScope"))},{default:H(()=>[A(K(ut),{size:"small","aria-label":"召回范围",value:p.value,disabled:r.value,"onUpdate:value":D},{default:H(()=>[A(K(ce),{value:"all"},{default:H(()=>[...a[6]||(a[6]=[re("跨门牌",-1)])]),_:1}),A(K(ce),{value:"self"},{default:H(()=>[...a[7]||(a[7]=[re("只看本机",-1)])]),_:1})]),_:1},8,["value","disabled"])]),_:1},8,["overridden","disabled"])]),v("div",{class:W(["capture",{off:i.value}]),"aria-disabled":i.value?"true":"false"},[(z(!0),V(Ve,null,De(l.value,s=>(z(),V("span",{key:s.key,class:"capture-row","data-row":s.key},[v("span",Et,O(s.label),1),v("span",At,O(s.value),1)],8,Dt))),128))],10,Vt),v("p",Ot,O(e.stats),1),e.hintText?(z(),V("p",{key:0,class:W(["hint",{warn:e.hintWarn}])},O(e.hintText),3)):Ee("",!0)],8,_t)]),_:1},8,["locale"]))}};Oe(Ut).mount("#card-app");
