/**
 * QUICK TUNING GUIDE - Grid-Based Downsampling
 * =============================================
 * 
 * All configurations in: src/workers/plyLoader.worker.js
 */

// ===========================================
// MAIN CONFIGURATION PARAMETERS
// ===========================================

// 1. GRID_SIZE - Controls point density
const GRID_SIZE = 0.015;
/*
 * Smaller = More points (higher quality, slower)
 * Larger = Fewer points (faster, less detail)
 * 
 * Quick reference:
 * - 0.01  = High quality (keep ~90% more points)
 * - 0.015 = Balanced (recommended)
 * - 0.02  = Performance mode (faster loading)
 * - 0.03  = Aggressive reduction
 * 
 * Formula: Points ≈ (ModelVolume / GRID_SIZE³)
 */

// 2. DOWNSAMPLE_THRESHOLD - When to start downsampling
const DOWNSAMPLE_THRESHOLD = 500000;
/*
 * Start downsampling when point count exceeds this value
 * 
 * Recommendations:
 * - Mobile devices: 250,000 - 500,000
 * - Desktop: 500,000 - 1,000,000
 * - High-end workstations: 1,000,000+
 */

// 3. GLOBAL_MIN_BOUNDS - Grid alignment origin
const GLOBAL_MIN_BOUNDS = {
    x: -1000.0,
    y: -1000.0,
    z: -1000.0
};
/*
 * Adjust only if your models are positioned far from origin
 * Should encompass the minimum coordinates of ALL your models
 * 
 * Example: If all models are between [-500, 500] in each axis:
 * GLOBAL_MIN_BOUNDS = { x: -500, y: -500, z: -500 }
 */

// ===========================================
// ADVANCED OPTIONS
// ===========================================

// 4. CHUNK_SIZE - Progressive loading chunk size
const CHUNK_SIZE = 50000;
/*
 * Number of points sent per chunk to main thread
 * 
 * Smaller = Smoother loading progress (more overhead)
 * Larger = Faster loading (less frequent updates)
 * 
 * Recommended: 25,000 - 100,000
 */

// 5. USE_RANDOM_SELECTION - Point selection strategy
const USE_RANDOM_SELECTION = false;
/*
 * IMPORTANT: Keep this FALSE for cross-device consistency!
 * 
 * false = Deterministic (first point in each voxel)
 * true = Random (different results each time) - NOT RECOMMENDED
 */

// ===========================================
// TROUBLESHOOTING
// ===========================================

/*
 * TOO MANY POINTS AFTER DOWNSAMPLING?
 * → Increase GRID_SIZE (try doubling it)
 * → Lower DOWNSAMPLE_THRESHOLD to trigger earlier
 * 
 * TOO FEW POINTS (LOSING DETAIL)?
 * → Decrease GRID_SIZE (try halving it)
 * → Increase DOWNSAMPLE_THRESHOLD to preserve more
 * 
 * DIFFERENT RESULTS ON DIFFERENT DEVICES?
 * → Verify GRID_SIZE is identical
 * → Ensure USE_RANDOM_SELECTION = false
 * → Check GLOBAL_MIN_BOUNDS match
 * 
 * SLOW LOADING PERFORMANCE?
 * → Increase GRID_SIZE for fewer points
 * → Increase CHUNK_SIZE for less overhead
 * → Lower DOWNSAMPLE_THRESHOLD to downsample earlier
 * 
 * CHOPPY LOADING ANIMATION?
 * → Decrease CHUNK_SIZE for more frequent updates
 */

// ===========================================
// EXAMPLE PRESETS
// ===========================================

// PRESET 1: Maximum Quality (slow but detailed)
// const GRID_SIZE = 0.008;
// const DOWNSAMPLE_THRESHOLD = 1500000;

// PRESET 2: Balanced (recommended default)
// const GRID_SIZE = 0.015;
// const DOWNSAMPLE_THRESHOLD = 500000;

// PRESET 3: Performance (fast loading)
// const GRID_SIZE = 0.025;
// const DOWNSAMPLE_THRESHOLD = 250000;

// PRESET 4: Mobile-Optimized
// const GRID_SIZE = 0.03;
// const DOWNSAMPLE_THRESHOLD = 150000;

// ===========================================
// EXPECTED RESULTS
// ===========================================

/*
 * With GRID_SIZE = 0.015:
 * 
 * Input: 2,000,000 points
 * Output: ~150,000 - 200,000 points (92-93% reduction)
 * 
 * Input: 1,000,000 points
 * Output: ~75,000 - 100,000 points (90-93% reduction)
 * 
 * Input: 500,000 points
 * Output: ~40,000 - 50,000 points (90-92% reduction)
 * 
 * Actual results depend on point cloud density distribution
 */
