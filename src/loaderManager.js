/**
 * Manages Web Worker-based PLY file loading
 * Coordinates multiple workers and streams data to the main thread
 */

import * as THREE from 'three';

export class LoaderManager {
    constructor(onFileLoaded, onFileProgress, onFileError) {
        this.onFileLoaded = onFileLoaded;
        this.onFileProgress = onFileProgress;
        this.onFileError = onFileError;
        
        this.workers = [];
        this.maxWorkers = navigator.hardwareConcurrency || 4;
        this.activeLoads = new Map(); // filename -> {geometry chunks, worker}
        this.loadQueue = [];
        this.pendingUpdates = new Map(); // Throttle updates per file
        this.updateInterval = 500; // Minimum ms between updates
        this.qualityMode = 'downsampled'; // 'downsampled' or 'original'
    }

    /**
     * Set quality mode for loading
     */
    setQualityMode(mode) {
        this.qualityMode = mode;
    }

    /**
     * Load a PLY file using a web worker
     */
    loadPLY(filepath, filename) {
        return new Promise((resolve, reject) => {
            const loadTask = {
                filepath,
                filename,
                resolve,
                reject
            };

            this.loadQueue.push(loadTask);
            this.processQueue();
        });
    }

    /**
     * Process the load queue
     */
    processQueue() {
        // Start as many loads as we have workers available
        while (this.loadQueue.length > 0 && this.workers.length < this.maxWorkers) {
            const task = this.loadQueue.shift();
            this.startLoad(task);
        }
    }

    /**
     * Start loading a file with a worker
     */
    startLoad(task) {
        const { filepath, filename, resolve, reject } = task;

        // Create worker
        const worker = new Worker(
            new URL('./workers/plyLoader.worker.js', import.meta.url),
            { type: 'module' }
        );

        // Initialize load state
        this.activeLoads.set(filename, {
            worker,
            chunks: [],
            totalPoints: 0,
            receivedPoints: 0,
            resolve,
            reject,
            startTime: performance.now()
        });

        // Handle worker messages
        worker.onmessage = (e) => this.handleWorkerMessage(filename, e.data);
        worker.onerror = (error) => {
            console.error(`Worker error for ${filename}:`, error);
            this.cleanupLoad(filename);
            reject(error);
            if (this.onFileError) {
                this.onFileError(filename, error.message);
            }
        };

        // Start the load
        worker.postMessage({
            type: 'load',
            url: filepath,
            filename,
            centerOffset: null,
            qualityMode: this.qualityMode
        });

        this.workers.push(worker);
        
        console.log(`[LoaderManager] Started loading ${filename} with worker`);
    }

    /**
     * Handle messages from worker
     */
    handleWorkerMessage(filename, data) {
        const loadState = this.activeLoads.get(filename);
        if (!loadState) return;

        switch (data.type) {
            case 'metadata':
                loadState.totalPoints = data.totalPoints;
                console.log(`[${filename}] Total points: ${data.totalPoints.toLocaleString()}`);
                break;

            case 'progress':
                if (this.onFileProgress) {
                    this.onFileProgress(filename, data.message, data.progress);
                }
                break;

            case 'chunk':
                this.handleChunk(filename, data);
                break;

            case 'complete':
                this.completeLoad(filename);
                break;

            case 'error':
                console.error(`[${filename}] Error:`, data.error);
                this.cleanupLoad(filename);
                loadState.reject(new Error(data.error));
                if (this.onFileError) {
                    this.onFileError(filename, data.error);
                }
                break;
        }
    }

    /**
     * Handle a geometry chunk from worker
     */
    handleChunk(filename, chunkData) {
        const loadState = this.activeLoads.get(filename);
        if (!loadState) return;

        const {
            positions,
            colors,
            normals,
            isFirst,
            isLast,
            totalPoints,
            chunkStart,
            chunkEnd,
            wasDownsampled
        } = chunkData;

        // Store chunk
        loadState.chunks.push({
            positions,
            colors,
            normals
        });

        loadState.receivedPoints = chunkEnd;

        // If this is the first chunk, immediately create preview geometry
        if (isFirst) {
            const previewGeometry = this.createGeometryFromChunks([loadState.chunks[0]]);
            
            if (this.onFileLoaded) {
                this.onFileLoaded(filename, previewGeometry, {
                    isPreview: !isLast,
                    totalExpectedPoints: totalPoints,
                    wasDownsampled
                });
            }
            
            // Mark the last update time
            this.pendingUpdates.set(filename, Date.now());
        }

        // Report progress
        const progress = (chunkEnd / totalPoints) * 100;
        if (this.onFileProgress) {
            this.onFileProgress(
                filename,
                `Loading: ${chunkEnd.toLocaleString()} / ${totalPoints.toLocaleString()} points`,
                progress
            );
        }

        // Throttled incremental updates - only update if enough time has passed
        if (!isFirst && !isLast) {
            const lastUpdate = this.pendingUpdates.get(filename) || 0;
            const now = Date.now();
            
            if (now - lastUpdate >= this.updateInterval) {
                // Schedule update during idle time to avoid blocking interactions
                this.scheduleIdleUpdate(filename, loadState, totalPoints, wasDownsampled);
                this.pendingUpdates.set(filename, now);
            }
        }
    }

    /**
     * Schedule geometry update during browser idle time
     */
    scheduleIdleUpdate(filename, loadState, totalPoints, wasDownsampled) {
        // Use requestIdleCallback if available, otherwise setTimeout
        const scheduleFunc = window.requestIdleCallback || ((cb) => setTimeout(cb, 16));
        
        scheduleFunc(() => {
            // Check if load is still active
            if (!this.activeLoads.has(filename)) return;
            
            const incrementalGeometry = this.createGeometryFromChunks(loadState.chunks);
            
            if (this.onFileLoaded) {
                this.onFileLoaded(filename, incrementalGeometry, {
                    isPreview: true,
                    totalExpectedPoints: totalPoints,
                    wasDownsampled,
                    isIdleUpdate: true // Flag to indicate this is a background update
                });
            }
        }, { timeout: 100 });
    }

    /**
     * Complete the load and create final geometry
     */
    completeLoad(filename) {
        const loadState = this.activeLoads.get(filename);
        if (!loadState) return;

        const elapsedTime = ((performance.now() - loadState.startTime) / 1000).toFixed(2);
        
        // Create final geometry from all chunks
        const finalGeometry = this.createGeometryFromChunks(loadState.chunks);
        
        console.log(`[${filename}] Loaded in ${elapsedTime}s - ${loadState.receivedPoints.toLocaleString()} points`);

        // Resolve promise
        loadState.resolve(finalGeometry);

        // Send final callback
        if (this.onFileLoaded) {
            this.onFileLoaded(filename, finalGeometry, {
                isPreview: false,
                totalExpectedPoints: loadState.totalPoints,
                wasDownsampled: loadState.receivedPoints < loadState.totalPoints
            });
        }

        // Cleanup
        this.cleanupLoad(filename);

        // Process next item in queue
        this.processQueue();
    }

    /**
     * Create THREE.BufferGeometry from chunks
     */
    createGeometryFromChunks(chunks) {
        // Calculate total size
        let totalPoints = 0;
        for (const chunk of chunks) {
            totalPoints += chunk.positions.length / 3;
        }

        // Allocate arrays
        const positions = new Float32Array(totalPoints * 3);
        const colors = new Float32Array(totalPoints * 3);
        const normals = chunks[0].normals ? new Float32Array(totalPoints * 3) : null;

        // Merge chunks
        let offset = 0;
        for (const chunk of chunks) {
            const chunkSize = chunk.positions.length;
            
            positions.set(chunk.positions, offset);
            colors.set(chunk.colors, offset);
            if (normals && chunk.normals) {
                normals.set(chunk.normals, offset);
            }
            
            offset += chunkSize;
        }

        // Create geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        if (normals) {
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        } else {
            geometry.computeVertexNormals();
        }

        geometry.computeBoundingBox();

        return geometry;
    }

    /**
     * Cleanup after load completes or fails
     */
    cleanupLoad(filename) {
        const loadState = this.activeLoads.get(filename);
        if (!loadState) return;

        // Terminate worker
        if (loadState.worker) {
            loadState.worker.terminate();
            const workerIndex = this.workers.indexOf(loadState.worker);
            if (workerIndex > -1) {
                this.workers.splice(workerIndex, 1);
            }
        }

        // Clear chunks to free memory
        loadState.chunks = [];
        
        this.activeLoads.delete(filename);
        this.pendingUpdates.delete(filename);
    }

    /**
     * Cancel all active loads
     */
    cancelAll() {
        for (const [filename, loadState] of this.activeLoads.entries()) {
            if (loadState.worker) {
                loadState.worker.terminate();
            }
            loadState.reject(new Error('Load cancelled'));
        }
        
        this.activeLoads.clear();
        this.workers = [];
        this.loadQueue = [];
    }

    /**
     * Get load progress for a file
     */
    getProgress(filename) {
        const loadState = this.activeLoads.get(filename);
        if (!loadState) return null;

        return {
            received: loadState.receivedPoints,
            total: loadState.totalPoints,
            percentage: loadState.totalPoints > 0 
                ? (loadState.receivedPoints / loadState.totalPoints) * 100 
                : 0
        };
    }
}
