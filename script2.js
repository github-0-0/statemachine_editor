class Constants {
    static board = document.getElementById("board");
    static svg = document.getElementById("edges");
    static scale = 20;

	static snap(value) {
		return Math.round(value / Constants.scale)
			* Constants.scale;
	}
}

class State {
    static nameBank = new Set();
    constructor(name) {
        if (State.nameBank.has(name)) {
            throw new RangeError("Name taken");
        }
        this.name = name;
        State.nameBank.add(name);
        this.el = null;
    }

    insert() {
        if (this.el) {
            throw new Error("Element already exists");
        }

		this.el = document.createElement("div");
		this.el.className = "state states";
		this.el.textContent = this.name;
		this.el.style.position = "absolute";
		this.el.style.left = "";
		this.el.style.top = "";
		this.el.style.cursor = "grab";
		this.el.style.userSelect = "none";
		this.el.style.touchAction = "none";
		this.el.style.zIndex = "2";
		const [x, y] = State.randomPosition();
		this.el.style.left = `${x}px`;
		this.el.style.top = `${y}px`;
		Constants.board.appendChild(this.el);
    }

	static randomPosition() {
		const randomCoordinate = () =>
			Math.round(Math.random() * 100 / Constants.SCALE)
				* Constants.SCALE;

		return [randomCoordinate(), randomCoordinate()];
	}

	getBottomCenter(node2) {
		const boardRect = Constants.board.getBoundingClientRect();
		const rect = node2.getBoundingClientRect();

		return [
			Math.round(rect.left - boardRect.left + rect.width / 2),
			Math.round(rect.bottom - boardRect.top)
		];
	}
}

class Arrow2 {
	static SVG_NS = "http://www.w3.org/2000/svg";
    constructor(initialNode, waypoints, finalNode) {
        this.initialNode = initialNode;
        this.waypoints = waypoints;
        this.finalNode = finalNode;
    }

	static createSvgElement(tag, attributes = {}) {
		const el = document.createElementNS(Arrow2.SVG_NS, tag);

		for (const [key, value] of Object.entries(attributes)) {
			el.setAttribute(key, value);
		}

		return el;
	}

    toPoints() {
        let points = [];
		points.push(editor.getBottomCenter(fromNode));

		points.push([
			points[0][0],
			start[1] + Constants.scale
		]);


    }

	createGroup() {
		const group = Arrow2.createSvgElement("g", {
			class: "edge-group"
		});

		this.hitPath = Arrow2.createSvgElement("path", {
			class: "edge-hit"
		});

		this.visiblePath = Arrow2.createSvgElement("path", {
			class: "edge draft",
			"marker-end": "url(#arrow)"
		});

		group.appendChild(this.hitPath);
		group.appendChild(this.visiblePath);

		Constants.svg.appendChild(group);

		group.addEventListener("click", (e) => {
			e.stopPropagation();
			this.editor.selectArrow(this);
		});

        let points = this.toPoints();
        // let points = [];

        // for (let i = 0; i < 10; i++) {
        //     points.push(
        //         [Math.round(Math.random() * 100),
        //         Math.round(Math.random() * 100)]
        //     );
        // }

		const d = points
			.map(([x, y], index) =>
				`${index === 0 ? "M" : "L"} ${x} ${y}`
			)
			.join(" ");

		this.hitPath.setAttribute("d", d);
		this.visiblePath.setAttribute("d", d);

		return group;
	}
}

class BoardNode {
    constructor(type, name) {
        this.type = type;
        this.name = name;
    }

}

new Arrow2(null, null, null).createGroup();
new State("hi").insert();