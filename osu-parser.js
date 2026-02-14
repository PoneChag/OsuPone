/**
 * osu! Beatmap Parser
 * Parses .osu file format (circles and sliders)
 */

const OsuParser = {
    /**
     * Parse a .osu file string into a beatmap object
     * @param {string} content - Raw .osu file content
     * @returns {Object} Parsed beatmap data
     */
    parse(content) {
        const lines = content.split('\n').map(l => l.trim());
        const sections = this.splitIntoSections(lines);
        const colours = this.parseColours(sections['Colours'] || []);

        return {
            general: this.parseGeneral(sections['General'] || []),
            metadata: this.parseMetadata(sections['Metadata'] || []),
            difficulty: this.parseDifficulty(sections['Difficulty'] || []),
            timingPoints: this.parseTimingPoints(sections['TimingPoints'] || []),
            colours,
            hitObjects: this.parseHitObjects(sections['HitObjects'] || [], colours.length)
        };
    },

    /**
     * Split file content into sections
     */
    splitIntoSections(lines) {
        const sections = {};
        let currentSection = null;

        for (const line of lines) {
            if (line.startsWith('[') && line.endsWith(']')) {
                currentSection = line.slice(1, -1);
                sections[currentSection] = [];
            } else if (currentSection && line && !line.startsWith('//')) {
                sections[currentSection].push(line);
            }
        }

        return sections;
    },

    /**
     * Parse [General] section
     */
    parseGeneral(lines) {
        const general = {};
        for (const line of lines) {
            const [key, value] = line.split(':').map(s => s.trim());
            if (key && value !== undefined) {
                general[key] = value;
            }
        }
        return {
            audioFilename: general['AudioFilename'] || '',
            audioLeadIn: parseInt(general['AudioLeadIn']) || 0,
            previewTime: parseInt(general['PreviewTime']) || 0,
            mode: parseInt(general['Mode']) || 0
        };
    },

    /**
     * Parse [Metadata] section
     */
    parseMetadata(lines) {
        const metadata = {};
        for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > -1) {
                const key = line.slice(0, colonIndex).trim();
                const value = line.slice(colonIndex + 1).trim();
                metadata[key] = value;
            }
        }
        return {
            title: metadata['Title'] || 'Unknown',
            artist: metadata['Artist'] || 'Unknown',
            creator: metadata['Creator'] || 'Unknown',
            version: metadata['Version'] || 'Normal',
            tags: metadata['Tags'] || ''
        };
    },

    /**
     * Parse [Difficulty] section
     */
    parseDifficulty(lines) {
        const difficulty = {};
        for (const line of lines) {
            const [key, value] = line.split(':').map(s => s.trim());
            if (key && value !== undefined) {
                difficulty[key] = parseFloat(value);
            }
        }
        return {
            hpDrainRate: difficulty['HPDrainRate'] || 5,
            circleSize: difficulty['CircleSize'] || 4,
            overallDifficulty: difficulty['OverallDifficulty'] || 5,
            approachRate: difficulty['ApproachRate'] || difficulty['OverallDifficulty'] || 5,
            sliderMultiplier: difficulty['SliderMultiplier'] || 1.4,
            sliderTickRate: difficulty['SliderTickRate'] || 1
        };
    },

    /**
     * Parse [TimingPoints] section
     */
    parseTimingPoints(lines) {
        const timingPoints = [];
        for (const line of lines) {
            const parts = line.split(',');
            if (parts.length >= 2) {
                const offset = parseFloat(parts[0]);
                const msPerBeat = parseFloat(parts[1]);
                const inherited = msPerBeat < 0;

                timingPoints.push({
                    offset: offset,
                    msPerBeat: inherited ? msPerBeat : msPerBeat,
                    bpm: inherited ? null : (60000 / msPerBeat),
                    meter: parseInt(parts[2]) || 4,
                    inherited: inherited
                });
            }
        }
        return timingPoints;
    },

    /**
     * Parse [Colours] section
     */
    parseColours(lines) {
        const colours = [];
        for (const line of lines) {
            const match = line.match(/Combo(\d+)\s*:\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
            if (match) {
                colours.push({
                    r: parseInt(match[2]),
                    g: parseInt(match[3]),
                    b: parseInt(match[4])
                });
            }
        }
        // Default colors if none specified
        if (colours.length === 0) {
            colours.push(
                { r: 255, g: 192, b: 0 },
                { r: 0, g: 202, b: 0 },
                { r: 18, g: 124, b: 255 },
                { r: 242, g: 24, b: 57 }
            );
        }
        return colours;
    },

    /**
     * Parse [HitObjects] section - CIRCLES AND SLIDERS
     * Format: x,y,time,type,hitSound[,extras]
     * Type bitmask: 1=circle, 2=slider, 4=new combo, 8=spinner
     */
    parseHitObjects(lines, comboColorCount = 4) {
        const hitObjects = [];
        let comboNumber = 0;
        let comboColorIndex = 0;
        const safeComboColorCount = Math.max(1, comboColorCount || 0);

        for (const line of lines) {
            const parts = line.split(',');
            if (parts.length < 4) continue;

            const x = parseInt(parts[0]);
            const y = parseInt(parts[1]);
            const time = parseInt(parts[2]);
            const type = parseInt(parts[3]);
            const hitSound = parseInt(parts[4]) || 0;

            const isCircle = (type & 1) !== 0;
            const isSlider = (type & 2) !== 0;
            const isSpinner = (type & 8) !== 0;
            const isNewCombo = (type & 4) !== 0;

            // Skip spinners for now
            if (isSpinner) continue;

            // Handle combo for both circles and sliders
            if (isNewCombo) {
                comboNumber = 1;
                const comboSkip = (type >> 4) & 7;
                comboColorIndex = (comboColorIndex + 1 + comboSkip) % safeComboColorCount;
            } else {
                comboNumber++;
            }

            // Process circles
            if (isCircle && !isSlider) {
                hitObjects.push({
                    x: x,
                    y: y,
                    time: time,
                    type: 'circle',
                    hitSound: hitSound,
                    isNewCombo: isNewCombo,
                    comboNumber: comboNumber,
                    comboColorIndex: comboColorIndex
                });
            }

            // Process sliders
            if (isSlider) {
                const curveData = parts[5] || '';
                const slides = parseInt(parts[6]) || 1;
                const length = parseFloat(parts[7]) || 100;

                // Parse curve type and control points
                // Format: "B|224:56|288:56|328:96" or "L|200:100" or "P|200:100|300:50"
                const curveParts = curveData.split('|');
                const curveType = curveParts[0] || 'B';
                const controlPoints = [];

                for (let i = 1; i < curveParts.length; i++) {
                    const point = curveParts[i];
                    if (point.includes(':')) {
                        const [px, py] = point.split(':').map(Number);
                        if (!isNaN(px) && !isNaN(py)) {
                            controlPoints.push({ x: px, y: py });
                        }
                    }
                }

                hitObjects.push({
                    x: x,
                    y: y,
                    time: time,
                    type: 'slider',
                    curveType: curveType,
                    controlPoints: controlPoints,
                    slides: slides,
                    length: length,
                    hitSound: hitSound,
                    isNewCombo: isNewCombo,
                    comboNumber: comboNumber,
                    comboColorIndex: comboColorIndex
                });
            }
        }

        return hitObjects;
    },

    /**
     * Calculate approach time based on AR
     * @param {number} ar - Approach Rate
     * @returns {number} Time in ms before hit when circle appears
     */
    getApproachTime(ar) {
        if (ar < 5) {
            return 1800 - ar * 120;
        } else {
            return 1200 - (ar - 5) * 150;
        }
    },

    /**
     * Calculate hit windows based on OD
     * @param {number} od - Overall Difficulty
     * @returns {Object} Hit windows in ms
     */
    getHitWindows(od) {
        return {
            hit300: 80 - 6 * od,
            hit100: 140 - 8 * od,
            hit50: 200 - 10 * od
        };
    },

    /**
     * Calculate circle radius based on CS
     * @param {number} cs - Circle Size
     * @returns {number} Radius in osu! pixels
     */
    getCircleRadius(cs) {
        return 54.4 - 4.48 * cs;
    },

    /**
     * Calculate slider duration
     * @param {number} length - Slider length in pixels
     * @param {number} beatLength - Milliseconds per beat
     * @param {number} sliderMultiplier - From difficulty settings
     * @returns {number} Duration in ms for one slide
     */
    getSliderDuration(length, beatLength, sliderMultiplier) {
        return (length / (sliderMultiplier * 100)) * beatLength;
    },

    /**
     * Generate curve points for a slider
     * @param {string} curveType - 'B' (Bezier), 'L' (Linear), 'P' (Perfect circle)
     * @param {number} startX - Start X position
     * @param {number} startY - Start Y position
     * @param {Array} controlPoints - Array of {x, y} control points
     * @param {number} length - Target length in pixels
     * @param {number} resolution - Number of points to generate
     * @returns {Array} Array of {x, y} points along the curve
     */
    generateCurve(curveType, startX, startY, controlPoints, length, resolution = 50) {
        const allPoints = [{ x: startX, y: startY }, ...controlPoints];

        let curvePoints;
        switch (curveType) {
            case 'L':
                curvePoints = this.generateLinearCurve(allPoints, resolution);
                break;
            case 'P':
                curvePoints = this.generatePerfectCircleCurve(allPoints, resolution);
                break;
            case 'B':
            default:
                curvePoints = this.generateBezierCurve(allPoints, resolution);
                break;
        }

        // Trim or extend curve to match desired length
        return this.trimCurveToLength(curvePoints, length);
    },

    /**
     * Generate Bezier curve using De Casteljau's algorithm
     */
    generateBezierCurve(points, resolution) {
        if (points.length < 2) return points;

        // Handle multi-segment Bezier curves (points separated by duplicates)
        const segments = this.splitBezierSegments(points);
        const result = [];

        for (const segment of segments) {
            if (segment.length < 2) continue;

            for (let t = 0; t <= 1; t += 1 / resolution) {
                result.push(this.bezierPoint(segment, t));
            }
        }

        return result;
    },

    /**
     * Split Bezier curve into segments at duplicate points
     */
    splitBezierSegments(points) {
        const segments = [];
        let currentSegment = [points[0]];

        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];

            // Check if this is a duplicate point (segment break)
            if (prev.x === curr.x && prev.y === curr.y) {
                if (currentSegment.length > 1) {
                    segments.push(currentSegment);
                }
                currentSegment = [curr];
            } else {
                currentSegment.push(curr);
            }
        }

        if (currentSegment.length > 1) {
            segments.push(currentSegment);
        }

        return segments.length > 0 ? segments : [points];
    },

    /**
     * Calculate a point on a Bezier curve using De Casteljau's algorithm
     */
    bezierPoint(points, t) {
        if (points.length === 1) return points[0];

        const newPoints = [];
        for (let i = 0; i < points.length - 1; i++) {
            newPoints.push({
                x: points[i].x + (points[i + 1].x - points[i].x) * t,
                y: points[i].y + (points[i + 1].y - points[i].y) * t
            });
        }

        return this.bezierPoint(newPoints, t);
    },

    /**
     * Generate Linear curve (straight lines between points)
     */
    generateLinearCurve(points, resolution) {
        if (points.length < 2) return points;

        const result = [];
        const pointsPerSegment = Math.ceil(resolution / (points.length - 1));

        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];

            for (let j = 0; j <= pointsPerSegment; j++) {
                const t = j / pointsPerSegment;
                result.push({
                    x: p1.x + (p2.x - p1.x) * t,
                    y: p1.y + (p2.y - p1.y) * t
                });
            }
        }

        return result;
    },

    /**
     * Generate Perfect Circle curve (arc through 3 points)
     */
    generatePerfectCircleCurve(points, resolution) {
        // Need exactly 3 points for a perfect circle
        if (points.length < 3) {
            return this.generateLinearCurve(points, resolution);
        }

        const p1 = points[0];
        const p2 = points[1];
        const p3 = points[2];

        // Calculate circle center using perpendicular bisectors
        const center = this.getCircleCenter(p1, p2, p3);
        if (!center) {
            // Points are collinear, fall back to linear
            return this.generateLinearCurve(points, resolution);
        }

        const radius = Math.hypot(p1.x - center.x, p1.y - center.y);

        // Calculate angles
        const startAngle = Math.atan2(p1.y - center.y, p1.x - center.x);
        const midAngle = Math.atan2(p2.y - center.y, p2.x - center.x);
        const endAngle = Math.atan2(p3.y - center.y, p3.x - center.x);

        // Determine arc direction
        const cross = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
        const clockwise = cross < 0;

        // Calculate total angle to sweep
        let angleDiff = endAngle - startAngle;
        if (clockwise) {
            if (angleDiff > 0) angleDiff -= 2 * Math.PI;
        } else {
            if (angleDiff < 0) angleDiff += 2 * Math.PI;
        }

        // Generate arc points
        const result = [];
        for (let i = 0; i <= resolution; i++) {
            const t = i / resolution;
            const angle = startAngle + angleDiff * t;
            result.push({
                x: center.x + radius * Math.cos(angle),
                y: center.y + radius * Math.sin(angle)
            });
        }

        return result;
    },

    /**
     * Calculate circle center from 3 points
     */
    getCircleCenter(p1, p2, p3) {
        const ax = p1.x, ay = p1.y;
        const bx = p2.x, by = p2.y;
        const cx = p3.x, cy = p3.y;

        const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));

        if (Math.abs(d) < 0.0001) {
            return null; // Points are collinear
        }

        const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
        const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;

        return { x: ux, y: uy };
    },

    /**
     * Trim or extend curve to match desired length
     */
    trimCurveToLength(points, targetLength) {
        if (points.length < 2) return points;

        const result = [points[0]];
        let currentLength = 0;

        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const segmentLength = Math.hypot(curr.x - prev.x, curr.y - prev.y);

            if (currentLength + segmentLength >= targetLength) {
                // Interpolate to exact target length
                const remaining = targetLength - currentLength;
                const t = remaining / segmentLength;
                result.push({
                    x: prev.x + (curr.x - prev.x) * t,
                    y: prev.y + (curr.y - prev.y) * t
                });
                break;
            }

            result.push(curr);
            currentLength += segmentLength;
        }

        return result;
    }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OsuParser;
}
