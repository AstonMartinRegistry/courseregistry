// Quick test that OPEN_AI_API_KEY works
// Run: node scripts/test-openai-key.js

require('dotenv').config({ path: '.env.local' });

const key = process.env.OPEN_AI_API_KEY || process.env.OPENAI_API_KEY;

if (!key) {
  console.error('❌ OPEN_AI_API_KEY not found in .env.local');
  process.exit(1);
}

async function test() {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Say "hello" in one word.' }],
      max_tokens: 10,
    }),
  });

  if (!res.ok) {
    console.error('❌ API error:', res.status, await res.text());
    process.exit(1);
  }

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content?.trim();
  console.log('✅ API key works! Reply:', reply || '(no content)');
}

test().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
