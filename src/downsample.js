import * as THREE from 'three';

// These can be used for downsample: 'none', 'random', 'grid', or 'distance'
//In my opinion, grid is the best balance
const DOWNSAMPLE_METHOD = 'grid'; // Default method (grid is good balance of speed/quality)
const DOWNSAMPLE_RATIO = 0.03; // For random sampling (0.5 = 50% of points)
const GRID_SIZE = 0.03; // For grid sampling
const MIN_DISTANCE = 0.01; // For distance sampling

/**
 * Automatically downsamples geometry when loaded
 * Called directly during geometry processing
 */
export function downsampleGeometry(geometry, method = DOWNSAMPLE_METHOD) {
    if (method === 'none') {
        return geometry;
    }
    
    const positions = geometry.attributes.position;
    const colors = geometry.attributes.color;
    const normals = geometry.attributes.normal;
    
    let indices = [];
    
    if (method === 'random') {
        // Random sampling
        for (let i = 0; i < positions.count; i++) {
            if (Math.random() < DOWNSAMPLE_RATIO) {
                indices.push(i);
            }
        }
    } else if (method === 'grid') {
        // Grid-based sampling
        const grid = new Map();
        
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);
            
            // Calculate grid cell
            const cellX = Math.floor(x / GRID_SIZE);
            const cellY = Math.floor(y / GRID_SIZE);
            const cellZ = Math.floor(z / GRID_SIZE);
            const cellKey = `${cellX},${cellY},${cellZ}`;
            
            // Keep first point in each cell
            if (!grid.has(cellKey)) {
                grid.set(cellKey, i);
                indices.push(i);
            }
        }
    } else if (method === 'distance') {
        // Distance-based sampling with spatial grid optimization
        const minDistSq = MIN_DISTANCE * MIN_DISTANCE;
        const grid = new Map();
        const cellSize = MIN_DISTANCE; // Use MIN_DISTANCE as cell size
        
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);
            
            // Calculate grid cell
            const cellX = Math.floor(x / cellSize);
            const cellY = Math.floor(y / cellSize);
            const cellZ = Math.floor(z / cellSize);
            
            // Check neighboring cells (3x3x3 = 27 cells)
            let tooClose = false;
            for (let dx = -1; dx <= 1 && !tooClose; dx++) {
                for (let dy = -1; dy <= 1 && !tooClose; dy++) {
                    for (let dz = -1; dz <= 1 && !tooClose; dz++) {
                        const neighborKey = `${cellX + dx},${cellY + dy},${cellZ + dz}`;
                        const neighborIndices = grid.get(neighborKey);
                        
                        if (neighborIndices) {
                            for (const prevIdx of neighborIndices) {
                                const dx2 = x - positions.getX(prevIdx);
                                const dy2 = y - positions.getY(prevIdx);
                                const dz2 = z - positions.getZ(prevIdx);
                                const distSq = dx2*dx2 + dy2*dy2 + dz2*dz2;
                                
                                if (distSq < minDistSq) {
                                    tooClose = true;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            
            if (!tooClose) {
                // Add point to its cell
                const cellKey = `${cellX},${cellY},${cellZ}`;
                if (!grid.has(cellKey)) {
                    grid.set(cellKey, []);
                }
                grid.get(cellKey).push(i);
                indices.push(i);
            }
        }
    }
    
    // Create new geometry with selected points
    const newPositions = new Float32Array(indices.length * 3);
    const newColors = new Float32Array(indices.length * 3);
    const newNormals = normals ? new Float32Array(indices.length * 3) : null;
    
    for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        
        newPositions[i * 3] = positions.getX(idx);
        newPositions[i * 3 + 1] = positions.getY(idx);
        newPositions[i * 3 + 2] = positions.getZ(idx);
        
        if (colors) {
            newColors[i * 3] = colors.getX(idx);
            newColors[i * 3 + 1] = colors.getY(idx);
            newColors[i * 3 + 2] = colors.getZ(idx);
        }
        
        if (normals && newNormals) {
            newNormals[i * 3] = normals.getX(idx);
            newNormals[i * 3 + 1] = normals.getY(idx);
            newNormals[i * 3 + 2] = normals.getZ(idx);
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
    
    console.log(`Downsampled from ${positions.count} to ${indices.length} points (${(indices.length / positions.count * 100).toFixed(1)}%)`);
    
    return newGeometry;
}