import{i as Ie,r as N,t as le,d as de,o as _,c as D,a as u,n as ke,b as C,e as we,p as Ve,f as B,g as V,w as E,h as ne,u as O,j as De,k as Z,l as Pe,m as Ae,F as Ee,q as Oe,s as Ke,v as Ue,x as He}from"./chunk-vue.js";import{d as Me,c as fe,a as j,b as T,e as y,f as K,g as se,u as ue,h as ye,i as Se,j as be,k as Ne,l as ee,m as ae,n as je,o as Y,p as F,r as Ce,q as Re,s as ze,t as re,B as _e,v as ve,z as Le,C as Ge}from"./chunk-theme.js";import{f as We,g as qe,s as Ye,a as Je,o as Qe,S as pe,c as Xe,p as Ze,j as he,b as et,d as X}from"./chunk-backfill-view.js";import{hana as tt}from"./sdk.js";var ot={radioSizeSmall:"14px",radioSizeMedium:"16px",radioSizeLarge:"18px",labelPadding:"0 8px",labelFontWeight:"400"};function nt(t){const{borderColor:o,primaryColor:e,baseColor:r,textColorDisabled:l,inputColorDisabled:s,textColor2:b,opacityDisabled:g,borderRadius:p,fontSizeSmall:c,fontSizeMedium:h,fontSizeLarge:m,heightSmall:k,heightMedium:R,heightLarge:S,lineHeight:$}=t;return{...ot,labelLineHeight:$,buttonHeightSmall:k,buttonHeightMedium:R,buttonHeightLarge:S,fontSizeSmall:c,fontSizeMedium:h,fontSizeLarge:m,boxShadow:`inset 0 0 0 1px ${o}`,boxShadowActive:`inset 0 0 0 1px ${e}`,boxShadowFocus:`inset 0 0 0 1px ${e}, 0 0 0 2px ${fe(e,{alpha:.2})}`,boxShadowHover:`inset 0 0 0 1px ${e}`,boxShadowDisabled:`inset 0 0 0 1px ${o}`,color:r,colorDisabled:s,colorActive:"#0000",textColor:b,textColorDisabled:l,dotColorActive:e,dotColorDisabled:o,buttonBorderColor:o,buttonBorderColorActive:e,buttonBorderColorHover:o,buttonColor:r,buttonColorActive:r,buttonTextColor:b,buttonTextColorActive:e,buttonTextColorHover:e,opacityDisabled:g,buttonBoxShadowFocus:`inset 0 0 0 1px ${e}, 0 0 0 2px ${fe(e,{alpha:.3})}`,buttonBoxShadowHover:"inset 0 0 0 1px #0000",buttonBoxShadow:"inset 0 0 0 1px #0000",buttonBorderRadius:p}}const $e={common:Me,self:nt};var rt=j("radio",`
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
 `),j("radio-input",`
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
 `,[K("&::before",`
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
 `),T("checked",{boxShadow:"var(--n-box-shadow-active)"},[K("&::before",`
 opacity: 1;
 transform: scale(1);
 `)])]),y("label",`
 color: var(--n-text-color);
 padding: var(--n-label-padding);
 font-weight: var(--n-label-font-weight);
 display: inline-block;
 transition: color .3s var(--n-bezier);
 `),se("disabled",`
 cursor: pointer;
 `,[K("&:hover",[y("dot",{boxShadow:"var(--n-box-shadow-hover)"})]),T("focus",[K("&:not(:active)",[y("dot",{boxShadow:"var(--n-box-shadow-focus)"})])])]),T("disabled",`
 cursor: not-allowed;
 `,[y("dot",{boxShadow:"var(--n-box-shadow-disabled)",backgroundColor:"var(--n-color-disabled)"},[K("&::before",{backgroundColor:"var(--n-dot-color-disabled)"}),T("checked",`
 opacity: 1;
 `)]),y("label",{color:"var(--n-text-color-disabled)"}),j("radio-input",`
 cursor: not-allowed;
 `)])]);const Be={name:String,value:{type:[String,Number,Boolean],default:"on"},checked:{type:Boolean,default:void 0},defaultChecked:Boolean,disabled:{type:Boolean,default:void 0},label:String,size:String,onUpdateChecked:[Function,Array],"onUpdate:checked":[Function,Array],checkedValue:{type:Boolean,default:void 0}},Te=Ne("n-radio-group");function Fe(t){const o=Ie(Te,null),{mergedClsPrefixRef:e,mergedComponentPropsRef:r}=ue(t),l=ye(t,{mergedSize(f){const{size:d}=t;if(d!==void 0)return d;if(o){const{mergedSizeRef:{value:w}}=o;if(w!==void 0)return w}if(f)return f.mergedSize.value;const v=r?.value?.Radio?.size;return v||"medium"},mergedDisabled(f){return!!(t.disabled||o?.disabledRef.value||f?.disabled.value)}}),{mergedSizeRef:s,mergedDisabledRef:b}=l,g=N(null),p=N(null),c=N(t.defaultChecked),h=le(t,"checked"),m=Se(h,c),k=be(()=>o?o.valueRef.value===t.value:m.value),R=be(()=>{const{name:f}=t;if(f!==void 0)return f;if(o)return o.nameRef.value}),S=N(!1);function $(){if(o){const{doUpdateValue:f}=o,{value:d}=t;ee(f,d)}else{const{onUpdateChecked:f,"onUpdate:checked":d}=t,{nTriggerFormInput:v,nTriggerFormChange:w}=l;f&&ee(f,!0),d&&ee(d,!0),v(),w(),c.value=!0}}function P(){b.value||k.value||$()}function A(){P(),g.value&&(g.value.checked=k.value)}function z(){S.value=!1}function I(){S.value=!0}return{mergedClsPrefix:o?o.mergedClsPrefixRef:e,inputRef:g,labelRef:p,mergedName:R,mergedDisabled:b,renderSafeChecked:k,focus:S,mergedSize:s,handleRadioInputChange:A,handleRadioInputBlur:z,handleRadioInputFocus:I}}const at=["value","name","checked","disabled","onChange","onFocus","onBlur"],it={...ae.props,...Be};var lt=de({name:"Radio",props:it,setup(t){const o=Fe(t),e=ae("Radio","-radio",rt,$e,t,o.mergedClsPrefix),r=C(()=>{const{mergedSize:{value:c}}=o,{common:{cubicBezierEaseInOut:h},self:{boxShadow:m,boxShadowActive:k,boxShadowDisabled:R,boxShadowFocus:S,boxShadowHover:$,color:P,colorDisabled:A,colorActive:z,textColor:I,textColorDisabled:f,dotColorActive:d,dotColorDisabled:v,labelPadding:w,labelLineHeight:U,labelFontWeight:H,[re("fontSize",c)]:L,[re("radioSize",c)]:G}}=e.value;return{"--n-bezier":h,"--n-label-line-height":U,"--n-label-font-weight":H,"--n-box-shadow":m,"--n-box-shadow-active":k,"--n-box-shadow-disabled":R,"--n-box-shadow-focus":S,"--n-box-shadow-hover":$,"--n-color":P,"--n-color-active":z,"--n-color-disabled":A,"--n-dot-color-active":d,"--n-dot-color-disabled":v,"--n-font-size":L,"--n-radio-size":G,"--n-text-color":I,"--n-text-color-disabled":f,"--n-label-padding":w}}),{inlineThemeDisabled:l,mergedClsPrefixRef:s,mergedRtlRef:b}=ue(t),g=Re("Radio",b,s),p=l?ze("radio",C(()=>o.mergedSize.value[0]),r,t):void 0;return Object.assign(o,{rtlEnabled:g,cssVars:l?void 0:r,themeClass:p?.themeClass,onRender:p?.onRender})},render(){const{$slots:t,mergedClsPrefix:o,onRender:e,label:r}=this;return e?.(),(()=>{const l=je("f8c6901d8cd45c02");return _(),D("label",{class:F([`${o}-radio`,this.themeClass,this.rtlEnabled&&`${o}-radio--rtl`,this.mergedDisabled&&`${o}-radio--disabled`,this.renderSafeChecked&&`${o}-radio--checked`,this.focus&&`${o}-radio--focus`]),style:ke(this.cssVars)},[u("div",{class:F(`${o}-radio__dot-wrapper`)},[l[0]||(l[0]=Y(" ",-1)),u("div",{class:F([`${o}-radio__dot`,this.renderSafeChecked&&`${o}-radio__dot--checked`])},null,2),u("input",{ref:"inputRef",type:"radio",class:F(`${o}-radio-input`),value:this.value,name:this.mergedName,checked:this.renderSafeChecked,disabled:this.mergedDisabled,onChange:this.handleRadioInputChange,onFocus:this.handleRadioInputFocus,onBlur:this.handleRadioInputBlur},null,42,at)],2),Y(()=>Ce(t.default,s=>!s&&!r?null:(_(),D("div",{ref:"labelRef",class:F(`${o}-radio__label`)},[Y(()=>s||r)],2))))],6)})()}});const st=["value","name","checked","disabled","onChange","onFocus","onBlur"];var ge=de({name:"RadioButton",props:Be,setup:Fe,render(){const{mergedClsPrefix:t}=this;return _(),D("label",{class:F([`${t}-radio-button`,this.mergedDisabled&&`${t}-radio-button--disabled`,this.renderSafeChecked&&`${t}-radio-button--checked`,this.focus&&[`${t}-radio-button--focus`]])},[u("input",{ref:"inputRef",type:"radio",class:F(`${t}-radio-input`),value:this.value,name:this.mergedName,checked:this.renderSafeChecked,disabled:this.mergedDisabled,onChange:this.handleRadioInputChange,onFocus:this.handleRadioInputFocus,onBlur:this.handleRadioInputBlur},null,42,st),u("div",{class:F(`${t}-radio-button__state-border`)},null,2),Y(()=>Ce(this.$slots.default,o=>!o&&!this.label?null:(_(),D("div",{ref:"labelRef",class:F(`${t}-radio__label`)},[Y(()=>o||this.label)],2))))],2)}}),dt=j("radio-group",`
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
 `,[j("radio-button",{height:"var(--n-height)",lineHeight:"var(--n-height)"}),y("splitor",{height:"var(--n-height)"})]),j("radio-button",`
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
 `),K("&:first-child",`
 border-top-left-radius: var(--n-button-border-radius);
 border-bottom-left-radius: var(--n-button-border-radius);
 border-left: 1px solid var(--n-button-border-color);
 `,[y("state-border",`
 border-top-left-radius: var(--n-button-border-radius);
 border-bottom-left-radius: var(--n-button-border-radius);
 `)]),K("&:last-child",`
 border-top-right-radius: var(--n-button-border-radius);
 border-bottom-right-radius: var(--n-button-border-radius);
 border-right: 1px solid var(--n-button-border-color);
 `,[y("state-border",`
 border-top-right-radius: var(--n-button-border-radius);
 border-bottom-right-radius: var(--n-button-border-radius);
 `)]),se("disabled",`
 cursor: pointer;
 `,[K("&:hover",[y("state-border",`
 transition: box-shadow .3s var(--n-bezier);
 box-shadow: var(--n-button-box-shadow-hover);
 `),se("checked",{color:"var(--n-button-text-color-hover)"})]),T("focus",[K("&:not(:active)",[y("state-border",{boxShadow:"var(--n-button-box-shadow-focus)"})])])]),T("checked",`
 background: var(--n-button-color-active);
 color: var(--n-button-text-color-active);
 border-color: var(--n-button-border-color-active);
 `),T("disabled",`
 cursor: not-allowed;
 opacity: var(--n-opacity-disabled);
 `)])]);const ut=["onFocusin","onFocusout"];function ct(t,o,e){const r=[];let l=!1;for(let s=0;s<t.length;++s){const b=t[s],g=b.type?.name;g==="RadioButton"&&(l=!0);const p=b.props;if(g!=="RadioButton"){r.push(b);continue}if(s===0)r.push(b);else{const c=r[r.length-1].props,h=o===c.value,m=c.disabled,k=o===p.value,R=p.disabled,S=(h?2:0)+(m?0:1),$=(k?2:0)+(R?0:1),P={[`${e}-radio-group__splitor--disabled`]:m,[`${e}-radio-group__splitor--checked`]:h},A={[`${e}-radio-group__splitor--disabled`]:R,[`${e}-radio-group__splitor--checked`]:k},z=S<$?A:P;r.push((_(),D("div",{key:1,class:F([`${e}-radio-group__splitor`,z])},null,2)),b)}}return{children:r,isButtonGroup:l}}const ft={...ae.props,name:String,options:Array,labelField:{type:String,default:"label"},valueField:{type:String,default:"value"},value:[String,Number,Boolean],defaultValue:{type:[String,Number,Boolean],default:null},size:String,disabled:{type:Boolean,default:void 0},"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array]};var bt=de({name:"RadioGroup",props:ft,setup(t){const o=N(null),{mergedSizeRef:e,mergedDisabledRef:r,nTriggerFormChange:l,nTriggerFormInput:s,nTriggerFormBlur:b,nTriggerFormFocus:g}=ye(t),{mergedClsPrefixRef:p,inlineThemeDisabled:c,mergedRtlRef:h}=ue(t),m=ae("Radio","-radio-group",dt,$e,t,p),k=N(t.defaultValue),R=le(t,"value"),S=Se(R,k);function $(d){const{onUpdateValue:v,"onUpdate:value":w}=t;v&&ee(v,d),w&&ee(w,d),k.value=d,l(),s()}function P(d){const{value:v}=o;v&&(v.contains(d.relatedTarget)||g())}function A(d){const{value:v}=o;v&&(v.contains(d.relatedTarget)||b())}Ve(Te,{mergedClsPrefixRef:p,nameRef:le(t,"name"),valueRef:S,disabledRef:r,mergedSizeRef:e,doUpdateValue:$});const z=Re("Radio",h,p),I=C(()=>{const{value:d}=e,{common:{cubicBezierEaseInOut:v},self:{buttonBorderColor:w,buttonBorderColorActive:U,buttonBorderRadius:H,buttonBoxShadow:L,buttonBoxShadowFocus:G,buttonBoxShadowHover:Q,buttonColor:W,buttonColorActive:M,buttonTextColor:te,buttonTextColorActive:a,buttonTextColorHover:n,opacityDisabled:i,[re("buttonHeight",d)]:x,[re("fontSize",d)]:q}}=m.value;return{"--n-font-size":q,"--n-bezier":v,"--n-button-border-color":w,"--n-button-border-color-active":U,"--n-button-border-radius":H,"--n-button-box-shadow":L,"--n-button-box-shadow-focus":G,"--n-button-box-shadow-hover":Q,"--n-button-color":W,"--n-button-color-active":M,"--n-button-text-color":te,"--n-button-text-color-hover":n,"--n-button-text-color-active":a,"--n-height":x,"--n-opacity-disabled":i}}),f=c?ze("radio-group",C(()=>e.value[0]),I,t):void 0;return{selfElRef:o,rtlEnabled:z,mergedClsPrefix:p,mergedValue:S,handleFocusout:A,handleFocusin:P,cssVars:c?void 0:I,themeClass:f?.themeClass,onRender:f?.onRender}},render(){const{mergedValue:t,mergedClsPrefix:o,handleFocusin:e,handleFocusout:r}=this,{options:l,labelField:s,valueField:b}=this.$props,{children:g,isButtonGroup:p}=ct(l?l.map(c=>{const h=c[b];return _(),we(lt,{key:typeof h=="boolean"?`__n_${h}`:h,value:h,disabled:c.disabled,label:c[s]},null,8,["value","disabled","label"])}):We(qe(this)),t,o);return this.onRender?.(),_(),D("div",{onFocusin:e,onFocusout:r,ref:"selfElRef",class:F([`${o}-radio-group`,this.rtlEnabled&&`${o}-radio-group--rtl`,this.themeClass,p&&`${o}-radio-group--button-group`]),style:ke(this.cssVars)},[Y(()=>g)],46,ut)}});const vt=Object.freeze(["autoRecall","readOnly"]),J="recallPeerScope",pt=Object.freeze([...vt,J]),ht=Object.freeze(["all","self"]);function me(t,o){return!!t&&Object.prototype.hasOwnProperty.call(t,o)&&t[o]!==null}function gt(t){return Object.keys(t||{}).some(o=>t[o]!==null)}function mt(t){return t?{text:"本会话",title:"点击交回全局"}:{text:"跟随全局",title:"当前跟随全局"}}function xe(t,o,e){return{...t||{},[o]:e}}function xt(t,o){return{...t||{},[o]:null}}function kt(t){return(t?!!t.enabled:!0)?{text:"全局开",tone:"on"}:{text:"全局关",tone:"off"}}function wt(t,o){const e=t?.effective||{};return o&&(e.autoRecall||e.autoCapture)?"ok":"idle"}function yt(t){const o=t?.state?.recall||{},e=t?.state?.capture||{},r=t?.probe?.events||{},l=(r["provider/before-request"]||0)+(r["agent/before-start"]||0),s=[`召回 ${o.turns||0}`,`写回 ${e.turns||0}`];return l&&s.push(`钩子 ${l}`),t?.probe?.lastAt&&s.push(new Date(t.probe.lastAt).toLocaleTimeString()),s.join(" · ")}function St(t,o){const e=o||t?.peer||"";return e?o?{text:o,title:t?.peer?`会话归属 ${o}；对外门牌 ${t.peer}`:`会话归属 ${o}`}:{text:e,title:t?.peerSource==="merged"?t?.peerAgentDir?`${e}（合并记忆已开启；本会话助手：${t.peerAgentDir}）`:`${e}（合并记忆已开启，本机所有助手共用一个身份）`:e}:{text:"未绑定助手",title:t?.peerSource==="merged"?"合并记忆已开启，但这一段没拿到会话身份。":"拿不到会话路径，无法确定这一段属于哪个助手。"}}function Ct({overrides:t,enabled:o,status:e}={}){const r=gt(t);return o?e&&!e.probe?{text:r?"有本会话设置；点小字交回全局。":"",warn:!1}:{text:r?"实心小字是本会话设置，点它交回全局。":"",warn:!1}:{text:"全局总闸关着，这里的开关不会生效。",warn:!0}}function Rt(t){const o=Ye(t)||null,e=typeof t?.agentId=="string"?t.agentId.trim():"",r=t?.title||"";return{sessionKey:o,sessionOwner:e,title:r||(o?o.slice(-8):"无活动会话"),titleTitle:r||o||""}}function zt(t,o,e){const r={...t||{}};return o===J?r[J]=e?.recallScope||"all":e&&typeof e[o]=="boolean"?r[o]=e[o]:delete r[o],r}const _t=["data-key"],$t={class:"row-label"},Bt={class:"row-control"},ie={__name:"CardRow",props:{rowKey:{type:String,required:!0},label:{type:String,required:!0},overridden:{type:Boolean,default:!1},disabled:{type:Boolean,default:!1},wide:{type:Boolean,default:!1}},emits:["reset"],setup(t){const o=t,e=C(()=>mt(o.overridden));return(r,l)=>(_(),D("div",{class:Z(["row",{"row-wide":t.wide}]),"data-key":t.rowKey},[u("span",$t,B(t.label),1),V(O(_e),{class:"row-note",text:"",size:"tiny",type:t.overridden?"primary":"default",disabled:t.disabled,title:e.value.title,"aria-pressed":t.overridden?"true":"false",onClick:l[0]||(l[0]=s=>r.$emit("reset"))},{default:E(()=>[ne(B(e.value.text),1)]),_:1},8,["type","disabled","title","aria-pressed"]),u("div",Bt,[De(r.$slots,"default")])],10,_t))}},Tt=["data-session"],Ft={class:"head"},It=["title"],Vt={class:"ident"},Dt=["title"],Pt={class:"rows"},At=["aria-disabled"],Et=["data-row"],Ot={class:"capture-label"},Kt={class:"capture-value"},Ut={class:"capture-row","data-row":"backfill"},Ht={class:"capture-value"},Mt={class:"stats"},Nt=8e3,jt={__name:"CardApp",setup(t){const o={...ve,common:{...ve.common,primaryColor:"#537D96",primaryColorHover:"#6A8FA6",primaryColorPressed:"#476B82",primaryColorSuppl:"#537D96"}},e=Ue({sessionKey:null,sessionOwner:"",title:"无活动会话",titleTitle:"",peerText:"—",peerTitle:"",pillText:"—",pillTone:"",dotTone:"idle",stats:"—",hintText:"",hintWarn:!1,effective:{},overrides:{},enabled:!0,globalStatus:null,hasModel:!1,writing:!1,capture:{active:!1,autoCapture:!1,data:null},backfillOk:!1,backfillPending:null,backfillRunning:!1,backfillRunningSession:"",backfillSending:!1}),r=C(()=>!e.sessionKey||!e.hasModel||e.writing),l=C(()=>!e.capture.active||!e.capture.autoCapture),s=C(()=>Xe(e.capture.data,{active:e.capture.active,autoCapture:e.capture.autoCapture})),b=C(()=>e.backfillSending||e.backfillRunning&&(!e.backfillRunningSession||e.backfillRunningSession===e.sessionKey)),g=C(()=>b.value||!e.sessionKey||l.value||!e.backfillOk?!0:(e.backfillPending??0)<=0),p=C(()=>!e.sessionKey||l.value||!e.backfillOk?"—":Ze(e.backfillPending??0)),c=C(()=>{const a={};for(const n of pt)a[n]=me(e.overrides,n);return a}),h=C(()=>e.effective[J]||"all");function m(a,n){e.hintText=a||"",e.hintWarn=!!n}function k(){e.hasModel=!1,e.effective={},e.overrides={},e.peerText="—",e.peerTitle="",e.capture={active:!1,autoCapture:!1,data:null},e.backfillOk=!1,e.backfillPending=null,e.backfillRunning=!1,e.backfillRunningSession="",e.stats="—",e.pillText="—",e.pillTone="",e.dotTone="idle",m("先打开一个对话，这张卡才会跟会话绑定。",!1)}function R(a){const n=Rt(a);e.sessionKey=n.sessionKey,e.sessionOwner=n.sessionOwner,e.title=n.title,e.titleTitle=n.titleTitle}function S(a,n,i){n&&(e.globalStatus=n),i&&typeof i=="object"&&(e.capture={active:i.active===!0,autoCapture:i.autoCapture===!0,data:i}),e.hasModel=!0,e.effective={...a.effective||{}},e.overrides={...a.state?.overrides||{}};const x=e.globalStatus?!!e.globalStatus.enabled:!0;e.enabled=x;const q=kt(e.globalStatus);e.pillText=q.text,e.pillTone=q.tone,e.dotTone=wt(a,x),e.stats=yt(a);const oe=St(a,e.sessionOwner);e.peerText=oe.text,e.peerTitle=oe.title;const ce=Ct({overrides:e.overrides,enabled:x,status:e.globalStatus});m(ce.text,ce.warn)}async function $(a){try{return await X(`/status?session=${encodeURIComponent(a)}`)}catch{return null}}function P(a,n){if(Array.isArray(a?.sessions)){const i=a.sessions[0];e.backfillOk=!0,e.backfillPending=i&&Number.isFinite(Number(i.pendingSegments))?Math.max(0,Math.floor(Number(i.pendingSegments))):0}else e.backfillOk=!1,e.backfillPending=null;n&&typeof n=="object"&&(e.backfillRunning=n.running===!0,e.backfillRunningSession=typeof n.sessionId=="string"?n.sessionId:"")}async function A(){if(g.value)return;const a=e.sessionKey;if(a){e.backfillSending=!0;try{const n=await he("/backfill",{scope:"session",sessionId:a});if(n?.ok===!1)throw new Error(n.error||"补交失败");e.backfillRunning=!0,e.backfillRunningSession=a}catch(n){m(String(n?.message||n),!0)}finally{e.backfillSending=!1}}}async function z(){if(!e.sessionKey&&(R(await et()),!e.sessionKey)){k();return}const a=e.sessionKey;try{const[n,i,x,q,oe]=await Promise.all([$(a),X(`/session/${encodeURIComponent(a)}`),X(`/capture-status?sessionId=${encodeURIComponent(a)}`).catch(()=>null),X(`/backfill-sessions?sessionId=${encodeURIComponent(a)}`).catch(()=>null),X("/backfill-status").catch(()=>null)]);if(i?.ok===!1){e.hasModel=!1,e.stats="—",e.capture={active:!1,autoCapture:!1,data:null},e.backfillOk=!1,e.backfillPending=null,m("这个会话对不上任何状态（unknown session key），先重新选一次会话。",!0);return}P(q,oe),S(i||{},n,x)}catch(n){m(String(n?.message||n),!0)}}function I(){return{effective:{...e.effective},overrides:{...e.overrides}}}async function f(a,n){const i=e.sessionKey;if(i){e.writing=!0;try{const x=await he(`/session/${encodeURIComponent(i)}`,{overrides:a});if(x?.ok===!1)throw new Error(x.error||"写入失败");await z()}catch(x){e.effective=n.effective,e.overrides=n.overrides,m(String(x?.message||x),!0)}finally{e.writing=!1}}}async function d(a,n){if(r.value)return;const i=I(),x=typeof n=="boolean"?n:!e.effective[a];x!==!!e.effective[a]&&(e.effective={...e.effective,[a]:x},e.overrides=xe(e.overrides,a,x),await f({...e.overrides},i))}async function v(a){if(r.value||!ht.includes(a)||a===h.value)return;const n=I();e.effective={...e.effective,[J]:a},e.overrides=xe(e.overrides,J,a),await f({...e.overrides},n)}async function w(a){if(r.value||!me(e.overrides,a))return;const n=I();e.overrides=xt(e.overrides,a),e.effective=zt(e.effective,a,e.globalStatus),await f({...e.overrides},n)}let U=null;function H(){U&&clearInterval(U),U=null}function L(){H(),z(),U=setInterval(z,Nt)}function G(){document.hidden?H():L()}let Q=null;const W=N(null);let M=null;function te(){const a=W.value;if(a)try{tt.ui.resize({height:Math.ceil(a.getBoundingClientRect().height)})}catch{}}return Pe(()=>{Je(),document.addEventListener("visibilitychange",G),Q=Qe(()=>{e.sessionKey=null,e.sessionOwner="",e.hasModel=!1,z()}),L(),typeof ResizeObserver=="function"&&W.value&&(M=new ResizeObserver(()=>te()),M.observe(W.value)),te()}),Ae(()=>{H(),document.removeEventListener("visibilitychange",G),Q&&Q(),M&&(M.disconnect(),M=null)}),(a,n)=>(_(),we(O(Ge),{abstract:"",locale:O(Le),"theme-overrides":o},{default:E(()=>[u("div",{ref_key:"rootEl",ref:W,class:"card","data-session":e.sessionKey?"on":"off"},[u("header",Ft,[u("span",{class:Z(["dot",e.dotTone]),"aria-hidden":"true"},null,2),u("span",{class:"title",title:e.titleTitle},B(e.title),9,It),u("span",{class:Z(["pill",e.pillTone])},B(e.pillText),3)]),u("div",Vt,[n[5]||(n[5]=u("span",{class:"ident-label"},"peer",-1)),u("span",{class:"ident-value",title:e.peerTitle},B(e.peerText),9,Dt)]),u("div",Pt,[V(ie,{"row-key":"autoRecall",label:"记忆召回",overridden:c.value.autoRecall,disabled:r.value,onReset:n[1]||(n[1]=i=>w("autoRecall"))},{default:E(()=>[V(O(pe),{size:"small","aria-label":"记忆召回",value:!!e.effective.autoRecall,disabled:r.value,"onUpdate:value":n[0]||(n[0]=i=>d("autoRecall",i))},null,8,["value","disabled"])]),_:1},8,["overridden","disabled"]),V(ie,{"row-key":"readOnly",label:"只读",overridden:c.value.readOnly,disabled:r.value,onReset:n[3]||(n[3]=i=>w("readOnly"))},{default:E(()=>[V(O(pe),{size:"small","aria-label":"只读",value:!!e.effective.readOnly,disabled:r.value,"onUpdate:value":n[2]||(n[2]=i=>d("readOnly",i))},null,8,["value","disabled"])]),_:1},8,["overridden","disabled"]),V(ie,{"row-key":"recallPeerScope",label:"召回范围",wide:"",overridden:c.value.recallPeerScope,disabled:r.value,onReset:n[4]||(n[4]=i=>w("recallPeerScope"))},{default:E(()=>[V(O(bt),{size:"small","aria-label":"召回范围",value:h.value,disabled:r.value,"onUpdate:value":v},{default:E(()=>[V(O(ge),{value:"all"},{default:E(()=>[...n[6]||(n[6]=[ne("跨门牌",-1)])]),_:1}),V(O(ge),{value:"self"},{default:E(()=>[...n[7]||(n[7]=[ne("只看本机",-1)])]),_:1})]),_:1},8,["value","disabled"])]),_:1},8,["overridden","disabled"])]),u("div",{class:Z(["capture",{off:l.value}]),"aria-disabled":l.value?"true":"false"},[(_(!0),D(Ee,null,Oe(s.value,i=>(_(),D("span",{key:i.key,class:"capture-row","data-row":i.key},[u("span",Ot,B(i.label),1),u("span",Kt,B(i.value),1)],8,Et))),128)),u("span",Ut,[n[8]||(n[8]=u("span",{class:"capture-label"},"补交",-1)),u("span",Ht,B(p.value),1),V(O(_e),{id:"backfillBtn",size:"tiny",disabled:g.value,onClick:A},{default:E(()=>[ne(B(b.value?"补交中…":"补交"),1)]),_:1},8,["disabled"])])],10,At),u("p",Mt,B(e.stats),1),e.hintText?(_(),D("p",{key:0,class:Z(["hint",{warn:e.hintWarn}])},B(e.hintText),3)):Ke("",!0)],8,Tt)]),_:1},8,["locale"]))}};He(jt).mount("#card-app");
