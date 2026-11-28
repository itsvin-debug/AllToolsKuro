const { Reader, Writer } = require('protobufjs');
const { proto: baileysProto } = require('@whiskeysockets/baileys');

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

const KNOWN_WA_PROTO_FIELDS = {
  Message: new Set([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 22, 23, 24, 25,
    26, 28, 29, 30, 31, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48,
    49, 50, 51, 53, 54, 55, 56, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 69, 70,
    71, 72, 74, 75, 76, 77, 78, 80, 82, 83, 85, 86, 87, 88, 90, 91, 92, 93, 94,
    95, 96, 97, 98, 99, 100, 101, 102
  ]),
  StickerMessage: new Set([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 21, 22
  ]),
  VideoMessage: new Set([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 16, 17, 18, 19, 20, 21, 22, 23,
    24, 26, 28
  ]),
  AudioMessage: new Set([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 17, 18, 19, 20, 21, 22
  ]),
  LottieStickerMessage: new Set([1])
};

const WRAPPER_TAG_TO_INNER = {
  31: { name: 'deviceSentMessage', innerTag: 2 },
  37: { name: 'viewOnceMessage', innerTag: 1 },
  40: { name: 'ephemeralMessage', innerTag: 1 },
  55: { name: 'viewOnceMessageV2', innerTag: 1 },
  59: { name: 'viewOnceMessageV2Extension', innerTag: 1 },
  74: { name: 'lottieStickerMessage', innerTag: 1 },
  91: { name: 'associatedChildMessage', innerTag: 1 }
};

const SCOPE_TO_PARENT_FIELD = {
  StickerMessage: 26,
  VideoMessage: 9,
  AudioMessage: 8,
  LottieStickerMessage: 74
};

const KNOWN_MESSAGE_TAG_NAMES = {
  1: 'conversation',
  2: 'senderKeyDistributionMessage',
  3: 'imageMessage',
  4: 'contactMessage',
  5: 'locationMessage',
  6: 'extendedTextMessage',
  7: 'documentMessage',
  8: 'audioMessage',
  9: 'videoMessage',
  10: 'call',
  11: 'chat',
  12: 'protocolMessage',
  13: 'contactsArrayMessage',
  14: 'highlyStructuredMessage',
  15: 'fastRatchetKeySenderKeyDistributionMessage',
  16: 'sendPaymentMessage',
  18: 'liveLocationMessage',
  22: 'requestPaymentMessage',
  23: 'declinePaymentRequestMessage',
  24: 'cancelPaymentRequestMessage',
  25: 'templateMessage',
  26: 'stickerMessage',
  28: 'groupInviteMessage',
  29: 'templateButtonReplyMessage',
  30: 'productMessage',
  31: 'deviceSentMessage',
  35: 'messageContextInfo',
  36: 'listMessage',
  37: 'viewOnceMessage',
  38: 'orderMessage',
  39: 'listResponseMessage',
  40: 'ephemeralMessage',
  41: 'invoiceMessage',
  42: 'buttonsMessage',
  43: 'buttonsResponseMessage',
  44: 'paymentInviteMessage',
  45: 'interactiveMessage',
  46: 'reactionMessage',
  47: 'stickerSyncRmrMessage',
  48: 'interactiveResponseMessage',
  49: 'pollCreationMessage',
  50: 'pollUpdateMessage',
  51: 'keepInChatMessage',
  53: 'documentWithCaptionMessage',
  54: 'requestPhoneNumberMessage',
  55: 'viewOnceMessageV2',
  56: 'encReactionMessage',
  58: 'editedMessage',
  59: 'viewOnceMessageV2Extension',
  60: 'pollCreationMessageV2',
  61: 'scheduledCallCreationMessage',
  62: 'groupMentionedMessage',
  63: 'pinInChatMessage',
  64: 'pollCreationMessageV3',
  65: 'scheduledCallEditMessage',
  66: 'ptvMessage',
  67: 'botInvokeMessage',
  69: 'callLogMesssage',
  70: 'messageHistoryBundle',
  71: 'encCommentMessage',
  72: 'bcallMessage',
  74: 'lottieStickerMessage',
  75: 'eventMessage',
  76: 'encEventResponseMessage',
  77: 'commentMessage',
  78: 'newsletterAdminInviteMessage',
  80: 'placeholderMessage',
  82: 'secretEncryptedMessage',
  83: 'albumMessage',
  85: 'eventCoverImage',
  86: 'stickerPackMessage',
  87: 'statusMentionMessage',
  88: 'pollResultSnapshotMessage',
  90: 'pollCreationOptionImageMessage',
  91: 'associatedChildMessage',
  92: 'groupStatusMentionMessage',
  93: 'pollCreationMessageV4',
  94: 'pollCreationMessageV5',
  95: 'statusAddYours',
  96: 'groupStatusMessage',
  97: 'richResponseMessage',
  98: 'statusNotificationMessage',
  99: 'limitSharingMessage',
  100: 'botTaskMessage',
  101: 'questionMessage',
  102: 'messageHistoryNotice'
};

const RECENT_WIRE_MAX = 16;
const recentRawWireFrames = [];
const RECENT_RAW_BYTES_MAX = 16;
const recentRawByteSnapshots = [];
const decodeObservers = new Map(); // listener -> { protoCls, isActive }
const wrappedDecodeMeta = new WeakMap(); // protoCls -> { origDecode }
const RAW_WIRE_BYTES_SYM = Symbol.for('kuro.rawPatchedWireBytes');
const encodeHookState = new WeakMap(); // protoCls -> { origEncode, refCount }

function pushRecentRawByteSnapshot(snap) {
  recentRawByteSnapshots.push(snap);
  while (recentRawByteSnapshots.length > RECENT_RAW_BYTES_MAX) {
    recentRawByteSnapshots.shift();
  }
}

function getRecentRawWireBytesSnapshots(maxAgeMs = 4000) {
  const cutoff = Date.now() - Math.max(500, Number(maxAgeMs) || 4000);
  return recentRawByteSnapshots.filter((s) => s && (s.capturedAt || 0) >= cutoff);
}

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

function pushRecentWireFrame(frame) {
  recentRawWireFrames.push(frame);
  while (recentRawWireFrames.length > RECENT_WIRE_MAX) {
    recentRawWireFrames.shift();
  }
}

function getRecentRawWireFrames() {
  return [...recentRawWireFrames];
}

function decodeLengthDelimitedNode(field, payload, maxDepth, depth) {
  const len = payload.length;
  const asciiPrintable = isPrintableAsciiUtf8(payload);

  // Bongkar rekursif field wireType=2 hingga 16 KB (hilangkan batas kecil 128 byte agar field #31 / deviceSentMessage terbuka penuh)
  if ((!asciiPrintable || len > 512) && depth < maxDepth && len >= 2 && len <= 16384) {
    const nested = inspectProtobufWireStrict(payload, maxDepth, depth + 1);
    if (nested) {
      return {
        field,
        wireType: 2,
        len,
        subFields: nested
      };
    }
  }

  if (asciiPrintable) {
    const utf8 = Buffer.from(payload).toString('utf8').slice(0, 300);
    return {
      field,
      wireType: 2,
      len,
      utf8,
      previewUtf8: utf8
    };
  }

  return {
    field,
    wireType: 2,
    len,
    hexHead: Buffer.from(payload.subarray(0, 16)).toString('hex')
  };
}

/**
 * Parse raw protobuf wire bytes tanpa skema statis (menangkap unknown fields & sub-message hingga 16 KB / kedalaman 8).
 */
function inspectProtobufWire(uint8Array, maxDepth = 8, depth = 0) {
  if (!uint8Array || uint8Array.length === 0) return [];
  const bytes = uint8Array instanceof Uint8Array ? uint8Array : Buffer.from(uint8Array);
  const reader = Reader.create(bytes);
  const fields = [];
  let count = 0;

  try {
    while (reader.pos < reader.len && count < 256) {
      count++;
      const tag = reader.uint32();
      const field = tag >>> 3;
      const wireType = tag & 7;
      if (field === 0 || field > 536870911) break;

      if (wireType === 0) {
        const val = reader.uint64();
        const num = typeof val?.toNumber === 'function' ? val.toNumber() : Number(val);
        const safeVal = Number.isSafeInteger(num) ? num : String(val);
        fields.push({
          field,
          wireType: 0,
          value: safeVal,
          varintValue: safeVal
        });
      } else if (wireType === 1) {
        if (reader.pos + 8 > reader.len) break;
        const slice = bytes.subarray(reader.pos, reader.pos + 8);
        reader.pos += 8;
        const fixedHex = Buffer.from(slice).toString('hex');
        fields.push({
          field,
          wireType: 1,
          len: 8,
          fixedHex,
          hex: fixedHex
        });
      } else if (wireType === 2) {
        const len = reader.uint32();
        if (reader.pos + len > reader.len) break;
        const payload = bytes.subarray(reader.pos, reader.pos + len);
        reader.pos += len;
        fields.push(decodeLengthDelimitedNode(field, payload, maxDepth, depth));
      } else if (wireType === 5) {
        if (reader.pos + 4 > reader.len) break;
        const slice = bytes.subarray(reader.pos, reader.pos + 4);
        const fixedHex = Buffer.from(slice).toString('hex');
        const intVal = reader.fixed32();
        let floatVal = null;
        try {
          floatVal = Number(Buffer.from(slice).readFloatLE(0).toFixed(6));
        } catch (_) {}
        fields.push({
          field,
          wireType: 5,
          len: 4,
          fixedHex,
          intValue: intVal,
          value: intVal,
          ...(floatVal !== null && Number.isFinite(floatVal) ? { floatValue: floatVal } : {})
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
    while (reader.pos < reader.len && sub.length < 128) {
      const tag = reader.uint32();
      const field = tag >>> 3;
      const wireType = tag & 7;
      if (field === 0 || field > 10000) return null;
      if (wireType === 0) {
        const val = reader.uint64();
        const num = typeof val?.toNumber === 'function' ? val.toNumber() : Number(val);
        const safeVal = Number.isSafeInteger(num) ? num : String(val);
        sub.push({ field, wireType: 0, value: safeVal, varintValue: safeVal });
      } else if (wireType === 1) {
        if (reader.pos + 8 > reader.len) return null;
        const slice = bytes.subarray(reader.pos, reader.pos + 8);
        reader.pos += 8;
        const fixedHex = Buffer.from(slice).toString('hex');
        sub.push({ field, wireType: 1, len: 8, fixedHex, hex: fixedHex });
      } else if (wireType === 2) {
        const len = reader.uint32();
        if (reader.pos + len > reader.len) return null;
        const payload = bytes.subarray(reader.pos, reader.pos + len);
        reader.pos += len;
        sub.push(decodeLengthDelimitedNode(field, payload, maxDepth, depth));
      } else if (wireType === 5) {
        if (reader.pos + 4 > reader.len) return null;
        const slice = bytes.subarray(reader.pos, reader.pos + 4);
        const fixedHex = Buffer.from(slice).toString('hex');
        const intVal = reader.fixed32();
        let floatVal = null;
        try {
          floatVal = Number(Buffer.from(slice).readFloatLE(0).toFixed(6));
        } catch (_) {}
        sub.push({
          field,
          wireType: 5,
          len: 4,
          fixedHex,
          intValue: intVal,
          value: intVal,
          ...(floatVal !== null && Number.isFinite(floatVal) ? { floatValue: floatVal } : {})
        });
      } else {
        return null;
      }
    }
    return reader.pos === reader.len && sub.length > 0 ? sub : null;
  } catch {
    return null;
  }
}

function verifyWireBytesStrict(uint8Array) {
  if (!uint8Array || uint8Array.length === 0) {
    return { ok: false, fieldCount: 0, error: 'Payload wire kosong.' };
  }
  const bytes = uint8Array instanceof Uint8Array ? uint8Array : Buffer.from(uint8Array);
  const parsed = inspectProtobufWireStrict(bytes, 4, 0);
  if (!parsed || parsed.length === 0) {
    return { ok: false, fieldCount: 0, error: 'Wire bytes terpotong atau gagal verifikasi struktural.' };
  }
  return { ok: true, fieldCount: parsed.length, wireTree: parsed };
}

function formatUnknownNode(node, scope, parentField = null) {
  return {
    scope,
    ...(parentField !== null ? { parentField } : {}),
    field: Number(node.field),
    wireType: Number(node.wireType),
    ...(node.varintValue !== undefined ? { varintValue: node.varintValue } : {}),
    ...(node.len !== undefined ? { len: Number(node.len) } : {}),
    ...(node.previewUtf8 !== undefined ? { previewUtf8: node.previewUtf8 } : {}),
    ...(node.hexHead !== undefined ? { hexHead: node.hexHead } : {}),
    ...(node.hex !== undefined ? { hex: node.hex } : {}),
    ...(node.value !== undefined && node.wireType !== 0 ? { value: node.value } : {}),
    ...(Array.isArray(node.subFields) ? { subFields: node.subFields } : {})
  };
}

/**
 * Bandingkan pohon wire tags mentah terhadap skema WAProto 6.7.24 (Message + sub-message media).
 */
function diffUnknownWireFields(rawWireTree = [], knownSchemaFields = null) {
  if (!Array.isArray(rawWireTree) || rawWireTree.length === 0) return [];

  if (knownSchemaFields) {
    const customSet = knownSchemaFields instanceof Set
      ? knownSchemaFields
      : new Set(Array.isArray(knownSchemaFields) ? knownSchemaFields : []);
    return rawWireTree
      .filter((node) => node && !customSet.has(Number(node.field)))
      .map((node) => formatUnknownNode(node, 'custom'));
  }

  const out = [];
  const seen = new Set();
  const pushUnique = (entry) => {
    const key = `${entry.scope}:${entry.parentField || 0}:${entry.field}:${entry.wireType}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(entry);
  };

  const visitMessageTree = (nodes, depth = 0) => {
    if (!Array.isArray(nodes) || depth > 8) return;
    for (const node of nodes) {
      if (!node) continue;
      const fid = Number(node.field);
      if (!KNOWN_WA_PROTO_FIELDS.Message.has(fid) || Number(node.wireType) !== 2) {
        pushUnique(formatUnknownNode(node, 'Message', null));
      }

      if (Array.isArray(node.subFields)) {
        const wrapper = WRAPPER_TAG_TO_INNER[fid];
        if (wrapper) {
          const innerHolder = node.subFields.find((s) => Number(s.field) === wrapper.innerTag);
          if (innerHolder && Array.isArray(innerHolder.subFields)) {
            visitMessageTree(innerHolder.subFields, depth + 1);
          }
          continue;
        }

        // Telusuri quotedMessage (#3) di dalam contextInfo (#17) pada reply (.klon)
        if (fid === 6 || fid === 1 || fid === 3 || fid === 9 || fid === 26) {
          const ctxNode = node.subFields.find((s) => Number(s.field) === 17);
          const quotedNode = ctxNode?.subFields?.find((s) => Number(s.field) === 3);
          if (quotedNode && Array.isArray(quotedNode.subFields)) {
            visitMessageTree(quotedNode.subFields, depth + 1);
          }
        }

        const nestedSchemas = {
          26: { scope: 'StickerMessage', set: KNOWN_WA_PROTO_FIELDS.StickerMessage },
          9: { scope: 'VideoMessage', set: KNOWN_WA_PROTO_FIELDS.VideoMessage },
          66: { scope: 'VideoMessage', set: KNOWN_WA_PROTO_FIELDS.VideoMessage },
          8: { scope: 'AudioMessage', set: KNOWN_WA_PROTO_FIELDS.AudioMessage }
        };
        const targetSchema = nestedSchemas[fid];
        if (targetSchema) {
          for (const child of node.subFields) {
            if (child && !targetSchema.set.has(Number(child.field))) {
              pushUnique(formatUnknownNode(child, targetSchema.scope, fid));
            }
          }
        }
      }
    }
  };

  visitMessageTree(rawWireTree, 0);
  return out;
}

function hasAnyActiveDecodeObserver() {
  for (const meta of decodeObservers.values()) {
    if (!meta.isActive || meta.isActive()) return true;
  }
  return false;
}

function ensureDecodeWrapped(protoCls) {
  if (!protoCls || typeof protoCls.decode !== 'function') return;
  if (wrappedDecodeMeta.has(protoCls)) return;

  const origDecode = protoCls.decode;
  wrappedDecodeMeta.set(protoCls, { origDecode });

  protoCls.decode = function observedMessageDecode(readerOrBuf, length) {
    const decoded = origDecode.apply(this, arguments);

    try {
      if (hasAnyActiveDecodeObserver()) {
        const rawBytes =
          readerOrBuf instanceof Uint8Array
            ? readerOrBuf
            : readerOrBuf?.buf instanceof Uint8Array
              ? readerOrBuf.buf
              : null;

        if (rawBytes && rawBytes.length >= 2 && rawBytes.length <= 65536) {
          const sliced =
            readerOrBuf?.buf instanceof Uint8Array && Number.isFinite(length)
              ? rawBytes.subarray(readerOrBuf.pos || 0, Math.min(rawBytes.length, (readerOrBuf.pos || 0) + length))
              : rawBytes;
          if (sliced.length >= 2 && sliced.length <= 65536) {
            const decodedKeys = decoded && typeof decoded === 'object' ? Object.keys(decoded) : [];
            const now = Date.now();
            if (sliced.length <= 32768) {
              pushRecentRawByteSnapshot({
                capturedAt: now,
                byteLength: sliced.length,
                decodedKeys,
                rawBytes: Uint8Array.from(sliced)
              });
            }

            let needsFullWireParse = false;
            for (const meta of decodeObservers.values()) {
              if (meta.protoCls !== protoCls) continue;
              if (meta.isActive && !meta.isActive()) continue;
              if (!meta.lightweightOnly || meta.lightweightOnly()) {
                needsFullWireParse = true;
                break;
              }
            }

            if (needsFullWireParse) {
              const wireTree = inspectProtobufWire(sliced, 8);
              const frame = {
                capturedAt: now,
                byteLength: sliced.length,
                wireTree,
                decodedKeys
              };
              pushRecentWireFrame(frame);
              for (const [cb, meta] of decodeObservers.entries()) {
                if (meta.protoCls !== protoCls) continue;
                if (meta.isActive && !meta.isActive()) continue;
                try {
                  cb(frame);
                } catch (_) {}
              }
            }
          }
        }
      }
    } catch (_) {}

    return decoded;
  };
}

function maybeUnwrapDecode(protoCls) {
  if (!protoCls) return;
  for (const meta of decodeObservers.values()) {
    if (meta.protoCls === protoCls) return;
  }
  const saved = wrappedDecodeMeta.get(protoCls);
  if (saved) {
    protoCls.decode = saved.origDecode;
    wrappedDecodeMeta.delete(protoCls);
  }
}

/**
 * Observer read-only pada `proto.Message.decode` (hanya aktif saat kalibrasi, nol mutasi Signal E2EE).
 */
function armSafeProtoDecodeObserver(onRawBytes, opts = {}) {
  const protoCls = opts.protoMessage || baileysProto?.Message;
  if (!protoCls || typeof protoCls.decode !== 'function') {
    return () => {};
  }
  const cb = typeof onRawBytes === 'function' ? onRawBytes : () => {};
  decodeObservers.set(cb, {
    protoCls,
    isActive: typeof opts.isActive === 'function' ? opts.isActive : null,
    lightweightOnly: typeof opts.shouldParseWire === 'function' ? opts.shouldParseWire : null
  });
  ensureDecodeWrapped(protoCls);
  return () => disarmSafeProtoDecodeObserver(cb, { protoMessage: protoCls });
}

function disarmSafeProtoDecodeObserver(onRawBytes, opts = {}) {
  const protoCls = opts.protoMessage || baileysProto?.Message;
  if (typeof onRawBytes === 'function') {
    decodeObservers.delete(onRawBytes);
  } else {
    for (const [cb, meta] of decodeObservers.entries()) {
      if (meta.protoCls === protoCls) decodeObservers.delete(cb);
    }
  }
  maybeUnwrapDecode(protoCls);
}

function encodeSyntheticAudioSubMessage(audioMeta = {}, templateSubFields = []) {
  const writer = Writer.create();
  const hasUrl = Boolean(audioMeta.url);
  const hasDirect = Boolean(audioMeta.directPath);
  const hasKey = Boolean(audioMeta.mediaKey);
  const hasSha = Boolean(audioMeta.fileSha256);
  const hasEncSha = Boolean(audioMeta.fileEncSha256);

  for (const sub of templateSubFields) {
    if (!sub || !sub.field) continue;
    const tagBase = (Number(sub.field) << 3) | Number(sub.wireType);

    if (sub.wireType === 0) {
      let val = Number(sub.varintValue ?? sub.value ?? 0);
      if (sub.field === 4 && audioMeta.fileLength) val = Number(audioMeta.fileLength);
      else if (sub.field === 5 && audioMeta.seconds) val = Math.max(1, Math.round(Number(audioMeta.seconds)));
      else if (val >= 1000 && val <= 60000 && audioMeta.seconds) {
        val = Math.max(500, Math.round(Number(audioMeta.seconds) * 1000));
      }
      writer.uint32(tagBase).uint64(Math.max(0, Math.round(val)));
    } else if (sub.wireType === 2) {
      const utf8 = String(sub.previewUtf8 || '');
      if (sub.field === 1 && hasUrl) {
        writer.uint32(tagBase).string(String(audioMeta.url));
      } else if (sub.field === 2 && (utf8.includes('audio/') || utf8.includes('/') || audioMeta.mimetype)) {
        writer.uint32(tagBase).string(String(audioMeta.mimetype || utf8 || 'audio/mp4'));
      } else if (sub.field === 3 && hasSha) {
        writer.uint32(tagBase).bytes(audioMeta.fileSha256);
      } else if (sub.field === 7 && hasKey) {
        writer.uint32(tagBase).bytes(audioMeta.mediaKey);
      } else if (sub.field === 8 && hasEncSha) {
        writer.uint32(tagBase).bytes(audioMeta.fileEncSha256);
      } else if (sub.field === 9 && hasDirect) {
        writer.uint32(tagBase).string(String(audioMeta.directPath));
      } else if (utf8.startsWith('https://') && hasUrl) {
        writer.uint32(tagBase).string(String(audioMeta.url));
      } else if (utf8.startsWith('/v/') && hasDirect) {
        writer.uint32(tagBase).string(String(audioMeta.directPath));
      } else if (utf8.startsWith('audio/') && audioMeta.mimetype) {
        writer.uint32(tagBase).string(String(audioMeta.mimetype));
      } else if (utf8) {
        writer.uint32(tagBase).string(utf8);
      } else if (sub.len === 32 && hasKey) {
        writer.uint32(tagBase).bytes(audioMeta.fileSha256 || audioMeta.mediaKey);
      } else {
        throw new Error(`Sub-field unknown #${sub.field} (${sub.len || 0}B) tidak dapat disintesis aman.`);
      }
    }
  }
  return writer.finish();
}

function writeUnknownFieldToWriter(writer, spec, audioMeta = {}) {
  const field = Number(spec?.field);
  const wireType = Number(spec?.wireType);
  if (!field || field > 536870911) return;

  if (wireType === 0) {
    let val = Number(spec.varintValue ?? spec.value ?? 1);
    if (!Number.isFinite(val)) val = 1;
    if (val >= 1000 && val <= 60000 && audioMeta.seconds) {
      val = Math.max(500, Math.round(Number(audioMeta.seconds) * 1000));
    }
    writer.uint32((field << 3) | 0).uint64(Math.max(0, Math.round(val)));
    return;
  }

  if (wireType === 5) {
    const val = Number(spec.value ?? 0) >>> 0;
    writer.uint32((field << 3) | 5).fixed32(val);
    return;
  }

  if (wireType === 2) {
    if (Array.isArray(spec.subFields) && spec.subFields.length > 0) {
      if (!audioMeta.url && !audioMeta.directPath && !audioMeta.mediaKey) {
        const needsMedia = spec.subFields.some((s) => Number(s.len) === 32 || String(s.previewUtf8 || '').includes('/'));
        if (needsMedia) {
          throw new Error(`Field #${field} membutuhkan upload audio terlebih dahulu sebelum disintesis.`);
        }
      }
      const subBytes = encodeSyntheticAudioSubMessage(audioMeta, spec.subFields);
      writer.uint32((field << 3) | 2).bytes(subBytes);
      return;
    }

    if (typeof spec.previewUtf8 === 'string' && spec.previewUtf8.length > 0) {
      const str = spec.previewUtf8.startsWith('audio/') && audioMeta.mimetype
        ? String(audioMeta.mimetype)
        : spec.previewUtf8;
      writer.uint32((field << 3) | 2).string(str);
      return;
    }

    if (typeof spec.hexHead === 'string' && spec.hexHead.length > 0 && (spec.len || 0) <= 16) {
      const raw = Buffer.from(spec.hexHead, 'hex');
      writer.uint32((field << 3) | 2).bytes(raw.subarray(0, Number(spec.len) || raw.length));
      return;
    }

    throw new Error(`Payload wireType=2 field #${field} terlalu besar/buram untuk dikloning aman.`);
  }

  throw new Error(`WireType=${wireType} pada field #${field} tidak didukung untuk penulisan ulang aman.`);
}

function spliceNestedFieldBytes(outerBytes, targetFieldNum, fieldsToAppend, audioMeta) {
  const reader = Reader.create(outerBytes);
  const writer = Writer.create();
  let spliced = false;

  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    const field = tag >>> 3;
    const wireType = tag & 7;

    if (wireType === 0) {
      writer.uint32(tag).uint64(reader.uint64());
    } else if (wireType === 1) {
      const lo = reader.fixed32();
      const hi = reader.fixed32();
      writer.uint32(tag).fixed32(lo).fixed32(hi);
    } else if (wireType === 2) {
      const len = reader.uint32();
      const payload = outerBytes.subarray(reader.pos, reader.pos + len);
      reader.pos += len;

      if (field === targetFieldNum && !spliced) {
        const subWriter = Writer.create();
        const combined = Buffer.from(payload);
        // Salin field asli lalu tambahkan unknown wire fields di belakangnya
        const innerCheck = verifyWireBytesStrict(combined);
        if (!innerCheck.ok) {
          throw new Error(`Sub-message target #${targetFieldNum} tidak valid sebelum patching.`);
        }
        const rawWriter = Writer.create();
        for (const fSpec of fieldsToAppend) {
          writeUnknownFieldToWriter(rawWriter, fSpec, audioMeta);
        }
        const appended = rawWriter.finish();
        const finalSub = Buffer.concat([combined, Buffer.from(appended)]);
        writer.uint32(tag).bytes(finalSub);
        subWriter.finish();
        spliced = true;
      } else {
        writer.uint32(tag).bytes(payload);
      }
    } else if (wireType === 5) {
      writer.uint32(tag).fixed32(reader.fixed32());
    } else {
      throw new Error(`WireType ${wireType} tidak valid saat membaca pesan dasar.`);
    }
  }

  return { bytes: writer.finish(), spliced };
}

/**
 * Suntikkan unknown wire fields hasil blueprint ke proto.Message terverifikasi via protobufjs.Writer.
 */
function appendWireFieldsToEncodedMessage(baseProtoMessage, audioUploadMeta = {}, unknownWireFields = [], opts = {}) {
  const protoCls = opts.protoMessageCls || baileysProto?.Message;
  if (!baseProtoMessage || typeof baseProtoMessage !== 'object') {
    throw new Error('Objek proto.Message dasar tidak tersedia.');
  }
  if (!Array.isArray(unknownWireFields) || unknownWireFields.length === 0) {
    throw new Error('Tidak ada unknownWireFields yang perlu disisipkan.');
  }

  let currentBytes =
    baseProtoMessage instanceof Uint8Array
      ? Uint8Array.from(baseProtoMessage)
      : protoCls.encode(baseProtoMessage).finish();

  const baseCheck = verifyWireBytesStrict(currentBytes);
  if (!baseCheck.ok) {
    throw new Error(`Pesan dasar gagal verifikasi wire: ${baseCheck.error}`);
  }

  const topLevelSpecs = [];
  const nestedByParent = new Map();
  for (const spec of unknownWireFields) {
    if (!spec || !spec.field) continue;
    const parentId = spec.parentField || SCOPE_TO_PARENT_FIELD[spec.scope] || null;
    if (parentId) {
      if (!nestedByParent.has(parentId)) nestedByParent.set(parentId, []);
      nestedByParent.get(parentId).push(spec);
    } else {
      topLevelSpecs.push(spec);
    }
  }

  for (const [parentId, specs] of nestedByParent.entries()) {
    const res = spliceNestedFieldBytes(currentBytes, parentId, specs, audioUploadMeta);
    if (!res.spliced) {
      throw new Error(`Field target #${parentId} tidak ditemukan di dalam proto.Message dasar.`);
    }
    currentBytes = res.bytes;
  }

  if (topLevelSpecs.length > 0) {
    const extraWriter = Writer.create();
    for (const spec of topLevelSpecs) {
      writeUnknownFieldToWriter(extraWriter, spec, audioUploadMeta);
    }
    const extraBytes = extraWriter.finish();
    currentBytes = Uint8Array.from(Buffer.concat([Buffer.from(currentBytes), Buffer.from(extraBytes)]));
  }

  const finalCheck = verifyWireBytesStrict(currentBytes);
  if (!finalCheck.ok) {
    throw new Error(`Verifikasi round-trip wire gagal pasca-patch: ${finalCheck.error}`);
  }

  return {
    ok: true,
    bytes: currentBytes,
    wireTree: finalCheck.wireTree,
    verifiedFieldCount: finalCheck.fieldCount
  };
}

/**
 * Jalankan callback async dengan hook encode terisolasi hanya untuk objek pesan bertag RAW_WIRE_BYTES_SYM.
 */
async function withScopedPatchedMessageEncode(protoCls, targetMsgObj, rawBytes, asyncFn) {
  const cls = protoCls || baileysProto?.Message;
  if (!cls || typeof cls.encode !== 'function') {
    return asyncFn();
  }

  Object.defineProperty(targetMsgObj, RAW_WIRE_BYTES_SYM, {
    value: rawBytes,
    enumerable: true,
    configurable: true,
    writable: true
  });

  let state = encodeHookState.get(cls);
  if (!state) {
    const origEncode = cls.encode.bind(cls);
    state = { origEncode, refCount: 0 };
    encodeHookState.set(cls, state);
    cls.encode = function scopedEncode(message, writer) {
      const directRaw = message && typeof message === 'object' ? message[RAW_WIRE_BYTES_SYM] : null;
      if (directRaw instanceof Uint8Array && !writer) {
        return { finish: () => directRaw };
      }
      return state.origEncode(message, writer);
    };
  }
  state.refCount++;

  try {
    return await asyncFn();
  } finally {
    delete targetMsgObj[RAW_WIRE_BYTES_SYM];
    state.refCount = Math.max(0, state.refCount - 1);
    if (state.refCount === 0) {
      cls.encode = state.origEncode;
      encodeHookState.delete(cls);
    }
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

function extractTextAndQuoted(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'object') {
    return { text: '', normalizedText: '', contextInfo: null, innerMessage: null, wrapperChain: [] };
  }

  let cur = rawMessage;
  const wrapperChain = [];
  let bestContextInfo = null;
  let bestText = '';

  const pickAtNode = (node) => {
    if (!node || typeof node !== 'object') return;
    const ext = node.extendedTextMessage;
    const txt = ext?.text || node.conversation || '';
    if (txt && !bestText) bestText = String(txt);
    const ctx = ext?.contextInfo || node.messageContextInfo || null;
    if (ctx && typeof ctx === 'object') {
      if (!bestContextInfo || (!bestContextInfo.quotedMessage && ctx.quotedMessage)) {
        bestContextInfo = ctx;
      }
    }
  };

  for (let i = 0; i < 12 && cur && typeof cur === 'object'; i++) {
    pickAtNode(cur);
    let unwrapped = false;
    for (const key of MESSAGE_WRAPPERS) {
      const next = cur[key]?.message;
      if (next && typeof next === 'object') {
        wrapperChain.push(key);
        cur = next;
        unwrapped = true;
        break;
      }
    }
    if (!unwrapped) break;
  }
  pickAtNode(cur);

  const rawText = String(bestText || '').trim();
  return {
    text: rawText,
    normalizedText: rawText.toLowerCase(),
    contextInfo: bestContextInfo,
    innerMessage: cur,
    wrapperChain
  };
}

/**
 * Masuk ke dalam wrapper Message (termasuk field 31 deviceSentMessage -> field 2) dan beri label setiap top-level field.
 */
function extractOpaqueInnerMessageTree(rawWireTree = []) {
  if (!Array.isArray(rawWireTree) || rawWireTree.length === 0) return [];

  let current = rawWireTree;
  for (let depth = 0; depth < 6 && Array.isArray(current); depth++) {
    let unwrapped = null;
    for (const node of current) {
      const wrapper = node && WRAPPER_TAG_TO_INNER[Number(node.field)];
      if (wrapper && Array.isArray(node.subFields)) {
        const innerHolder = node.subFields.find((s) => Number(s.field) === wrapper.innerTag);
        if (innerHolder && Array.isArray(innerHolder.subFields)) {
          unwrapped = innerHolder.subFields;
          break;
        }
      }
    }
    if (!unwrapped) break;
    current = unwrapped;
  }

  return current.map((node) => {
    const fid = Number(node.field);
    const knownName = KNOWN_MESSAGE_TAG_NAMES[fid] || null;
    return {
      ...node,
      field: fid,
      knownMessageFieldName: knownName,
      fieldLabel: knownName || `UNKNOWN_TOP_FIELD_#${fid}`
    };
  });
}

module.exports = {
  KNOWN_WA_PROTO_FIELDS,
  KNOWN_MESSAGE_TAG_NAMES,
  inspectProtobufWire,
  verifyWireBytesStrict,
  diffUnknownWireFields,
  extractOpaqueInnerMessageTree,
  armSafeProtoDecodeObserver,
  disarmSafeProtoDecodeObserver,
  getRecentRawWireFrames,
  getRecentRawWireBytesSnapshots,
  appendWireFieldsToEncodedMessage,
  withScopedPatchedMessageEncode,
  unwrapMessageContent,
  extractTextAndQuoted,
  unpadPkcs7Copy
};
