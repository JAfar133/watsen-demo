importScripts('./gradient.js');
// worker.js
self.onmessage = function (e) {
    const { imageUrl, coords, scaledCoords, zoom, width, height, tileId, options } = e.data;
    fetch(imageUrl)
    .then(response => response.blob())
    .then(blob => createImageBitmap(blob))
    .then(imgBitmap => {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        const imageWidth = width / 2 ** (zoom - scaledCoords.z);
            const imageHeight = height / 2 ** (zoom - scaledCoords.z);
            const imageX = (coords.x - scaledCoords.x * 2 ** (zoom - scaledCoords.z)) * imageWidth
            const imageY = (coords.y - scaledCoords.y * 2 ** (zoom - scaledCoords.z)) * imageHeight
            ctx.drawImage(
                imgBitmap,
                imageX,
                imageY,
                imageWidth,
                imageHeight,
                0,
                0,
                canvas.width,
                canvas.height);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            if(zoom >= 3 && options.data === 'precipitation' || zoom >=6){
                const data = imgData.data;
                for (let i = 0; i < data.length; i += 4) {
                    const color = getGradientTree(options.gradientLevel || 7, options.data).findNearest([data[i], data[i + 1], data[i + 2]]);
                    data[i] = color[0];
                    data[i + 1] = color[1];
                    data[i + 2] = color[2];
                    data[i + 3] = color[3] || 255;
                }
            }
            
        self.postMessage({ imgData, tileId });
    });
            
};


function interpolateColors(color1, color2, steps) {
    const stepFactor = 1 / (steps - 1);
    const interpolatedColors = [];

    for (let i = 0; i < steps; i++) {
        const t = stepFactor * i;
        const r = Math.round(color1[0] + (color2[0] - color1[0]) * t);
        const g = Math.round(color1[1] + (color2[1] - color1[1]) * t);
        const b = Math.round(color1[2] + (color2[2] - color1[2]) * t);
        interpolatedColors.push([r, g, b, color1[3]]);
    }

    return interpolatedColors;
}
function getGradient(data) {
    return gradient[data] || gradient["wind"]
}
let gradientTree
function getGradientTree(steps, data) {
    function createGradientTree() {
        const denseGradient = [];
        const gradient = getGradient(data)
        for (let i = 0; i < gradient.length - 1; i++) {
            const colors = interpolateColors(gradient[i], gradient[i + 1], steps);
            denseGradient.push(...colors);
        }
        gradientTree = new GradientTree(denseGradient, data)
    }
    if(!gradientTree) {
        createGradientTree()
    } else if (gradientTree && gradientTree.data !== data) {
        createGradientTree()
    }
    return gradientTree
}
class GradientTree {
    constructor(gradient, data) {
        this.root = this.buildTree(gradient, 0);
        this.cache = new Map();
        this.data = data;
    }

    buildTree(gradient, depth) {
        if (gradient.length === 0) {
            return null;
        }

        const axis = depth % 3;
        gradient.sort((a, b) => a[axis] - b[axis]);

        const medianIndex = Math.floor(gradient.length / 2);
        const median = gradient[medianIndex];

        const leftPoints = gradient.slice(0, medianIndex);
        const rightPoints = gradient.slice(medianIndex + 1);

        return {
            point: median,
            left: this.buildTree(leftPoints, depth + 1),
            right: this.buildTree(rightPoints, depth + 1)
        };
    }

    findNearest(pixel) {
        let best = null;
        let bestDist = Infinity;
        const cacheKey = pixel.join(',')
        if(this.cache.has(cacheKey)){
            return this.cache.get(cacheKey)
        }
        const search = (node, depth) => {
            if (node === null) {
                return;
            }

            const axis = depth % 3;
            const nodeColor = node.point;

            const nodeDist = this.distance(nodeColor, pixel);
            if (nodeDist < bestDist) {
                best = nodeColor;
                bestDist = nodeDist;
            }

            const isLeft = pixel[axis] < nodeColor[axis];
            const closeNode = isLeft ? node.left : node.right;
            const awayNode = isLeft ? node.right : node.left;

            search(closeNode, depth + 1);

            if (Math.abs(pixel[axis] - nodeColor[axis]) < bestDist) {
                search(awayNode, depth + 1);
            }
        };

        search(this.root, 0);
        this.cache.set(cacheKey, best)
        console.log(best);
        return best;
    }

    distance(a, b) {
        return Math.sqrt(
            (a[0] - b[0]) ** 2 +
            (a[1] - b[1]) ** 2 +
            (a[2] - b[2]) ** 2
        );
    }
}