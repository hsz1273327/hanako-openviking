import{h as xe,F as Se,C as Ce,d as ke,o as g,c as C,a as k,n as X,r as U,t as _e,b as j,e as J,G as Re}from"./chunk-vue.js";import{d as Be,c as $e,a as q,e as a,am as Q,f as H,b as h,g as Z,m as ne,a4 as K,o as u,p as l,u as ze,h as Pe,i as Ae,s as Fe,t as x,a1 as I,a0 as f,l as G,r as S,a8 as Te,an as Ve}from"./chunk-theme.js";import{hana as P}from"./sdk.js";function ee(e,t=!0,r=[]){return e.forEach(n=>{if(n!==null){if(typeof n!="object"){(typeof n=="string"||typeof n=="number")&&r.push(xe(String(n)));return}if(Array.isArray(n)){ee(n,t,r);return}if(n.type===Se){if(n.children===null)return;Array.isArray(n.children)&&ee(n.children,t,r)}else{if(n.type===Ce&&t)return;r.push(n)}}}),r}function et(e,t="default",r=[]){const n=e.$slots[t];return n===void 0?r:n()}var Me={buttonHeightSmall:"14px",buttonHeightMedium:"18px",buttonHeightLarge:"22px",buttonWidthSmall:"14px",buttonWidthMedium:"18px",buttonWidthLarge:"22px",buttonWidthPressedSmall:"20px",buttonWidthPressedMedium:"24px",buttonWidthPressedLarge:"28px",railHeightSmall:"18px",railHeightMedium:"22px",railHeightLarge:"26px",railWidthSmall:"32px",railWidthMedium:"40px",railWidthLarge:"48px"};function je(e){const{primaryColor:t,opacityDisabled:r,borderRadius:n,textColor3:s}=e;return{...Me,iconColor:s,textColor:"white",loadingColor:t,opacityDisabled:r,railColor:"rgba(0, 0, 0, .14)",railColorActive:t,buttonBoxShadow:"0 1px 4px 0 rgba(0, 0, 0, 0.3), inset 0 0 1px 0 rgba(0, 0, 0, 0.05)",buttonColor:"#FFF",railBorderRadiusSmall:n,railBorderRadiusMedium:n,railBorderRadiusLarge:n,buttonBorderRadiusSmall:n,buttonBorderRadiusMedium:n,buttonBorderRadiusLarge:n,boxShadowFocus:`0 0 0 2px ${$e(t,{alpha:.2})}`}}const Ee={common:Be,self:je};var We=q("switch",`
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
 `),q("base-loading",`
 position: absolute;
 top: 50%;
 left: 50%;
 transform: translateX(-50%) translateY(-50%);
 font-size: calc(var(--n-button-width) - 4px);
 color: var(--n-loading-color);
 transition: color .3s var(--n-bezier);
 `,[Q({left:"50%",top:"50%",originalTransform:"translateX(-50%) translateY(-50%)"})]),a("checked, unchecked",`
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
 `),H("&:focus",[a("rail",`
 box-shadow: var(--n-box-shadow-focus);
 `)]),h("round",[a("rail","border-radius: calc(var(--n-rail-height) / 2);",[a("button","border-radius: calc(var(--n-button-height) / 2);")])]),Z("disabled",[Z("icon",[h("rubber-band",[h("pressed",[a("rail",[a("button","max-width: var(--n-button-width-pressed);")])]),a("rail",[H("&:active",[a("button","max-width: var(--n-button-width-pressed);")])]),h("active",[h("pressed",[a("rail",[a("button","left: calc(100% - var(--n-offset) - var(--n-button-width-pressed));")])]),a("rail",[H("&:active",[a("button","left: calc(100% - var(--n-offset) - var(--n-button-width-pressed));")])])])])])]),h("active",[a("rail",[a("button","left: calc(100% - var(--n-button-width) - var(--n-offset))")])]),a("rail",`
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
 `,[Q()]),a("button",`
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
 `)]),h("active",[a("rail","background-color: var(--n-rail-color-active);")]),h("loading",[a("rail",`
 cursor: wait;
 `)]),h("disabled",[a("rail",`
 cursor: not-allowed;
 opacity: .5;
 `)])]);const Le=["aria-checked","tabindex","onClick","onFocus","onBlur","onKeyup","onKeydown"],Oe={...ne.props,size:String,value:{type:[String,Number,Boolean],default:void 0},loading:Boolean,defaultValue:{type:[String,Number,Boolean],default:!1},disabled:{type:Boolean,default:void 0},round:{type:Boolean,default:!0},"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array],checkedValue:{type:[String,Number,Boolean],default:!0},uncheckedValue:{type:[String,Number,Boolean],default:!1},railStyle:Function,rubberBand:{type:Boolean,default:!0},spinProps:Object,onChange:[Function,Array]};let z;var tt=ke({name:"Switch",props:Oe,slots:Object,setup(e){z===void 0&&(typeof CSS<"u"?typeof CSS.supports<"u"?z=CSS.supports("width","max(1px)"):z=!1:z=!0);const{mergedClsPrefixRef:t,inlineThemeDisabled:r,mergedComponentPropsRef:n}=ze(e),s=ne("Switch","-switch",We,Ee,e,t),d=Pe(e,{mergedSize(i){if(e.size!==void 0)return e.size;if(i)return i.mergedSize.value;const w=n?.value?.Switch?.size;return w||"medium"}}),{mergedSizeRef:b,mergedDisabledRef:v}=d,R=U(e.defaultValue),A=_e(e,"value"),y=Ae(A,R),F=j(()=>y.value===e.checkedValue),o=U(!1),c=U(!1),B=j(()=>{const{railStyle:i}=e;if(i)return i({focused:c.value,checked:F.value})});function T(i){const{"onUpdate:value":w,onChange:V,onUpdateValue:M}=e,{nTriggerFormInput:E,nTriggerFormChange:W}=d;w&&G(w,i),M&&G(M,i),V&&G(V,i),R.value=i,E(),W()}function ae(){const{nTriggerFormFocus:i}=d;i()}function oe(){const{nTriggerFormBlur:i}=d;i()}function se(){e.loading||v.value||(y.value!==e.checkedValue?T(e.checkedValue):T(e.uncheckedValue))}function le(){c.value=!0,ae()}function ce(){c.value=!1,oe(),o.value=!1}function ue(i){e.loading||v.value||i.key===" "&&(y.value!==e.checkedValue?T(e.checkedValue):T(e.uncheckedValue),o.value=!1)}function de(i){e.loading||v.value||i.key===" "&&(i.preventDefault(),o.value=!0)}const Y=j(()=>{const{value:i}=b,{self:{opacityDisabled:w,railColor:V,railColorActive:M,buttonBoxShadow:E,buttonColor:W,boxShadowFocus:he,loadingColor:fe,textColor:be,iconColor:me,[x("buttonHeight",i)]:m,[x("buttonWidth",i)]:pe,[x("buttonWidthPressed",i)]:ge,[x("railHeight",i)]:p,[x("railWidth",i)]:$,[x("railBorderRadius",i)]:ve,[x("buttonBorderRadius",i)]:ye},common:{cubicBezierEaseInOut:we}}=s.value;let L,O,D;return z?(L=`calc((${p} - ${m}) / 2)`,O=`max(${p}, ${m})`,D=`max(${$}, calc(${$} + ${m} - ${p}))`):(L=I((f(p)-f(m))/2),O=I(Math.max(f(p),f(m))),D=f(p)>f(m)?$:I(f($)+f(m)-f(p))),{"--n-bezier":we,"--n-button-border-radius":ye,"--n-button-box-shadow":E,"--n-button-color":W,"--n-button-width":pe,"--n-button-width-pressed":ge,"--n-button-height":m,"--n-height":O,"--n-offset":L,"--n-opacity-disabled":w,"--n-rail-border-radius":ve,"--n-rail-color":V,"--n-rail-color-active":M,"--n-rail-height":p,"--n-rail-width":$,"--n-width":D,"--n-box-shadow-focus":he,"--n-loading-color":fe,"--n-text-color":be,"--n-icon-color":me}}),N=r?Fe("switch",j(()=>b.value[0]),Y,e):void 0;return{handleClick:se,handleBlur:ce,handleFocus:le,handleKeyup:ue,handleKeydown:de,mergedRailStyle:B,pressed:o,mergedClsPrefix:t,mergedValue:y,checked:F,mergedDisabled:v,cssVars:r?void 0:Y,themeClass:N?.themeClass,onRender:N?.onRender}},render(){const{mergedClsPrefix:e,mergedDisabled:t,checked:r,mergedRailStyle:n,onRender:s,$slots:d}=this;s?.();const{checked:b,unchecked:v,icon:R,"checked-icon":A,"unchecked-icon":y}=d,F=!(K(R)&&K(A)&&K(y));return g(),C("div",{role:"switch","aria-checked":r,class:l([`${e}-switch`,this.themeClass,F&&`${e}-switch--icon`,r&&`${e}-switch--active`,t&&`${e}-switch--disabled`,this.round&&`${e}-switch--round`,this.loading&&`${e}-switch--loading`,this.pressed&&`${e}-switch--pressed`,this.rubberBand&&`${e}-switch--rubber-band`]),tabindex:this.mergedDisabled?void 0:0,style:X(this.cssVars),onClick:this.handleClick,onFocus:this.handleFocus,onBlur:this.handleBlur,onKeyup:this.handleKeyup,onKeydown:this.handleKeydown},[k("div",{class:l(`${e}-switch__rail`),"aria-hidden":"true",style:X(n)},[u(()=>S(b,o=>S(v,c=>o||c?(g(),C("div",{key:4,"aria-hidden":!0,class:l(`${e}-switch__children-placeholder`)},[k("div",{class:l(`${e}-switch__rail-placeholder`)},[k("div",{class:l(`${e}-switch__button-placeholder`)},null,2),u(()=>o)],2),k("div",{class:l(`${e}-switch__rail-placeholder`)},[k("div",{class:l(`${e}-switch__button-placeholder`)},null,2),u(()=>c)],2)],2)):null))),k("div",{class:l(`${e}-switch__button`)},[u(()=>S(R,o=>S(A,c=>S(y,B=>(g(),J(Ve,null,{default:()=>this.loading?(g(),J(Te,Re({key:"loading",clsPrefix:e,strokeWidth:20},this.spinProps),null,16,["clsPrefix"])):this.checked&&(c||o)?(g(),C("div",{class:l(`${e}-switch__button-icon`),key:c?"checked-icon":"icon"},[u(()=>c||o)],2)):!this.checked&&(B||o)?(g(),C("div",{class:l(`${e}-switch__button-icon`),key:B?"unchecked-icon":"icon"},[u(()=>B||o)],2)):null},1024)))))),u(()=>S(b,o=>o&&(g(),C("div",{key:"checked",class:l(`${e}-switch__checked`)},[u(()=>o)],2)))),u(()=>S(v,o=>o&&(g(),C("div",{key:"unchecked",class:l(`${e}-switch__unchecked`)},[u(()=>o)],2))))],2)],6)],46,Le)}});const De=/^[0-9a-f]{8}-[0-9a-f]{4}/;function Ue(e){return e.slice(e.lastIndexOf("_")+1)}function He(e){const t=typeof e?.sessionPath=="string"?e.sessionPath:"";return Ke(t)}function Ke(e){if(typeof e!="string")return"";const t=e.trim();if(!t)return"";const n=(t.split(/[/\\]/).filter(Boolean).pop()||"").replace(/\.jsonl$/i,"").replace(/\.json$/i,"");if(!n||n==="."||n===".."||n.startsWith("sess_"))return"";const s=Ue(n);return!s||s.startsWith("sess_")||!De.test(s)?"":s}async function nt(e){return(await P.api.fetch(e)).json()}async function rt(e,t){return(await P.api.fetch(e,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)})).json()}function it(){P.ready()}async function Ie(){try{return await P.sessions.getActive()}catch{return null}}async function at(){return He(await Ie())||null}function ot(e){try{const t=P.sessions.onActiveChanged(e);return typeof t=="function"?t:null}catch{return null}}const _="暂无",Ge=2e3,re="只看下面这两段，它们是不是在讲同一件事？只回 yes 或 no。";function ie(e){return typeof e!="string"||!e?"":Array.from(e).slice(0,Ge).join("")}function st(e,t=!1){const r=ie(e);return r||(t?"":re)}function lt(e){const t=ie(e);return t===re?"当前为默认题面":t.trim()?"已修改":"已修改 · 题面为空时使用内置默认"}const ct=Object.freeze([1,100]),ut=Object.freeze([60,86400]),Ye=Object.freeze({fixed:"固定轮次",llm:"语言模型判断",discriminator:"判别模型判断"});function dt(){return["fixed","llm","discriminator"].map(e=>({value:e,label:Ye[e]}))}const Ne=Object.freeze({captureModel:"判断模型",captureServiceUrl:"判别服务地址",systemoneServiceModel:"决策服务模型"});function Xe(e){if(e==null)return"";const t=typeof e=="number"?e:Date.parse(e);if(!Number.isFinite(t))return"";try{return new Date(t).toLocaleString("zh-CN")}catch{return""}}function te(e){if(e==null)return"";const t=Number(e);return!Number.isFinite(t)||t<0?"":String(Math.floor(t))}function Je(e,t={}){const r=!!e&&typeof e=="object";if(t.active===!1||t.autoCapture===!1||!r)return{written:_,lastCommit:_,pending:_,disabled:!0};const s=te(e.written),d=Xe(e.lastCommitAt),b=te(e.pendingTurns);return{written:s!==""?`${s} 条`:_,lastCommit:d||_,pending:b!==""?`${b} 轮`:_,disabled:!1}}function ht(e,t={}){const r=Je(e,t);return[{key:"written",label:"本会话已写",value:r.written},{key:"lastCommit",label:"上次提交",value:r.lastCommit},{key:"pending",label:"待提交",value:r.pending}]}function ft(e){if(!e||typeof e!="object"||!e.mode||!e.effectiveMode||e.effectiveMode===e.mode)return"";const t=(Array.isArray(e.missing)?e.missing:[]).map(r=>Ne[r]||String(r||"")).filter(Boolean);return t.length?`当前回落到固定轮次：还缺 ${t.join("、")}`:"当前回落到固定轮次"}export{ut as C,re as D,tt as S,it as a,Ie as b,ht as c,rt as d,lt as e,ee as f,et as g,ct as h,st as i,nt as j,dt as k,Ge as l,ft as m,ie as n,ot as o,at as p,He as s};
