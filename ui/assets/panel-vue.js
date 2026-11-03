import{d as we,o as b,c as B,a as m,n as G,r as k,t as ye,b as M,e as I,m as xe,f as ke,g as te,u as X,h as _e,i as Se,w as Ce,j as Re}from"./chunk-vue.js";import{d as Be,c as $e,a as J,b as o,i as Q,e as N,f as g,g as Z,u as ae,h as E,n as f,j as c,k as ze,l as Ve,m as Fe,o as Pe,p as O,r as C,L as Te,I as We,q as R,s as A,t as p,v as Me,C as je}from"./chunk-theme.js";import{hana as ee}from"./sdk.js";var He={buttonHeightSmall:"14px",buttonHeightMedium:"18px",buttonHeightLarge:"22px",buttonWidthSmall:"14px",buttonWidthMedium:"18px",buttonWidthLarge:"22px",buttonWidthPressedSmall:"20px",buttonWidthPressedMedium:"24px",buttonWidthPressedLarge:"28px",railHeightSmall:"18px",railHeightMedium:"22px",railHeightLarge:"26px",railWidthSmall:"32px",railWidthMedium:"40px",railWidthLarge:"48px"};function Le(e){const{primaryColor:s,opacityDisabled:n,borderRadius:r,textColor3:v}=e;return{...He,iconColor:v,textColor:"white",loadingColor:s,opacityDisabled:n,railColor:"rgba(0, 0, 0, .14)",railColorActive:s,buttonBoxShadow:"0 1px 4px 0 rgba(0, 0, 0, 0.3), inset 0 0 1px 0 rgba(0, 0, 0, 0.05)",buttonColor:"#FFF",railBorderRadiusSmall:r,railBorderRadiusMedium:r,railBorderRadiusLarge:r,buttonBorderRadiusSmall:r,buttonBorderRadiusMedium:r,buttonBorderRadiusLarge:r,boxShadowFocus:`0 0 0 2px ${$e(s,{alpha:.2})}`}}const De={common:Be,self:Le};var Ke=J("switch",`
 height: var(--n-height);
 min-width: var(--n-width);
 vertical-align: middle;
 user-select: none;
 -webkit-user-select: none;
 display: inline-flex;
 outline: none;
 justify-content: center;
 align-items: center;
`,[o("children-placeholder",`
 height: var(--n-rail-height);
 display: flex;
 flex-direction: column;
 overflow: hidden;
 pointer-events: none;
 visibility: hidden;
 `),o("rail-placeholder",`
 display: flex;
 flex-wrap: none;
 `),o("button-placeholder",`
 width: calc(1.75 * var(--n-rail-height));
 height: var(--n-rail-height);
 `),J("base-loading",`
 position: absolute;
 top: 50%;
 left: 50%;
 transform: translateX(-50%) translateY(-50%);
 font-size: calc(var(--n-button-width) - 4px);
 color: var(--n-loading-color);
 transition: color .3s var(--n-bezier);
 `,[Q({left:"50%",top:"50%",originalTransform:"translateX(-50%) translateY(-50%)"})]),o("checked, unchecked",`
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
 `),o("checked",`
 right: 0;
 padding-right: calc(1.25 * var(--n-rail-height) - var(--n-offset));
 `),o("unchecked",`
 left: 0;
 justify-content: flex-end;
 padding-left: calc(1.25 * var(--n-rail-height) - var(--n-offset));
 `),N("&:focus",[o("rail",`
 box-shadow: var(--n-box-shadow-focus);
 `)]),g("round",[o("rail","border-radius: calc(var(--n-rail-height) / 2);",[o("button","border-radius: calc(var(--n-button-height) / 2);")])]),Z("disabled",[Z("icon",[g("rubber-band",[g("pressed",[o("rail",[o("button","max-width: var(--n-button-width-pressed);")])]),o("rail",[N("&:active",[o("button","max-width: var(--n-button-width-pressed);")])]),g("active",[g("pressed",[o("rail",[o("button","left: calc(100% - var(--n-offset) - var(--n-button-width-pressed));")])]),o("rail",[N("&:active",[o("button","left: calc(100% - var(--n-offset) - var(--n-button-width-pressed));")])])])])])]),g("active",[o("rail",[o("button","left: calc(100% - var(--n-button-width) - var(--n-offset))")])]),o("rail",`
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
 `,[o("button-icon",`
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
 `,[Q()]),o("button",`
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
 `)]),g("active",[o("rail","background-color: var(--n-rail-color-active);")]),g("loading",[o("rail",`
 cursor: wait;
 `)]),g("disabled",[o("rail",`
 cursor: not-allowed;
 opacity: .5;
 `)])]);const Ne=["aria-checked","tabindex","onClick","onFocus","onBlur","onKeyup","onKeydown"],Ee={...ae.props,size:String,value:{type:[String,Number,Boolean],default:void 0},loading:Boolean,defaultValue:{type:[String,Number,Boolean],default:!1},disabled:{type:Boolean,default:void 0},round:{type:Boolean,default:!0},"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array],checkedValue:{type:[String,Number,Boolean],default:!0},uncheckedValue:{type:[String,Number,Boolean],default:!1},railStyle:Function,rubberBand:{type:Boolean,default:!0},spinProps:Object,onChange:[Function,Array]};let F;var Oe=we({name:"Switch",props:Ee,slots:Object,setup(e){F===void 0&&(typeof CSS<"u"?typeof CSS.supports<"u"?F=CSS.supports("width","max(1px)"):F=!1:F=!0);const{mergedClsPrefixRef:s,inlineThemeDisabled:n,mergedComponentPropsRef:r}=ze(e),v=ae("Switch","-switch",Ke,De,e,s),d=Ve(e,{mergedSize(a){if(e.size!==void 0)return e.size;if(a)return a.mergedSize.value;const S=r?.value?.Switch?.size;return S||"medium"}}),{mergedSizeRef:w,mergedDisabledRef:u}=d,_=k(e.defaultValue),$=ye(e,"value"),h=Fe($,_),z=M(()=>h.value===e.checkedValue),t=k(!1),i=k(!1),l=M(()=>{const{railStyle:a}=e;if(a)return a({focused:i.value,checked:z.value})});function P(a){const{"onUpdate:value":S,onChange:T,onUpdateValue:W}=e,{nTriggerFormInput:j,nTriggerFormChange:H}=d;S&&O(S,a),W&&O(W,a),T&&O(T,a),_.value=a,j(),H()}function oe(){const{nTriggerFormFocus:a}=d;a()}function ie(){const{nTriggerFormBlur:a}=d;a()}function ne(){e.loading||u.value||(h.value!==e.checkedValue?P(e.checkedValue):P(e.uncheckedValue))}function re(){i.value=!0,oe()}function le(){i.value=!1,ie(),t.value=!1}function se(a){e.loading||u.value||a.key===" "&&(h.value!==e.checkedValue?P(e.checkedValue):P(e.uncheckedValue),t.value=!1)}function ce(a){e.loading||u.value||a.key===" "&&(a.preventDefault(),t.value=!0)}const Y=M(()=>{const{value:a}=w,{self:{opacityDisabled:S,railColor:T,railColorActive:W,buttonBoxShadow:j,buttonColor:H,boxShadowFocus:de,loadingColor:ue,textColor:he,iconColor:fe,[R("buttonHeight",a)]:y,[R("buttonWidth",a)]:be,[R("buttonWidthPressed",a)]:ve,[R("railHeight",a)]:x,[R("railWidth",a)]:V,[R("railBorderRadius",a)]:ge,[R("buttonBorderRadius",a)]:pe},common:{cubicBezierEaseInOut:me}}=v.value;let L,D,K;return F?(L=`calc((${x} - ${y}) / 2)`,D=`max(${x}, ${y})`,K=`max(${V}, calc(${V} + ${y} - ${x}))`):(L=A((p(x)-p(y))/2),D=A(Math.max(p(x),p(y))),K=p(x)>p(y)?V:A(p(V)+p(y)-p(x))),{"--n-bezier":me,"--n-button-border-radius":pe,"--n-button-box-shadow":j,"--n-button-color":H,"--n-button-width":be,"--n-button-width-pressed":ve,"--n-button-height":y,"--n-height":D,"--n-offset":L,"--n-opacity-disabled":S,"--n-rail-border-radius":ge,"--n-rail-color":T,"--n-rail-color-active":W,"--n-rail-height":x,"--n-rail-width":V,"--n-width":K,"--n-box-shadow-focus":de,"--n-loading-color":ue,"--n-text-color":he,"--n-icon-color":fe}}),q=n?Pe("switch",M(()=>w.value[0]),Y,e):void 0;return{handleClick:ne,handleBlur:le,handleFocus:re,handleKeyup:se,handleKeydown:ce,mergedRailStyle:l,pressed:t,mergedClsPrefix:s,mergedValue:h,checked:z,mergedDisabled:u,cssVars:n?void 0:Y,themeClass:q?.themeClass,onRender:q?.onRender}},render(){const{mergedClsPrefix:e,mergedDisabled:s,checked:n,mergedRailStyle:r,onRender:v,$slots:d}=this;v?.();const{checked:w,unchecked:u,icon:_,"checked-icon":$,"unchecked-icon":h}=d,z=!(E(_)&&E($)&&E(h));return b(),B("div",{role:"switch","aria-checked":n,class:c([`${e}-switch`,this.themeClass,z&&`${e}-switch--icon`,n&&`${e}-switch--active`,s&&`${e}-switch--disabled`,this.round&&`${e}-switch--round`,this.loading&&`${e}-switch--loading`,this.pressed&&`${e}-switch--pressed`,this.rubberBand&&`${e}-switch--rubber-band`]),tabindex:this.mergedDisabled?void 0:0,style:G(this.cssVars),onClick:this.handleClick,onFocus:this.handleFocus,onBlur:this.handleBlur,onKeyup:this.handleKeyup,onKeydown:this.handleKeydown},[m("div",{class:c(`${e}-switch__rail`),"aria-hidden":"true",style:G(r)},[f(()=>C(w,t=>C(u,i=>t||i?(b(),B("div",{key:4,"aria-hidden":!0,class:c(`${e}-switch__children-placeholder`)},[m("div",{class:c(`${e}-switch__rail-placeholder`)},[m("div",{class:c(`${e}-switch__button-placeholder`)},null,2),f(()=>t)],2),m("div",{class:c(`${e}-switch__rail-placeholder`)},[m("div",{class:c(`${e}-switch__button-placeholder`)},null,2),f(()=>i)],2)],2)):null))),m("div",{class:c(`${e}-switch__button`)},[f(()=>C(_,t=>C($,i=>C(h,l=>(b(),I(We,null,{default:()=>this.loading?(b(),I(Te,xe({key:"loading",clsPrefix:e,strokeWidth:20},this.spinProps),null,16,["clsPrefix"])):this.checked&&(i||t)?(b(),B("div",{class:c(`${e}-switch__button-icon`),key:i?"checked-icon":"icon"},[f(()=>i||t)],2)):!this.checked&&(l||t)?(b(),B("div",{class:c(`${e}-switch__button-icon`),key:l?"unchecked-icon":"icon"},[f(()=>l||t)],2)):null},1024)))))),f(()=>C(w,t=>t&&(b(),B("div",{key:"checked",class:c(`${e}-switch__checked`)},[f(()=>t)],2)))),f(()=>C(u,t=>t&&(b(),B("div",{key:"unchecked",class:c(`${e}-switch__unchecked`)},[f(()=>t)],2))))],2)],6)],46,Ne)}});const Ae={class:"skill-route-head"},U="把共享技能交给助手按需调用",Ue={__name:"SkillRoute",setup(e){const s=k(null),n=k(!1),r=k(!1),v=k(U),d=k(!1);let w=0;function u(t,i=!1){v.value=t||U,d.value=!!t&&!!i,clearTimeout(w),t&&(w=setTimeout(()=>{v.value=U,d.value=!1},2600))}async function _(t){return(await ee.api.fetch(t)).json()}async function $(t,i){return(await ee.api.fetch(t,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(i)})).json()}function h(t){typeof t=="boolean"&&s.value?.classList.toggle("dim",!t)}ke(async()=>{try{const t=await _("/controls");typeof t?.skillRouting=="boolean"&&(n.value=t.skillRouting),h(t?.enabled)}catch{}});async function z(t){if(r.value)return;const i=n.value;n.value=t,r.value=!0;try{const l=await $("/controls",{skillRouting:t});if(l?.ok===!1)throw new Error(l.error||"写入失败");typeof l?.skillRouting=="boolean"&&(n.value=l.skillRouting),h(l?.enabled),u("已保存")}catch(l){n.value=i,u(String(l?.message||l),!0)}finally{r.value=!1}}return(t,i)=>(b(),B("section",{id:"skillRoute",ref_key:"rootEl",ref:s,class:"card skill-route","aria-label":"技能路由"},[m("header",Ae,[i[0]||(i[0]=m("h2",{class:"card-title"},"技能路由",-1)),te(X(Oe),{size:"small",value:n.value,loading:r.value,"aria-label":"技能路由","onUpdate:value":z},null,8,["value","loading"])]),m("p",{class:Se(["skill-route-hint",{bad:d.value}])},_e(v.value),3)],512))}},Ie={__name:"App",setup(e){return(s,n)=>(b(),I(X(je),{abstract:"","theme-overrides":X(Me)},{default:Ce(()=>[te(Ue)]),_:1},8,["theme-overrides"]))}};Re(Ie).mount("#skill-route-app");
