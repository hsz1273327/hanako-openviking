import{h as Re,F as $e,C as Ae,d as Ee,o as v,c as T,a as R,n as Z,r as I,t as Pe,b as V,e as ee,G as Be}from"./chunk-vue.js";import{d as ze,c as je,a as te,e as a,ap as ne,f as W,b as p,g as re,m as ae,a4 as H,o as b,p as c,u as Fe,h as Me,i as Ve,s as De,t as C,a1 as K,a0 as m,l as G,r as k,a8 as Ne,aq as Oe}from"./chunk-theme.js";import{hana as _}from"./sdk.js";function ie(e,t=!0,n=[]){return e.forEach(r=>{if(r!==null){if(typeof r!="object"){(typeof r=="string"||typeof r=="number")&&n.push(Re(String(r)));return}if(Array.isArray(r)){ie(r,t,n);return}if(r.type===$e){if(r.children===null)return;Array.isArray(r.children)&&ie(r.children,t,n)}else{if(r.type===Ae&&t)return;n.push(r)}}}),n}function ht(e,t="default",n=[]){const r=e.$slots[t];return r===void 0?n:r()}var Le={buttonHeightSmall:"14px",buttonHeightMedium:"18px",buttonHeightLarge:"22px",buttonWidthSmall:"14px",buttonWidthMedium:"18px",buttonWidthLarge:"22px",buttonWidthPressedSmall:"20px",buttonWidthPressedMedium:"24px",buttonWidthPressedLarge:"28px",railHeightSmall:"18px",railHeightMedium:"22px",railHeightLarge:"26px",railWidthSmall:"32px",railWidthMedium:"40px",railWidthLarge:"48px"};function Ue(e){const{primaryColor:t,opacityDisabled:n,borderRadius:r,textColor3:i}=e;return{...Le,iconColor:i,textColor:"white",loadingColor:t,opacityDisabled:n,railColor:"rgba(0, 0, 0, .14)",railColorActive:t,buttonBoxShadow:"0 1px 4px 0 rgba(0, 0, 0, 0.3), inset 0 0 1px 0 rgba(0, 0, 0, 0.05)",buttonColor:"#FFF",railBorderRadiusSmall:r,railBorderRadiusMedium:r,railBorderRadiusLarge:r,buttonBorderRadiusSmall:r,buttonBorderRadiusMedium:r,buttonBorderRadiusLarge:r,boxShadowFocus:`0 0 0 2px ${je(t,{alpha:.2})}`}}const Ie={common:ze,self:Ue};var We=te("switch",`
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
 `)])]);const He=["aria-checked","tabindex","onClick","onFocus","onBlur","onKeyup","onKeydown"],Ke={...ae.props,size:String,value:{type:[String,Number,Boolean],default:void 0},loading:Boolean,defaultValue:{type:[String,Number,Boolean],default:!1},disabled:{type:Boolean,default:void 0},round:{type:Boolean,default:!0},"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array],checkedValue:{type:[String,Number,Boolean],default:!0},uncheckedValue:{type:[String,Number,Boolean],default:!1},railStyle:Function,rubberBand:{type:Boolean,default:!0},spinProps:Object,onChange:[Function,Array]};let P;var bt=Ee({name:"Switch",props:Ke,slots:Object,setup(e){P===void 0&&(typeof CSS<"u"?typeof CSS.supports<"u"?P=CSS.supports("width","max(1px)"):P=!1:P=!0);const{mergedClsPrefixRef:t,inlineThemeDisabled:n,mergedComponentPropsRef:r}=Fe(e),i=ae("Switch","-switch",We,Ie,e,t),l=Me(e,{mergedSize(o){if(e.size!==void 0)return e.size;if(o)return o.mergedSize.value;const S=r?.value?.Switch?.size;return S||"medium"}}),{mergedSizeRef:d,mergedDisabledRef:f}=l,$=I(e.defaultValue),B=Pe(e,"value"),x=Ve(B,$),z=V(()=>x.value===e.checkedValue),s=I(!1),h=I(!1),A=V(()=>{const{railStyle:o}=e;if(o)return o({focused:h.value,checked:z.value})});function j(o){const{"onUpdate:value":S,onChange:F,onUpdateValue:M}=e,{nTriggerFormInput:D,nTriggerFormChange:N}=l;S&&G(S,o),M&&G(M,o),F&&G(F,o),$.value=o,D(),N()}function de(){const{nTriggerFormFocus:o}=l;o()}function fe(){const{nTriggerFormBlur:o}=l;o()}function he(){e.loading||f.value||(x.value!==e.checkedValue?j(e.checkedValue):j(e.uncheckedValue))}function be(){h.value=!0,de()}function pe(){h.value=!1,fe(),s.value=!1}function me(o){e.loading||f.value||o.key===" "&&(x.value!==e.checkedValue?j(e.checkedValue):j(e.uncheckedValue),s.value=!1)}function ge(o){e.loading||f.value||o.key===" "&&(o.preventDefault(),s.value=!0)}const J=V(()=>{const{value:o}=d,{self:{opacityDisabled:S,railColor:F,railColorActive:M,buttonBoxShadow:D,buttonColor:N,boxShadowFocus:ye,loadingColor:ve,textColor:we,iconColor:xe,[C("buttonHeight",o)]:g,[C("buttonWidth",o)]:Se,[C("buttonWidthPressed",o)]:Ce,[C("railHeight",o)]:y,[C("railWidth",o)]:E,[C("railBorderRadius",o)]:ke,[C("buttonBorderRadius",o)]:_e},common:{cubicBezierEaseInOut:Te}}=i.value;let O,L,U;return P?(O=`calc((${y} - ${g}) / 2)`,L=`max(${y}, ${g})`,U=`max(${E}, calc(${E} + ${g} - ${y}))`):(O=K((m(y)-m(g))/2),L=K(Math.max(m(y),m(g))),U=m(y)>m(g)?E:K(m(E)+m(g)-m(y))),{"--n-bezier":Te,"--n-button-border-radius":_e,"--n-button-box-shadow":D,"--n-button-color":N,"--n-button-width":Se,"--n-button-width-pressed":Ce,"--n-button-height":g,"--n-height":L,"--n-offset":O,"--n-opacity-disabled":S,"--n-rail-border-radius":ke,"--n-rail-color":F,"--n-rail-color-active":M,"--n-rail-height":y,"--n-rail-width":E,"--n-width":U,"--n-box-shadow-focus":ye,"--n-loading-color":ve,"--n-text-color":we,"--n-icon-color":xe}}),Q=n?De("switch",V(()=>d.value[0]),J,e):void 0;return{handleClick:he,handleBlur:pe,handleFocus:be,handleKeyup:me,handleKeydown:ge,mergedRailStyle:A,pressed:s,mergedClsPrefix:t,mergedValue:x,checked:z,mergedDisabled:f,cssVars:n?void 0:J,themeClass:Q?.themeClass,onRender:Q?.onRender}},render(){const{mergedClsPrefix:e,mergedDisabled:t,checked:n,mergedRailStyle:r,onRender:i,$slots:l}=this;i?.();const{checked:d,unchecked:f,icon:$,"checked-icon":B,"unchecked-icon":x}=l,z=!(H($)&&H(B)&&H(x));return v(),T("div",{role:"switch","aria-checked":n,class:c([`${e}-switch`,this.themeClass,z&&`${e}-switch--icon`,n&&`${e}-switch--active`,t&&`${e}-switch--disabled`,this.round&&`${e}-switch--round`,this.loading&&`${e}-switch--loading`,this.pressed&&`${e}-switch--pressed`,this.rubberBand&&`${e}-switch--rubber-band`]),tabindex:this.mergedDisabled?void 0:0,style:Z(this.cssVars),onClick:this.handleClick,onFocus:this.handleFocus,onBlur:this.handleBlur,onKeyup:this.handleKeyup,onKeydown:this.handleKeydown},[R("div",{class:c(`${e}-switch__rail`),"aria-hidden":"true",style:Z(r)},[b(()=>k(d,s=>k(f,h=>s||h?(v(),T("div",{key:4,"aria-hidden":!0,class:c(`${e}-switch__children-placeholder`)},[R("div",{class:c(`${e}-switch__rail-placeholder`)},[R("div",{class:c(`${e}-switch__button-placeholder`)},null,2),b(()=>s)],2),R("div",{class:c(`${e}-switch__rail-placeholder`)},[R("div",{class:c(`${e}-switch__button-placeholder`)},null,2),b(()=>h)],2)],2)):null))),R("div",{class:c(`${e}-switch__button`)},[b(()=>k($,s=>k(B,h=>k(x,A=>(v(),ee(Oe,null,{default:()=>this.loading?(v(),ee(Ne,Be({key:"loading",clsPrefix:e,strokeWidth:20},this.spinProps),null,16,["clsPrefix"])):this.checked&&(h||s)?(v(),T("div",{class:c(`${e}-switch__button-icon`),key:h?"checked-icon":"icon"},[b(()=>h||s)],2)):!this.checked&&(A||s)?(v(),T("div",{class:c(`${e}-switch__button-icon`),key:A?"unchecked-icon":"icon"},[b(()=>A||s)],2)):null},1024)))))),b(()=>k(d,s=>s&&(v(),T("div",{key:"checked",class:c(`${e}-switch__checked`)},[b(()=>s)],2)))),b(()=>k(f,s=>s&&(v(),T("div",{key:"unchecked",class:c(`${e}-switch__unchecked`)},[b(()=>s)],2))))],2)],6)],46,He)}});const Ge=/^[0-9a-f]{8}-[0-9a-f]{4}/;function Xe(e){return e.slice(e.lastIndexOf("_")+1)}function Ye(e){const t=typeof e?.sessionPath=="string"?e.sessionPath:"";return qe(t)}function qe(e){if(typeof e!="string")return"";const t=e.trim();if(!t)return"";const r=(t.split(/[/\\]/).filter(Boolean).pop()||"").replace(/\.jsonl$/i,"").replace(/\.json$/i,"");if(!r||r==="."||r===".."||r.startsWith("sess_"))return"";const i=Xe(r);return!i||i.startsWith("sess_")||!Ge.test(i)?"":i}async function pt(e){return(await _.api.fetch(e)).json()}async function mt(e,t){return(await _.api.fetch(e,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)})).json()}async function gt(e,t){return(await _.api.fetch(e,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)})).json()}async function yt(e){return(await _.api.fetch(e,{method:"DELETE"})).json()}function vt(){_.ready()}async function Je(){try{return await _.sessions.getActive()}catch{return null}}async function wt(){return Ye(await Je())||null}function xt(e){try{const t=_.sessions.onActiveChanged(e);return typeof t=="function"?t:null}catch{return null}}const w="暂无",Qe=2e3,Ze=4e3,se="下面有几个已知话题，和一段新的对话。先判断这段在讲什么，再决定它属于哪个。";function le(e){return typeof e!="string"||!e?"":Array.from(e).slice(0,Qe).join("")}function St(e,t=!1){const n=le(e);return n||(t?"":se)}function Ct(e){const t=le(e);return t===se?"当前为默认题面":t.trim()?"已修改":"已修改 · 题面为空时使用内置默认"}const ce=["{{question}}","","已有话题：","{{candidates}}","","之前（供参考）：","{{previous}}","","对话：","{{current}}","","{{format}}"].join(`
`);function ue(e){return typeof e!="string"||!e?"":Array.from(e).slice(0,Ze).join("")}function kt(e,t=!1){const n=ue(e);return n||(t?"":ce)}function _t(e){const t=ue(e);return t===ce?"当前为默认模板":t.trim()?"已修改":"已修改 · 模板为空时使用内置默认"}const Tt=Object.freeze([1,100]),Rt=Object.freeze([1,20]),$t=Object.freeze([1,50]),At=Object.freeze([1,20]),Et=Object.freeze([60,86400]),et=Object.freeze({captureServiceUrl:"判别服务地址",systemoneServiceModel:"决策服务模型"});function tt(e){if(e==null)return"";const t=typeof e=="number"?e:Date.parse(e);if(!Number.isFinite(t))return"";try{return new Date(t).toLocaleString("zh-CN")}catch{return""}}function X(e){if(e==null)return"";const t=Number(e);return!Number.isFinite(t)||t<0?"":String(Math.floor(t))}function nt(e,t={}){const n=!!e&&typeof e=="object";if(t.active===!1||t.autoCapture===!1||!n)return{written:w,lastCommit:w,pending:w,topics:w,disabled:!0};const i=X(e.written),l=tt(e.lastCommitAt),d=X(e.pendingTurns),f=X(e.topics);return{written:i!==""?`${i} 条`:w,lastCommit:l||w,pending:d!==""?`${d} 轮`:w,topics:f!==""?`${f} 个`:w,disabled:!1}}function Pt(e,t={}){const n=nt(e,t);return[{key:"written",label:"本会话已写",value:n.written},{key:"lastCommit",label:"上次提交",value:n.lastCommit},{key:"pending",label:"待提交",value:n.pending},{key:"topics",label:"本会话话题数",value:n.topics}]}function Bt(e){if(!e||typeof e!="object"||e.early===!0||e.earlyStored!==!0)return"";const t=(Array.isArray(e.missing)?e.missing:[]).map(n=>et[n]||String(n||"")).filter(Boolean);return t.length?`当前不提前提交：还缺 ${t.join("、")}`:"当前不提前提交"}const Y=60*1e3,q=60*Y,oe=24*q;function rt(e){if(typeof e=="number")return Number.isFinite(e)?e:null;if(typeof e!="string")return null;const t=e.trim();if(!t)return null;if(/^-?\d+$/.test(t)){const r=Number(t);return Number.isFinite(r)?r:null}const n=Date.parse(t);return Number.isFinite(n)?n:null}function it(e,t){const n=rt(e);if(n===null)return"—";const i=(Number.isFinite(Number(t))?Number(t):Date.now())-n;return i<Y?"刚刚":i<q?`${Math.floor(i/Y)} 分钟前`:i<oe?`${Math.floor(i/q)} 小时前`:`${Math.floor(i/oe)} 天前`}const ot=200,at=1.5,st=/^[0-9a-f]{8}-[0-9a-f]{4}/i;function u(e){if(typeof e=="number"&&Number.isFinite(e))return Math.max(0,Math.floor(e));if(typeof e=="string"&&e.trim()){const t=Number(e.trim());if(Number.isFinite(t))return Math.max(0,Math.floor(t))}return 0}function lt(e){const t=typeof e=="string"?e.trim():"";return st.test(t)?t.slice(0,8):""}function zt(e){if(e==null)return"—";const t=u(e);return t>0?`欠 ${t} 段`:"已补完"}function jt(e,t,n={}){const r=e&&typeof e=="object"?e:{},i=typeof r.sessionId=="string"?r.sessionId:"",l=n.running===!0;return{sessionId:i,shortId:lt(i),messagesText:String(u(r.messages)),writtenText:String(u(r.written)),pendingText:`${u(r.pendingSegments)} 段`,seenText:it(r.lastActivityAt,t),busy:l&&i!==""&&n.currentSessionId===i,cancelDisabled:!l}}function Ft(e){const t=e&&typeof e=="object"?e:{};return`${u(t.sessions)} 个会话、共 ${u(t.segments)} 段`}function ct(e){const t=u(e)*at;return t<60?"不到 1 分钟":`约 ${Math.round(t/60)} 分钟`}function Mt({sessions:e,segments:t,max:n}={}){const r=u(e),i=u(t),l=n==null?ot:u(n),d=ct(i);return[`补交全部：共 ${r} 个会话、${i} 段，${d}。`,"补交会把这些历史对话写进 OpenViking 并抽取记忆，写出去的记忆不会自动撤销；",`单次最多 ${l} 段，超出部分要再点一次。`].join(`
`)}function Vt(e){const t=e&&typeof e=="object"?e:{},n=u(t.done),r=u(t.total);if(t.running===!0)return`补交中 · ${typeof t.currentLabel=="string"?t.currentLabel:""}（${n}/${r} 段）`;const i=typeof t.error=="string"?t.error.trim():"";return i?`上次补交出错：${i}`:n>0?`上次补交完成 ${n}/${r} 段`:""}export{yt as A,ot as B,Et as C,se as D,gt as E,Qe as F,Ze as G,Bt as H,wt as I,bt as S,vt as a,Je as b,Pt as c,pt as d,_t as e,ie as f,ht as g,Ct as h,Rt as i,mt as j,$t as k,At as l,Tt as m,ue as n,xt as o,zt as p,le as q,St as r,Ye as s,kt as t,ce as u,Ft as v,Vt as w,jt as x,Mt as y,it as z};
