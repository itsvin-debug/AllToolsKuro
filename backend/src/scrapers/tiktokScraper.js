import { stalkTiktokProfile, resolveTiktokUsername } from '../services/tiktokStalker.service.js';

/**
 * tiktokScraper.js - Scraper TikTok Mandiri (Triple-Engine)
 * Menjaga 100% fungsionalitas TikTok Stalker yang sudah stabil.
 */
export async function scrapeTiktok(target, options = {}) {
  return await stalkTiktokProfile(target, options);
}

export { resolveTiktokUsername };
export default scrapeTiktok;
