const supabaseUrl = 'https://zzajradnutrwkkxekqic.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6YWpyYWRudXRyd2treGVrcWljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1ODUyNzQsImV4cCI6MjA5NDE2MTI3NH0.eKAIPBks4ABuU4IVehXxP6DmnSYlAnKDlB_Ss6wkjGU';

async function run() {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/maps?select=id,name,map_data,author_name&order=created_at.desc`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    });
    const data = await response.json();
    console.log("Total maps:", data.length);
    
    let aiCount = 0;
    data.forEach(m => {
      const arr = m.map_data;
      let isAI = false;
      let metadataIdx = -1;
      let metadataContent = null;
      
      if (Array.isArray(arr)) {
        arr.forEach((el, idx) => {
          if (el && typeof el === 'object' && !Array.isArray(el)) {
            // Check if it contains any key commonly associated with AI, e.g., synthesized_at, ai_rating, or is just not a grid layer (grid layers are objects with string keys 0,1,2... but they contain a LOT of keys)
            const keys = Object.keys(el);
            if (keys.includes('ai_rating') || keys.includes('synthesized_at') || keys.includes('ai_feedback')) {
               isAI = true;
               metadataIdx = idx;
               metadataContent = el;
            }
          }
        });
      }
      
      if (isAI) {
        aiCount++;
        console.log(`AI MAP: "${m.name}" | Author: ${m.author_name} | ID: ${m.id}`);
        console.log(`   - Metadata found at index [${metadataIdx}]`);
        console.log(`   - Metadata keys:`, Object.keys(metadataContent));
        console.log(`   - ai_rating:`, metadataContent.ai_rating, `| ai_feedback:`, metadataContent.ai_feedback);
      }
    });
    console.log("\nFound", aiCount, "AI maps total out of", data.length);
  } catch(err) {
    console.error(err);
  }
}

run();
