const path = require('path');
const fs = require('fs');
const {
  sessions,
  emitToDevice,
  joinExclusiveDeviceRoom,
  getSessionDir,
  writeOwnerHash,
  verifyDeviceOwner,
  removeSessionDir
} = require('../utils/deviceAuth');
const { unpackAuthSnapshot, scheduleAuthSnapshotSync } = require('../utils/authSnapshot');
const { globalMediaDownloadQueue, normalizePhone } = require('../utils/mediaHelpers');
const {
  resolveTargetIdentifiers,
  buildContactsSyncPayload,
  resolveDisplayName
} = require('../services/contactsService');
const { buildVaultPayload, downloadMediaStreamBuffer } = require('../services/vaultService');
const { startBaileys } = require('../whatsapp/baileysSession');

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    socket.on('resume-session', async (payload) => {
      try {
        const { sessionId, deviceToken, authSnapshot, targetNumber, monitorMode = 'all', swMode = 'auto', confirmedLids } = payload || {};
        const tokenHash = verifyDeviceOwner(socket, sessionId, deviceToken);
        if (!tokenHash) return;

        joinExclusiveDeviceRoom(socket, sessionId);

        let session = sessions.get(sessionId);

        if (session) {
          session.tokenHash = tokenHash;
          try {
            writeOwnerHash(getSessionDir(sessionId), tokenHash);
          } catch (_) {}

          if (monitorMode) session.monitorMode = monitorMode;
          if (swMode) session.swMode = swMode;
          if (targetNumber) {
            const clean = normalizePhone(targetNumber);
            session.targetNumber = clean;
          }

          if (Array.isArray(confirmedLids)) {
            if (!session.confirmedTargetLids) session.confirmedTargetLids = new Set();
            for (const cl of confirmedLids) {
              if (cl) {
                const cleanL = String(cl).trim();
                session.confirmedTargetLids.add(cleanL);
                if (session.targetJids) {
                  session.targetJids.add(cleanL);
                  session.targetJids.add(cleanL.split('@')[0].split(':')[0]);
                }
                if (session.targetNumber && session.lidMap) {
                  session.lidMap.set(cleanL, session.targetNumber);
                }
              }
            }
          }

          if (session.targetNumber) {
            await resolveTargetIdentifiers(session);
          }

          session.lastActive = Date.now();

          if (session.status === 'connected') {
            const phone = session.sock?.user?.id ? session.sock.user.id.split(':')[0] : '';
            socket.emit('session-status', {
              status: 'connected',
              phone,
              monitorMode: session.monitorMode,
              swMode: session.swMode,
              targetNumber: session.targetNumber || ''
            });

            if (session.targetNumber) {
              socket.emit('target-synced', { targetNumber: session.targetNumber });
            }

            const contacts = buildContactsSyncPayload(session);
            if (Object.keys(contacts).length > 0) {
              socket.emit('contacts-map-sync', { contacts });
            }
            scheduleAuthSnapshotSync(sessionId, session);

            if (session.pendingMedia && session.pendingMedia.length > 0) {
              while (session.pendingMedia.length > 0) {
                const item = session.pendingMedia.shift();
                socket.emit('vault-item', item);
                if (item.isViewOnce) {
                  socket.emit('view-once-media', item);
                }
              }
            }

            if (session.statusPointers && session.statusPointers.size > 0) {
              for (const ptr of session.statusPointers.values()) {
                ptr.pendingDelivery = false;
                const statusPayload = buildVaultPayload({
                  id: ptr.id,
                  category: 'status',
                  senderNumber: ptr.senderNumber,
                  senderLid: ptr.senderLid || '',
                  senderName: ptr.senderName,
                  mediaType: ptr.mediaType,
                  mimeType: ptr.mimeType,
                  caption: ptr.caption,
                  textContent: ptr.textContent,
                  bgColor: ptr.bgColor,
                  fileSize: ptr.fileSize,
                  durationSec: ptr.durationSec,
                  isVoiceNote: ptr.isVoiceNote,
                  sentAt: ptr.sentAt,
                  isDeleted: ptr.isDeleted,
                  deletedAt: ptr.deletedAt,
                  thumbnailBase64: ptr.thumbnailBase64,
                  needsOnDemandLoad: ptr.needsOnDemandLoad
                });
                socket.emit('vault-item', statusPayload);
              }
            }
          } else if (session.status === 'pairing_ready' && session.pairingCode) {
            socket.emit('pairing-code', { code: session.pairingCode });
            socket.emit('session-status', { status: 'pairing_ready', code: session.pairingCode });
          } else if (session.status === 'qr_ready' && session.qrCode) {
            socket.emit('session-status', { status: 'qr_ready', targetNumber: session.targetNumber || '' });
            socket.emit('qr-code', { qr: session.qrCode, qrDataUrl: session.qrDataUrl });
            socket.emit('qr', { qr: session.qrCode, qrDataUrl: session.qrDataUrl });
          } else {
            socket.emit('session-status', { status: session.status, targetNumber: session.targetNumber || '' });
          }
          return;
        }

        const sessionDir = getSessionDir(sessionId);
        const credsFile = path.join(sessionDir, 'creds.json');
        if (fs.existsSync(credsFile)) {
          writeOwnerHash(sessionDir, tokenHash);
          await startBaileys(sessionId, targetNumber ? normalizePhone(targetNumber) : null, false, 'pairing', '', false, monitorMode, swMode, tokenHash);
          return;
        }

        if (authSnapshot && unpackAuthSnapshot(sessionDir, authSnapshot, tokenHash)) {
          console.log(`[WA-SNAPSHOT] Auth sesi ${sessionId} dipulihkan instan dari IndexedDB perangkat!`);
          socket.emit('vault-activity', {
            time: Date.now(),
            text: 'Memulihkan sesi tertaut dari perangkat tanpa scan QR ulang...'
          });
          await startBaileys(sessionId, targetNumber ? normalizePhone(targetNumber) : null, false, 'pairing', '', false, monitorMode, swMode, tokenHash);
          return;
        }

        socket.emit('session-status', { status: 'disconnected' });
      } catch (err) {
        console.error('Error resume-session:', err.message);
        socket.emit('session-status', { status: 'disconnected' });
      }
    });

    socket.on('sync-active-statuses', (payload) => {
      try {
        const { sessionId, deviceToken } = payload || {};
        const tokenHash = verifyDeviceOwner(socket, sessionId, deviceToken);
        if (!tokenHash) return;

        const session = sessions.get(sessionId);
        if (!session || !session.statusPointers) return;

        const contacts = buildContactsSyncPayload(session);
        if (Object.keys(contacts).length > 0) {
          socket.emit('contacts-map-sync', { contacts });
        }

        let count = 0;
        for (const ptr of session.statusPointers.values()) {
          const latestName = resolveDisplayName(session, {
            senderJid: ptr.rawMsgKey?.participant || '',
            phone: ptr.senderNumber,
            lid: ptr.senderLid || '',
            pushName: ptr.senderName,
            isStatus: true
          });
          const statusPayload = buildVaultPayload({
            id: ptr.id,
            category: 'status',
            senderNumber: ptr.senderNumber,
            senderLid: ptr.senderLid || '',
            senderName: latestName || ptr.senderName,
            mediaType: ptr.mediaType,
            mimeType: ptr.mimeType,
            caption: ptr.caption,
            textContent: ptr.textContent,
            bgColor: ptr.bgColor,
            fileSize: ptr.fileSize,
            durationSec: ptr.durationSec,
            isVoiceNote: ptr.isVoiceNote,
            sentAt: ptr.sentAt,
            isDeleted: ptr.isDeleted,
            deletedAt: ptr.deletedAt,
            thumbnailBase64: ptr.thumbnailBase64,
            needsOnDemandLoad: ptr.needsOnDemandLoad
          });
          socket.emit('vault-item', statusPayload);
          count++;
        }

        socket.emit('vault-activity', {
          time: Date.now(),
          text: `Sinkronisasi selesai: ${count} Status WA aktif dimuat dari server.`
        });
      } catch (err) {
        console.error('Error sync-active-statuses:', err.message);
      }
    });

    socket.on('set-sw-mode', (payload) => {
      try {
        const { sessionId, deviceToken, swMode } = payload || {};
        const tokenHash = verifyDeviceOwner(socket, sessionId, deviceToken);
        if (!tokenHash || !swMode) return;

        const session = sessions.get(sessionId);
        if (session) {
          session.swMode = swMode === 'lite' ? 'lite' : 'auto';
          session.lastActive = Date.now();
        }
      } catch (err) {
        console.error('Error set-sw-mode:', err.message);
      }
    });

    socket.on('fetch-status-media', async (payload) => {
      try {
        const { sessionId, deviceToken, id } = payload || {};
        const tokenHash = verifyDeviceOwner(socket, sessionId, deviceToken);
        if (!tokenHash || !id) return;

        const session = sessions.get(sessionId);
        if (!session || !session.statusPointers) return;

        const pointer = session.statusPointers.get(String(id));
        if (!pointer || !pointer.mediaPointer) {
          return socket.emit('vault-activity', {
            time: Date.now(),
            text: 'Media status tidak ditemukan atau telah kedaluwarsa di CDN WhatsApp.'
          });
        }

        const maxLimits = { video: 15 * 1024 * 1024, image: 8 * 1024 * 1024, audio: 5 * 1024 * 1024 };
        const limit = maxLimits[pointer.mediaType] || 15 * 1024 * 1024;
        if (pointer.fileSize > limit) {
          return socket.emit('vault-activity', {
            time: Date.now(),
            text: `Ukuran file (${(pointer.fileSize / (1024 * 1024)).toFixed(1)} MB) melebihi batas aman render.`
          });
        }

        globalMediaDownloadQueue.push(async () => {
          emitToDevice(sessionId, 'vault-activity', {
            time: Date.now(),
            text: `Mendekripsi ${pointer.mediaType === 'video' ? 'Video' : pointer.mediaType === 'audio' ? 'Audio/VN' : 'Foto'} Status dari ${pointer.senderName}...`
          });

          const buffer = await downloadMediaStreamBuffer(
            pointer.mediaPointer,
            pointer.baileysMediaKind,
            { key: pointer.rawMsgKey },
            session.sock
          );

          if (buffer && buffer.length > 0) {
            const mimeType = pointer.mimeType || (pointer.mediaType === 'image' ? 'image/jpeg' : pointer.mediaType === 'audio' ? 'audio/ogg' : 'video/mp4');
            const base64Data = 'data:' + mimeType + ';base64,' + buffer.toString('base64');

            emitToDevice(sessionId, 'vault-item-media-ready', {
              id: String(id),
              base64Data,
              mimeType,
              mediaType: pointer.mediaType,
              fileSize: buffer.length
            });

            emitToDevice(sessionId, 'vault-activity', {
              time: Date.now(),
              text: `Status ${pointer.mediaType.toUpperCase()} dari ${pointer.senderName} siap ditonton (0 view)!`
            });
          } else {
            emitToDevice(sessionId, 'vault-activity', {
              time: Date.now(),
              text: 'Gagal mengunduh media status dari WhatsApp. Mungkin telah dihapus oleh pengirim.'
            });
          }
        }, sessionId);
      } catch (err) {
        console.error('Error fetch-status-media:', err.message);
      }
    });

    socket.on('set-monitor-mode', (payload) => {
      try {
        const { sessionId, deviceToken, monitorMode } = payload || {};
        const tokenHash = verifyDeviceOwner(socket, sessionId, deviceToken);
        if (!tokenHash || !monitorMode) return;

        const session = sessions.get(sessionId);
        if (session) {
          session.monitorMode = monitorMode;
          session.lastActive = Date.now();
        }
        emitToDevice(sessionId, 'monitor-mode-synced', { monitorMode });
      } catch (err) {
        console.error('Error set-monitor-mode:', err.message);
      }
    });

    socket.on('set-target', async (payload) => {
      try {
        const { sessionId, deviceToken, targetNumber, confirmedLids } = payload || {};
        const tokenHash = verifyDeviceOwner(socket, sessionId, deviceToken);
        if (!tokenHash) return;

        joinExclusiveDeviceRoom(socket, sessionId);

        const session = sessions.get(sessionId);
        const clean = targetNumber ? normalizePhone(targetNumber) : null;

        if (session) {
          session.targetNumber = clean;
          session.lastActive = Date.now();

          if (Array.isArray(confirmedLids)) {
            if (!session.confirmedTargetLids) session.confirmedTargetLids = new Set();
            for (const cl of confirmedLids) {
              if (cl) {
                const cleanL = String(cl).trim();
                session.confirmedTargetLids.add(cleanL);
                if (session.targetJids) session.targetJids.add(cleanL);
              }
            }
          }

          await resolveTargetIdentifiers(session);
        }

        emitToDevice(sessionId, 'target-synced', { targetNumber: clean });
        emitToDevice(sessionId, 'target-updated', { targetNumber: clean });
      } catch (err) {
        console.error('Error set-target:', err.message);
        socket.emit('session-error', { message: 'Gagal memperbarui target: ' + err.message });
      }
    });

    socket.on('confirm-target-lid', async (payload) => {
      try {
        const { sessionId, deviceToken, lid } = payload || {};
        const tokenHash = verifyDeviceOwner(socket, sessionId, deviceToken);
        if (!tokenHash || !lid) return;

        const session = sessions.get(sessionId);
        if (!session) return;

        const cleanLid = String(lid).trim();
        if (!session.confirmedTargetLids) session.confirmedTargetLids = new Set();
        session.confirmedTargetLids.add(cleanLid);

        if (!session.targetJids) session.targetJids = new Set();
        session.targetJids.add(cleanLid);
        const lidDigits = cleanLid.split('@')[0].split(':')[0];
        session.targetJids.add(lidDigits);

        if (session.targetNumber) {
          if (!session.lidMap) session.lidMap = new Map();
          session.lidMap.set(cleanLid, session.targetNumber);
          session.lidMap.set(lidDigits, session.targetNumber);
          session.lidMap.set(session.targetNumber, cleanLid);
        }

        emitToDevice(sessionId, 'vault-activity', {
          time: Date.now(),
          text: 'ID target berhasil diikat permanen!'
        });
      } catch (err) {
        console.error('Error confirm-target-lid:', err.message);
      }
    });

    socket.on('dismiss-unmapped-lid', (payload) => {
      try {
        const { sessionId, deviceToken, lid } = payload || {};
        const tokenHash = verifyDeviceOwner(socket, sessionId, deviceToken);
        if (!tokenHash || !lid) return;

        const session = sessions.get(sessionId);
        if (session?.unmappedLidQueue) {
          session.unmappedLidQueue.delete(String(lid).trim());
        }
        emitToDevice(sessionId, 'vault-activity', {
          time: Date.now(),
          text: 'Pesan dari ID tersembunyi diabaikan.'
        });
      } catch (err) {
        console.error('Error dismiss-unmapped-lid:', err.message);
      }
    });

    socket.on('start-session', async (payload) => {
      try {
        const {
          sessionId,
          deviceToken,
          targetNumber,
          monitorMode = 'all',
          swMode = 'auto',
          authMethod = 'pairing',
          pairingPhone = '',
          forceNew = false
        } = payload || {};

        const tokenHash = verifyDeviceOwner(socket, sessionId, deviceToken);
        if (!tokenHash) return;

        joinExclusiveDeviceRoom(socket, sessionId);

        let session = sessions.get(sessionId);

        if (session) {
          session.tokenHash = tokenHash;
          session.lastActive = Date.now();
          if (monitorMode) session.monitorMode = monitorMode;
          if (swMode) session.swMode = swMode;
          if (targetNumber) {
            session.targetNumber = normalizePhone(targetNumber);
            await resolveTargetIdentifiers(session);
          }

          if (session.status === 'connected') {
            socket.emit('session-status', {
              status: session.status,
              phone: session.sock?.user?.id ? session.sock.user.id.split(':')[0] : '',
              monitorMode: session.monitorMode,
              swMode: session.swMode,
              targetNumber: session.targetNumber || ''
            });

            if (session.targetNumber) {
              socket.emit('target-synced', { targetNumber: session.targetNumber });
            }
            return;
          }

          if (authMethod === 'qr' && session.status === 'qr_ready' && session.qrCode && !forceNew) {
            socket.emit('session-status', {
              status: 'qr_ready',
              phone: '',
              targetNumber: session.targetNumber || ''
            });
            socket.emit('qr-code', { qr: session.qrCode, qrDataUrl: session.qrDataUrl });
            socket.emit('qr', { qr: session.qrCode, qrDataUrl: session.qrDataUrl });
            return;
          }

          if (authMethod === 'pairing' && session.status === 'pairing_ready' && session.pairingCode && !forceNew) {
            socket.emit('pairing-code', { code: session.pairingCode });
            socket.emit('session-status', { status: 'pairing_ready', code: session.pairingCode });
            return;
          }
        }

        if (authMethod === 'qr') {
          socket.emit('session-status', { status: 'generating_qr', targetNumber: session?.targetNumber || targetNumber || '' });
        }

        session = await startBaileys(
          sessionId,
          targetNumber,
          Boolean(forceNew),
          authMethod,
          pairingPhone,
          Boolean(forceNew),
          monitorMode,
          swMode,
          tokenHash
        );

        socket.emit('session-status', { status: session.status, targetNumber: session.targetNumber, monitorMode: session.monitorMode, swMode: session.swMode });
        if (session.targetNumber) {
          socket.emit('target-synced', { targetNumber: session.targetNumber });
        }
      } catch (err) {
        console.error('Error start-session:', err.message);
        socket.emit('session-error', { message: 'Gagal menginisialisasi WhatsApp: ' + err.message });
      }
    });

    socket.on('logout-session', async (payload) => {
      try {
        const { sessionId, deviceToken } = payload || {};
        const tokenHash = verifyDeviceOwner(socket, sessionId, deviceToken);
        if (!tokenHash) return;

        const session = sessions.get(sessionId);
        if (session) {
          if (session.authSyncTimer) clearTimeout(session.authSyncTimer);
          if (session.contactsSyncTimer) clearTimeout(session.contactsSyncTimer);
          try {
            session.sock?.ev?.removeAllListeners();
          } catch (_) {}
          try {
            await session.sock?.logout();
          } catch (_) {
            try {
              session.sock?.end(undefined);
            } catch (_) {}
          }
          session.sock = null;
        }

        removeSessionDir(sessionId);
        sessions.delete(sessionId);

        emitToDevice(sessionId, 'session-status', { status: 'disconnected', reason: 'logged_out', message: 'Sesi WhatsApp berhasil diputuskan.' });
        emitToDevice(sessionId, 'status', { status: 'disconnected', reason: 'logged_out' });
      } catch (err) {
        console.error('Error logout-session:', err.message);
      }
    });
  });
}

module.exports = {
  registerSocketHandlers
};
