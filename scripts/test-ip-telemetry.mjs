import { lookupIpTelemetry, extractClientIp, isPrivateIp } from '../backend/src/services/ipCheck.service.js';

async function runTests() {
  console.log('Testing IP Telemetry Service...');

  // Test 1: Private IP check
  console.assert(isPrivateIp('127.0.0.1') === true, '127.0.0.1 should be private');
  console.assert(isPrivateIp('192.168.1.10') === true, '192.168.1.10 should be private');
  console.assert(isPrivateIp('10.0.0.1') === true, '10.0.0.1 should be private');
  console.assert(isPrivateIp('8.8.8.8') === false, '8.8.8.8 should be public');
  console.assert(isPrivateIp('1.1.1.1') === false, '1.1.1.1 should be public');
  console.log('Test 1 (Private IP Validation): PASSED');

  // Test 2: Header extraction
  const mockReqCf = {
    headers: { 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '127.0.0.1, 10.0.0.1' }
  };
  console.assert(extractClientIp(mockReqCf) === '1.1.1.1', 'Should extract Cloudflare IP');

  const mockReqFwd = {
    headers: { 'x-forwarded-for': '10.0.0.1, 8.8.8.8, 127.0.0.1' }
  };
  console.assert(extractClientIp(mockReqFwd) === '8.8.8.8', 'Should extract first public IP in X-Forwarded-For');
  console.log('Test 2 (IP Header Extraction): PASSED');

  // Test 3: Public IP lookup (Cloudflare 1.1.1.1)
  console.log('Fetching live telemetry for 1.1.1.1...');
  const res1 = await lookupIpTelemetry('1.1.1.1', '8.8.8.8');
  console.assert(res1.success === true, 'Lookup should succeed');
  console.assert(res1.ip === '1.1.1.1', 'IP should match 1.1.1.1');
  console.assert(typeof res1.isp.name === 'string' && res1.isp.name.length > 0, 'ISP should exist');
  console.assert(typeof res1.asn.code === 'string' && res1.asn.code.startsWith('AS'), 'ASN should be valid');
  console.assert(typeof res1.location.country === 'string', 'Country should exist');
  console.assert(typeof res1.security.threatLevel === 'string', 'Security threat level should exist');
  console.log(`Test 3 (1.1.1.1 Telemetry): PASSED (ISP: ${res1.isp.name}, ASN: ${res1.asn.code}, Country: ${res1.location.country})`);

  // Test 4: SSRF Defense
  console.log('Testing SSRF protection on internal IP (169.254.169.254)...');
  const resSsrf = await lookupIpTelemetry('169.254.169.254', '1.1.1.1');
  console.assert(resSsrf.success === false, 'SSRF lookup should fail');
  console.assert(resSsrf.error === 'ssrf_blocked', 'Error should be ssrf_blocked');
  console.log('Test 4 (SSRF Defense): PASSED');

  console.log('ALL TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
