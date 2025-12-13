#!/usr/bin/env python3
"""
Thermal Camera Bridge
Reads frames from ESP32 via TCP using logic from test.py, converts to BMP base64,
and prints JSON lines for the Node.js server to relay over WebSocket.
"""

import json
import time
import base64
import sys
import signal
from datetime import datetime
import os
import socket
import struct

SIG = b'   #2808GFRA'
FRAME_LEN = 10256
PIX_OFFSET = 172
W, H = 80, 63

class ThermalBridge:
    def __init__(self, host='192.168.31.170', port=3333):
        self.host = host
        self.port = port
        self.running = True
        self.sock = None
        self.last_tail = None
        signal.signal(signal.SIGINT, self._sig)
        signal.signal(signal.SIGTERM, self._sig)

    def _sig(self, signum, frame):
        self.running = False
        try:
            if self.sock:
                self.sock.close()
        except Exception:
            pass
        sys.exit(0)

    def _build_cmd(self, cmd: str, data_ascii: bytes) -> bytes:
        total = len(cmd) + len(data_ascii) + 4
        len_field = f"{total:04X}".encode()
        body = len_field + cmd.encode() + data_ascii
        crc = f"{sum(body) & 0xFFFF:04X}".encode()
        return b'#' + body + crc

    def _start_capture_cmd(self) -> bytes:
        return self._build_cmd('WREG', b'B102')

    def _find_sig(self, b: bytearray) -> int:
        return b.find(SIG)

    def _crc_candidates(self, frame: bytes):
        got = frame[-4:]
        s_fixed = sum(frame[4:FRAME_LEN - 4]) & 0xFFFF
        try:
            ln = int(frame[4:8].decode(), 16)
        except Exception:
            ln = FRAME_LEN
        start = 4
        end = 4 + ln
        s_len = sum(frame[start:end-4]) & 0xFFFF
        prev_sum = sum(self.last_tail) if self.last_tail else sum(b"XXXX")
        return got, f"{s_fixed:04X}".encode(), f"{s_len:04X}".encode(), f"{(s_fixed + prev_sum) & 0xFFFF:04X}".encode(), f"{(s_len + prev_sum) & 0xFFFF:04X}".encode()

    def _decode_pixels(self, frame: bytes):
        # Parse as signed 16-bit (h) and convert to float Celsius
        # Data is in Kelvin * 100, so we divide by 100 then subtract 273.15
        scale = 100.0
        kelvin_offset = 273.15
        
        maxv_hdr = (struct.unpack_from('<h', frame, 12 + 5 * 2)[0] / scale) - kelvin_offset
        minv_hdr = (struct.unpack_from('<h', frame, 12 + 6 * 2)[0] / scale) - kelvin_offset
        
        pixels = []
        off = PIX_OFFSET
        for y in range(H):
            row_raw = struct.unpack_from('<' + 'h' * W, frame, off + y * W * 2)
            row = [(v / scale) - kelvin_offset for v in row_raw]
            pixels.append(row)
        
        # Sanity check: if header min/max are way off (e.g. < -100C or > 500C), re-calculate
        if (maxv_hdr == 0 or minv_hdr == 0) or (maxv_hdr <= minv_hdr) or (minv_hdr < -100) or (maxv_hdr > 500):
            minv = min(min(row) for row in pixels)
            maxv = max(max(row) for row in pixels)
        else:
            minv = minv_hdr
            maxv = maxv_hdr
        return minv, maxv, pixels

    def _robust_min_max(self, pixels, clip=0.01):
        vals = [v for row in pixels for v in row] # Don't filter 0, it's a valid temp
        if not vals:
            return 0.0, 1.0
        vals.sort()
        n = len(vals)
        lo = max(0, int(n * clip))
        hi = min(n - 1, int(n * (1.0 - clip)))
        return vals[lo], vals[hi]

    def _palette_iron(self):
        stops = [
            (0.0, 0, 0, 0),
            (0.2, 0, 0, 64),
            (0.4, 64, 0, 128),
            (0.6, 255, 64, 0),
            (0.8, 255, 200, 0),
            (1.0, 255, 255, 255),
        ]
        pal = []
        for i in range(256):
            t = i / 255.0
            for j in range(len(stops) - 1):
                a = stops[j][0]; b = stops[j+1][0]
                if t <= b:
                    u = 0.0 if b == a else (t - a) / (b - a)
                    r = int(stops[j][1] * (1 - u) + stops[j+1][1] * u)
                    g = int(stops[j][2] * (1 - u) + stops[j+1][2] * u)
                    bl = int(stops[j][3] * (1 - u) + stops[j+1][3] * u)
                    pal.append((r, g, bl))
                    break
        return pal

    def _bmp24_bytes(self, minv, maxv, pixels, palette):
        rng = max(0.1, maxv - minv)
        row_bytes = W * 3
        pad = (4 - (row_bytes % 4)) % 4
        img_bytes = (row_bytes + pad) * H
        header_size = 54
        file_size = header_size + img_bytes
        b = bytearray()
        # BITMAPFILEHEADER
        b += b"BM"
        b += struct.pack('<I', file_size)
        b += struct.pack('<H', 0)
        b += struct.pack('<H', 0)
        b += struct.pack('<I', header_size)
        # BITMAPINFOHEADER
        b += struct.pack('<I', 40)
        b += struct.pack('<i', W)
        b += struct.pack('<i', H)
        b += struct.pack('<H', 1)
        b += struct.pack('<H', 24)
        b += struct.pack('<I', 0)
        b += struct.pack('<I', img_bytes)
        b += struct.pack('<i', 2835)
        b += struct.pack('<i', 2835)
        b += struct.pack('<I', 0)
        b += struct.pack('<I', 0)
        # Pixel data (BMP bottom-up)
        for y in range(H-1, -1, -1):
            row = bytearray()
            for x in range(W):
                v = pixels[y][x]
                idx = int((v - minv) * 255 / rng)
                if idx < 0: idx = 0
                if idx > 255: idx = 255
                r, g, bl = palette[idx]
                row += bytes([bl, g, r])
            row += b"\x00" * pad
            b += row
        return bytes(b)

    def connect(self):
        # Add a small delay before connecting to allow previous connections to close
        time.sleep(1.0)
        
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5.0)
        try:
            s.connect((self.host, self.port))
            self.sock = s
            
            # Configure temperature mode (Celsius, 0.01°C resolution)
            # WREG 31 01
            s.sendall(self._build_cmd('WREG', b'3101'))
            time.sleep(0.1)
            # WREG B9 80
            s.sendall(self._build_cmd('WREG', b'B980'))
            time.sleep(0.1)
            
            pkt = self._build_cmd('WREG', b'B102')
            s.sendall(pkt)
            try:
                s.settimeout(1.0)
                _ = s.recv(64)
            except Exception:
                pass
            s.settimeout(5.0)
        except Exception as e:
            if self.sock:
                self.sock.close()
                self.sock = None
            raise e

    def read_frame(self, timeout=5.0):
        s = self.sock
        s.settimeout(timeout)
        acc = bytearray()
        start = time.time()
        while time.time() - start < timeout:
            chunk = s.recv(4096)
            if not chunk:
                time.sleep(0.01)
                continue
            acc += chunk
            i = self._find_sig(acc)
            if i >= 0:
                have = len(acc) - i
                if have < FRAME_LEN:
                    continue
                frame = bytes(acc[i:i+FRAME_LEN])
                del acc[:i+FRAME_LEN]
                got, ef, el, efp, elp = self._crc_candidates(frame)
                ok = got in (ef, el, efp, elp)
                tail = got
                self.last_tail = tail
                if not ok:
                    continue
                return frame
        return None

    def run(self):
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Thermal bridge started")
        print(f"Process ID: {os.getpid()}")
        try:
            self.connect()
            palette = self._palette_iron()
            while self.running:
                try:
                    frame = self.read_frame(timeout=10.0)
                    if frame is None:
                        continue
                    minv, maxv, pixels = self._decode_pixels(frame)
                    rmin, rmax = self._robust_min_max(pixels, 0.02)
                    if rmax <= rmin:
                        rmin, rmax = minv, maxv
                    bmp = self._bmp24_bytes(rmin, rmax, pixels, palette)
                    b64 = base64.b64encode(bmp).decode()
                    
                    # Calculate stats
                    cy, cx = H // 2, W // 2
                    center_temp = pixels[cy][cx]
                    
                    # Flatten pixels for frontend (round to 1 decimal to save bandwidth)
                    flat_temps = [round(v, 1) for row in pixels for v in row]
                    
                    out = {
                        'frame': b64,
                        'timestamp': int(time.time() * 1000),
                        'temperature_range': {
                            'min': float(rmin),
                            'max': float(rmax)
                        },
                        'center_temp': float(center_temp),
                        'max_temp': float(maxv),
                        'temps': flat_temps,
                        'width': W,
                        'height': H
                    }
                    print(json.dumps(out), flush=True)
                    time.sleep(1/30)
                except Exception as e:
                    print(f"Error: {e}", file=sys.stderr)
                    time.sleep(0.1)
        finally:
            if self.sock:
                try:
                    self.sock.close()
                except:
                    pass
            print("Thermal bridge stopped", file=sys.stderr)

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Thermal Camera Bridge')
    parser.add_argument('--host', type=str, default='192.168.31.170', help='ESP32 IP address')
    parser.add_argument('--port', type=int, default=3333, help='ESP32 Port')
    args = parser.parse_args()

    bridge = ThermalBridge(host=args.host, port=args.port)
    bridge.run()

if __name__ == '__main__':
    main()
