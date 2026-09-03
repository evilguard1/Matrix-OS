/**
 * The minimum WebSocket a Node process needs to be a server for Bitburner.
 *
 * Kept apart from the RFA client so the protocol can be tested without a game:
 * the handshake, client-masked frames, and the extended payload lengths that
 * file contents require the moment they exceed 125 bytes.
 */
import crypto from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export function handshake(socket, request) {
    const key = /sec-websocket-key:\s*(.+)/i.exec(request)?.[1]?.trim();
    if (!key) return false;
    const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
    socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
    return true;
}

/** Server-to-client frames are never masked. Lengths above 125 need the extended forms. */
export function encode(text) {
    const payload = Buffer.from(text, "utf8");
    const length = payload.length;
    let header;
    if (length < 126) {
        header = Buffer.from([0x81, length]);
    } else if (length < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81; header[1] = 126;
        header.writeUInt16BE(length, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x81; header[1] = 127;
        header.writeBigUInt64BE(BigInt(length), 2);
    }
    return Buffer.concat([header, payload]);
}

/**
 * Pulls complete frames out of a growing buffer. Client frames are masked, and a
 * message can arrive split across TCP packets or across WebSocket continuation
 * frames, so both are reassembled here rather than assumed away.
 */
export function createDecoder(onMessage) {
    let buffer = Buffer.alloc(0);
    let assembling = [];
    return chunk => {
        buffer = Buffer.concat([buffer, chunk]);
        for (;;) {
            if (buffer.length < 2) return;
            const fin = (buffer[0] & 0x80) !== 0;
            const opcode = buffer[0] & 0x0f;
            const masked = (buffer[1] & 0x80) !== 0;
            let length = buffer[1] & 0x7f;
            let offset = 2;
            if (length === 126) {
                if (buffer.length < offset + 2) return;
                length = buffer.readUInt16BE(offset); offset += 2;
            } else if (length === 127) {
                if (buffer.length < offset + 8) return;
                length = Number(buffer.readBigUInt64BE(offset)); offset += 8;
            }
            let mask = null;
            if (masked) {
                if (buffer.length < offset + 4) return;
                mask = buffer.subarray(offset, offset + 4); offset += 4;
            }
            if (buffer.length < offset + length) return;
            const payload = Buffer.from(buffer.subarray(offset, offset + length));
            if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
            buffer = buffer.subarray(offset + length);

            if (opcode === 0x8) { onMessage(null, "close"); return; }
            if (opcode === 0x9 || opcode === 0xa) continue;   // ping / pong
            assembling.push(payload);
            if (!fin) continue;
            const text = Buffer.concat(assembling).toString("utf8");
            assembling = [];
            onMessage(text);
        }
    };
}
