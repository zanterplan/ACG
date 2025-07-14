/*  HOW TO USE

    Place splat files in the assets folder.
    Start the localhost server.
    Select one of three splats to render (shoe splat by default).
    Use contols the move around:
        - Scroll (mouse wheel):
          Zoom in/out
        - Left click + drag around:
          Rotate the shoe up/down/left/right
        - +/- (plus/minus) keys:
          Dyncamically adjust the scaling parameter (size of the splats)
        - W/A/S/D keys:
          Move the camera (POV) up/down/left/right

*/

import { mat4, vec3 } from "https://cdn.jsdelivr.net/npm/gl-matrix@2.8.1/+esm";

const canvas = document.getElementById("glCanvas");
const gl = canvas.getContext("webgl");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
gl.viewport(0, 0, canvas.width, canvas.height);

let splatsData = null;

let camera = {
    position: [0, 0, 10],
    target: [0, 0, 0],
    up: [0, -1, 0],
    fov: 45 * (Math.PI / 180),
    aspect: window.innerWidth / window.innerHeight,
    near: 0.1,
    far: 100,
}

// Orbit camera
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let angleX = 0;
let angleY = 0;
let distance = 10;

// Scale
let scale = 25.0;

// Location variables
var scaleLocation = null;
var colorLocation = null;
var depthLocation = null;

var mvpMatrixLocation = null;

// Load splats from the binary file
async function loadSplats(url) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const dataView = new DataView(arrayBuffer);

    const SPLAT_SIZE = 32;
    const numSplats = arrayBuffer.byteLength / SPLAT_SIZE;

    let positions = [];
    let colors = [];

    for (let i = 0; i < numSplats; i++) {
        let offset = i * SPLAT_SIZE;

        // Read position
        let x = dataView.getFloat32(offset, true);
        let y = dataView.getFloat32(offset + 4, true);
        let z = dataView.getFloat32(offset + 8, true);
        positions.push(x, y, z);

        // Read color (RGBA)
        let r = dataView.getUint8(offset + 24) / 255;
        let g = dataView.getUint8(offset + 25) / 255;
        let b = dataView.getUint8(offset + 26) / 255;
        let a = dataView.getUint8(offset + 27) / 255;
        colors.push(r, g, b, a);
    }

    // Center the model
    let center = [0, 0, 0];
    for (let i = 0; i < positions.length / 3; i++) {
        center[0] += positions[i * 3];
        center[1] += positions[i * 3 + 1];
        center[2] += positions[i * 3 + 2];
    }

    // Normalize
    center[0] /= (positions.length / 3);
    center[1] /= (positions.length / 3);
    center[2] /= (positions.length / 3);

    // Subtract the normalized centre
    for (let i = 0; i < positions.length / 3; i++) {
        positions[i * 3] -= center[0];
        positions[i * 3 + 1] -= center[1];
        positions[i * 3 + 2] -= center[2];
    }

    // Angles
    let angle = -Math.PI / 4;
    let cosA = Math.cos(angle);
    let sinA = Math.sin(angle);

    // Turn shoe 45 degrees down by x-axis
    for (let i = 0; i < positions.length / 3; i++) {
        let x = positions[i * 3];
        let y = positions[i * 3 + 1];
        let z = positions[i * 3 + 2];

        positions[i * 3 + 1] = y * cosA - z * sinA;
        positions[i * 3 + 2] = y * sinA + z * cosA;
    }

    console.log("Loaded positions:", positions.length);

    splatsData = {
        positions: new Float32Array(positions),
        colors: new Float32Array(colors)
    };

    console.log("Data in splats:", splatsData);

    initWebGL();
}

// Initialize WebGL
function initWebGL() {
    const vertexShaderSrc = `
        precision lowp float;
        attribute vec3 aPosition;
        attribute vec4 aColor;
        uniform mat4 uMVPMatrix;
        uniform float uScale;
        varying vec4 vColor;

        void main() {
            vec4 viewPos = uMVPMatrix * vec4(aPosition, 1.0);
            gl_PointSize = 2.0 * uScale / viewPos.z;
            gl_Position = viewPos;
            vColor = aColor;
        }
    `;

    const fragmentShaderSrc = `
        precision lowp float;
        varying vec4 vColor;
        varying vec3 vPosition;
        uniform float uScale;
        uniform float uDepth;

        void main() {
            vec2 uv = gl_PointCoord * 2.0 - 1.0;
            float distance = dot(uv, uv);

            if (distance > 1.0) {
                discard;
            }

            float alpha = exp(-0.5 * distance * (uScale / uDepth));
            gl_FragColor = vec4(vColor.rgb, vColor.a * alpha);
        }
    `;
    
    // Compile shaders
    const vertexShader = compileShader(gl, vertexShaderSrc, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(gl, fragmentShaderSrc, gl.FRAGMENT_SHADER);
    const program = createProgram(gl, vertexShader, fragmentShader);
    gl.useProgram(program);

    // Setup buffers
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, splatsData.positions, gl.STATIC_DRAW);
    const positionLocation = gl.getAttribLocation(program, "aPosition");
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(positionLocation);

    const colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, splatsData.colors, gl.STATIC_DRAW);
    colorLocation = gl.getAttribLocation(program, "aColor");
    gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(colorLocation);

    mvpMatrixLocation = gl.getUniformLocation(program, "uMVPMatrix");
    scaleLocation = gl.getUniformLocation(program, "uScale");
    depthLocation = gl.getUniformLocation(program, "uDepth");

    console.log("Starting rendering...");

    render();
}

function sortSplatsByDepth() {
    let viewMatrix = mat4.create();
    mat4.lookAt(viewMatrix, camera.position, camera.target, camera.up);

    let splatList = [];

    for (let i = 0; i < splatsData.positions.length / 3; i++) {
        let pos = vec3.fromValues(
            splatsData.positions[i * 3],
            splatsData.positions[i * 3 + 1],
            splatsData.positions[i * 3 + 2]
        );

        // Transform to view space
        let viewPos = vec3.create();
        vec3.transformMat4(viewPos, pos, viewMatrix);

        // Store position, index and depth
        splatList.push({
            position: pos,
            index: i,
            depth: -viewPos[2]
        });
    }

    // Sort by depth
    splatList.sort((a, b) => b.depth - a.depth);

    return splatList;
}

function render() {
    // Start time
    const startTime = performance.now();

    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);

    let projectionMatrix = mat4.create();
    mat4.perspective(projectionMatrix, camera.fov, camera.aspect, camera.near, camera.far);

    let viewMatrix = mat4.create();
    mat4.lookAt(viewMatrix, camera.position, camera.target, camera.up);

    let mvpMatrix = mat4.create();
    mat4.multiply(mvpMatrix, projectionMatrix, viewMatrix);

    let sortedSplats = sortSplatsByDepth();

    for (let splat of sortedSplats) {
        let i = splat.index;
        let pos = splat.position;

        let modelMatrix = mat4.create();
        mat4.translate(modelMatrix, modelMatrix, pos);

        let mvpMatrixWithModel = mat4.create();
        mat4.multiply(mvpMatrixWithModel, mvpMatrix, modelMatrix);

        gl.uniform1f(scaleLocation, scale);
        gl.uniform1f(depthLocation, splat.depth);

        gl.uniformMatrix4fv(mvpMatrixLocation, false, mvpMatrixWithModel);
        gl.drawArrays(gl.POINTS, i, 1);
    }

    // End time
    const endTime = performance.now();

    // Calculate frame time and FPS
    const frameTime = endTime - startTime;
    const fps = (1000 / frameTime).toFixed(2);
    fpsCounter.textContent = `FPS: ${fps}`;
}

// Scale
window.addEventListener("keydown", (event) => {
    if (event.key === "+") scale += 1.0;
    if (event.key === "-") scale -= 1.0;
    render();
});

// Orbit camera
canvas.addEventListener("mousedown", (event) => {
    isDragging = true;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
});

canvas.addEventListener("mousemove", (event) => {
    if (isDragging) {
        let deltaX = event.clientX - lastMouseX;
        let deltaY = event.clientY - lastMouseY;

        angleX += deltaX * 0.01;
        angleY -= deltaY * 0.01;

        if (Math.abs(angleY) > Math.PI)
            angleY *= -1;

        updateCameraPosition();

        lastMouseX = event.clientX;
        lastMouseY = event.clientY;
    }
});

canvas.addEventListener("mouseup", () => {
    isDragging = false;
});

canvas.addEventListener("mouseleave", () => {
    isDragging = false;
});

// Zoom in/out
canvas.addEventListener('wheel', function(e) {
    e.preventDefault();
    distance += e.deltaY * 0.01;
    distance = Math.max(1, Math.min(150, distance));

    updateCameraPosition();
});

// Movement speed
const movementSpeed = 0.2;

// Keyboard movement
window.addEventListener("keydown", (event) => {
    let right = vec3.create();
    let up = vec3.clone(camera.up);
    
    let forward = vec3.create();
    vec3.subtract(forward, camera.target, camera.position);
    vec3.cross(right, forward, camera.up);
    vec3.normalize(right, right);

    switch (event.key) {
        case "ArrowUp":
        case "w":
            vec3.scaleAndAdd(camera.position, camera.position, up, movementSpeed);
            vec3.scaleAndAdd(camera.target, camera.target, up, movementSpeed);
            break;
        case "ArrowDown":
        case "s":
            vec3.scaleAndAdd(camera.position, camera.position, up, -movementSpeed);
            vec3.scaleAndAdd(camera.target, camera.target, up, -movementSpeed);
            break;
        case "ArrowLeft":
        case "a":
            vec3.scaleAndAdd(camera.position, camera.position, right, -movementSpeed);
            vec3.scaleAndAdd(camera.target, camera.target, right, -movementSpeed);
            break;
        case "ArrowRight":
        case "d":
            vec3.scaleAndAdd(camera.position, camera.position, right, movementSpeed);
            vec3.scaleAndAdd(camera.target, camera.target, right, movementSpeed);
            break;
    }

    render();
});

function updateCameraPosition() {
    camera.position[0] = distance * Math.cos(angleY) * Math.sin(angleX);
    camera.position[1] = distance * Math.sin(angleY);
    camera.position[2] = distance * Math.cos(angleY) * Math.cos(angleX);

    let up = [0, -1, 0];
    if (Math.abs(angleY) > Math.PI / 2)
        up = [0, 1, 0];

    camera.up = up;

    render();
}

// Compile shader
function compileShader(gl, source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        return null;
    }
    return shader;
}

// Create shader program
function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        return null;
    }
    return program;
}

// Load splat file
document.addEventListener("DOMContentLoaded", function () {
    const splatSelector = document.getElementById("splatSelector");
    console.log("Initial splat:", splatSelector.value);
    loadSplats("assets/" + splatSelector.value + ".splat");

    splatSelector.addEventListener("change", function () {
        const selectedSplat = splatSelector.value;
        console.log("Selected splat:", selectedSplat);

        loadSplats("assets/" + selectedSplat + ".splat");
    });
});