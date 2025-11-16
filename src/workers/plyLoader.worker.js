/**
 * Web Worker for loading and processing PLY files
 * Handles parsing and downsampling off the main thread
 */

import * as THREE from 'three';

// Downsampling configuration
const GRID_SIZE = 0.015;
const DOWNSAMPLE_THRESHOLD = 500000; // Start downsampling earlier
const USE_AVERAGING = true;
const CHUNK_SIZE = 50000; // Smaller chunks for smoother loading (was 100000)

/**
 * Parse PLY file incrementally and send chunks back to main thread
 */
async function loadAndProcessPLY(url, filename, centerOffset, qualityMode = 'downsampled') {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const geometry = parsePLY(arrayBuffer);

        if (!geometry.attributes.position) {
            throw new Error('Missing position attribute');
        }

        // Send initial metadata
        postMessage({
            type: 'metadata',
            filename,
            totalPoints: geometry.attributes.position.count
        });

        // Center the geometry
        if (centerOffset) {
            geometry.translate(-centerOffset.x, -centerOffset.y, -centerOffset.z);
        } else {
            geometry.computeBoundingBox();
            const center = geometry.boundingBox.getCenter(new THREE.Vector3());
            geometry.translate(-center.x, -center.y, -center.z);
        }

        // Ensure normals and colors exist
        ensureGeometryHasNormals(geometry);
        if (!geometry.attributes.color) {
            const defaultColors = createDefaultColors(geometry.attributes.position.count);
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(defaultColors, 3));
        }

        // Decide whether to downsample based on quality mode
        const needsDownsampling = qualityMode === 'downsampled' && geometry.attributes.position.count > DOWNSAMPLE_THRESHOLD;

        if (needsDownsampling) {
            // Downsample and send in chunks
            const downsampled = downsampleGeometryStreaming(geometry, filename);
            sendGeometryInChunks(downsampled, filename, true);
        } else {
            // Send as-is in chunks
            sendGeometryInChunks(geometry, filename, false);
        }

        // Send completion message
        postMessage({
            type: 'complete',
            filename
        });

    } catch (error) {
        postMessage({
            type: 'error',
            filename,
            error: error.message
        });
    }
}

/**
 * Parse PLY binary/ASCII data
 * Simplified PLY parser based on THREE.PLYLoader
 */
function parsePLY(data) {
    const geometry = new THREE.BufferGeometry();
    const dataView = new DataView(data);
    
    // Parse header
    let headerLength = 0;
    let headerText = '';
    const decoder = new TextDecoder();
    
    // Read header (ASCII)
    for (let i = 0; i < data.byteLength; i++) {
        headerText += String.fromCharCode(dataView.getUint8(i));
        if (headerText.endsWith('end_header\n') || headerText.endsWith('end_header\r\n')) {
            headerLength = i + 1;
            break;
        }
    }

    const header = parseHeader(headerText);
    
    if (header.format === 'binary_little_endian' || header.format === 'binary_big_endian') {
        parseBinaryPLY(dataView, headerLength, header, geometry);
    } else {
        parseASCIIPLY(headerText, data, headerLength, header, geometry);
    }

    return geometry;
}

/**
 * Parse PLY header
 */
function parseHeader(headerText) {
    const lines = headerText.split('\n');
    const header = {
        format: null,
        vertices: 0,
        faces: 0,
        properties: []
    };

    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        
        if (parts[0] === 'format') {
            header.format = parts[1];
        } else if (parts[0] === 'element') {
            if (parts[1] === 'vertex') {
                header.vertices = parseInt(parts[2]);
            } else if (parts[1] === 'face') {
                header.faces = parseInt(parts[2]);
            }
        } else if (parts[0] === 'property') {
            header.properties.push({
                type: parts[1],
                name: parts[2]
            });
        }
    }

    return header;
}

/**
 * Parse binary PLY data
 */
function parseBinaryPLY(dataView, offset, header, geometry) {
    const vertices = header.vertices;
    const properties = header.properties;
    const littleEndian = header.format === 'binary_little_endian';

    const positions = [];
    const colors = [];
    const normals = [];

    let hasColor = properties.some(p => p.name === 'red' || p.name === 'diffuse_red');
    let hasNormal = properties.some(p => p.name === 'nx');

    // Calculate stride
    let stride = 0;
    const propertyOffsets = {};
    for (const prop of properties) {
        propertyOffsets[prop.name] = stride;
        
        if (prop.type === 'float' || prop.type === 'float32') {
            stride += 4;
        } else if (prop.type === 'uchar' || prop.type === 'uint8') {
            stride += 1;
        } else if (prop.type === 'int' || prop.type === 'int32') {
            stride += 4;
        } else if (prop.type === 'double') {
            stride += 8;
        }
    }

    // Read vertices
    for (let i = 0; i < vertices; i++) {
        const vertexOffset = offset + (i * stride);

        // Position
        const x = dataView.getFloat32(vertexOffset + propertyOffsets['x'], littleEndian);
        const y = dataView.getFloat32(vertexOffset + propertyOffsets['y'], littleEndian);
        const z = dataView.getFloat32(vertexOffset + propertyOffsets['z'], littleEndian);
        positions.push(x, y, z);

        // Color
        if (hasColor) {
            const rOffset = propertyOffsets['red'] ?? propertyOffsets['diffuse_red'];
            const gOffset = propertyOffsets['green'] ?? propertyOffsets['diffuse_green'];
            const bOffset = propertyOffsets['blue'] ?? propertyOffsets['diffuse_blue'];
            
            const r = dataView.getUint8(vertexOffset + rOffset) / 255;
            const g = dataView.getUint8(vertexOffset + gOffset) / 255;
            const b = dataView.getUint8(vertexOffset + bOffset) / 255;
            colors.push(r, g, b);
        }

        // Normal
        if (hasNormal) {
            const nx = dataView.getFloat32(vertexOffset + propertyOffsets['nx'], littleEndian);
            const ny = dataView.getFloat32(vertexOffset + propertyOffsets['ny'], littleEndian);
            const nz = dataView.getFloat32(vertexOffset + propertyOffsets['nz'], littleEndian);
            normals.push(nx, ny, nz);
        }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (colors.length > 0) {
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }
    if (normals.length > 0) {
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    }
}

/**
 * Parse ASCII PLY data
 */
function parseASCIIPLY(headerText, data, headerLength, header, geometry) {
    const decoder = new TextDecoder();
    const bodyText = decoder.decode(data.slice(headerLength));
    const lines = bodyText.split('\n');

    const positions = [];
    const colors = [];
    
    for (let i = 0; i < header.vertices && i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = line.split(/\s+/).map(parseFloat);
        if (values.length >= 3) {
            positions.push(values[0], values[1], values[2]);
            
            // If we have RGB values (usually values[3], [4], [5])
            if (values.length >= 6) {
                colors.push(values[3] / 255, values[4] / 255, values[5] / 255);
            }
        }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (colors.length > 0) {
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }
}

/**
 * Grid-based downsampling (same algorithm but optimized for worker)
 */
function downsampleGeometryStreaming(geometry, filename) {
    const positions = geometry.attributes.position;
    const colors = geometry.attributes.color;
    const normals = geometry.attributes.normal;

    postMessage({
        type: 'progress',
        filename,
        message: 'Downsampling...',
        progress: 0
    });

    const grid = new Map();
    const totalPoints = positions.count;

    // First pass: collect all points in each cell
    for (let i = 0; i < totalPoints; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);

        const cellX = Math.floor(x / GRID_SIZE);
        const cellY = Math.floor(y / GRID_SIZE);
        const cellZ = Math.floor(z / GRID_SIZE);
        const cellKey = `${cellX},${cellY},${cellZ}`;

        if (!grid.has(cellKey)) {
            grid.set(cellKey, []);
        }
        grid.get(cellKey).push(i);

        // Report progress every 100k points
        if (i % 100000 === 0) {
            postMessage({
                type: 'progress',
                filename,
                message: 'Downsampling...',
                progress: (i / totalPoints) * 50 // 0-50%
            });
        }
    }

    postMessage({
        type: 'progress',
        filename,
        message: 'Processing grid cells...',
        progress: 50
    });

    // Second pass: process each cell
    const resultPoints = [];
    let processedCells = 0;
    const totalCells = grid.size;

    for (const [cellKey, pointIndices] of grid.entries()) {
        if (USE_AVERAGING && pointIndices.length > 1) {
            let sumX = 0, sumY = 0, sumZ = 0;
            let sumR = 0, sumG = 0, sumB = 0;
            let sumNX = 0, sumNY = 0, sumNZ = 0;

            for (const idx of pointIndices) {
                sumX += positions.getX(idx);
                sumY += positions.getY(idx);
                sumZ += positions.getZ(idx);

                if (colors) {
                    sumR += colors.getX(idx);
                    sumG += colors.getY(idx);
                    sumB += colors.getZ(idx);
                }

                if (normals) {
                    sumNX += normals.getX(idx);
                    sumNY += normals.getY(idx);
                    sumNZ += normals.getZ(idx);
                }
            }

            const count = pointIndices.length;
            resultPoints.push({
                position: [sumX / count, sumY / count, sumZ / count],
                color: colors ? [sumR / count, sumG / count, sumB / count] : [1, 1, 1],
                normal: normals ? [sumNX / count, sumNY / count, sumNZ / count] : null
            });
        } else {
            const idx = pointIndices[0];
            resultPoints.push({
                position: [positions.getX(idx), positions.getY(idx), positions.getZ(idx)],
                color: colors ? [colors.getX(idx), colors.getY(idx), colors.getZ(idx)] : [1, 1, 1],
                normal: normals ? [normals.getX(idx), normals.getY(idx), normals.getZ(idx)] : null
            });
        }

        processedCells++;
        if (processedCells % 10000 === 0) {
            postMessage({
                type: 'progress',
                filename,
                message: 'Processing grid cells...',
                progress: 50 + (processedCells / totalCells) * 50 // 50-100%
            });
        }
    }

    // Create new geometry
    const newGeometry = new THREE.BufferGeometry();
    const newPositions = new Float32Array(resultPoints.length * 3);
    const newColors = new Float32Array(resultPoints.length * 3);
    const newNormals = normals ? new Float32Array(resultPoints.length * 3) : null;

    for (let i = 0; i < resultPoints.length; i++) {
        const point = resultPoints[i];
        
        newPositions[i * 3] = point.position[0];
        newPositions[i * 3 + 1] = point.position[1];
        newPositions[i * 3 + 2] = point.position[2];
        
        newColors[i * 3] = point.color[0];
        newColors[i * 3 + 1] = point.color[1];
        newColors[i * 3 + 2] = point.color[2];
        
        if (newNormals && point.normal) {
            newNormals[i * 3] = point.normal[0];
            newNormals[i * 3 + 1] = point.normal[1];
            newNormals[i * 3 + 2] = point.normal[2];
        }
    }

    newGeometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
    newGeometry.setAttribute('color', new THREE.BufferAttribute(newColors, 3));
    if (newNormals) {
        newGeometry.setAttribute('normal', new THREE.BufferAttribute(newNormals, 3));
    }

    postMessage({
        type: 'progress',
        filename,
        message: `Downsampled from ${totalPoints.toLocaleString()} to ${resultPoints.length.toLocaleString()} points`,
        progress: 100
    });

    return newGeometry;
}

/**
 * Send geometry data in chunks to avoid blocking
 */
function sendGeometryInChunks(geometry, filename, wasDownsampled) {
    const positions = geometry.attributes.position;
    const colors = geometry.attributes.color;
    const normals = geometry.attributes.normal;
    
    const totalPoints = positions.count;
    let sentPoints = 0;

    while (sentPoints < totalPoints) {
        const chunkPoints = Math.min(CHUNK_SIZE, totalPoints - sentPoints);
        const startIdx = sentPoints;
        const endIdx = sentPoints + chunkPoints;

        // Extract chunk data
        const chunkPositions = new Float32Array(chunkPoints * 3);
        const chunkColors = new Float32Array(chunkPoints * 3);
        const chunkNormals = normals ? new Float32Array(chunkPoints * 3) : null;

        for (let i = 0; i < chunkPoints; i++) {
            const srcIdx = startIdx + i;
            
            chunkPositions[i * 3] = positions.getX(srcIdx);
            chunkPositions[i * 3 + 1] = positions.getY(srcIdx);
            chunkPositions[i * 3 + 2] = positions.getZ(srcIdx);

            if (colors) {
                chunkColors[i * 3] = colors.getX(srcIdx);
                chunkColors[i * 3 + 1] = colors.getY(srcIdx);
                chunkColors[i * 3 + 2] = colors.getZ(srcIdx);
            } else {
                chunkColors[i * 3] = 1;
                chunkColors[i * 3 + 1] = 1;
                chunkColors[i * 3 + 2] = 1;
            }

            if (chunkNormals && normals) {
                chunkNormals[i * 3] = normals.getX(srcIdx);
                chunkNormals[i * 3 + 1] = normals.getY(srcIdx);
                chunkNormals[i * 3 + 2] = normals.getZ(srcIdx);
            }
        }

        // Send chunk with transferable arrays for better performance
        postMessage({
            type: 'chunk',
            filename,
            positions: chunkPositions,
            colors: chunkColors,
            normals: chunkNormals,
            isFirst: sentPoints === 0,
            isLast: endIdx >= totalPoints,
            totalPoints,
            chunkStart: sentPoints,
            chunkEnd: endIdx,
            wasDownsampled
        }, [chunkPositions.buffer, chunkColors.buffer, chunkNormals ? chunkNormals.buffer : null].filter(Boolean));

        sentPoints = endIdx;
    }
}

/**
 * Helper functions
 */
function ensureGeometryHasNormals(geometry) {
    if (!geometry.attributes.normal) {
        geometry.computeVertexNormals();
    }
}

function createDefaultColors(count) {
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
        colors[i] = 1.0;
    }
    return colors;
}

/**
 * Worker message handler
 */
self.onmessage = function(e) {
    const { type, url, filename, centerOffset, qualityMode } = e.data;

    if (type === 'load') {
        loadAndProcessPLY(url, filename, centerOffset, qualityMode);
    }
};
