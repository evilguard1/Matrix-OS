/**
 * The WebSocket codec behind the Remote API tool.
 *
 * Bitburner is the client here, so it sends MASKED frames and expects unmasked
 * ones back. None of that can be checked against the game from this repo, but
 * it can be checked against a synthetic client that behaves the same way - and
 * the cases that actually break are the boring ones: payloads crossing the 126
 * and 65536 length boundaries, and messages split across TCP packets.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { handshake, encode, createDecoder } from "../tools/websocket.mjs";

// --- the handshake -----------------------------------------------------------
{
    // The accept value is a fixed transformation; getting it wrong means the
    // browser silently refuses the connection with no error anywhere.
    const key = "dGhlIHNhbXBsZSBub25jZQ==";
    const expected = crypto.createHash("sha1")
        .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    let written = "";
    const socket = { write: text => { written += text; } };
    const ok = handshake(socket, `GET / HTTP/1.1\r\nUpgrade: websocket\r\nSec-WebSocket-Key: ${key}\r\n\r\n`);
    assert.equal(ok, true);
    assert.match(written, /^HTTP\/1\.1 101 Switching Protocols/);
    assert.ok(written.includes(`Sec-WebSocket-Accept: ${expected}`), "accept hash must match RFC 6455");
    assert.ok(written.endsWith("\r\n\r\n"), "headers must be terminated or the client waits forever");
    // Case-insensitive header lookup: browsers do not agree on capitalisation.
    assert.equal(handshake({ write() {} }, "sec-websocket-key: abc\r\n\r\n"), true);
    assert.equal(handshake({ write() {} }, "GET / HTTP/1.1\r\n\r\n"), false, "no key, no handshake");
}

// --- framing round trip ------------------------------------------------------
// Build a masked client frame exactly as a browser would, then decode it.
function clientFrame(text, { fin = true, opcode = 0x1 } = {}) {
    const payload = Buffer.from(text, "utf8");
    const mask = crypto.randomBytes(4);
    const masked = Buffer.from(payload);
    for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
    let header;
    if (payload.length < 126) {
        header = Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | payload.length]);
    } else if (payload.length < 65536) {
        header = Buffer.alloc(4);
        header[0] = (fin ? 0x80 : 0) | opcode; header[1] = 0x80 | 126;
        header.writeUInt16BE(payload.length, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = (fin ? 0x80 : 0) | opcode; header[1] = 0x80 | 127;
        header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    return Buffer.concat([header, mask, masked]);
}

function decodeAll(chunks) {
    const seen = [];
    const decode = createDecoder((message, event) => { if (!event) seen.push(message); });
    for (const chunk of chunks) decode(chunk);
    return seen;
}

// The three length encodings. A file push crosses both boundaries immediately,
// and getting the 64-bit form wrong truncates the file silently.
for (const size of [1, 5, 125, 126, 200, 65535, 65536, 70000]) {
    const text = "x".repeat(size);
    assert.deepEqual(decodeAll([clientFrame(text)]), [text], `round trip failed at ${size} bytes`);
}

// A message split across TCP packets must be reassembled, not dropped. This is
// the normal case for anything large, not an edge case.
{
    const text = JSON.stringify({ jsonrpc: "2.0", id: 1, result: "y".repeat(50_000) });
    const frame = clientFrame(text);
    for (const chunkSize of [1, 3, 17, 1024, 8192]) {
        const chunks = [];
        for (let i = 0; i < frame.length; i += chunkSize) chunks.push(frame.subarray(i, i + chunkSize));
        assert.deepEqual(decodeAll(chunks), [text], `reassembly failed at ${chunkSize}-byte chunks`);
    }
}

// Several frames arriving in one packet must all be delivered.
{
    const messages = ["one", "two", "three"];
    const packet = Buffer.concat(messages.map(m => clientFrame(m)));
    assert.deepEqual(decodeAll([packet]), messages);
}

// WebSocket-level fragmentation: continuation frames form one message.
{
    const parts = [
        clientFrame("hel", { fin: false, opcode: 0x1 }),
        clientFrame("lo!", { fin: true, opcode: 0x0 }),
    ];
    assert.deepEqual(decodeAll(parts), ["hello!"]);
}

// Control frames must not surface as messages, or the JSON parser sees noise.
{
    const withPing = [clientFrame("", { opcode: 0x9 }), clientFrame("real")];
    assert.deepEqual(decodeAll(withPing), ["real"], "a ping must be swallowed, not delivered");
}

// --- what we send back -------------------------------------------------------
// Server frames must NOT be masked - a masked server frame is a protocol error
// and the browser closes the connection.
for (const size of [1, 125, 126, 65535, 65536]) {
    const frame = encode("z".repeat(size));
    assert.equal(frame[0], 0x81, "final text frame");
    assert.equal(frame[1] & 0x80, 0, "server frames are never masked");
    const declared = (frame[1] & 0x7f) === 126 ? frame.readUInt16BE(2)
        : (frame[1] & 0x7f) === 127 ? Number(frame.readBigUInt64BE(2))
        : frame[1] & 0x7f;
    assert.equal(declared, size, `declared length wrong at ${size} bytes`);
}
// Multi-byte characters are counted in bytes, not characters - a length in
// characters would truncate the payload and desync every frame after it.
{
    const text = "héllo — ✓";
    const frame = encode(text);
    assert.equal(frame[1] & 0x7f, Buffer.byteLength(text, "utf8"));
}

console.log("MATRIX-OS websocket passed: handshake, all three length forms, TCP and frame reassembly, unmasked replies.");
