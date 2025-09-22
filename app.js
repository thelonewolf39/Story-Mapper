// ==========================
// Story Mapper App.js
// ==========================

// ----- Canvas & Context -----
const canvas = document.getElementById("graph");
const ctx = canvas.getContext("2d");
canvas.width = canvas.offsetWidth;
canvas.height = canvas.offsetHeight;

// ----- Story Initialization -----
const urlParams = new URLSearchParams(window.location.search);
const storyId = urlParams.get("id");
if (!storyId) alert("No story ID provided!");

let story = loadStory();
let currentNodeId = story.nodes.length ? story.nodes[0].id : null;

document.getElementById("story-title").textContent = story.title;
document.getElementById("story-link").value = story.mainLink;

// ----- Viewport for Panning & Zoom -----
let offsetX = 0, offsetY = 0;
let scale = 1;
let isPanning = false;
let panStart = {x:0, y:0};
let draggingNode = null;

// ----- Helper Functions -----
function saveStory() {
    localStorage.setItem("story-" + storyId, JSON.stringify(story));
}

function loadStory() {
    const data = localStorage.getItem("story-" + storyId);
    if (data) return JSON.parse(data);
    return { id: storyId, title: "Untitled Story", mainLink: "", nodes: [] };
}

function extractLinks(body) {
    const regex = /\[\[([^\]]+)\]\]/g;
    let links = [], match;
    while (match = regex.exec(body)) links.push(match[1]);
    return links;
}

// ----- Node CRUD -----
const nodeSelect = document.getElementById("node-select");

function refreshNodeSelect() {
    nodeSelect.innerHTML = "";
    story.nodes.forEach(n => {
        const opt = document.createElement("option");
        opt.value = n.id;
        opt.textContent = n.title || "(untitled)";
        nodeSelect.appendChild(opt);
    });
}

function loadNode(nodeId) {
    const node = story.nodes.find(n => n.id === nodeId);
    if (!node) return;
    document.getElementById("node-title").value = node.title;
    document.getElementById("node-body").value = node.body;
    document.getElementById("node-main").checked = node.main || false;
    currentNodeId = node.id;
}

// ----- Node Controls -----
document.getElementById("new-node").addEventListener("click", () => {
    const id = "node-" + Date.now();
    const node = { 
        id, title: "New Node", body: "", main: false,
        x: canvas.width/2 + Math.random()*100-50,
        y: canvas.height/2 + Math.random()*100-50,
        expanded: false
    };
    story.nodes.push(node);
    currentNodeId = id;
    refreshNodeSelect();
    loadNode(id);
    saveStory();
    drawGraph();
});

document.getElementById("save-node").addEventListener("click", () => {
    if (!currentNodeId) return;
    const node = story.nodes.find(n => n.id === currentNodeId);
    node.title = document.getElementById("node-title").value;
    node.body = document.getElementById("node-body").value;
    node.main = document.getElementById("node-main").checked;
    saveStory();
    refreshNodeSelect();
    drawGraph();
});

document.getElementById("delete-node").addEventListener("click", () => {
    if (!currentNodeId) return;
    story.nodes = story.nodes.filter(n => n.id !== currentNodeId);
    currentNodeId = story.nodes.length ? story.nodes[0].id : null;
    refreshNodeSelect();
    if(currentNodeId) loadNode(currentNodeId);
    saveStory();
    drawGraph();
});

nodeSelect.addEventListener("change", e => loadNode(e.target.value));

// ----- Save Main Story Link -----
document.getElementById("save-main").addEventListener("click", () => {
    story.mainLink = document.getElementById("story-link").value;
    saveStory();
    alert("Main story link saved!");
});

// ==========================
// Graph Drawing & Interaction
// ==========================

// Draw the full graph
function drawGraph() {
    ctx.clearRect(0,0,canvas.width,canvas.height);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Draw edges first
    story.nodes.forEach(n => {
        const links = extractLinks(n.body);
        links.forEach(title => {
            const target = story.nodes.find(x => x.title === title);
            if(target) drawEdge(n, target);
        });
    });

    // Draw nodes
    story.nodes.forEach(n => drawNode(n));

    ctx.restore();
}

// Draw a curved edge
function drawEdge(n1, n2) {
    const cpX = (n1.x + n2.x)/2 + 20*Math.sin((n1.y+n2.y)/50);
    const cpY = (n1.y + n2.y)/2 + 20*Math.cos((n1.x+n2.x)/50);
    ctx.beginPath();
    ctx.moveTo(n1.x, n1.y);
    ctx.quadraticCurveTo(cpX, cpY, n2.x, n2.y);
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();
}

// Draw individual node
function drawNode(n) {
    const radius = n.main ? 50 : 35;
    ctx.beginPath();
    ctx.arc(n.x, n.y, radius, 0, Math.PI*2);
    ctx.fillStyle = n.main ? "#f1c40f" : "#3498db";
    ctx.fill();
    ctx.strokeStyle = "#2c3e50";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Title
    ctx.fillStyle = "#fff";
    ctx.font = n.main ? "bold 14px Arial" : "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(n.title, n.x, n.y+4);

    // Body if expanded
    if(n.expanded){
        const width = 220;
        const height = 100;
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillRect(n.x + radius + 10, n.y - height/2, width, height);
        ctx.fillStyle = "#fff";
        ctx.font = "12px Arial";
        wrapText(ctx, n.body, n.x + radius + 15, n.y - height/2 + 15, width-10, 16);
    }
}

// Wrap text for canvas
function wrapText(ctx, text, x, y, maxWidth, lineHeight){
    const words = text.split(' ');
    let line = '';
    for(let n=0;n<words.length;n++){
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if(metrics.width > maxWidth && n>0){
            ctx.fillText(line, x, y);
            line = words[n] + ' ';
            y += lineHeight;
        } else line = testLine;
    }
    ctx.fillText(line, x, y);
}

// ==========================
// Canvas Interaction: Drag, Expand, Pan, Zoom
// ==========================

canvas.addEventListener("mousedown", e=>{
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - offsetX)/scale;
    const mouseY = (e.clientY - rect.top - offsetY)/scale;

    if(e.button===2){ // right-click -> start pan
        isPanning = true;
        panStart = {x: e.clientX - offsetX, y: e.clientY - offsetY};
    } else { // left-click -> check for node drag or toggle expand
        draggingNode = null;
        story.nodes.forEach(n=>{
            const r = n.main ? 50 : 35;
            if(Math.hypot(mouseX - n.x, mouseY - n.y) < r){
                if(e.detail === 2) n.expanded = !n.expanded; // double click
                else draggingNode = n; // single click drag
            }
        });
    }
});

canvas.addEventListener("mousemove", e=>{
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - offsetX)/scale;
    const mouseY = (e.clientY - rect.top - offsetY)/scale;

    if(draggingNode){
        draggingNode.x = mouseX;
        draggingNode.y = mouseY;
        saveStory();
    } else if(isPanning){
        offsetX = e.clientX - panStart.x;
        offsetY = e.clientY - panStart.y;
    }

    drawGraph();
});

canvas.addEventListener("mouseup", e=>{
    draggingNode = null;
    isPanning = false;
});

canvas.addEventListener("mouseleave", e=>{
    draggingNode = null;
    isPanning = false;
});

// Zoom with wheel
canvas.addEventListener("wheel", e=>{
    e.preventDefault();
    const zoomFactor = 1.1;
    const mouseX = (e.clientX - canvas.getBoundingClientRect().left - offsetX)/scale;
    const mouseY = (e.clientY - canvas.getBoundingClientRect().top - offsetY)/scale;
    if(e.deltaY < 0) scale *= zoomFactor;
    else scale /= zoomFactor;

    // Keep mouse position stationary while zooming
    offsetX -= mouseX*(scale/zoomFactor - scale);
    offsetY -= mouseY*(scale/zoomFactor - scale);

    drawGraph();
});

// Disable context menu for right click
canvas.addEventListener("contextmenu", e=> e.preventDefault());

// ==========================
// Init
// ==========================
refreshNodeSelect();
if(currentNodeId) loadNode(currentNodeId);
drawGraph();
