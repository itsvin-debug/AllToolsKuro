import { stalkTiktokProfile, resolveTiktokUsername } from '../backend/src/services/tiktokStalker.service.js';

async function runVerification() {
  console.log('🚀 Starting Triple-Engine Self-Hosted TikTok Scraper Verification...\n');

  // Test 1: Username Resolver
  console.log('--- Test 1: Username & Link Resolver ---');
  const u1 = await resolveTiktokUsername('@khaby.lame');
  const u2 = await resolveTiktokUsername('https://www.tiktok.com/@tiktok?lang=en');
  console.log(`@khaby.lame -> "${u1}" (${u1 === 'khaby.lame' ? 'PASS' : 'FAIL'})`);
  console.log(`tiktok.com/@tiktok -> "${u2}" (${u2 === 'tiktok' ? 'PASS' : 'FAIL'})`);

  // Test 2: Live Scrape @tiktok (Official Account)
  console.log('\n--- Test 2: Live Scrape @tiktok ---');
  const t0 = Date.now();
  const resTiktok = await stalkTiktokProfile('tiktok');
  const d0 = Date.now() - t0;
  console.log(`Fetched in ${d0}ms`);
  console.log('Source:', resTiktok.source);
  console.log('Username:', resTiktok.data.username);
  console.log('Followers:', resTiktok.data.stats.followers);
  console.log('Likes:', resTiktok.data.stats.likes);
  console.log('Verified:', resTiktok.data.verified);
  console.log('Avatar URL:', resTiktok.data.avatar ? resTiktok.data.avatar.slice(0, 50) + '...' : 'none');

  if (resTiktok.data.stats.followers > 50000000 && resTiktok.data.stats.likes > 100000000) {
    console.log('✅ PASS: Real authentic stats extracted (no zero values)');
  } else {
    console.error('❌ FAIL: Real stats failed to extract');
  }

  // Test 3: Cache Hit Speed Check
  console.log('\n--- Test 3: In-Memory Cache (TTL 60s) ---');
  const t1 = Date.now();
  const cachedRes = await stalkTiktokProfile('tiktok');
  const d1 = Date.now() - t1;
  console.log(`Cache fetch completed in ${d1}ms (cached: ${cachedRes.cached})`);
  if (cachedRes.cached && d1 < 50) {
    console.log('✅ PASS: Cache hit returned in under 50ms');
  } else {
    console.warn('⚠️ Cache check warning: did not hit cache or took >50ms');
  }

  // Test 4: Force Refresh Bypass
  console.log('\n--- Test 4: Force Refresh Bypass ---');
  const t2 = Date.now();
  const refreshedRes = await stalkTiktokProfile('tiktok', { forceRefresh: true });
  const d2 = Date.now() - t2;
  console.log(`Force refresh completed in ${d2}ms (cached: ${refreshedRes.cached})`);
  if (!refreshedRes.cached) {
    console.log('✅ PASS: Force refresh successfully bypassed cache');
  } else {
    console.error('❌ FAIL: Force refresh failed to bypass cache');
  }

  // Test 5: Like Overflow Handling (@khaby.lame has >2.5B likes)
  console.log('\n--- Test 5: Like Overflow Handling (@khaby.lame) ---');
  const resKhaby = await stalkTiktokProfile('khaby.lame');
  console.log('Khaby Lame Likes:', resKhaby.data.stats.likes);
  if (resKhaby.data.stats.likes > 2000000000) {
    console.log('✅ PASS: Khaby Lame likes correctly handled 64-bit integer (> 2B likes, no negative numbers)');
  } else {
    console.warn(`Khaby Lame likes: ${resKhaby.data.stats.likes}`);
  }

  // Test 6: Non-Existent User
  console.log('\n--- Test 6: Non-Existent User Detection ---');
  const resNonExistent = await stalkTiktokProfile('nonexistent_user_99218274910283');
  if (resNonExistent.statusCode === 404 && resNonExistent.error === 'user_not_found') {
    console.log(`✅ PASS: Non-existent user correctly returned 404 (${resNonExistent.message})`);
  } else {
    console.error('❌ FAIL: Non-existent user response:', resNonExistent);
  }

  console.log('\n=============================================');
  console.log('🎉 ALL TRIPLE-ENGINE SCRAPER TESTS FINISHED');
  console.log('=============================================');
}

runVerification().catch(console.error);
