import{h as ve,F as me,C as we,d as ye,o as g,c as S,a as k,n as G,r as O,t as xe,b as A,e as J,E as Se}from"./chunk-vue.js";import{d as ke,c as Ce,a as q,e as a,am as Q,f as D,b as u,g as Z,m as ee,a4 as E,o as d,p as s,u as _e,h as Be,i as $e,s as Re,t as y,a1 as U,a0 as h,l as I,r as x,a8 as ze,an as Ve}from"./chunk-theme.js";import{hana as z}from"./sdk.js";function N(e,i=!0,o=[]){return e.forEach(t=>{if(t!==null){if(typeof t!="object"){(typeof t=="string"||typeof t=="number")&&o.push(ve(String(t)));return}if(Array.isArray(t)){N(t,i,o);return}if(t.type===me){if(t.children===null)return;Array.isArray(t.children)&&N(t.children,i,o)}else{if(t.type===we&&i)return;o.push(t)}}}),o}function Ie(e,i="default",o=[]){const t=e.$slots[i];return t===void 0?o:t()}var Fe={buttonHeightSmall:"14px",buttonHeightMedium:"18px",buttonHeightLarge:"22px",buttonWidthSmall:"14px",buttonWidthMedium:"18px",buttonWidthLarge:"22px",buttonWidthPressedSmall:"20px",buttonWidthPressedMedium:"24px",buttonWidthPressedLarge:"28px",railHeightSmall:"18px",railHeightMedium:"22px",railHeightLarge:"26px",railWidthSmall:"32px",railWidthMedium:"40px",railWidthLarge:"48px"};function Pe(e){const{primaryColor:i,opacityDisabled:o,borderRadius:t,textColor3:l}=e;return{...Fe,iconColor:l,textColor:"white",loadingColor:i,opacityDisabled:o,railColor:"rgba(0, 0, 0, .14)",railColorActive:i,buttonBoxShadow:"0 1px 4px 0 rgba(0, 0, 0, 0.3), inset 0 0 1px 0 rgba(0, 0, 0, 0.05)",buttonColor:"#FFF",railBorderRadiusSmall:t,railBorderRadiusMedium:t,railBorderRadiusLarge:t,buttonBorderRadiusSmall:t,buttonBorderRadiusMedium:t,buttonBorderRadiusLarge:t,boxShadowFocus:`0 0 0 2px ${Ce(i,{alpha:.2})}`}}const We={common:ke,self:Pe};var je=q("switch",`
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
 `),D("&:focus",[a("rail",`
 box-shadow: var(--n-box-shadow-focus);
 `)]),u("round",[a("rail","border-radius: calc(var(--n-rail-height) / 2);",[a("button","border-radius: calc(var(--n-button-height) / 2);")])]),Z("disabled",[Z("icon",[u("rubber-band",[u("pressed",[a("rail",[a("button","max-width: var(--n-button-width-pressed);")])]),a("rail",[D("&:active",[a("button","max-width: var(--n-button-width-pressed);")])]),u("active",[u("pressed",[a("rail",[a("button","left: calc(100% - var(--n-offset) - var(--n-button-width-pressed));")])]),a("rail",[D("&:active",[a("button","left: calc(100% - var(--n-offset) - var(--n-button-width-pressed));")])])])])])]),u("active",[a("rail",[a("button","left: calc(100% - var(--n-button-width) - var(--n-offset))")])]),a("rail",`
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
 `)]),u("active",[a("rail","background-color: var(--n-rail-color-active);")]),u("loading",[a("rail",`
 cursor: wait;
 `)]),u("disabled",[a("rail",`
 cursor: not-allowed;
 opacity: .5;
 `)])]);const Ae=["aria-checked","tabindex","onClick","onFocus","onBlur","onKeyup","onKeydown"],Te={...ee.props,size:String,value:{type:[String,Number,Boolean],default:void 0},loading:Boolean,defaultValue:{type:[String,Number,Boolean],default:!1},disabled:{type:Boolean,default:void 0},round:{type:Boolean,default:!0},"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array],checkedValue:{type:[String,Number,Boolean],default:!0},uncheckedValue:{type:[String,Number,Boolean],default:!1},railStyle:Function,rubberBand:{type:Boolean,default:!0},spinProps:Object,onChange:[Function,Array]};let R;var Ye=ye({name:"Switch",props:Te,slots:Object,setup(e){R===void 0&&(typeof CSS<"u"?typeof CSS.supports<"u"?R=CSS.supports("width","max(1px)"):R=!1:R=!0);const{mergedClsPrefixRef:i,inlineThemeDisabled:o,mergedComponentPropsRef:t}=_e(e),l=ee("Switch","-switch",je,We,e,i),p=Be(e,{mergedSize(n){if(e.size!==void 0)return e.size;if(n)return n.mergedSize.value;const w=t?.value?.Switch?.size;return w||"medium"}}),{mergedSizeRef:C,mergedDisabledRef:v}=p,_=O(e.defaultValue),V=xe(e,"value"),m=$e(V,_),F=A(()=>m.value===e.checkedValue),r=O(!1),c=O(!1),B=A(()=>{const{railStyle:n}=e;if(n)return n({focused:c.value,checked:F.value})});function P(n){const{"onUpdate:value":w,onChange:W,onUpdateValue:j}=e,{nTriggerFormInput:T,nTriggerFormChange:H}=p;w&&I(w,n),j&&I(j,n),W&&I(W,n),_.value=n,T(),H()}function te(){const{nTriggerFormFocus:n}=p;n()}function ne(){const{nTriggerFormBlur:n}=p;n()}function ie(){e.loading||v.value||(m.value!==e.checkedValue?P(e.checkedValue):P(e.uncheckedValue))}function ae(){c.value=!0,te()}function re(){c.value=!1,ne(),r.value=!1}function oe(n){e.loading||v.value||n.key===" "&&(m.value!==e.checkedValue?P(e.checkedValue):P(e.uncheckedValue),r.value=!1)}function se(n){e.loading||v.value||n.key===" "&&(n.preventDefault(),r.value=!0)}const Y=A(()=>{const{value:n}=C,{self:{opacityDisabled:w,railColor:W,railColorActive:j,buttonBoxShadow:T,buttonColor:H,boxShadowFocus:le,loadingColor:ce,textColor:de,iconColor:ue,[y("buttonHeight",n)]:f,[y("buttonWidth",n)]:he,[y("buttonWidthPressed",n)]:fe,[y("railHeight",n)]:b,[y("railWidth",n)]:$,[y("railBorderRadius",n)]:be,[y("buttonBorderRadius",n)]:ge},common:{cubicBezierEaseInOut:pe}}=l.value;let K,M,L;return R?(K=`calc((${b} - ${f}) / 2)`,M=`max(${b}, ${f})`,L=`max(${$}, calc(${$} + ${f} - ${b}))`):(K=U((h(b)-h(f))/2),M=U(Math.max(h(b),h(f))),L=h(b)>h(f)?$:U(h($)+h(f)-h(b))),{"--n-bezier":pe,"--n-button-border-radius":ge,"--n-button-box-shadow":T,"--n-button-color":H,"--n-button-width":he,"--n-button-width-pressed":fe,"--n-button-height":f,"--n-height":M,"--n-offset":K,"--n-opacity-disabled":w,"--n-rail-border-radius":be,"--n-rail-color":W,"--n-rail-color-active":j,"--n-rail-height":b,"--n-rail-width":$,"--n-width":L,"--n-box-shadow-focus":le,"--n-loading-color":ce,"--n-text-color":de,"--n-icon-color":ue}}),X=o?Re("switch",A(()=>C.value[0]),Y,e):void 0;return{handleClick:ie,handleBlur:re,handleFocus:ae,handleKeyup:oe,handleKeydown:se,mergedRailStyle:B,pressed:r,mergedClsPrefix:i,mergedValue:m,checked:F,mergedDisabled:v,cssVars:o?void 0:Y,themeClass:X?.themeClass,onRender:X?.onRender}},render(){const{mergedClsPrefix:e,mergedDisabled:i,checked:o,mergedRailStyle:t,onRender:l,$slots:p}=this;l?.();const{checked:C,unchecked:v,icon:_,"checked-icon":V,"unchecked-icon":m}=p,F=!(E(_)&&E(V)&&E(m));return g(),S("div",{role:"switch","aria-checked":o,class:s([`${e}-switch`,this.themeClass,F&&`${e}-switch--icon`,o&&`${e}-switch--active`,i&&`${e}-switch--disabled`,this.round&&`${e}-switch--round`,this.loading&&`${e}-switch--loading`,this.pressed&&`${e}-switch--pressed`,this.rubberBand&&`${e}-switch--rubber-band`]),tabindex:this.mergedDisabled?void 0:0,style:G(this.cssVars),onClick:this.handleClick,onFocus:this.handleFocus,onBlur:this.handleBlur,onKeyup:this.handleKeyup,onKeydown:this.handleKeydown},[k("div",{class:s(`${e}-switch__rail`),"aria-hidden":"true",style:G(t)},[d(()=>x(C,r=>x(v,c=>r||c?(g(),S("div",{key:4,"aria-hidden":!0,class:s(`${e}-switch__children-placeholder`)},[k("div",{class:s(`${e}-switch__rail-placeholder`)},[k("div",{class:s(`${e}-switch__button-placeholder`)},null,2),d(()=>r)],2),k("div",{class:s(`${e}-switch__rail-placeholder`)},[k("div",{class:s(`${e}-switch__button-placeholder`)},null,2),d(()=>c)],2)],2)):null))),k("div",{class:s(`${e}-switch__button`)},[d(()=>x(_,r=>x(V,c=>x(m,B=>(g(),J(Ve,null,{default:()=>this.loading?(g(),J(ze,Se({key:"loading",clsPrefix:e,strokeWidth:20},this.spinProps),null,16,["clsPrefix"])):this.checked&&(c||r)?(g(),S("div",{class:s(`${e}-switch__button-icon`),key:c?"checked-icon":"icon"},[d(()=>c||r)],2)):!this.checked&&(B||r)?(g(),S("div",{class:s(`${e}-switch__button-icon`),key:B?"unchecked-icon":"icon"},[d(()=>B||r)],2)):null},1024)))))),d(()=>x(C,r=>r&&(g(),S("div",{key:"checked",class:s(`${e}-switch__checked`)},[d(()=>r)],2)))),d(()=>x(v,r=>r&&(g(),S("div",{key:"unchecked",class:s(`${e}-switch__unchecked`)},[d(()=>r)],2))))],2)],6)],46,Ae)}});const He=/^[0-9a-f]{8}-[0-9a-f]{4}/;function Ke(e){return e.slice(e.lastIndexOf("_")+1)}function Me(e){const i=typeof e?.sessionPath=="string"?e.sessionPath:"";return Le(i)}function Le(e){if(typeof e!="string")return"";const i=e.trim();if(!i)return"";const t=(i.split(/[/\\]/).filter(Boolean).pop()||"").replace(/\.jsonl$/i,"").replace(/\.json$/i,"");if(!t||t==="."||t===".."||t.startsWith("sess_"))return"";const l=Ke(t);return!l||l.startsWith("sess_")||!He.test(l)?"":l}async function Xe(e){return(await z.api.fetch(e)).json()}async function Ge(e,i){return(await z.api.fetch(e,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(i)})).json()}function Je(){z.ready()}async function Oe(){try{return await z.sessions.getActive()}catch{return null}}async function qe(){return Me(await Oe())||null}function Qe(e){try{const i=z.sessions.onActiveChanged(e);return typeof i=="function"?i:null}catch{return null}}export{Ye as S,Je as a,Ge as b,Oe as c,qe as d,N as f,Ie as g,Xe as j,Qe as o,Me as s};
