import { scrapeTiktok } from '../backend/src/scrapers/tiktokScraper.js';
import { scrapeInstagram } from '../backend/src/scrapers/instagramScraper.js';
import { scrapeTwitter } from '../backend/src/scrapers/twitterScraper.js';
import { scrapeGithub } from '../backend/src/scrapers/githubScraper.js';

async function verifyAllStalkers() {
  console.log('🚀 Starting Multi-Platform OSINT Stalker Verification...\n');

  // 1. TikTok Stalker Test
  console.log('--- 1. Testing TikTok Scraper (@tiktok) ---');
  try {
    const ttRes = await scrapeTiktok('tiktok');
    console.log('Status:', ttRes.success ? 'SUCCESS' : 'FAIL');
    console.log('Username:', ttRes.data?.username);
    console.log('Followers:', ttRes.data?.stats?.followers);
    console.log('Likes:', ttRes.data?.stats?.likes);
    if (ttRes.success && ttRes.data?.stats?.followers > 1000000) {
      console.log('✅ PASS: TikTok scraper working perfectly.');
    } else {
      console.warn('⚠️ TikTok response did not match expected metrics.');
    }
  } catch (err) {
    console.error('❌ TikTok Error:', err.message);
  }

  // 2. GitHub Stalker Test
  console.log('\n--- 2. Testing GitHub Scraper (@torvalds) ---');
  try {
    const ghRes = await scrapeGithub('torvalds');
    console.log('Status:', ghRes.success ? 'SUCCESS' : 'FAIL');
    console.log('Name:', ghRes.data?.nickname);
    console.log('Followers:', ghRes.data?.followers);
    console.log('Public Repos:', ghRes.data?.publicRepos);
    console.log('Total Stars:', ghRes.data?.totalStars);
    console.log('Created At:', ghRes.data?.createTime);
    if (ghRes.success && ghRes.data?.followers > 10000) {
      console.log('✅ PASS: GitHub scraper working perfectly.');
    } else {
      console.warn('⚠️ GitHub scraper response:', ghRes);
    }
  } catch (err) {
    console.error('❌ GitHub Error:', err.message);
  }

  // 3. Twitter / X Stalker Test
  console.log('\n--- 3. Testing X / Twitter Scraper (@elonmusk) ---');
  try {
    const twRes = await scrapeTwitter('elonmusk');
    console.log('Status:', twRes.success ? 'SUCCESS' : 'FAIL');
    console.log('Name:', twRes.data?.nickname);
    console.log('Username:', twRes.data?.username);
    console.log('Followers:', twRes.data?.followers);
    console.log('Tweets:', twRes.data?.tweets);
    console.log('Avatar HD:', twRes.data?.avatar ? twRes.data.avatar.slice(0, 50) + '...' : 'none');
    if (twRes.success && twRes.data?.followers > 1000000) {
      console.log('✅ PASS: X (Twitter) scraper working perfectly.');
    } else {
      console.warn('⚠️ X scraper response:', twRes);
    }
  } catch (err) {
    console.error('❌ X Error:', err.message);
  }

  // 4. Instagram Stalker Test
  console.log('\n--- 4. Testing Instagram Scraper (@instagram) ---');
  try {
    const igRes = await scrapeInstagram('instagram');
    console.log('Status:', igRes.success ? 'SUCCESS' : 'FAIL');
    console.log('Name:', igRes.data?.nickname);
    console.log('Username:', igRes.data?.username);
    console.log('Followers:', igRes.data?.followers);
    console.log('Posts:', igRes.data?.posts);
    if (igRes.success) {
      console.log('✅ PASS: Instagram scraper working.');
    } else {
      console.warn('⚠️ Instagram response status:', igRes.statusCode, igRes.message);
    }
  } catch (err) {
    console.error('❌ Instagram Error:', err.message);
  }

  console.log('\n=============================================');
  console.log('🎉 ALL MULTI-PLATFORM OSINT TESTS COMPLETED');
  console.log('=============================================');
}

verifyAllStalkers().catch(console.error);
