const MAX_ZOOM = 3;
const worker = new Worker('./canvas-layer/worker.js');
const isIOS = /iPhone|iPad|iPod|Firefox/i.test(navigator.userAgent);
L.TileLayer.Canvas = L.TileLayer.extend({
    
    _delays: {},
    _delaysForZoom: null,
    createCanvas: function (tile, coords, done) {
        let err;
        const {doubleSize} = this.options;

        const {x: width, y: height} = this.getTileSize();
        tile.width = doubleSize ? width * 2 : width;
        tile.height = doubleSize ? height * 2 : height;

        const img = new Image();
        const tileZoom = this._getZoomForUrl();
        if (tileZoom <= MAX_ZOOM) {
            img.onload = () => {
                const ctx = tile.getContext("2d");
                try {
                    ctx.drawImage(img, 0, 0);
                    tile.complete = true;
                } catch (e) {
                    err = e;
                } finally {
                    done(err, tile);
                }
            };
            img.src = isNaN(tileZoom) ? '' : this.getTileUrl(coords, tileZoom, tile);
            img.crossOrigin = "anonymous";
        } else {
            this.getTileUrl(coords, tileZoom, tile, done)
        }
    },
    getTiles: function name() {
        if(!this.tiles) {
            this.tiles = new Map();
        }
        return this.tiles
    },

    getTileUrl: function (coords, tileZoom, tile, done) {
        const {x, y, z} = coords;
        const {subdomains, tileSize, zoomOffset} = this.options;
        if (tileZoom > MAX_ZOOM) {
            const scaledCoords = {
                x: x >> (tileZoom - MAX_ZOOM),
                y: y >> (tileZoom - MAX_ZOOM),
                z: MAX_ZOOM,
            };
            const imageUrl = L.Util.template(this._url, L.extend({
                s: this._getSubdomain(scaledCoords, subdomains),
                z: scaledCoords.z,
                x: scaledCoords.x,
                y: this.getYForZoom(scaledCoords),
            }));
            if(isIOS) {
                this.drawTile(imageUrl, coords, scaledCoords, tile, done, this._getZoomForUrl());
            } else {
                const tileId = [coords.x, coords.y, tileZoom].join(', ')
                const tiles = this.getTiles();
                tiles.set(tileId, {myTile: {tile, dataUrl: ''}, doneF: done});
                worker.postMessage({ imageUrl, coords, scaledCoords, zoom: this._getZoomForUrl(), width: tile.width, height: tile.height, tileId, options: this.options });
                worker.onmessage = (event) => {
                    const { imgData, tileId } = event.data;
                    const {myTile, doneF} = tiles.get(tileId)
                    const tileCtx = myTile.tile.getContext('2d')
                    tileCtx.putImageData(imgData, 0, 0);
                    myTile.tile.complete = true;
                    doneF(null, myTile.tile);
                    tiles.delete(tileId)
                    return;
                };
            }
            
            
        } else {
            return L.TileLayer.prototype.getTileUrl.call(this, coords);
        }
    },
    getYForZoom(coords) {
        const maxTiles = Math.pow(2, coords.z);
        return (maxTiles - coords.y - 1) % maxTiles;
    },
    interpolateColors: function (color1, color2, steps) {
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
    },
    getGradient: function() {
        return gradient[this.options.data] || gradient["wind"]
    },
    changeGradientStep: function(steps) {
        this.gradientTree = null
        this.getGradientTree(steps)
    },
    getGradientTree: function (steps) {
        if(!this.gradientTree) {
            const denseGradient = [];
            const gradient = this.getGradient()
            for (let i = 0; i < gradient.length - 1; i++) {
                const colors = this.interpolateColors(gradient[i], gradient[i + 1], steps);
                denseGradient.push(...colors);
            }
            this.gradientTree = new GradientTree(denseGradient)
        }
        return this.gradientTree
    },

    drawTile(imgUrl, coords, scaledCoords, tile, done, zoom) {
        const img = new Image();
        img.src = imgUrl;

        const tileCtx = tile.getContext('2d')
        img.onload = () => {

            const imageWidth = tile.width / 2 ** (zoom - scaledCoords.z);
            const imageHeight = tile.height / 2 ** (zoom - scaledCoords.z);
            const imageX = (coords.x - scaledCoords.x * 2 ** (zoom - scaledCoords.z)) * imageWidth
            const imageY = (coords.y - scaledCoords.y * 2 ** (zoom - scaledCoords.z)) * imageHeight
            if (zoom < 6 && this.options.data !== 'precipitation'){
                tileCtx.drawImage(
                    img,
                    imageX,
                    imageY,
                    imageWidth,
                    imageHeight,
                    0,
                    0,
                    tile.width,
                    tile.height);
            }
            else if(zoom >=6 || (zoom > 3 && this.options.data === 'precipitation')) {
                const ctx = this.getTempCtx();
                const canvas = ctx.canvas;
                canvas.width = tile.width;
                canvas.height = tile.height;
                ctx.clearRect(0,0,canvas.width,canvas.height)
                ctx.drawImage(
                    img,
                    imageX,
                    imageY,
                    imageWidth,
                    imageHeight,
                    0,
                    0,
                    tile.width,
                    tile.height);
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imgData.data
                for (let i = 0; i < data.length; i += 4) {
                    const color = this.getGradientTree(this.options.gradientLevel || 7).findNearest([data[i], data[i + 1], data[i + 2]]);
                    data[i] = color[0];
                    data[i + 1] = color[1];
                    data[i + 2] = color[2];
                    data[i + 3] = color[3] || 255;
                }
                tileCtx.putImageData(imgData, 0, 0)
            }
            tile.complete = true;
            done(null, tile);
        };
    },
    createTile: function (coords, done) {
        const {timeout} = this.options;
        const {z: zoom} = coords;
        const tile = document.createElement("canvas");

        if (timeout) {
            if (zoom !== this._delaysForZoom) {
                this._clearDelaysForZoom();
                this._delaysForZoom = zoom;
            }

            if (!this._delays[zoom]) this._delays[zoom] = [];

            this._delays[zoom].push(setTimeout(() => {
                this.createCanvas(tile, coords, done);
            }, timeout));
        } else {
            this.createCanvas(tile, coords, done);
        }

        return tile;
    },
    _clearDelaysForZoom: function () {
        const prevZoom = this._delaysForZoom;
        const delays = this._delays[prevZoom];

        if (!delays) return;

        delays.forEach((delay, index) => {
            clearTimeout(delay);
            delete delays[index];
        });

        delete this._delays[prevZoom];
    },
    getTempCtx: function() {
        if (!this.ctx) {
            const e = document.createElement("canvas");
            this.ctx = e.getContext("2d", {
                desynchronized: true,
                willReadFrequently: true,
                alpha: false
            })
        }
        return this.ctx
    },
});

L.tileLayer.canvas = function tileLayerCanvas(url, options) {
    return new L.TileLayer.Canvas(url, options);
};


class GradientTree {
    constructor(gradient) {
        this.root = this.buildTree(gradient, 0);
        this.cache = new Map();
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

