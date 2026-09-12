(()=>{if(window.__WS_INSTALL__)return;const o=new WeakMap,t=new Map;let u=null;function a(e){return!e||typeof e.fetch=="function"||typeof window.resilientFetch=="function"&&(e.fetch=window.resilientFetch),e}function s(e){if(!e||e.getOwnerToken)return e;let n=null;function w(){if(n)return n;if(typeof window.createOwnerAuth!="function")throw new Error("Owner auth is not available");if(e.instanceId==null)throw new Error("Owner auth requires an instance id");return n=window.createOwnerAuth({origin:e.origin||"",instanceId:e.instanceId,cookieName:`ws_cowner_${e.instanceId}`}),n}return e.getOwnerToken=async()=>{const r=w(),i=r.getToken();return i||r.syncFromParent()},e.authorizeOwner=async r=>{const i=!!(r&&r.requestUserData);return w().ensure({requestUserData:i})},e}function f(){const e=document.currentScript;if(e&&o.has(e))return o.get(e);if(u)return u;if(t.size===1)return t.values().next().value;if(t.size!==0)throw new Error("createWS() must be called at the top of your widget script so the correct embed can be identified, e.g. const WS = createWS();")}window.createWS=f,window.__WS_INSTALL__={register(e,n){return a(n),s(n),e&&o.set(e,n),n&&n.element&&t.set(n.element,n),n},setIframe(e){return a(e),s(e),u=e,e}}})();

window._ws_embed_12168 = function(element, getCaptchaToken, resilientFetch, createOwnerAuth, resilientSubmit){(function(){
                var s = document.createElement('script');
                s.dataset.settings = "%7B%22cursor_width%22%3A16%2C%22cursor_height%22%3A20%2C%22cursor_opacity%22%3A10%2C%22cursor_fill%22%3A%22rgb(100%2C%2076%2C%20110)%22%2C%22cursor_outline%22%3A%22rgb(255%2C%20255%2C%20255)%22%2C%22left_box%22%3A%22%22%2C%22right_box%22%3A%22%22%7D";
                s.async = true;
                window.__WS_INSTALL__.register(s, Object.assign({
                    settings: {"cursor_width":16,"cursor_height":20,"cursor_opacity":10,"cursor_fill":"rgb(100, 76, 110)","cursor_outline":"rgb(255, 255, 255)","left_box":"","right_box":""},
                    element: element,
                    fetch: resilientFetch
                }, {"instanceId":12168,"widgetId":1578,"domain":"thecatontheceiling.github.io","name":"Shared Cursors 1","origin":"https://widget.st","embedMode":"script"}));
                s.src = "https://widget.menal.xyz/cursor/public.js?3";
                element.appendChild(s);
            })()};