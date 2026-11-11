import{h as _e,F as $e,C as Re,d as Te,o as v,c as $,a as R,n as Z,r as I,t as Ae,b as V,e as ee,G as Pe}from"./chunk-vue.js";import{d as Be,c as Ee,a as te,e as a,ap as ne,f as W,b as p,g as re,m as ae,a4 as H,o as b,p as c,u as ze,h as je,i as Fe,s as Me,t as C,a1 as K,a0 as m,l as G,r as k,a8 as Ve,aq as Ne}from"./chunk-theme.js";import{hana as _}from"./sdk.js";function ie(e,t=!0,r=[]){return e.forEach(n=>{if(n!==null){if(typeof n!="object"){(typeof n=="string"||typeof n=="number")&&r.push(_e(String(n)));return}if(Array.isArray(n)){ie(n,t,r);return}if(n.type===$e){if(n.children===null)return;Array.isArray(n.children)&&ie(n.children,t,r)}else{if(n.type===Re&&t)return;r.push(n)}}}),r}function ut(e,t="default",r=[]){const n=e.$slots[t];return n===void 0?r:n()}var De={buttonHeightSmall:"14px",buttonHeightMedium:"18px",buttonHeightLarge:"22px",buttonWidthSmall:"14px",buttonWidthMedium:"18px",buttonWidthLarge:"22px",buttonWidthPressedSmall:"20px",buttonWidthPressedMedium:"24px",buttonWidthPressedLarge:"28px",railHeightSmall:"18px",railHeightMedium:"22px",railHeightLarge:"26px",railWidthSmall:"32px",railWidthMedium:"40px",railWidthLarge:"48px"};function Oe(e){const{primaryColor:t,opacityDisabled:r,borderRadius:n,textColor3:i}=e;return{...De,iconColor:i,textColor:"white",loadingColor:t,opacityDisabled:r,railColor:"rgba(0, 0, 0, .14)",railColorActive:t,buttonBoxShadow:"0 1px 4px 0 rgba(0, 0, 0, 0.3), inset 0 0 1px 0 rgba(0, 0, 0, 0.05)",buttonColor:"#FFF",railBorderRadiusSmall:n,railBorderRadiusMedium:n,railBorderRadiusLarge:n,buttonBorderRadiusSmall:n,buttonBorderRadiusMedium:n,buttonBorderRadiusLarge:n,boxShadowFocus:`0 0 0 2px ${Ee(t,{alpha:.2})}`}}const Le={common:Be,self:Oe};var Ue=te("switch",`
 height: var(--n-height);
 min-width: var(--n-width);
 vertical-align: middle;
 user-select: none;
 -webkit-user-select: none;
 display: inline-flex;
 outline: none;
 justify-content: center;
 align-items: center;
`,[a("children-placeholder",`
 height: var(--n-rail-height);
 display: flex;
 flex-direction: column;
 overflow: hidden;
 pointer-events: none;
 visibility: hidden;
 `),a("rail-placeholder",`
 display: flex;
 flex-wrap: none;
 `),a("button-placeholder",`
 width: calc(1.75 * var(--n-rail-height));
 height: var(--n-rail-height);
 `),te("base-loading",`
 position: absolute;
 top: 50%;
 left: 50%;
 transform: translateX(-50%) translateY(-50%);
 font-size: calc(var(--n-button-width) - 4px);
 color: var(--n-loading-color);
 transition: color .3s var(--n-bezier);
 `,[ne({left:"50%",top:"50%",originalTransform:"translateX(-50%) translateY(-50%)"})]),a("checked, unchecked",`
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
 `),a("checked",`
 right: 0;
 padding-right: calc(1.25 * var(--n-rail-height) - var(--n-offset));
 `),a("unchecked",`
 left: 0;
 justify-content: flex-end;
 padding-left: calc(1.25 * var(--n-rail-height) - var(--n-offset));
 `),W("&:focus",[a("rail",`
 box-shadow: var(--n-box-shadow-focus);
 `)]),p("round",[a("rail","border-radius: calc(var(--n-rail-height) / 2);",[a("button","border-radius: calc(var(--n-button-height) / 2);")])]),re("disabled",[re("icon",[p("rubber-band",[p("pressed",[a("rail",[a("button","max-width: var(--n-button-width-pressed);")])]),a("rail",[W("&:active",[a("button","max-width: var(--n-button-width-pressed);")])]),p("active",[p("pressed",[a("rail",[a("button","left: calc(100% - var(--n-offset) - var(--n-button-width-pressed));")])]),a("rail",[W("&:active",[a("button","left: calc(100% - var(--n-offset) - var(--n-button-width-pressed));")])])])])])]),p("active",[a("rail",[a("button","left: calc(100% - var(--n-button-width) - var(--n-offset))")])]),a("rail",`
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
 `,[a("button-icon",`
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
 `,[ne()]),a("button",`
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
 `)]),p("active",[a("rail","background-color: var(--n-rail-color-active);")]),p("loading",[a("rail",`
 cursor: wait;
 `)]),p("disabled",[a("rail",`
 cursor: not-allowed;
 opacity: .5;
 `)])]);const Ie=["aria-checked","tabindex","onClick","onFocus","onBlur","onKeyup","onKeydown"],We={...ae.props,size:String,value:{type:[String,Number,Boolean],default:void 0},loading:Boolean,defaultValue:{type:[String,Number,Boolean],default:!1},disabled:{type:Boolean,default:void 0},round:{type:Boolean,default:!0},"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array],checkedValue:{type:[String,Number,Boolean],default:!0},uncheckedValue:{type:[String,Number,Boolean],default:!1},railStyle:Function,rubberBand:{type:Boolean,default:!0},spinProps:Object,onChange:[Function,Array]};let B;var dt=Te({name:"Switch",props:We,slots:Object,setup(e){B===void 0&&(typeof CSS<"u"?typeof CSS.supports<"u"?B=CSS.supports("width","max(1px)"):B=!1:B=!0);const{mergedClsPrefixRef:t,inlineThemeDisabled:r,mergedComponentPropsRef:n}=ze(e),i=ae("Switch","-switch",Ue,Le,e,t),l=je(e,{mergedSize(o){if(e.size!==void 0)return e.size;if(o)return o.mergedSize.value;const S=n?.value?.Switch?.size;return S||"medium"}}),{mergedSizeRef:d,mergedDisabledRef:f}=l,T=I(e.defaultValue),E=Ae(e,"value"),x=Fe(E,T),z=V(()=>x.value===e.checkedValue),s=I(!1),h=I(!1),A=V(()=>{const{railStyle:o}=e;if(o)return o({focused:h.value,checked:z.value})});function j(o){const{"onUpdate:value":S,onChange:F,onUpdateValue:M}=e,{nTriggerFormInput:N,nTriggerFormChange:D}=l;S&&G(S,o),M&&G(M,o),F&&G(F,o),T.value=o,N(),D()}function ce(){const{nTriggerFormFocus:o}=l;o()}function ue(){const{nTriggerFormBlur:o}=l;o()}function de(){e.loading||f.value||(x.value!==e.checkedValue?j(e.checkedValue):j(e.uncheckedValue))}function fe(){h.value=!0,ce()}function he(){h.value=!1,ue(),s.value=!1}function be(o){e.loading||f.value||o.key===" "&&(x.value!==e.checkedValue?j(e.checkedValue):j(e.uncheckedValue),s.value=!1)}function pe(o){e.loading||f.value||o.key===" "&&(o.preventDefault(),s.value=!0)}const J=V(()=>{const{value:o}=d,{self:{opacityDisabled:S,railColor:F,railColorActive:M,buttonBoxShadow:N,buttonColor:D,boxShadowFocus:me,loadingColor:ge,textColor:ye,iconColor:ve,[C("buttonHeight",o)]:g,[C("buttonWidth",o)]:we,[C("buttonWidthPressed",o)]:xe,[C("railHeight",o)]:y,[C("railWidth",o)]:P,[C("railBorderRadius",o)]:Se,[C("buttonBorderRadius",o)]:Ce},common:{cubicBezierEaseInOut:ke}}=i.value;let O,L,U;return B?(O=`calc((${y} - ${g}) / 2)`,L=`max(${y}, ${g})`,U=`max(${P}, calc(${P} + ${g} - ${y}))`):(O=K((m(y)-m(g))/2),L=K(Math.max(m(y),m(g))),U=m(y)>m(g)?P:K(m(P)+m(g)-m(y))),{"--n-bezier":ke,"--n-button-border-radius":Ce,"--n-button-box-shadow":N,"--n-button-color":D,"--n-button-width":we,"--n-button-width-pressed":xe,"--n-button-height":g,"--n-height":L,"--n-offset":O,"--n-opacity-disabled":S,"--n-rail-border-radius":Se,"--n-rail-color":F,"--n-rail-color-active":M,"--n-rail-height":y,"--n-rail-width":P,"--n-width":U,"--n-box-shadow-focus":me,"--n-loading-color":ge,"--n-text-color":ye,"--n-icon-color":ve}}),Q=r?Me("switch",V(()=>d.value[0]),J,e):void 0;return{handleClick:de,handleBlur:he,handleFocus:fe,handleKeyup:be,handleKeydown:pe,mergedRailStyle:A,pressed:s,mergedClsPrefix:t,mergedValue:x,checked:z,mergedDisabled:f,cssVars:r?void 0:J,themeClass:Q?.themeClass,onRender:Q?.onRender}},render(){const{mergedClsPrefix:e,mergedDisabled:t,checked:r,mergedRailStyle:n,onRender:i,$slots:l}=this;i?.();const{checked:d,unchecked:f,icon:T,"checked-icon":E,"unchecked-icon":x}=l,z=!(H(T)&&H(E)&&H(x));return v(),$("div",{role:"switch","aria-checked":r,class:c([`${e}-switch`,this.themeClass,z&&`${e}-switch--icon`,r&&`${e}-switch--active`,t&&`${e}-switch--disabled`,this.round&&`${e}-switch--round`,this.loading&&`${e}-switch--loading`,this.pressed&&`${e}-switch--pressed`,this.rubberBand&&`${e}-switch--rubber-band`]),tabindex:this.mergedDisabled?void 0:0,style:Z(this.cssVars),onClick:this.handleClick,onFocus:this.handleFocus,onBlur:this.handleBlur,onKeyup:this.handleKeyup,onKeydown:this.handleKeydown},[R("div",{class:c(`${e}-switch__rail`),"aria-hidden":"true",style:Z(n)},[b(()=>k(d,s=>k(f,h=>s||h?(v(),$("div",{key:4,"aria-hidden":!0,class:c(`${e}-switch__children-placeholder`)},[R("div",{class:c(`${e}-switch__rail-placeholder`)},[R("div",{class:c(`${e}-switch__button-placeholder`)},null,2),b(()=>s)],2),R("div",{class:c(`${e}-switch__rail-placeholder`)},[R("div",{class:c(`${e}-switch__button-placeholder`)},null,2),b(()=>h)],2)],2)):null))),R("div",{class:c(`${e}-switch__button`)},[b(()=>k(T,s=>k(E,h=>k(x,A=>(v(),ee(Ne,null,{default:()=>this.loading?(v(),ee(Ve,Pe({key:"loading",clsPrefix:e,strokeWidth:20},this.spinProps),null,16,["clsPrefix"])):this.checked&&(h||s)?(v(),$("div",{class:c(`${e}-switch__button-icon`),key:h?"checked-icon":"icon"},[b(()=>h||s)],2)):!this.checked&&(A||s)?(v(),$("div",{class:c(`${e}-switch__button-icon`),key:A?"unchecked-icon":"icon"},[b(()=>A||s)],2)):null},1024)))))),b(()=>k(d,s=>s&&(v(),$("div",{key:"checked",class:c(`${e}-switch__checked`)},[b(()=>s)],2)))),b(()=>k(f,s=>s&&(v(),$("div",{key:"unchecked",class:c(`${e}-switch__unchecked`)},[b(()=>s)],2))))],2)],6)],46,Ie)}});const He=/^[0-9a-f]{8}-[0-9a-f]{4}/;function Ke(e){return e.slice(e.lastIndexOf("_")+1)}function Ge(e){const t=typeof e?.sessionPath=="string"?e.sessionPath:"";return Ye(t)}function Ye(e){if(typeof e!="string")return"";const t=e.trim();if(!t)return"";const n=(t.split(/[/\\]/).filter(Boolean).pop()||"").replace(/\.jsonl$/i,"").replace(/\.json$/i,"");if(!n||n==="."||n===".."||n.startsWith("sess_"))return"";const i=Ke(n);return!i||i.startsWith("sess_")||!He.test(i)?"":i}async function ft(e){return(await _.api.fetch(e)).json()}async function ht(e,t){return(await _.api.fetch(e,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)})).json()}async function bt(e,t){return(await _.api.fetch(e,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)})).json()}async function pt(e){return(await _.api.fetch(e,{method:"DELETE"})).json()}function mt(){_.ready()}async function Xe(){try{return await _.sessions.getActive()}catch{return null}}async function gt(){return Ge(await Xe())||null}function yt(e){try{const t=_.sessions.onActiveChanged(e);return typeof t=="function"?t:null}catch{return null}}const w="暂无",qe=2e3,se="下面有几个已知话题，和一段新的对话。先判断这段在讲什么，再决定它属于哪个。";function le(e){return typeof e!="string"||!e?"":Array.from(e).slice(0,qe).join("")}function vt(e,t=!1){const r=le(e);return r||(t?"":se)}function wt(e){const t=le(e);return t===se?"当前为默认题面":t.trim()?"已修改":"已修改 · 题面为空时使用内置默认"}const xt=Object.freeze([1,100]),St=Object.freeze([1,20]),Ct=Object.freeze([1,50]),kt=Object.freeze([1,20]),_t=Object.freeze([60,86400]),Je=Object.freeze({captureServiceUrl:"判别服务地址",systemoneServiceModel:"决策服务模型"});function Qe(e){if(e==null)return"";const t=typeof e=="number"?e:Date.parse(e);if(!Number.isFinite(t))return"";try{return new Date(t).toLocaleString("zh-CN")}catch{return""}}function Y(e){if(e==null)return"";const t=Number(e);return!Number.isFinite(t)||t<0?"":String(Math.floor(t))}function Ze(e,t={}){const r=!!e&&typeof e=="object";if(t.active===!1||t.autoCapture===!1||!r)return{written:w,lastCommit:w,pending:w,topics:w,disabled:!0};const i=Y(e.written),l=Qe(e.lastCommitAt),d=Y(e.pendingTurns),f=Y(e.topics);return{written:i!==""?`${i} 条`:w,lastCommit:l||w,pending:d!==""?`${d} 轮`:w,topics:f!==""?`${f} 个`:w,disabled:!1}}function $t(e,t={}){const r=Ze(e,t);return[{key:"written",label:"本会话已写",value:r.written},{key:"lastCommit",label:"上次提交",value:r.lastCommit},{key:"pending",label:"待提交",value:r.pending},{key:"topics",label:"本会话话题数",value:r.topics}]}function Rt(e){if(!e||typeof e!="object"||e.early===!0||e.earlyStored!==!0)return"";const t=(Array.isArray(e.missing)?e.missing:[]).map(r=>Je[r]||String(r||"")).filter(Boolean);return t.length?`当前不提前提交：还缺 ${t.join("、")}`:"当前不提前提交"}const X=60*1e3,q=60*X,oe=24*q;function et(e){if(typeof e=="number")return Number.isFinite(e)?e:null;if(typeof e!="string")return null;const t=e.trim();if(!t)return null;if(/^-?\d+$/.test(t)){const n=Number(t);return Number.isFinite(n)?n:null}const r=Date.parse(t);return Number.isFinite(r)?r:null}function tt(e,t){const r=et(e);if(r===null)return"—";const i=(Number.isFinite(Number(t))?Number(t):Date.now())-r;return i<X?"刚刚":i<q?`${Math.floor(i/X)} 分钟前`:i<oe?`${Math.floor(i/q)} 小时前`:`${Math.floor(i/oe)} 天前`}const nt=200,rt=1.5,it=/^[0-9a-f]{8}-[0-9a-f]{4}/i;function u(e){if(typeof e=="number"&&Number.isFinite(e))return Math.max(0,Math.floor(e));if(typeof e=="string"&&e.trim()){const t=Number(e.trim());if(Number.isFinite(t))return Math.max(0,Math.floor(t))}return 0}function ot(e){const t=typeof e=="string"?e.trim():"";return it.test(t)?t.slice(0,8):""}function Tt(e){if(e==null)return"—";const t=u(e);return t>0?`欠 ${t} 段`:"已补完"}function At(e,t,r={}){const n=e&&typeof e=="object"?e:{},i=typeof n.sessionId=="string"?n.sessionId:"",l=r.running===!0;return{sessionId:i,shortId:ot(i),messagesText:String(u(n.messages)),writtenText:String(u(n.written)),pendingText:`${u(n.pendingSegments)} 段`,seenText:tt(n.lastActivityAt,t),busy:l&&i!==""&&r.currentSessionId===i,cancelDisabled:!l}}function Pt(e){const t=e&&typeof e=="object"?e:{};return`${u(t.sessions)} 个会话、共 ${u(t.segments)} 段`}function at(e){const t=u(e)*rt;return t<60?"不到 1 分钟":`约 ${Math.round(t/60)} 分钟`}function Bt({sessions:e,segments:t,max:r}={}){const n=u(e),i=u(t),l=r==null?nt:u(r),d=at(i);return[`补交全部：共 ${n} 个会话、${i} 段，${d}。`,"补交会把这些历史对话写进 OpenViking 并抽取记忆，写出去的记忆不会自动撤销；",`单次最多 ${l} 段，超出部分要再点一次。`].join(`
`)}function Et(e){const t=e&&typeof e=="object"?e:{},r=u(t.done),n=u(t.total);if(t.running===!0)return`补交中 · ${typeof t.currentLabel=="string"?t.currentLabel:""}（${r}/${n} 段）`;const i=typeof t.error=="string"?t.error.trim():"";return i?`上次补交出错：${i}`:r>0?`上次补交完成 ${r}/${n} 段`:""}export{gt as A,nt as B,_t as C,se as D,dt as S,mt as a,Xe as b,$t as c,ft as d,wt as e,ie as f,ut as g,St as h,Ct as i,ht as j,kt as k,xt as l,vt as m,le as n,yt as o,Tt as p,Pt as q,Et as r,Ge as s,At as t,Bt as u,tt as v,pt as w,bt as x,qe as y,Rt as z};
