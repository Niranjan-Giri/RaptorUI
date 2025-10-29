import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';


let scene, camera, renderer, controls, transformControl;
let currentMode = 'orbit';
let raycaster, mouse;

// Changed to support multiple files
let loadedFiles = new Map(); // Store { filename: { geometry, object, visible, color } }
let renderMode = 'points';
let ambientLight = null;
let directionalLight = null;
let selectedFile = null;

// List of PLY files to load
const plyFiles = [
    '/B3_S4.ply',
    '/B3_S2.ply',
    //'/B3_S5.ply',
];

init();
loadAllPLYFiles();
setupMenuControls();

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
}

function setMode(mode) 
{
    currentMode = mode;
    
    // Update button states
    document.querySelectorAll('.control-btn').forEach(btn => {
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
    const loader = new PLYLoader();
    let loadedCount = 0;

    plyFiles.forEach((filepath, index) => {
        loader.load(filepath, function (geometry) {
            geometry.center();
            geometry.computeVertexNormals();

            // Get filename from path
            const filename = filepath.split('/').pop();

            // Process geometry
            processGeometryColors(geometry);

            // Store file data
            loadedFiles.set(filename, {
                geometry: geometry,
                object: null,
                visible: true,
                filepath: filepath
            });

            // Render this file
            updateFileRender(filename);

            loadedCount++;
            
            // Update UI when all files are loaded
            if (loadedCount === plyFiles.length) {
                createFileCheckboxes();
                animate();
            }
        }, undefined, function(error) {
            console.error(`Error loading ${filepath}:`, error);
        });
    });
}

function processGeometryColors(geometry) {
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

    geometry.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(colors, 3)
    );
}

function createFileCheckboxes() {
    const container = document.getElementById('object-labels-section');
    const contentDiv = container.querySelector('.section-content');
    contentDiv.innerHTML = '';

    loadedFiles.forEach((fileData, filename) => {
        const label = document.createElement('label');
        label.style.display = 'block';
        label.style.marginBottom = '8px';
        label.style.cursor = 'pointer';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = fileData.visible;
        checkbox.style.marginRight = '8px';
        checkbox.addEventListener('change', (e) => {
            toggleFileVisibility(filename, e.target.checked);
        });

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(filename));
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
    updateObjectLabelsUI();
}

function updateObjectLabelsUI() {
    const container = document.getElementById('object-labels-section');
    const contentDiv = container.querySelector('.section-content');
    
    // Update checkboxes to highlight selected file
    const labels = contentDiv.querySelectorAll('label');
    labels.forEach(label => {
        const filename = label.textContent.trim();
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
}