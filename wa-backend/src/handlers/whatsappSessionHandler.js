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
  proto
} = baileysModule;

const { MAX_ACTIVE_SESSIONS, pinoSilent, getWaVersion } = require('../config/constants');
const { isValidSessionId, normalizePhone } = require('../utils/common');
const { getSessionDir, writeOwnerHash, isDirRegistered, removeSessionDir } = require('../utils/authFiles');
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
      msgRetryCounterCache: new NodeCache({ stdTTL: 600, useClones: false }),
      statusPointers: new Map(),
      pendingMedia: [],
      accountJid: '',
      phone: '',
      authKeys: null,
      authSyncTimer: null,
      contactsSyncTimer: null,
      reconnectTimer: null,
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
    session.pairingCode = null;
    session.pairingCodeRequested = false;
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
      session.accountJid = '';
      session.phone = '';
      session.savedContacts?.clear();
      session.contactNames?.clear();
      session.lidMap?.clear();
      session.confirmedTargetLids?.clear();
      session.unmappedLidQueue?.clear();
      session.pendingUnavailableIds?.clear();
      session.msgCache?.clear();
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

    const version = await getWaVersion();
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    // Cadangkan snapshot otomatis setelah key app-state-sync / session baru ditulis ke disk
    const origKeysSet = state.keys.set.bind(state.keys);
    state.keys.set = async (data) => {
      const res = await origKeysSet(data);
      if (state.creds?.registered && data && (data['app-state-sync-key'] || data.session)) {
        scheduleAuthSnapshotSync(io, sessionId, session, 2000);
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
      shouldIgnoreJid: (jid) => {
        if (!jid) return true;
        return jid.endsWith('@g.us') || jid.endsWith('@newsletter');
      },
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
        const cached = session.msgCache?.get(key?.id);
        if (cached) return cached;
        return proto?.Message?.fromObject ? proto.Message.fromObject({}) : undefined;
      }
    });

    session.sock = sock;

    sock.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        if (session.tokenHash) {
          writeOwnerHash(sessionDir, session.tokenHash);
        }
        if (sock.authState?.creds?.registered) {
          scheduleAuthSnapshotSync(io, sessionId, session, 800);
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

      if (
        !sock.authState.creds.registered &&
        session.authMethod === 'pairing' &&
        session.pairingPhone &&
        !session.pairingCodeRequested
      ) {
        session.pairingCodeRequested = true;
        setTimeout(async () => {
          try {
            if (session.sock && !session.sock.authState.creds.registered) {
              const code = await session.sock.requestPairingCode(session.pairingPhone);
              session.pairingCode = code;
              session.status = 'pairing_ready';
              session.isInitializing = false;
              session.lastActive = Date.now();
              emitToDevice(io, sessionId, 'pairing-code', { code });
              emitToDevice(io, sessionId, 'session-status', { status: 'pairing_ready', code });
              console.log(`[WA-VAULT][PAIRING-CODE] Sesi ${sessionId} kode: ${code}`);
            }
          } catch (err) {
            console.error(`[WA-VAULT][PAIRING-CODE-ERR] Sesi ${sessionId}:`, err.message);
            session.pairingCodeRequested = false;
            session.isInitializing = false;
            emitToDevice(io, sessionId, 'session-error', { message: 'Gagal membuat kode pairing: ' + err.message });
          }
        }, 2000);
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

        const phone = sock.user?.id ? sock.user.id.split(':')[0] : '';
        const accountJid = phone ? `${phone}@s.whatsapp.net` : (sock.user?.id || '');
        if (session.accountJid && accountJid && session.accountJid !== accountJid) {
          session.savedContacts?.clear();
          session.contactNames?.clear();
          session.lidMap?.clear();
          session.statusPointers?.clear();
          session.pendingMedia = [];
          session.msgCache?.clear();
        }
        session.accountJid = accountJid;
        session.phone = phone;

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
          removeSessionDir(sessionId);
          sessions.delete(sessionId);
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
        } else {
          // Putus jaringan sementara (515, 503, 408, connectionClosed/Lost/timedOut) -> DILARANG hapus folder auth!
          const backoffDelays = [2000, 5000, 10000];
          const delayMs = isRestartRequired
            ? 350
            : backoffDelays[Math.min(backoffDelays.length - 1, session.reconnectAttempt || 0)];
          session.reconnectAttempt = Math.min(3, (session.reconnectAttempt || 0) + 1);

          session.status = isRestartRequired ? 'connecting' : 'reconnecting';
          emitToDevice(io, sessionId, 'session-status', {
            status: session.status,
            statusCode,
            message: 'Menyambungkan ulang otomatis...'
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
      if (type !== 'notify' && type !== 'append') return;

      const currentSession = sessions.get(sessionId);
      if (!currentSession) return;

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

module.exports = {
  startBaileys
};
