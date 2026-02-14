/**
 * osu! Rhythm Game Engine
 * Core game logic for osu!standard circles + sliders gameplay
 */

// Game States
const GameState = {
    SONG_SELECT: 0,
    MENU: 1,
    LOADING: 2,
    COUNTDOWN: 3,
    PLAYING: 4,
    PAUSED: 5,
    RESULTS: 6
};

// Hit States
const HitState = {
    PENDING: 0,
    ACTIVE: 1,
    HIT_300: 2,
    HIT_100: 3,
    HIT_50: 4,
    MISS: 5,
    SLIDING: 6  // Currently tracking a slider
};

/**
 * Main Game Class
 */
class OsuGame {
    constructor() {
        // Canvas setup
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Game state
        this.currentState = GameState.SONG_SELECT;
        this.selectedBeatmap = null;
        this.selectedDifficulty = null;
        this.beatmap = null;
        this.nextObjectIndex = 0;

        // Audio
        this.audio = null;
        this.audioContext = null;

        // Timing
        this.lastTimestamp = 0;
        this.deltaTime = 0;
        this.gameStartTime = 0;

        // Stats
        this.stats = this.createEmptyStats();

        // Assets
        this.assets = {};
        this.assetsLoaded = false;

        // Hit objects
        this.hitObjects = [];
        this.activeObjects = [];
        this.hitFeedback = [];

        // Cursor tracking
        this.cursorX = 0;
        this.cursorY = 0;
        this.lastTouchTime = 0;

        // Mouse/key state for sliders
        this.mouseDown = false;
        this.keyDown = false;

        // UI elements
        this.songSelectEl = document.getElementById('song-select');
        this.menuEl = document.getElementById('menu');
        this.loadingEl = document.getElementById('loading');
        this.countdownEl = document.getElementById('countdown');
        this.pauseEl = document.getElementById('pause');
        this.resultsEl = document.getElementById('results');
        this.loadingFill = document.querySelector('.loading-fill');

        // Messaging context for secure parent communication
        const urlParams = new URLSearchParams(window.location.search);
        this.gameSessionId = urlParams.get('gameId') || '';
        this.parentOrigin = this.parseOrigin(urlParams.get('parentOrigin'));

        // Initialize
        this.setupCanvas();
        this.setupEventListeners();
        this.gameLoop = this.gameLoop.bind(this);
        requestAnimationFrame(this.gameLoop);

        // Load beatmaps and show song selection
        this.initializeBeatmaps();
    }

    async initializeBeatmaps() {
        try {
            await loadBeatmapRegistry();

            // Check for song parameter in URL
            const urlParams = new URLSearchParams(window.location.search);
            const requestedSong = urlParams.get('song');

            if (requestedSong) {
                // Try to auto-select the requested beatmap
                if (selectBeatmap(requestedSong)) {
                    this.selectedBeatmap = getCurrentBeatmap();
                    this.populateDifficultyMenu();
                    this.showOverlay('menu');
                    return;
                } else {
                    console.warn(`Beatmap "${requestedSong}" not found, showing song select`);
                }
            }

            this.populateSongSelect();
        } catch (error) {
            console.error('Failed to load beatmaps:', error);
        }
    }

    getHiddenBeatmaps() {
        try {
            return JSON.parse(localStorage.getItem('osu_hidden_beatmaps') || '[]');
        } catch {
            return [];
        }
    }

    setHiddenBeatmaps(hidden) {
        localStorage.setItem('osu_hidden_beatmaps', JSON.stringify(hidden));
    }

    populateSongSelect() {
        const beatmapList = document.getElementById('beatmap-list');
        const beatmaps = getBeatmaps();
        const hiddenBeatmaps = this.getHiddenBeatmaps();

        beatmapList.textContent = '';

        // Filter out hidden beatmaps
        const visibleBeatmaps = beatmaps.filter(b => !hiddenBeatmaps.includes(b.id));

        if (visibleBeatmaps.length === 0) {
            const emptyEl = document.createElement('p');
            emptyEl.style.color = '#888';
            emptyEl.textContent = 'No beatmaps found. Use add-beatmap.js to import .osz files.';
            beatmapList.appendChild(emptyEl);
            return;
        }

        for (const beatmap of visibleBeatmaps) {
            const card = document.createElement('div');
            card.className = 'beatmap-card';
            card.dataset.beatmapId = beatmap.id;

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'beatmap-delete';
            deleteBtn.title = 'Delete beatmap';
            deleteBtn.textContent = '\u00d7';
            card.appendChild(deleteBtn);

            const thumbnail = document.createElement('img');
            thumbnail.className = 'beatmap-thumbnail';
            thumbnail.src = `${beatmap.basePath}${beatmap.background}`;
            thumbnail.alt = '';
            thumbnail.onerror = () => {
                thumbnail.style.display = 'none';
            };
            card.appendChild(thumbnail);

            const info = document.createElement('div');
            info.className = 'beatmap-info';

            const title = document.createElement('div');
            title.className = 'beatmap-title';
            title.textContent = beatmap.title;
            info.appendChild(title);

            const artist = document.createElement('div');
            artist.className = 'beatmap-artist';
            artist.textContent = `by ${beatmap.artist}`;
            info.appendChild(artist);

            const meta = document.createElement('div');
            meta.className = 'beatmap-meta';

            const creator = document.createElement('span');
            creator.className = 'beatmap-creator';
            creator.textContent = `Mapped by ${beatmap.creator}`;
            meta.appendChild(creator);

            const diffs = document.createElement('div');
            diffs.className = 'beatmap-diffs';
            const difficulties = beatmap.difficultiesArray || Object.values(beatmap.difficulties);
            for (const diff of difficulties) {
                const dot = document.createElement('span');
                dot.className = 'diff-dot';
                dot.style.background = this.normalizeHexColor(diff.color);
                dot.title = diff.name;
                diffs.appendChild(dot);
            }
            meta.appendChild(diffs);

            info.appendChild(meta);
            card.appendChild(info);

            // Delete button click
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showDeleteConfirm(beatmap);
            });

            card.addEventListener('click', () => this.selectSong(beatmap.id));
            beatmapList.appendChild(card);
        }
    }

    showDeleteConfirm(beatmap) {
        // Create confirmation dialog
        const dialog = document.createElement('div');
        dialog.className = 'confirm-dialog';

        const content = document.createElement('div');
        content.className = 'confirm-content';

        const title = document.createElement('h3');
        title.textContent = 'Delete Beatmap?';
        content.appendChild(title);

        const message = document.createElement('p');
        const before = document.createTextNode('Hide "');
        const strong = document.createElement('strong');
        strong.textContent = beatmap.title;
        const after = document.createTextNode('" from the song list?');
        const br = document.createElement('br');
        const note = document.createElement('small');
        note.textContent = '(Use delete-beatmap.js to permanently remove files)';
        message.appendChild(before);
        message.appendChild(strong);
        message.appendChild(after);
        message.appendChild(br);
        message.appendChild(note);
        content.appendChild(message);

        const buttons = document.createElement('div');
        buttons.className = 'confirm-buttons';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn-confirm-cancel';
        cancelBtn.textContent = 'Cancel';
        buttons.appendChild(cancelBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-confirm-delete';
        deleteBtn.textContent = 'Delete';
        buttons.appendChild(deleteBtn);

        content.appendChild(buttons);
        dialog.appendChild(content);

        document.body.appendChild(dialog);

        // Button handlers
        cancelBtn.addEventListener('click', () => {
            dialog.remove();
        });

        deleteBtn.addEventListener('click', () => {
            this.deleteBeatmap(beatmap.id);
            dialog.remove();
        });

        // Click outside to cancel
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                dialog.remove();
            }
        });
    }

    deleteBeatmap(beatmapId) {
        const hidden = this.getHiddenBeatmaps();
        if (!hidden.includes(beatmapId)) {
            hidden.push(beatmapId);
            this.setHiddenBeatmaps(hidden);
        }
        this.populateSongSelect();
    }

    selectSong(beatmapId) {
        if (selectBeatmap(beatmapId)) {
            this.selectedBeatmap = getCurrentBeatmap();
            this.populateDifficultyMenu();
            this.showOverlay('menu');
        }
    }

    populateDifficultyMenu() {
        if (!this.selectedBeatmap) return;

        // Update title and artist
        document.getElementById('menu-title').textContent = this.selectedBeatmap.title;
        document.getElementById('menu-artist').textContent = `by ${this.selectedBeatmap.artist}`;

        // Populate difficulty buttons
        const container = document.getElementById('difficulty-buttons');
        container.textContent = '';

        const difficulties = this.selectedBeatmap.difficultiesArray || Object.values(this.selectedBeatmap.difficulties);

        for (const diff of difficulties) {
            const btn = document.createElement('button');
            btn.className = 'diff-btn';
            btn.dataset.diff = diff.id;
            const diffColor = this.normalizeHexColor(diff.color);
            btn.style.background = `linear-gradient(135deg, ${diffColor}, ${this.darkenColor(diffColor)})`;

            const stars = '★'.repeat(Math.min(diff.stars, 10));

            const starsEl = document.createElement('span');
            starsEl.className = 'stars';
            starsEl.textContent = stars;

            const nameEl = document.createElement('span');
            nameEl.className = 'name';
            nameEl.textContent = diff.name;

            btn.appendChild(starsEl);
            btn.appendChild(nameEl);

            btn.addEventListener('click', () => this.selectDifficulty(diff.id));
            container.appendChild(btn);
        }
    }

    parseOrigin(rawOrigin) {
        if (!rawOrigin) return null;
        try {
            return new URL(rawOrigin).origin;
        } catch {
            return null;
        }
    }

    normalizeHexColor(color, fallback = '#888888') {
        if (typeof color !== 'string') return fallback;
        const trimmed = color.trim();

        if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
            return trimmed;
        }

        if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
            const [r, g, b] = trimmed.slice(1).split('');
            return `#${r}${r}${g}${g}${b}${b}`;
        }

        return fallback;
    }

    darkenColor(hex) {
        // Darken a hex color by 20%
        const safeHex = this.normalizeHexColor(hex);
        const num = parseInt(safeHex.slice(1), 16);
        const r = Math.max(0, (num >> 16) - 40);
        const g = Math.max(0, ((num >> 8) & 0x00FF) - 40);
        const b = Math.max(0, (num & 0x0000FF) - 40);
        return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
    }

    backToSongSelect() {
        this.currentState = GameState.SONG_SELECT;
        this.showOverlay('song-select');
    }

    createEmptyStats() {
        return {
            score: 0,
            combo: 0,
            maxCombo: 0,
            hit300: 0,
            hit100: 0,
            hit50: 0,
            misses: 0,
            health: 100,
            failed: false
        };
    }

    setupCanvas() {
        // Set canvas size
        const container = document.getElementById('game-container');
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;

        // Maintain 4:3 aspect ratio for osu! playfield
        const aspectRatio = 4 / 3;
        let width, height;

        if (containerWidth / containerHeight > aspectRatio) {
            height = containerHeight;
            width = height * aspectRatio;
        } else {
            width = containerWidth;
            height = width / aspectRatio;
        }

        // Account for device pixel ratio
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        this.ctx.scale(dpr, dpr);

        this.gameWidth = width;
        this.gameHeight = height;

        // Calculate playfield scaling
        this.calculatePlayfieldScale();
    }

    calculatePlayfieldScale() {
        // osu! playfield is 512x384, we need to fit it in the canvas with padding
        const padding = 50;
        const availableWidth = this.gameWidth - padding * 2;
        const availableHeight = this.gameHeight - padding * 2;

        const scaleX = availableWidth / OSU_PLAYFIELD.width;
        const scaleY = availableHeight / OSU_PLAYFIELD.height;
        this.playfieldScale = Math.min(scaleX, scaleY);

        this.playfieldOffsetX = (this.gameWidth - OSU_PLAYFIELD.width * this.playfieldScale) / 2;
        this.playfieldOffsetY = (this.gameHeight - OSU_PLAYFIELD.height * this.playfieldScale) / 2;
    }

    osuToCanvas(osuX, osuY) {
        return {
            x: osuX * this.playfieldScale + this.playfieldOffsetX,
            y: osuY * this.playfieldScale + this.playfieldOffsetY
        };
    }

    canvasToOsu(canvasX, canvasY) {
        return {
            x: (canvasX - this.playfieldOffsetX) / this.playfieldScale,
            y: (canvasY - this.playfieldOffsetY) / this.playfieldScale
        };
    }

    setupEventListeners() {
        // Window resize
        window.addEventListener('resize', () => {
            this.setupCanvas();
        });

        // Back to song select button
        document.getElementById('btn-back-to-songs').addEventListener('click', () => this.backToSongSelect());

        // Pause menu buttons
        document.getElementById('btn-resume').addEventListener('click', () => this.resumeGame());
        document.getElementById('btn-retry').addEventListener('click', () => this.retryGame());
        document.getElementById('btn-quit').addEventListener('click', () => this.quitToMenu());

        // Results continue button
        document.getElementById('btn-continue').addEventListener('click', () => this.sendResultsAndClose());

        this.canvas.addEventListener('mousedown', (e) => {
            // Ignore synthetic mouse events fired right after touch on some mobile browsers.
            if (Date.now() - this.lastTouchTime < 700) return;
            this.mouseDown = true;
            this.handleClick(e);
        });
        this.canvas.addEventListener('mouseup', () => {
            this.mouseDown = false;
        });
        this.canvas.addEventListener('mouseleave', () => {
            this.mouseDown = false;
        });

        // Touch support
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.lastTouchTime = Date.now();
            this.mouseDown = true;
            for (const touch of e.touches) {
                this.handleTouch(touch);
            }
        }, { passive: false });
        this.canvas.addEventListener('touchend', (e) => {
            this.lastTouchTime = Date.now();
            this.mouseDown = e.touches.length > 0;
            if (e.touches.length > 0) {
                const rect = this.canvas.getBoundingClientRect();
                this.cursorX = e.touches[0].clientX - rect.left;
                this.cursorY = e.touches[0].clientY - rect.top;
            }
        }, { passive: false });
        this.canvas.addEventListener('touchcancel', (e) => {
            this.lastTouchTime = Date.now();
            this.mouseDown = e.touches.length > 0;
        }, { passive: false });

        // Cursor tracking
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.cursorX = e.clientX - rect.left;
            this.cursorY = e.clientY - rect.top;
        });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.lastTouchTime = Date.now();
            if (e.touches.length > 0) {
                const rect = this.canvas.getBoundingClientRect();
                this.cursorX = e.touches[0].clientX - rect.left;
                this.cursorY = e.touches[0].clientY - rect.top;
            }
        }, { passive: false });

        // Keyboard
        window.addEventListener('keydown', (e) => this.handleKeydown(e));
        window.addEventListener('keyup', (e) => this.handleKeyup(e));
    }

    handleClick(e) {
        if (this.currentState !== GameState.PLAYING) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        this.processHitAtPosition(x, y);
    }

    handleTouch(touch) {
        if (this.currentState !== GameState.PLAYING) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        this.processHitAtPosition(x, y);
    }

    handleKeydown(e) {
        // Z, X, or Space to hit (using cursor position)
        if (e.key === 'z' || e.key === 'x' || e.key === ' ') {
            if (this.currentState === GameState.PLAYING) {
                e.preventDefault();
                this.keyDown = true;
                this.processHitAtPosition(this.cursorX, this.cursorY);
            }
        }

        // Escape to pause/unpause
        if (e.key === 'Escape') {
            if (this.currentState === GameState.PLAYING) {
                this.pauseGame();
            } else if (this.currentState === GameState.PAUSED) {
                this.resumeGame();
            }
        }
    }

    handleKeyup(e) {
        if (e.key === 'z' || e.key === 'x' || e.key === ' ') {
            this.keyDown = false;
        }
    }

    isHoldingInput() {
        return this.mouseDown || this.keyDown;
    }

    removeActiveObject(hitObject) {
        const index = this.activeObjects.indexOf(hitObject);
        if (index !== -1) {
            this.activeObjects.splice(index, 1);
        }
    }

    getComboColor(obj) {
        const palette = this.beatmap?.colours?.length ? this.beatmap.colours : DEFAULT_COMBO_COLORS;
        const colorIndex = obj.comboColorIndex % palette.length;
        return palette[colorIndex];
    }

    processHitAtPosition(canvasX, canvasY) {
        if (!this.audio || !this.beatmap) return;

        const currentTime = this.audio.currentTime * 1000;
        const windows = OsuParser.getHitWindows(this.beatmap.difficulty.overallDifficulty);
        const circleRadius = OsuParser.getCircleRadius(this.beatmap.difficulty.circleSize);

        // Convert canvas position to osu coordinates
        const osuPos = this.canvasToOsu(canvasX, canvasY);

        // Check active objects from oldest to newest
        for (let i = 0; i < this.activeObjects.length; i++) {
            const obj = this.activeObjects[i];
            if (obj.state !== HitState.ACTIVE) continue;

            const hitOffset = currentTime - obj.time;

            // Check if within any hit window
            if (Math.abs(hitOffset) > windows.hit50) continue;

            // Check position
            const distance = Math.hypot(osuPos.x - obj.x, osuPos.y - obj.y);

            if (distance <= circleRadius * 1.2) { // Slight leniency
                // Determine hit quality
                const absOffset = Math.abs(hitOffset);
                let hitValue;

                if (absOffset <= windows.hit300) {
                    hitValue = 300;
                } else if (absOffset <= windows.hit100) {
                    hitValue = 100;
                } else {
                    hitValue = 50;
                }

                // Handle differently for circles vs sliders
                if (obj.type === 'slider') {
                    // Start slider tracking
                    this.startSlider(obj, hitValue);
                } else {
                    // Circle hit
                    if (hitValue === 300) obj.state = HitState.HIT_300;
                    else if (hitValue === 100) obj.state = HitState.HIT_100;
                    else obj.state = HitState.HIT_50;
                    this.processHit(obj, hitValue);
                }
                return;
            }
        }
    }

    /**
     * Start tracking a slider
     */
    startSlider(slider, startHitValue) {
        slider.state = HitState.SLIDING;
        slider.tracking = true;
        slider.trackingBroken = false;
        slider.startHitValue = startHitValue;

        // Award initial hit score (reduced for slider)
        const baseScore = Math.floor(startHitValue / 3);
        this.stats.score += baseScore;
        this.stats.combo++;
        this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stats.combo);

        // Add feedback at start
        this.hitFeedback.push({
            x: slider.x,
            y: slider.y,
            type: startHitValue,
            age: 0,
            duration: 200
        });
    }

    processHit(hitObject, hitValue) {
        // Update stats
        if (hitValue === 300) this.stats.hit300++;
        else if (hitValue === 100) this.stats.hit100++;
        else this.stats.hit50++;

        this.stats.combo++;
        this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stats.combo);

        // Calculate score
        const multiplier = this.getDifficultyMultiplier();
        this.stats.score += hitValue + Math.floor(hitValue * this.stats.combo * multiplier * 0.01);

        // Health recovery
        this.stats.health = Math.min(100, this.stats.health + (hitValue / 50));

        // Remove from active objects
        this.removeActiveObject(hitObject);

        // Add hit feedback
        this.hitFeedback.push({
            x: hitObject.x,
            y: hitObject.y,
            type: hitValue,
            age: 0,
            duration: 400
        });
    }

    processMiss(hitObject) {
        hitObject.state = HitState.MISS;
        this.stats.misses++;
        this.stats.combo = 0;

        // Health penalty
        this.stats.health = Math.max(0, this.stats.health - 8);

        // Remove from active
        this.removeActiveObject(hitObject);

        // Add miss feedback
        this.hitFeedback.push({
            x: hitObject.x,
            y: hitObject.y,
            type: 0,
            age: 0,
            duration: 400
        });
    }

    getDifficultyMultiplier() {
        if (!this.beatmap) return 1;
        const d = this.beatmap.difficulty;
        return Math.round((d.hpDrainRate + d.circleSize + d.overallDifficulty) / 3);
    }

    // =========================================
    // Game State Management
    // =========================================

    async selectDifficulty(diffId) {
        this.selectedDifficulty = diffId;
        this.showOverlay('loading');

        try {
            await this.loadBeatmap(diffId);
            await this.loadAssets();
            await this.loadAudio();

            this.startCountdown();
        } catch (error) {
            console.error('Failed to load game:', error);
            alert('Failed to load game: ' + error.message);
            this.showOverlay('menu');
        }
    }

    async loadBeatmap(diffId) {
        const beatmapConfig = getCurrentBeatmap();
        const config = beatmapConfig.difficulties[diffId];
        const url = beatmapConfig.basePath + config.file;

        this.updateLoadingProgress(10);

        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to load beatmap file');

        const content = await response.text();
        this.beatmap = OsuParser.parse(content);
        this.beatmap.config = config;

        // Reset hit objects and initialize slider properties
        this.hitObjects = this.beatmap.hitObjects.map(obj => {
            const baseObj = {
                ...obj,
                state: HitState.PENDING
            };

            // Initialize slider-specific properties
            if (obj.type === 'slider') {
                // Get beat length at slider time
                const beatLength = this.getBeatLengthAtTime(obj.time);
                const sliderMultiplier = this.beatmap.difficulty.sliderMultiplier;

                // Generate curve points
                baseObj.curvePoints = OsuParser.generateCurve(
                    obj.curveType,
                    obj.x,
                    obj.y,
                    obj.controlPoints,
                    obj.length,
                    100 // resolution
                );

                // Calculate duration for one slide
                baseObj.slideDuration = OsuParser.getSliderDuration(
                    obj.length,
                    beatLength,
                    sliderMultiplier
                );

                // Total duration including repeats
                baseObj.totalDuration = baseObj.slideDuration * obj.slides;

                // Calculate end position
                if (baseObj.curvePoints.length > 0) {
                    const endPoint = baseObj.curvePoints[baseObj.curvePoints.length - 1];
                    baseObj.endX = endPoint.x;
                    baseObj.endY = endPoint.y;
                } else {
                    baseObj.endX = obj.x;
                    baseObj.endY = obj.y;
                }

                // Slider tracking state
                baseObj.tracking = false;
                baseObj.trackingBroken = false;
                baseObj.ticksHit = 0;
                const sliderTickRate = this.beatmap.difficulty.sliderTickRate || 1;
                const beatsPerSlide = obj.length / (sliderMultiplier * 100);
                baseObj.ticksPerSlide = Math.max(0, Math.ceil(beatsPerSlide * sliderTickRate) - 1);
                baseObj.totalTicks = baseObj.ticksPerSlide * obj.slides;
                baseObj.tickSpacing = baseObj.ticksPerSlide > 0
                    ? baseObj.slideDuration / (baseObj.ticksPerSlide + 1)
                    : 0;

                // End hit
                baseObj.endHit = false;
            }

            return baseObj;
        });
        this.hitObjects.sort((a, b) => a.time - b.time);
        this.activeObjects = [];
        this.nextObjectIndex = 0;

        this.updateLoadingProgress(30);
    }

    /**
     * Get beat length at a specific time (for slider duration calculation)
     */
    getBeatLengthAtTime(time) {
        if (!this.beatmap || !this.beatmap.timingPoints) return 500; // Default

        let beatLength = 500; // Default BPM ~120
        let currentMultiplier = 1;

        for (const tp of this.beatmap.timingPoints) {
            if (tp.offset > time) break;

            if (!tp.inherited) {
                // Uninherited timing point - sets base BPM
                beatLength = tp.msPerBeat;
            } else {
                // Inherited timing point - sets slider velocity
                currentMultiplier = -100 / tp.msPerBeat;
            }
        }

        return beatLength / currentMultiplier;
    }

    async loadAssets() {
        const beatmapConfig = getCurrentBeatmap();
        const basePath = beatmapConfig.basePath;
        const fallbackPath = 'Osu/Flutterwonder/'; // Default skin fallback
        const totalAssets = Object.keys(SKIN_ASSETS).length;
        let loadedCount = 0;

        const loadPromises = Object.entries(SKIN_ASSETS).map(([key, filename]) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    this.assets[key] = img;
                    loadedCount++;
                    this.updateLoadingProgress(30 + (loadedCount / totalAssets) * 40);
                    resolve();
                };
                img.onerror = () => {
                    // Try fallback skin path
                    const fallbackImg = new Image();
                    fallbackImg.onload = () => {
                        this.assets[key] = fallbackImg;
                        loadedCount++;
                        this.updateLoadingProgress(30 + (loadedCount / totalAssets) * 40);
                        resolve();
                    };
                    fallbackImg.onerror = () => {
                        console.warn(`Failed to load asset: ${filename}`);
                        loadedCount++;
                        this.updateLoadingProgress(30 + (loadedCount / totalAssets) * 40);
                        resolve(); // Continue even if asset fails
                    };
                    fallbackImg.src = fallbackPath + filename;
                };
                img.src = basePath + filename;
            });
        });

        // Also load background from beatmap
        if (beatmapConfig.background) {
            const bgPromise = new Promise((resolve) => {
                const bgImg = new Image();
                bgImg.onload = () => {
                    this.assets.background = bgImg;
                    resolve();
                };
                bgImg.onerror = () => {
                    // Try fallback
                    const fallbackBg = new Image();
                    fallbackBg.onload = () => {
                        this.assets.background = fallbackBg;
                        resolve();
                    };
                    fallbackBg.onerror = () => resolve();
                    fallbackBg.src = fallbackPath + 'flutterwonder.jpg';
                };
                bgImg.src = basePath + beatmapConfig.background;
            });
            loadPromises.push(bgPromise);
        }

        await Promise.all(loadPromises);
        this.assetsLoaded = true;
    }

    async loadAudio() {
        this.updateLoadingProgress(75);
        const beatmapConfig = getCurrentBeatmap();

        return new Promise((resolve, reject) => {
            this.audio = new Audio();
            this.audio.src = beatmapConfig.basePath + beatmapConfig.audioFile;

            this.audio.addEventListener('canplaythrough', () => {
                this.updateLoadingProgress(100);
                resolve();
            }, { once: true });

            this.audio.addEventListener('error', (e) => {
                reject(new Error('Failed to load audio'));
            }, { once: true });

            this.audio.load();
        });
    }

    updateLoadingProgress(percent) {
        if (this.loadingFill) {
            this.loadingFill.style.width = percent + '%';
        }
    }

    startCountdown() {
        if (this.endTimer) {
            clearTimeout(this.endTimer);
            this.endTimer = null;
        }
        this.stats = this.createEmptyStats();
        this.hitObjects.forEach(obj => obj.state = HitState.PENDING);
        this.activeObjects = [];
        this.nextObjectIndex = 0;
        this.hitFeedback = [];

        this.currentState = GameState.COUNTDOWN;
        this.showOverlay('countdown');

        const countdownEl = document.querySelector('.countdown-number');
        let count = 3;

        const countdownInterval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownEl.textContent = count;
            } else {
                clearInterval(countdownInterval);
                this.startPlaying();
            }
        }, 1000);
    }

    startPlaying() {
        this.currentState = GameState.PLAYING;
        this.hideAllOverlays();

        this.audio.currentTime = 0;
        this.audio.play();

        // Listen for song end
        this.audio.addEventListener('ended', () => {
            if (this.currentState === GameState.PLAYING) {
                this.showResults();
            }
        }, { once: true });
    }

    pauseGame() {
        if (this.currentState !== GameState.PLAYING) return;

        this.currentState = GameState.PAUSED;
        this.audio.pause();
        this.showOverlay('pause');
    }

    resumeGame() {
        if (this.currentState !== GameState.PAUSED) return;

        this.hideAllOverlays();
        this.currentState = GameState.PLAYING;
        this.audio.play();
    }

    retryGame() {
        this.hideAllOverlays();
        this.audio.pause();
        this.audio.currentTime = 0;
        this.startCountdown();
    }

    quitToMenu() {
        if (this.endTimer) {
            clearTimeout(this.endTimer);
            this.endTimer = null;
        }
        this.currentState = GameState.SONG_SELECT;
        if (this.audio) {
            this.audio.pause();
            this.audio.currentTime = 0;
        }
        this.showOverlay('song-select');
    }

    showResults() {
        this.currentState = GameState.RESULTS;

        const accuracy = this.calculateAccuracy();
        const grade = this.calculateGrade();

        // Update results UI
        document.getElementById('result-score').textContent = Math.floor(this.stats.score).toLocaleString();
        document.getElementById('result-accuracy').textContent = accuracy.toFixed(2) + '%';
        document.getElementById('result-combo').textContent = this.stats.maxCombo + 'x';
        document.getElementById('result-300').textContent = this.stats.hit300;
        document.getElementById('result-100').textContent = this.stats.hit100;
        document.getElementById('result-50').textContent = this.stats.hit50;
        document.getElementById('result-miss').textContent = this.stats.misses;

        // Show grade image or failure
        const gradeDisplay = document.getElementById('grade-display');
        gradeDisplay.textContent = '';

        const beatmapConfig = getCurrentBeatmap();
        if (this.stats.failed) {
            // Show FAILED message
            const failedEl = document.createElement('div');
            failedEl.className = 'failed-text';
            failedEl.textContent = 'FAILED';
            gradeDisplay.appendChild(failedEl);
        } else if (this.assets['ranking-' + grade]) {
            const gradeImg = document.createElement('img');
            gradeImg.src = `${beatmapConfig.basePath}ranking-${grade}.png`;
            gradeImg.alt = `Grade ${grade}`;
            gradeDisplay.appendChild(gradeImg);
        } else {
            const gradeText = document.createElement('span');
            gradeText.style.fontSize = '5rem';
            gradeText.style.color = '#fff';
            gradeText.textContent = grade;
            gradeDisplay.appendChild(gradeText);
        }

        // Full combo indicator (only if not failed)
        if (this.stats.misses === 0 && !this.stats.failed) {
            const fcEl = document.createElement('div');
            fcEl.className = 'full-combo';
            fcEl.textContent = 'FULL COMBO!';
            gradeDisplay.appendChild(fcEl);
        }

        this.showOverlay('results');
    }

    calculateAccuracy() {
        const total = this.stats.hit300 + this.stats.hit100 + this.stats.hit50 + this.stats.misses;
        if (total === 0) return 100;

        const weighted = this.stats.hit300 * 300 + this.stats.hit100 * 100 + this.stats.hit50 * 50;
        return (weighted / (total * 300)) * 100;
    }

    calculateGrade() {
        const total = this.stats.hit300 + this.stats.hit100 + this.stats.hit50 + this.stats.misses;
        if (total === 0) return 'D';

        const accuracy = this.calculateAccuracy();
        const ratio300 = this.stats.hit300 / total;
        const ratio50 = this.stats.hit50 / total;

        if (accuracy === 100) return 'S'; // Using S instead of SS for simplicity
        if (ratio300 > 0.9 && ratio50 < 0.01 && this.stats.misses === 0) return 'S';
        if ((ratio300 > 0.8 && this.stats.misses === 0) || ratio300 > 0.9) return 'A';
        if ((ratio300 > 0.7 && this.stats.misses === 0) || ratio300 > 0.8) return 'B';
        if (ratio300 > 0.6) return 'C';
        return 'D';
    }

    sendResultsAndClose() {
        // Send results to parent window (SillyTavern)
        if (window.parent && window.parent !== window) {
            const beatmapConfig = getCurrentBeatmap();
            const payload = {
                type: 'osuComplete',
                gameId: this.gameSessionId,
                data: {
                    songTitle: beatmapConfig.title,
                    songArtist: beatmapConfig.artist,
                    difficulty: this.beatmap.config.name,
                    score: Math.floor(this.stats.score),
                    accuracy: this.calculateAccuracy().toFixed(2),
                    grade: this.stats.failed ? 'F' : this.calculateGrade(),
                    maxCombo: this.stats.maxCombo,
                    hit300: this.stats.hit300,
                    hit100: this.stats.hit100,
                    hit50: this.stats.hit50,
                    misses: this.stats.misses,
                    fullCombo: this.stats.misses === 0 && !this.stats.failed,
                    failed: this.stats.failed
                }
            };

            const targetOrigin = this.parentOrigin || window.location.origin;
            window.parent.postMessage(payload, targetOrigin);
        }

        // Return to menu
        this.quitToMenu();
    }

    // =========================================
    // Overlay Management
    // =========================================

    showOverlay(name) {
        this.hideAllOverlays();
        const el = document.getElementById(name);
        if (el) el.classList.remove('hidden');
    }

    hideAllOverlays() {
        [this.songSelectEl, this.menuEl, this.loadingEl, this.countdownEl, this.pauseEl, this.resultsEl].forEach(el => {
            if (el) el.classList.add('hidden');
        });
    }

    // =========================================
    // Game Loop
    // =========================================

    gameLoop(timestamp) {
        // Calculate delta time
        if (!this.lastTimestamp) this.lastTimestamp = timestamp;
        this.deltaTime = (timestamp - this.lastTimestamp) / 16.67; // Normalize to ~60fps
        this.lastTimestamp = timestamp;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.gameWidth, this.gameHeight);

        // Update and render based on state
        switch (this.currentState) {
            case GameState.PLAYING:
                this.update();
                this.render();
                break;

            case GameState.PAUSED:
                this.render(); // Still render but don't update
                break;

            case GameState.SONG_SELECT:
            case GameState.MENU:
            case GameState.LOADING:
            case GameState.COUNTDOWN:
                this.renderBackground();
                break;

            case GameState.RESULTS:
                this.renderBackground();
                break;
        }

        requestAnimationFrame(this.gameLoop);
    }

    update() {
        if (!this.audio || !this.beatmap) return;

        const currentTime = this.audio.currentTime * 1000;
        const approachTime = OsuParser.getApproachTime(this.beatmap.difficulty.approachRate);
        const hitWindows = OsuParser.getHitWindows(this.beatmap.difficulty.overallDifficulty);
        const circleRadius = OsuParser.getCircleRadius(this.beatmap.difficulty.circleSize);

        // Activate objects that should now be visible
        while (this.nextObjectIndex < this.hitObjects.length) {
            const obj = this.hitObjects[this.nextObjectIndex];
            if (obj.state !== HitState.PENDING) {
                this.nextObjectIndex++;
                continue;
            }
            if (obj.time - currentTime <= approachTime) {
                obj.state = HitState.ACTIVE;
                this.activeObjects.push(obj);
                this.nextObjectIndex++;
                continue;
            }
            break;
        }

        // Check for misses (circles past their hit window)
        for (let i = this.activeObjects.length - 1; i >= 0; i--) {
            const obj = this.activeObjects[i];
            if (obj.state === HitState.ACTIVE) {
                if (obj.type === 'slider') {
                    // Sliders that weren't started in time
                    if (currentTime > obj.time + hitWindows.hit50) {
                        this.processSliderMiss(obj);
                    }
                } else {
                    // Circle miss
                    if (currentTime > obj.time + hitWindows.hit50) {
                        this.processMiss(obj);
                    }
                }
            }
        }

        // Update active sliders
        this.updateSliders(currentTime, circleRadius);

        // Check for failure (health reached 0)
        if (this.stats.health <= 0 && !this.stats.failed) {
            this.stats.failed = true;
            this.audio.pause();
            this.showResults();
            return;
        }

        // Update hit feedback
        this.hitFeedback = this.hitFeedback.filter(fb => {
            fb.age += this.deltaTime * 16.67;
            return fb.age < fb.duration;
        });

        // Check if song ended naturally (all objects processed)
        const allProcessed = this.nextObjectIndex >= this.hitObjects.length && this.activeObjects.length === 0;
        if (allProcessed && this.hitObjects.length > 0 && this.audio.currentTime > 0) {
            // Small delay before showing results
            if (!this.endTimer) {
                this.endTimer = setTimeout(() => {
                    if (this.currentState === GameState.PLAYING) {
                        this.showResults();
                    }
                    this.endTimer = null;
                }, 1000);
            }
        }
    }

    /**
     * Update all active sliders
     */
    updateSliders(currentTime, circleRadius) {
        const osuPos = this.canvasToOsu(this.cursorX, this.cursorY);
        const followRadius = circleRadius * 2.4; // Follow circle is larger than hit circle

        for (let i = this.activeObjects.length - 1; i >= 0; i--) {
            const obj = this.activeObjects[i];
            if (obj.state !== HitState.SLIDING) continue;

            const elapsed = currentTime - obj.time;
            const clampedElapsed = Math.max(0, Math.min(elapsed, obj.totalDuration));

            // Calculate ball position along the curve
            const ballPos = this.getSliderBallPosition(obj, clampedElapsed);
            obj.currentBallX = ballPos.x;
            obj.currentBallY = ballPos.y;

            // Check if still tracking
            if (obj.tracking && !obj.trackingBroken) {
                const distanceToBall = Math.hypot(osuPos.x - ballPos.x, osuPos.y - ballPos.y);

                if (!this.isHoldingInput() || distanceToBall > followRadius) {
                    // Lost tracking
                    obj.tracking = false;
                    obj.trackingBroken = true;
                    this.stats.combo = 0;
                }
            }

            // Award tick points
            if (obj.tracking && !obj.trackingBroken && obj.totalTicks > 0) {
                const passedTicks = this.getPassedSliderTicks(obj, clampedElapsed);
                const newTicks = Math.max(0, Math.min(obj.totalTicks, passedTicks) - obj.ticksHit);

                if (newTicks > 0) {
                    obj.ticksHit += newTicks;

                    // Award tick score
                    this.stats.score += 10 * newTicks;
                    this.stats.combo += newTicks;
                    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stats.combo);

                    // Small health recovery
                    this.stats.health = Math.min(100, this.stats.health + newTicks);
                }
            }

            // Check if slider is complete
            if (elapsed >= obj.totalDuration) {
                this.completeSlider(obj);
            }
        }
    }

    getPassedSliderTicks(slider, elapsed) {
        if (slider.ticksPerSlide <= 0 || slider.tickSpacing <= 0) {
            return 0;
        }

        const clampedElapsed = Math.max(0, Math.min(elapsed, slider.totalDuration));
        const completedSlides = Math.min(slider.slides, Math.floor(clampedElapsed / slider.slideDuration));
        let passed = completedSlides * slider.ticksPerSlide;

        if (completedSlides < slider.slides) {
            const elapsedInSlide = clampedElapsed - completedSlides * slider.slideDuration;
            const inSlideTicks = Math.min(
                slider.ticksPerSlide,
                Math.floor(elapsedInSlide / slider.tickSpacing)
            );
            passed += inSlideTicks;
        }

        return Math.min(slider.totalTicks, passed);
    }

    /**
     * Get slider ball position at a given time
     */
    getSliderBallPosition(slider, elapsed) {
        if (!slider.curvePoints || slider.curvePoints.length < 2) {
            return { x: slider.x, y: slider.y };
        }

        // Calculate which slide we're on and progress within it
        const slideProgress = (elapsed % slider.slideDuration) / slider.slideDuration;
        const currentSlide = Math.floor(elapsed / slider.slideDuration);
        const isReverse = currentSlide % 2 === 1;

        // Get progress along curve (0-1)
        let curveProgress = isReverse ? 1 - slideProgress : slideProgress;
        curveProgress = Math.max(0, Math.min(1, curveProgress));

        // Find point on curve
        const totalLength = slider.curvePoints.length - 1;
        const exactIndex = curveProgress * totalLength;
        const index = Math.floor(exactIndex);
        const t = exactIndex - index;

        if (index >= totalLength) {
            return slider.curvePoints[slider.curvePoints.length - 1];
        }

        const p1 = slider.curvePoints[index];
        const p2 = slider.curvePoints[index + 1];

        return {
            x: p1.x + (p2.x - p1.x) * t,
            y: p1.y + (p2.y - p1.y) * t
        };
    }

    /**
     * Complete a slider
     */
    completeSlider(slider) {
        slider.state = HitState.HIT_300; // Mark as complete

        // End hit bonus
        if (slider.tracking && !slider.trackingBroken) {
            this.stats.score += 30;
            slider.endHit = true;
        }

        // Determine final hit quality based on ticks hit
        const maxTicks = slider.totalTicks * slider.slides;
        const tickRatio = maxTicks > 0 ? slider.ticksHit / maxTicks : 1;

        let hitValue;
        if (tickRatio >= 0.9 && !slider.trackingBroken) {
            hitValue = 300;
            this.stats.hit300++;
        } else if (tickRatio >= 0.5) {
            hitValue = 100;
            this.stats.hit100++;
        } else if (tickRatio > 0) {
            hitValue = 50;
            this.stats.hit50++;
        } else {
            hitValue = 0;
            this.stats.misses++;
            this.stats.combo = 0;
        }

        // Health based on performance
        if (hitValue > 0) {
            this.stats.health = Math.min(100, this.stats.health + hitValue / 50);
        } else {
            this.stats.health = Math.max(0, this.stats.health - 5);
        }

        // Remove from active
        this.removeActiveObject(slider);

        // Feedback at end position
        const endPos = slider.curvePoints && slider.curvePoints.length > 0
            ? slider.curvePoints[slider.curvePoints.length - 1]
            : { x: slider.x, y: slider.y };

        this.hitFeedback.push({
            x: slider.slides % 2 === 0 ? slider.x : endPos.x,
            y: slider.slides % 2 === 0 ? slider.y : endPos.y,
            type: hitValue,
            age: 0,
            duration: 400
        });
    }

    /**
     * Process slider that was never started
     */
    processSliderMiss(slider) {
        slider.state = HitState.MISS;
        this.stats.misses++;
        this.stats.combo = 0;
        this.stats.health = Math.max(0, this.stats.health - 8);

        this.removeActiveObject(slider);

        this.hitFeedback.push({
            x: slider.x,
            y: slider.y,
            type: 0,
            age: 0,
            duration: 400
        });
    }

    render() {
        // Draw background
        this.renderBackground();

        // Draw playfield border (subtle)
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(
            this.playfieldOffsetX,
            this.playfieldOffsetY,
            OSU_PLAYFIELD.width * this.playfieldScale,
            OSU_PLAYFIELD.height * this.playfieldScale
        );

        if (!this.audio || !this.beatmap) return;

        const currentTime = this.audio.currentTime * 1000;

        // Sort active objects (oldest first, so newest is on top)
        const sortedActive = [...this.activeObjects].sort((a, b) => b.time - a.time);

        // First pass: Draw slider bodies (behind everything)
        for (const obj of sortedActive) {
            if ((obj.state === HitState.ACTIVE || obj.state === HitState.SLIDING) && obj.type === 'slider') {
                this.renderSliderBody(obj, currentTime);
            }
        }

        // Second pass: Draw circles and slider heads
        for (const obj of sortedActive) {
            if (obj.state === HitState.ACTIVE) {
                if (obj.type === 'slider') {
                    this.renderSliderHead(obj, currentTime);
                } else {
                    this.renderCircle(obj, currentTime);
                }
            } else if (obj.state === HitState.SLIDING) {
                // Slider ball and follow circle
                this.renderSliderBall(obj, currentTime);
            }
        }

        // Draw hit feedback
        for (const fb of this.hitFeedback) {
            this.renderHitFeedback(fb);
        }

        // Draw UI
        this.renderUI();
    }

    renderBackground() {
        // Dark background with gradient
        const gradient = this.ctx.createLinearGradient(0, 0, this.gameWidth, this.gameHeight);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(1, '#16213e');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.gameWidth, this.gameHeight);

        // Draw background image if available (dimmed)
        const bgAsset = this.assets.background || this.assets.songSelectBg;
        if (bgAsset) {
            this.ctx.globalAlpha = 0.3;
            this.ctx.drawImage(bgAsset, 0, 0, this.gameWidth, this.gameHeight);
            this.ctx.globalAlpha = 1;
        }
    }

    renderCircle(obj, currentTime) {
        const pos = this.osuToCanvas(obj.x, obj.y);
        const baseRadius = OsuParser.getCircleRadius(this.beatmap.difficulty.circleSize) * this.playfieldScale;
        const approachTime = OsuParser.getApproachTime(this.beatmap.difficulty.approachRate);

        // Calculate approach circle progress
        const timeUntilHit = obj.time - currentTime;
        const approachProgress = Math.max(0, Math.min(1, 1 - (timeUntilHit / approachTime)));
        const approachScale = 1 + (3 * (1 - approachProgress)); // Starts at 4x, shrinks to 1x

        // Get combo color
        const color = this.getComboColor(obj);

        // Draw hit circle (base)
        if (this.assets.hitcircle) {
            // Tint the hitcircle with combo color
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.drawImage(
                this.assets.hitcircle,
                pos.x - baseRadius,
                pos.y - baseRadius,
                baseRadius * 2,
                baseRadius * 2
            );
            // Color overlay
            this.ctx.globalCompositeOperation = 'multiply';
            this.ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, baseRadius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        } else {
            // Fallback: draw colored circle
            this.ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, baseRadius, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.strokeStyle = 'white';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
        }

        // Draw combo number
        this.renderComboNumber(pos.x, pos.y, obj.comboNumber, baseRadius);

        // Draw hit circle overlay
        if (this.assets.hitcircleoverlay) {
            this.ctx.drawImage(
                this.assets.hitcircleoverlay,
                pos.x - baseRadius,
                pos.y - baseRadius,
                baseRadius * 2,
                baseRadius * 2
            );
        }

        // Draw approach circle
        const approachRadius = baseRadius * approachScale;
        if (this.assets.approachcircle) {
            this.ctx.drawImage(
                this.assets.approachcircle,
                pos.x - approachRadius,
                pos.y - approachRadius,
                approachRadius * 2,
                approachRadius * 2
            );
        } else {
            // Fallback: draw approach circle
            this.ctx.strokeStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
            this.ctx.lineWidth = 4;
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, approachRadius, 0, Math.PI * 2);
            this.ctx.stroke();
        }
    }

    /**
     * Render slider body (the track)
     */
    renderSliderBody(obj, currentTime) {
        if (!obj.curvePoints || obj.curvePoints.length < 2) return;

        const baseRadius = OsuParser.getCircleRadius(this.beatmap.difficulty.circleSize) * this.playfieldScale;
        const color = this.getComboColor(obj);

        // Convert curve points to canvas coordinates
        const canvasPoints = obj.curvePoints.map(p => this.osuToCanvas(p.x, p.y));

        // Draw slider track (outer border - white)
        this.ctx.lineWidth = baseRadius * 2 + 6;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.beginPath();
        this.ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
        for (let i = 1; i < canvasPoints.length; i++) {
            this.ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y);
        }
        this.ctx.stroke();

        // Draw slider track (inner - combo color)
        this.ctx.lineWidth = baseRadius * 2;
        this.ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.6)`;
        this.ctx.beginPath();
        this.ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
        for (let i = 1; i < canvasPoints.length; i++) {
            this.ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y);
        }
        this.ctx.stroke();

        // Draw slider track (core - darker)
        this.ctx.lineWidth = baseRadius * 1.4;
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        this.ctx.beginPath();
        this.ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
        for (let i = 1; i < canvasPoints.length; i++) {
            this.ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y);
        }
        this.ctx.stroke();

        // Draw end circle
        const endPoint = canvasPoints[canvasPoints.length - 1];
        this.ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.8)`;
        this.ctx.beginPath();
        this.ctx.arc(endPoint.x, endPoint.y, baseRadius * 0.9, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();

        // Draw reverse arrow if multiple slides
        if (obj.slides > 1) {
            const repeatState = this.getSliderRepeatState(obj, currentTime);
            if (repeatState) {
                const startPoint = canvasPoints[0];
                const secondPoint = canvasPoints[1];
                const prevPoint = canvasPoints[canvasPoints.length - 2];

                const isAtEnd = repeatState.turnIndex % 2 === 0;
                const arrowX = isAtEnd ? endPoint.x : startPoint.x;
                const arrowY = isAtEnd ? endPoint.y : startPoint.y;
                const angle = isAtEnd
                    ? Math.atan2(prevPoint.y - endPoint.y, prevPoint.x - endPoint.x)
                    : Math.atan2(secondPoint.y - startPoint.y, secondPoint.x - startPoint.x);

                this.renderReverseArrow(arrowX, arrowY, angle, baseRadius);
            }

            const remainingSpans = this.getSliderRemainingSpans(obj, currentTime);
            this.renderSliderRepeatBadge(canvasPoints[0].x, canvasPoints[0].y, obj.slides, remainingSpans, baseRadius);
        }
    }

    /**
     * Render slider head (start circle with approach)
     */
    renderSliderHead(obj, currentTime) {
        // Render the start circle like a regular hit circle
        this.renderCircle(obj, currentTime);
    }

    /**
     * Render slider ball (during SLIDING state)
     */
    renderSliderBall(obj, currentTime) {
        if (obj.currentBallX == null || obj.currentBallY == null) return;

        const pos = this.osuToCanvas(obj.currentBallX, obj.currentBallY);
        const baseRadius = OsuParser.getCircleRadius(this.beatmap.difficulty.circleSize) * this.playfieldScale;
        const color = this.getComboColor(obj);

        // Draw follow circle if tracking
        if (obj.tracking && !obj.trackingBroken) {
            const followRadius = baseRadius * 2.4;

            if (this.assets.sliderfollowcircle) {
                this.ctx.globalAlpha = 0.8;
                this.ctx.drawImage(
                    this.assets.sliderfollowcircle,
                    pos.x - followRadius,
                    pos.y - followRadius,
                    followRadius * 2,
                    followRadius * 2
                );
                this.ctx.globalAlpha = 1;
            } else {
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                this.ctx.lineWidth = 4;
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, followRadius, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        }

        // Draw slider ball
        const ballFrame = Math.floor((currentTime / 30) % 10); // Animate through frames
        const ballAsset = this.assets['sliderb' + ballFrame];

        if (ballAsset) {
            this.ctx.drawImage(
                ballAsset,
                pos.x - baseRadius,
                pos.y - baseRadius,
                baseRadius * 2,
                baseRadius * 2
            );
        } else {
            // Fallback: draw colored circle
            this.ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, baseRadius * 0.8, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = 'white';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
        }
    }

    getSliderRepeatState(slider, currentTime) {
        if (!slider || slider.slides <= 1 || !slider.slideDuration || !slider.totalDuration) {
            return null;
        }

        const elapsed = Math.max(0, Math.min(currentTime - slider.time, slider.totalDuration));
        const turnIndex = Math.floor(elapsed / slider.slideDuration);

        if (turnIndex >= slider.slides - 1) {
            return null;
        }

        return {
            turnIndex,
            turnsRemaining: slider.slides - turnIndex - 1
        };
    }

    getSliderRemainingSpans(slider, currentTime) {
        if (!slider || !slider.slides || slider.slides <= 1 || !slider.slideDuration || !slider.totalDuration) {
            return 1;
        }

        const elapsed = Math.max(0, Math.min(currentTime - slider.time, slider.totalDuration));
        const spanIndex = Math.min(slider.slides - 1, Math.floor(elapsed / slider.slideDuration));
        return Math.max(1, slider.slides - spanIndex);
    }

    renderSliderRepeatBadge(startX, startY, slides, displayCount, radius) {
        if (!slides || slides <= 1) return;

        const badgeX = startX + radius * 0.95;
        const badgeY = startY - radius * 0.95;
        const badgeRadius = Math.max(radius * 0.52, 12);

        this.ctx.save();
        this.ctx.fillStyle = 'rgba(8, 14, 24, 0.86)';
        this.ctx.beginPath();
        this.ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = `700 ${Math.max(10, badgeRadius * 0.9)}px "Rajdhani", "Trebuchet MS", sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(`x${Math.max(1, displayCount || slides)}`, badgeX, badgeY);
        this.ctx.restore();
    }

    /**
     * Render reverse arrow on slider
     */
    renderReverseArrow(x, y, angle, radius) {
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(angle);

        if (this.assets.reversearrow) {
            const size = radius * 1.2;
            this.ctx.drawImage(
                this.assets.reversearrow,
                -size / 2,
                -size / 2,
                size,
                size
            );
        } else {
            // Fallback: draw arrow
            this.ctx.fillStyle = 'white';
            this.ctx.beginPath();
            this.ctx.moveTo(radius * 0.5, 0);
            this.ctx.lineTo(-radius * 0.3, -radius * 0.4);
            this.ctx.lineTo(-radius * 0.3, radius * 0.4);
            this.ctx.closePath();
            this.ctx.fill();
        }

        this.ctx.restore();
    }

    renderComboNumber(x, y, number, radius) {
        const numStr = String(number);
        const digitWidth = radius * 0.5;
        const totalWidth = numStr.length * digitWidth;
        let startX = x - totalWidth / 2 + digitWidth / 2;

        for (const digit of numStr) {
            const asset = this.assets['default-' + digit];
            if (asset) {
                this.ctx.drawImage(
                    asset,
                    startX - digitWidth / 2,
                    y - digitWidth / 2,
                    digitWidth,
                    digitWidth
                );
            } else {
                // Fallback: draw text
                this.ctx.fillStyle = 'white';
                this.ctx.font = `700 ${radius * 0.8}px "Rajdhani", "Trebuchet MS", sans-serif`;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(digit, startX, y);
            }
            startX += digitWidth;
        }
    }

    renderHitFeedback(feedback) {
        const pos = this.osuToCanvas(feedback.x, feedback.y);
        const alpha = 1 - (feedback.age / feedback.duration);
        const scale = 1 + (feedback.age / feedback.duration) * 0.5;

        this.ctx.globalAlpha = alpha;

        let asset;
        switch (feedback.type) {
            case 300: asset = this.assets.hit300; break;
            case 100: asset = this.assets.hit100; break;
            case 50: asset = this.assets.hit50; break;
            default: asset = this.assets.hit0; break;
        }

        const size = 60 * scale * this.playfieldScale / 3;

        if (asset) {
            this.ctx.drawImage(asset, pos.x - size / 2, pos.y - size / 2, size, size);
        } else {
            // Fallback: draw text
            this.ctx.font = `700 ${size * 0.52}px "Rajdhani", "Trebuchet MS", sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';

            switch (feedback.type) {
                case 300: this.ctx.fillStyle = '#88ff88'; break;
                case 100: this.ctx.fillStyle = '#88ffff'; break;
                case 50: this.ctx.fillStyle = '#ffff88'; break;
                default: this.ctx.fillStyle = '#ff8888'; break;
            }

            this.ctx.fillText(feedback.type === 0 ? 'X' : feedback.type, pos.x, pos.y);
        }

        this.ctx.globalAlpha = 1;
    }

    renderUI() {
        // Score (top right)
        const scoreStr = String(Math.floor(this.stats.score)).padStart(8, '0');
        this.renderScoreText(scoreStr, this.gameWidth - 20, 30, 'right');

        // Accuracy (below score)
        const accuracy = this.calculateAccuracy().toFixed(2) + '%';
        this.renderSmallText(accuracy, this.gameWidth - 20, 60, 'right');

        // Combo (bottom left)
        if (this.stats.combo > 0) {
            const comboStr = this.stats.combo + 'x';
            this.renderScoreText(comboStr, 20, this.gameHeight - 30, 'left');
        }

        // Health bar (top center)
        this.renderHealthBar();
    }

    renderScoreText(text, x, y, align) {
        this.ctx.font = '700 30px "Rajdhani", "Trebuchet MS", sans-serif';
        this.ctx.fillStyle = '#f6fbff';
        this.ctx.textAlign = align;
        this.ctx.textBaseline = 'middle';
        this.ctx.shadowColor = 'rgba(2, 10, 20, 0.8)';
        this.ctx.shadowBlur = 10;
        this.ctx.fillText(text, x, y);
        this.ctx.shadowBlur = 0;
    }

    renderSmallText(text, x, y, align) {
        this.ctx.font = '600 18px "Sora", "Trebuchet MS", sans-serif';
        this.ctx.fillStyle = '#9ec0dc';
        this.ctx.textAlign = align;
        this.ctx.textBaseline = 'middle';
        this.ctx.shadowColor = 'rgba(2, 10, 20, 0.65)';
        this.ctx.shadowBlur = 6;
        this.ctx.fillText(text, x, y);
        this.ctx.shadowBlur = 0;
    }

    renderHealthBar() {
        const barWidth = this.gameWidth * 0.3;
        const barHeight = 13;
        const x = (this.gameWidth - barWidth) / 2;
        const y = 14;
        const radius = barHeight / 2;

        const drawRoundedBar = (left, top, width, height, r) => {
            const safeRadius = Math.min(r, height / 2, width / 2);
            this.ctx.beginPath();
            this.ctx.moveTo(left + safeRadius, top);
            this.ctx.lineTo(left + width - safeRadius, top);
            this.ctx.arcTo(left + width, top, left + width, top + safeRadius, safeRadius);
            this.ctx.lineTo(left + width, top + height - safeRadius);
            this.ctx.arcTo(left + width, top + height, left + width - safeRadius, top + height, safeRadius);
            this.ctx.lineTo(left + safeRadius, top + height);
            this.ctx.arcTo(left, top + height, left, top + height - safeRadius, safeRadius);
            this.ctx.lineTo(left, top + safeRadius);
            this.ctx.arcTo(left, top, left + safeRadius, top, safeRadius);
            this.ctx.closePath();
        };

        // Background
        drawRoundedBar(x, y, barWidth, barHeight, radius);
        this.ctx.fillStyle = 'rgba(3, 12, 23, 0.76)';
        this.ctx.fill();

        // Health fill
        const healthPercent = this.stats.health / 100;
        let startColor;
        let endColor;
        if (healthPercent > 0.5) {
            startColor = '#48c97e';
            endColor = '#79f3b0';
        } else if (healthPercent > 0.25) {
            startColor = '#f5b84f';
            endColor = '#ffd975';
        } else {
            startColor = '#dc4e4e';
            endColor = '#ff8787';
        }

        const fillWidth = barWidth * healthPercent;
        if (fillWidth > 0) {
            const fillGradient = this.ctx.createLinearGradient(x, y, x + fillWidth, y);
            fillGradient.addColorStop(0, startColor);
            fillGradient.addColorStop(1, endColor);
            const glowColor = healthPercent > 0.5
                ? 'rgba(121, 243, 176, 0.26)'
                : healthPercent > 0.25
                    ? 'rgba(255, 217, 117, 0.24)'
                    : 'rgba(255, 135, 135, 0.26)';

            drawRoundedBar(x, y, fillWidth, barHeight, radius);
            this.ctx.fillStyle = fillGradient;
            this.ctx.shadowColor = glowColor;
            this.ctx.shadowBlur = 8;
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }

        // Border
        drawRoundedBar(x, y, barWidth, barHeight, radius);
        this.ctx.strokeStyle = 'rgba(220, 241, 255, 0.46)';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
    }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.game = new OsuGame();
});
