import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/spotify-track/index.ts';

const id = '11dFghVXANMlKmJXsNCbNl';
const link = `https://open.spotify.com/track/${id}`;
const endpoint = value => `https://project.supabase.co/functions/v1/spotify-track?url=${encodeURIComponent(value)}`;
const embed = artists => `<script type="application/json" id="__NEXT_DATA__">${JSON.stringify({props:{pageProps:{state:{data:{entity:{id,type:'track',artists}},settings:{session:{accessToken:'must-not-be-returned'}}}}}})}</script>`;
const successFetcher = async url => new Response(url.includes('/oembed?') ? JSON.stringify({title:'Cut To The Feeling'}) : embed([{name:'Carly Rae Jepsen'}]));
function checkCors(response) { assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*'); }

test('answers browser preflight and restricts request methods without fetching', async () => {
  const handler = createHandler(() => assert.fail('must not fetch'));
  const options = await handler(new Request(endpoint(link), {method:'OPTIONS'})); assert.equal(options.status,204); checkCors(options);
  const post = await handler(new Request(endpoint(link), {method:'POST'})); assert.equal(post.status,405); assert.equal(post.headers.get('Allow'),'GET, OPTIONS'); checkCors(post);
});
test('rejects non-Spotify, credentialed, other entity and malformed links before fetching', async () => {
  const handler = createHandler(() => assert.fail('must not fetch'));
  for (const value of ['', 'not a URL', `https://evil.example/track/${id}`, `https://open.spotify.com.evil.example/track/${id}`, `https://open.spotify.com/album/${id}`, `https://user:secret@open.spotify.com/track/${id}`, `https://open.spotify.com:444/track/${id}`]) {
    const response = await handler(new Request(endpoint(value))); assert.equal(response.status,400); checkCors(response);
  }
});
test('returns only public canonical song fields, including multiple artists', async () => {
  const requested = [];
  const handler = createHandler(async (url, options) => {
    requested.push(url); assert.equal(options.redirect,'error'); assert.ok(options.signal);
    return new Response(url.includes('/oembed?') ? JSON.stringify({title:'A real song'}) : embed([{name:'First Artist'},{name:'Second Artist'}]));
  });
  const response = await handler(new Request(endpoint(`https://open.spotify.com/intl-en/track/${id}?si=tracking`)));
  assert.equal(response.status,200); checkCors(response);
  const data = await response.json(); assert.deepEqual(data,{id,url:link,title:'A real song',artist:'First Artist, Second Artist'});
  assert.equal(JSON.stringify(data).includes('must-not-be-returned'),false);
  assert.equal(requested.length,2); assert.ok(requested.every(url=>new URL(url).hostname==='open.spotify.com'));
});
test('deduplicates concurrent requests and caches successful metadata', async () => {
  let calls=0; const handler=createHandler(async url=>{calls++;return successFetcher(url);});
  const results=await Promise.all([handler(new Request(endpoint(link))),handler(new Request(endpoint(link)))]);
  assert.ok(results.every(response=>response.status===200)); assert.equal(calls,2);
  assert.equal((await handler(new Request(endpoint(link)))).status,200); assert.equal(calls,2);
});
test('keeps CORS on rate limits, missing tracks, unreadable artists and network failures', async () => {
  const cases = [
    [async()=>new Response('busy',{status:429}),503],
    [async()=>new Response('missing',{status:404}),404],
    [async url=>new Response(url.includes('/oembed?')?JSON.stringify({title:'Song'}):embed([])),502],
    [async()=>{throw new Error('private diagnostics');},502],
    [async()=>new Response('x'.repeat(2_000_001)),502],
  ];
  for (const [fetcher,status] of cases) {
    const response=await createHandler(fetcher)(new Request(endpoint(link)));
    assert.equal(response.status,status); checkCors(response); const body=await response.text();
    assert.equal(body.includes('private diagnostics'),false); assert.equal(body.includes('must-not-be-returned'),false);
  }
});
test('does not cache failures so a temporary outage can recover', async () => {
  let failing=true; const handler=createHandler(async url=>failing?new Response('busy',{status:429}):successFetcher(url));
  assert.equal((await handler(new Request(endpoint(link)))).status,503); failing=false;
  assert.equal((await handler(new Request(endpoint(link)))).status,200);
});
