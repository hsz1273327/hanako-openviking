import{h as we,F as ye,C as xe,d as Se,o as g,c as k,a as C,n as X,r as H,t as ke,b as T,e as J,G as Ce}from"./chunk-vue.js";import{d as _e,c as Re,a as q,e as a,am as Q,f as K,b as h,g as Z,m as ne,a4 as U,o as u,p as l,u as Be,h as $e,i as ze,s as Ve,t as x,a1 as I,a0 as f,l as G,r as S,a8 as Fe,an as Pe}from"./chunk-theme.js";import{hana as V}from"./sdk.js";function ee(e,t=!0,i=[]){return e.forEach(n=>{if(n!==null){if(typeof n!="object"){(typeof n=="string"||typeof n=="number")&&i.push(we(String(n)));return}if(Array.isArray(n)){ee(n,t,i);return}if(n.type===ye){if(n.children===null)return;Array.isArray(n.children)&&ee(n.children,t,i)}else{if(n.type===xe&&t)return;i.push(n)}}}),i}function qe(e,t="default",i=[]){const n=e.$slots[t];return n===void 0?i:n()}var Ae={buttonHeightSmall:"14px",buttonHeightMedium:"18px",buttonHeightLarge:"22px",buttonWidthSmall:"14px",buttonWidthMedium:"18px",buttonWidthLarge:"22px",buttonWidthPressedSmall:"20px",buttonWidthPressedMedium:"24px",buttonWidthPressedLarge:"28px",railHeightSmall:"18px",railHeightMedium:"22px",railHeightLarge:"26px",railWidthSmall:"32px",railWidthMedium:"40px",railWidthLarge:"48px"};function je(e){const{primaryColor:t,opacityDisabled:i,borderRadius:n,textColor3:s}=e;return{...Ae,iconColor:s,textColor:"white",loadingColor:t,opacityDisabled:i,railColor:"rgba(0, 0, 0, .14)",railColorActive:t,buttonBoxShadow:"0 1px 4px 0 rgba(0, 0, 0, 0.3), inset 0 0 1px 0 rgba(0, 0, 0, 0.05)",buttonColor:"#FFF",railBorderRadiusSmall:n,railBorderRadiusMedium:n,railBorderRadiusLarge:n,buttonBorderRadiusSmall:n,buttonBorderRadiusMedium:n,buttonBorderRadiusLarge:n,boxShadowFocus:`0 0 0 2px ${Re(t,{alpha:.2})}`}}const Me={common:_e,self:je};var Te=q("switch",`
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
 `),K("&:focus",[a("rail",`
 box-shadow: var(--n-box-shadow-focus);
 `)]),h("round",[a("rail","border-radius: calc(var(--n-rail-height) / 2);",[a("button","border-radius: calc(var(--n-button-height) / 2);")])]),Z("disabled",[Z("icon",[h("rubber-band",[h("pressed",[a("rail",[a("button","max-width: var(--n-button-width-pressed);")])]),a("rail",[K("&:active",[a("button","max-width: var(--n-button-width-pressed);")])]),h("active",[h("pressed",[a("rail",[a("button","left: calc(100% - var(--n-offset) - var(--n-button-width-pressed));")])]),a("rail",[K("&:active",[a("button","left: calc(100% - var(--n-offset) - var(--n-button-width-pressed));")])])])])])]),h("active",[a("rail",[a("button","left: calc(100% - var(--n-button-width) - var(--n-offset))")])]),a("rail",`
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
 `)])]);const We=["aria-checked","tabindex","onClick","onFocus","onBlur","onKeyup","onKeydown"],Ee={...ne.props,size:String,value:{type:[String,Number,Boolean],default:void 0},loading:Boolean,defaultValue:{type:[String,Number,Boolean],default:!1},disabled:{type:Boolean,default:void 0},round:{type:Boolean,default:!0},"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array],checkedValue:{type:[String,Number,Boolean],default:!0},uncheckedValue:{type:[String,Number,Boolean],default:!1},railStyle:Function,rubberBand:{type:Boolean,default:!0},spinProps:Object,onChange:[Function,Array]};let z;var Qe=Se({name:"Switch",props:Ee,slots:Object,setup(e){z===void 0&&(typeof CSS<"u"?typeof CSS.supports<"u"?z=CSS.supports("width","max(1px)"):z=!1:z=!0);const{mergedClsPrefixRef:t,inlineThemeDisabled:i,mergedComponentPropsRef:n}=Be(e),s=ne("Switch","-switch",Te,Me,e,t),d=$e(e,{mergedSize(r){if(e.size!==void 0)return e.size;if(r)return r.mergedSize.value;const y=n?.value?.Switch?.size;return y||"medium"}}),{mergedSizeRef:b,mergedDisabledRef:v}=d,R=H(e.defaultValue),F=ke(e,"value"),w=ze(F,R),P=T(()=>w.value===e.checkedValue),o=H(!1),c=H(!1),B=T(()=>{const{railStyle:r}=e;if(r)return r({focused:c.value,checked:P.value})});function A(r){const{"onUpdate:value":y,onChange:j,onUpdateValue:M}=e,{nTriggerFormInput:W,nTriggerFormChange:E}=d;y&&G(y,r),M&&G(M,r),j&&G(j,r),R.value=r,W(),E()}function re(){const{nTriggerFormFocus:r}=d;r()}function ie(){const{nTriggerFormBlur:r}=d;r()}function ae(){e.loading||v.value||(w.value!==e.checkedValue?A(e.checkedValue):A(e.uncheckedValue))}function oe(){c.value=!0,re()}function se(){c.value=!1,ie(),o.value=!1}function le(r){e.loading||v.value||r.key===" "&&(w.value!==e.checkedValue?A(e.checkedValue):A(e.uncheckedValue),o.value=!1)}function ce(r){e.loading||v.value||r.key===" "&&(r.preventDefault(),o.value=!0)}const Y=T(()=>{const{value:r}=b,{self:{opacityDisabled:y,railColor:j,railColorActive:M,buttonBoxShadow:W,buttonColor:E,boxShadowFocus:ue,loadingColor:de,textColor:he,iconColor:fe,[x("buttonHeight",r)]:m,[x("buttonWidth",r)]:be,[x("buttonWidthPressed",r)]:me,[x("railHeight",r)]:p,[x("railWidth",r)]:$,[x("railBorderRadius",r)]:pe,[x("buttonBorderRadius",r)]:ge},common:{cubicBezierEaseInOut:ve}}=s.value;let L,O,D;return z?(L=`calc((${p} - ${m}) / 2)`,O=`max(${p}, ${m})`,D=`max(${$}, calc(${$} + ${m} - ${p}))`):(L=I((f(p)-f(m))/2),O=I(Math.max(f(p),f(m))),D=f(p)>f(m)?$:I(f($)+f(m)-f(p))),{"--n-bezier":ve,"--n-button-border-radius":ge,"--n-button-box-shadow":W,"--n-button-color":E,"--n-button-width":be,"--n-button-width-pressed":me,"--n-button-height":m,"--n-height":O,"--n-offset":L,"--n-opacity-disabled":y,"--n-rail-border-radius":pe,"--n-rail-color":j,"--n-rail-color-active":M,"--n-rail-height":p,"--n-rail-width":$,"--n-width":D,"--n-box-shadow-focus":ue,"--n-loading-color":de,"--n-text-color":he,"--n-icon-color":fe}}),N=i?Ve("switch",T(()=>b.value[0]),Y,e):void 0;return{handleClick:ae,handleBlur:se,handleFocus:oe,handleKeyup:le,handleKeydown:ce,mergedRailStyle:B,pressed:o,mergedClsPrefix:t,mergedValue:w,checked:P,mergedDisabled:v,cssVars:i?void 0:Y,themeClass:N?.themeClass,onRender:N?.onRender}},render(){const{mergedClsPrefix:e,mergedDisabled:t,checked:i,mergedRailStyle:n,onRender:s,$slots:d}=this;s?.();const{checked:b,unchecked:v,icon:R,"checked-icon":F,"unchecked-icon":w}=d,P=!(U(R)&&U(F)&&U(w));return g(),k("div",{role:"switch","aria-checked":i,class:l([`${e}-switch`,this.themeClass,P&&`${e}-switch--icon`,i&&`${e}-switch--active`,t&&`${e}-switch--disabled`,this.round&&`${e}-switch--round`,this.loading&&`${e}-switch--loading`,this.pressed&&`${e}-switch--pressed`,this.rubberBand&&`${e}-switch--rubber-band`]),tabindex:this.mergedDisabled?void 0:0,style:X(this.cssVars),onClick:this.handleClick,onFocus:this.handleFocus,onBlur:this.handleBlur,onKeyup:this.handleKeyup,onKeydown:this.handleKeydown},[C("div",{class:l(`${e}-switch__rail`),"aria-hidden":"true",style:X(n)},[u(()=>S(b,o=>S(v,c=>o||c?(g(),k("div",{key:4,"aria-hidden":!0,class:l(`${e}-switch__children-placeholder`)},[C("div",{class:l(`${e}-switch__rail-placeholder`)},[C("div",{class:l(`${e}-switch__button-placeholder`)},null,2),u(()=>o)],2),C("div",{class:l(`${e}-switch__rail-placeholder`)},[C("div",{class:l(`${e}-switch__button-placeholder`)},null,2),u(()=>c)],2)],2)):null))),C("div",{class:l(`${e}-switch__button`)},[u(()=>S(R,o=>S(F,c=>S(w,B=>(g(),J(Pe,null,{default:()=>this.loading?(g(),J(Fe,Ce({key:"loading",clsPrefix:e,strokeWidth:20},this.spinProps),null,16,["clsPrefix"])):this.checked&&(c||o)?(g(),k("div",{class:l(`${e}-switch__button-icon`),key:c?"checked-icon":"icon"},[u(()=>c||o)],2)):!this.checked&&(B||o)?(g(),k("div",{class:l(`${e}-switch__button-icon`),key:B?"unchecked-icon":"icon"},[u(()=>B||o)],2)):null},1024)))))),u(()=>S(b,o=>o&&(g(),k("div",{key:"checked",class:l(`${e}-switch__checked`)},[u(()=>o)],2)))),u(()=>S(v,o=>o&&(g(),k("div",{key:"unchecked",class:l(`${e}-switch__unchecked`)},[u(()=>o)],2))))],2)],6)],46,We)}});const Le=/^[0-9a-f]{8}-[0-9a-f]{4}/;function Oe(e){return e.slice(e.lastIndexOf("_")+1)}function De(e){const t=typeof e?.sessionPath=="string"?e.sessionPath:"";return He(t)}function He(e){if(typeof e!="string")return"";const t=e.trim();if(!t)return"";const n=(t.split(/[/\\]/).filter(Boolean).pop()||"").replace(/\.jsonl$/i,"").replace(/\.json$/i,"");if(!n||n==="."||n===".."||n.startsWith("sess_"))return"";const s=Oe(n);return!s||s.startsWith("sess_")||!Le.test(s)?"":s}async function Ze(e){return(await V.api.fetch(e)).json()}async function et(e,t){return(await V.api.fetch(e,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)})).json()}function tt(){V.ready()}async function Ke(){try{return await V.sessions.getActive()}catch{return null}}async function nt(){return De(await Ke())||null}function rt(e){try{const t=V.sessions.onActiveChanged(e);return typeof t=="function"?t:null}catch{return null}}const _="暂无",it=Object.freeze([1,100]),at=Object.freeze([60,86400]),Ue=Object.freeze({fixed:"固定轮次",llm:"语言模型判断",discriminator:"判别模型判断"});function ot(){return["fixed","llm","discriminator"].map(e=>({value:e,label:Ue[e]}))}const Ie=Object.freeze({captureModel:"判断模型",captureServiceUrl:"判别服务地址",systemoneServiceModel:"决策服务模型"});function Ge(e){if(e==null)return"";const t=typeof e=="number"?e:Date.parse(e);if(!Number.isFinite(t))return"";try{return new Date(t).toLocaleString("zh-CN")}catch{return""}}function te(e){if(e==null)return"";const t=Number(e);return!Number.isFinite(t)||t<0?"":String(Math.floor(t))}function Ye(e,t={}){const i=!!e&&typeof e=="object";if(t.active===!1||t.autoCapture===!1||!i)return{written:_,lastCommit:_,pending:_,disabled:!0};const s=te(e.written),d=Ge(e.lastCommitAt),b=te(e.pendingTurns);return{written:s!==""?`${s} 条`:_,lastCommit:d||_,pending:b!==""?`${b} 轮`:_,disabled:!1}}function st(e,t={}){const i=Ye(e,t);return[{key:"written",label:"本会话已写",value:i.written},{key:"lastCommit",label:"上次提交",value:i.lastCommit},{key:"pending",label:"待提交",value:i.pending}]}function lt(e){if(!e||typeof e!="object"||!e.mode||!e.effectiveMode||e.effectiveMode===e.mode)return"";const t=(Array.isArray(e.missing)?e.missing:[]).map(i=>Ie[i]||String(i||"")).filter(Boolean);return t.length?`当前回落到固定轮次：还缺 ${t.join("、")}`:"当前回落到固定轮次"}export{at as C,Qe as S,tt as a,Ke as b,st as c,et as d,it as e,ee as f,qe as g,ot as h,lt as i,Ze as j,nt as k,rt as o,De as s};
