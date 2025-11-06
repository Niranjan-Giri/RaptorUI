import * as THREE from 'three';

// Grid-based downsampling configuration
const GRID_SIZE = 0.015; // Size of each grid cell - smaller = more detail, larger = more downsampling
const DOWNSAMPLE_THRESHOLD = 5000000; // Only downsample if points exceed this number
const USE_AVERAGING = true; // Average points in each cell instead of just keeping first point

/**
 * Downsamples geometry using improved grid-based sampling
 * - Only applies downsampling if points exceed DOWNSAMPLE_THRESHOLD
 * - Uses spatial grid to reduce points while preserving structure
 * - Optionally averages points within each cell for better quality
 */
export function downsampleGeometry(geometry) {
    const positions = geometry.attributes.position;
    
    // Check if the number of points exceeds the threshold
    if (positions.count <= DOWNSAMPLE_THRESHOLD) {
        console.log(`Skipping downsampling: ${positions.count} points (threshold: ${DOWNSAMPLE_THRESHOLD})`);
        return geometry;
    }
    
    const colors = geometry.attributes.color;
    const normals = geometry.attributes.normal;
    
    // Improved grid-based sampling
    const grid = new Map();
    
    // First pass: collect all points in each cell
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);
        
        // Calculate grid cell
        const cellX = Math.floor(x / GRID_SIZE);
        const cellY = Math.floor(y / GRID_SIZE);
        const cellZ = Math.floor(z / GRID_SIZE);
        const cellKey = `${cellX},${cellY},${cellZ}`;
        
        if (!grid.has(cellKey)) {
            grid.set(cellKey, []);
        }
        grid.get(cellKey).push(i);
    }
    
    // Second pass: process each cell
    const resultPoints = [];
    
    for (const [cellKey, pointIndices] of grid.entries()) {
        if (USE_AVERAGING && pointIndices.length > 1) {
            // Average all points in the cell for better quality
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
            // Just use the first point in the cell
            const idx = pointIndices[0];
            resultPoints.push({
                position: [positions.getX(idx), positions.getY(idx), positions.getZ(idx)],
                color: colors ? [colors.getX(idx), colors.getY(idx), colors.getZ(idx)] : [1, 1, 1],
                normal: normals ? [normals.getX(idx), normals.getY(idx), normals.getZ(idx)] : null
            });
        }
    }
    
    // Create new geometry with processed points
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
    
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
    newGeometry.setAttribute('color', new THREE.BufferAttribute(newColors, 3));
    if (newNormals) {
        newGeometry.setAttribute('normal', new THREE.BufferAttribute(newNormals, 3));
    } else {
        newGeometry.computeVertexNormals();
    }
    
    console.log(`Downsampled from ${positions.count} to ${resultPoints.length} points (${(resultPoints.length / positions.count * 100).toFixed(1)}%)`);
    
    return newGeometry;
}