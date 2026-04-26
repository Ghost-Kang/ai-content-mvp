// Direct OpenAI fetch — bypass our provider wrapper to see raw error body.

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');

  console.log(`key prefix: ${apiKey.slice(0, 10)}...${apiKey.slice(-6)}`);

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      Authorization:   `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:      'gpt-4o-mini',
      max_tokens: 20,
      messages: [{ role: 'user', content: 'say hi' }],
    }),
  });

  console.log(`status: ${r.status} ${r.statusText}`);
  const text = await r.text();
  console.log('body:', text.slice(0, 500));
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
