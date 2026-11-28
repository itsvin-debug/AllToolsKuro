const { Reader } = require('protobufjs');

const MESSAGE_WRAPPERS = [
  'deviceSentMessage',
  'ephemeralMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'documentWithCaptionMessage',
  'editedMessage',
  'associatedChildMessage',
  'lottieStickerMessage',
  'botInvokeMessage',
  'groupStatusMessage',
  'groupStatusMessageV2',
  'questionMessage',
  'commentMessage',
  'encCommentMessage',
  'eventMessage',
  'messageHistoryBundle'
];

function isPrintableAsciiUtf8(bytes) {
  if (!bytes || bytes.length === 0) return false;
  let str;
  try {
    str = Buffer.from(bytes).toString('utf8');
  } catch {
    return false;
  }
  if (!str) return false;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13) continue;
    if (code < 32 || code > 126) return false;
  }
  return true;
}

function unpadPkcs7Copy(buf) {
  if (!buf || buf.length === 0) return Buffer.alloc(0);
  const view = buf instanceof Uint8Array ? buf : Buffer.from(buf);
  const pad = view[view.length - 1];
  if (pad >= 1 && pad <= 16 && pad <= view.length) {
    let validPad = true;
    for (let i = view.length - pad; i < view.length; i++) {
      if (view[i] !== pad) {
        validPad = false;
        break;
      }
    }
    if (validPad) {
      return view.subarray(0, view.length - pad);
    }
  }
  return view;
}

/**
 * Parse raw protobuf wire bytes tanpa skema statis (anti-strip field baru WAProto).
 */
function inspectProtobufWire(uint8Array, maxDepth = 3, depth = 0) {
  if (!uint8Array || uint8Array.length === 0) return [];
  const bytes = uint8Array instanceof Uint8Array ? uint8Array : Buffer.from(uint8Array);
  const reader = Reader.create(bytes);
  const fields = [];
  let count = 0;

  try {
    while (reader.pos < reader.len && count < 64) {
      count++;
      const tag = reader.uint32();
      const field = tag >>> 3;
      const wireType = tag & 7;
      if (field === 0 || field > 536870911) break;

      if (wireType === 0) {
        const val = reader.uint64();
        const num = typeof val?.toNumber === 'function' ? val.toNumber() : Number(val);
        fields.push({
          field,
          wireType: 0,
          value: Number.isSafeInteger(num) ? num : String(val)
        });
      } else if (wireType === 1) {
        if (reader.pos + 8 > reader.len) break;
        const slice = bytes.subarray(reader.pos, reader.pos + 8);
        reader.pos += 8;
        fields.push({
          field,
          wireType: 1,
          hex: Buffer.from(slice).toString('hex')
        });
      } else if (wireType === 2) {
        const len = reader.uint32();
        if (reader.pos + len > reader.len) break;
        const payload = bytes.subarray(reader.pos, reader.pos + len);
        reader.pos += len;

        if (len > 128) {
          fields.push({
            field,
            wireType: 2,
            len,
            hexHead: Buffer.from(payload.subarray(0, 16)).toString('hex')
          });
        } else if (isPrintableAsciiUtf8(payload)) {
          fields.push({
            field,
            wireType: 2,
            len,
            previewUtf8: Buffer.from(payload).toString('utf8')
          });
        } else if (depth < maxDepth && len >= 2) {
          const nested = inspectProtobufWireStrict(payload, maxDepth, depth + 1);
          if (nested) {
            fields.push({
              field,
              wireType: 2,
              len,
              subFields: nested
            });
          } else {
            fields.push({
              field,
              wireType: 2,
              len,
              hexHead: Buffer.from(payload.subarray(0, 16)).toString('hex')
            });
          }
        } else {
          fields.push({
            field,
            wireType: 2,
            len,
            hexHead: Buffer.from(payload.subarray(0, 16)).toString('hex')
          });
        }
      } else if (wireType === 5) {
        if (reader.pos + 4 > reader.len) break;
        const val = reader.fixed32();
        fields.push({
          field,
          wireType: 5,
          value: val
        });
      } else {
        break;
      }
    }
  } catch {
    return fields;
  }

  return fields;
}

function inspectProtobufWireStrict(bytes, maxDepth, depth) {
  const reader = Reader.create(bytes);
  const sub = [];
  try {
    while (reader.pos < reader.len && sub.length < 32) {
      const tag = reader.uint32();
      const field = tag >>> 3;
      const wireType = tag & 7;
      if (field === 0 || field > 10000) return null;
      if (wireType === 0) {
        const val = reader.uint64();
        const num = typeof val?.toNumber === 'function' ? val.toNumber() : Number(val);
        sub.push({ field, wireType: 0, value: Number.isSafeInteger(num) ? num : String(val) });
      } else if (wireType === 1) {
        if (reader.pos + 8 > reader.len) return null;
        const slice = bytes.subarray(reader.pos, reader.pos + 8);
        reader.pos += 8;
        sub.push({ field, wireType: 1, hex: Buffer.from(slice).toString('hex') });
      } else if (wireType === 2) {
        const len = reader.uint32();
        if (reader.pos + len > reader.len) return null;
        const payload = bytes.subarray(reader.pos, reader.pos + len);
        reader.pos += len;
        if (len > 128) {
          sub.push({ field, wireType: 2, len, hexHead: Buffer.from(payload.subarray(0, 16)).toString('hex') });
        } else if (isPrintableAsciiUtf8(payload)) {
          sub.push({ field, wireType: 2, len, previewUtf8: Buffer.from(payload).toString('utf8') });
        } else if (depth < maxDepth && len >= 2) {
          const deeper = inspectProtobufWireStrict(payload, maxDepth, depth + 1);
          if (deeper) {
            sub.push({ field, wireType: 2, len, subFields: deeper });
          } else {
            sub.push({ field, wireType: 2, len, hexHead: Buffer.from(payload.subarray(0, 16)).toString('hex') });
          }
        } else {
          sub.push({ field, wireType: 2, len, hexHead: Buffer.from(payload.subarray(0, 16)).toString('hex') });
        }
      } else if (wireType === 5) {
        if (reader.pos + 4 > reader.len) return null;
        sub.push({ field, wireType: 5, value: reader.fixed32() });
      } else {
        return null;
      }
    }
    return reader.pos === reader.len && sub.length > 0 ? sub : null;
  } catch {
    return null;
  }
}

/**
 * Buka semua wrapper Baileys (deviceSentMessage, ephemeralMessage, viewOnce, dll.)
 */
function unwrapMessageContent(msgObj) {
  let cur = msgObj;
  const wrapperChain = [];
  for (let i = 0; i < 10 && cur && typeof cur === 'object'; i++) {
    let matched = false;
    for (const key of MESSAGE_WRAPPERS) {
      if (cur[key]?.message && typeof cur[key].message === 'object') {
        wrapperChain.push(key);
        cur = cur[key].message;
        matched = true;
        break;
      }
    }
    if (!matched) break;
  }
  return { innerMessage: cur, wrapperChain };
}

module.exports = {
  inspectProtobufWire,
  unwrapMessageContent,
  unpadPkcs7Copy
};
