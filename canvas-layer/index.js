let MAX_ZOOM = 3;

const canvasTiles = new Map()
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
        if (tileZoom < 4) MAX_ZOOM = 1
        else if(tileZoom < 8) MAX_ZOOM = 2
        else MAX_ZOOM = 2
        img.onload = () => {
            const imageCanvas = this.createImageTile(img)
            this.drawTile(imageCanvas, coords, tile, done)
        };
        const src = this.getTileUrl(coords, tileZoom, tile);
        if(canvasTiles.has(src)) {
            this.drawTile(canvasTiles.get(src), coords, tile, done)
            return;
        }
        img.src = isNaN(tileZoom) ? '' : src;
        img.crossOrigin = "anonymous";
        
    },
    getTileUrl: function (coords) {
        const {x, y, z} = coords;
        const {subdomains, tileSize, zoomOffset} = this.options;
        const tileZoom = this._getZoomForUrl();
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
            return imageUrl;
        } else {
            return L.TileLayer.prototype.getTileUrl.call(this, coords);
        }
    },
    getYForZoom(coords) {
        const maxTiles = Math.pow(2, coords.z);
        return (maxTiles - coords.y - 1) % maxTiles;
    },
    getGradient: function() {
        return gradient[this.options.data] || gradient["wind"]
    },
    createImageTile(img) {
        if(canvasTiles.has(img.src)) {
            return canvasTiles.get(img.src)
        }
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // ctx.imageSmoothingEnabled = true;
        // ctx.imageSmoothingQuality = "high";

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0)
        canvasTiles.set(img.src, canvas)
        return canvas
    },
    fillTile: function name(imgData) {
        const data = imgData.data
        for (let i = 0; i < data.length; i += 4) {
            const red = data[i];
            const green = data[i + 1];
            const blue = data[i + 2];
            const w_speed = this.getWindSpeedFromPixel([red, green, blue])
            
            const color = this.interpolateColor(w_speed, this.getGradient())
            data[i] = color[0] || 100
            data[i+1] = color[1] || 100
            data[i+2] = color[2] || 100

        }
    },
    drawTile(imageCanvas, coords, tile, done) {
        const tileCtx = tile.getContext('2d')
        const tileZoom = this._getZoomForUrl();

        if(tileZoom <= MAX_ZOOM) {
            tileCtx.drawImage(imageCanvas, 0, 0);
            tile.complete = true;
            done(null, tile);
            return;
        }

        const {x, y, z} = coords;
        const scaledCoords = {
            x: x >> (tileZoom - MAX_ZOOM),
            y: y >> (tileZoom - MAX_ZOOM),
            z: MAX_ZOOM,
        };
        const imageWidth = tile.width / 2 ** (tileZoom - scaledCoords.z);
        const imageHeight = tile.height / 2 ** (tileZoom - scaledCoords.z);
        const imageX = (coords.x - scaledCoords.x * 2 ** (tileZoom - scaledCoords.z)) * imageWidth
        const imageY = (coords.y - scaledCoords.y * 2 ** (tileZoom - scaledCoords.z)) * imageHeight
        tileCtx.drawImage(
            imageCanvas,
            imageX,
            imageY,
            imageWidth,
            imageHeight,
            0,
            0,
            tile.width,
            tile.height);
        if(this.options.data === "wind") {
            const imgData = tileCtx.getImageData(0,0,tile.width,tile.height)
            this.fillTile(imgData)
            tileCtx.putImageData(imgData, 0, 0)
        }
        
        tile.complete = true;
        done(null, tile);
    },
    interpolateColor: function(w_speed, gradient) {
        let lowerIndex = 0;
        let upperIndex = gradient.length - 1;
        if(w_speed < 1) {
            return gradient[0].data;
        }
        for (let i = 0; i < gradient.length; i++) {
            if (w_speed === gradient[i].value) {
                lowerIndex = i;
                upperIndex = i;
                break;
            } else if (w_speed < gradient[i].value) {
                upperIndex = i;
                break;
            } else {
                lowerIndex = i;
            }
        }

        if (lowerIndex === upperIndex) {
            if(upperIndex !== gradient.length - 1)
                upperIndex++;
            else lowerIndex--;
        }
        const lowerValue = gradient[lowerIndex].value;
        const upperValue = gradient[upperIndex].value;
    
        const powerFactor = 1;

        const fraction = (w_speed - lowerValue) / (upperValue - lowerValue);
        
        const interpolatedColor = [
            Math.round(gradient[lowerIndex].data[0] + fraction * (gradient[upperIndex].data[0] - gradient[lowerIndex].data[0])),
            Math.round(gradient[lowerIndex].data[1] + fraction * (gradient[upperIndex].data[1] - gradient[lowerIndex].data[1])),
            Math.round(gradient[lowerIndex].data[2] + fraction * (gradient[upperIndex].data[2] - gradient[lowerIndex].data[2])),
        ];

        return interpolatedColor;
    },

    getWindSpeedFromPixel: function(pixel) {
        const [r, g, b] = pixel;
        let u_data = g * 35 / 255;
        let v_data = b * 35 / 255;
        return Math.sqrt(Math.pow(u_data, 2) + Math.pow(v_data, 2))
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
    distance: function (a, b) {
        return Math.sqrt(
            (a[0] - b[0]) ** 2 +
            (a[1] - b[1]) ** 2 +
            (a[2] - b[2]) ** 2
        );
    }
});

L.tileLayer.canvas = function tileLayerCanvas(url, options) {
    return new L.TileLayer.Canvas(url, options);
};