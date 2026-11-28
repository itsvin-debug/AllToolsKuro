const fs = require('fs');
const QRCode = require('qrcode');
const NodeCache = require('node-cache');
const baileysModule = require('@whiskeysockets/baileys');

const makeWASocket = baileysModule.default?.default || baileysModule.default || baileysModule;
const {
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  Browsers,
  proto,
  jidNormalizedUser
} = baileysModule;

const { MAX_ACTIVE_SESSIONS, pinoSilent, getWaVersion } = require('../config/constants');
const { isValidSessionId, normalizePhone } = require('../utils/common');
const {
  getSessionDir,
  writeOwnerHash,
  isDirRegistered,
  removeSessionDir,
  extractOwnIdentifiersFromCreds,
  clearOwnSignalSessionFilesOnDisk,
  consumeColdRestoredFlag
} = require('../utils/authFiles');
const {
  armSafeProtoDecodeObserver,
  installAudioStickerProtoExtension
} = require('../utils/protoWireInspector');

installAudioStickerProtoExtension(proto);
const { isCalibrated } = require('../config/soundStickerSpec');
const { proto: baileysProtoAlias } = baileysModule;
const { sessions } = require('../state/sessionStore');
const { emitToDevice, emitAuthSnapshotNow, scheduleAuthSnapshotSync } = require('../services/deviceAuthService');
const {
  resolveTargetIdentifiers,
  learnLidPair,
  buildContactsSyncPayload,
  upsertSavedContact,
  resolveSenderInfo
} = require('../services/contactsService');
const {
  buildVaultPayload,
  emitVaultItem,
  downloadMediaStreamBuffer,
  isAllowedByMode,
  processIncomingStatusMessage
} = require('../services/vaultService');

const SENT_MSG_MAX_ENTRIES = 50;
const SENT_MSG_TTL_MS = 20 * 60 * 1000;

// Cache pesan keluar ringan di RAM untuk Signal retry receipt E2EE (maks 40 entri FIFO, TTL 15 menit)
function pruneSentMessageStore(session, now = Date.now(), maxEntries = SENT_MSG_MAX_ENTRIES) {
  const store = session?.sentMessageStore;
  if (!store || store.size === 0) return;

  for (const [id, entry] of store.entries()) {
    if (!entry || !entry.message || now - (entry.storedAt || 0) > SENT_MSG_TTL_MS) {
      store.delete(id);
    }
  }

  while (store.size > maxEntries) {
    const oldestKey = store.keys().next().value;
    if (oldestKey === undefined) break;
    store.delete(oldestKey);
  }
}

function rememberSentMessage(session, messageId, protoMessage) {
  if (!session || !messageId || !protoMessage || typeof protoMessage !== 'object') return false;
  if (!session.sentMessageStore) {
    session.sentMessageStore = new Map();
  }

  const normalized = proto?.Message?.fromObject ? proto.Message.fromObject(protoMessage) : protoMessage;
  if (session.sentMessageStore.has(messageId)) {
    session.sentMessageStore.delete(messageId);
  }
  pruneSentMessageStore(session, Date.now(), SENT_MSG_MAX_ENTRIES - 1);
  session.sentMessageStore.set(messageId, {
    message: normalized,
    storedAt: Date.now()
  });
  return true;
}

function getSentMessage(session, messageId) {
  if (!session?.sentMessageStore || !messageId) return undefined;
  const entry = session.sentMessageStore.get(messageId);
  if (!entry) return undefined;
  if (Date.now() - (entry.storedAt || 0) > SENT_MSG_TTL_MS) {
    session.sentMessageStore.delete(messageId);
    return undefined;
  }
  return entry.message;
}

function watchE2eeMessageId(session, messageId) {
  if (!session || !messageId) return;
  if (!session.watchedE2eeIds) session.watchedE2eeIds = new Map();
  const idStr = String(messageId);
  session.watchedE2eeIds.set(idStr, Date.now());
  session.lastSentMessageId = idStr;
  session.lastSentAt = Date.now();
  while (session.watchedE2eeIds.size > 60) {
    const oldest = session.watchedE2eeIds.keys().next().value;
    if (oldest === undefined) break;
    session.watchedE2eeIds.delete(oldest);
  }
}

const RING_BUFFER_MAX = 25;

function pushRingItem(arr, item) {
  arr.push(item);
  while (arr.length > RING_BUFFER_MAX) {
    arr.shift();
  }
}

function pushCalibrationLog(io, sessionId, session, entry) {
  if (!entry || typeof entry !== 'object') return;
  const item = { at: Date.now(), ...entry };
  if (session) {
    if (!Array.isArray(session.calibrationLogs)) session.calibrationLogs = [];
    pushRingItem(session.calibrationLogs, item);
  }
  emitToDevice(io, sessionId, 'sound-sticker-calibration-log', item);
}

function pushDeliveryTrace(io, sessionId, session, entry) {
  if (!entry || typeof entry !== 'object') return;
  const item = { at: Date.now(), ...entry };
  if (session) {
    if (!Array.isArray(session.deliveryTraces)) session.deliveryTraces = [];
    pushRingItem(session.deliveryTraces, item);
  }
  emitToDevice(io, sessionId, 'sound-sticker-delivery-trace', item);
}

let calibrationUpsertProcessor = null;
let klonCommandProcessor = null;
let stickerDumpProcessor = null;

function registerCalibrationUpsertProcessor(fn) {
  calibrationUpsertProcessor = typeof fn === 'function' ? fn : null;
}

function registerKlonCommandProcessor(fn) {
  klonCommandProcessor = typeof fn === 'function' ? fn : null;
}

function registerStickerDumpProcessor(fn) {
  stickerDumpProcessor = typeof fn === 'function' ? fn : null;
}

function getOwnerDigitsSet(sock) {
  const ownPnDigits = String(
    sock?.user?.id || sock?.authState?.creds?.me?.id || ''
  )
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '');
  const ownLidDigits = String(
    sock?.user?.lid || sock?.authState?.creds?.me?.lid || ''
  )
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '');
  return { ownPnDigits, ownLidDigits };
}

function jidMatchesOwner(jid, sock) {
  if (!jid) return false;
  const num = String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
  if (!num) return false;
  const { ownPnDigits, ownLidDigits } = getOwnerDigitsSet(sock);
  return Boolean((ownPnDigits && num === ownPnDigits) || (ownLidDigits && num === ownLidDigits));
}

function isOwnerSelfMessage(msg, sock) {
  if (!msg?.key) return false;
  if (msg.key.fromMe === true) return true;
  return Boolean(
    jidMatchesOwner(msg.key.remoteJid, sock) ||
      jidMatchesOwner(msg.key.remoteJidAlt, sock) ||
      jidMatchesOwner(msg.key.participant, sock) ||
      jidMatchesOwner(msg.key.participantAlt, sock)
  );
}

function cacheRecentOwnerSticker(session, msg, type) {
  try {
    if (!session || !msg?.key?.id || !msg?.message) return;
    if (!isOwnerSelfMessage(msg, session.sock)) return;
    if (getSentMessage(session, msg.key.id)) return;

    const { innerMessage, wrapperChain } = unwrapMessageContent(msg.message);
    if (!innerMessage || typeof innerMessage !== 'object') return;
    const innerKeys = Object.keys(innerMessage);
    const hasStickerOrMedia = Boolean(
      innerMessage.stickerMessage ||
        innerMessage.lottieStickerMessage ||
        innerMessage.ptvMessage ||
        innerKeys.some((k) => k.toLowerCase().includes('sticker'))
    );
    if (!hasStickerOrMedia) return;

    const topLevelKeys = Object.keys(msg.message);
    let rawWireBytes = null;
    const snaps = getRecentRawWireBytesSnapshots(4000);
    const matchedSnap = [...snaps]
      .reverse()
      .find((s) => s && Array.isArray(s.decodedKeys) && topLevelKeys.some((tk) => tk !== 'messageContextInfo' && s.decodedKeys.includes(tk)));
    if (matchedSnap?.rawBytes && matchedSnap.rawBytes.length <= 32768) {
      rawWireBytes = Uint8Array.from(matchedSnap.rawBytes);
    } else if (baileysProtoAlias?.Message?.encode) {
      const encoded = baileysProtoAlias.Message.encode(msg.message).finish();
      if (encoded && encoded.length <= 32768) {
        rawWireBytes = Uint8Array.from(encoded);
      }
    }

    const mediaNode =
      innerMessage.stickerMessage ||
      innerMessage.lottieStickerMessage?.message?.stickerMessage ||
      innerMessage.ptvMessage ||
      {};
    if (!(session.recentOwnerStickers instanceof Map)) {
      session.recentOwnerStickers = new Map();
    }
    if (session.recentOwnerStickers.has(msg.key.id)) {
      session.recentOwnerStickers.delete(msg.key.id);
    }
    session.recentOwnerStickers.set(msg.key.id, {
      id: msg.key.id,
      at: Date.now(),
      upsertType: type || 'notify',
      fromMe: Boolean(msg.key.fromMe),
      remoteJid: msg.key.remoteJid || '',
      wrapperChain,
      topLevelKeys,
      innerKeys,
      stickerMeta: {
        mimetype: mediaNode.mimetype || null,
        isAnimated: Boolean(mediaNode.isAnimated),
        isLottie: Boolean(mediaNode.isLottie),
        width: mediaNode.width || null,
        height: mediaNode.height || null,
        fileLength: mediaNode.fileLength ? Number(mediaNode.fileLength) : null
      },
      rawWireBytes
    });
    while (session.recentOwnerStickers.size > 5) {
      const oldestKey = session.recentOwnerStickers.keys().next().value;
      if (oldestKey === undefined) break;
      session.recentOwnerStickers.delete(oldestKey);
    }
  } catch (_) {}
}

/**
 * Pasang sniffer minimal (hanya saat mode kalibrasi eksplisit aktif; nol spam log & nol sniffer pasif).
 */
function attachSoundStickerSniffer(io, session, sock) {
  if (!session || !sock) return;
  const sessionId = session.sessionId;
  if (!sock._kuroUpsertSnifferBound && typeof sock?.ev?.on === 'function') {
    sock._kuroUpsertSnifferBound = true;
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      const currentSession = sessions.get(sessionId) || session;
      if (!currentSession || !currentSession.calibratingSoundSticker) return;
      if (typeof calibrationUpsertProcessor === 'function') {
        try {
          await calibrationUpsertProcessor(io, sessionId, currentSession, { messages, type });
        } catch (_) {}
      } else if (typeof currentSession._onCalibrationUpsert === 'function') {
        try {
          await currentSession._onCalibrationUpsert({ messages, type });
        } catch (_) {}
      }
    });
  }
}

function getEncodedProtoSize(protoMessage) {
  try {
    if (!protoMessage || !proto?.Message?.encode) return 0;
    return proto.Message.encode(protoMessage).finish().length;
  } catch {
    return 0;
  }
}

let calibrationObserverDisarm = null;

function hasActiveCalibrationSession() {
  const now = Date.now();
  for (const s of sessions.values()) {
    if (s?.calibratingSoundSticker) {
      if (!s.calibrationArmedUntil || now <= s.calibrationArmedUntil) {
        return true;
      }
      s.calibratingSoundSticker = false;
    }
  }
  return false;
}

/**
 * Mengaktifkan observer read-only `proto.Message.decode` hanya saat ada sesi kalibrasi aktif.
 */
function syncCalibrationProtoObserver() {
  if (hasActiveCalibrationSession()) {
    if (!calibrationObserverDisarm && proto?.Message) {
      calibrationObserverDisarm = armSafeProtoDecodeObserver(
        (frame) => {
          for (const s of sessions.values()) {
            if (!s?.calibratingSoundSticker) continue;
            if (!Array.isArray(s.lastRawWirePackets)) s.lastRawWirePackets = [];
            s.lastRawWirePackets.push({
              at: frame.capturedAt,
              capturedAt: frame.capturedAt,
              byteLength: frame.byteLength,
              wireTree: frame.wireTree,
              decodedKeys: frame.decodedKeys
            });
            while (s.lastRawWirePackets.length > 8) {
              s.lastRawWirePackets.shift();
            }
          }
        },
        {
          protoMessage: proto.Message,
          isActive: hasActiveCalibrationSession
        }
      );
    }
  } else if (calibrationObserverDisarm) {
    calibrationObserverDisarm();
    calibrationObserverDisarm = null;
  }
}

/**
 * Soft-restart socket Baileys sambil menjaga auth_sessions/<id>/creds.json agar kunci RAM benar-benar bersih.
 */
async function softRestartBaileysPreserveAuth(io, sessionId, waitConnectedMs = 14000) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error('Sesi WhatsApp tidak ditemukan.');

  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }
  if (session.pairingTimer) {
    clearTimeout(session.pairingTimer);
    session.pairingTimer = null;
  }
  try {
    session.msgRetryCounterCache?.flushAll?.();
    session.mediaCache?.flushAll?.();
  } catch (_) {}

  const waiterPromise = new Promise((resolve) => {
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      resolve(ok);
    };
    const t = setTimeout(() => done(false), waitConnectedMs);
    if (!Array.isArray(session._openWaiters)) session._openWaiters = [];
    session._openWaiters.push(done);
  });

  await startBaileys(
    io,
    sessionId,
    session.targetNumber || null,
    false,
    session.authMethod || 'pairing',
    session.pairingPhone || '',
    false,
    session.monitorMode || 'all',
    session.swMode || 'auto',
    session.tokenHash || ''
  );

  const connected = await waiterPromise;
  return { connected, session: sessions.get(sessionId) || session };
}

async function startBaileys(
  io,
  sessionId,
  targetNumber = null,
  cleanAuth = false,
  authMethod = 'pairing',
  pairingPhone = '',
  forceNew = false,
  monitorMode = 'all',
  swMode = 'auto',
  tokenHash = ''
) {
  if (!isValidSessionId(sessionId)) {
    throw new Error('ID sesi tidak valid.');
  }

  let session = sessions.get(sessionId);
  const now = Date.now();
  const isStuckInitializing = session?.isInitializing && now - (session.initStartTime || 0) > 8000;

  if (session?.isInitializing && !isStuckInitializing && !forceNew) {
    console.log(`[Session ${sessionId}] Inisialisasi sedang berjalan, abaikan permintaan socket ganda.`);
    return session;
  }

  if (!session && sessions.size >= MAX_ACTIVE_SESSIONS) {
    let oldestIdleId = null;
    let oldestIdleTime = Infinity;
    for (const [id, s] of sessions.entries()) {
      if (s.lastActive < oldestIdleTime) {
        oldestIdleTime = s.lastActive;
        oldestIdleId = id;
      }
    }
    if (oldestIdleId) {
      const oldSess = sessions.get(oldestIdleId);
      try {
        oldSess?.sock?.ev?.removeAllListeners();
        oldSess?.sock?.end();
      } catch (_) {}
      try {
        if (!isDirRegistered(getSessionDir(oldestIdleId))) {
          removeSessionDir(oldestIdleId);
        }
      } catch (_) {}
      sessions.delete(oldestIdleId);
      console.log(`[WA-GUARD] Sesi terlama ${oldestIdleId} dikeluarkan dari RAM untuk menjaga batas ${MAX_ACTIVE_SESSIONS} sesi.`);
    }
  }

  if (!session) {
    session = {
      sessionId,
      tokenHash: tokenHash || '',
      sock: null,
      status: 'connecting',
      authMethod: authMethod || 'pairing',
      pairingPhone: pairingPhone ? normalizePhone(pairingPhone) : '',
      pairingCode: null,
      pairingCodeRequested: false,
      monitorMode: monitorMode || (targetNumber ? 'single' : 'all'),
      swMode: swMode || 'auto',
      targetNumber: targetNumber ? normalizePhone(targetNumber) : null,
      targetJids: new Set(),
      confirmedTargetLids: new Set(),
      lidMap: new Map(),
      savedContacts: new Map(),
      contactNames: new Map(),
      unmappedLidQueue: new Map(),
      pendingUnavailableIds: new Set(),
      msgCache: new Map(),
      sentMessageStore: new Map(),
      msgRetryCounterCache: new NodeCache({ stdTTL: 600, useClones: false }),
      calibratingSoundSticker: false,
      calibrationArmedUntil: 0,
      lastRawWirePackets: [],
      calibrationLogs: [],
      deliveryTraces: [],
      lastSentMessageId: '',
      lastSentAt: 0,
      statusPointers: new Map(),
      pendingMedia: [],
      accountJid: '',
      accountLid: '',
      phone: '',
      authKeys: null,
      authSyncTimer: null,
      contactsSyncTimer: null,
      reconnectTimer: null,
      pairingTimer: null,
      reconnectAttempt: 0,
      isInitializing: true,
      initStartTime: now,
      lastActive: now,
      qrCode: null,
      qrDataUrl: null
    };
    sessions.set(sessionId, session);
  } else {
    session.isInitializing = true;
    session.initStartTime = now;
    if (tokenHash) session.tokenHash = tokenHash;
    session.authMethod = authMethod || session.authMethod || 'pairing';
    if (monitorMode) session.monitorMode = monitorMode;
    if (swMode) session.swMode = swMode;
    if (pairingPhone) session.pairingPhone = normalizePhone(pairingPhone);
    if (cleanAuth || forceNew) {
      session.pairingCode = null;
      session.pairingCodeRequested = false;
    }
    if (session.pairingTimer) {
      clearTimeout(session.pairingTimer);
      session.pairingTimer = null;
    }
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }
    if (!session.savedContacts) session.savedContacts = new Map();
    if (!session.contactNames) session.contactNames = new Map();
    if (!session.confirmedTargetLids) session.confirmedTargetLids = new Set();
    if (!session.unmappedLidQueue) session.unmappedLidQueue = new Map();
    if (!session.pendingUnavailableIds) session.pendingUnavailableIds = new Set();
    if (!session.msgCache) session.msgCache = new Map();
    if (!session.sentMessageStore) session.sentMessageStore = new Map();
    if (!Array.isArray(session.calibrationLogs)) session.calibrationLogs = [];
    if (!Array.isArray(session.deliveryTraces)) session.deliveryTraces = [];
    if (!session.statusPointers) session.statusPointers = new Map();
    if (!session.msgRetryCounterCache) {
      session.msgRetryCounterCache = new NodeCache({ stdTTL: 600, useClones: false });
    }
    session.status = authMethod === 'qr' ? 'generating_qr' : 'connecting';
    session.lastActive = now;
    if (targetNumber) {
      session.targetNumber = normalizePhone(targetNumber);
    }
  }

  try {
    const hadActiveSocket = Boolean(session.sock);
    if (session.sock) {
      try {
        session.sock.ev?.removeAllListeners();
      } catch (_) {}
      try {
        session.sock.end?.(undefined);
      } catch (_) {}
      session.sock = null;
    }

    if (cleanAuth) {
      session.restoredFromColdSnapshot = false;
      session.accountJid = '';
      session.accountLid = '';
      session.phone = '';
      session.savedContacts?.clear();
      session.contactNames?.clear();
      session.lidMap?.clear();
      session.confirmedTargetLids?.clear();
      session.unmappedLidQueue?.clear();
      session.pendingUnavailableIds?.clear();
      session.msgCache?.clear();
      session.sentMessageStore?.clear();
      session.calibratingSoundSticker = false;
      session.calibrationArmedUntil = 0;
      if (session._calibrationExpireTimer) {
        clearTimeout(session._calibrationExpireTimer);
        session._calibrationExpireTimer = null;
      }
      session.lastRawWirePackets = [];
      session.calibrationLogs = [];
      session.deliveryTraces = [];
      session.lastSentMessageId = '';
      session.lastSentAt = 0;
      syncCalibrationProtoObserver();
      session.statusPointers?.clear();
      session.pendingMedia = [];
      removeSessionDir(sessionId);
    }

    if (hadActiveSocket) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const sessionDir = getSessionDir(sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    if (session.tokenHash) {
      writeOwnerHash(sessionDir, session.tokenHash);
    }
    if (consumeColdRestoredFlag(sessionDir)) {
      session.restoredFromColdSnapshot = true;
    }

    const version = await getWaVersion();
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    // Cadangkan snapshot otomatis setelah key app-state-sync / session baru ditulis ke disk
    const origKeysSet = state.keys.set.bind(state.keys);
    state.keys.set = async (data) => {
      const res = await origKeysSet(data);
      if (state.creds?.registered && data && (data['app-state-sync-key'] || data.session)) {
        scheduleAuthSnapshotSync(io, sessionId, session, 300);
      }
      return res;
    };

    session.authKeys = state.keys;

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pinoSilent)
      },
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      shouldIgnoreJid: () => false,
      shouldSyncHistoryMessage: (historyMsg) => {
        const t = historyMsg?.syncType;
        const HT = proto?.Message?.HistorySyncNotification?.HistorySyncType || {};
        return t === 0 || t === 1 || t === 3 || t === HT.INITIAL_BOOTSTRAP || t === HT.INITIAL_STATUS_V3 || t === HT.RECENT;
      },
      markOnlineOnConnect: false,
      connectTimeoutMs: 120000,
      keepAliveIntervalMs: 25000,
      defaultQueryTimeoutMs: 60000,
      msgRetryCounterCache: session.msgRetryCounterCache,
      retryRequestDelayMs: 250,
      maxMsgRetryCount: 5,
      logger: pinoSilent,
      printQRInTerminal: false,
      getMessage: async (key) => {
        const id = key?.id;
        if (!id) return undefined;
        const sent = getSentMessage(session, id);
        if (sent) return sent;
        const cached = session.msgCache?.get(id);
        if (cached) return cached;
        return undefined;
      }
    });

    // Pasang sniffer stiker audio pada socket baru (termasuk setelah cold-boot / 515 / reconnect)
    attachSoundStickerSniffer(io, session, sock);

    // Monitor read-only stanza ACK & receipt (TANPA memodifikasi sock.signalRepository)
    if (typeof sock?.ws?.on === 'function') {
      sock.ws.on('CB:ack,class:message', (node) => {
        try {
          const attrs = node?.attrs || {};
          const msgId = String(attrs.id || '');
          if (!msgId) return;
          const isRecentOwn = Boolean(msgId === session.lastSentMessageId && Date.now() - (session.lastSentAt || 0) < 30000);
          const isWatched = Boolean(session.watchedE2eeIds?.has(msgId) || getSentMessage(session, msgId) || isRecentOwn);
          if (!isWatched) return;

          const errCode = attrs.error ? String(attrs.error) : '';
          pushDeliveryTrace(io, sessionId, session, {
            messageId: msgId,
            phase: errCode ? 'decrypt_error' : 'server_ack',
            event: 'CB:ack',
            isError: Boolean(errCode),
            detail: errCode ? `Server WA ACK error=${errCode}` : `Server WA ACK diterima (${attrs.class || 'message'})`
          });
        } catch (_) {}
      });

      sock.ws.on('CB:receipt', (node) => {
        try {
          const attrs = node?.attrs || {};
          const msgId = String(attrs.id || '');
          if (!msgId) return;

          const isRecentOwn = Boolean(msgId === session.lastSentMessageId && Date.now() - (session.lastSentAt || 0) < 30000);
          const isWatched = Boolean(session.watchedE2eeIds?.has(msgId) || getSentMessage(session, msgId) || isRecentOwn);
          const rType = String(attrs.type || 'delivery');
          const children = Array.isArray(node?.content) ? node.content : [];
          const retryNode = children.find((c) => c?.tag === 'retry');
          const retryCount = Number(retryNode?.attrs?.count || 1);

          if (!isWatched && rType !== 'retry') return;

          const cachedProto = getSentMessage(session, msgId);
          if (rType === 'retry') {
            const fromStr = String(attrs.participant || attrs.from || '');
            const detail = `HP minta retry #${retryCount} (from=${fromStr.split('@')[0] || '-'}, cache=${cachedProto ? 'ADA' : 'KOSONG'})`;
            console.warn(`[E2EE-RETRY ${sessionId}] id=${msgId} ${detail} recipient=${attrs.recipient || '-'}`);
            pushDeliveryTrace(io, sessionId, session, {
              messageId: msgId,
              phase: 'retry_received',
              event: 'retry_receipt',
              retryCount,
              hasCachedProto: Boolean(cachedProto),
              isError: !cachedProto,
              detail
            });
          } else if (isWatched) {
            const phase =
              rType === 'read' || rType === 'played'
                ? 'read'
                : rType === 'error'
                  ? 'decrypt_error'
                  : 'delivery_ack';
            const eventLabel = rType === 'read' ? 'READ' : rType === 'played' ? 'PLAYED' : rType.toUpperCase();
            pushDeliveryTrace(io, sessionId, session, {
              messageId: msgId,
              phase,
              event: rType,
              isError: rType === 'error',
              detail: `CB:receipt ${eventLabel} dari ${String(attrs.from || '').split('@')[0]}`
            });
          }
        } catch (_) {}
      });
    }

    session.sock = sock;

    sock.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        if (session.tokenHash) {
          writeOwnerHash(sessionDir, session.tokenHash);
        }
        if (sock.authState?.creds?.registered) {
          scheduleAuthSnapshotSync(io, sessionId, session, 300);
        }
      } catch (err) {
        console.warn(`[Session ${sessionId}] Error creds.update:`, err.message);
      }
    });

    sock.ev.on('contacts.upsert', (contacts) => {
      if (!Array.isArray(contacts)) return;
      for (const c of contacts) upsertSavedContact(io, session, c);
    });

    sock.ev.on('contacts.update', (updates) => {
      if (!Array.isArray(updates)) return;
      for (const u of updates) upsertSavedContact(io, session, u);
    });

    sock.ev.on('messaging-history.set', async (payload) => {
      if (Array.isArray(payload?.contacts)) {
        for (const c of payload.contacts) upsertSavedContact(io, session, c);
      }
      if (Array.isArray(payload?.messages)) {
        const currentSession = sessions.get(sessionId);
        if (currentSession) {
          for (const msg of payload.messages) {
            if (!msg || !msg.key) continue;
            if (msg.key.remoteJid === 'status@broadcast' && !msg.key.fromMe) {
              await processIncomingStatusMessage(io, msg, currentSession, 'history');
            }
          }
        }
      }
    });

    sock.ev.on('messages.update', async (updates) => {
      if (!Array.isArray(updates)) return;
      const currentSession = sessions.get(sessionId);
      if (!currentSession) return;

      for (const upd of updates) {
        const updId = String(upd.key?.id || '');
        const isWatchedUpdate = Boolean(
          updId &&
            (currentSession.watchedE2eeIds?.has(updId) ||
              (upd.key?.fromMe && updId === currentSession.lastSentMessageId))
        );
        if (isWatchedUpdate && upd.update?.status !== undefined) {
          const st = Number(upd.update.status);
          const statusNames = { 0: 'ERROR_DECRYPT', 1: 'PENDING', 2: 'SERVER_ACK', 3: 'DELIVERY_ACK', 4: 'READ', 5: 'PLAYED' };
          const phaseNames = { 0: 'decrypt_error', 1: 'pending', 2: 'server_ack', 3: 'delivery_ack', 4: 'read', 5: 'read' };
          pushDeliveryTrace(io, sessionId, currentSession, {
            messageId: updId,
            phase: phaseNames[st] || 'update',
            event: 'messages.update',
            isError: st === 0,
            detail: `Status WA: ${statusNames[st] || st}`
          });
        }
        if (upd.key?.remoteJid === 'status@broadcast') {
          if (upd.update?.messageStubType === 1 || upd.update?.messageStubType === 0) {
            const targetKeyId = String(upd.key.id || '');
            if (targetKeyId) {
              const deletedAt = Date.now();
              if (currentSession.statusPointers?.has(targetKeyId)) {
                const ptr = currentSession.statusPointers.get(targetKeyId);
                ptr.isDeleted = true;
                ptr.deletedAt = deletedAt;
              }
              emitToDevice(io, sessionId, 'vault-item-revoked', { id: targetKeyId, deletedAt });
            }
          } else if (upd.update?.message) {
            await processIncomingStatusMessage(
              io,
              { key: upd.key, message: upd.update.message, messageTimestamp: upd.update.messageTimestamp },
              currentSession,
              'update'
            );
          }
        }
      }
    });

    sock.ev.on('chats.upsert', (chats) => {
      if (!Array.isArray(chats)) return;
      for (const chat of chats) {
        if (chat.id && chat.lid) {
          const phone = normalizePhone(chat.id);
          if (phone) {
            session.lidMap.set(chat.lid, phone);
            session.lidMap.set(phone, chat.lid);
          }
        }
        if (chat.name || chat.lid) {
          upsertSavedContact(io, session, chat);
        }
      }
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Tunggu event `qr` (tanda Noise handshake & pair-device IQ siap 100%) sebelum requestPairingCode, dan panggil HANYA 1x per sesi pairing
      if (
        qr &&
        !sock.authState.creds.registered &&
        session.authMethod === 'pairing' &&
        session.pairingPhone &&
        !session.pairingCodeRequested
      ) {
        session.pairingCodeRequested = true;
        if (session.pairingTimer) clearTimeout(session.pairingTimer);
        session.pairingTimer = setTimeout(async () => {
          session.pairingTimer = null;
          try {
            if (session.sock === sock && !sock.authState.creds.registered) {
              const rawCode = await sock.requestPairingCode(session.pairingPhone);
              const code = String(rawCode || '').trim();
              if (!code) throw new Error('Server WhatsApp mengembalikan kode pairing kosong.');
              session.pairingCode = code;
              session.status = 'pairing_ready';
              session.isInitializing = false;
              session.lastActive = Date.now();
              emitToDevice(io, sessionId, 'pairing-code', { code });
              emitToDevice(io, sessionId, 'session-status', { status: 'pairing_ready', code });
              console.log(`[WA-VAULT][PAIRING-CODE] Sesi ${sessionId} kode diterbitkan untuk ${session.pairingPhone}`);
            }
          } catch (err) {
            console.error(`[WA-VAULT][PAIRING-CODE-ERR] Sesi ${sessionId}:`, err.message);
            session.pairingCodeRequested = false;
            session.pairingCode = null;
            session.isInitializing = false;
            session.status = 'disconnected';
            emitToDevice(io, sessionId, 'session-error', {
              message: 'Gagal membuat kode pairing WhatsApp: ' + err.message
            });
            emitToDevice(io, sessionId, 'session-status', {
              status: 'disconnected',
              reason: 'pairing_request_failed'
            });
          }
        }, 250);
      }

      if (qr && session.authMethod !== 'pairing') {
        session.qrCode = qr;
        session.status = 'qr_ready';
        session.isInitializing = false;
        session.lastActive = Date.now();
        console.log('[WA-VAULT] QR Code diterbitkan untuk sesi:', sessionId);

        try {
          const qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 260, errorCorrectionLevel: 'M' });
          session.qrDataUrl = qrDataUrl;
          emitToDevice(io, sessionId, 'qr-code', { qr, qrDataUrl });
          emitToDevice(io, sessionId, 'qr', { qr, qrDataUrl });
          emitToDevice(io, sessionId, 'session-status', { status: 'qr_ready', qr, qrDataUrl });
        } catch (_) {
          emitToDevice(io, sessionId, 'qr-code', { qr });
          emitToDevice(io, sessionId, 'qr', { qr });
          emitToDevice(io, sessionId, 'session-status', { status: 'qr_ready', qr });
        }
      }

      if (connection === 'open') {
        session.isInitializing = false;
        session.status = 'connected';
        session.reconnectAttempt = 0;
        if (session.reconnectTimer) {
          clearTimeout(session.reconnectTimer);
          session.reconnectTimer = null;
        }
        session.qrCode = null;
        session.qrDataUrl = null;
        session.pairingCode = null;
        session.pairingCodeRequested = false;
        session.lastActive = Date.now();

        try {
          await sock.sendPresenceUpdate('unavailable');
        } catch (_) {}

        if (session.targetNumber) {
          await resolveTargetIdentifiers(session);
        }

        const phone = sock.user?.id ? sock.user.id.split('@')[0].split(':')[0] : '';
        const accountJid = phone ? `${phone}@s.whatsapp.net` : (sock.user?.id || '');
        const accountLid = sock.user?.lid ? jidNormalizedUser(sock.user.lid) : '';
        console.log(`[Session ${sessionId}] WA Connected:`, { id: sock.user?.id || null, lid: sock.user?.lid || null, selfJid: accountJid });
        if (session.accountJid && accountJid && session.accountJid !== accountJid) {
          session.savedContacts?.clear();
          session.contactNames?.clear();
          session.lidMap?.clear();
          session.statusPointers?.clear();
          session.pendingMedia = [];
          session.msgCache?.clear();
          session.sentMessageStore?.clear();
          session.calibrationLogs = [];
          session.deliveryTraces = [];
        }
        session.accountJid = accountJid;
        session.accountLid = accountLid;
        session.phone = phone;

        if (session.restoredFromColdSnapshot) {
          session.restoredFromColdSnapshot = false;
          try {
            const credsIds = extractOwnIdentifiersFromCreds(sock.authState?.creds);
            const ownPhone = phone || credsIds.ownPhone;
            const ownLidUser = (accountLid ? accountLid.split('@')[0].split(':')[0] : '') || credsIds.ownLidUser;
            pushDeliveryTrace(io, sessionId, session, {
              messageId: 'cold-boot',
              phase: 'cold_boot_e2ee_refresh',
              event: 'cold_snapshot_restore',
              isError: false,
              detail: `Sesi pulih dari snapshot — ratchet self-chat (${ownPhone || '-'}/${ownLidUser || '-'}) dipertahankan`
            });
            console.log(`[WA-COLD-RESTORE ${sessionId}] Sesi & ratchet Signal (${ownPhone || '-'}, ${ownLidUser || '-'}) dipulihkan utuh dari snapshot`);
          } catch (coldErr) {
            console.warn(`[WA-COLD-RESTORE ${sessionId}] Gagal mencatat restore sesi:`, coldErr.message);
          }
        }

        emitToDevice(io, sessionId, 'session-status', {
          status: 'connected',
          phone,
          accountJid,
          monitorMode: session.monitorMode,
          swMode: session.swMode,
          targetNumber: session.targetNumber || ''
        });
        emitToDevice(io, sessionId, 'status', { status: 'connected', phone, accountJid });

        // Sinkronkan snapshot auth SEGERA (0ms debounce) begitu sesi terhubung
        emitAuthSnapshotNow(io, sessionId, session);

        if (Array.isArray(session._openWaiters) && session._openWaiters.length > 0) {
          const waiters = session._openWaiters.splice(0, session._openWaiters.length);
          for (const done of waiters) {
            try { done(true); } catch (_) {}
          }
        }

        const initialContacts = buildContactsSyncPayload(session);
        if (Object.keys(initialContacts).length > 0) {
          emitToDevice(io, sessionId, 'contacts-map-sync', { contacts: initialContacts });
        }

        if (session.pendingMedia && session.pendingMedia.length > 0) {
          while (session.pendingMedia.length > 0) {
            const item = session.pendingMedia.shift();
            emitToDevice(io, sessionId, 'vault-item', item);
          }
        }
      }

      if (connection === 'close') {
        session.isInitializing = false;
        if (session.pairingTimer) {
          clearTimeout(session.pairingTimer);
          session.pairingTimer = null;
        }
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isRestartRequired = statusCode === 515 || statusCode === DisconnectReason.restartRequired;
        const wasRegistered = Boolean(sock.authState?.creds?.registered) || isDirRegistered(sessionDir);
        const isLoggedOut = (statusCode === DisconnectReason.loggedOut || statusCode === 401) && wasRegistered;

        if (isLoggedOut) {
          if (session.reconnectTimer) {
            clearTimeout(session.reconnectTimer);
            session.reconnectTimer = null;
          }
          if (session.authSyncTimer) {
            clearTimeout(session.authSyncTimer);
            session.authSyncTimer = null;
          }
          session.msgCache?.clear();
          session.sentMessageStore?.clear();
          if (session._calibrationExpireTimer) {
            clearTimeout(session._calibrationExpireTimer);
            session._calibrationExpireTimer = null;
          }
          removeSessionDir(sessionId);
          sessions.delete(sessionId);
          syncCalibrationProtoObserver();
          emitToDevice(io, sessionId, 'session-status', {
            status: 'disconnected',
            reason: 'unlinked_from_phone',
            message: 'Perangkat diputuskan dari menu Perangkat Tertaut di WhatsApp HP.'
          });
          emitToDevice(io, sessionId, 'logged_out', {
            reason: 'unlinked_from_phone',
            message: 'Perangkat diputuskan dari menu Perangkat Tertaut di WhatsApp HP.'
          });
          emitToDevice(io, sessionId, 'status', { status: 'disconnected', reason: 'unlinked_from_phone' });
        } else if (!wasRegistered && session.authMethod === 'pairing' && session.pairingCode && !isRestartRequired) {
          // Jangan pernah menimpa kode pairing aktif dengan kode baru diam-diam saat timeout/putus sementara
          session.pairingCode = null;
          session.pairingCodeRequested = false;
          session.status = 'disconnected';
          removeSessionDir(sessionId);
          emitToDevice(io, sessionId, 'session-status', {
            status: 'disconnected',
            reason: 'pairing_expired',
            message: 'Waktu tunggu kode pairing habis atau koneksi terputus. Klik "Minta Kode" untuk mendapatkan kode baru.'
          });
        } else {
          // Putus jaringan sementara atau 515 restartRequired -> DILARANG hapus folder auth!
          const backoffDelays = [2000, 5000, 10000];
          const delayMs = isRestartRequired
            ? 350
            : backoffDelays[Math.min(backoffDelays.length - 1, session.reconnectAttempt || 0)];
          session.reconnectAttempt = Math.min(3, (session.reconnectAttempt || 0) + 1);

          session.status = isRestartRequired ? 'connecting' : 'reconnecting';
          emitToDevice(io, sessionId, 'session-status', {
            status: session.status,
            statusCode,
            message: isRestartRequired ? 'Menyelesaikan penautan WhatsApp (515)...' : 'Menyambungkan ulang otomatis...'
          });
          emitToDevice(io, sessionId, 'status', { status: session.status });

          if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
          session.reconnectTimer = setTimeout(() => {
            session.reconnectTimer = null;
            if (sessions.has(sessionId)) {
              startBaileys(io, sessionId, session.targetNumber, false, session.authMethod, session.pairingPhone, false, session.monitorMode, session.swMode, session.tokenHash);
            }
          }, delayMs);
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      const currentSession = sessions.get(sessionId);
      if (!currentSession) return;

      if (type !== 'notify' && type !== 'append') return;

      for (const msg of messages) {
        if (!msg || !msg.key) continue;

        const remoteJid = String(msg.key?.remoteJid || '');

        if (remoteJid.endsWith('@g.us') || remoteJid.endsWith('@newsletter')) {
          continue;
        }

        learnLidPair(msg.key, currentSession);

        if (msg.key?.id && msg.message) {
          if (!currentSession.msgCache) currentSession.msgCache = new Map();
          if (currentSession.msgCache.size >= 60) {
            const firstKey = currentSession.msgCache.keys().next().value;
            currentSession.msgCache.delete(firstKey);
          }
          currentSession.msgCache.set(msg.key.id, msg.message);
        }

        currentSession.lastActive = Date.now();
        const senderInfo = resolveSenderInfo(io, msg, currentSession);
        const msgTimestamp = Number(msg.messageTimestamp) ? Number(msg.messageTimestamp) * 1000 : Date.now();

        if (remoteJid === 'status@broadcast' && msg.key?.fromMe === false) {
          await processIncomingStatusMessage(io, msg, currentSession, 'upsert');
          continue;
        }

        if (msg.message?.protocolMessage) {
          const pType = msg.message.protocolMessage.type;
          const targetKeyId = String(msg.message.protocolMessage.key?.id || '');

          if (pType === 0 && targetKeyId) {
            const deletedAt = Date.now();
            emitToDevice(io, sessionId, 'vault-item-revoked', { id: targetKeyId, deletedAt });
            emitToDevice(io, sessionId, 'vault-activity', {
              time: deletedAt,
              text: `Pesan dari ${senderInfo.senderName} telah ditarik/dihapus (Anti-Delete aktif)!`
            });
            continue;
          }

          if (pType === 14 && targetKeyId) {
            const editedMsg = msg.message.protocolMessage.editedMessage;
            const newText = String(editedMsg?.conversation || editedMsg?.extendedTextMessage?.text || '');
            const editedAt = Date.now();
            emitToDevice(io, sessionId, 'vault-item-edited', { id: targetKeyId, editedText: newText, editedAt });
            emitToDevice(io, sessionId, 'vault-activity', {
              time: editedAt,
              text: `Pesan dari ${senderInfo.senderName} diedit menjadi: "${newText.slice(0, 40)}..."`
            });
            continue;
          }
        }

        const allowed = await isAllowedByMode(senderInfo, msg, currentSession);
        if (!allowed) {
          continue;
        }

        // Abaikan pesan View Once yang telah dihentikan dukungannya
        const isViewOnceMessage = Boolean(
          msg.message?.viewOnceMessage ||
          msg.message?.viewOnceMessageV2 ||
          msg.message?.viewOnceMessageV2Extension ||
          msg.message?.imageMessage?.viewOnce ||
          msg.message?.videoMessage?.viewOnce ||
          msg.message?.audioMessage?.viewOnce
        );
        if (isViewOnceMessage || msg.key?.fromMe === true) {
          continue;
        }

        if (msg.key?.fromMe === false) {
          const textContent = String(msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
          if (textContent) {
            const payload = buildVaultPayload({
              id: msg.key?.id,
              category: 'chat',
              senderNumber: senderInfo.phone,
              senderLid: senderInfo.senderLid,
              senderName: senderInfo.senderName,
              mediaType: 'text',
              textContent,
              sentAt: msgTimestamp
            });

            emitVaultItem(io, sessionId, currentSession, payload);
            emitToDevice(io, sessionId, 'vault-activity', {
              time: Date.now(),
              text: `Pesan teks dari ${senderInfo.senderName} dibaca secara senyap (0 centang biru).`
            });
            continue;
          }

          if (msg.message?.imageMessage) {
            const mediaObj = msg.message.imageMessage;
            const buffer = await downloadMediaStreamBuffer(mediaObj, 'image', msg, sock);
            if (buffer && buffer.length > 0) {
              const mimeType = mediaObj.mimetype || 'image/jpeg';
              const base64Data = 'data:' + mimeType + ';base64,' + buffer.toString('base64');

              const payload = buildVaultPayload({
                id: msg.key?.id,
                category: 'chat',
                senderNumber: senderInfo.phone,
                senderLid: senderInfo.senderLid,
                senderName: senderInfo.senderName,
                mediaType: 'image',
                mimeType,
                caption: mediaObj.caption || '',
                sentAt: msgTimestamp,
                base64Data
              });

              emitVaultItem(io, sessionId, currentSession, payload);
              emitToDevice(io, sessionId, 'vault-activity', {
                time: Date.now(),
                text: `Foto masuk dari ${senderInfo.senderName} berhasil diamankan.`
              });
            }
            continue;
          }

          if (msg.message?.videoMessage) {
            const mediaObj = msg.message.videoMessage;
            const fileSize = Number(mediaObj.fileLength || 0);

            if (fileSize <= 15 * 1024 * 1024) {
              const buffer = await downloadMediaStreamBuffer(mediaObj, 'video', msg, sock);
              if (buffer && buffer.length > 0) {
                const mimeType = mediaObj.mimetype || 'video/mp4';
                const base64Data = 'data:' + mimeType + ';base64,' + buffer.toString('base64');

                const payload = buildVaultPayload({
                  id: msg.key?.id,
                  category: 'chat',
                  senderNumber: senderInfo.phone,
                  senderLid: senderInfo.senderLid,
                  senderName: senderInfo.senderName,
                  mediaType: 'video',
                  mimeType,
                  caption: mediaObj.caption || '',
                  fileSize,
                  sentAt: msgTimestamp,
                  base64Data
                });

                emitVaultItem(io, sessionId, currentSession, payload);
                emitToDevice(io, sessionId, 'vault-activity', {
                  time: Date.now(),
                  text: `Video masuk dari ${senderInfo.senderName} berhasil diamankan.`
                });
              }
            } else {
              const payload = buildVaultPayload({
                id: msg.key?.id,
                category: 'chat',
                senderNumber: senderInfo.phone,
                senderLid: senderInfo.senderLid,
                senderName: senderInfo.senderName,
                mediaType: 'video',
                caption: (mediaObj.caption || '') + ' (Video > 15MB)',
                fileSize,
                sentAt: msgTimestamp,
                base64Data: ''
              });
              emitVaultItem(io, sessionId, currentSession, payload);
            }
            continue;
          }

          if (msg.message?.audioMessage) {
            const mediaObj = msg.message.audioMessage;
            const isVoiceNote = Boolean(mediaObj.ptt);
            const buffer = await downloadMediaStreamBuffer(mediaObj, 'audio', msg, sock);
            if (buffer && buffer.length > 0) {
              const mimeType = mediaObj.mimetype || 'audio/ogg';
              const base64Data = 'data:' + mimeType + ';base64,' + buffer.toString('base64');

              const payload = buildVaultPayload({
                id: msg.key?.id,
                category: 'chat',
                senderNumber: senderInfo.phone,
                senderLid: senderInfo.senderLid,
                senderName: senderInfo.senderName,
                mediaType: 'audio',
                mimeType,
                isVoiceNote,
                sentAt: msgTimestamp,
                base64Data
              });

              emitVaultItem(io, sessionId, currentSession, payload);
              emitToDevice(io, sessionId, 'vault-activity', {
                time: Date.now(),
                text: `${isVoiceNote ? 'Voice Note' : 'Audio'} dari ${senderInfo.senderName} berhasil diamankan.`
              });
            }
            continue;
          }

          if (msg.message?.stickerMessage) {
            const mediaObj = msg.message.stickerMessage;
            const buffer = await downloadMediaStreamBuffer(mediaObj, 'sticker', msg, sock);
            if (buffer && buffer.length > 0) {
              const mimeType = 'image/webp';
              const base64Data = 'data:' + mimeType + ';base64,' + buffer.toString('base64');

              const payload = buildVaultPayload({
                id: msg.key?.id,
                category: 'chat',
                senderNumber: senderInfo.phone,
                senderLid: senderInfo.senderLid,
                senderName: senderInfo.senderName,
                mediaType: 'sticker',
                mimeType,
                sentAt: msgTimestamp,
                base64Data
              });

              emitVaultItem(io, sessionId, currentSession, payload);
            }
            continue;
          }

          if (msg.message?.documentMessage) {
            const mediaObj = msg.message.documentMessage;
            const fileName = mediaObj.fileName || 'Dokumen';
            const fileSize = Number(mediaObj.fileLength || 0);

            if (fileSize <= 10 * 1024 * 1024) {
              const buffer = await downloadMediaStreamBuffer(mediaObj, 'document', msg, sock);
              if (buffer && buffer.length > 0) {
                const mimeType = mediaObj.mimetype || 'application/octet-stream';
                const base64Data = 'data:' + mimeType + ';base64,' + buffer.toString('base64');

                const payload = buildVaultPayload({
                  id: msg.key?.id,
                  category: 'chat',
                  senderNumber: senderInfo.phone,
                  senderLid: senderInfo.senderLid,
                  senderName: senderInfo.senderName,
                  mediaType: 'document',
                  mimeType,
                  fileName,
                  fileSize,
                  caption: mediaObj.caption || '',
                  sentAt: msgTimestamp,
                  base64Data
                });

                emitVaultItem(io, sessionId, currentSession, payload);
                emitToDevice(io, sessionId, 'vault-activity', {
                  time: Date.now(),
                  text: `Dokumen "${fileName}" dari ${senderInfo.senderName} berhasil diamankan.`
                });
              }
            } else {
              const payload = buildVaultPayload({
                id: msg.key?.id,
                category: 'chat',
                senderNumber: senderInfo.phone,
                senderLid: senderInfo.senderLid,
                senderName: senderInfo.senderName,
                mediaType: 'document',
                fileName,
                fileSize,
                caption: 'Ukuran melebihi 10MB',
                sentAt: msgTimestamp,
                base64Data: ''
              });
              emitVaultItem(io, sessionId, currentSession, payload);
            }
            continue;
          }
        }
      }
    });

    return session;
  } finally {
    session.isInitializing = false;
  }
}

function triggerAuthSnapshotSync(io, sessionId, session) {
  if (!io || !session || !isValidSessionId(sessionId)) return;
  scheduleAuthSnapshotSync(io, sessionId, session, 300);
}

module.exports = {
  startBaileys,
  softRestartBaileysPreserveAuth,
  rememberSentMessage,
  getSentMessage,
  watchE2eeMessageId,
  pruneSentMessageStore,
  pushCalibrationLog,
  pushDeliveryTrace,
  getEncodedProtoSize,
  syncCalibrationProtoObserver,
  attachSoundStickerSniffer,
  registerCalibrationUpsertProcessor,
  registerKlonCommandProcessor,
  registerStickerDumpProcessor,
  getOwnerDigitsSet,
  jidMatchesOwner,
  isOwnerSelfMessage,
  triggerAuthSnapshotSync
};
