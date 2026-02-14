/**
 * Beatmap configuration and data for osu! rhythm game
 * Beatmaps are loaded dynamically from beatmaps.json
 */

// Current selected beatmap config (set when a beatmap is selected)
let BEATMAP_CONFIG = null;

// All available beatmaps (loaded from beatmaps.json)
let ALL_BEATMAPS = [];

/**
 * Load all beatmaps from beatmaps.json
 */
async function loadBeatmapRegistry() {
    try {
        const response = await fetch('beatmaps.json');
        const data = await response.json();
        ALL_BEATMAPS = data.beatmaps || [];

        // Convert difficulties array to object format for compatibility
        ALL_BEATMAPS.forEach(beatmap => {
            if (Array.isArray(beatmap.difficulties)) {
                const diffObj = {};
                beatmap.difficulties.forEach(diff => {
                    diffObj[diff.id] = diff;
                });
                beatmap.difficultiesArray = beatmap.difficulties;
                beatmap.difficulties = diffObj;
            }
        });

        return ALL_BEATMAPS;
    } catch (error) {
        console.error('Failed to load beatmaps.json:', error);
        return [];
    }
}

/**
 * Select a beatmap by ID
 */
function selectBeatmap(beatmapId) {
    const beatmap = ALL_BEATMAPS.find(b => b.id === beatmapId);
    if (beatmap) {
        BEATMAP_CONFIG = beatmap;
        return true;
    }
    return false;
}

/**
 * Get all available beatmaps
 */
function getBeatmaps() {
    return ALL_BEATMAPS;
}

/**
 * Get current selected beatmap
 */
function getCurrentBeatmap() {
    return BEATMAP_CONFIG;
}

/**
 * Skin asset definitions
 */
const SKIN_ASSETS = {
    // Hit circles
    hitcircle: 'hitcircle.png',
    hitcircleoverlay: 'hitcircleoverlay.png',
    approachcircle: 'approachcircle.png',

    // Hit feedback
    hit0: 'hit0.png',
    hit50: 'hit50.png',
    hit100: 'hit100.png',
    hit300: 'hit300.png',

    // Score numbers
    'score-0': 'score-0.png',
    'score-1': 'score-1.png',
    'score-2': 'score-2.png',
    'score-3': 'score-3.png',
    'score-4': 'score-4.png',
    'score-5': 'score-5.png',
    'score-6': 'score-6.png',
    'score-7': 'score-7.png',
    'score-8': 'score-8.png',
    'score-9': 'score-9.png',
    'score-x': 'score-x.png',
    'score-dot': 'score-dot.png',
    'score-percent': 'score-percent.png',

    // Default combo numbers (for on-circle display)
    'default-0': 'default-0.png',
    'default-1': 'default-1.png',
    'default-2': 'default-2.png',
    'default-3': 'default-3.png',
    'default-4': 'default-4.png',
    'default-5': 'default-5.png',
    'default-6': 'default-6.png',
    'default-7': 'default-7.png',
    'default-8': 'default-8.png',
    'default-9': 'default-9.png',

    // Ranking grades
    'ranking-S': 'ranking-S.png',
    'ranking-A': 'ranking-A.png',
    'ranking-B': 'ranking-B.png',
    'ranking-C': 'ranking-C.png',
    'ranking-D': 'ranking-D.png',

    // Slider elements
    'sliderb0': 'sliderb0.png',
    'sliderb1': 'sliderb1.png',
    'sliderb2': 'sliderb2.png',
    'sliderb3': 'sliderb3.png',
    'sliderb4': 'sliderb4.png',
    'sliderb5': 'sliderb5.png',
    'sliderb6': 'sliderb6.png',
    'sliderb7': 'sliderb7.png',
    'sliderb8': 'sliderb8.png',
    'sliderb9': 'sliderb9.png',
    'sliderfollowcircle': 'sliderfollowcircle.png',
    'reversearrow': 'reversearrow.png'
};

/**
 * osu! playfield dimensions (standard)
 */
const OSU_PLAYFIELD = {
    width: 512,
    height: 384
};

/**
 * Default combo colors (from beatmap)
 */
const DEFAULT_COMBO_COLORS = [
    { r: 159, g: 64, b: 255 },   // Purple
    { r: 255, g: 255, b: 64 },   // Yellow
    { r: 255, g: 64, b: 159 },   // Pink
    { r: 255, g: 159, b: 64 }    // Orange
];

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        BEATMAP_CONFIG,
        SKIN_ASSETS,
        OSU_PLAYFIELD,
        DEFAULT_COMBO_COLORS,
        loadBeatmapRegistry,
        selectBeatmap,
        getBeatmaps,
        getCurrentBeatmap
    };
}
