import{d as we,o as b,c as B,a as p,n as G,r as x,t as ye,b as D,e as X,m as ke,f as xe,g as te,u as K,h as _e,i as Se,w as Ce,j as Re}from"./chunk-vue.js";import{d as Be,_ as $e,c as ze,a as J,b as o,i as Q,e as A,f as g,g as Z,u as ae,h as U,n as f,j as c,k as Ve,l as Fe,m as Te,o as Pe,p as H,r as C,L as je,I as De,q as R,s as L,t as m,v as Ke,w as Ne,C as Ee}from"./chunk-theme.js";import{hana as ee}from"./sdk.js";function Me(e){const{primaryColor:s,opacityDisabled:i,borderRadius:r,textColor3:v}=e;return{...$e,iconColor:v,textColor:"white",loadingColor:s,opacityDisabled:i,railColor:"rgba(0, 0, 0, .14)",railColorActive:s,buttonBoxShadow:"0 1px 4px 0 rgba(0, 0, 0, 0.3), inset 0 0 1px 0 rgba(0, 0, 0, 0.05)",buttonColor:"#FFF",railBorderRadiusSmall:r,railBorderRadiusMedium:r,railBorderRadiusLarge:r,buttonBorderRadiusSmall:r,buttonBorderRadiusMedium:r,buttonBorderRadiusLarge:r,boxShadowFocus:`0 0 0 2px ${ze(s,{alpha:.2})}`}}const Oe={common:Be,self:Me};var We=J("switch",`
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
 `),A("&:focus",[o("rail",`
 box-shadow: var(--n-box-shadow-focus);
 `)]),g("round",[o("rail","border-radius: calc(var(--n-rail-height) / 2);",[o("button","border-radius: calc(var(--n-button-height) / 2);")])]),Z("disabled",[Z("icon",[g("rubber-band",[g("pressed",[o("rail",[o("button","max-width: var(--n-button-width-pressed);")])]),o("rail",[A("&:active",[o("button","max-width: var(--n-button-width-pressed);")])]),g("active",[g("pressed",[o("rail",[o("button","left: calc(100% - var(--n-offset) - var(--n-button-width-pressed));")])]),o("rail",[A("&:active",[o("button","left: calc(100% - var(--n-offset) - var(--n-button-width-pressed));")])])])])])]),g("active",[o("rail",[o("button","left: calc(100% - var(--n-button-width) - var(--n-offset))")])]),o("rail",`
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
 `)])]);const Ae=["aria-checked","tabindex","onClick","onFocus","onBlur","onKeyup","onKeydown"],Ue={...ae.props,size:String,value:{type:[String,Number,Boolean],default:void 0},loading:Boolean,defaultValue:{type:[String,Number,Boolean],default:!1},disabled:{type:Boolean,default:void 0},round:{type:Boolean,default:!0},"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array],checkedValue:{type:[String,Number,Boolean],default:!0},uncheckedValue:{type:[String,Number,Boolean],default:!1},railStyle:Function,rubberBand:{type:Boolean,default:!0},spinProps:Object,onChange:[Function,Array]};let F;var He=we({name:"Switch",props:Ue,slots:Object,setup(e){F===void 0&&(typeof CSS<"u"?typeof CSS.supports<"u"?F=CSS.supports("width","max(1px)"):F=!1:F=!0);const{mergedClsPrefixRef:s,inlineThemeDisabled:i,mergedComponentPropsRef:r}=Ve(e),v=ae("Switch","-switch",We,Oe,e,s),d=Fe(e,{mergedSize(a){if(e.size!==void 0)return e.size;if(a)return a.mergedSize.value;const S=r?.value?.Switch?.size;return S||"medium"}}),{mergedSizeRef:w,mergedDisabledRef:u}=d,_=x(e.defaultValue),$=ye(e,"value"),h=Te($,_),z=D(()=>h.value===e.checkedValue),t=x(!1),n=x(!1),l=D(()=>{const{railStyle:a}=e;if(a)return a({focused:n.value,checked:z.value})});function T(a){const{"onUpdate:value":S,onChange:P,onUpdateValue:j}=e,{nTriggerFormInput:N,nTriggerFormChange:E}=d;S&&H(S,a),j&&H(j,a),P&&H(P,a),_.value=a,N(),E()}function oe(){const{nTriggerFormFocus:a}=d;a()}function ne(){const{nTriggerFormBlur:a}=d;a()}function ie(){e.loading||u.value||(h.value!==e.checkedValue?T(e.checkedValue):T(e.uncheckedValue))}function re(){n.value=!0,oe()}function le(){n.value=!1,ne(),t.value=!1}function se(a){e.loading||u.value||a.key===" "&&(h.value!==e.checkedValue?T(e.checkedValue):T(e.uncheckedValue),t.value=!1)}function ce(a){e.loading||u.value||a.key===" "&&(a.preventDefault(),t.value=!0)}const Y=D(()=>{const{value:a}=w,{self:{opacityDisabled:S,railColor:P,railColorActive:j,buttonBoxShadow:N,buttonColor:E,boxShadowFocus:de,loadingColor:ue,textColor:he,iconColor:fe,[R("buttonHeight",a)]:y,[R("buttonWidth",a)]:be,[R("buttonWidthPressed",a)]:ve,[R("railHeight",a)]:k,[R("railWidth",a)]:V,[R("railBorderRadius",a)]:ge,[R("buttonBorderRadius",a)]:me},common:{cubicBezierEaseInOut:pe}}=v.value;let M,O,W;return F?(M=`calc((${k} - ${y}) / 2)`,O=`max(${k}, ${y})`,W=`max(${V}, calc(${V} + ${y} - ${k}))`):(M=L((m(k)-m(y))/2),O=L(Math.max(m(k),m(y))),W=m(k)>m(y)?V:L(m(V)+m(y)-m(k))),{"--n-bezier":pe,"--n-button-border-radius":me,"--n-button-box-shadow":N,"--n-button-color":E,"--n-button-width":be,"--n-button-width-pressed":ve,"--n-button-height":y,"--n-height":O,"--n-offset":M,"--n-opacity-disabled":S,"--n-rail-border-radius":ge,"--n-rail-color":P,"--n-rail-color-active":j,"--n-rail-height":k,"--n-rail-width":V,"--n-width":W,"--n-box-shadow-focus":de,"--n-loading-color":ue,"--n-text-color":he,"--n-icon-color":fe}}),q=i?Pe("switch",D(()=>w.value[0]),Y,e):void 0;return{handleClick:ie,handleBlur:le,handleFocus:re,handleKeyup:se,handleKeydown:ce,mergedRailStyle:l,pressed:t,mergedClsPrefix:s,mergedValue:h,checked:z,mergedDisabled:u,cssVars:i?void 0:Y,themeClass:q?.themeClass,onRender:q?.onRender}},render(){const{mergedClsPrefix:e,mergedDisabled:s,checked:i,mergedRailStyle:r,onRender:v,$slots:d}=this;v?.();const{checked:w,unchecked:u,icon:_,"checked-icon":$,"unchecked-icon":h}=d,z=!(U(_)&&U($)&&U(h));return b(),B("div",{role:"switch","aria-checked":i,class:c([`${e}-switch`,this.themeClass,z&&`${e}-switch--icon`,i&&`${e}-switch--active`,s&&`${e}-switch--disabled`,this.round&&`${e}-switch--round`,this.loading&&`${e}-switch--loading`,this.pressed&&`${e}-switch--pressed`,this.rubberBand&&`${e}-switch--rubber-band`]),tabindex:this.mergedDisabled?void 0:0,style:G(this.cssVars),onClick:this.handleClick,onFocus:this.handleFocus,onBlur:this.handleBlur,onKeyup:this.handleKeyup,onKeydown:this.handleKeydown},[p("div",{class:c(`${e}-switch__rail`),"aria-hidden":"true",style:G(r)},[f(()=>C(w,t=>C(u,n=>t||n?(b(),B("div",{key:4,"aria-hidden":!0,class:c(`${e}-switch__children-placeholder`)},[p("div",{class:c(`${e}-switch__rail-placeholder`)},[p("div",{class:c(`${e}-switch__button-placeholder`)},null,2),f(()=>t)],2),p("div",{class:c(`${e}-switch__rail-placeholder`)},[p("div",{class:c(`${e}-switch__button-placeholder`)},null,2),f(()=>n)],2)],2)):null))),p("div",{class:c(`${e}-switch__button`)},[f(()=>C(_,t=>C($,n=>C(h,l=>(b(),X(De,null,{default:()=>this.loading?(b(),X(je,ke({key:"loading",clsPrefix:e,strokeWidth:20},this.spinProps),null,16,["clsPrefix"])):this.checked&&(n||t)?(b(),B("div",{class:c(`${e}-switch__button-icon`),key:n?"checked-icon":"icon"},[f(()=>n||t)],2)):!this.checked&&(l||t)?(b(),B("div",{class:c(`${e}-switch__button-icon`),key:l?"unchecked-icon":"icon"},[f(()=>l||t)],2)):null},1024)))))),f(()=>C(w,t=>t&&(b(),B("div",{key:"checked",class:c(`${e}-switch__checked`)},[f(()=>t)],2)))),f(()=>C(u,t=>t&&(b(),B("div",{key:"unchecked",class:c(`${e}-switch__unchecked`)},[f(()=>t)],2))))],2)],6)],46,Ae)}});const Le={class:"skill-route-head"},I="把共享技能交给助手按需调用",Ie={__name:"SkillRoute",setup(e){const s=x(null),i=x(!1),r=x(!1),v=x(I),d=x(!1);let w=0;function u(t,n=!1){v.value=t||I,d.value=!!t&&!!n,clearTimeout(w),t&&(w=setTimeout(()=>{v.value=I,d.value=!1},2600))}async function _(t){return(await ee.api.fetch(t)).json()}async function $(t,n){return(await ee.api.fetch(t,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(n)})).json()}function h(t){typeof t=="boolean"&&s.value?.classList.toggle("dim",!t)}xe(async()=>{try{const t=await _("/controls");typeof t?.skillRouting=="boolean"&&(i.value=t.skillRouting),h(t?.enabled)}catch{}});async function z(t){if(r.value)return;const n=i.value;i.value=t,r.value=!0;try{const l=await $("/controls",{skillRouting:t});if(l?.ok===!1)throw new Error(l.error||"写入失败");typeof l?.skillRouting=="boolean"&&(i.value=l.skillRouting),h(l?.enabled),u("已保存")}catch(l){i.value=n,u(String(l?.message||l),!0)}finally{r.value=!1}}return(t,n)=>(b(),B("section",{id:"skillRoute",ref_key:"rootEl",ref:s,class:"card skill-route","aria-label":"技能路由"},[p("header",Le,[n[0]||(n[0]=p("h2",{class:"card-title"},"技能路由",-1)),te(K(He),{size:"small",value:i.value,loading:r.value,"aria-label":"技能路由","onUpdate:value":z},null,8,["value","loading"])]),p("p",{class:Se(["skill-route-hint",{bad:d.value}])},_e(v.value),3)],512))}},Xe={__name:"App",setup(e){return(s,i)=>(b(),X(K(Ee),{abstract:"",theme:K(Ne),"theme-overrides":K(Ke)},{default:Ce(()=>[te(Ie)]),_:1},8,["theme","theme-overrides"]))}};Re(Xe).mount("#skill-route-app");
