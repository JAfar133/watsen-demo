importScripts('./gradient.js');
// worker.js
self.onmessage = function (e) {
    const { imageUrl, coords, scaledCoords, zoom, width, height, tileId, options } = e.data;
    fetch(imageUrl)
    .then(response => response.blob())
    .then(blob => createImageBitmap(blob))
    .then(imgBitmap => {
        const canvas = new OffscreenCanvas(width+0, height+0);
        const ctx = canvas.getContext('2d', {
            desynchronized: true,
            willReadFrequently: true,
            alpha: false
        });
        const imageWidth = (width+0) / 2 ** (zoom - scaledCoords.z);
            const imageHeight = (height+0) / 2 ** (zoom - scaledCoords.z);
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
            if(zoom > 3 && options.data === 'precipitation' || zoom >=6){
                
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


// custom interpolate

function drawTile(imgUrl, coords, scaledCoords, tile, done, zoom) {
    const img = new Image();
    img.src = imgUrl;
    img.crossOrigin = 'anonymous';
    const tileCtx = tile.getContext('2d')
    tileCtx.imageSmoothingEnabled = true;
    tileCtx.imageSmoothingQuality = "high"; // для использования более качественной интерполяции

    img.onload = () => {
        const imageWidth = tile.width / 2 ** (zoom - scaledCoords.z);
        const imageHeight = tile.height / 2 ** (zoom - scaledCoords.z);
        const imageX = (coords.x - scaledCoords.x * 2 ** (zoom - scaledCoords.z)) * imageWidth
        const imageY = (coords.y - scaledCoords.y * 2 ** (zoom - scaledCoords.z)) * imageHeight
        const upScale = tile.width/imageHeight
            const ctx = this.getTempCtx();
            const canvas = ctx.canvas;
            ctx.imageSmoothingEnabled = true;
            canvas.width = tile.width;
            canvas.height = tile.height;
            ctx.drawImage(
                img,
                0,
                0,);
            const imgData = ctx.getImageData(imageX, imageY, imageWidth, imageHeight);
            const tileImageData = tileCtx.createImageData(tile.width, tile.height)
            
            for (let y = 0; y < tile.height; y++) {
                for (let x = 0; x < tile.width; x++) {
                    const originalX = (x + 0.5) * imageWidth / tile.width - 0.5;
                    const originalY = (y + 0.5) * imageHeight / tile.height - 0.5;
                    const color = this.getBilinearInterpolatedPixel(imgData, originalX, originalY);
                    
                    // const color = bicubicInterpolation(x / upScale, y / upScale, imgData);
                
                    const index = (y * tile.width + x) * 4;
                    tileImageData.data[index] = color.r;
                    tileImageData.data[index + 1] = color.g;
                    tileImageData.data[index + 2] = color.b;
                    tileImageData.data[index + 3] = color.a;
                }
              }
        tileCtx.putImageData(tileImageData, 0, 0)
        tile.complete = true;
        done(null, tile);
    };
}
function bicubicInterpolation(x, y, imageData) {
    const w = imageData.width;
    const h = imageData.height;
    const data = imageData.data;
    const index = (Math.floor(y) * w + Math.floor(x)) * 4;
    const xDiff = x - Math.floor(x);
    const yDiff = y - Math.floor(y);
    const weights = [];
    let color = {r: 0, g: 0, b: 0, a: 0};
  
    for (let j = -1; j <= 2; j++) {
      for (let i = -1; i <= 2; i++) {
        const px = Math.min(w - 1, Math.max(0, Math.floor(x) + i));
        const py = Math.min(h - 1, Math.max(0, Math.floor(y) + j));
        const index = (py * w + px) * 4;
        const weight = this.cubicWeight(i - xDiff) * this.cubicWeight(j - yDiff);
        weights.push(weight);
        color.r += data[index] * weight;
        color.g += data[index + 1] * weight;
        color.b += data[index + 2] * weight;
        color.a += data[index + 3] * weight;
      }
    }
  
    const totalWeight = weights.reduce((a, b) => a + b);
    color.r /= totalWeight;
    color.g /= totalWeight;
    color.b /= totalWeight;
    color.a /= totalWeight;
  
    return color;
  }
  
function cubicWeight(t) {
    const a = -0.5;
    const at = Math.abs(t);
    if (at < 1) {
      return (a + 2) * at * at * at - (a + 3) * at * at + 1;
    } else if (at < 2) {
      return a * at * at * at - 5 * a * at * at + 8 * a * at - 4 * a;
    } else {
      return 0;
    }
  }
let count = 0;
function getBilinearInterpolatedPixel(imageData, x, y) {
    const x1 = Math.round(x);
    const x2 = Math.ceil(x);
    const y1 = Math.round(y);
    const y2 = Math.ceil(y);
    
    const p11 = this.getPixel(imageData, x1, y1);
    const p12 = this.getPixel(imageData, x1, y2);
    const p21 = this.getPixel(imageData, x2, y1);
    const p22 = this.getPixel(imageData, x2, y2);
    const f1 = (x2 - x) / (x2 - x1) * p11 + (x - x1) / (x2 - x1) * p21;
    const f2 = (x2 - x) / (x2 - x1) * p12 + (x - x1) / (x2 - x1) * p22;
    const f = (y2 - y) / (y2 - y1) * f1 + (y - y1) / (y2 - y1) * f2;
    return f;
  }
  
function getPixel(imageData, x, y) {
    const index = (y * imageData.width + x) * 4;
    const r = imageData.data[index];
    const g = imageData.data[index + 1];
    const b = imageData.data[index + 2];
    const a = imageData.data[index + 3];
    return { r, g, b, a };
  }
function getPixelValue(imgDat, x,y, result = []){ 
    var i;
    // clamp and floor coordinate
    const ix1 = (x < 0 ? 0 : x >= imgDat.width ? imgDat.width - 1 : x)| 0;
    const iy1 = (y < 0 ? 0 : y >= imgDat.height ? imgDat.height - 1 : y) | 0;
    // get next pixel pos
    const ix2 = ix1 === imgDat.width -1 ? ix1 : ix1 + 1;
    const iy2 = iy1 === imgDat.height -1 ? iy1 : iy1 + 1;
    // get interpolation position 
    const xpos = x % 1;
    const ypos = y % 1;
    // get pixel index
    var i1 = (ix1 + iy1 * imgDat.width) * 4;
    var i2 = (ix2 + iy1 * imgDat.width) * 4;
    var i3 = (ix1 + iy2 * imgDat.width) * 4;
    var i4 = (ix2 + iy2 * imgDat.width) * 4;

    // to keep code short and readable get data alias
    const d = imgDat.data;

    for(i = 0; i < 3; i ++){
        // interpolate x for top and bottom pixels
        const c1 = (d[i2] * d[i2++] - d[i1] * d[i1]) * xpos + d[i1] * d[i1 ++];
        const c2 = (d[i4] * d[i4++] - d[i3] * d[i3]) * xpos + d[i3] * d[i3 ++];

        // now interpolate y
        result[i] = Math.sqrt((c2 - c1) * ypos + c1);
    }

    // and alpha is not logarithmic
    const c1 = (d[i2] - d[i1]) * xpos + d[i1];
    const c2 = (d[i4] - d[i3]) * xpos + d[i3];
    result[3] = (c2 - c1) * ypos + c1;
    return result;
}