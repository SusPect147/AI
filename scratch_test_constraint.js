const supabaseUrl = 'https://zzajradnutrwkkxekqic.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6YWpyYWRudXRyd2treGVrcWljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1ODUyNzQsImV4cCI6MjA5NDE2MTI3NH0.eKAIPBks4ABuU4IVehXxP6DmnSYlAnKDlB_Ss6wkjGU';

async function testInsert(payload, label) {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/maps`, {
      method: 'POST',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      console.log(`SUCCESS [${label}]`);
    } else {
      const err = await response.json();
      console.log(`FAILED [${label}]:`, err.message);
    }
  } catch(err) {
    console.log(`ERROR [${label}]:`, err.message);
  }
}

async function run() {
  const base = {
    name: "Constraint Test",
    size: "regular",
    gamemode: "Knockout",
    environment: "Desert",
    map_data: [[],[],[],[]],
    author_name: "Tester",
    user_id: "f8d82fb9-38c7-4404-bb65-efbc1d648639", // Use some valid user ID or try without auth if possible
    is_public: false
  };

  // Test 1: is_ai_sample = true
  await testInsert({...base, is_ai_sample: true}, "is_ai_sample: true");

  // Test 2: is_ai_sample = false
  await testInsert({...base, is_ai_sample: false}, "is_ai_sample: false");

  // Test 3: ommit is_ai_sample
  await testInsert({...base}, "omit is_ai_sample");
}

run();
