import { load } from "https://deno.land/std@0.196.0/dotenv/mod.ts";

// Load env to get API key
await load({ export: true });
const apiKey = Deno.env.get("GEMINI_API_KEY");

if (!apiKey) {
  console.error("Error: GEMINI_API_KEY is missing!");
  Deno.exit(1);
}

// Test URLs
const tests = [
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
  `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`
];

for (const url of tests) {
  console.log(`\nTesting URL: ${url.replace(apiKey, "KEY_HIDDEN")}`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Output 'OK'" }] }]
      })
    });
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log(`Response snippet: ${text.substring(0, 150)}`);
  } catch (err) {
    console.error(`Fetch error: ${err.message}`);
  }
}
