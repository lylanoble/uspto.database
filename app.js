const RESULTS_PER_PAGE = 50;
const BATCH_SIZE = 10;
const MIN_LOADING_TIME = 800;
const MAX_CACHE_SIZE = 20;

// PASTE YOUR 77-LINE ARRAY HERE
const RANGE_MAP = [
  {
    "file": "chunk_0001.ndjson",
    "start": "!",
    "end": "atsoftwa"
  },
  {
    "file": "chunk_0002.ndjson",
    "start": "atsomogm",
    "end": "burney's sweets"
  },
  {
    "file": "chunk_0003.ndjson",
    "start": "burnfry",
    "end": "curating place"
  },
  {
    "file": "chunk_0004.ndjson",
    "start": "curation",
    "end": "eottk"
  },
  {
    "file": "chunk_0005.ndjson",
    "start": "eotvdlou",
    "end": "ghojet"
  },
  {
    "file": "chunk_0006.ndjson",
    "start": "ghojyfm",
    "end": "hxorbis"
  },
  {
    "file": "chunk_0007.ndjson",
    "start": "hxosft",
    "end": "konwedamed"
  },
  {
    "file": "chunk_0008.ndjson",
    "start": "konwins",
    "end": "masters of fire"
  },
  {
    "file": "chunk_0009.ndjson",
    "start": "masters of fire",
    "end": "nolacking"
  },
  {
    "file": "chunk_0010.ndjson",
    "start": "noladeco",
    "end": "potupwer"
  },
  {
    "file": "chunk_0011.ndjson",
    "start": "potus",
    "end": "saber brief"
  },
  {
    "file": "chunk_0012.ndjson",
    "start": "saber brief",
    "end": "sterihub"
  },
  {
    "file": "chunk_0013.ndjson",
    "start": "sterihub duo",
    "end": "timeless tokens"
  },
  {
    "file": "chunk_0014.ndjson",
    "start": "timeless tools ",
    "end": "wave on the go"
  },
  {
    "file": "chunk_0015.ndjson",
    "start": "wave one marine",
    "end": "\u7a05\u5b89"
  }
]

let query = "";
let page = 0;
let collectedResults = [];
let revealedCount = 0;
let isSearching = false;

const chunkCache = new Map();

// UI Elements
const resultsEl = document.getElementById("results");
const statusEl = document.getElementById("status");
const loadMoreBtn = document.getElementById("loadMoreBtn");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");

/**
 * INITIALIZATION: Now just checks if the hardcoded map exists
 */
async function init() {
    console.log("Initializing database index...");
    if (typeof RANGE_MAP !== 'undefined' && RANGE_MAP.length > 0) {
        console.log("✅ Range map detected. Chunks available:", RANGE_MAP.length);
        statusEl.textContent = "Database ready.";
    } else {
        console.error("Range map missing! Please paste your array into the code.");
        statusEl.textContent = "Error: Database index missing.";
    }
}

/**
 * THE TARGETED SEARCH ENGINE
 */
async function executeSearch() {
    if (isSearching || !RANGE_MAP) return;
    
    query = searchInput.value.trim().toLowerCase();
    if (query.length < 2) {
        statusEl.textContent = "Please enter at least 2 characters";
        return;
    }

    isSearching = true;
    collectedResults = [];
    page = 0;
    revealedCount = 0;
    resultsEl.innerHTML = "";
    loadMoreBtn.classList.add("hidden");
    
    showSkeletonCards(BATCH_SIZE);
    statusEl.textContent = "Locating data chunks...";

    const startTime = performance.now();

    // 1. Find only the chunks that alphabetically contain our query
    const targetChunks = RANGE_MAP.filter(chunk => {
        const q = query.toLowerCase();
        const start = chunk.start.toLowerCase();
        const end = chunk.end.toLowerCase();

        // Check if query is within range OR if the chunk starts with the query
        return (q >= start.substring(0, q.length) && q <= end) || start.startsWith(q);
    });

    if (targetChunks.length === 0) {
        statusEl.textContent = "No results found in the database.";
        isSearching = false;
        resultsEl.innerHTML = "";
        return;
    }

    // 2. Load only the necessary chunks
    for (const target of targetChunks) {
        statusEl.textContent = `Searching ${target.file}...`;
        const data = await loadChunk(target.file);
        if (!data) continue;

        for (const row of data) {
            const mark = row.mk?.toLowerCase();
            if (!mark) continue;

            if (mark.startsWith(query)) {
                collectedResults.push({ score: 2, row });
            } else if (mark.includes(query)) {
                collectedResults.push({ score: 1, row });
            }
        }
    }

    // 3. Sort by relevance
    collectedResults.sort((a, b) => b.score - a.score);

    // 4. Smooth UX Transition
    const elapsed = performance.now() - startTime;
    await new Promise(r => setTimeout(r, Math.max(0, MIN_LOADING_TIME - elapsed)));

    // 5. Reveal Phase
    resultsEl.innerHTML = "";
    await revealMoreResults();
    
    isSearching = false;
}

/**
 * HELPERS
 */
async function loadChunk(fileName) {
    if (chunkCache.has(fileName)) return chunkCache.get(fileName);
    
    try {
        const res = await fetch(`json_chunks/${fileName}`);
        if (!res.ok) return null;
        
        const text = await res.text();
        const lines = text.trim().split('\n').filter(l => l.length > 0);
        const parsed = [];
        let schema = null;

        for (const line of lines) {
            const data = JSON.parse(line);
            if (data.schema) { schema = data.schema; continue; }
            if (Array.isArray(data) && schema) {
                const obj = {};
                schema.forEach((key, i) => { obj[key] = data[i]; });
                parsed.push(obj);
            } else if (typeof data === 'object' && !Array.isArray(data)) {
                parsed.push(data);
            }
        }
        
        if (chunkCache.size >= MAX_CACHE_SIZE) {
            const firstKey = chunkCache.keys().next().value;
            chunkCache.delete(firstKey);
        }
        chunkCache.set(fileName, parsed);
        return parsed;
    } catch (err) {
        console.error("Failed to load:", fileName, err);
        return null;
    }
}

async function revealMoreResults() {
    const startIndex = page * RESULTS_PER_PAGE;
    const endIndex = Math.min(collectedResults.length, (page + 1) * RESULTS_PER_PAGE);
    
    if (collectedResults.length === 0) {
        statusEl.textContent = "No results found.";
        return;
    }

    let currentIndex = startIndex;
    while (currentIndex < endIndex) {
        const batchEnd = Math.min(currentIndex + BATCH_SIZE, endIndex);
        const batch = collectedResults.slice(currentIndex, batchEnd);
        
        for (let i = 0; i < batch.length; i++) {
            renderCard(batch[i].row, i * 30);
            revealedCount++;
        }
        
        currentIndex += BATCH_SIZE;
        await new Promise(r => setTimeout(r, 100));
    }

    updateStatus();
    loadMoreBtn.classList.toggle("hidden", revealedCount >= collectedResults.length);
}

function renderCard(r, delay) {
    const card = document.createElement("div");
    card.className = "bg-white rounded-2xl shadow-sm p-5 border border-slate-200 hover:shadow-lg flex flex-col opacity-0 translate-y-4 transition-all duration-500";
    
    const filedDate = r.fd ? `${r.fd.slice(6,8)}-${r.fd.slice(4,6)}-${r.fd.slice(0,4)}` : "—";

    card.innerHTML = `
            <div class="flex justify-center items-center h-48 mb-4 overflow-hidden rounded-xl bg-slate-50">
            <img 
                src="https://tmcms-docs.uspto.gov/cases/${r.sn}/mark/large.png"
                class="object-contain h-full w-full"
                alt="${r.mk || 'Trademark'}"
                loading="lazy"
                onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23f1f5f9%22 width=%22200%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-family=%22sans-serif%22 font-size=%2214%22 fill=%22%23cbd5e1%22%3ENo Image%3C/text%3E%3C/svg%3E'"
            >
            </div>
            <h2 class="text-lg font-semibold text-slate-900 mb-1 truncate" title="${r.mk || ''}">${r.mk || "—"}</h2>
            <p class="text-xs text-slate-500 mb-2 truncate">Owned by <strong>${r.or || "—"}</strong></p>
            <p class="text-xs text-slate-500 mb-3 truncate">
                Serial No # 
                <a href="https://tsdr.uspto.gov/#caseNumber=${r.sn}&caseType=SERIAL_NO&searchType=statusSearch" 
                   target="_blank" class="inline-flex items-center gap-1 font-bold hover:text-blue-500 transition-colors">
                    <span>${r.sn || "—"}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                </a>
            </p>
            <p class="text-sm text-slate-700 line-clamp-3 mb-3">${r.as || "—"}</p>
            <div class="mt-auto pt-3 border-t border-slate-100">
                <div class="flex items-center justify-between text-xs text-slate-500">
                    <span>Class <strong>${r.pc || "—"}</strong></span>
                    <span>Filed on <strong>${filedDate}</strong></span>
                </div>
            </div>
    `;

    resultsEl.appendChild(card);
    setTimeout(() => {
        card.style.opacity = "1";
        card.style.transform = "translateY(0)";
    }, delay);
}

function showSkeletonCards(count) {
    for (let i = 0; i < count; i++) {
        const s = document.createElement("div");
        s.className = "bg-white rounded-2xl shadow-sm p-5 border border-slate-200 animate-pulse";
        s.innerHTML = `
            <div class="h-48 bg-slate-100 rounded-xl mb-4"></div>
            <div class="h-6 bg-slate-100 rounded mb-2"></div>
            <div class="h-4 bg-slate-100 rounded w-3/4 mb-2"></div>
            <div class="h-16 bg-slate-100 rounded mb-3"></div>
            <div class="h-4 bg-slate-100 rounded"></div>
            `;
        resultsEl.appendChild(s);
    }
}

function updateStatus() {
    statusEl.textContent = `Showing ${revealedCount} of ${collectedResults.length.toLocaleString()} results`;
}

// Event Listeners
searchBtn.addEventListener("click", executeSearch);
searchInput.addEventListener("keypress", (e) => { if (e.key === "Enter") executeSearch(); });
loadMoreBtn.addEventListener("click", () => {
    page++;
    revealMoreResults();
});

init();