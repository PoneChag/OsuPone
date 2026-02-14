#!/usr/bin/env node
/**
 * OSZ Beatmap Delete Tool
 * Permanently removes a beatmap from beatmaps.json and optionally deletes files
 *
 * Usage: node delete-beatmap.js <beatmap-id> [--files]
 *        node delete-beatmap.js --list
 */

const fs = require('fs');
const path = require('path');

const BEATMAPS_JSON = path.join(__dirname, 'beatmaps.json');
const OSU_ROOT = path.resolve(path.join(__dirname, 'Osu'));

/**
 * Load beatmaps.json
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
 * Recursively delete a directory
 */
function deleteDirectory(dirPath) {
    if (fs.existsSync(dirPath)) {
        fs.readdirSync(dirPath).forEach(file => {
            const curPath = path.join(dirPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteDirectory(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(dirPath);
    }
}

function resolveBeatmapDirectory(basePath) {
    const resolvedPath = path.resolve(path.join(__dirname, basePath));
    const allowedPrefix = OSU_ROOT + path.sep;
    if (resolvedPath.startsWith(allowedPrefix)) {
        return resolvedPath;
    }
    return null;
}

/**
 * List all beatmaps
 */
function listBeatmaps() {
    const data = loadBeatmaps();

    if (data.beatmaps.length === 0) {
        console.log('No beatmaps installed.');
        return;
    }

    console.log('\nInstalled Beatmaps:\n');
    console.log('ID'.padEnd(30) + 'Title'.padEnd(35) + 'Artist');
    console.log('-'.repeat(80));

    for (const beatmap of data.beatmaps) {
        console.log(
            beatmap.id.padEnd(30) +
            beatmap.title.substring(0, 33).padEnd(35) +
            beatmap.artist
        );
    }
    console.log('');
}

/**
 * Delete a beatmap
 */
function deleteBeatmap(beatmapId, deleteFiles) {
    const data = loadBeatmaps();

    const index = data.beatmaps.findIndex(b => b.id === beatmapId);

    if (index === -1) {
        console.error(`Error: Beatmap "${beatmapId}" not found.`);
        console.log('Use --list to see available beatmaps.');
        process.exit(1);
    }

    const beatmap = data.beatmaps[index];

    console.log(`Deleting: ${beatmap.title} by ${beatmap.artist}`);

    // Remove from beatmaps.json
    data.beatmaps.splice(index, 1);
    saveBeatmaps(data);
    console.log('  Removed from beatmaps.json');

    // Optionally delete files
    if (deleteFiles) {
        const beatmapDir = resolveBeatmapDirectory(beatmap.basePath);
        if (!beatmapDir) {
            console.error(`  Refusing to delete unsafe path: ${beatmap.basePath}`);
        } else if (fs.existsSync(beatmapDir)) {
            deleteDirectory(beatmapDir);
            console.log(`  Deleted folder: ${beatmap.basePath}`);
        } else {
            console.log(`  Folder not found: ${beatmap.basePath}`);
        }
    }

    console.log('\nBeatmap deleted successfully!');

    if (!deleteFiles) {
        console.log(`\nNote: Files still exist at ${beatmap.basePath}`);
        console.log('Use --files flag to also delete the beatmap files.');
    }
}

/**
 * Main function
 */
function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log('OSZ Beatmap Delete Tool');
        console.log('');
        console.log('Usage:');
        console.log('  node delete-beatmap.js --list              List all beatmaps');
        console.log('  node delete-beatmap.js <id>                Remove from registry only');
        console.log('  node delete-beatmap.js <id> --files        Remove and delete files');
        console.log('');
        console.log('Examples:');
        console.log('  node delete-beatmap.js --list');
        console.log('  node delete-beatmap.js winter-wrap-up');
        console.log('  node delete-beatmap.js winter-wrap-up --files');
        process.exit(0);
    }

    if (args.includes('--list') || args.includes('-l')) {
        listBeatmaps();
        process.exit(0);
    }

    const beatmapId = args[0];
    const deleteFiles = args.includes('--files') || args.includes('-f');

    deleteBeatmap(beatmapId, deleteFiles);
}

main();
