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
