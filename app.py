"""
SecureMessenger — автономный E2EE-релей сервер (zero-knowledge).

Полностью на стандартной библиотеке Python (нет внешних зависимостей).
Сервер НЕ хранит и не расшифровывает содержимое сообщений/файлов: он лишь
передаёт зашифрованные блобы между участниками комнаты и раздаёт статику.

Запуск:
    python app.py            # локальный сервер + автооткрытие браузера
    python app.py --port 8080 --no-browser
"""

import base64
import json
import os
import queue
import re
import sys
import threading
import time
import webbrowser
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

APP_NAME = "SecureMessenger"
MAX_BODY_BYTES = 50 * 1024 * 1024          # 50 МБ на файл
MAX_MESSAGE_BUFFER = 500                    # сообщений на комнату
ROOM_ID_RE = re.compile(r"^[a-zA-Z0-9\-_]{1,64}$")
FILE_ID_RE = re.compile(r"^[a-zA-Z0-9\-_]{1,128}$")
PEER_TIMEOUT_S = 120                        # отключение неактивных узлов
PING_INTERVAL_S = 15

# Глобальные хранилища (in-memory, как в исходном server.ts)
rooms = {}          # roomId -> {createdAt, messages, peers, clients}
files = {}          # fileId -> {buffer, expiresAt}

_lock = threading.Lock()

# Rate limiting: ip -> deque(timestamps)
_rate_limits = {}
_rate_lock = threading.Lock()


def now_ms() -> int:
    return int(time.time() * 1000)


def rate_limited(ip: str, max_req: int, window_s: float) -> bool:
    """Возвращает True, если лимит превышен."""
    ts = time.time()
    with _rate_lock:
        dq = _rate_limits.get(ip)
        if dq is None:
            dq = deque()
            _rate_limits[ip] = dq
        while dq and ts - dq[0] > window_s:
            dq.popleft()
        if len(dq) >= max_req:
            return True
        dq.append(ts)
        if len(_rate_limits) > 10000:  # защита от роста словаря
            for k in [k for k, v in _rate_limits.items() if not v]:
                _rate_limits.pop(k, None)
        return False


def get_or_create_room(room_id: str) -> dict:
    with _lock:
        if room_id not in rooms:
            rooms[room_id] = {
                "createdAt": now_ms(),
                "messages": [],
                "peers": {},     # peerId -> {id, name, publicKey, lastSeen}
                "clients": set(),  # set[queue.Queue]
            }
        return rooms[room_id]


def broadcast(room: dict, event: str, data, exclude: "queue.Queue | None" = None):
    payload = f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
    for q in list(room["clients"]):
        if q is exclude:
            continue
        try:
            q.put_nowait(payload)
        except queue.Full:
            pass


def cleanup_loop():
    while True:
        time.sleep(10)
        ts = now_ms()
        with _lock:
            for room_id, room in list(rooms.items()):
                initial = len(room["messages"])
                room["messages"] = [
                    m for m in room["messages"]
                    if not m.get("expiresAt") or m["expiresAt"] > ts
                ]
                if len(room["messages"]) != initial:
                    broadcast(room, "messages-pruned", {"now": ts})

                for peer_id, peer in list(room["peers"].items()):
                    if ts - peer["lastSeen"] > PEER_TIMEOUT_S * 1000:
                        del room["peers"][peer_id]
                        broadcast(room, "peer-left", {"peerId": peer_id})

                if not room["clients"] and not room["peers"] and not room["messages"]:
                    # Не удаляем, чтобы история сохранялась до очистки.
                    pass

            for file_id, f in list(files.items()):
                if f["expiresAt"] and f["expiresAt"] <= ts:
                    files.pop(file_id, None)


def resolve_base_dir() -> str:
    if getattr(sys, "frozen", False):
        return getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


class Handler(BaseHTTPRequestHandler):
    server_version = APP_NAME
    protocol_version = "HTTP/1.1"

    # ---- helpers -----------------------------------------------------
    def _send_json(self, code: int, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._security_headers()
        self.end_headers()
        self.wfile.write(body)

    def _security_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("X-XSS-Protection", "1; mode=block")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cache-Control", "no-store")

    def _client_ip(self) -> str:
        return self.client_address[0]

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY_BYTES:
            return None
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return None

    def log_message(self, fmt, *args):
        # Тихий вывод; при необходимости раскомментировать.
        pass

    def handle(self):
        # Гасим шумные ошибки при обрыве соединения клиентом
        # (EventSource/браузер часто рвёт SSE-соединения).
        try:
            super().handle()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, OSError):
            pass

    # ---- routing -----------------------------------------------------
    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        qs = parse_qs(parsed.query)

        if path == "/api/health":
            return self._send_json(200, {
                "status": "ok",
                "serverType": f"{APP_NAME} Zero-Knowledge E2EE Relay",
                "activeRooms": len(rooms),
                "timestamp": now_ms(),
            })

        if path == "/api/download-bat":
            bat = (
                "@echo off\r\n"
                f"title {APP_NAME} Desktop\r\n"
                "echo Запуск локального мессенджера...\r\n"
                'start "" "http://localhost:3000"\r\n'
                "exit\r\n"
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/x-bat")
            self.send_header("Content-Disposition", f'attachment; filename="{APP_NAME}-launcher.bat"')
            self.send_header("Content-Length", str(len(bat)))
            self._security_headers()
            self.end_headers()
            self.wfile.write(bat)
            return

        if path == "/api/download-exe":
            # В автономной сборке отдаём сам исполняемый файл,
            # чтобы пользователь мог передать приложение собеседнику.
            if getattr(sys, "frozen", False):
                exe_path = sys.executable
                if os.path.isfile(exe_path):
                    with open(exe_path, "rb") as fh:
                        data = fh.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/x-msdownload")
                    self.send_header("Content-Disposition", f'attachment; filename="{APP_NAME}.exe"')
                    self.send_header("Content-Length", str(len(data)))
                    self._security_headers()
                    self.end_headers()
                    self.wfile.write(data)
                    return
            return self._send_json(404, {"error": "EXE file not found"})

        m = re.match(r"^/api/rooms/([^/]+)/events$", path)
        if m:
            return self._handle_sse(m.group(1), qs)

        m = re.match(r"^/api/rooms/([^/]+)/files/([^/]+)$", path)
        if m:
            return self._handle_file_download(m.group(1), m.group(2))

        return self._serve_static(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        m = re.match(r"^/api/rooms/([^/]+)/messages$", path)
        if m:
            return self._handle_post_message(m.group(1))

        m = re.match(r"^/api/rooms/([^/]+)/files$", path)
        if m:
            return self._handle_file_upload(m.group(1))

        m = re.match(r"^/api/rooms/([^/]+)/typing$", path)
        if m:
            return self._handle_typing(m.group(1))

        self._send_json(404, {"error": "Not found"})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        m = re.match(r"^/api/rooms/([^/]+)/messages$", path)
        if m:
            return self._handle_clear_room(m.group(1))
        self._send_json(404, {"error": "Not found"})

    # ---- API handlers ------------------------------------------------
    def _handle_sse(self, room_id: str, qs):
        if not ROOM_ID_RE.match(room_id):
            return self._send_json(400, {"error": "Invalid room ID"})

        peer_id = (qs.get("peerId", [""])[0])[:100] or f"peer_{now_ms()}"
        peer_name = (qs.get("peerName", [""])[0])[:100] or "Anonymous Secure Node"
        public_key = (qs.get("publicKey", [""])[0])[:4096]

        room = get_or_create_room(room_id)
        with _lock:
            room["peers"][peer_id] = {
                "id": peer_id,
                "name": peer_name,
                "publicKey": public_key,
                "lastSeen": now_ms(),
            }

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self._security_headers()
        self.end_headers()

        # SSE — долгоживущий поток; после завершения сразу закрываем сокет,
        # чтобы не ловить ConnectionResetError при чтении следующего запроса.
        self.close_connection = True

        q: "queue.Queue[str]" = queue.Queue(maxsize=256)
        with _lock:
            room["clients"].add(q)

        try:
            with _lock:
                snapshot = {
                    "roomId": room_id,
                    "messages": list(room["messages"]),
                    "peers": list(room["peers"].values()),
                }
            self.wfile.write(
                f"event: init\ndata: {json.dumps(snapshot, ensure_ascii=False)}\n\n".encode("utf-8")
            )
            self.wfile.flush()

            broadcast(room, "peer-joined", {
                "peer": {"id": peer_id, "name": peer_name, "publicKey": public_key, "lastSeen": now_ms()}
            }, exclude=q)

            while True:
                try:
                    item = q.get(timeout=PING_INTERVAL_S)
                    self.wfile.write(item.encode("utf-8"))
                    self.wfile.flush()
                except queue.Empty:
                    self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            with _lock:
                room["clients"].discard(q)
                room["peers"].pop(peer_id, None)
            broadcast(room, "peer-left", {"peerId": peer_id})

    def _handle_post_message(self, room_id: str):
        if not ROOM_ID_RE.match(room_id):
            return self._send_json(400, {"error": "Invalid room ID"})
        if rate_limited(self._client_ip(), 60, 60):
            return self._send_json(429, {"error": "Too many requests"})

        body = self._read_json_body()
        if body is None:
            return self._send_json(400, {"error": "Invalid JSON body"})

        ciphertext = body.get("ciphertext")
        iv = body.get("iv")
        if not ciphertext or not iv:
            return self._send_json(400, {"error": "Missing ciphertext or iv in encrypted envelope"})

        sender_id = str(body.get("senderId") or "")[:100]
        sender_name = str(body.get("senderName") or "")[:100]
        if not sender_id or not sender_name:
            return self._send_json(400, {"error": "Invalid sender"})

        expires_at_sec = body.get("expiresAt")
        expires_at = (now_ms() + int(expires_at_sec) * 1000) if isinstance(expires_at_sec, (int, float)) else None

        msg = {
            "id": str(body.get("id") or "")[:64] or f"msg_{now_ms()}_{id(object()) & 0xffff}",
            "roomId": room_id,
            "senderId": sender_id,
            "senderName": sender_name,
            "senderPublicKey": str(body.get("senderPublicKey") or "")[:8192],
            "iv": str(iv)[:4096],
            "ciphertext": str(ciphertext)[:MAX_BODY_BYTES],
            "salt": str(body.get("salt") or "")[:4096] or None,
            "timestamp": now_ms(),
            "type": str(body.get("type") or "text")[:32],
            "fileMeta": body.get("fileMeta"),
            "expiresAt": expires_at,
        }

        room = get_or_create_room(room_id)
        with _lock:
            room["messages"].append(msg)
            if len(room["messages"]) > MAX_MESSAGE_BUFFER:
                room["messages"].pop(0)

        broadcast(room, "message", msg)
        self._send_json(200, {"success": True, "messageId": msg["id"], "timestamp": msg["timestamp"]})

    def _handle_file_upload(self, room_id: str):
        if not ROOM_ID_RE.match(room_id):
            return self._send_json(400, {"error": "Invalid room ID"})
        if rate_limited(self._client_ip(), 20, 60):
            return self._send_json(429, {"error": "Too many requests"})

        file_id = (self.headers.get("x-file-id") or "")[:128]
        if not FILE_ID_RE.match(file_id):
            file_id = f"file_{now_ms()}_{id(object()) & 0xffff}"

        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY_BYTES:
            return self._send_json(413, {"error": "File too large"})

        data = self.rfile.read(length)

        try:
            expires_sec = int(self.headers.get("x-expires-sec") or "0")
        except ValueError:
            expires_sec = 0
        expires_at = now_ms() + expires_sec * 1000 if expires_sec > 0 else None

        with _lock:
            files[file_id] = {"buffer": data, "expiresAt": expires_at}

        self._send_json(200, {
            "success": True,
            "fileId": file_id,
            "size": len(data),
            "roomId": room_id,
        })

    def _handle_file_download(self, room_id: str, file_id: str):
        if not ROOM_ID_RE.match(room_id) or not FILE_ID_RE.match(file_id):
            return self._send_json(400, {"error": "Invalid ID"})

        with _lock:
            f = files.get(file_id)
            buffer = f["buffer"] if f else None
        if buffer is None:
            return self._send_json(404, {"error": "Encrypted file not found or has expired"})

        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(buffer)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, private")
        self.end_headers()
        self.wfile.write(buffer)

    def _handle_typing(self, room_id: str):
        if not ROOM_ID_RE.match(room_id):
            return self._send_json(400, {"error": "Invalid room ID"})
        if rate_limited(self._client_ip(), 100, 60):
            return self._send_json(429, {"error": "Too many requests"})
        body = self._read_json_body() or {}
        room = get_or_create_room(room_id)
        broadcast(room, "typing", {
            "peerId": str(body.get("peerId") or "")[:100],
            "peerName": str(body.get("peerName") or "")[:100],
            "isTyping": bool(body.get("isTyping")),
        })
        self._send_json(200, {"success": True})

    def _handle_clear_room(self, room_id: str):
        if not ROOM_ID_RE.match(room_id):
            return self._send_json(400, {"error": "Invalid room ID"})
        if rate_limited(self._client_ip(), 10, 60):
            return self._send_json(429, {"error": "Too many requests"})
        room = rooms.get(room_id)
        if room:
            with _lock:
                room["messages"] = []
            broadcast(room, "room-wiped", {"roomId": room_id, "timestamp": now_ms()})
        self._send_json(200, {"success": True})

    # ---- static / SPA ------------------------------------------------
    def _serve_static(self, path: str):
        if path in ("", "/"):
            path = "/index.html"

        base = resolve_base_dir()
        dist = os.path.join(base, "dist")
        requested = os.path.normpath(path.lstrip("/"))
        full = os.path.join(dist, requested)

        # Защита от выхода за пределы dist
        if not os.path.realpath(full).startswith(os.path.realpath(dist) + os.sep) and os.path.realpath(full) != os.path.realpath(dist):
            return self._send_json(403, {"error": "Forbidden"})

        if os.path.isfile(full):
            return self._send_file(full)

        # SPA fallback
        index = os.path.join(dist, "index.html")
        if os.path.isfile(index):
            return self._send_file(index)

        return self._send_json(404, {"error": "Frontend not built. Run the build first."})

    def _send_file(self, filepath: str):
        ext = os.path.splitext(filepath)[1].lower()
        ctype = {
            ".html": "text/html; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".json": "application/json",
            ".ico": "image/x-icon",
            ".webmanifest": "application/manifest+json",
            ".woff2": "font/woff2",
        }.get(ext, "application/octet-stream")

        with open(filepath, "rb") as fh:
            data = fh.read()

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        if ext in (".html", ".js", ".css", ".json", ".svg", ".webmanifest"):
            self.send_header("Cache-Control", "no-cache")
        self._security_headers()
        self.end_headers()
        self.wfile.write(data)


def find_free_port(start: int, tries: int = 10) -> int:
    for port in range(start, start + tries):
        try:
            srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
            srv.server_close()
            return port
        except OSError:
            continue
    return start


def main():
    args = sys.argv[1:]
    port = 3000
    open_browser = True
    if "--port" in args:
        i = args.index("--port")
        port = int(args[i + 1])
    if "--no-browser" in args:
        open_browser = False

    port = find_free_port(port)
    httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    url = f"http://localhost:{port}"

    threading.Thread(target=cleanup_loop, daemon=True).start()

    print(f"[{APP_NAME}] E2EE Zero-Knowledge Relay running at {url}", flush=True)

    if open_browser:
        def _open():
            time.sleep(1.0)
            try:
                webbrowser.open(url)
            except Exception:
                pass
        threading.Thread(target=_open, daemon=True).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
