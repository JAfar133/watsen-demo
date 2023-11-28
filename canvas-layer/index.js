let MAX_ZOOM = 3;
let count = 0;
glContexts = []
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
        if(tileZoom < 2) MAX_ZOOM = 0
        else if (tileZoom < 4) MAX_ZOOM = 1
        else if(tileZoom < 8) MAX_ZOOM = 2
        else MAX_ZOOM = 2
        img.onload = () => {
            tile.width = img.width;
            tile.height = img.height;
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
        img.role = "presentation"
        
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
            const value = this.getValueFromPixel([red, green, blue])
            if (value !== null) {
                const color = this.interpolateColor(value, this.getGradient())
                data[i] = color[0]
                data[i+1] = color[1]
                data[i+2] = color[2]
            }
            
        }
    },
    drawTile(imageCanvas, coords, tile, done) {
            const canvas = document.createElement('canvas')
            canvas.width = tile.width;
            canvas.height = tile.height;
            const ctx = this.getWebGLContext(canvas);
            const zoom = this._getZoomForUrl();
            if(zoom <= MAX_ZOOM) {
                ctx.drawImage(imageCanvas, 0, 0);
            }
            else {
                const {x, y, z} = coords;
                const scaledCoords = {
                    x: x >> (zoom - MAX_ZOOM),
                    y: y >> (zoom - MAX_ZOOM),
                    z: MAX_ZOOM,
                };
                const imageWidth = tile.width / 2 ** (zoom - scaledCoords.z);
                const imageHeight = tile.height / 2 ** (zoom - scaledCoords.z);
                const imageX = (coords.x - scaledCoords.x * 2 ** (zoom - scaledCoords.z)) * imageWidth
                const imageY = (coords.y - scaledCoords.y * 2 ** (zoom - scaledCoords.z)) * imageHeight
                ctx.drawImage(
                    imageCanvas,
                    imageX,
                    imageY,
                    imageWidth,
                    imageHeight,
                    0,
                    0,
                    tile.width,
                    tile.height);
            }
            if(this.options.data === "precipitation" && this._url.split('/')[3] === '0h') {
                tile.complete = true;
                done(null, tile);
                return;
            }
            const imgData = ctx.getImageData(0, 0, tile.width,tile.height)
            // Получаем данные из ImageData
            const originalData = imgData.data;

            // Создаем новый массив для перевернутых данных
            const reversedData = new Uint8ClampedArray(originalData.length);

            // Переворачиваем данные
            for (let y = 0; y < imgData.height; y++) {
                const rowIndex = imgData.height - y - 1;
            
                for (let x = 0; x < imgData.width; x++) {
                    const originalIndex = (y * imgData.width + x) * 4;
                    const reversedIndex = (rowIndex * imgData.width + x) * 4;
            
                    // Копируем данные из оригинала в новый порядок строк
                    reversedData[reversedIndex] = originalData[originalIndex];
                    reversedData[reversedIndex + 1] = originalData[originalIndex + 1];
                    reversedData[reversedIndex + 2] = originalData[originalIndex + 2];
                    reversedData[reversedIndex + 3] = originalData[originalIndex + 3];
                }
            }

            // Создаем новый ImageData с перевернутыми данными
            const reversedImgData = new ImageData(reversedData, imgData.width, imgData.height);

            this.fillTile(reversedImgData)

            const tileCtx = tile.getContext('2d')
            tileCtx.putImageData(reversedImgData, 0, 0)
            
            tile.complete = true;
            done(null, tile);
    },
    getWebGLContext: function(tile) {
        if (!this.webGLContext) {
            this.webGLContext = {
                tile: tile,
                ctx: enableWebGLCanvas(tile),
            };
        }
        return this.webGLContext.ctx;
     },
    interpolateColor: function(value, gradient) {
        let lowerIndex = 0;
        let upperIndex = gradient.length - 1;
        if (value === gradient[0].value) {
            return gradient[0].data
        }
        for (let i = 0; i < gradient.length; i++) {
            if (value === gradient[i].value) {
                lowerIndex = i;
                upperIndex = i;
                break;
            } else if (value < gradient[i].value) {
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
    
        const fraction = (value - lowerValue) / (upperValue - lowerValue);

        const interpolatedColor = [
            Math.max(0, Math.round(gradient[lowerIndex].data[0] + fraction * (gradient[upperIndex].data[0] - gradient[lowerIndex].data[0]))),
            Math.max(0, Math.round(gradient[lowerIndex].data[1] + fraction * (gradient[upperIndex].data[1] - gradient[lowerIndex].data[1]))),
            Math.max(0, Math.round(gradient[lowerIndex].data[2] + fraction * (gradient[upperIndex].data[2] - gradient[lowerIndex].data[2]))),
        ];
        if (interpolatedColor[0] < 0 || interpolatedColor[1] < 0 || interpolatedColor[2] < 0) {
            console.log(interpolatedColor);
        }
        return interpolatedColor;
    },

    getValueFromPixel: function(pixel) {
        const [r, g, b] = pixel;
        let data = null;
        if(this.options.data === "wind") {
            data = b * 40 / 255
        }
        else if (this.options.data === "temperature") {
            data = r * 120 / 255 + 200
        }
        else if (this.options.data === "precipitation") {
            data = r * 500 / 255
        }
        else if (this.options.data === "humidity") {
            data = r * 100 / 255
        }
        else if (this.options.data === "pressure") {
            data = r * 150 / 255 + 900
        }
        return data
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