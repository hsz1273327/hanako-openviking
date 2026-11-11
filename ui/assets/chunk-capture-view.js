import{h as xe,F as Se,C as Ce,d as ke,o as v,c as k,a as _,n as q,r as L,t as _e,b as j,e as J,G as Re}from"./chunk-vue.js";import{d as Be,c as Pe,a as Q,e as a,am as Z,f as H,b as f,g as ee,m as ne,a4 as K,o as d,p as l,u as ze,h as $e,i as Ae,s as Te,t as S,a1 as I,a0 as b,l as N,r as C,a8 as Ee,an as Fe}from"./chunk-theme.js";import{hana as $}from"./sdk.js";function te(e,t=!0,r=[]){return e.forEach(n=>{if(n!==null){if(typeof n!="object"){(typeof n=="string"||typeof n=="number")&&r.push(xe(String(n)));return}if(Array.isArray(n)){te(n,t,r);return}if(n.type===Se){if(n.children===null)return;Array.isArray(n.children)&&te(n.children,t,r)}else{if(n.type===Ce&&t)return;r.push(n)}}}),r}function Ze(e,t="default",r=[]){const n=e.$slots[t];return n===void 0?r:n()}var Ve={buttonHeightSmall:"14px",buttonHeightMedium:"18px",buttonHeightLarge:"22px",buttonWidthSmall:"14px",buttonWidthMedium:"18px",buttonWidthLarge:"22px",buttonWidthPressedSmall:"20px",buttonWidthPressedMedium:"24px",buttonWidthPressedLarge:"28px",railHeightSmall:"18px",railHeightMedium:"22px",railHeightLarge:"26px",railWidthSmall:"32px",railWidthMedium:"40px",railWidthLarge:"48px"};function je(e){const{primaryColor:t,opacityDisabled:r,borderRadius:n,textColor3:s}=e;return{...Ve,iconColor:s,textColor:"white",loadingColor:t,opacityDisabled:r,railColor:"rgba(0, 0, 0, .14)",railColorActive:t,buttonBoxShadow:"0 1px 4px 0 rgba(0, 0, 0, 0.3), inset 0 0 1px 0 rgba(0, 0, 0, 0.05)",buttonColor:"#FFF",railBorderRadiusSmall:n,railBorderRadiusMedium:n,railBorderRadiusLarge:n,buttonBorderRadiusSmall:n,buttonBorderRadiusMedium:n,buttonBorderRadiusLarge:n,boxShadowFocus:`0 0 0 2px ${Pe(t,{alpha:.2})}`}}const Me={common:Be,self:je};var Oe=Q("switch",`
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
 `),Q("base-loading",`
 position: absolute;
 top: 50%;
 left: 50%;
 transform: translateX(-50%) translateY(-50%);
 font-size: calc(var(--n-button-width) - 4px);
 color: var(--n-loading-color);
 transition: color .3s var(--n-bezier);
 `,[Z({left:"50%",top:"50%",originalTransform:"translateX(-50%) translateY(-50%)"})]),a("checked, unchecked",`
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
 `)]),f("round",[a("rail","border-radius: calc(var(--n-rail-height) / 2);",[a("button","border-radius: calc(var(--n-button-height) / 2);")])]),ee("disabled",[ee("icon",[f("rubber-band",[f("pressed",[a("rail",[a("button","max-width: var(--n-button-width-pressed);")])]),a("rail",[H("&:active",[a("button","max-width: var(--n-button-width-pressed);")])]),f("active",[f("pressed",[a("rail",[a("button","left: calc(100% - var(--n-offset) - var(--n-button-width-pressed));")])]),a("rail",[H("&:active",[a("button","left: calc(100% - var(--n-offset) - var(--n-button-width-pressed));")])])])])])]),f("active",[a("rail",[a("button","left: calc(100% - var(--n-button-width) - var(--n-offset))")])]),a("rail",`
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
 `,[Z()]),a("button",`
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
 `)]),f("active",[a("rail","background-color: var(--n-rail-color-active);")]),f("loading",[a("rail",`
 cursor: wait;
 `)]),f("disabled",[a("rail",`
 cursor: not-allowed;
 opacity: .5;
 `)])]);const We=["aria-checked","tabindex","onClick","onFocus","onBlur","onKeyup","onKeydown"],Ue={...ne.props,size:String,value:{type:[String,Number,Boolean],default:void 0},loading:Boolean,defaultValue:{type:[String,Number,Boolean],default:!1},disabled:{type:Boolean,default:void 0},round:{type:Boolean,default:!0},"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array],checkedValue:{type:[String,Number,Boolean],default:!0},uncheckedValue:{type:[String,Number,Boolean],default:!1},railStyle:Function,rubberBand:{type:Boolean,default:!0},spinProps:Object,onChange:[Function,Array]};let z;var et=ke({name:"Switch",props:Ue,slots:Object,setup(e){z===void 0&&(typeof CSS<"u"?typeof CSS.supports<"u"?z=CSS.supports("width","max(1px)"):z=!1:z=!0);const{mergedClsPrefixRef:t,inlineThemeDisabled:r,mergedComponentPropsRef:n}=ze(e),s=ne("Switch","-switch",Oe,Me,e,t),h=$e(e,{mergedSize(i){if(e.size!==void 0)return e.size;if(i)return i.mergedSize.value;const x=n?.value?.Switch?.size;return x||"medium"}}),{mergedSizeRef:p,mergedDisabledRef:c}=h,R=L(e.defaultValue),A=_e(e,"value"),w=Ae(A,R),T=j(()=>w.value===e.checkedValue),o=L(!1),u=L(!1),B=j(()=>{const{railStyle:i}=e;if(i)return i({focused:u.value,checked:T.value})});function E(i){const{"onUpdate:value":x,onChange:F,onUpdateValue:V}=e,{nTriggerFormInput:M,nTriggerFormChange:O}=h;x&&N(x,i),V&&N(V,i),F&&N(F,i),R.value=i,M(),O()}function ae(){const{nTriggerFormFocus:i}=h;i()}function oe(){const{nTriggerFormBlur:i}=h;i()}function se(){e.loading||c.value||(w.value!==e.checkedValue?E(e.checkedValue):E(e.uncheckedValue))}function le(){u.value=!0,ae()}function ce(){u.value=!1,oe(),o.value=!1}function ue(i){e.loading||c.value||i.key===" "&&(w.value!==e.checkedValue?E(e.checkedValue):E(e.uncheckedValue),o.value=!1)}function de(i){e.loading||c.value||i.key===" "&&(i.preventDefault(),o.value=!0)}const X=j(()=>{const{value:i}=p,{self:{opacityDisabled:x,railColor:F,railColorActive:V,buttonBoxShadow:M,buttonColor:O,boxShadowFocus:he,loadingColor:fe,textColor:be,iconColor:pe,[S("buttonHeight",i)]:g,[S("buttonWidth",i)]:ge,[S("buttonWidthPressed",i)]:me,[S("railHeight",i)]:m,[S("railWidth",i)]:P,[S("railBorderRadius",i)]:ve,[S("buttonBorderRadius",i)]:ye},common:{cubicBezierEaseInOut:we}}=s.value;let W,U,D;return z?(W=`calc((${m} - ${g}) / 2)`,U=`max(${m}, ${g})`,D=`max(${P}, calc(${P} + ${g} - ${m}))`):(W=I((b(m)-b(g))/2),U=I(Math.max(b(m),b(g))),D=b(m)>b(g)?P:I(b(P)+b(g)-b(m))),{"--n-bezier":we,"--n-button-border-radius":ye,"--n-button-box-shadow":M,"--n-button-color":O,"--n-button-width":ge,"--n-button-width-pressed":me,"--n-button-height":g,"--n-height":U,"--n-offset":W,"--n-opacity-disabled":x,"--n-rail-border-radius":ve,"--n-rail-color":F,"--n-rail-color-active":V,"--n-rail-height":m,"--n-rail-width":P,"--n-width":D,"--n-box-shadow-focus":he,"--n-loading-color":fe,"--n-text-color":be,"--n-icon-color":pe}}),Y=r?Te("switch",j(()=>p.value[0]),X,e):void 0;return{handleClick:se,handleBlur:ce,handleFocus:le,handleKeyup:ue,handleKeydown:de,mergedRailStyle:B,pressed:o,mergedClsPrefix:t,mergedValue:w,checked:T,mergedDisabled:c,cssVars:r?void 0:X,themeClass:Y?.themeClass,onRender:Y?.onRender}},render(){const{mergedClsPrefix:e,mergedDisabled:t,checked:r,mergedRailStyle:n,onRender:s,$slots:h}=this;s?.();const{checked:p,unchecked:c,icon:R,"checked-icon":A,"unchecked-icon":w}=h,T=!(K(R)&&K(A)&&K(w));return v(),k("div",{role:"switch","aria-checked":r,class:l([`${e}-switch`,this.themeClass,T&&`${e}-switch--icon`,r&&`${e}-switch--active`,t&&`${e}-switch--disabled`,this.round&&`${e}-switch--round`,this.loading&&`${e}-switch--loading`,this.pressed&&`${e}-switch--pressed`,this.rubberBand&&`${e}-switch--rubber-band`]),tabindex:this.mergedDisabled?void 0:0,style:q(this.cssVars),onClick:this.handleClick,onFocus:this.handleFocus,onBlur:this.handleBlur,onKeyup:this.handleKeyup,onKeydown:this.handleKeydown},[_("div",{class:l(`${e}-switch__rail`),"aria-hidden":"true",style:q(n)},[d(()=>C(p,o=>C(c,u=>o||u?(v(),k("div",{key:4,"aria-hidden":!0,class:l(`${e}-switch__children-placeholder`)},[_("div",{class:l(`${e}-switch__rail-placeholder`)},[_("div",{class:l(`${e}-switch__button-placeholder`)},null,2),d(()=>o)],2),_("div",{class:l(`${e}-switch__rail-placeholder`)},[_("div",{class:l(`${e}-switch__button-placeholder`)},null,2),d(()=>u)],2)],2)):null))),_("div",{class:l(`${e}-switch__button`)},[d(()=>C(R,o=>C(A,u=>C(w,B=>(v(),J(Fe,null,{default:()=>this.loading?(v(),J(Ee,Re({key:"loading",clsPrefix:e,strokeWidth:20},this.spinProps),null,16,["clsPrefix"])):this.checked&&(u||o)?(v(),k("div",{class:l(`${e}-switch__button-icon`),key:u?"checked-icon":"icon"},[d(()=>u||o)],2)):!this.checked&&(B||o)?(v(),k("div",{class:l(`${e}-switch__button-icon`),key:B?"unchecked-icon":"icon"},[d(()=>B||o)],2)):null},1024)))))),d(()=>C(p,o=>o&&(v(),k("div",{key:"checked",class:l(`${e}-switch__checked`)},[d(()=>o)],2)))),d(()=>C(c,o=>o&&(v(),k("div",{key:"unchecked",class:l(`${e}-switch__unchecked`)},[d(()=>o)],2))))],2)],6)],46,We)}});const De=/^[0-9a-f]{8}-[0-9a-f]{4}/;function Le(e){return e.slice(e.lastIndexOf("_")+1)}function He(e){const t=typeof e?.sessionPath=="string"?e.sessionPath:"";return Ke(t)}function Ke(e){if(typeof e!="string")return"";const t=e.trim();if(!t)return"";const n=(t.split(/[/\\]/).filter(Boolean).pop()||"").replace(/\.jsonl$/i,"").replace(/\.json$/i,"");if(!n||n==="."||n===".."||n.startsWith("sess_"))return"";const s=Le(n);return!s||s.startsWith("sess_")||!De.test(s)?"":s}async function tt(e){return(await $.api.fetch(e)).json()}async function nt(e,t){return(await $.api.fetch(e,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)})).json()}function rt(){$.ready()}async function Ie(){try{return await $.sessions.getActive()}catch{return null}}async function it(){return He(await Ie())||null}function at(e){try{const t=$.sessions.onActiveChanged(e);return typeof t=="function"?t:null}catch{return null}}const y="暂无",Ne=2e3,re="下面有几个已知话题，和一段新的对话。先判断这段在讲什么，再决定它属于哪个。";function ie(e){return typeof e!="string"||!e?"":Array.from(e).slice(0,Ne).join("")}function ot(e,t=!1){const r=ie(e);return r||(t?"":re)}function st(e){const t=ie(e);return t===re?"当前为默认题面":t.trim()?"已修改":"已修改 · 题面为空时使用内置默认"}const lt=Object.freeze([1,100]),ct=Object.freeze([1,20]),ut=Object.freeze([1,50]),dt=Object.freeze([1,20]),ht=Object.freeze([60,86400]),Ge=Object.freeze({captureServiceUrl:"判别服务地址",systemoneServiceModel:"决策服务模型"});function Xe(e){if(e==null)return"";const t=typeof e=="number"?e:Date.parse(e);if(!Number.isFinite(t))return"";try{return new Date(t).toLocaleString("zh-CN")}catch{return""}}function G(e){if(e==null)return"";const t=Number(e);return!Number.isFinite(t)||t<0?"":String(Math.floor(t))}function Ye(e,t={}){const r=!!e&&typeof e=="object";if(t.active===!1||t.autoCapture===!1||!r)return{written:y,lastCommit:y,pending:y,topics:y,disabled:!0};const s=G(e.written),h=Xe(e.lastCommitAt),p=G(e.pendingTurns),c=G(e.topics);return{written:s!==""?`${s} 条`:y,lastCommit:h||y,pending:p!==""?`${p} 轮`:y,topics:c!==""?`${c} 个`:y,disabled:!1}}function ft(e,t={}){const r=Ye(e,t);return[{key:"written",label:"本会话已写",value:r.written},{key:"lastCommit",label:"上次提交",value:r.lastCommit},{key:"pending",label:"待提交",value:r.pending},{key:"topics",label:"本会话话题数",value:r.topics}]}function bt(e){if(!e||typeof e!="object"||e.early===!0||e.earlyStored!==!0)return"";const t=(Array.isArray(e.missing)?e.missing:[]).map(r=>Ge[r]||String(r||"")).filter(Boolean);return t.length?`当前不提前提交：还缺 ${t.join("、")}`:"当前不提前提交"}export{ht as C,re as D,et as S,rt as a,Ie as b,ft as c,nt as d,st as e,te as f,Ze as g,ct as h,ut as i,tt as j,dt as k,lt as l,ot as m,ie as n,at as o,Ne as p,bt as q,it as r,He as s};
