#!/usr/bin/env node
/**
 * OSZ Beatmap Import Tool
 * Extracts .osz files and registers them in beatmaps.json
 *
 * Usage: node add-beatmap.js <path-to-osz-file>
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BEATMAPS_JSON = path.join(__dirname, 'beatmaps.json');
const OSU_DIR = path.join(__dirname, 'Osu');

// Difficulty color mapping based on star rating
const DIFF_COLORS = {
    1: '#4ade80',  // Easy - Green
    2: '#60a5fa',  // Normal - Blue
    3: '#c084fc',  // Hard - Purple
    4: '#f472b6',  // Insane - Pink
    5: '#ef4444',  // Expert - Red
    6: '#ff6b6b',  // Expert+ - Bright Red
};

/**
 * Parse an .osu file and extract metadata
 */
function parseOsuFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').map(l => l.trim());

    const metadata = {
        general: {},
        metadata: {},
        difficulty: {},
        events: {}
    };

    let currentSection = null;

    for (const line of lines) {
        if (line.startsWith('[') && line.endsWith(']')) {
            currentSection = line.slice(1, -1).toLowerCase();
            continue;
        }

        if (!line || line.startsWith('//')) continue;

        // Handle events section separately (no colon format)
        if (currentSection === 'events') {
            // Parse background image (format: 0,0,"filename")
            if (line.startsWith('0,0,"')) {
                const match = line.match(/0,0,"([^"]+)"/);
                if (match) {
                    metadata.events.background = match[1];
                }
            }
            continue;
        }

        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;

        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();

        if (currentSection === 'general') {
            metadata.general[key] = value;
        } else if (currentSection === 'metadata') {
            metadata.metadata[key] = value;
        } else if (currentSection === 'difficulty') {
            metadata.difficulty[key] = parseFloat(value) || value;
        }
    }

    return metadata;
}

/**
 * Estimate star rating from difficulty parameters
 * This is a rough approximation - real star rating requires complex calculations
 */
function estimateStars(difficulty) {
    const hp = difficulty.HPDrainRate || 5;
    const cs = difficulty.CircleSize || 4;
    const od = difficulty.OverallDifficulty || 5;
    const ar = difficulty.ApproachRate || difficulty.OverallDifficulty || 5;

    // Simple weighted average (not accurate, but gives reasonable ordering)
    const avg = (hp + cs + od + ar) / 4;

    if (avg <= 2) return 1;
    if (avg <= 3.5) return 2;
    if (avg <= 5) return 3;
    if (avg <= 6.5) return 4;
    if (avg <= 8) return 5;
    return 6;
}

/**
 * Generate a URL-friendly ID from a string
 */
function generateId(str) {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Load existing beatmaps.json or create empty structure
 */
function loadBeatmaps() {
    if (fs.existsSync(BEATMAPS_JSON)) {
        return JSON.parse(fs.readFileSync(BEATMAPS_JSON, 'utf-8'));
    }
    return { beatmaps: [] };
}

/**
 * Save beatmaps to JSON file
 */
function saveBeatmaps(data) {
    fs.writeFileSync(BEATMAPS_JSON, JSON.stringify(data, null, 2));
}

/**
 * Extract .osz file using unzip command
 */
function extractOsz(oszPath, destDir) {
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    try {
        execFileSync('unzip', ['-o', oszPath, '-d', destDir], { stdio: 'pipe' });
        return true;
    } catch (error) {
        console.error('Error extracting .osz file:', error.message);
        console.error('Make sure "unzip" is installed on your system.');
        return false;
    }
}

/**
 * Main function
 */
function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('OSZ Beatmap Import Tool');
        console.log('Usage: node add-beatmap.js <path-to-osz-file>');
        console.log('');
        console.log('Example: node add-beatmap.js "43812 Daniel Ingram - Winter Wrap Up.osz"');
        process.exit(1);
    }

    const oszPath = path.resolve(args[0]);

    if (!fs.existsSync(oszPath)) {
        console.error(`Error: File not found: ${oszPath}`);
        process.exit(1);
    }

    if (!oszPath.endsWith('.osz')) {
        console.error('Error: File must be an .osz file');
        process.exit(1);
    }

    // Extract beatmap name from filename (remove ID prefix if present)
    const oszName = path.basename(oszPath, '.osz');
    const beatmapName = oszName.replace(/^\d+\s+/, ''); // Remove leading numbers
    const folderName = beatmapName.replace(/[<>:"/\\|?*]/g, ''); // Remove invalid chars

    const destDir = path.join(OSU_DIR, folderName);

    console.log(`Extracting: ${oszName}`);
    console.log(`Destination: ${destDir}`);

    // Extract the .osz file
    if (!extractOsz(oszPath, destDir)) {
        process.exit(1);
    }

    // Find all .osu files in the extracted folder
    const files = fs.readdirSync(destDir);
    const osuFiles = files.filter(f => f.endsWith('.osu'));

    if (osuFiles.length === 0) {
        console.error('Error: No .osu files found in the archive');
        process.exit(1);
    }

    console.log(`Found ${osuFiles.length} difficulty/difficulties`);

    // Parse all .osu files and keep only osu!standard (Mode: 0)
    const parsedDifficulties = osuFiles.map((osuFile) => {
        const osuData = parseOsuFile(path.join(destDir, osuFile));
        const mode = Number(osuData.general.Mode ?? 0);
        return { osuFile, osuData, mode };
    });

    const standardDifficulties = parsedDifficulties.filter(d => d.mode === 0);
    const skippedDifficulties = parsedDifficulties.filter(d => d.mode !== 0);

    if (skippedDifficulties.length > 0) {
        console.log(`Skipping ${skippedDifficulties.length} non-standard difficulty/difficulties (Taiko/Catch/Mania).`);
    }

    if (standardDifficulties.length === 0) {
        console.error('Error: No osu!standard (Mode: 0) difficulties found in this archive.');
        process.exit(1);
    }

    // Use first standard difficulty for shared metadata
    const firstOsu = standardDifficulties[0].osuData;

    // Build difficulty list from standard .osu files only
    const difficulties = [];
    for (const { osuFile, osuData } of standardDifficulties) {
        const stars = estimateStars(osuData.difficulty);

        difficulties.push({
            id: generateId(osuData.metadata.Version || osuFile),
            name: osuData.metadata.Version || path.basename(osuFile, '.osu'),
            file: osuFile,
            stars: stars,
            color: DIFF_COLORS[stars] || DIFF_COLORS[6]
        });
    }

    // Sort difficulties by star rating
    difficulties.sort((a, b) => a.stars - b.stars);

    // Create beatmap entry
    const artist = firstOsu.metadata.Artist || 'Unknown Artist';
    const title = firstOsu.metadata.Title || beatmapName;
    const creator = firstOsu.metadata.Creator || 'Unknown';
    const setId = String(firstOsu.metadata.BeatmapSetID || '').trim();
    const baseId = generateId(`${artist}-${title}`);
    const legacyBeatmapId = generateId(title);
    const beatmapId = /^\d+$/.test(setId) && setId !== '0' && setId !== '-1'
        ? `${baseId}-set-${setId}`
        : `${baseId}-by-${generateId(creator)}`;
    const beatmapEntry = {
        id: beatmapId,
        title,
        artist,
        creator,
        basePath: `Osu/${folderName}/`,
        audioFile: firstOsu.general.AudioFilename || '',
        background: firstOsu.events.background || '',
        difficulties: difficulties
    };

    // Load existing beatmaps and add/update this one
    const beatmapsData = loadBeatmaps();

    // Check if beatmap already exists
    const existingIndex = beatmapsData.beatmaps.findIndex((b) =>
        b.id === beatmapId ||
        (b.id === legacyBeatmapId && b.title === title && b.artist === artist)
    );
    if (existingIndex !== -1) {
        // Keep stable ID for already-registered beatmaps to avoid breaking references.
        beatmapEntry.id = beatmapsData.beatmaps[existingIndex].id;
        beatmapsData.beatmaps[existingIndex] = beatmapEntry;
        console.log(`Updated existing beatmap: ${beatmapEntry.title}`);
    } else {
        beatmapsData.beatmaps.push(beatmapEntry);
        console.log(`Added new beatmap: ${beatmapEntry.title}`);
    }

    // Save beatmaps.json
    saveBeatmaps(beatmapsData);

    console.log('');
    console.log('Beatmap imported successfully!');
    console.log(`  Title: ${beatmapEntry.title}`);
    console.log(`  Artist: ${beatmapEntry.artist}`);
    console.log(`  Creator: ${beatmapEntry.creator}`);
    console.log(`  Difficulties: ${difficulties.map(d => `${d.name} (${d.stars}★)`).join(', ')}`);
}

main();
