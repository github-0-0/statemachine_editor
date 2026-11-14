
const scale = 20;
const board = document.getElementById('board');
const svg = document.getElementById('edges');
const SVG_NS = "http://www.w3.org/2000/svg";

function snap(point) {
    return [
        Math.round(point[0] / scale) * scale,
        Math.round(point[1] / scale) * scale
    ];
}

const dragCallbacks = new WeakMap();

function makeDraggable(el, ondrag = (x, y) => {}) {
    if (!el) return;

    if (dragCallbacks.has(el)) {
        dragCallbacks.set(el, ondrag);
        return;
    }

    dragCallbacks.set(el, ondrag);
    let isDragging = false;
    let hasMoved = false;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;

    el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;

        e.stopPropagation();
        isDragging = true;
        hasMoved = false;

        startX = e.clientX - currentX;
        startY = e.clientY - currentY;

        el.style.cursor = 'grabbing';
        el.setPointerCapture(e.pointerId);
    });

    el.addEventListener('pointermove', (e) => {
        if (!isDragging) return;

        const nextX = e.clientX - startX;
        const nextY = e.clientY - startY;
        el.dataset.dragging = "false";

        if (Math.abs(nextX - currentX) > 3 || Math.abs(nextY - currentY) > 3) {
            hasMoved = true;
            el.dataset.dragging = "true";
        }

        currentX = nextX;
        currentY = nextY;

        const [x, y] = snap([currentX, currentY]);

        el.style.transform = `translate(${x}px, ${y}px)`;
        dragCallbacks.get(el)?.(x, y);
    });

    const stopDrag = (e) => {
        if (!isDragging) return;
        isDragging = false;
        el.dataset.wasDragged = hasMoved ? "true" : "false";
        el.style.cursor = 'grab';

        el.dataset.dragging = "false";
        if (el.hasPointerCapture(e.pointerId)) {
            el.releasePointerCapture(e.pointerId);
        }
    };

    el.addEventListener('pointerup', stopDrag);
    el.addEventListener('pointercancel', stopDrag);
}

class Arrow {
    constructor(elementStart, waypoints = [], elementEnd) {
        this.elementStart = elementStart;
        this.waypoints = [];
        this.elementEnd = elementEnd;
        this.dragElements = [];
        this.group = null;
        this.hitPath = null;
        this.visiblePath = null;

        for (const wp of waypoints) {
            this.addWaypoint(wp);
        }
        this.compilePoints();
    }

    static getElementTop(el) {
        const boardRect = board.getBoundingClientRect();
        const rect = el.getBoundingClientRect();
        return [
            Math.round(rect.left - boardRect.left + rect.width / 2),
            Math.round(rect.top - boardRect.top)
        ];
    }

    static getElementBottom(el) {
        const boardRect = board.getBoundingClientRect();
        const rect = el.getBoundingClientRect();
        return [
            Math.round(rect.left - boardRect.left + rect.width / 2),
            Math.round(rect.bottom - boardRect.top)
        ];
    }

    static getMidpoint(first, second) {
        const dx = second[0] - first[0];
        const dy = second[1] - first[1];
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        if (absX === 0 || absY === 0 || absX === absY) {
            return null;
        }

        if (absX > absY) {
            return [second[0] - absY * Math.sign(dx), first[1]];
        } else {
            return [first[0], second[1] - absX * Math.sign(dy)];
        }
    }

    static distToSegmentSq(p, a, b) {
        const vx = b[0] - a[0];
        const vy = b[1] - a[1];
        const wx = p[0] - a[0];
        const wy = p[1] - a[1];
        const lenSq = vx * vx + vy * vy;
        let t = lenSq === 0 ? 0 : (wx * vx + wy * vy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const projX = a[0] + t * vx;
        const projY = a[1] + t * vy;
        const dx = p[0] - projX;
        const dy = p[1] - projY;
        return dx * dx + dy * dy;
    }

    static createSvgEl(tag, attrs = {}) {
        const el = document.createElementNS(SVG_NS, tag);
        Arrow.updateSvgEl(el, attrs);
        return el;
    }

    static updateSvgEl(el, attrs) {
        for (const [key, value] of Object.entries(attrs)) {
            el.setAttribute(key, value);
        }
    }

    getCompiledWaypoints() {
        const initial = snap(Arrow.getElementBottom(this.elementStart));
        const afterInitial = [initial[0], initial[1] + scale];
        const final = snap(Arrow.getElementTop(this.elementEnd));
        const beforeFinal = [final[0], final[1] - scale];
        return [initial, afterInitial, ...this.waypoints, beforeFinal, final];
    }

    compilePoints() {
        const compiled_waypoints = this.getCompiledWaypoints();
        const final = compiled_waypoints[compiled_waypoints.length - 1];
        this.points = [];
        for (let i = 0; i < compiled_waypoints.length - 1; i++) {
            const first = compiled_waypoints[i];
            const second = compiled_waypoints[i + 1];
            this.points.push(first);
            const midpoint = Arrow.getMidpoint(first, second);
            if (midpoint) {
                this.points.push(midpoint);
            }
        }
        this.points.push(final);
    }

    findInsertIndex(rawPoint) {
        const compiled_waypoints = this.getCompiledWaypoints();
        let bestLeg = 0;
        let bestDist = Infinity;

        for (let i = 0; i < compiled_waypoints.length - 1; i++) {
            const first = compiled_waypoints[i];
            const second = compiled_waypoints[i + 1];
            const midpoint = Arrow.getMidpoint(first, second);
            const subSegments = midpoint
                ? [[first, midpoint], [midpoint, second]]
                : [[first, second]];

            for (const [a, b] of subSegments) {
                const dist = Arrow.distToSegmentSq(rawPoint, a, b);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestLeg = i;
                }
            }
        }

        return Math.max(0, Math.min(this.waypoints.length, bestLeg - 1));
    }

    drawArrow() {
        const d = this.points
            .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`)
            .join("");
        if (!this.group) {
            this.group = Arrow.createSvgEl("g", { class: "edge-group" });
            this.hitPath = Arrow.createSvgEl("path", { class: "edge-hit", d });
            this.visiblePath = Arrow.createSvgEl("path", { class: "edge", d, "marker-end": "url(#arrow)" });
            this.group.appendChild(this.hitPath);
            this.group.appendChild(this.visiblePath);
            svg.appendChild(this.group);

            this.hitPath.addEventListener("click", (e) => {
                try {
                    const boardRect = board.getBoundingClientRect();
                    const rawPoint = [
                        e.clientX - boardRect.left,
                        e.clientY - boardRect.top
                    ];
                    const snapped = snap(rawPoint);
                    const insertIndex = this.findInsertIndex(rawPoint);
                    this.addWaypoint(snapped, insertIndex);
                } catch (err) {
                    document.getElementById("nav").innerText = err.stack;
                }
            });
        } else {
            Arrow.updateSvgEl(this.hitPath, { class: "edge-hit", d });
            Arrow.updateSvgEl(this.visiblePath, { class: "edge", d, "marker-end": "url(#arrow)" });
        }
    }

    addWaypoint(waypoint, index = this.waypoints.length) {
        const snapped = snap(waypoint);
        const circle = this.getDragElement(snapped);
        this.waypoints.splice(index, 0, snapped);
        this.dragElements.splice(index, 0, circle);
        this.compilePoints();
        this.drawArrow();
    }

    editWaypoint(index, waypoint) {
        if (index < 0 || index >= this.waypoints.length) return;
        this.waypoints[index] = snap(waypoint);
        this.compilePoints();
        this.drawArrow();
    }

    removeWaypoint(index) {
        if (index < 0 || index >= this.waypoints.length) return;
        const [circle] = this.dragElements.splice(index, 1);
        if (circle) circle.remove();
        this.waypoints.splice(index, 1);
        this.compilePoints();
        this.drawArrow();
    }

    getDragElement(waypoint) {
        const [originX, originY] = waypoint;
        const circle = Arrow.createSvgEl("circle", {
            class: "waypoint",
            r: 8,
            cx: originX,
            cy: originY
        });
        svg.appendChild(circle);

        makeDraggable(circle, (dx, dy) => {
            const index = this.dragElements.indexOf(circle);
            this.editWaypoint(index, [originX + dx, originY + dy]);
        });

        circle.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            const index = this.dragElements.indexOf(circle);
            this.removeWaypoint(index);
        });

        return circle;
    }
}

class Node {
    static stateNames = new Set();
    static triggersNames = new Set();
    
    constructor(type, name) {
        if (type === "state") {
            this.name = Node.getUnusedName(Node.stateNames, name);
            Node.stateNames.add(this.name);
            this.createElement("state states node");
        } else if (type === "trigger") {
            this.name = Node.getUnusedName(Node.triggersNames, name);
            Node.triggersNames.add(this.name);
            this.createElement("trigger triggers node");
        }
    }

    static getUnusedName(set, name) {
        let unusedName = name;
        let i = 1;
        while (set.has(unusedName)) {
            unusedName = `${name} (${i})`
            i++;
        }
        return unusedName;
    }

    createElement(className) {
		this.el = document.createElement("div");

		this.el.className = className;
		this.el.textContent = this.name;

		this.el.style.position = "absolute";
		this.el.style.left = "";
		this.el.style.top = "";
		this.el.style.cursor = "grab";
		this.el.style.userSelect = "none";
		this.el.style.touchAction = "none";
		this.el.style.zIndex = "2";

		const [x, y] = Node.randomPosition();

		this.el.style.left = `${x}px`;
		this.el.style.top = `${y}px`;

        board.appendChild(this.el);
        makeDraggable(this.el);

        this.el.addEventListener("click", (e) => {
            e.stopPropagation();
            if (this.el.dataset.dragging === "false") {
                this.el.classList.toggle("pulse");
            }
        });
    }

    static randomPosition() {
        return snap([Math.random() * 100 + 100, Math.random() * 100 + 100]);
    }

    
}

// var test = new Arrow(document.getElementById("test1"), [], document.getElementById("test2"));

// makeDraggable(document.getElementById("test1"), () => {
//     test.compilePoints();
//     test.drawArrow();
// });
// makeDraggable(document.getElementById("test2"), () => {
//     test.compilePoints();
//     test.drawArrow();
// });
// test.drawArrow();

new Node("state", "hi");
new Node("trigger", "hi2");
new Node("state", "hi3");