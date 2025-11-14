import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { LoaderManager } from './loaderManager.js';

let scene, camera, renderer, controls, transformControl;
let currentMode = 'orbit';
let raycaster, mouse;

// Web Worker loader manager
let loaderManager;

// Changed to support multiple files
let loadedFiles = new Map(); // Store in the format filename: { geometry, object, visible, originalColors, codedColors, filepath }
let renderMode = 'points';
let colorMode = 'original'; // 'original' or 'coded'
let ambientLight = null;
let directionalLight = null;
let selectedFile = null;
//This will be for the information of the selected objects
let infoIcon = null; 

const plyFiles = [
    '/B3_S4.ply',
    '/B3_S2.ply',
    '/B3_S5.ply',
];

// Initialize loader manager
loaderManager = new LoaderManager(
    handleFileLoaded,
    handleFileProgress,
    handleFileError
);

init();
loadAllPLYFiles();
setupMenuControls();
createFileCheckboxes();
createInfoIcon();
createInfoModal();

function init() 
{
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202020);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 2);

    renderer = new THREE.WebGLRenderer
    ({ 
        antialias: true, 
        alpha: true, 
        powerPreference: "high-performance"
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;                    
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;   
    renderer.setPixelRatio(window.devicePixelRatio);     
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    
    // Initialize TransformControls
    transformControl = new TransformControls(camera, renderer.domElement);
    transformControl.setMode('translate'); // Default to translate mode
    transformControl.addEventListener('dragging-changed', function (event) {
        // Disable orbit controls while dragging
        controls.enabled = !event.value;
    });
    scene.add(transformControl);

    raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 0.01;
    mouse = new THREE.Vector2();

    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener('click', onCanvasClick);
    
    // Keyboard shortcuts for transform controls
    window.addEventListener('keydown', onKeyDown);
    
    // Update info icon position on render
    renderer.domElement.addEventListener('mousemove', updateInfoIconPosition);

    // Start render loop immediately so previews can appear as soon as they are ready
    animate();
}

function createInfoIcon() {
    infoIcon = document.createElement('div');
    infoIcon.id = 'info-icon';
    infoIcon.innerHTML = '&#9432;';
    infoIcon.style.position = 'absolute';
    infoIcon.style.width = '24px';
    infoIcon.style.height = '24px';
    infoIcon.style.borderRadius = '50%';
    infoIcon.style.backgroundColor = 'rgba(33, 150, 243, 0.9)';
    infoIcon.style.color = 'white';
    infoIcon.style.display = 'none';
    infoIcon.style.justifyContent = 'center';
    infoIcon.style.alignItems = 'center';
    infoIcon.style.cursor = 'pointer';
    infoIcon.style.fontWeight = 'bold';
    infoIcon.style.fontSize = '16px';
    infoIcon.style.fontFamily = 'Arial, sans-serif';
    infoIcon.style.border = '2px solid white';
    infoIcon.style.zIndex = '1000';
    infoIcon.style.pointerEvents = 'auto';
    infoIcon.style.transition = 'all 0.2s ease';
    
    infoIcon.addEventListener('mouseenter', () => {
        infoIcon.style.transform = 'scale(1.1)';
        infoIcon.style.backgroundColor = 'rgba(33, 150, 243, 1)';
    });
    
    infoIcon.addEventListener('mouseleave', () => {
        infoIcon.style.transform = 'scale(1)';
        infoIcon.style.backgroundColor = 'rgba(33, 150, 243, 0.9)';
    });
    
    infoIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        showInfoModal();
    });
    
    document.body.appendChild(infoIcon);
}

function createInfoModal() {
    const modal = document.createElement('div');
    modal.id = 'info-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    modal.style.display = 'none';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '10000';
    modal.style.backdropFilter = 'blur(5px)';
    
    const modalContent = document.createElement('div');
    modalContent.style.backgroundColor = '#2a2a2a';
    modalContent.style.padding = '30px';
    modalContent.style.borderRadius = '12px';
    modalContent.style.maxWidth = '500px';
    modalContent.style.width = '90%';
    modalContent.style.maxHeight = '80vh';
    modalContent.style.overflow = 'auto';
    modalContent.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.5)';
    modalContent.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    
    const closeBtn = document.createElement('span');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.float = 'right';
    closeBtn.style.fontSize = '32px';
    closeBtn.style.fontWeight = 'bold';
    closeBtn.style.color = '#aaa';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.lineHeight = '20px';
    closeBtn.style.transition = 'color 0.2s';
    
    closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.color = '#fff';
    });
    
    closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.color = '#aaa';
    });
    
    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    const contentDiv = document.createElement('div');
    contentDiv.id = 'modal-content-info';
    contentDiv.style.color = '#fff';
    contentDiv.style.marginTop = '20px';
    
    modalContent.appendChild(closeBtn);
    modalContent.appendChild(contentDiv);
    modal.appendChild(modalContent);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    document.body.appendChild(modal);
}

function showInfoModal() {
    if (!selectedFile) return;
    
    const fileData = loadedFiles.get(selectedFile);
    if (!fileData) return;
    
    const modal = document.getElementById('info-modal');
    const contentDiv = document.getElementById('modal-content-info');
    
    // Get object information
    const geometry = fileData.geometry;
    const object = fileData.object;
    
    const vertexCount = geometry.attributes.position.count;
    const position = object.position;
    const rotation = object.rotation;
    const scale = object.scale;
    
    // Calculate bounding box info
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    const size = new THREE.Vector3();
    bbox.getSize(size);
    
    // Build HTML content
    let html = `
        <h2 style="margin-top: 0; color: #4CAF50; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">
            Object Information
        </h2>
        <div style="line-height: 1.8;">
            <p><strong style="color: #2196F3;">File Name:</strong> ${selectedFile}</p>
            <p><strong style="color: #2196F3;">File Path:</strong> ${fileData.filepath}</p>
            <p><strong style="color: #2196F3;">Render Mode:</strong> ${renderMode === 'points' ? 'Point Cloud' : '3D Mesh'}</p>
            <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 15px 0;">
            
            <h3 style="color: #FF9800; margin-bottom: 10px;">Geometry</h3>
            <p><strong>Vertex Count:</strong> ${vertexCount.toLocaleString()}</p>
            <p><strong>Bounding Box Size:</strong></p>
            <ul style="margin-left: 20px;">
                <li>Width (X): ${size.x.toFixed(4)}</li>
                <li>Height (Y): ${size.y.toFixed(4)}</li>
                <li>Depth (Z): ${size.z.toFixed(4)}</li>
            </ul>
            
            <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 15px 0;">
            
            <h3 style="color: #FF9800; margin-bottom: 10px;">Transform</h3>
            <p><strong>Position:</strong></p>
            <ul style="margin-left: 20px;">
                <li>X: ${position.x.toFixed(4)}</li>
                <li>Y: ${position.y.toFixed(4)}</li>
                <li>Z: ${position.z.toFixed(4)}</li>
            </ul>
            
            <p><strong>Rotation (radians):</strong></p>
            <ul style="margin-left: 20px;">
                <li>X: ${rotation.x.toFixed(4)}</li>
                <li>Y: ${rotation.y.toFixed(4)}</li>
                <li>Z: ${rotation.z.toFixed(4)}</li>
            </ul>
            
            <p><strong>Scale:</strong></p>
            <ul style="margin-left: 20px;">
                <li>X: ${scale.x.toFixed(4)}</li>
                <li>Y: ${scale.y.toFixed(4)}</li>
                <li>Z: ${scale.z.toFixed(4)}</li>
            </ul>
        </div>
    `;
    
    contentDiv.innerHTML = html;
    modal.style.display = 'flex';
}

function updateInfoIconPosition() {
    if (!selectedFile || !infoIcon) return;
    
    const fileData = loadedFiles.get(selectedFile);
    if (!fileData || !fileData.object || !fileData.visible) {
        infoIcon.style.display = 'none';
        return;
    }
    
    // Get the object's bounding box in world space
    const geometry = fileData.geometry;
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    
    // I am placing the info icon a little bit in the right of the selected object
    const cornerPosition = new THREE.Vector3(
        bbox.max.x,
        bbox.max.y,
        bbox.max.z
    );
    
    // Apply the object's world transform to the corner
    fileData.object.localToWorld(cornerPosition);
    
    // Project to screen space
    const screenPosition = cornerPosition.clone().project(camera);
    
    // Convert to pixel coordinates
    const x = (screenPosition.x * 0.5 + 0.5) * window.innerWidth;
    const y = (screenPosition.y * -0.5 + 0.5) * window.innerHeight;
    
    // Check if object is in front of camera
    if (screenPosition.z < 1) {
        infoIcon.style.display = 'flex';
        infoIcon.style.left = `${x + 10}px`;
        infoIcon.style.top = `${y - 10}px`;
    } else {
        infoIcon.style.display = 'none';
    }
}

function setupMenuControls() 
{
    // Mode buttons
    document.getElementById('btn-orbit').addEventListener('click', () => setMode('orbit'));
    document.getElementById('btn-pan').addEventListener('click', () => setMode('pan'));
    document.getElementById('btn-select').addEventListener('click', () => setMode('select'));
    
    // Zoom buttons
    document.getElementById('btn-zoom-in').addEventListener('click', zoomIn);
    document.getElementById('btn-zoom-out').addEventListener('click', zoomOut);
    document.getElementById('btn-reset').addEventListener('click', resetView);

    // Render mode buttons
    document.getElementById('btn-point-cloud').addEventListener('click', () => setRenderMode('points'));
    document.getElementById('btn-3d-mesh').addEventListener('click', () => setRenderMode('mesh'));
    
    // Color mode buttons
    document.getElementById('btn-original-color').addEventListener('click', () => setColorMode('original'));
    document.getElementById('btn-coded-color').addEventListener('click', () => setColorMode('coded'));
    
    // Query input and send button
    const queryInput = document.getElementById('query-input');
    const querySendBtn = document.getElementById('query-send-btn');
    
    querySendBtn.addEventListener('click', handleQuerySend);
    
    // Allow Enter key to send query
    queryInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleQuerySend();
        }
    });
}

function setMode(mode) 
{
    currentMode = mode;
    
    // Update button states - remove active from both control-btn and icon-btn
    document.querySelectorAll('.control-btn, .icon-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (mode === 'orbit') 
    {
        document.getElementById('btn-orbit').classList.add('active');
        controls.enableRotate = true;
        controls.enablePan = false;
        controls.enabled = true;
        // Deselect and disable transform when leaving select mode
        deselectFile();
        renderer.domElement.style.cursor = 'grab';  
    } 
    else if (mode === 'pan') 
    {
        document.getElementById('btn-pan').classList.add('active');
        controls.enableRotate = false;
        controls.enablePan = true;
        controls.enabled = true;
        // Deselect and disable transform when leaving select mode
        deselectFile();
        renderer.domElement.style.cursor = 'move';
    } 
    else if (mode === 'select') 
    {
        document.getElementById('btn-select').classList.add('active');
        controls.enableRotate = false;
        controls.enablePan = false;
        
        controls.enabled = true;
       
        renderer.domElement.style.cursor = 'crosshair';
    }
}

function setColorMode(mode) {
    colorMode = mode;
    
    // Update button states
    if (mode === 'original') {
        document.getElementById('btn-original-color').classList.add('active');
        document.getElementById('btn-coded-color').classList.remove('active');
    } else {
        document.getElementById('btn-original-color').classList.remove('active');
        document.getElementById('btn-coded-color').classList.add('active');
    }
    
    // Re-apply colors to all loaded files
    loadedFiles.forEach((fileData, filename) => {
        applyColorMode(fileData.geometry, filename);
        updateFileRender(filename);
    });
}

function setRenderMode(mode) 
{
    renderMode = mode;
    
    // Update button states
    if (mode === 'points') 
    {
        document.getElementById('btn-point-cloud').classList.add('active');
        document.getElementById('btn-3d-mesh').classList.remove('active');
    } 
    else 
    {
        document.getElementById('btn-point-cloud').classList.remove('active');
        document.getElementById('btn-3d-mesh').classList.add('active');
    }
    
    // Re-render all files with new mode
    loadedFiles.forEach((fileData, filename) => {
        updateFileRender(filename);
    });
}

function zoomIn() 
{
    camera.position.multiplyScalar(0.8);
    controls.update();
}

function zoomOut() 
{
    camera.position.multiplyScalar(1.2);
    controls.update();
}

function resetView() 
{
    camera.position.set(0, 0, 2);
    controls.target.set(0, 0, 0);
    controls.update();
}

function handleQuerySend() {
    const queryInput = document.getElementById('query-input');
    const query = queryInput.value.trim();
    
    if (query === '') {
        console.log('Empty query');
        return;
    }
    
    console.log('Query submitted:', query);
    
    // TODO: Connect to backend LLM here
    // For now, just log the query
    
    // Clear input after sending
    queryInput.value = '';
}

function onCanvasClick(event) 
{
    if (currentMode !== 'select') return;
    
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    
    // Only check loaded file objects, not transform controls
    const objectsToCheck = [];
    loadedFiles.forEach((fileData) => {
        if (fileData.object && fileData.visible) {
            objectsToCheck.push(fileData.object);
        }
    });
    
    const intersects = raycaster.intersectObjects(objectsToCheck, false);
    
    if (intersects.length > 0) {
        // Find which file was clicked
        const clickedObject = intersects[0].object;
        
        // Deselect previous selection
        if (selectedFile) {
            const prevData = loadedFiles.get(selectedFile);
            if (prevData && prevData.object) {
                // Reset material color
                if (renderMode === 'points') {
                    prevData.object.material.vertexColors = true;
                    prevData.object.material.color.set(0xffffff);
                    prevData.object.material.needsUpdate = true;
                }
            }
        }
        
        // Find the file that owns this object
        for (const [filename, fileData] of loadedFiles.entries()) {
            if (fileData.object === clickedObject) {
                selectedFile = filename;
                console.log('Selected file:', filename);
                console.log('Selected point:', intersects[0].point);
                
                // Highlight selected object
                if (renderMode === 'points') {
                    clickedObject.material.vertexColors = false;
                    clickedObject.material.color.set(0xffffff);
                    clickedObject.material.needsUpdate = true;
                }
                
                // Attach transform controls to selected object
                transformControl.attach(clickedObject);
                transformControl.enabled = true;
                transformControl.visible = true;
                
                // Update UI to show selection
                updateObjectLabelsUI();
                break;
            }
        }
    } else {
        // Clicked on empty space - deselect
        deselectFile();
    }
}

function updateFileRender(filename) 
{
    const fileData = loadedFiles.get(filename);
    if (!fileData) return;
    
    // Remove current object if exists
    if (fileData.object) 
    {
        scene.remove(fileData.object);
    }
    
    // Don't render if not visible
    if (!fileData.visible) return;
    
    if (renderMode === 'points') 
    {
        const material = new THREE.PointsMaterial({
            size: 0.005,
            vertexColors: true,
            color: 0xffffff
        });
        fileData.object = new THREE.Points(fileData.geometry, material);  
        fileData.object.castShadow = true;
        fileData.object.receiveShadow = true;    
    } 
    else 
    {
        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            flatShading: false,
            side: THREE.DoubleSide,
            roughness: 0.7,
            metalness: 0.0,
            envMapIntensity: 1.0
        });
        fileData.object = new THREE.Mesh(fileData.geometry, material);
        fileData.object.castShadow = true;
        fileData.object.receiveShadow = true;
        
        // Add lights for mesh rendering
        if (!ambientLight) 
        {
            ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
            scene.add(ambientLight);
            
            directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(5, 5, 5);
            directionalLight.castShadow = true;
            directionalLight.shadow.mapSize.width = 2048;
            directionalLight.shadow.mapSize.height = 2048;
            scene.add(directionalLight);

            const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
            fillLight.position.set(-5, 0, -5);
            scene.add(fillLight);
        }
    }
    
    scene.add(fileData.object);
}

function loadAllPLYFiles() 
{
    console.log('[Main] Starting to load PLY files with Web Workers...');
    
    plyFiles.forEach((filepath) => {
        const filename = filepath.split('/').pop();
        
        // Initialize file entry with loading state
        loadedFiles.set(filename, {
            geometry: null,
            object: null,
            visible: true,
            originalColors: null,
            codedColors: null,
            filepath: filepath,
            isPreview: true,
            loading: true
        });

        // Start loading with worker
        loaderManager.loadPLY(filepath, filename);
    });
    
    // Update UI to show loading state
    createFileCheckboxes();
}

/**
 * Callback when file data is loaded (called for previews and final data)
 */
function handleFileLoaded(filename, geometry, metadata) {
    const { isPreview, totalExpectedPoints, wasDownsampled } = metadata;
    
    const fileData = loadedFiles.get(filename);
    if (!fileData) {
        console.warn(`File ${filename} not found in loadedFiles`);
        return;
    }

    // Ensure geometry has all required attributes
    ensureGeometryHasNormals(geometry);
    if (!geometry.attributes.color) {
        const defaultColors = createDefaultColors(geometry.attributes.position.count);
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(defaultColors, 3));
    }

    // Store colors
    const originalColors = geometry.attributes.color.array.slice();
    const codedColors = createCodedColors(geometry);

    // Update file data
    loadedFiles.set(filename, {
        ...fileData,
        geometry: geometry,
        originalColors: originalColors,
        codedColors: codedColors,
        isPreview: isPreview,
        loading: isPreview,
        wasDownsampled: wasDownsampled
    });

    // Apply current color mode
    applyColorMode(geometry, filename);
    
    // Render the file
    updateFileRender(filename);

    // Update UI
    createFileCheckboxes();
    updateObjectLabelsUI();

    const pointCount = geometry.attributes.position.count.toLocaleString();
    const status = isPreview ? `Preview (${pointCount} points)` : `Complete (${pointCount} points)`;
    console.log(`[${filename}] ${status}${wasDownsampled ? ' - downsampled' : ''}`);

    // If this was the selected file and we upgraded it, reattach transform controls
    if (!isPreview && selectedFile === filename) {
        const upgradedData = loadedFiles.get(filename);
        if (upgradedData && upgradedData.object) {
            transformControl.attach(upgradedData.object);
            transformControl.enabled = true;
            transformControl.visible = true;
            updateInfoIconPosition();
        }
    }
}

/**
 * Callback for file loading progress
 */
function handleFileProgress(filename, message, progress) {
    console.log(`[${filename}] ${message} (${progress.toFixed(1)}%)`);
    
    // You can update UI here with progress bar if desired
    // For now, just update the checkbox label
    const fileData = loadedFiles.get(filename);
    if (fileData) {
        fileData.loadingMessage = message;
        fileData.loadingProgress = progress;
        createFileCheckboxes();
    }
}

/**
 * Callback for file loading errors
 */
function handleFileError(filename, error) {
    console.error(`[${filename}] Load error:`, error);
    
    const fileData = loadedFiles.get(filename);
    if (fileData) {
        fileData.loading = false;
        fileData.error = error;
        createFileCheckboxes();
    }
}

function ensureGeometryHasNormals(geometry) {
    if (!geometry) {
        return;
    }
    geometry.computeVertexNormals();
}

function createDefaultColors(pointCount) {
    const colors = new Float32Array(pointCount * 3);
    for (let i = 0; i < pointCount * 3; i++) {
        colors[i] = 1.0; // Default to white
    }
    return colors;
}

function createCodedColors(geometry) {
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    const positions = geometry.attributes.position;
    const colors = [];
    let minDist = Infinity;
    let maxDist = -Infinity;

    for (let i = 0; i < positions.count; i++)
    {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);

        const dist = Math.sqrt(x*x + y*y + z*z);
        minDist = Math.min(minDist, dist);
        maxDist = Math.max(maxDist, dist);
    }

    for (let i = 0; i < positions.count; i++) 
    {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);
        const dist = Math.sqrt(x * x + y * y + z * z);
        
        const normalizedDist = (dist - minDist) / (maxDist - minDist);
        
        let r, g, b;
        if (normalizedDist < 0.5) 
        {   
            const t = normalizedDist * 2;
            r = 1 - t;
            g = 1;
            b = 0;
        } 
        else 
        {
            const t = (normalizedDist - 0.5) * 2; 
            r = t;
            g = 1 - t;
            b = 0;
        }
        
        colors.push(r, g, b);
    }

    return new Float32Array(colors);
}

function applyColorMode(geometry, filename) {
    const fileData = loadedFiles.get(filename);
    if (!fileData) return;

    const colorsToUse = colorMode === 'original' ? fileData.originalColors : fileData.codedColors;
    
    geometry.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(colorsToUse, 3)
    );
}

function createFileCheckboxes() {
    const container = document.getElementById('object-labels-section');
    if (!container) {
        return;
    }
    const contentDiv = container.querySelector('.section-content');
    if (!contentDiv) {
        return;
    }

    contentDiv.innerHTML = '';

    if (loadedFiles.size === 0) {
        contentDiv.textContent = 'Loading objects...';
        return;
    }

    loadedFiles.forEach((fileData, filename) => {
        const label = document.createElement('label');
        label.dataset.filename = filename;
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.marginBottom = '8px';
        label.style.cursor = 'pointer';
        label.style.flexDirection = 'column';
        label.style.alignItems = 'flex-start';

        const topRow = document.createElement('div');
        topRow.style.display = 'flex';
        topRow.style.alignItems = 'center';
        topRow.style.width = '100%';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = fileData.visible;
        checkbox.style.marginRight = '8px';
        checkbox.addEventListener('change', (e) => {
            toggleFileVisibility(filename, e.target.checked);
        });

        const nameSpan = document.createElement('span');
        
        // Show status based on loading state
        let statusText = '';
        if (fileData.error) {
            statusText = ` (error: ${fileData.error})`;
            nameSpan.style.color = '#ff6b6b';
        } else if (fileData.loading) {
            statusText = fileData.isPreview ? ' (loading...)' : ' (processing...)';
            nameSpan.style.color = '#ffa500';
        } else if (fileData.isPreview) {
            statusText = ' (preview)';
            nameSpan.style.color = '#ffd700';
        } else if (fileData.wasDownsampled) {
            statusText = ' (downsampled)';
        }
        
        nameSpan.textContent = filename + statusText;

        topRow.appendChild(checkbox);
        topRow.appendChild(nameSpan);
        label.appendChild(topRow);

        // Show progress bar if loading
        if (fileData.loading && fileData.loadingProgress !== undefined) {
            const progressBar = document.createElement('div');
            progressBar.style.width = '100%';
            progressBar.style.height = '4px';
            progressBar.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            progressBar.style.marginTop = '4px';
            progressBar.style.borderRadius = '2px';
            progressBar.style.overflow = 'hidden';

            const progressFill = document.createElement('div');
            progressFill.style.width = `${fileData.loadingProgress}%`;
            progressFill.style.height = '100%';
            progressFill.style.backgroundColor = '#4CAF50';
            progressFill.style.transition = 'width 0.3s ease';

            progressBar.appendChild(progressFill);
            label.appendChild(progressBar);

            if (fileData.loadingMessage) {
                const messageSpan = document.createElement('span');
                messageSpan.textContent = fileData.loadingMessage;
                messageSpan.style.fontSize = '10px';
                messageSpan.style.color = '#aaa';
                messageSpan.style.marginTop = '2px';
                label.appendChild(messageSpan);
            }
        }

        contentDiv.appendChild(label);
    });
}

function toggleFileVisibility(filename, visible) {
    const fileData = loadedFiles.get(filename);
    if (!fileData) return;

    fileData.visible = visible;

    if (visible) {
        // Render the file
        updateFileRender(filename);
    } else {
        // Remove from scene
        if (fileData.object) {
            scene.remove(fileData.object);
        }
        // Deselect if this was selected
        if (selectedFile === filename) {
            deselectFile();
        }
    }
}

function deselectFile() {
    // Reset color of previously selected file
    if (selectedFile) {
        const prevData = loadedFiles.get(selectedFile);
        if (prevData && prevData.object) {
            if (renderMode === 'points') {
                prevData.object.material.vertexColors = true;
                prevData.object.material.color.set(0xffffff);
                prevData.object.material.needsUpdate = true;
            }
        }
    }
    
    selectedFile = null;
    if (transformControl) {
        transformControl.detach();
        transformControl.enabled = false;
        transformControl.visible = false;
    }
    
    // Hide info icon
    if (infoIcon) {
        infoIcon.style.display = 'none';
    }
    
    updateObjectLabelsUI();
}

function updateObjectLabelsUI() {
    const container = document.getElementById('object-labels-section');
    if (!container) {
        return;
    }
    const contentDiv = container.querySelector('.section-content');
    if (!contentDiv) {
        return;
    }
    
    // Update checkboxes to highlight selected file
    const labels = contentDiv.querySelectorAll('label');
    labels.forEach(label => {
        const filename = label.dataset.filename || label.textContent.trim();
        if (filename === selectedFile) {
            label.style.background = 'rgba(76, 175, 80, 0.3)';
            label.style.fontWeight = 'bold';
        } else {
            label.style.background = '';
            label.style.fontWeight = 'normal';
        }
    });
    
    if (selectedFile) {
        console.log('Currently selected:', selectedFile);
    }
}

function onWindowResize() 
{
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(event) {
    if (!selectedFile || currentMode !== 'select') return;
    
    switch (event.key.toLowerCase()) {
        case 'g': // Translate (Grab in Blender)
        case 't':
            transformControl.setMode('translate');
            console.log('Transform mode: Translate');
            break;
        case 'r': // Rotate
            transformControl.setMode('rotate');
            console.log('Transform mode: Rotate');
            break;
        case 's': // Scale
            transformControl.setMode('scale');
            console.log('Transform mode: Scale');
            break;
        case 'escape': // Deselect
            deselectFile();
            break;
    }
}

function animate() 
{
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    
    // Update info icon position every frame
    if (selectedFile) {
        updateInfoIconPosition();
    }
}