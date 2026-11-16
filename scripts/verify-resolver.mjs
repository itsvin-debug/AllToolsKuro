import { resolveUrl } from '../backend/src/services/resolver.service.js';

const testUrls = [
  { name: 'Linktree Bio', url: 'https://linktr.ee/miuillust' },
  { name: 'SFL Mediafire', url: 'https://sfl.gl/8VwvPZI' },
  { name: 'S.id Shortlink', url: 'https://s.id/1x' },
  { name: 'Safelink Base64', url: 'https://safelink.blogger.com/go?url=aHR0cHM6Ly93d3cubWVkaWFmaXJlLmNvbS9maWxlL3NhbXBsZS56aXA=' },
  { name: 'Bitly Redirect', url: 'https://bit.ly/3sample' }
];

async function run() {
  console.log('--- Testing Pure Node.js Safelink Resolver ---');
  for (const item of testUrls) {
    const start = Date.now();
    try {
      const res = await resolveUrl(item.url);
      const elapsed = Date.now() - start;
      console.log(`[${res.status === 'success' ? 'PASS' : 'FAIL'}] ${item.name} (${elapsed}ms)`);
      if (res.status === 'success') {
        if (res.result_type === 'multiple_links') {
          console.log(`   Type: Multiple Links (${res.count} items). First: ${res.items[0]?.title} -> ${res.items[0]?.url}`);
        } else {
          console.log(`   Resolved: ${res.resolved_url} (Category: ${res.category}, Engine: ${res.engine})`);
        }
      } else {
        console.log(`   Error: ${res.message}`);
      }
    } catch (e) {
      console.log(`[ERROR] ${item.name}: ${e.message}`);
    }
  }
}

run();
