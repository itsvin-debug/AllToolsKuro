import resolveHandler from '../server/handlers/resolveHandler.js';
import compressPdfHandler from '../server/handlers/compressPdfHandler.js';
import linkToDocHandler from '../server/handlers/linkToDocHandler.js';
import ipCheckHandler from '../server/handlers/ipCheckHandler.js';
import lockedToolsHandler from '../server/handlers/lockedToolsHandler.js';
import versionHandler from '../server/handlers/versionHandler.js';

/**
 * api/tools.js - Consolidated Productivity & Utility Tools Gateway
 * Handles: Resolver, PDF Compression, Link to Doc, IP Telemetry, Locked Tools, Version & Battery
 */
export default async function handler(req, res) {
  const route = (req.query?.__route || '').toLowerCase();
  const urlPath = (req.url || '').toLowerCase();

  if (route === 'resolve' || urlPath.includes('/api/resolve') || urlPath.includes('resolve')) {
    return resolveHandler(req, res);
  }

  if (route === 'compress-pdf' || urlPath.includes('/api/compress-pdf') || urlPath.includes('compress-pdf')) {
    return compressPdfHandler(req, res);
  }

  if (route === 'link-to-doc' || urlPath.includes('/api/link-to-doc') || urlPath.includes('link-to-doc')) {
    return linkToDocHandler(req, res);
  }

  if (route === 'ip-check' || urlPath.includes('/api/ip-check') || urlPath.includes('ip-check')) {
    return ipCheckHandler(req, res);
  }

  if (
    route === 'locked-tools' || 
    urlPath.includes('/api/locked-tools') || 
    urlPath.includes('/api/verify-admin') || 
    urlPath.includes('/api/ping') ||
    urlPath.includes('locked-tools')
  ) {
    return lockedToolsHandler(req, res);
  }

  if (
    route === 'version' || 
    urlPath.includes('/api/version') || 
    urlPath.includes('/api/app/version') || 
    urlPath.includes('/api/system-battery') ||
    urlPath.includes('version') ||
    urlPath.includes('battery')
  ) {
    return versionHandler(req, res);
  }

  // Default fallback ke version jika route tidak cocok
  return versionHandler(req, res);
}
