const { isValidSessionId, normalizePhone } = require('../utils/common');
const { getDeviceRoomSize, emitToDevice } = require('./deviceAuthService');

async function resolveJidToPhone(jid, session, msg = null) {
  if (!jid || typeof jid !== 'string') return null;
  const cleanJid = jid.trim();

  if (msg?.key) {
    const altCandidate = msg.key.senderPn || msg.key.participantPn || msg.key.remoteJidAlt || msg.key.participantAlt;
    if (altCandidate) {
      const rawAlt = typeof altCandidate === 'string' ? altCandidate.split('@')[0].split(':')[0] : String(altCandidate);
      const phoneAlt = normalizePhone(rawAlt);
      if (phoneAlt && phoneAlt.length >= 8) {
        if (session?.lidMap) {
          session.lidMap.set(cleanJid, phoneAlt);
          session.lidMap.set(phoneAlt, cleanJid);
        }
        return phoneAlt;
      }
    }
  }

  if (cleanJid.endsWith('@s.whatsapp.net') || (!cleanJid.includes('@lid') && cleanJid.includes('@'))) {
    const rawNumber = cleanJid.split('@')[0].split(':')[0];
    const phone = normalizePhone(rawNumber);
    if (phone) {
      if (session?.lidMap) session.lidMap.set(cleanJid, phone);
      return phone;
    }
  }

  if (cleanJid.endsWith('@lid') || cleanJid.includes('@lid')) {
    const lidId = cleanJid.split('@')[0].split(':')[0];

    if (session?.lidMap?.has(cleanJid)) {
      return session.lidMap.get(cleanJid);
    }
    if (session?.lidMap?.has(lidId)) {
      return session.lidMap.get(lidId);
    }

    try {
      if (session?.authKeys?.get) {
        const reverseData = await session.authKeys.get('lid-mapping', [lidId + '_reverse']);
        const reverseVal = reverseData?.[lidId + '_reverse'] || reverseData?.[lidId];
        if (reverseVal) {
          const rawPN = typeof reverseVal === 'string' ? reverseVal.split('@')[0].split(':')[0] : String(reverseVal);
          const p = normalizePhone(rawPN);
          if (p) {
            session.lidMap?.set(cleanJid, p);
            session.lidMap?.set(p, cleanJid);
            return p;
          }
        }
      }
    } catch (_) {}

    try {
      if (session?.sock?.signalRepository?.lidMapping?.getPNForLID) {
        const pn = await session.sock.signalRepository.lidMapping.getPNForLID(cleanJid);
        if (pn) {
          const rawPN = typeof pn === 'string' ? pn.split('@')[0].split(':')[0] : String(pn);
          const phone = normalizePhone(rawPN);
          if (phone) {
            session.lidMap?.set(cleanJid, phone);
            session.lidMap?.set(phone, cleanJid);
            return phone;
          }
        }
      }
    } catch (_) {}

    try {
      if (session?.sock?.authState?.creds?.me?.lid === cleanJid) {
        const myPhone = normalizePhone(session.sock.authState.creds.me.id?.split(':')[0]);
        if (myPhone) {
          session.lidMap?.set(cleanJid, myPhone);
          return myPhone;
        }
      }
    } catch (_) {}
  }

  const fallbackDigits = normalizePhone(cleanJid);
  if (fallbackDigits && fallbackDigits.length >= 8) {
    return fallbackDigits;
  }

  return null;
}

async function resolveTargetIdentifiers(session) {
  if (!session || !session.targetNumber) return;
  if (!session.targetJids) session.targetJids = new Set();
  if (!session.confirmedTargetLids) session.confirmedTargetLids = new Set();
  if (!session.lidMap) session.lidMap = new Map();

  session.targetJids.clear();
  session.targetJids.add(session.targetNumber);
  session.targetJids.add(`${session.targetNumber}@s.whatsapp.net`);

  for (const confirmedLid of session.confirmedTargetLids) {
    session.targetJids.add(confirmedLid);
    const lidDigits = confirmedLid.split('@')[0].split(':')[0];
    session.targetJids.add(lidDigits);
  }

  try {
    if (session.authKeys?.get) {
      const mapping = await session.authKeys.get('lid-mapping', [session.targetNumber]);
      const foundLid = mapping?.[session.targetNumber];
      if (foundLid) {
        const cleanFound = String(foundLid);
        session.targetJids.add(cleanFound);
        if (!cleanFound.includes('@')) {
          session.targetJids.add(`${cleanFound}@lid`);
        }
        session.lidMap.set(cleanFound, session.targetNumber);
        session.lidMap.set(session.targetNumber, cleanFound);
      }
    }
  } catch (_) {}

  if (session.sock) {
    try {
      const results = await session.sock.onWhatsApp(session.targetNumber);
      const res = Array.isArray(results) ? results[0] : results;
      if (res?.jid) {
        session.targetJids.add(res.jid);
        const p = normalizePhone(res.jid.split('@')[0]);
        if (p && session.lidMap) {
          session.lidMap.set(res.jid, p);
          session.lidMap.set(p, res.jid);
        }
      }
      if (res?.lid) {
        session.targetJids.add(res.lid);
        if (session.lidMap) {
          session.lidMap.set(res.lid, session.targetNumber);
          session.lidMap.set(session.targetNumber, res.lid);
        }
      }
    } catch (_) {}

    try {
      const lid = await session.sock.signalRepository?.lidMapping?.getLIDForPN?.(
        `${session.targetNumber}@s.whatsapp.net`
      );
      if (lid) {
        session.targetJids.add(lid);
        if (session.lidMap) {
          session.lidMap.set(lid, session.targetNumber);
          session.lidMap.set(session.targetNumber, lid);
        }
      }
    } catch (_) {}
  }
}

function learnLidPair(key, session) {
  if (!key || !session) return;
  const jids = [
    key.remoteJid,
    key.remoteJidAlt,
    key.senderPn,
    key.participant,
    key.participantAlt,
    key.participantPn
  ].filter((j) => typeof j === 'string' && j.includes('@'));

  let lidCandidate = null;
  let pnCandidate = null;

  for (const jid of jids) {
    if (jid.endsWith('@lid') || jid.includes('@lid')) {
      if (!lidCandidate) lidCandidate = jid;
    } else if (
      jid.endsWith('@s.whatsapp.net') ||
      (!jid.includes('@lid') && !jid.endsWith('@g.us') && jid !== 'status@broadcast')
    ) {
      if (!pnCandidate) pnCandidate = jid;
    }
  }

  if (lidCandidate && pnCandidate) {
    const rawNumber = pnCandidate.split('@')[0].split(':')[0];
    const phone = normalizePhone(rawNumber);
    if (phone && phone.length >= 8) {
      if (!session.lidMap) session.lidMap = new Map();
      const lidId = lidCandidate.split('@')[0].split(':')[0];
      session.lidMap.set(lidCandidate, phone);
      session.lidMap.set(lidId, phone);
      session.lidMap.set(phone, lidCandidate);

      if (session.targetNumber) {
        const matchesTarget =
          phone === session.targetNumber ||
          (phone.length >= 9 &&
            session.targetNumber.length >= 9 &&
            phone.slice(-9) === session.targetNumber.slice(-9));

        if (matchesTarget) {
          if (!session.targetJids) session.targetJids = new Set();
          session.targetJids.add(lidCandidate);
          session.targetJids.add(lidId);
          session.targetJids.add(`${lidId}@lid`);

          if (!session.confirmedTargetLids) session.confirmedTargetLids = new Set();
          session.confirmedTargetLids.add(lidCandidate);
          session.confirmedTargetLids.add(lidId);
        }
      }
    }
  }
}

function buildContactsSyncPayload(session) {
  const map = {};
  if (!session?.savedContacts) return map;
  for (const [k, entry] of session.savedContacts.entries()) {
    const preferred = entry?.savedName || entry?.verifiedName || '';
    if (k && preferred) {
      map[k] = preferred;
    }
  }
  return map;
}

function scheduleContactsSync(io, sessionId, session) {
  if (!io || !session || !isValidSessionId(sessionId)) return;
  if (session.contactsSyncTimer) clearTimeout(session.contactsSyncTimer);
  session.contactsSyncTimer = setTimeout(() => {
    try {
      if (getDeviceRoomSize(io, sessionId) > 0) {
        const contacts = buildContactsSyncPayload(session);
        if (Object.keys(contacts).length > 0) {
          emitToDevice(io, sessionId, 'contacts-map-sync', { contacts });
        }
      }
    } catch (_) {}
  }, 2000);
}

function upsertSavedContact(io, session, c) {
  if (!session || !c || typeof c !== 'object') return false;
  if (!session.savedContacts) session.savedContacts = new Map();
  if (!session.lidMap) session.lidMap = new Map();

  const jid = typeof (c.id || c.jid) === 'string' ? String(c.id || c.jid).trim() : '';
  const lid = typeof c.lid === 'string' ? c.lid.trim() : (jid.includes('@lid') ? jid : '');
  const lidDigits = lid ? lid.split('@')[0].split(':')[0] : '';

  let phone = '';
  const phoneSource = c.phoneNumber || (!jid.includes('@lid') ? jid : '');
  if (phoneSource) {
    const candidate = normalizePhone(String(phoneSource).split('@')[0].split(':')[0]);
    if (candidate && candidate.length >= 7) phone = candidate;
  }
  if (!phone && lid && session.lidMap.has(lid)) {
    phone = session.lidMap.get(lid);
  }
  if (!phone && lidDigits && session.lidMap.has(lidDigits)) {
    phone = session.lidMap.get(lidDigits);
  }

  if (lid && phone) {
    session.lidMap.set(lid, phone);
    if (lidDigits) session.lidMap.set(lidDigits, phone);
    session.lidMap.set(phone, lid);
  }
  if (jid && !jid.includes('@lid') && phone) {
    session.lidMap.set(jid, phone);
  }

  const incomingSaved = typeof c.name === 'string' ? c.name.trim() : '';
  const incomingVerified = typeof c.verifiedName === 'string' ? c.verifiedName.trim() : '';
  const incomingNotify = typeof c.notify === 'string'
    ? c.notify.trim()
    : (typeof c.pushName === 'string' ? c.pushName.trim() : '');

  const keys = Array.from(new Set([
    phone,
    phone ? `${phone}@s.whatsapp.net` : '',
    jid,
    lid,
    lidDigits
  ].filter(Boolean)));

  let savedChanged = false;
  for (const key of keys) {
    const prev = session.savedContacts.get(key) || {
      savedName: '',
      verifiedName: '',
      notifyName: '',
      phone: '',
      lid: ''
    };
    const nextSaved = incomingSaved || prev.savedName;
    const nextVerified = incomingVerified || prev.verifiedName;
    const nextNotify = incomingNotify || prev.notifyName;
    const nextPhone = phone || prev.phone;
    const nextLid = lid || prev.lid;

    if (
      (incomingSaved && incomingSaved !== prev.savedName) ||
      (incomingVerified && !prev.savedName && incomingVerified !== prev.verifiedName)
    ) {
      savedChanged = true;
    }

    session.savedContacts.set(key, {
      savedName: nextSaved,
      verifiedName: nextVerified,
      notifyName: nextNotify,
      phone: nextPhone,
      lid: nextLid
    });

    if (session.contactNames && (nextSaved || nextVerified)) {
      session.contactNames.set(key, nextSaved || nextVerified);
    }
  }

  if (savedChanged && session.sessionId && io) {
    scheduleContactsSync(io, session.sessionId, session);
  }
  return savedChanged;
}

function resolveDisplayName(session, { senderJid = '', phone = '', lid = '', pushName = '', isStatus = false } = {}) {
  const cleanJid = String(senderJid || '').trim();
  const cleanLid = String(lid || (cleanJid.includes('@lid') ? cleanJid : '')).trim();
  const lidDigits = cleanLid ? cleanLid.split('@')[0].split(':')[0] : '';
  const cleanPhone = phone || (cleanLid && session?.lidMap?.get(cleanLid)) || (cleanJid && session?.lidMap?.get(cleanJid)) || '';

  const candidateKeys = Array.from(new Set([
    cleanPhone,
    cleanPhone ? `${cleanPhone}@s.whatsapp.net` : '',
    cleanJid,
    cleanLid,
    lidDigits
  ].filter(Boolean)));

  if (session?.savedContacts) {
    for (const key of candidateKeys) {
      const entry = session.savedContacts.get(key);
      if (entry?.savedName) return entry.savedName;
    }
    for (const key of candidateKeys) {
      const entry = session.savedContacts.get(key);
      if (entry?.verifiedName) return entry.verifiedName;
    }
  }

  if (session?.contactNames) {
    for (const key of candidateKeys) {
      const nameVal = session.contactNames.get(key);
      if (nameVal) return nameVal;
    }
  }

  const cleanPush = String(pushName || '').trim();
  if (cleanPush) return cleanPush;

  if (session?.savedContacts) {
    for (const key of candidateKeys) {
      const entry = session.savedContacts.get(key);
      if (entry?.notifyName) return entry.notifyName;
    }
  }

  if (cleanPhone) return `+${cleanPhone}`;
  if (isStatus) return cleanJid ? `Kontak #${cleanJid.split('@')[0].slice(-4)}` : 'Status WhatsApp';
  return 'Kontak';
}

function resolveSenderInfo(io, msg, session) {
  const remoteJid = String(msg.key?.remoteJid || '');
  const isStatus = remoteJid === 'status@broadcast';
  const rawSenderJid = isStatus
    ? (msg.key?.participant || msg.key?.participantAlt || msg.key?.participantPn || msg.participant || '')
    : (msg.key?.remoteJid || msg.key?.remoteJidAlt || msg.key?.senderPn || '');

  const lidCandidate = [
    msg.key?.remoteJid,
    msg.key?.remoteJidAlt,
    msg.key?.participant,
    msg.key?.participantAlt,
    rawSenderJid
  ].find((j) => typeof j === 'string' && j.includes('@lid')) || '';

  const pnCandidate = [
    msg.key?.senderPn,
    msg.key?.participantPn,
    msg.key?.remoteJidAlt,
    msg.key?.participantAlt,
    rawSenderJid
  ].find((j) => typeof j === 'string' && j && !j.includes('@lid') && j !== 'status@broadcast') || '';

  const rawNumber = pnCandidate ? pnCandidate.split('@')[0].split(':')[0] : '';
  let phone = normalizePhone(rawNumber);
  if ((!phone || phone.length < 7) && lidCandidate && session?.lidMap) {
    phone = session.lidMap.get(lidCandidate) || session.lidMap.get(lidCandidate.split('@')[0].split(':')[0]) || '';
  }

  const pushName = String(msg.pushName || '').trim();
  const senderName = resolveDisplayName(session, {
    senderJid: rawSenderJid,
    phone,
    lid: lidCandidate,
    pushName,
    isStatus
  });

  if (pushName && (phone || rawSenderJid || lidCandidate)) {
    upsertSavedContact(io, session, {
      id: rawSenderJid,
      lid: lidCandidate,
      phoneNumber: phone,
      notify: pushName
    });
  }

  return {
    isStatus,
    remoteJid,
    senderJid: rawSenderJid,
    senderLid: lidCandidate || (phone && session?.lidMap?.get(phone)) || '',
    phone: phone || (lidCandidate ? lidCandidate.split('@')[0].split(':')[0] : ''),
    senderName
  };
}

module.exports = {
  resolveJidToPhone,
  resolveTargetIdentifiers,
  learnLidPair,
  buildContactsSyncPayload,
  scheduleContactsSync,
  upsertSavedContact,
  resolveDisplayName,
  resolveSenderInfo
};
