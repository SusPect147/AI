import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper utility to serialize structural JSONB grid layers to compact token-efficient ASCII for LLM ingestion
function serializeGridToAscii(grid: any): string {
  if (!Array.isArray(grid)) return "   [Error: Reference Grid Empty]\n";
  const symbols: Record<number, string> = {
    0: '.', 1: 'W', 2: 'B', 3: 'D', 4: 'C', 5: 'X', 7: 'R', 8: 'H', 11: 'S'
  };
  let output = "ASCII Codebook: . = Ground | W = Wall | B = Bush | D = Decorative Wall | C = Crate | H = Water | X = Barrel | S = Steel | R = Rope\n";
  for (let y = 0; y < Math.min(17, grid.length); y++) {
    const row = grid[y];
    let rowStr = `Row ${y}: `;
    if (y < 10) rowStr += " "; // Left-pad single digits
    if (Array.isArray(row)) {
      for (let x = 0; x < Math.min(21, row.length); x++) {
        const val = row[x] || 0;
        rowStr += (symbols[val] || '.');
      }
    } else {
      rowStr += "....................."; // Safe fallback for malformed rows
    }
    output += rowStr + "\n";
  }
  return output;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let rawInputBody = '';
  try {
    // --- 🛡️ MANDATORY SERVER-SIDE AUTHENTICATION AUDIT ---
    // Validates the client session to ensure ONLY logged-in users can invoke the neural synthesis, blocking API scraping.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Access Denied: Missing authorization header. Authenticate via client first." }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize local lightweight supabase client bound to the requesting user token
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Force user profile sync, automatically triggers JWT cryptographic verification in Supabase core
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.warn("[Security Warning] Blocked unauthenticated execution attempt:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Access Denied: Cryptographic validation of user token failed." }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // --- END OF SECURITY INJECTION ---
    // 1. Robust input parsing with string diagnostic backup
    let inputJson;
    try {
      rawInputBody = await req.text();
      inputJson = JSON.parse(rawInputBody);
    } catch (reqErr) {
      throw new Error(`Malformed Request Input Payload: ${reqErr.message}. Received Raw: '${rawInputBody.substring(0, 150)}'`);
    }

    const { prompt, gamemode = 'Knockout' } = inputJson;

    if (!prompt) {
      throw new Error("Missing 'prompt' parameter in JSON payload.");
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY server secret is not configured in Supabase vault!");
    }

    // 1. Dynamically discover the best active Flash model to prevent 404s in 2026 (as models like gemini-1.5 have been retired)
    let selectedModel = "gemini-3-flash-preview"; // Sensible default for May 2026
    try {
      console.log("[Gemini Discovery] Fetching available models...");
      const listResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (listResponse.ok) {
        const listData = await listResponse.json();
        if (listData.models && Array.isArray(listData.models)) {
          const availableFlashModels = listData.models
            .filter((m: any) => m.supportedGenerationMethods?.includes("generateContent") && m.name?.toLowerCase().includes("flash"))
            .map((m: any) => m.name.replace(/^models\//, ""));
          
          if (availableFlashModels.length > 0) {
            console.log("[Gemini Discovery] Found flash models:", availableFlashModels);
            // Order of preference for current model generations in 2026
            const priorities = ["gemini-3-flash-preview", "gemini-3-flash", "gemini-2.5-flash", "gemini-2.0-flash"];
            const match = priorities.find(p => availableFlashModels.includes(p));
            selectedModel = match || availableFlashModels[0];
            console.log(`[Gemini Discovery] Auto-selected active model: ${selectedModel}`);
          }
        } else {
          console.warn("[Gemini Discovery] Models list unexpected payload structure.");
        }
      } else {
        console.warn(`[Gemini Discovery] Failed fetching models list, status: ${listResponse.status}`);
      }
    } catch (discoveryErr) {
      console.warn("[Gemini Discovery] API models.list execution failed, utilizing fallback default:", discoveryErr.message);
    }

    // === 🧠 RETRIEVAL AUGMENTED GENERATION (RAG): GOLD MASTERPIECES & LIVE FEEDBACK REFLECTION ===
    
    // Step A: Dynamically pull expert baseline masterpieces established in gallery or pool
    let masterpieceSection = "\n=== GOLD ARTIFACTS: TOP-RATED COMPETITIVE DESIGNS ===\n" +
                             "Analyze these highly praised expert masterpieces currently in rotation.\n" +
                             "Their top-halves are serialized below. Notice wide lanes, grouped objects, and dynamic symmetry:\n";
    try {
      // First, attempt to pull maps tagged as AI training samples by admins
      let { data: candidates } = await supabaseClient
        .from('maps')
        .select('name, environment, map_data')
        .eq('is_ai_sample', true)
        .limit(20);
        
      // Fallback: if the dynamic pool is too small, load static gold standards to guarantee prompt quality!
      if (!candidates || candidates.length < 2) {
        console.log("[Dynamic Mastery] Too few active AI samples. Pulling fallback gold references...");
        const goldIds = [
          'd92ab84a-25fc-40fd-9ebb-d63c759c46ef',
          '59a7b67c-2f1c-4064-ac3e-e21c958fd099',
          '5a59782a-440d-4e83-b5d1-504b4b1cadef',
          '79ee7597-c5dc-4449-b48d-796e8385b1cd'
        ];
        const { data: fallbacks } = await supabaseClient
          .from('maps')
          .select('name, environment, map_data')
          .in('id', goldIds);
        candidates = fallbacks || [];
      }

      if (candidates && candidates.length > 0) {
        // Randomly shuffle candidates to ensure variety in generations!
        const shuffled = [...candidates].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, Math.min(4, shuffled.length));
        
        selected.forEach((m: any, idx: number) => {
          masterpieceSection += `\n---------------------------------------------------------------------\n`;
          masterpieceSection += `GOLD REFERENCE #${idx + 1}: "${m.name}" (Theme: ${m.environment})\n`;
          // Pull obstacle layer grid from slot index 2
          masterpieceSection += serializeGridToAscii(m.map_data?.[2]);
        });
        masterpieceSection += `---------------------------------------------------------------------\n`;
      } else {
        masterpieceSection += "\n[Notice: High-tier wide corridors and clustered cover groupings represent the standard reference.]\n";
      }
    } catch (err) {
      console.warn("[Learning Loop] Failed loading masterpieces:", err.message);
    }

    // Step B: Dynamically query recent AI generations that RECEIVED CRITICISM or VERBAL ACCLAIM (written reviews)
    let feedbackSection = "";
    try {
      const { data: fbMaps } = await supabaseClient
        .from('maps')
        .select('name, environment, map_data')
        .not('map_data->5->>ai_feedback', 'is', null)
        .neq('map_data->5->>ai_feedback', '')
        .order('created_at', { ascending: false })
        .limit(5); // Top 5 most recent reviews for instant reactivity!
        
      if (fbMaps && fbMaps.length > 0) {
        feedbackSection = "\n=== LIVE COMMUNITY REFLECTION LOOP (REAL-TIME CALIBRATION) ===\n" +
                          "Read actual text reviews written by playtesters on your PREVIOUS generations.\n" +
                          "Internalize their comments: REPLICATE what they loved, and ABSOLUTELY FIX their complaints!\n\n";
        fbMaps.forEach((m: any) => {
          const meta = m.map_data?.[5] || {};
          feedbackSection += `- AI Map "${m.name}" (${m.environment}): Rated ${meta.ai_rating || 'N/A'}/10.\n`;
          feedbackSection += `  Playtester Feedback: "${meta.ai_feedback}"\n\n`;
        });
        feedbackSection += "INSTRUCTION: Do NOT repeat the same structural mistakes mentioned above. Design better!\n";
      }
    } catch (err) {
      console.warn("[Learning Loop] Failed extracting active feedback:", err.message);
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`

    // --- 🎨 ARCHITECTURAL ARCHETYPES ENGINE ---
    // Injects structural diversity by forcing Gemini to adopt a unique design framework on each run!
    const archetypes = [
      {
        name: "Spiral Vortex",
        desc: "Lanes flow in a rotating, curved pattern. Obstacles guide players along flanking paths that spiral into a highly contested, fortified center."
      },
      {
        name: "Trident Splitting",
        desc: "Three strictly defined channels (Left flank, Center, Right flank) separated by long vertical cover islands. Discourages horizontal rotations, promotes strong lane holding."
      },
      {
        name: "Central Oasis",
        desc: "A highly dense center filled with heavy tactical camouflage and industrial cover. Ideal for ambushes, flanked by completely wide-open sniper alleys on the far left and right."
      },
      {
        name: "Diagonal Crossfire",
        desc: "Two massive diagonal corridors intersecting at the exact center axis. Promotes high-intensity cross-firing over L-shaped cover islands."
      },
      {
        name: "The Great Divide",
        desc: "A horizontal or diagonal boundary (river or safety ropes) slicing the arena in half, offering only 2-3 bridge/access points for breakthrough pushes."
      },
      {
        name: "Pinwheel Dynamics",
        desc: "Central cover components radiating outwards like a rotating pinwheel, creating mobile rotational corridors that reward quick-witted flanking maneuvers."
      },
      {
        name: "Tactical Maze Corridor",
        desc: "Intricate, grid-like dense cover clusters and small pocket bushes. Promotes close-quarter combat, hiding behind indestructible pillars."
      }
    ];
    const selectedArchetype = archetypes[Math.floor(Math.random() * archetypes.length)];
    console.log(`[Archetype Injector] Selected architectural pattern: ${selectedArchetype.name}`);

    // Crafting the ultimate Brawl Stars map builder prompt
    const systemInstruction = `
You are an elite Senior Level Designer at Supercell, widely regarded as the #1 mapmaker for Brawl Stars globally.
Your objective is to design an absolute masterpiece competitive Knockout arena based on this idea: "${prompt}"

=== 🚀 ARCHITECTURAL FREEDOM MANDATE (THINK BROADLY!) ===
You have MAXIMUM creative liberty! We are tired of boring, repetitive grids.
- Break the conventions! Shape epic terrain structures, curving rivers, sweeping diagonal cover systems, and grand tactical lanes.
- Make the layout feel alive and dynamic. You are fully authorized to create asymmetrical flank designs and unique themed playgrounds.
- ONLY the physical collision boundaries listed below are hard limits. Within those physics, LET YOUR CREATIVITY SOAR!

=== GEOMETRY & GRID RULES ===
- Grid Specs: 21 columns (x=0..20) by EXACTLY 17 rows (y=0..16, representing the TOP-HALF of the arena). To maximize generation speed and token efficiency, you ONLY design and output the top-half! The system mathematically projects the 180-degree rotational symmetry to populate the bottom half automatically.
- Spawn Integrity: Rows y=0..3 (Team 1 spawn) MUST be COMPLETELY empty (all zeroes) for structural integrity.
- Theme Selector: Pick EXACTLY ONE environment tag from this list of officially supported biomes: "Desert", "Mine", "Retropolis", "Arcade", "Bazaar", "Super_City", "Gift_Shop", "Starr_Force", "Wild_West", "Water_Park", "Robot_Factory", "Ghost_Station".

=== EXCLUSIVE TILE PALETTE ===
0 = Walkable Ground (Default)
1 = Hard Cover Wall (Blocks brawlers, blocks projectiles)
2 = Tactical Bush (Passable, provides invisibility camouflage)
3 = Alternative Decorative Wall (Blocks brawlers, blocks projectiles)
4 = Wooden Crate (Blocks brawlers, destructible prop)
5 = Industrial Barrel (Blocks brawlers, impassable prop)
7 = Safety Rope/Fence (Impassable block for brawlers, allows projectile fire through it)
8 = Water / Pond (Impassable block for brawlers, allows projectile fire through it)
11 = Unbreakable Steel Wall (Blocks everything, immune to destruction)

=== 🎨 CREATIVE DIRECTIVE (ARCHITECTURAL ARCHETYPE) ===
Apply the design philosophy of this structural pattern dynamically:
- **Archetype Name**: ${selectedArchetype.name}
- **Philosophy Description**: ${selectedArchetype.desc}

=== ⚠️ THE ONLY 3 HARD LAWS OF GRID PHYSICS (MANDATORY) ===

 1. THE FLUSH-EDGE OR 2-TILE BUFFER RULE (EDGES & BOUNDARIES):
    *   The screen borders (left side x=-1, right side x=21) act as physical walls.
    *   To prevent creating an illegal 1-tile wide walkable gap at column 0 or 20:
    *   **Column 1 Rule**: If you place any impassable block (1, 3, 4, 5, 7, 8, 11) at x=1, you MUST also place an impassable block at x=0 right next to it (the wall must extend flush to touch the screen border!). Never place a block at x=1 if x=0 is walkable (0 or 2).
    *   **Column 19 Rule**: If you place any impassable block at x=19, you MUST also place an impassable block at x=20 right next to it! Never place a block at x=19 if x=20 is walkable.
    *   *Goal*: Either extend your beautiful border walls all the way flush to the screen edge, OR leave at least a nice 2-tile wide walkable buffer at the boundaries.

 2. NO DIAGONAL SNAGS (THE ORTHOGONAL RULE):
    *   Blocks that touch only at their corners diagonally (e.g. a wall at [x,y] and [x+1, y+1] with empty space in between) create a snare where Brawler collision boxes get stuck.
    *   Rule: If two blocks touch diagonally, you MUST also fill at least one of their shared horizontal/vertical neighbors to make a solid cluster (L-shape, 2x2 square, or 3x1 line). Never leave "isolated" diagonal block-to-block connections.

 3. BEAUTIFUL ROTATIONAL INTEGRITY:
    *   Avoid mirror symmetry inside your top-half grid (never copy an x=3 cluster onto x=17).
    *   Make left and right sides tactically distinct!
    *   Center Axis Row (y=16) must be self-symmetric: [16][x] == [16][20-x].

${masterpieceSection}

${feedbackSection}

OUTPUT PROTOCOL:
- Return strictly a raw JSON object ONLY. No markdown fences.
- CHAIN-OF-THOUGHT REASONING MANDATE: Populate layout_philosophy and analysis FIRST to outline your grand architectural strategy BEFORE writing the grid array.
- JSON Schema: {
    "layout_philosophy": "Detailed architectural planning explaining how you are using the ${selectedArchetype.name} archetype, how you structure borders correctly with the Flush-Edge Rule, and your overall creative design.",
    "analysis": "A concise 2-3 sentence summary analyzing how different Brawler classes flow through this terrain.",
    "name": "CreativeMapName",
    "environment": "SelectedEnv",
    "grid": [[row0], [row1], ...] 
  }
- TOKEN COMPRESSION RULE: The "grid" key MUST contain EXACTLY 17 rows (y=0 to y=16).
`

    // --- RESILIENT API FETCH WITH EXPONENTIAL BACKOFF ---
    // Autonomously absorbs transient downstream server spikes (HTTP 503, 500) before reporting faults
    let response: Response | null = null;
    let lastError: Error | null = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const currentRes = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: systemInstruction }]
            }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.88,
              topP: 0.95,
            }
          })
        });

        response = currentRes;

        // Instant exit on successfully established payload
        if (response.ok) break;

        // Intercept and buffer transient server-side capacity spikes
        if (response.status === 503 || response.status === 500) {
          const delayMs = Math.pow(2, attempt) * 800; // 1.6s, 3.2s, etc.
          console.warn(`[Gemini Warning] Transient ${response.status} detected on attempt ${attempt}/${maxAttempts}. Backing off for ${delayMs}ms...`);
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
          }
        }

        // Autonomously absorb Google Free Tier Quota Limits (HTTP 429) with exact timing parsers
        if (response.status === 429) {
          let waitSec = 15; // Reliable safe-bound default
          try {
            const errBody = await response.clone().text();
            // Dynamically extract downstream sleep timers from Google error strings (e.g. "Please retry in 7.33s")
            const match = errBody.match(/retry in (\d+\.?\d*)s/i);
            if (match && match[1]) {
              waitSec = parseFloat(match[1]);
            }
          } catch (parseErr) {
            console.warn("[Gemini 429] Failed parsing precise quota buffer:", parseErr);
          }

          // Buffer wait time + 1.2s strict padding window to guarantee backend quota refreshes
          const waitMs = Math.ceil(waitSec * 1000) + 1200;
          console.warn(`[Gemini 429] Rate Limit triggered on attempt ${attempt}/${maxAttempts}. Suspended for ${waitMs}ms before recall...`);
          
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, waitMs));
            continue;
          }
        }
        
        // Direct skip for terminal application-layer faults (e.g., 400, 401)
        break;
      } catch (networkErr) {
        lastError = networkErr as Error;
        const delayMs = Math.pow(2, attempt) * 800;
        console.warn(`[Network Fault] Deno fetch failed on attempt ${attempt}/${maxAttempts}: ${networkErr.message}. Retrying in ${delayMs}ms...`);
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        break;
      }
    }

    if (!response) {
      throw new Error(`Max server fetch cycles exhausted without established connection. Terminal fault: ${lastError?.message || 'Network layer dead-locked'}`);
    }

    // 2. Robust Gemini response parsing with payload telemetry
    let geminiRawText = '';
    let data;
    try {
      geminiRawText = await response.text();
      data = JSON.parse(geminiRawText);
    } catch (geminiParseErr) {
      throw new Error(`Failed to parse Gemini API Response as JSON: ${geminiParseErr.message}. Raw text starts with: ${geminiRawText.substring(0, 200)}`);
    }

    if (!response.ok) {
      throw new Error(`Gemini API returned HTTP error ${response.status}: ${data.error?.message || 'Unknown Gemini API failure'}`)
    }

    // Safe extraction of text response from Gemini standard response schema
    const aiRawText = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!aiRawText) {
      throw new Error(`Received response with no candidate text. Response body: ${JSON.stringify(data)}`);
    }

    // Robust sanitization: Strip markdown code fences if returned by the LLM
    let sanitizedText = aiRawText.trim();
    if (sanitizedText.startsWith("```")) {
      sanitizedText = sanitizedText.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```$/, "");
    }
    sanitizedText = sanitizedText.trim();

    let mapData;
    try {
      mapData = JSON.parse(sanitizedText);
    } catch (jsonErr) {
      console.error("[AI JSON Parse Error]", jsonErr);
      throw new Error(`Failed to parse generated map content as JSON: ${jsonErr.message}. Text starts with: ${sanitizedText.substring(0, 150)}`);
    }

    return new Response(JSON.stringify(mapData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error("[AI Server Error]", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
