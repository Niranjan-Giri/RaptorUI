import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

let scene, camera, renderer, controls;

init();
loadPLY();

function init() 
{
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202020);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 2);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);

    window.addEventListener('resize', onWindowResize);
}

function loadPLY() 
{
    const loader = new PLYLoader();


    loader.load('/public/B3_S4.ply', function (geometry) {
        geometry.computeVertexNormals();

        /*For getting the center*/
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;
        const center = new THREE.Vector3();
        bbox.getCenter(center);

        /*Now we will calculate distance taking reference to infinity*/
        const positions = geometry.attributes.position;
        const colors = [];
        let minDist = Infinity;
        let maxDist = -Infinity;

        /*We will assign actual min and max distance now*/
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
                const t = (normalizedDist - 0.5) * 2; // 0 to 1
                r = t;
                g = 1 - t;
                b = 0;
            }
            
            colors.push(r, g, b);
        }

        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));


        const material = new THREE.PointsMaterial
        ({
            size: 0.005,
            //If set to true, it will use colors based on distance
            //Otherwise it will use the default white color
            vertexColors: true,
            color: 0xffffff
        });

        const points = new THREE.Points(geometry, material);
        scene.add(points);

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