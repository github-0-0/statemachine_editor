
class DiagramEditor {
	static SCALE = 20;

	constructor(board, svg) {
		this.board = board;
		this.svg = svg;

		this.nodes = new Set();
		this.arrows = new Set();

		this.stateNames = new Set();
		this.triggerNames = new Set();

		this.activeArrow = null;
		this.selectedArrow = null;
		this.dragSession = null;

		this.bindBoardEvents();
		this.bindEditableText();
	}

	// --------------------------------------------------
	// Initialization
	// --------------------------------------------------

	bindBoardEvents() {
		this.board.addEventListener("mousemove", (e) => {
			this.onBoardMouseMove(e);
		});

		this.board.addEventListener("contextmenu", (e) => {
			this.onBoardContextMenu(e);
		});

		this.board.addEventListener("pointerdown", (e) => {
			this.onBoardPointerDown(e);
		});

		document.addEventListener("keydown", (e) => {
			this.onKeyDown(e);
		});
	}

	bindEditableText() {
		document.querySelectorAll(".editable-text").forEach((element) => {
			element.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				e.stopPropagation();

				element.setAttribute("contenteditable", "");
				element.focus();
			});
		});
	}

	// --------------------------------------------------
	// Node creation
	// --------------------------------------------------

	insertState() {
		const name = this.uniqueName("ExampleState", this.stateNames);
		const state = new StateNode(this, name);

		this.nodes.add(state);
		return state;
	}

	insertTrigger() {
		const name = this.uniqueName("ExampleTrigger", this.triggerNames);
		const trigger = new TriggerNode(this, name);

		this.nodes.add(trigger);
		return trigger;
	}

	uniqueName(base, names) {
		let name = base;
		let index = 1;

		while (names.has(name)) {
			name = `${base} (${index++})`;
		}

		names.add(name);
		return name;
	}

	randomPosition() {
		const randomCoordinate = () =>
			Math.round(Math.random() * 100 / DiagramEditor.SCALE)
				* DiagramEditor.SCALE;

		return [randomCoordinate(), randomCoordinate()];
	}

	snap(value) {
		return Math.round(value / DiagramEditor.SCALE)
			* DiagramEditor.SCALE;
	}

	// --------------------------------------------------
	// Node dragging
	// --------------------------------------------------

	beginNodeDrag(node, e) {
		if (this.dragSession) return;

		this.dragSession = {
			node,
			pointerId: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			startOffsetX: node.offsetX,
			startOffsetY: node.offsetY,
			lastX: e.clientX,
			lastY: e.clientY,
			distance: 0
		};

		node.element.setPointerCapture(e.pointerId);
	}

	moveNode(node, e) {
		const session = this.dragSession;

		if (!session) return;
		if (session.node !== node) return;
		if (session.pointerId !== e.pointerId) return;

		session.distance += Math.hypot(
			e.clientX - session.lastX,
			e.clientY - session.lastY
		);

		session.lastX = e.clientX;
		session.lastY = e.clientY;

		// Ignore small pointer movements.
		if (session.distance <= 3) return;

		node.offsetX = this.snap(
			session.startOffsetX + e.clientX - session.startX
		);

		node.offsetY = this.snap(
			session.startOffsetY + e.clientY - session.startY
		);

		node.updatePosition();
		this.updateAllArrows();
	}

	endNodeDrag(node, e) {
		const session = this.dragSession;

		if (!session) return;
		if (session.node !== node) return;
		if (session.pointerId !== e.pointerId) return;

		this.dragSession = null;

		if (node.element.hasPointerCapture(e.pointerId)) {
			node.element.releasePointerCapture(e.pointerId);
		}

		// A pointer interaction that didn't become a drag is a click.
		if (session.distance <= 3) {
			this.activateNode(node);
		}

		this.updateAllArrows();
	}

	cancelNodeDrag(node, e) {
		const session = this.dragSession;

		if (!session) return;
		if (session.node !== node) return;
		if (session.pointerId !== e.pointerId) return;

		this.dragSession = null;
		this.updateAllArrows();
	}

	// --------------------------------------------------
	// Arrow creation and connection
	// --------------------------------------------------

	activateNode(node) {
		if (!this.activeArrow) {
			this.activeArrow = new Arrow(this, node);
			return;
		}

		// Only opposite node types can connect.
		if (!this.activeArrow.fromNode.canConnectTo(node)) {
			return;
		}

		this.activeArrow.complete(node);

		this.arrows.add(this.activeArrow);
		this.activeArrow = null;

		this.updateAllArrows();
	}

	cancelActiveArrow() {
		if (!this.activeArrow) return;

		this.activeArrow.remove();
		this.activeArrow = null;
	}

	addWaypoint(point) {
		if (!this.activeArrow) return;

		this.activeArrow.addWaypoint(point);
	}

	// --------------------------------------------------
	// Arrow selection and deletion
	// --------------------------------------------------

	selectArrow(arrow) {
		if (this.activeArrow) return;

		this.selectedArrow?.group.classList.remove("selected");

		this.selectedArrow = arrow;

		this.selectedArrow?.group.classList.add("selected");
	}

	deleteSelectedArrow() {
		if (!this.selectedArrow) return;

		this.selectedArrow.remove();
		this.arrows.delete(this.selectedArrow);
		this.selectedArrow = null;
	}

	// --------------------------------------------------
	// Board events
	// --------------------------------------------------

	onBoardMouseMove(e) {
		if (!this.activeArrow) return;

		const rect = this.board.getBoundingClientRect();

		const point = [
			this.snap(e.clientX - rect.left),
			this.snap(e.clientY - rect.top)
		];

		this.activeArrow.setPreviewPoint(point);
	}

	onBoardContextMenu(e) {
		e.preventDefault();

		if (!this.activeArrow) return;

		const rect = this.board.getBoundingClientRect();

		const point = [
			this.snap(e.clientX - rect.left),
			this.snap(e.clientY - rect.top)
		];

		this.addWaypoint(point);
	}

	onBoardPointerDown(e) {
		if (e.button !== 0) return;

		// Interactions with nodes and arrows aren't empty-board clicks.
		if (e.target.closest?.(".state, .trigger, .edge-group")) {
			return;
		}

		this.cancelActiveArrow();
		this.selectArrow(null);
	}

	onKeyDown(e) {
		if (e.key === "Escape") {
			this.cancelActiveArrow();
			return;
		}

		if (e.key === "Delete" || e.key === "Backspace") {
			this.deleteSelectedArrow();
		}
	}

	// --------------------------------------------------
	// Geometry
	// --------------------------------------------------

	getBottomCenter(node) {
		const boardRect = this.board.getBoundingClientRect();
		const rect = node.element.getBoundingClientRect();

		return [
			Math.round(rect.left - boardRect.left + rect.width / 2),
			Math.round(rect.bottom - boardRect.top)
		];
	}

	getNearestSideCenter(node, refPoint) {
		const boardRect = this.board.getBoundingClientRect();
		const rect = node.element.getBoundingClientRect();

		const cx = Math.round(
			rect.left - boardRect.left + rect.width / 2
		);

		const cy = Math.round(
			rect.top - boardRect.top + rect.height / 2
		);

		const candidates = [
			[cx, Math.round(rect.top - boardRect.top)],
			[cx, Math.round(rect.bottom - boardRect.top)],
			[Math.round(rect.left - boardRect.left), cy],
			[Math.round(rect.right - boardRect.left), cy]
		];

		return candidates.reduce((best, point) => {
			const distance = Math.hypot(
				point[0] - refPoint[0],
				point[1] - refPoint[1]
			);

			return distance < best.distance
				? { point, distance }
				: best;
		}, {
			point: candidates[0],
			distance: Infinity
		}).point;
	}

	getMidpoint(point1, point2) {
		const dx = point2[0] - point1[0];
		const dy = point2[1] - point1[1];

		const absX = Math.abs(dx);
		const absY = Math.abs(dy);

		if (absX === 0 || absY === 0 || absX === absY) {
			return null;
		}

		if (absX > absY) {
			return [
				point2[0] - absY * Math.sign(dx),
				point1[1]
			];
		}

		return [
			point1[0],
			point2[1] - absX * Math.sign(dy)
		];
	}

	// --------------------------------------------------
	// Rendering
	// --------------------------------------------------

	updateAllArrows() {
		this.activeArrow?.render();

		for (const arrow of this.arrows) {
			arrow.render();
		}
	}
}


// ==================================================
// Diagram Node
// ==================================================

class DiagramNode {
	constructor(editor, name, kind, className) {
		this.editor = editor;
		this.name = name;
		this.kind = kind;

		this.offsetX = 0;
		this.offsetY = 0;

		this.element = document.createElement("div");

		this.element.className = className;
		this.element.textContent = name;

		this.element.style.position = "absolute";
		this.element.style.left = "";
		this.element.style.top = "";
		this.element.style.cursor = "grab";
		this.element.style.userSelect = "none";
		this.element.style.touchAction = "none";
		this.element.style.zIndex = "2";

		const [x, y] = editor.randomPosition();

		this.element.style.left = `${x}px`;
		this.element.style.top = `${y}px`;

		editor.board.appendChild(this.element);

		this.bindEvents();
	}

	bindEvents() {
		this.element.addEventListener("pointerdown", (e) => {
			this.onPointerDown(e);
		});

		this.element.addEventListener("pointermove", (e) => {
			this.onPointerMove(e);
		});

		this.element.addEventListener("pointerup", (e) => {
			this.onPointerUp(e);
		});

		this.element.addEventListener("pointercancel", (e) => {
			this.onPointerCancel(e);
		});
	}

	onPointerDown(e) {
		if (e.button !== 0) return;

		e.preventDefault();
		e.stopPropagation();

		this.element.style.cursor = "grabbing";
		this.editor.beginNodeDrag(this, e);
	}

	onPointerMove(e) {
		this.editor.moveNode(this, e);
	}

	onPointerUp(e) {
		this.element.style.cursor = "grab";
		this.editor.endNodeDrag(this, e);
	}

	onPointerCancel(e) {
		this.element.style.cursor = "grab";
		this.editor.cancelNodeDrag(this, e);
	}

	updatePosition() {
		this.element.style.transform =
			`translate(${this.offsetX}px, ${this.offsetY}px)`;
	}

	canConnectTo(node) {
		return node instanceof DiagramNode && this.kind !== node.kind;
	}
}


// ==================================================
// State
// ==================================================

class StateNode extends DiagramNode {
	constructor(editor, name) {
		super(editor, name, "state", "state states");
	}
}


// ==================================================
// Trigger
// ==================================================

class TriggerNode extends DiagramNode {
	constructor(editor, name) {
		super(editor, name, "trigger", "trigger triggers");
	}
}


// ==================================================
// Arrow
// ==================================================

class Arrow {
	static SVG_NS = "http://www.w3.org/2000/svg";

	constructor(editor, fromNode) {
		this.editor = editor;
		this.fromNode = fromNode;
		this.toNode = null;

		this.waypoints = [];
		this.previewPoint = null;

		this.group = this.createGroup();

		const start = editor.getBottomCenter(fromNode);

		this.previewPoint = [
			start[0],
			start[1] + DiagramEditor.SCALE
		];

		this.render();
	}

	// --------------------------------------------------
	// SVG creation
	// --------------------------------------------------

	static createSvgElement(tag, attributes = {}) {
		const element = document.createElementNS(Arrow.SVG_NS, tag);

		for (const [key, value] of Object.entries(attributes)) {
			element.setAttribute(key, value);
		}

		return element;
	}

	createGroup() {
		const group = Arrow.createSvgElement("g", {
			class: "edge-group"
		});

		this.hitPath = Arrow.createSvgElement("path", {
			class: "edge-hit"
		});

		this.visiblePath = Arrow.createSvgElement("path", {
			class: "edge draft",
			"marker-end": "url(#arrow)"
		});

		group.appendChild(this.hitPath);
		group.appendChild(this.visiblePath);

		this.editor.svg.appendChild(group);

		group.addEventListener("click", (e) => {
			e.stopPropagation();
			this.editor.selectArrow(this);
		});

		return group;
	}

	updatePath(points) {
		const d = points
			.map(([x, y], index) =>
				`${index === 0 ? "M" : "L"} ${x} ${y}`
			)
			.join(" ");

		this.hitPath.setAttribute("d", d);
		this.visiblePath.setAttribute("d", d);
	}

	// --------------------------------------------------
	// Arrow lifecycle
	// --------------------------------------------------

	complete(target) {
		if (!this.fromNode.canConnectTo(target)) {
			throw new Error("Cannot connect nodes of the same type.");
		}

		this.toNode = target;
		this.previewPoint = null;

		this.visiblePath.classList.remove("draft");

		this.render();
	}

	remove() {
		this.group.remove();
	}

	addWaypoint(point) {
		const lastPoint = this.waypoints.at(-1);

		if (
			lastPoint &&
			lastPoint[0] === point[0] &&
			lastPoint[1] === point[1]
		) {
			return;
		}

		this.waypoints.push(point);
		this.previewPoint = point;

		this.render();
	}

	setPreviewPoint(point) {
		this.previewPoint = point;
		this.render();
	}

	// --------------------------------------------------
	// Arrow routing
	// --------------------------------------------------

	getAnchors() {
		const start = this.editor.getBottomCenter(this.fromNode);
		const exitPoint = [
			start[0],
			start[1] + DiagramEditor.SCALE
		];

		const anchors = [
			start,
			exitPoint,
			...this.waypoints
		];

		if (this.toNode) {
			const lastAnchor = anchors.at(-1);

			const end = this.editor.getNearestSideCenter(
				this.toNode,
				lastAnchor
			);

			if (end[0] !== lastAnchor[0] || end[1] !== lastAnchor[1]) {
				anchors.push(end);
			}
		} else if (this.previewPoint) {
			const lastAnchor = anchors.at(-1);

			if (
				this.previewPoint[0] !== lastAnchor[0] ||
				this.previewPoint[1] !== lastAnchor[1]
			) {
				anchors.push(this.previewPoint);
			}
		}

		return anchors;
	}

	getRoutePoints(anchors) {
		const routePoints = [];

		for (let i = 0; i < anchors.length - 1; i++) {
			routePoints.push(anchors[i]);

			const midpoint = this.editor.getMidpoint(
				anchors[i],
				anchors[i + 1]
			);

			if (midpoint) {
				routePoints.push(midpoint);
			}
		}

		routePoints.push(anchors.at(-1));

		return routePoints;
	}

	render() {
		const anchors = this.getAnchors();
		const routePoints = this.getRoutePoints(anchors);

		this.updatePath(routePoints);
	}
}


// ==================================================
// Initialize
// ==================================================

const editor = new DiagramEditor(
	document.getElementById("board"),
	document.getElementById("edges")
);
