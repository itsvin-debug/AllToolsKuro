import { scrapeTiktok } from '../server/scrapers/tiktokScraper.js';
import { scrapeInstagram } from '../server/scrapers/instagramScraper.js';
import { scrapeTwitter } from '../server/scrapers/twitterScraper.js';
import { scrapeGithub } from '../server/scrapers/githubScraper.js';
import resolveHandler from '../server/handlers/resolveHandler.js';

async function run() {
  console.log('=== RUNNING END-TO-END STALKER & RESOLVER TESTS ===\n');

  // Test 1: TikTok
  console.log('1. Testing TikTok Scraper...');
  const tt1 = await scrapeTiktok('@ kurov24');
  console.log('  [TikTok @ kurov24]:', tt1.success, tt1.data?.nickname, tt1.data?.stats);
  if (!tt1.success || tt1.data?.stats?.followers === 0) throw new Error('TikTok kurov24 failed');

  const tt2 = await scrapeTiktok('https://www.tiktok.com/@masbibzz');
  console.log('  [TikTok masbibzz]:', tt2.success, tt2.data?.nickname, tt2.data?.stats);
  if (!tt2.success || tt2.data?.stats?.followers === 0) throw new Error('TikTok masbibzz failed');

  // Test 2: Instagram
  console.log('\n2. Testing Instagram Scraper...');
  const ig1 = await scrapeInstagram('@ tokitovin');
  console.log('  [Instagram @ tokitovin]:', ig1.success, ig1.data?.nickname, ig1.data?.stats, 'Bio:', ig1.data?.bio);
  if (!ig1.success || ig1.data?.stats?.followers === 0) throw new Error('Instagram tokitovin failed');

  // Test 3: Twitter
  console.log('\n3. Testing Twitter Scraper...');
  const tw1 = await scrapeTwitter('@ elonmusk');
  console.log('  [Twitter @ elonmusk]:', tw1.success, tw1.data?.nickname, tw1.data?.stats);
  if (!tw1.success || tw1.data?.stats?.followers === 0) throw new Error('Twitter elonmusk failed');

  const tw2 = await scrapeTwitter('https://x.com/nasa');
  console.log('  [Twitter nasa]:', tw2.success, tw2.data?.nickname, tw2.data?.stats);
  if (!tw2.success || tw2.data?.stats?.followers === 0) throw new Error('Twitter nasa failed');

  // Test 4: GitHub
  console.log('\n4. Testing GitHub Scraper...');
  const gh1 = await scrapeGithub('https://github.com/itsvin-debug');
  console.log('  [GitHub itsvin-debug]:', gh1.success, gh1.data?.nickname, gh1.data?.stats);
  if (!gh1.success || gh1.data?.stats?.followers === 0) throw new Error('GitHub itsvin-debug failed');

  // Test 5: Safelink Resolver
  console.log('\n5. Testing Linktree Safelink Resolver...');
  let resolverData = null;
  const mockReq = {
    method: 'POST',
    url: '/api/resolve',
    query: { __route: 'resolve' },
    headers: { host: 'localhost' },
    body: { url: 'https://linktr.ee/miuillust' }
  };
  const mockRes = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(data) { resolverData = data; },
    end() {}
  };
  await resolveHandler(mockReq, mockRes);
  console.log('  [Linktree Resolver]:', resolverData?.status, 'Items count:', resolverData?.items?.length, 'Engine:', resolverData?.engine);
  if (resolverData?.status !== 'success' || !resolverData?.items?.length) throw new Error('Resolver failed');

  console.log('\n=== ALL 5 SYSTEMS PASSED 100% PERFECTLY! ===');
}

run().catch(err => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
