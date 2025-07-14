let gl, canvas;
let simulation;
let shaderProgram;
let vertexBuffer, indexBuffer;
let vertexCount;
let dim = 16;
let damping = 0.9991;
let iters = 5;

function initSimulation() {
    // Initialize WebGL
    canvas = document.getElementById('glCanvas');
    gl = canvas.getContext('webgl');
    
    // Resize canvas
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    
    // Create simulation
    simulation = new ClothSimulation(10, 10, dim, dim, damping);
    
    // Initialize shaders and buffers
    initShaders();
    initBuffers();
    
    // Start animation loop
    requestAnimationFrame(render);
}

function initShaders() {
    // Vertex shader
    const vertexShaderSrc = `
        attribute vec3 aPosition;
        uniform mat4 uModelViewMatrix;
        uniform mat4 uProjectionMatrix;
        
        void main() {
            gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
            gl_PointSize = 5.0;
        }
    `;
    
    // Fragment shader
    const fragmentShaderSrc = `
        precision mediump float;
        
        void main() {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        }
    `;
    
    // Compile shaders
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexShaderSrc);
    gl.compileShader(vertexShader);
    
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentShaderSrc);
    gl.compileShader(fragmentShader);
    
    // Create shader program
    shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);
}

function initBuffers() {
    // Create vertex buffer
    vertexBuffer = gl.createBuffer();
    
    // Create index buffer
    const indices = [];
    const px = simulation.px;
    const py = simulation.py;
    
    // Horizontal lines
    for (let y = 0; y < py; y++) {
        for (let x = 0; x < px - 1; x++) {
            indices.push(y * px + x);
            indices.push(y * px + x + 1);
        }
    }
    
    // Vertical lines
    for (let x = 0; x < px; x++) {
        for (let y = 0; y < py - 1; y++) {
            indices.push(y * px + x);
            indices.push((y + 1) * px + x);
        }
    }
    
    indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    
    vertexCount = indices.length;
}

function updateBuffers() {
    // Particle positions to array
    const positions = [];
    for (const p of simulation.particles) {
        positions.push(p.position[0], p.position[1], p.position[2]);
    }
    
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
}

let frameCount = 0;
let lastTime = performance.now();
let fps = 0;

function render() {
    // Update simulation
    const startTime = performance.now();
    simulation.update(1/60, iters);
    const frameTime = performance.now() - startTime;

    // Store frame time
    simulation.metrics.frameTimes.push(frameTime.toFixed(2));

    // FPS
    frameCount++;
    const now = performance.now();
    if (now - lastTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastTime = now;
        // console.log(`FPS: ${fps}, Frame Time: ${frameTime.toFixed(2)}ms`);
    }
    
    // Clear canvas
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    // Update buffers
    updateBuffers();
    
    // Set up projection matrix
    const projectionMatrix = mat4.create();
    mat4.perspective(projectionMatrix, 45 * Math.PI / 180, canvas.width / canvas.height, 0.1, 100.0);
    
    // Set up view matrix
    const modelViewMatrix = mat4.create();
    
    mat4.translate(modelViewMatrix, modelViewMatrix, [0, 5, -25]);
    mat4.rotateX(modelViewMatrix, modelViewMatrix, 0);
    
    // Use shader program
    gl.useProgram(shaderProgram);
    
    // Set uniforms
    gl.uniformMatrix4fv(
        gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
        false,
        projectionMatrix
    );
    gl.uniformMatrix4fv(
        gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
        false,
        modelViewMatrix
    );
    
    // Draw particles as points
    const positionAttributeLocation = gl.getAttribLocation(shaderProgram, 'aPosition');
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.vertexAttribPointer(positionAttributeLocation, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, simulation.particles.length);
    
    // Draw constraints as lines
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.drawElements(gl.LINES, vertexCount, gl.UNSIGNED_SHORT, 0);
    
    requestAnimationFrame(render);
}