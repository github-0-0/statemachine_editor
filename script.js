
const scale = 20;
const board = document.getElementById('board');
const svg = document.getElementById('edges');
const SVG_NS = "http://www.w3.org/2000/svg";

// Shared registry for every node and arrow in the graph.
const graphObjects = new Map();
let nextGraphObjectId = 0;

function registerGraphObject(object, prefix) {
    const id = `${prefix}-${++nextGraphObjectId}`;
    object.id = id;
    graphObjects.set(id, object);
    return id;
}

function createRemoveButton(onRemove, label = "Remove") {
    const button = document.createElement("button");
    button.type = "button";
    button.style.background = "none";
    button.style.aspectRatio = "1.5";
    button.innerText = "\u00d7";
    button.title = label;
    button.setAttribute("aria-label", label);
    // button.appendChild(image); 

    button.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onRemove();
    });

    return button;
}

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
        dragCallbacks.get(el).add(ondrag);
        return;
    }

    dragCallbacks.set(el, new Set([ondrag]));

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

        if (Math.abs(nextX - currentX) > 3 || Math.abs(nextY - currentY) > 3) {
            hasMoved = true;
        }

        const [x, y] = snap([nextX, nextY]);
        currentX = x;
        currentY = y;

        el.style.transform = `translate(${x}px, ${y}px)`;

        const callbacks = dragCallbacks.get(el);
        if (callbacks) {
            for (const callback of callbacks) {
                callback(x, y);
            }
        }
    });

    const stopDrag = (e) => {
        if (!isDragging) return;
        isDragging = false;
        el.dataset.hasMoved = hasMoved ? "true" : "false";
        el.style.cursor = 'grab';

        if (el.hasPointerCapture(e.pointerId)) {
            el.releasePointerCapture(e.pointerId);
        }
    };

    el.addEventListener('pointerup', stopDrag);
    el.addEventListener('pointercancel', stopDrag);
}

function removeDraggableCallback(el, ondrag) {
    if (dragCallbacks.has(el)) {
        dragCallbacks.get(el).delete(ondrag);
    }
}

class Arrow {
    constructor(startNodeId, waypoints = [], endNodeId) {
        this.id = registerGraphObject(this, "arrow");
        this.startNodeId = startNodeId;
        this.endNodeId = endNodeId;
        this.waypoints = [];
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
        const startNode = graphObjects.get(this.startNodeId);
        const endNode = graphObjects.get(this.endNodeId);

        const initial = snap(Arrow.getElementBottom(startNode.el));
        const afterInitial = [initial[0], initial[1] + scale];

        const final = snap(Arrow.getElementTop(endNode.el));
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
            this.visiblePath = Arrow.createSvgEl("path", {
                class: "edge",
                d,
                "marker-end": "url(#arrow)"
            });

            this.group.appendChild(this.hitPath);
            this.group.appendChild(this.visiblePath);
            svg.appendChild(this.group);

            this.hitPath.addEventListener("click", (e) => {
                const boardRect = board.getBoundingClientRect();

                const rawPoint = [
                    e.clientX - boardRect.left,
                    e.clientY - boardRect.top
                ];

                const snapped = snap(rawPoint);
                const insertIndex = this.findInsertIndex(rawPoint);

                this.addWaypoint(snapped, insertIndex);
            });

            this.hitPath.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                this.remove();
            });
        } else {
            Arrow.updateSvgEl(this.hitPath, { class: "edge-hit", d });
            Arrow.updateSvgEl(this.visiblePath, {
                class: "edge",
                d,
                "marker-end": "url(#arrow)"
            });
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

    remove() {
        if (this.group) {
            this.group.remove();
            this.group = null;
        }

        for (const circle of this.dragElements) {
            if (circle) circle.remove();
        }

        this.dragElements = [];

        graphObjects.delete(this.id);
    }

    getDragElement(waypoint) {
        const [originX, originY] = waypoint;

        // const gradient = Arrow.createSvgEl("")

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

function updateArrowsForNode(nodeId) {
    for (const object of graphObjects.values()) {
        if (
            object instanceof Arrow &&
            (object.startNodeId === nodeId || object.endNodeId === nodeId)
        ) {
            object.compilePoints();
            object.drawArrow();
        }
    }
}

class Node {
    static draftNodeId = null;

    constructor(data) {
        this.id = registerGraphObject(this, "node");
        this.data = data;
        this.name = data.name;
        this.draft = false;
        this.createElement(data.className);
        data.nodeEl = this;
    }

    static getUnusedName(set, name) {
        let unusedName = name;
        let i = 1;

        while (set.has(unusedName)) {
            unusedName = `${name} (${i})`;
            i++;
        }

        return unusedName;
    }

    createElement(className) {
        this.el = document.createElement("div");

        this.el.className = className;
        this.el.innerText = this.name;

        this.el.style.position = "absolute";
        this.el.style.left = "";
        this.el.style.top = "";
        this.el.style.cursor = "grab";
        this.el.style.userSelect = "none";
        this.el.style.touchAction = "none";
        this.el.style.zIndex = "2";
        this.el.style.boxSizing = "border-box";

        const [x, y] = Node.randomPosition();

        this.el.style.left = `${x}px`;
        this.el.style.top = `${y}px`;

        board.appendChild(this.el);

        const naturalWidth = this.el.offsetWidth;
        let gridUnits = Math.ceil(naturalWidth / scale);

        if (gridUnits % 2 !== 0) {
            gridUnits += 1;
        }

        gridUnits = Math.max(2, gridUnits);
        this.el.style.width = `${gridUnits * scale}px`;

        makeDraggable(this.el, () => updateArrowsForNode(this.id));

        this.el.addEventListener("pointerup", (e) => {
            e.stopPropagation();

            if (this.el.dataset.hasMoved === "false") {
                if (Node.draftNodeId !== null) {
                    const otherNode = graphObjects.get(Node.draftNodeId);

                    if (!otherNode) {
                        Node.draftNodeId = null;
                        return;
                    }

                    this.draft = false;
                    otherNode.draft = false;
                    otherNode.el.classList.remove("pulse");

                    Node.draftNodeId = null;

                    if (otherNode.data.type !== this.data.type) {
                        const arrow = new Arrow(otherNode.id, [], this.id);
                        arrow.drawArrow();
                    }
                } else {
                    this.el.classList.toggle("pulse");
                    this.draft = !this.draft;
                    Node.draftNodeId = this.id;
                }
            }
        });

        this.el.addEventListener("contextmenu", (e) => {
            e.preventDefault();

            this.remove();
        });
    }

    remove() {
        if (Node.draftNodeId === this.id) {
            Node.draftNodeId = null;
        }

        this.el.classList.remove("pulse");

        for (const object of [...graphObjects.values()]) {
            if (
                object instanceof Arrow &&
                (object.startNodeId === this.id || object.endNodeId === this.id)
            ) {
                object.remove();
            }
        }

        this.el.remove();
        graphObjects.delete(this.id);

        if (this.data.nodeEl === this) {
            this.data.nodeEl = null;
        }
    }

    static randomPosition() {
        return snap([Math.random() * 100 + 100, Math.random() * 100 + 100]);
    }
}

class StateData {
    static stateNames = new Set();
    static stateBlocks = document.getElementById("states");
    static stateProps = [];
    static stateInputTypes = {
        "Angle": "number",
        "Angular Velocity": "number",
        "Distance": "number",
        "Linear Velocity": "number",
    };

    static addState() {
        const attrs = Object.fromEntries(StateData.stateProps.map(prop => 
            [prop.name.value, StateData.stateInputTypes[prop.type.value]]
        ));
        new StateData(document.getElementById("stateName").value.toUpperCase(), attrs);
        StateData.reset();
    }

    static addStateProperty() {
        const container = document.createElement("div");
        container.classList.add("leftright");

        const name = document.createElement("input");
        name.placeholder = "name";
        name.style = "width: 30%; height: 24px";

        const colon = document.createElement("text");
        colon.innerText = ": ";

        const select = document.createElement("select");
        select.style = "height: 24px";

        for (const type of Object.keys(StateData.stateInputTypes)) {
            const option = document.createElement("option");
            option.innerText = type;
            select.append(option);
        }

        const prop = { name, type: select, container };

        const remove = createRemoveButton(() => {
            const index = StateData.stateProps.indexOf(prop);
            if (index !== -1) StateData.stateProps.splice(index, 1);
            container.remove();
        }, "Remove property");

        container.append(remove, name, colon, select);

        document.getElementById("addState").append(container);
        StateData.stateProps.push(prop);
    }

    static reset() {
        document.getElementById("stateName").value = "";
        for (const prop of StateData.stateProps) {
            prop.container.remove();
        }
        StateData.stateProps = [];
    }

    constructor(name, attrs = {}) {
        name = name.toUpperCase();
        if (name === "") {
            throw new Error("Can't have empty name");
        }
        if (StateData.stateNames.has(name)) {
            throw new Error("Name exists");
        }

        this.name = name;
        this.type = "state";
        this.attrs = attrs;
        this.className = "state states node glass";
        this.nodeEl = null;

        this.createElement();
        StateData.stateNames.add(name);
    }

    createElement() {
        const body = document.createElement("div");
        body.className = "selection-body";
        this.el = body;

        const div = document.createElement("div");
        div.className = "state states glass";

        const insert = document.createElement("button");
        insert.type = "button";
        insert.innerText = "==>";
        insert.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (!this.nodeEl) new Node(this);
        };

        const remove = createRemoveButton(
            () => this.remove(),
            `Remove state ${this.name}`
        );

        if (Object.keys(this.attrs).length !== 0) {
            const details = document.createElement("details");
            const summary = document.createElement("summary");
            const name = document.createElement("text");

            name.innerText = "> " + this.name;
            summary.classList.add("leftright");
            summary.append(remove, name, insert);

            details.appendChild(summary);
            div.appendChild(details);

            for (const [key, value] of Object.entries(this.attrs)) {
                const p = document.createElement("text");
                p.classList.add("leftright");
                const hr = document.createElement("hr");
                p.innerText = "==> " + key + ": ";

                const input = document.createElement("input");
                input.type = value;
                input.style = "width: 30%; min-width: 0;";

                p.append(input);

                p.append(createRemoveButton(() => {
                    delete this.attrs[key];
                    p.remove();
                }, `Remove property ${key}`));

                details.append(hr, p);
            }
        } else {
            const name = document.createElement("text");
            name.innerText = this.name;

            div.classList.add("leftright");
            div.append(remove, name, insert);
        }

        body.appendChild(div);
        StateData.stateBlocks.append(body);
    }

    remove() {
        if (this.nodeEl) {
            this.nodeEl.remove();
        }

        this.el.remove();
        StateData.stateNames.delete(this.name);
    }
}

class TriggerData {
    static triggerNames = new Set();
    static triggerBlocks = document.getElementById("triggers");
    static triggerProps = [];

    static triggerInputTypes = {
        "Button Down": "text",
        "Beam Break Dist": "number"
    }

    static addTrigger() {
        const attrs = Object.fromEntries(TriggerData.triggerProps.map(prop =>
            [prop.name.value, TriggerData.triggerInputTypes[prop.type.value]]
        ));

        new TriggerData(document.getElementById("triggerName").value.toUpperCase(), attrs);
        TriggerData.reset();
    }

    static addTriggerProperty() {
        const container = document.createElement("div");
        container.classList.add("leftright");

        const name = document.createElement("input");
        name.placeholder = "name";
        name.style = "width: 30%; height: 24px";

        const colon = document.createElement("text");
        colon.innerText = ": ";

        const select = document.createElement("select");
        select.style = "height: 24px";

        for (const type of Object.keys(TriggerData.triggerInputTypes)) {
            const option = document.createElement("option");
            option.innerText = type;
            select.append(option);
        }

        const prop = { name, type: select, container };

        const remove = createRemoveButton(() => {
            const index = TriggerData.triggerProps.indexOf(prop);
            if (index !== -1) TriggerData.triggerProps.splice(index, 1);
            container.remove();
        }, "Remove property");

        container.append(remove, name, colon, select);

        document.getElementById("addTrigger").append(container);
        TriggerData.triggerProps.push(prop);
    }

    static reset() {
        document.getElementById("triggerName").value = "";
        for (const prop of TriggerData.triggerProps) {
            prop.container.remove();
        }
        TriggerData.triggerProps = [];
    }

    constructor(name, attrs = {}) {
        name = name.toUpperCase();
        if (name === "") {
            throw new Error("Can't have empty name");
        }
        if (TriggerData.triggerNames.has(name)) {
            throw new Error("Name exists");
        }

        this.name = name;
        this.type = "trigger";
        this.attrs = attrs;
        this.className = "trigger triggers node glass";
        this.nodeEl = null;

        this.createElement();
        TriggerData.triggerNames.add(name);
    }

    createElement() {
        const body = document.createElement("div");
        body.className = "selection-body";
        this.el = body;

        const div = document.createElement("div");
        div.className = "trigger triggers glass";

        const insert = document.createElement("button");
        insert.type = "button";
        insert.innerText = "==>";
        insert.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (!this.nodeEl) new Node(this);
        };

        const remove = createRemoveButton(
            () => this.remove(),
            `Remove trigger ${this.name}`
        );

        if (Object.keys(this.attrs).length !== 0) {
            const details = document.createElement("details");
            const summary = document.createElement("summary");
            const name = document.createElement("text");

            name.innerText = "> " + this.name;

            summary.classList.add("leftright");
            summary.append(remove, name, insert);

            details.appendChild(summary);
            div.appendChild(details);

            for (const [key, value] of Object.entries(this.attrs)) {
                const p = document.createElement("text");
                p.classList.add("leftright");
                const hr = document.createElement("hr");
                p.innerText = "==> " + key + ": ";

                const input = document.createElement("input");
                input.type = value;
                input.style = "width: 30%; min-width: 0;";

                p.append(input);

                p.append(createRemoveButton(() => {
                    delete this.attrs[key];
                    p.remove();
                }, `Remove property ${key}`));

                details.append(hr, p);
            }
        } else {
            const name = document.createElement("text");
            name.innerText = this.name;

            div.classList.add("leftright");
            div.append(remove, name, insert);
        }

        body.appendChild(div);
        TriggerData.triggerBlocks.append(body);
    }

    remove() {
        if (this.nodeEl) {
            this.nodeEl.remove();
        }

        this.el.remove();
        TriggerData.triggerNames.delete(this.name);
    }
}

new StateData("Default");
new StateData("Example State");
new TriggerData("Example Trigger");