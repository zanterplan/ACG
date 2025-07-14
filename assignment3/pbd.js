class Particle {
    constructor(x, y, z, mass) {
        this.position = vec3.fromValues(x, y, z);
        this.prev = vec3.fromValues(x, y, z);
        this.velocity = vec3.create();
        this.force = vec3.fromValues(0, -9.81, 0);
        this.invMass = mass > 0 ? 1.0 / mass : 0;
        this.pinned = false;
    }
}

class Constraint {
    constructor(p1, p2, restLength) {
        this.p1 = p1;
        this.p2 = p2;
        this.restLength = restLength;
    }
}

class ClothSimulation {
    constructor(width, height, px, py, damping = 0.999) {
        this.particles = [];
        this.constraints = [];
        this.createCloth(width, height, px, py);
        
        // Pin two corners
        this.particles[0].pinned = true;
        this.particles[px - 1].pinned = true;
        this.damping = damping;

        // Number of particles
        this.px = px;
        this.py = py;

        this.metrics = {
            resolutions: [],
            substeps: [],
            frameTimes: []
        };
    }

    createCloth(width, height, px, py) {
        // Create particles
        for (let y = 0; y < py; y++) {
            for (let x = 0; x < px; x++) {
                const posX = x * width / (px - 1) - width / 2;
                const posY = 0;
                const posZ = y * height / (py - 1) - height / 2;

                const particle = new Particle(posX, posY, posZ, 1.0);
                this.particles.push(particle);
            }
        }

        // Create constraints
        for (let y = 0; y < py; y++) {
            for (let x = 0; x < px; x++) {
                // Horizontal
                if (x < px - 1) {
                    const p1 = y * px + x;
                    const p2 = y * px + x + 1;
                    const dist = width / (px - 1);

                    const constraint = new Constraint(this.particles[p1], this.particles[p2], dist);
                    this.constraints.push(constraint);
                }
                // Vertical
                if (y < py - 1) {
                    const p1 = y * px + x;
                    const p2 = (y + 1) * px + x;
                    const dist = height / (py - 1);

                    const constraint = new Constraint(this.particles[p1], this.particles[p2], dist);
                    this.constraints.push(constraint);
                }
            }
        }
    }

    update(dt, iterations) {
        // Substepping
        const subDt = dt / iterations;
        
        for (let i = 0; i < iterations; i++) {
            this.applyForces(subDt);
            this.solveConstraints();
            this.updateVelocities(subDt);
        }
    }

    applyForces(dt) {
        for (const p of this.particles) {
            if (p.pinned) continue;
            
            // Save previous position
            vec3.copy(p.prev, p.position);
            
            // Euler integration
            vec3.scaleAndAdd(p.velocity, p.velocity, p.force, dt * p.invMass);
            vec3.scaleAndAdd(p.position, p.position, p.velocity, dt);
        }
    }

    solveConstraints() {
        for (const c of this.constraints) {
            // Distance constraint
            const d = c.restLength;
            const delta = vec3.create();
            vec3.sub(delta, c.p1.position, c.p2.position);
            const length = vec3.length(delta);
            
            if (length === 0) continue;
            
            const correction = vec3.create();

            // Correction calculation
            vec3.scale(correction, delta, (length - d) / length);
            
            // Weights
            const invMass = c.p1.invMass + c.p2.invMass;
            if (invMass === 0) continue;
            
            if (!c.p1.pinned)
                vec3.scaleAndAdd(c.p1.position, c.p1.position, correction, -c.p1.invMass / invMass);
            
            if (!c.p2.pinned)
                vec3.scaleAndAdd(c.p2.position, c.p2.position, correction, c.p2.invMass / invMass);
        }
    }

    updateVelocities(dt) {
        for (const p of this.particles) {
            if (p.pinned) continue;
            
            const velocity = vec3.create();
            vec3.sub(velocity, p.position, p.prev);
            vec3.scale(velocity, velocity, 1 / dt * this.damping);
            vec3.copy(p.velocity, velocity);
        }
    }

    test(resolutions = [5, 10, 15, 20], substeps = [1, 2, 5, 10], frames = 100) {
        // Resolutions
        for (const r of resolutions) {
            const start = performance.now();
            const testSimulation = new ClothSimulation(10, 10, r+1, r+1);
            for (let i = 0; i < frames; i++)
                testSimulation.update(1/60, 10);
            this.metrics.resolutions.push({
                resolution: r,
                time: performance.now() - start
            });
        }

        // Substeps
        const testSimulation = new ClothSimulation(10, 10, 16, 16);
        for (const steps of substeps) {
            const start = performance.now();
            for (let i = 0; i < frames; i++)
                testSimulation.update(1/60, steps);
            this.metrics.substeps.push({
                substeps: steps,
                time: performance.now() - start
            });
        }
        return this.metrics;
    }
}