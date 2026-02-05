const RESULTS_PER_PAGE = 50;
const EXPECTED_MIN = 71;
const EXPECTED_MAX = 86;
const BATCH_SIZE = 10;
const MIN_LOADING_TIME = 1000;
const MAX_CACHE_SIZE = 20;

let query = "";
let page = 0;
let minChunk = null;
let maxChunk = null;
let rangeDetected = false;
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
 * INITIALIZATION: Detect valid chunk range once on load
 */
async function init() {
    console.log("Scanning for data chunks...");
    for (let i = EXPECTED_MIN; i <= EXPECTED_MAX; i++) {
        const exists = await chunkExists(i);
        if (exists) {
            if (minChunk === null) minChunk = i;
            maxChunk = i;
        }
    }
    if (minChunk !== null) {
        rangeDetected = true;
        console.log(`✅ Range: ${minChunk} to ${maxChunk}`);
    }
}

async function chunkExists(index) {
    try {
        const res = await fetch(`json_chunks/chunk_${String(index).padStart(4, "0")}.ndjson`, { method: 'HEAD' });
        return res.ok;
    } catch { return false; }
}

/**
 * THE MAIN SEARCH ENGINE
 * Triggered only by button click or Enter key
 */
async function executeSearch() {
    if (isSearching || !rangeDetected) return;
    
    query = searchInput.value.trim().toLowerCase();
    if (query.length < 2) {
        statusEl.textContent = "Please enter at least 2 characters";
        return;
    }

    // Reset State
    isSearching = true;
    collectedResults = [];
    page = 0;
    revealedCount = 0;
    resultsEl.innerHTML = "";
    loadMoreBtn.classList.add("hidden");
    
    // 1. Show Skeletons and start "Counting" phase
    showSkeletonCards(BATCH_SIZE);
    statusEl.textContent = "Scanning database...";

    const startTime = performance.now();

    // 2. Loop through all chunks to find matches
    // We go from max to min to get newest data first (assuming higher index = newer)
    for (let i = maxChunk; i >= minChunk; i--) {
        const data = await loadChunk(i);
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
        // Brief status update during scan
        statusEl.textContent = `Scanning... Found ${collectedResults.length} matches`;
    }

    // 3. Sort by relevance
    collectedResults.sort((a, b) => b.score - a.score);

    // 4. Mimic "Processing" time for smooth UX
    const elapsed = performance.now() - startTime;
    const remainingWait = Math.max(0, MIN_LOADING_TIME - elapsed);
    await new Promise(r => setTimeout(r, remainingWait));

    // 5. Reveal Phase
    resultsEl.innerHTML = "";
    await revealMoreResults();
    
    isSearching = false;
}

/**
 * REVEAL LOGIC
 */
async function revealMoreResults() {
    const startIndex = page * RESULTS_PER_PAGE;
    const endIndex = Math.min(collectedResults.length, (page + 1) * RESULTS_PER_PAGE);
    
    if (collectedResults.length === 0) {
        statusEl.textContent = "No results found.";
        return;
    }

    // Slice the batch for the current page
    let currentIndex = startIndex;
    while (currentIndex < endIndex) {
        const batchEnd = Math.min(currentIndex + BATCH_SIZE, endIndex);
        const batch = collectedResults.slice(currentIndex, batchEnd);
        
        for (let i = 0; i < batch.length; i++) {
            renderCard(batch[i].row, i * 50); // Fast staggered animation
            revealedCount++;
        }
        
        currentIndex += BATCH_SIZE;
        // Small pause between batches for visual flow
        await new Promise(r => setTimeout(r, 200));
    }

    updateStatus();
    
    if (collectedResults.length > revealedCount) {
        loadMoreBtn.classList.remove("hidden");
    } else {
        loadMoreBtn.classList.add("hidden");
    }
}

/**
 * HELPERS
 */
async function loadChunk(index) {
    if (chunkCache.has(index)) return chunkCache.get(index);
    
    try {
        const res = await fetch(`json_chunks/chunk_${String(index).padStart(4, "0")}.ndjson`);
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
            }
        }
        
        // Cache management
        if (chunkCache.size >= MAX_CACHE_SIZE) chunkCache.delete(chunkCache.keys().next().value);
        chunkCache.set(index, parsed);
        return parsed;
    } catch (err) {
        return null;
    }
}

function renderCard(r, delay) {
    const card = document.createElement("div");
    card.className = "bg-white rounded-2xl shadow-sm p-5 border border-slate-200 hover:shadow-lg flex flex-col opacity-0 translate-y-4 transition-all duration-500";
    
    const filedDate = r.fd ? `${r.fd.slice(6,8)}-${r.fd.slice(4,6)}-${r.fd.slice(0,4)}` : "—";

    card.innerHTML = `
            <div class="flex justify-center items-center h-48 mb-4 overflow-hidden rounded-xl">
            <img 
                src="https://tmcms-docs.uspto.gov/cases/${r.sn}/mark/large.png"
                class="object-contain h-full w-full"
                alt="${r.mk || 'Trademark'}"
                loading="lazy"
                onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23e2e8f0%22 width=%22200%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-family=%22sans-serif%22 font-size=%2216%22 fill=%22%2394a3b8%22%3ENo Image%3C/text%3E%3C/svg%3E'"
            >
            </div>

            <h2 class="text-lg font-semibold text-slate-900 mb-1 truncate" title="${r.mk || ''}">
            ${r.mk || "—"}
            </h2>

            <p class="text-xs text-slate-500 mb-2 truncate">
            Owned by 
            <strong>${r.or || "—"}</strong>
            </p>

            <p class="text-xs text-slate-500 mb-3 truncate">
            Serial No # 
            <a href="https://tsdr.uspto.gov/#caseNumber=${r.sn}&caseType=SERIAL_NO&searchType=statusSearch" 
                target="_blank" 
                class="inline-flex items-center gap-1 font-bold hover:text-blue-500 transition-colors">
                <span>${r.sn || "—"}</span>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
            </a>
            </p>

            <p class="text-sm text-slate-700 line-clamp-3 mb-3">
            ${r.as || "—"}
            </p>

            <div class="mt-auto pt-3 border-t border-slate-100">
            <div class="flex items-center justify-between text-xs text-slate-500">
                <span>Class <strong>${r.pc || "—"}</strong></span>
                <span>Filed on <strong>${filedDate || "—"}</strong></span>
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
            <div class="h-48 bg-slate-200 rounded-xl mb-4"></div>
            <div class="h-6 bg-slate-200 rounded mb-2"></div>
            <div class="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
            <div class="h-4 bg-slate-200 rounded w-1/2 mb-3"></div>
            <div class="h-16 bg-slate-200 rounded mb-3"></div>
            <div class="h-4 bg-slate-200 rounded"></div>
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

// Run Init
init();