import{i as _e,r as U,t as X,d as te,o as F,c as P,a as m,n as ce,b as A,e as be,p as Be,f as H,g as I,w as O,h as Z,u as E,j as Te,k as q,l as Fe,m as Ve,q as Ie,s as De,v as Oe}from"./chunk-vue.js";import{d as Ee,c as re,a as K,b as B,e as C,f as D,g as ee,u as oe,h as fe,i as ve,j as ne,k as Ae,l as L,m as J,n as Pe,o as N,p as T,r as he,q as pe,s as ge,t as Y,B as He,v as ae,z as Ue,C as Ke}from"./chunk-theme.js";import{f as Me,g as Ne,s as je,a as Le,o as Ge,S as ie,c as We,j as se,b as qe}from"./chunk-api.js";import{hana as Ye}from"./sdk.js";var Je={radioSizeSmall:"14px",radioSizeMedium:"16px",radioSizeLarge:"18px",labelPadding:"0 8px",labelFontWeight:"400"};function Qe(t){const{borderColor:o,primaryColor:e,baseColor:r,textColorDisabled:i,inputColorDisabled:s,textColor2:d,opacityDisabled:x,borderRadius:v,fontSizeSmall:f,fontSizeMedium:h,fontSizeLarge:w,heightSmall:p,heightMedium:S,heightLarge:y,lineHeight:z}=t;return{...Je,labelLineHeight:z,buttonHeightSmall:p,buttonHeightMedium:S,buttonHeightLarge:y,fontSizeSmall:f,fontSizeMedium:h,fontSizeLarge:w,boxShadow:`inset 0 0 0 1px ${o}`,boxShadowActive:`inset 0 0 0 1px ${e}`,boxShadowFocus:`inset 0 0 0 1px ${e}, 0 0 0 2px ${re(e,{alpha:.2})}`,boxShadowHover:`inset 0 0 0 1px ${e}`,boxShadowDisabled:`inset 0 0 0 1px ${o}`,color:r,colorDisabled:s,colorActive:"#0000",textColor:d,textColorDisabled:i,dotColorActive:e,dotColorDisabled:o,buttonBorderColor:o,buttonBorderColorActive:e,buttonBorderColorHover:o,buttonColor:r,buttonColorActive:r,buttonTextColor:d,buttonTextColorActive:e,buttonTextColorHover:e,opacityDisabled:x,buttonBoxShadowFocus:`inset 0 0 0 1px ${e}, 0 0 0 2px ${re(e,{alpha:.3})}`,buttonBoxShadowHover:"inset 0 0 0 1px #0000",buttonBoxShadow:"inset 0 0 0 1px #0000",buttonBorderRadius:v}}const me={common:Ee,self:Qe};var Xe=K("radio",`
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
 `),K("radio-input",`
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
 `),ee("disabled",`
 cursor: pointer;
 `,[D("&:hover",[C("dot",{boxShadow:"var(--n-box-shadow-hover)"})]),B("focus",[D("&:not(:active)",[C("dot",{boxShadow:"var(--n-box-shadow-focus)"})])])]),B("disabled",`
 cursor: not-allowed;
 `,[C("dot",{boxShadow:"var(--n-box-shadow-disabled)",backgroundColor:"var(--n-color-disabled)"},[D("&::before",{backgroundColor:"var(--n-dot-color-disabled)"}),B("checked",`
 opacity: 1;
 `)]),C("label",{color:"var(--n-text-color-disabled)"}),K("radio-input",`
 cursor: not-allowed;
 `)])]);const xe={name:String,value:{type:[String,Number,Boolean],default:"on"},checked:{type:Boolean,default:void 0},defaultChecked:Boolean,disabled:{type:Boolean,default:void 0},label:String,size:String,onUpdateChecked:[Function,Array],"onUpdate:checked":[Function,Array],checkedValue:{type:Boolean,default:void 0}},we=Ae("n-radio-group");function ye(t){const o=_e(we,null),{mergedClsPrefixRef:e,mergedComponentPropsRef:r}=oe(t),i=fe(t,{mergedSize(b){const{size:l}=t;if(l!==void 0)return l;if(o){const{mergedSizeRef:{value:g}}=o;if(g!==void 0)return g}if(b)return b.mergedSize.value;const u=r?.value?.Radio?.size;return u||"medium"},mergedDisabled(b){return!!(t.disabled||o?.disabledRef.value||b?.disabled.value)}}),{mergedSizeRef:s,mergedDisabledRef:d}=i,x=U(null),v=U(null),f=U(t.defaultChecked),h=X(t,"checked"),w=ve(h,f),p=ne(()=>o?o.valueRef.value===t.value:w.value),S=ne(()=>{const{name:b}=t;if(b!==void 0)return b;if(o)return o.nameRef.value}),y=U(!1);function z(){if(o){const{doUpdateValue:b}=o,{value:l}=t;L(b,l)}else{const{onUpdateChecked:b,"onUpdate:checked":l}=t,{nTriggerFormInput:u,nTriggerFormChange:g}=i;b&&L(b,!0),l&&L(l,!0),u(),g(),f.value=!0}}function $(){d.value||p.value||z()}function k(){$(),x.value&&(x.value.checked=p.value)}function _(){y.value=!1}function V(){y.value=!0}return{mergedClsPrefix:o?o.mergedClsPrefixRef:e,inputRef:x,labelRef:v,mergedName:S,mergedDisabled:d,renderSafeChecked:p,focus:y,mergedSize:s,handleRadioInputChange:k,handleRadioInputBlur:_,handleRadioInputFocus:V}}const Ze=["value","name","checked","disabled","onChange","onFocus","onBlur"],et={...J.props,...xe};var tt=te({name:"Radio",props:et,setup(t){const o=ye(t),e=J("Radio","-radio",Xe,me,t,o.mergedClsPrefix),r=A(()=>{const{mergedSize:{value:f}}=o,{common:{cubicBezierEaseInOut:h},self:{boxShadow:w,boxShadowActive:p,boxShadowDisabled:S,boxShadowFocus:y,boxShadowHover:z,color:$,colorDisabled:k,colorActive:_,textColor:V,textColorDisabled:b,dotColorActive:l,dotColorDisabled:u,labelPadding:g,labelLineHeight:M,labelFontWeight:a,[Y("fontSize",f)]:n,[Y("radioSize",f)]:c}}=e.value;return{"--n-bezier":h,"--n-label-line-height":M,"--n-label-font-weight":a,"--n-box-shadow":w,"--n-box-shadow-active":p,"--n-box-shadow-disabled":S,"--n-box-shadow-focus":y,"--n-box-shadow-hover":z,"--n-color":$,"--n-color-active":_,"--n-color-disabled":k,"--n-dot-color-active":l,"--n-dot-color-disabled":u,"--n-font-size":n,"--n-radio-size":c,"--n-text-color":V,"--n-text-color-disabled":b,"--n-label-padding":g}}),{inlineThemeDisabled:i,mergedClsPrefixRef:s,mergedRtlRef:d}=oe(t),x=pe("Radio",d,s),v=i?ge("radio",A(()=>o.mergedSize.value[0]),r,t):void 0;return Object.assign(o,{rtlEnabled:x,cssVars:i?void 0:r,themeClass:v?.themeClass,onRender:v?.onRender})},render(){const{$slots:t,mergedClsPrefix:o,onRender:e,label:r}=this;return e?.(),(()=>{const i=Pe("f8c6901d8cd45c02");return F(),P("label",{class:T([`${o}-radio`,this.themeClass,this.rtlEnabled&&`${o}-radio--rtl`,this.mergedDisabled&&`${o}-radio--disabled`,this.renderSafeChecked&&`${o}-radio--checked`,this.focus&&`${o}-radio--focus`]),style:ce(this.cssVars)},[m("div",{class:T(`${o}-radio__dot-wrapper`)},[i[0]||(i[0]=N(" ",-1)),m("div",{class:T([`${o}-radio__dot`,this.renderSafeChecked&&`${o}-radio__dot--checked`])},null,2),m("input",{ref:"inputRef",type:"radio",class:T(`${o}-radio-input`),value:this.value,name:this.mergedName,checked:this.renderSafeChecked,disabled:this.mergedDisabled,onChange:this.handleRadioInputChange,onFocus:this.handleRadioInputFocus,onBlur:this.handleRadioInputBlur},null,42,Ze)],2),N(()=>he(t.default,s=>!s&&!r?null:(F(),P("div",{ref:"labelRef",class:T(`${o}-radio__label`)},[N(()=>s||r)],2))))],6)})()}});const ot=["value","name","checked","disabled","onChange","onFocus","onBlur"];var le=te({name:"RadioButton",props:xe,setup:ye,render(){const{mergedClsPrefix:t}=this;return F(),P("label",{class:T([`${t}-radio-button`,this.mergedDisabled&&`${t}-radio-button--disabled`,this.renderSafeChecked&&`${t}-radio-button--checked`,this.focus&&[`${t}-radio-button--focus`]])},[m("input",{ref:"inputRef",type:"radio",class:T(`${t}-radio-input`),value:this.value,name:this.mergedName,checked:this.renderSafeChecked,disabled:this.mergedDisabled,onChange:this.handleRadioInputChange,onFocus:this.handleRadioInputFocus,onBlur:this.handleRadioInputBlur},null,42,ot),m("div",{class:T(`${t}-radio-button__state-border`)},null,2),N(()=>he(this.$slots.default,o=>!o&&!this.label?null:(F(),P("div",{ref:"labelRef",class:T(`${t}-radio__label`)},[N(()=>o||this.label)],2))))],2)}}),rt=K("radio-group",`
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
 `,[K("radio-button",{height:"var(--n-height)",lineHeight:"var(--n-height)"}),C("splitor",{height:"var(--n-height)"})]),K("radio-button",`
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
 `)]),ee("disabled",`
 cursor: pointer;
 `,[D("&:hover",[C("state-border",`
 transition: box-shadow .3s var(--n-bezier);
 box-shadow: var(--n-button-box-shadow-hover);
 `),ee("checked",{color:"var(--n-button-text-color-hover)"})]),B("focus",[D("&:not(:active)",[C("state-border",{boxShadow:"var(--n-button-box-shadow-focus)"})])])]),B("checked",`
 background: var(--n-button-color-active);
 color: var(--n-button-text-color-active);
 border-color: var(--n-button-border-color-active);
 `),B("disabled",`
 cursor: not-allowed;
 opacity: var(--n-opacity-disabled);
 `)])]);const nt=["onFocusin","onFocusout"];function at(t,o,e){const r=[];let i=!1;for(let s=0;s<t.length;++s){const d=t[s],x=d.type?.name;x==="RadioButton"&&(i=!0);const v=d.props;if(x!=="RadioButton"){r.push(d);continue}if(s===0)r.push(d);else{const f=r[r.length-1].props,h=o===f.value,w=f.disabled,p=o===v.value,S=v.disabled,y=(h?2:0)+(w?0:1),z=(p?2:0)+(S?0:1),$={[`${e}-radio-group__splitor--disabled`]:w,[`${e}-radio-group__splitor--checked`]:h},k={[`${e}-radio-group__splitor--disabled`]:S,[`${e}-radio-group__splitor--checked`]:p},_=y<z?k:$;r.push((F(),P("div",{key:1,class:T([`${e}-radio-group__splitor`,_])},null,2)),d)}}return{children:r,isButtonGroup:i}}const it={...J.props,name:String,options:Array,labelField:{type:String,default:"label"},valueField:{type:String,default:"value"},value:[String,Number,Boolean],defaultValue:{type:[String,Number,Boolean],default:null},size:String,disabled:{type:Boolean,default:void 0},"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array]};var st=te({name:"RadioGroup",props:it,setup(t){const o=U(null),{mergedSizeRef:e,mergedDisabledRef:r,nTriggerFormChange:i,nTriggerFormInput:s,nTriggerFormBlur:d,nTriggerFormFocus:x}=fe(t),{mergedClsPrefixRef:v,inlineThemeDisabled:f,mergedRtlRef:h}=oe(t),w=J("Radio","-radio-group",rt,me,t,v),p=U(t.defaultValue),S=X(t,"value"),y=ve(S,p);function z(l){const{onUpdateValue:u,"onUpdate:value":g}=t;u&&L(u,l),g&&L(g,l),p.value=l,i(),s()}function $(l){const{value:u}=o;u&&(u.contains(l.relatedTarget)||x())}function k(l){const{value:u}=o;u&&(u.contains(l.relatedTarget)||d())}Be(we,{mergedClsPrefixRef:v,nameRef:X(t,"name"),valueRef:y,disabledRef:r,mergedSizeRef:e,doUpdateValue:z});const _=pe("Radio",h,v),V=A(()=>{const{value:l}=e,{common:{cubicBezierEaseInOut:u},self:{buttonBorderColor:g,buttonBorderColorActive:M,buttonBorderRadius:a,buttonBoxShadow:n,buttonBoxShadowFocus:c,buttonBoxShadowHover:R,buttonColor:G,buttonColorActive:W,buttonTextColor:Ce,buttonTextColorActive:Se,buttonTextColorHover:Re,opacityDisabled:ke,[Y("buttonHeight",l)]:ze,[Y("fontSize",l)]:$e}}=w.value;return{"--n-font-size":$e,"--n-bezier":u,"--n-button-border-color":g,"--n-button-border-color-active":M,"--n-button-border-radius":a,"--n-button-box-shadow":n,"--n-button-box-shadow-focus":c,"--n-button-box-shadow-hover":R,"--n-button-color":G,"--n-button-color-active":W,"--n-button-text-color":Ce,"--n-button-text-color-hover":Re,"--n-button-text-color-active":Se,"--n-height":ze,"--n-opacity-disabled":ke}}),b=f?ge("radio-group",A(()=>e.value[0]),V,t):void 0;return{selfElRef:o,rtlEnabled:_,mergedClsPrefix:v,mergedValue:y,handleFocusout:k,handleFocusin:$,cssVars:f?void 0:V,themeClass:b?.themeClass,onRender:b?.onRender}},render(){const{mergedValue:t,mergedClsPrefix:o,handleFocusin:e,handleFocusout:r}=this,{options:i,labelField:s,valueField:d}=this.$props,{children:x,isButtonGroup:v}=at(i?i.map(f=>{const h=f[d];return F(),be(tt,{key:typeof h=="boolean"?`__n_${h}`:h,value:h,disabled:f.disabled,label:f[s]},null,8,["value","disabled","label"])}):Me(Ne(this)),t,o);return this.onRender?.(),F(),P("div",{onFocusin:e,onFocusout:r,ref:"selfElRef",class:T([`${o}-radio-group`,this.rtlEnabled&&`${o}-radio-group--rtl`,this.themeClass,v&&`${o}-radio-group--button-group`]),style:ce(this.cssVars)},[N(()=>x)],46,nt)}});const lt=Object.freeze(["autoRecall","readOnly"]),j="recallPeerScope",dt=Object.freeze([...lt,j]),ut=Object.freeze(["all","self"]);function de(t,o){return!!t&&Object.prototype.hasOwnProperty.call(t,o)&&t[o]!==null}function ct(t){return Object.keys(t||{}).some(o=>t[o]!==null)}function bt(t){return t?{text:"本会话",title:"点击交回全局"}:{text:"跟随全局",title:"当前跟随全局"}}function ue(t,o,e){return{...t||{},[o]:e}}function ft(t,o){return{...t||{},[o]:null}}function vt(t){return(t?!!t.enabled:!0)?{text:"全局开",tone:"on"}:{text:"全局关",tone:"off"}}function ht(t,o){const e=t?.effective||{};return o&&(e.autoRecall||e.autoCapture)?"ok":"idle"}function pt(t){const o=t?.state?.recall||{},e=t?.state?.capture||{},r=t?.probe?.events||{},i=(r["provider/before-request"]||0)+(r["agent/before-start"]||0),s=[`召回 ${o.turns||0}`,`写回 ${e.turns||0}`];return i&&s.push(`钩子 ${i}`),t?.probe?.lastAt&&s.push(new Date(t.probe.lastAt).toLocaleTimeString()),s.join(" · ")}function gt(t,o){const e=o||t?.peer||"";return e?o?{text:o,title:t?.peer?`会话归属 ${o}；对外门牌 ${t.peer}`:`会话归属 ${o}`}:{text:e,title:t?.peerSource==="merged"?t?.peerAgentDir?`${e}（合并记忆已开启；本会话助手：${t.peerAgentDir}）`:`${e}（合并记忆已开启，本机所有助手共用一个身份）`:e}:{text:"未绑定助手",title:t?.peerSource==="merged"?"合并记忆已开启，但这一段没拿到会话身份。":"拿不到会话路径，无法确定这一段属于哪个助手。"}}function mt({overrides:t,enabled:o,status:e}={}){const r=ct(t);return o?e&&!e.probe?{text:r?"有本会话设置；点小字交回全局。":"",warn:!1}:{text:r?"实心小字是本会话设置，点它交回全局。":"",warn:!1}:{text:"全局总闸关着，这里的开关不会生效。",warn:!0}}function xt(t){const o=je(t)||null,e=typeof t?.agentId=="string"?t.agentId.trim():"",r=t?.title||"";return{sessionKey:o,sessionOwner:e,title:r||(o?o.slice(-8):"无活动会话"),titleTitle:r||o||""}}function wt(t,o,e){const r={...t||{}};return o===j?r[j]=e?.recallScope||"all":e&&typeof e[o]=="boolean"?r[o]=e[o]:delete r[o],r}const yt=["data-key"],Ct={class:"row-label"},St={class:"row-control"},Q={__name:"CardRow",props:{rowKey:{type:String,required:!0},label:{type:String,required:!0},overridden:{type:Boolean,default:!1},disabled:{type:Boolean,default:!1},wide:{type:Boolean,default:!1}},emits:["reset"],setup(t){const o=t,e=A(()=>bt(o.overridden));return(r,i)=>(F(),P("div",{class:q(["row",{"row-wide":t.wide}]),"data-key":t.rowKey},[m("span",Ct,H(t.label),1),I(E(He),{class:"row-note",text:"",size:"tiny",type:t.overridden?"primary":"default",disabled:t.disabled,title:e.value.title,"aria-pressed":t.overridden?"true":"false",onClick:i[0]||(i[0]=s=>r.$emit("reset"))},{default:O(()=>[Z(H(e.value.text),1)]),_:1},8,["type","disabled","title","aria-pressed"]),m("div",St,[Te(r.$slots,"default")])],10,yt))}},Rt=["data-session"],kt={class:"head"},zt=["title"],$t={class:"ident"},_t=["title"],Bt={class:"rows"},Tt={class:"stats"},Ft=8e3,Vt={__name:"CardApp",setup(t){const o={...ae,common:{...ae.common,primaryColor:"#537D96",primaryColorHover:"#6A8FA6",primaryColorPressed:"#476B82",primaryColorSuppl:"#537D96"}},e=De({sessionKey:null,sessionOwner:"",title:"无活动会话",titleTitle:"",peerText:"—",peerTitle:"",pillText:"—",pillTone:"",dotTone:"idle",stats:"—",hintText:"",hintWarn:!1,effective:{},overrides:{},enabled:!0,globalStatus:null,hasModel:!1,writing:!1}),r=A(()=>!e.sessionKey||!e.hasModel||e.writing),i=A(()=>{const a={};for(const n of dt)a[n]=de(e.overrides,n);return a}),s=A(()=>e.effective[j]||"all");function d(a,n){e.hintText=a||"",e.hintWarn=!!n}function x(){e.hasModel=!1,e.effective={},e.overrides={},e.peerText="—",e.peerTitle="",e.stats="—",e.pillText="—",e.pillTone="",e.dotTone="idle",d("先打开一个对话，这张卡才会跟会话绑定。",!1)}function v(a){const n=xt(a);e.sessionKey=n.sessionKey,e.sessionOwner=n.sessionOwner,e.title=n.title,e.titleTitle=n.titleTitle}function f(a,n){n&&(e.globalStatus=n),e.hasModel=!0,e.effective={...a.effective||{}},e.overrides={...a.state?.overrides||{}};const c=e.globalStatus?!!e.globalStatus.enabled:!0;e.enabled=c;const R=vt(e.globalStatus);e.pillText=R.text,e.pillTone=R.tone,e.dotTone=ht(a,c),e.stats=pt(a);const G=gt(a,e.sessionOwner);e.peerText=G.text,e.peerTitle=G.title;const W=mt({overrides:e.overrides,enabled:c,status:e.globalStatus});d(W.text,W.warn)}async function h(a){try{return await se(`/status?session=${encodeURIComponent(a)}`)}catch{return null}}async function w(){if(!e.sessionKey&&(v(await We()),!e.sessionKey)){x();return}const a=e.sessionKey;try{const[n,c]=await Promise.all([h(a),se(`/session/${encodeURIComponent(a)}`)]);if(c?.ok===!1){e.hasModel=!1,e.stats="—",d("这个会话对不上任何状态（unknown session key），先重新选一次会话。",!0);return}f(c||{},n)}catch(n){d(String(n?.message||n),!0)}}function p(){return{effective:{...e.effective},overrides:{...e.overrides}}}async function S(a,n){const c=e.sessionKey;if(c){e.writing=!0;try{const R=await qe(`/session/${encodeURIComponent(c)}`,{overrides:a});if(R?.ok===!1)throw new Error(R.error||"写入失败");await w()}catch(R){e.effective=n.effective,e.overrides=n.overrides,d(String(R?.message||R),!0)}finally{e.writing=!1}}}async function y(a,n){if(r.value)return;const c=p(),R=typeof n=="boolean"?n:!e.effective[a];R!==!!e.effective[a]&&(e.effective={...e.effective,[a]:R},e.overrides=ue(e.overrides,a,R),await S({...e.overrides},c))}async function z(a){if(r.value||!ut.includes(a)||a===s.value)return;const n=p();e.effective={...e.effective,[j]:a},e.overrides=ue(e.overrides,j,a),await S({...e.overrides},n)}async function $(a){if(r.value||!de(e.overrides,a))return;const n=p();e.overrides=ft(e.overrides,a),e.effective=wt(e.effective,a,e.globalStatus),await S({...e.overrides},n)}let k=null;function _(){k&&clearInterval(k),k=null}function V(){_(),w(),k=setInterval(w,Ft)}function b(){document.hidden?_():V()}let l=null;const u=U(null);let g=null;function M(){const a=u.value;if(a)try{Ye.ui.resize({height:Math.ceil(a.getBoundingClientRect().height)})}catch{}}return Fe(()=>{Le(),document.addEventListener("visibilitychange",b),l=Ge(()=>{e.sessionKey=null,e.sessionOwner="",e.hasModel=!1,w()}),V(),typeof ResizeObserver=="function"&&u.value&&(g=new ResizeObserver(()=>M()),g.observe(u.value)),M()}),Ve(()=>{_(),document.removeEventListener("visibilitychange",b),l&&l(),g&&(g.disconnect(),g=null)}),(a,n)=>(F(),be(E(Ke),{abstract:"",locale:E(Ue),"theme-overrides":o},{default:O(()=>[m("div",{ref_key:"rootEl",ref:u,class:"card","data-session":e.sessionKey?"on":"off"},[m("header",kt,[m("span",{class:q(["dot",e.dotTone]),"aria-hidden":"true"},null,2),m("span",{class:"title",title:e.titleTitle},H(e.title),9,zt),m("span",{class:q(["pill",e.pillTone])},H(e.pillText),3)]),m("div",$t,[n[5]||(n[5]=m("span",{class:"ident-label"},"peer",-1)),m("span",{class:"ident-value",title:e.peerTitle},H(e.peerText),9,_t)]),m("div",Bt,[I(Q,{"row-key":"autoRecall",label:"记忆召回",overridden:i.value.autoRecall,disabled:r.value,onReset:n[1]||(n[1]=c=>$("autoRecall"))},{default:O(()=>[I(E(ie),{size:"small","aria-label":"记忆召回",value:!!e.effective.autoRecall,disabled:r.value,"onUpdate:value":n[0]||(n[0]=c=>y("autoRecall",c))},null,8,["value","disabled"])]),_:1},8,["overridden","disabled"]),I(Q,{"row-key":"readOnly",label:"只读",overridden:i.value.readOnly,disabled:r.value,onReset:n[3]||(n[3]=c=>$("readOnly"))},{default:O(()=>[I(E(ie),{size:"small","aria-label":"只读",value:!!e.effective.readOnly,disabled:r.value,"onUpdate:value":n[2]||(n[2]=c=>y("readOnly",c))},null,8,["value","disabled"])]),_:1},8,["overridden","disabled"]),I(Q,{"row-key":"recallPeerScope",label:"召回范围",wide:"",overridden:i.value.recallPeerScope,disabled:r.value,onReset:n[4]||(n[4]=c=>$("recallPeerScope"))},{default:O(()=>[I(E(st),{size:"small","aria-label":"召回范围",value:s.value,disabled:r.value,"onUpdate:value":z},{default:O(()=>[I(E(le),{value:"all"},{default:O(()=>[...n[6]||(n[6]=[Z("跨门牌",-1)])]),_:1}),I(E(le),{value:"self"},{default:O(()=>[...n[7]||(n[7]=[Z("只看本机",-1)])]),_:1})]),_:1},8,["value","disabled"])]),_:1},8,["overridden","disabled"])]),m("p",Tt,H(e.stats),1),e.hintText?(F(),P("p",{key:0,class:q(["hint",{warn:e.hintWarn}])},H(e.hintText),3)):Ie("",!0)],8,Rt)]),_:1},8,["locale"]))}};Oe(Vt).mount("#card-app");
