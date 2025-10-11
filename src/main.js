import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let currentMode = 'orbit';
let raycaster, mouse;

let currentGeometry = null;
let currentObject = null;
let renderMode = 'points';
let ambientLight = null;
let directionalLight = null;

init();
loadPLY();
setupMenuControls();

function init() 
{
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202020);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 2);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);

    raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 0.01;
    mouse = new THREE.Vector2();

    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener('click', onCanvasClick);
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
        renderer.domElement.style.cursor = 'grab';  
    } 
    else if (mode === 'pan') 
    {
        document.getElementById('btn-pan').classList.add('active');
        controls.enableRotate = false;
        controls.enablePan = true;
        renderer.domElement.style.cursor = 'move';
    } 
    else if (mode === 'select') 
    {
        document.getElementById('btn-select').classList.add('active');
        controls.enableRotate = false;
        controls.enablePan = false;
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
    
    // Re-render with new mode
    if (currentGeometry) 
    {
        updateRender();
    }
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
    
    const intersects = raycaster.intersectObjects(scene.children);
    
    if (intersects.length > 0) {
        console.log('Selected point:', intersects[0].point);
    }
}

function updateRender() 
{
    // Remove current object
    if (currentObject) 
    {
        scene.remove(currentObject);
    }
    
    // Remove lights if switching from mesh to points
    if (renderMode === 'points' && ambientLight) 
    {
        scene.remove(ambientLight);
        scene.remove(directionalLight);
        ambientLight = null;
        directionalLight = null;
    }
    
    if (renderMode === 'points') 
    {
        const material = new THREE.PointsMaterial({
            size: 0.005,
            vertexColors: true,
            color: 0xffffff
        });
        currentObject = new THREE.Points(currentGeometry, material);  
        currentObject.castShadow = true;
        currentObject.receiveShadow = true;    
    } 
    else 
    {
        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            flatShading: false,
            side: THREE.DoubleSide
        });
        currentObject = new THREE.Mesh(currentGeometry, material);
        currentObject.castShadow = true;
        currentObject.receiveShadow = true;
        
        // Add lights for mesh rendering
        if (!ambientLight) 
        {
            ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
            scene.add(ambientLight);
            
            directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(1, 1, 1);
            scene.add(directionalLight);
        }
    }
    
    scene.add(currentObject);
}

function loadPLY() 
{
    const loader = new PLYLoader();

    loader.load('/public/B3_S4.ply', function (geometry) {
        geometry.center();
        geometry.computeVertexNormals();

        //for getting the center
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;
        const center = new THREE.Vector3();
        bbox.getCenter(center);

        //Now we will calculate distance taking reference to infinity
        const positions = geometry.attributes.position;
        const colors = [];
        let minDist = Infinity;
        let maxDist = -Infinity;

        //We will assign actual min and max distance now
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
            
            // Normalize distance to 0-1 range
            const normalizedDist = (dist - minDist) / (maxDist - minDist);
            
            // Color mapping: close = yellow, medium = green, far = red
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

        if (!geometry.hasAttribute('color')) 
        {
            geometry.setAttribute(
                'color',
                new THREE.Float32BufferAttribute(
                    new Array(geometry.attributes.position.count * 3).fill(1),
                    3
                )
            );
        }

        currentGeometry = geometry;
        updateRender();

        animate();
    });
}

function onWindowResize() 
{
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() 
{
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}