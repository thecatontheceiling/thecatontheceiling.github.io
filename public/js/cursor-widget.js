
(() => {
    if (window.__menalBridge) return;

    const BRIDGE_ORIGIN = 'https://widget.menal.xyz';
    const BRIDGE_URL = `${BRIDGE_ORIGIN}/embed/bridge`;
    let bridgeIframe = null;
    let bridgeReady = false;
    let bridgeReadyWaiters = [];
    let forceBridgeFetch = false;
    let forceBridgeWebSocket = false;
    const recentViolations = [];
    const pendingFetches = new Map();
    const bridgeSockets = new Map();

    document.addEventListener('securitypolicyviolation', (event) => {
        const directive = event.effectiveDirective || event.violatedDirective || '';
        if (!directive.startsWith('connect-src') && !directive.startsWith('default-src')) return;
        recentViolations.push({ uri: event.blockedURI, at: Date.now() });
        if (recentViolations.length > 50) recentViolations.shift();
    });

    function createId() {
        return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    }

    function ensureBridgeIframe() {
        if (bridgeIframe) return bridgeIframe;

        bridgeIframe = document.createElement('iframe');
        bridgeIframe.src = BRIDGE_URL;
        bridgeIframe.style.cssText = 'position:fixed;width:0;height:0;border:none;visibility:hidden;pointer-events:none';
        bridgeIframe.setAttribute('aria-hidden', 'true');
        bridgeIframe.setAttribute('tabindex', '-1');
        (document.body || document.documentElement).appendChild(bridgeIframe);
        window.addEventListener('message', onBridgeMessage);
        return bridgeIframe;
    }

    function waitForBridgeReady() {
        if (bridgeReady) return Promise.resolve();
        return new Promise((resolve) => bridgeReadyWaiters.push(resolve));
    }

    function onBridgeMessage(event) {
        if (event.source !== bridgeIframe?.contentWindow || event.origin !== BRIDGE_ORIGIN) return;
        const data = event.data || {};

        if (data.type === 'menal:bridge-ready') {
            bridgeReady = true;
            for (const resolve of bridgeReadyWaiters) resolve();
            bridgeReadyWaiters = [];
            return;
        }

        if (data.type === 'menal:fetch-response') {
            const pending = pendingFetches.get(data.id);
            if (!pending) return;
            pendingFetches.delete(data.id);
            const headers = new Headers(data.headers || []);
            const empty = [101, 103, 204, 205, 304].includes(data.status) || !data.body || data.body.byteLength === 0;
            pending.resolve(new Response(empty ? null : data.body, {
                status: data.status,
                statusText: data.statusText,
                headers,
            }));
            return;
        }

        if (data.type === 'menal:fetch-error') {
            pendingFetches.get(data.id)?.reject(new TypeError(data.error || 'Failed to fetch'));
            pendingFetches.delete(data.id);
            return;
        }

        const socket = bridgeSockets.get(data.id);
        if (!socket) return;
        if (data.type === 'menal:socket-open') socket._open();
        else if (data.type === 'menal:socket-message') socket._message(data.body);
        else if (data.type === 'menal:socket-error') socket._error(data.error);
        else if (data.type === 'menal:socket-close') {
            bridgeSockets.delete(data.id);
            socket._close(data.code, data.reason, data.wasClean);
        }
    }

    function wasBlocked(url) {
        let target;
        try {
            target = new URL(url, location.href);
        } catch {
            return false;
        }
        const now = Date.now();
        return recentViolations.some((violation) => {
            if (!violation.uri || now - violation.at > 3000) return false;
            return violation.uri === target.href || violation.uri === target.origin ||
                target.href.startsWith(violation.uri) || violation.uri.startsWith(target.origin);
        });
    }

    async function bridgeFetch(input, init) {
        ensureBridgeIframe();
        await waitForBridgeReady();
        const id = createId();
        const url = input instanceof Request ? input.url : String(input);
        const safeInit = init ? { ...init } : {};
        if (safeInit.headers instanceof Headers) {
            const headers = {};
            safeInit.headers.forEach((value, key) => { headers[key] = value; });
            safeInit.headers = headers;
        }
        if (safeInit.body instanceof URLSearchParams) safeInit.body = safeInit.body.toString();
        delete safeInit.signal;

        return new Promise((resolve, reject) => {
            pendingFetches.set(id, { resolve, reject });
            bridgeIframe.contentWindow.postMessage({ type: 'menal:fetch-request', id, url, init: safeInit }, BRIDGE_ORIGIN);
        });
    }

    async function resilientFetch(input, init) {
        const url = input instanceof Request ? input.url : String(input);
        if (forceBridgeFetch) return bridgeFetch(input, init);

        try {
            return await fetch(input, init);
        } catch (error) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            if (!wasBlocked(url)) throw error;
            forceBridgeFetch = true;
            return bridgeFetch(input, init);
        }
    }

    class ResilientWebSocket extends EventTarget {
        constructor(url, protocols) {
            super();
            this.url = String(url);
            this.protocols = protocols;
            this._binaryType = 'blob';
            this.readyState = WebSocket.CONNECTING;
            this.bufferedAmount = 0;
            this.protocol = '';
            this.extensions = '';
            this._socket = null;
            this._bridgeId = null;
            this._usingBridge = forceBridgeWebSocket;
            this._pendingSends = [];
            this._connect();
        }

        get binaryType() {
            return this._binaryType;
        }

        set binaryType(value) {
            if (value !== 'blob' && value !== 'arraybuffer') return;
            this._binaryType = value;
            if (this._socket) this._socket.binaryType = value;
        }

        _connect() {
            if (this._usingBridge) return this._connectBridge();
            try {
                const socket = this._socket = new WebSocket(this.url, this.protocols);
                socket.binaryType = this.binaryType;
                socket.addEventListener('open', () => {
                    this.readyState = WebSocket.OPEN;
                    this.protocol = socket.protocol;
                    this.extensions = socket.extensions;
                    this.dispatchEvent(new Event('open'));
                    this._flush();
                });
                socket.addEventListener('message', (event) => this.dispatchEvent(new MessageEvent('message', { data: event.data })));
                socket.addEventListener('error', () => this.dispatchEvent(new Event('error')));
                socket.addEventListener('close', async (event) => {
                    if (this.readyState === WebSocket.CLOSING || this.readyState === WebSocket.CLOSED) {
                        this._close(event.code, event.reason, event.wasClean);
                        return;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 100));
                    if (!wasBlocked(this.url)) {
                        this._close(event.code, event.reason, event.wasClean);
                        return;
                    }
                    forceBridgeWebSocket = true;
                    this._usingBridge = true;
                    this._connectBridge();
                });
            } catch (error) {
                this._error(error.message);
                this._close(1006, '', false);
            }
        }

        async _connectBridge() {
            try {
                ensureBridgeIframe();
                await waitForBridgeReady();
                if (this.readyState === WebSocket.CLOSING || this.readyState === WebSocket.CLOSED) return;
                this._bridgeId = createId();
                bridgeSockets.set(this._bridgeId, this);
                bridgeIframe.contentWindow.postMessage({
                    type: 'menal:socket-connect',
                    id: this._bridgeId,
                    url: this.url,
                    protocols: this.protocols,
                    binaryType: this.binaryType,
                }, BRIDGE_ORIGIN);
            } catch (error) {
                this._error(error.message);
                this._close(1006, '', false);
            }
        }

        _open() {
            if (this.readyState !== WebSocket.CONNECTING) return;
            this.readyState = WebSocket.OPEN;
            this.dispatchEvent(new Event('open'));
            this._flush();
        }

        _message(data) {
            if (data instanceof ArrayBuffer && this.binaryType === 'blob') data = new Blob([data]);
            this.dispatchEvent(new MessageEvent('message', { data }));
        }

        _error(message) {
            this.dispatchEvent(new ErrorEvent('error', { message: message || '' }));
        }

        _close(code = 1000, reason = '', wasClean = true) {
            if (this.readyState === WebSocket.CLOSED) return;
            this.readyState = WebSocket.CLOSED;
            this.dispatchEvent(new CloseEvent('close', { code, reason, wasClean }));
        }

        _flush() {
            const pending = this._pendingSends.splice(0);
            for (const data of pending) this.send(data);
        }

        send(data) {
            if (this.readyState === WebSocket.CONNECTING) {
                this._pendingSends.push(data);
                return;
            }
            if (this.readyState !== WebSocket.OPEN) throw new DOMException('WebSocket is not open', 'InvalidStateError');
            if (!this._usingBridge) return this._socket.send(data);

            let body;
            if (data instanceof ArrayBuffer) body = data;
            else if (ArrayBuffer.isView(data)) body = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            else if (typeof data === 'string') body = data;
            else throw new TypeError('Bridge WebSocket supports strings and ArrayBuffer data only');

            const transfer = body instanceof ArrayBuffer ? [body] : [];
            bridgeIframe.contentWindow.postMessage({ type: 'menal:socket-send', id: this._bridgeId, body }, BRIDGE_ORIGIN, transfer);
        }

        close(code, reason) {
            if (this.readyState === WebSocket.CLOSING || this.readyState === WebSocket.CLOSED) return;
            this.readyState = WebSocket.CLOSING;
            if (this._usingBridge && this._bridgeId) {
                bridgeIframe.contentWindow.postMessage({ type: 'menal:socket-close', id: this._bridgeId, code, reason }, BRIDGE_ORIGIN);
            } else if (this._socket) {
                this._socket.close(code, reason);
            } else {
                this._close(code, reason, true);
            }
        }
    }

    ResilientWebSocket.CONNECTING = WebSocket.CONNECTING;
    ResilientWebSocket.OPEN = WebSocket.OPEN;
    ResilientWebSocket.CLOSING = WebSocket.CLOSING;
    ResilientWebSocket.CLOSED = WebSocket.CLOSED;

    // Match WidgetStar's public widget API: widgets can call resilientFetch directly.
    window.resilientFetch = resilientFetch;
    window.resilientWebSocket = (url, protocols) => new ResilientWebSocket(url, protocols);
    window.__menalBridge = {
        fetch: resilientFetch,
        webSocket: window.resilientWebSocket,
    };
})();

(function () {
    "use strict"

    const hostScript = document.currentScript;
    const DEFAULT_SETTINGS = {
        "cursor_width": 16,
        "cursor_height": 20,
        "cursor_opacity": 10,
        "cursor_fill": "rgb(100, 76, 110)",
        "cursor_outline": "rgb(255, 255, 255)",
        "left_box": "",
        "right_box": ""
    };
    const DEFAULT_IID = "12168";
    function readSettingsOverride() {
        if (!hostScript) return {};
        const raw = hostScript.getAttribute("data-settings");
        if (!raw) return {};
        try { return JSON.parse(raw); } catch (e) {}
        try { return JSON.parse(decodeURIComponent(raw)); } catch (e) { return {}; }
    }
    const settings = Object.assign({}, DEFAULT_SETTINGS, readSettingsOverride());
    const iid = (hostScript && hostScript.getAttribute("data-iid")) || DEFAULT_IID;
    const is_resize = !!settings.left_box && !!settings.right_box && !!document.querySelector(settings.left_box) && !!document.querySelector(settings.right_box)

    const style = document.createElement("style")
    style.textContent = `
        .cursor-widget-cursor {
            position: absolute;
            top: 0;
            left: 0;
            width: ${settings.cursor_width}px;
            height: ${settings.cursor_height}px;
            pointer-events: none;
            z-index: 99999999;
            opacity: ${settings.cursor_opacity / 10};
            transform: translate(-2px, -2px);
            transition: left 0.05s linear, top 0.05s linear;
        }
    `
    document.head.appendChild(style)

    const CURSOR_SVG = `
        <svg width="${settings.cursor_width}" height="${settings.cursor_height}" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 1 L2 17 L6.5 13.5 L9 19 L11.5 18 L9 12.5 L15 12.5 Z"
                  fill="${settings.cursor_fill}" stroke="${settings.cursor_outline}" stroke-width="1.2" stroke-linejoin="round"/>
        </svg>
    `

    const customStyle = document.createElement("style")
    customStyle.textContent = settings.css || ""
    if (customStyle.textContent) document.head.appendChild(customStyle)

    const cursors = new Map()
    const lastSeen = new Map()
    const STALE_MS = 10000

    const cursorsContainer = document.createElement("div")
    cursorsContainer.style.position = "absolute"
    cursorsContainer.style.top = "0"
    cursorsContainer.style.left = "0"
    document.body.appendChild(cursorsContainer)

    const ws = resilientWebSocket(`wss://widget.menal.xyz/cursors/ws?iid=${encodeURIComponent(iid)}`)
    ws.binaryType = "arraybuffer"

    function getCursorEl(id) {
        let curr = cursors.get(id)
        if (!curr) {
            curr = document.createElement("div")
            curr.className = "cursor-widget-cursor"
            curr.innerHTML = CURSOR_SVG
            cursorsContainer.appendChild(curr)
            cursors.set(id, curr)
        }
        return curr
    }

    function getRects() {
        var b00 = document.querySelector(settings.left_box).getBoundingClientRect()
        var b01 = document.querySelector(settings.right_box).getBoundingClientRect()
        window.rectLeft = b00.left
        window.rectRight = b01.right
        window.rectTop = b00.top
        window.rectWidth = rectRight - rectLeft
        window.rectHeight = document.body.clientHeight
        cursorsContainer.style.left = `${rectLeft}px`
        cursorsContainer.style.top = `${rectTop + window.scrollY}px`
    }

    if (is_resize) {
        getRects()
        window.addEventListener("resize", getRects, {
            passive: true,
        })
        window.addEventListener("scroll", getRects, {
            passive: true,
        })
        setInterval(getRects, 1000)
    }

    ws.addEventListener("message", (event) => {
        const view = new DataView(event.data)
        if (view.byteLength != 8) return

        const id = view.getUint16(0, true)
        let x, y, h
        if (is_resize) {
            x = view.getInt16(2, true)
            y = view.getInt16(4, true)
            h = view.getUint16(6, true)
        } else {
            x = view.getUint16(2, true)
            y = view.getUint16(4, true)
            h = view.getUint16(6, true)
        }

        if (is_resize) {
            x = Math.min(x, innerWidth - rectLeft - 50)
            y = Math.min(y, document.body.clientHeight - 100) * (document.body.clientHeight / h)
        } else {
            x = (x / 65535) * document.documentElement.scrollWidth
            y = (y / 65535) * document.documentElement.scrollHeight
        }

        const curr = getCursorEl(id)
        curr.style.left = `${x}px`
        curr.style.top = `${y}px`
        lastSeen.set(id, Date.now())
    })

    ws.addEventListener("close", () => {
        for (const curr of cursors.values()) curr.remove()
        cursors.clear()
        lastSeen.clear()
        clearInterval(ping)
        clearInterval(keepalive)
        clearInterval(staleTimer)
    })

    function sendPos(x, y) {
        if (ws.readyState !== WebSocket.OPEN) return
        if (is_resize) {
            x -= rectLeft
            y -= rectTop + window.scrollY
        } else {
            x = Math.round((x / document.documentElement.scrollWidth) * 65535)
            y = Math.round((y / document.documentElement.scrollHeight) * 65535)
        }
        const buf = new ArrayBuffer(6)
        const view = new DataView(buf)
        if (is_resize) {
            view.setInt16(0, x, true)
            view.setInt16(2, y, true)
        } else {
            view.setUint16(0, x, true)
            view.setUint16(2, y, true)
        }
        view.setUint16(4, document.body.clientHeight, true)
        ws.send(buf)
    }

    let lastSend = 0
    let lastX = 0
    let lastY = 0
    let havePos = false
    document.addEventListener("mousemove", (e) => {
        const now = performance.now()
        if (now - lastSend < 22) return
        lastSend = now
        lastX = Math.round(e.pageX)
        lastY = Math.round(e.pageY)
        havePos = true
        sendPos(lastX, lastY)
    })

    const keepalive = setInterval(() => {
        if (!havePos) return
        sendPos(lastX, lastY)
    }, 5000)

    const staleTimer = setInterval(() => {
        const now = Date.now()
        for (const [id, t] of lastSeen) {
            if (now - t > STALE_MS) {
                const el = cursors.get(id)
                if (el) el.remove()
                cursors.delete(id)
                lastSeen.delete(id)
            }
        }
    }, 3000)

    const ping = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return
        const buf = new ArrayBuffer(1)
        ws.send(buf)
    }, 30000);

    window.addEventListener("pagehide", () => {
        try { ws.close(); } catch {}
    });
})()
