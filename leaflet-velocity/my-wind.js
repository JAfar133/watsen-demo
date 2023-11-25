
"use strict";

/*
 Generic  Canvas Layer for leaflet 0.7 and 1.0-rc,
 copyright Stanislav Sumbera,  2016 , sumbera.com , license MIT
 originally created and motivated by L.CanvasOverlay  available here: https://gist.github.com/Sumbera/11114288

 */
// -- L.DomUtil.setTransform from leaflet 1.0.0 to work on 0.0.7
//------------------------------------------------------------------------------
if (!L.DomUtil.setTransform) {
  L.DomUtil.setTransform = function (el, offset, scale) {
    var pos = offset || new L.Point(0, 0);
    el.style[L.DomUtil.TRANSFORM] = (L.Browser.ie3d ? "translate(" + pos.x + "px," + pos.y + "px)" : "translate3d(" + pos.x + "px," + pos.y + "px,0)") + (scale ? " scale(" + scale + ")" : "");
  };
} // -- support for both  0.0.7 and 1.0.0 rc2 leaflet

L.MyCanvasLayer = (L.Layer ? L.Layer : L.Class).extend({
  // -- initialized is called on prototype
  initialize: function initialize(options) {
    this._map = null;
    this._canvas = null;
    this._frame = null;
    this._delegate = null;
    this.MAX_PARTICLE_AGE = 80,
    this.WIND_MULTIPLIER = 0.04
    this.OPACITY = 0.97
    this.animationLoop = null;
    L.setOptions(this, options);
  },
  delegate: function delegate(del) {
    this._delegate = del;
    return this;
  },
  needRedraw: function needRedraw() {
    if (!this._frame) {
      this._frame = L.Util.requestAnimFrame(this.drawLayer, this);
    }

    return this;
  },
  onRemove: function onRemove(map) {
    var del = this._delegate || this;
    del.onLayerWillUnmount && del.onLayerWillUnmount(); // -- callback

    this.options.pane.removeChild(this._canvas);
    map.off(this.getEvents(), this);
    this._canvas = null;
  },
  addTo: function addTo(map) {
    map.addLayer(this);
    return this;
  },
  onAdd: function onAdd(map) {
    this._map = map;
    this._canvas = L.DomUtil.create("canvas", "leaflet-layer");
    this.tiles = {};

    var size = this._map.getSize();

    this._canvas.width = size.x;
    this._canvas.height = size.y;
    var animated = this._map.options.zoomAnimation && L.Browser.any3d;
    L.DomUtil.addClass(this._canvas, "leaflet-zoom-" + (animated ? "animated" : "hide"));
    L.DomUtil.addClass(this._canvas, "wind-animate")
    this.options.pane.appendChild(this._canvas);
    map.on(this.getEvents(), this);

    var del = this._delegate || this;
    del.onLayerDidMount && del.onLayerDidMount(); // -- callback

    // this.needRedraw();
    var self = this;

    self._onLayerDidMove();
  },
  needRedraw: function needRedraw() {
    if (!this._frame) {
      this._frame = L.Util.requestAnimFrame(this.drawLayer, this);
    }

    return this;
  },
  drawLayer: function drawLayer() {
    let animationLoop = this.animationLoop;

    var size = this._map.getSize();

    var bounds = this._map.getBounds();

    var zoom = this._map.getZoom();

    
    var center = this._map.options.crs.project(this._map.getCenter());

    var corner = this._map.options.crs.project(this._map.containerPointToLatLng(this._map.getSize()));

    var del = this._delegate || this;
    del.onDrawLayer && del.onDrawLayer({
      layer: this,
      canvas: this._canvas,
      bounds: bounds,
      size: size,
      zoom: zoom,
      center: center,
      corner: corner
    });
    this._frame = null;
  },
  
  // -- L.DomUtil.setTransform from leaflet 1.0.0 to work on 0.0.7
  //------------------------------------------------------------------------------
  _setTransform: function _setTransform(el, offset, scale) {
    var pos = offset || new L.Point(0, 0);
    el.style[L.DomUtil.TRANSFORM] = (L.Browser.ie3d ? "translate(" + pos.x + "px," + pos.y + "px)" : "translate3d(" + pos.x + "px," + pos.y + "px,0)") + (scale ? " scale(" + scale + ")" : "");
  },
  //------------------------------------------------------------------------------
  _animateZoom: function _animateZoom(e) {
    var scale = this._map.getZoomScale(e.zoom); // -- different calc of offset in leaflet 1.0.0 and 0.0.7 thanks for 1.0.0-rc2 calc @jduggan1
    const ctx = this._canvas.getContext('2d')
    ctx.clearRect(0, 0, 3000, 3000)
    var offset = L.Layer ? this._map._latLngToNewLayerPoint(this._map.getBounds().getNorthWest(), e.zoom, e.center) : this._map._getCenterOffset(e.center)._multiplyBy(-scale).subtract(this._map._getMapPanePos());
    L.DomUtil.setTransform(this._canvas, offset, scale);
  },
  //-------------------------------------------------------------
  _onLayerDidResize: function _onLayerDidResize(resizeEvent) {
      this._canvas.width = resizeEvent.newSize.x;
      this._canvas.height = resizeEvent.newSize.y;
    },
  //-------------------------------------------------------------
  _onLayerDidMove: function _onLayerDidMove() {
      var topLeft = this._map.containerPointToLayerPoint([0, 0]);

      L.DomUtil.setPosition(this._canvas, topLeft);
      this.drawLayer();
  },
  //-------------------------------------------------------------
  getEvents: function getEvents() {
    var events = {
      resize: this._onLayerDidResize,
      moveend: this._onLayerDidMove
    };

    if (this._map.options.zoomAnimation && L.Browser.any3d) {
      events.zoomanim = this._animateZoom;
    }

    return events;
  },
});

L.myCanvasLayer = function (pane) {
  return new L.MyCanvasLayer(pane);
};

L.MyVelocityLayer = (L.Layer ? L.Layer : L.Class).extend({
  options: {
    displayValues: true,
    displayOptions: {
      velocityType: "Velocity",
      position: "bottomleft",
      emptyString: "No velocity data"
    },
    maxVelocity: 10,
    // used to align color scale
    colorScale: null,
    data: null
  },
  _map: null,
  _canvasLayer: null,
  _windy: null,
  _context: null,
  _timer: 0,
  animationLoop: null,
  initialize: function initialize(options) {
    L.setOptions(this, options);
  },
  onRemove: function onRemove(map) {
    this._destroyWind();
  },
  onAdd: function onAdd(map) {
    // determine where to add the layer
    this._paneName = this.options.paneName || "overlayPane"; // fall back to overlayPane for leaflet < 1
    var pane = map._panes.overlayPane;

    if (map.getPane) {
      // attempt to get pane first to preserve parent (createPane voids this)
      pane = map.getPane(this._paneName);

      if (!pane) {
        pane = map.createPane(this._paneName);
      }
    } // create canvas, add to map pane


    this._canvasLayer = L.myCanvasLayer({
      pane: pane
    }).delegate(this);

    this._canvasLayer.addTo(map);

    this._map = map;
  },
  
  onDrawLayer: function onDrawLayer(overlay, params) {
    var self = this;
    if (!this._windy) {
      this._initWindy(this);
    }

    self._startWindy();
  },
  _initWindy: function _initWindy(self) {
    var options = Object.assign({
      canvas: self._canvasLayer._canvas,
      map: this._map
    }, self.options);
    this._windy = new MyWindy(options); // prepare context global var, start drawing
    this._context = this._canvasLayer._canvas.getContext("2d");

    this._canvasLayer._canvas.classList.add("velocity-overlay");

    this._map.on("dragend", self._clearAndRestart);

    this._map.on("zoomstart", self._clearWind);

    this._map.on("zoomend", self._clearAndRestart);

    this._map.on("resize", self._clearWind);

  },

  _clearAndRestart: function _clearAndRestart() {
    if (this._context) this._context.clearRect(0, 0, 3000, 3000);
    if (this._windy) this._startWindy();
  },
  _clearWind: function _clearWind() {
    if (this._windy) this._windy.stop();
    if (this._context) this._context.clearRect(0, 0, 3000, 3000);
  },
  setOpacity: function setOpacity(opacity) {
    this._canvasLayer.setOpacity(opacity);
  },
  _destroyWind: function _destroyWind() {
    if (this._timer) clearTimeout(this._timer);
    if (this._windy) this._windy.stop();
    if (this._context) this._context.clearRect(0, 0, 3000, 3000);
    this._windy = null;
    this._map.removeLayer(this._canvasLayer);
  },
  _startWindy: function _startWindy() {
    this._windy.start()
  },
  _stopWindy: function _stopWiny() {
    if (windy.field) windy.field.release();
    if (animationLoop) cancelAnimationFrame(animationLoop);
  }
});

L.myVelocityLayer = function (options) {
  return new L.MyVelocityLayer(options);
};

var MyWindy = function MyWindy(params) {
  var MAX_PARTICLE_AGE = params.particleAge || 90; // max number of frames a particle is drawn before regeneration

  var PARTICLE_LINE_WIDTH = params.lineWidth || 1.5; // line width of a drawn particle

  var PARTICLE_MULTIPLIER = params.particleMultiplier || 0.08; 

  var FRAME_RATE = params.frameRate || 25;
  var FRAME_TIME = 1000 / FRAME_RATE; // desired frames per second

  var OPACITY = 0.97;

  var animationLoop;
  
  var drawCanvasTiles = function() {

    var size = params.map.getSize();

    var bounds = params.map.getBounds();

    var zoom = params.map.getZoom();

    var topLeft = params.map.project(bounds.getNorthWest(), zoom);
    var bottomRight = params.map.project(bounds.getSouthEast(), zoom);
    
    let MAX_ZOOM = 3
    
    if (zoom < 4) MAX_ZOOM = 1
    else if(zoom < 8) MAX_ZOOM = 2
    else MAX_ZOOM = 3

    const tileSize = 256;
    const zoomFactor = 2**(zoom - MAX_ZOOM)
    const scaledTileSize = zoomFactor * tileSize

    let startTileX = Math.floor(topLeft.x / tileSize);
    let startTileY = Math.floor(topLeft.y / tileSize);
    let endTileX = Math.ceil(bottomRight.x / tileSize) - 1;
    let endTileY = Math.ceil(bottomRight.y / tileSize) - 1;
    let leftOffset = 0;
    let topOffset = 0

    if(zoom > MAX_ZOOM) {
      startTileY = Math.round(startTileY / zoomFactor) * zoomFactor - zoomFactor;

    }
    if(zoom > MAX_ZOOM) {
      startTileX = Math.round(startTileX / zoomFactor) * zoomFactor - zoomFactor ;
    }

    leftOffset += topLeft.x - (startTileX * tileSize);
    topOffset += topLeft.y - (startTileY * tileSize);
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = params.canvas.width;
    tempCanvas.height = params.canvas.height;
    const tempCtx = tempCanvas.getContext('2d')
    tempCtx.clearRect(0, 0, 3000, 3000)
    tempCtx.globalAlpha = 0.85
    // tempCtx.imageSmoothingEnabled = false
    let countX = 0;
    let countY = 0;

    const promises = [];

    for (var tileX = startTileX; tileX <= endTileX; tileX++) {
        for (var tileY = startTileY; tileY <= endTileY; tileY++) {
            const range = 2 ** zoom
            
            const coord = {
                x: (tileX % range + range) % range,
                y: ((Math.pow(2, zoom) - 1) - tileY),
                z: zoom < MAX_ZOOM ? zoom : MAX_ZOOM
            }
            if(zoom > MAX_ZOOM){
              const {x,y,z} = coord;

              const scaledCoords = {
                  x: x >> (zoom - MAX_ZOOM),
                  y: y >> (zoom - MAX_ZOOM),
                  z: z,
              };
              if(countY % 1 === 0 && countX % 1 === 0){
                promises.push(draw(scaledCoords, countX, countY, scaledTileSize, leftOffset, topOffset));
              }
                
              countY+=tileSize/scaledTileSize
            }
            
            else {
              promises.push(draw(coord, countX, countY, tileSize, leftOffset, topOffset));
              countY++;
            }
        }
        countY = 0;
        if(zoom > MAX_ZOOM) {
          countX+=tileSize/scaledTileSize;
        }
        else countX++;
    }

    function draw(coord, countX, countY, size, offsetLeft, offsetTop) {
      return new Promise((resolve, reject) => {
        if (coord.x >= 0 && coord.y >= 0) {
          const img = new Image();
          img.src = `../tiles/wind_test/${coord.z}/${coord.x}/${coord.y}.png`;
          img.onload = () => {
            const tileX = countX * size - offsetLeft;
            const tileY = countY * size - offsetTop;
            tempCtx.drawImage(img, 0, 0, img.width, img.height, tileX, tileY, size, size);
            resolve();
          };
          img.onerror = (error) => {
            resolve();
          };
        } else {
          resolve();
        }
      });
    }
    return {promises, tempCanvas}
  }
  var start = function start() {
    stop()
    const {promises, tempCanvas} = drawCanvasTiles()
    Promise.all(promises)
    .finally(() => {
      const {rows, particles} = getWindDataFromCanvas(tempCanvas)
      animate(rows, particles, tempCanvas)
    });
  };
  var animate = function animate(rows, particles, tempCanvas) {
    function direction_speed(x, y) {
      let x1 = Math.round(x)
      let y1 = Math.round(y)

      if(x1 > rows[0].length - 1 || x1 < 0 || y1 > rows.length - 1 || y1 < 0){
        return null
      }
      return rows[y1][x1]
    }
    var randomize = function (o) {
      // UNDONE: this method is terrible
      var x, y;
      var safetyNet = 0;

      do {
        x = o.startX + Math.round(Math.random() * 10 - 5);
        y = o.startY + Math.round(Math.random() * 10 - 5);
      } while (direction_speed(x,y) === null && safetyNet++ < 30);

      o.x = x;
      o.y = y;
      return o;
    }
    function evolve() {
      particles.forEach(function (particle) {
        if (particle.age > MAX_PARTICLE_AGE) {
          randomize(particle).age = 0
        }

        var x = particle.x;
        var y = particle.y;

        x = x < 0 ? 0 : x;
        y = y < 0 ? 0 : y;

        var v = direction_speed(x, y); // [wind_direction, wind_speed]
        if (v === null) return;

        const [wd, ws] = v;
        let xt = x + ws * Math.cos(wd) * PARTICLE_MULTIPLIER;
        let yt = y + ws * Math.sin(-wd) * PARTICLE_MULTIPLIER;
        if (direction_speed(xt, yt) !== null) {
          particle.xt = xt; 
          particle.yt = yt;
        }
        else {
          particle.age = MAX_PARTICLE_AGE;
        }
        particle.age += 1;
      });
    }
    
    const fadeFillStyle = "rgba(0, 0, 0, ".concat(OPACITY, ")");
    const mainCtx = params.canvas.getContext('2d');
    mainCtx.fillStyle = fadeFillStyle;
    mainCtx.lineWidth = PARTICLE_LINE_WIDTH;
    mainCtx.strokeStyle = 'rgb(222,222,222)';

    function draw() {
      var prev = "lighter";
      mainCtx.globalCompositeOperation = "destination-in";
      mainCtx.fillRect(0, 0, params.canvas.width, params.canvas.height);
      mainCtx.globalCompositeOperation = prev;
      mainCtx.globalAlpha = OPACITY === 0 ? 0 : OPACITY*0.9; // Draw new particle trails.
      
      mainCtx.beginPath();
      particles.forEach((particle) => {
          mainCtx.moveTo(particle.x, particle.y);
          mainCtx.lineTo(particle.xt, particle.yt);
          particle.x = particle.xt;
          particle.y = particle.yt;
      });
      mainCtx.stroke();
    }

    var then = Date.now();

    (function frame() {
      animationLoop = requestAnimationFrame(frame);
      var now = Date.now();
      var delta = now - then;

      if (delta > FRAME_TIME) {
        then = now - delta % FRAME_TIME;
        evolve();
        draw();
        // mainCtx.globalAlpha = 0.5
        // mainCtx.drawImage(tempCanvas,0,0)
        
      }
    })();
  };
  var stop = function stop() {
    params.canvas.getContext('2d').clearRect(0,0,3000,3000)
    if (animationLoop) {
      cancelAnimationFrame(animationLoop);
    }
  };
  var getWindDataFromCanvas = function (canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return decodeColorToParticles(imageData)
  }
  var decodeColorToParticles = function(imgData) {
    const particles = []
    const data = imgData.data;
    const width = imgData.width;
    const rows = []
    for (let y = 0; y < imgData.height; y++) {
        const row = []
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 4;
            const { wind_speed, wind_direction } = getWindDataFromPixel([
                data[index],
                data[index + 1],
                data[index + 2]
            ]);
            row.push([wind_direction, wind_speed])
            let randomStep = Math.round(Math.random() * 8) + 11;
            if(x % randomStep === 0 && y % randomStep === 0 && x < imgData.width && y < imgData.height){
              particles.push({
                age: Math.floor(Math.random() * MAX_PARTICLE_AGE),
                x: x,
                y: y,
                xt: x,
                yt: y,
                startX: x,
                startY: y
              })
            }
        }
        rows.push(row)
    }

    return {particles, rows};
  }
  var getWindDataFromPixel = function(pixel) {
      const [r, g, b] = pixel;

      let wind_speed = b * 50 / 255
      let wind_direction = g / 255 * Math.PI
      if (r < 65) {
        wind_direction *= -1
      }

      return {wind_speed, wind_direction}
  }
  var windy = {
    params: params,
    start: start,
    stop: stop,
  };

  return windy;
};

if (!window.cancelAnimationFrame) {
  window.cancelAnimationFrame = function (id) {
    clearTimeout(id);
  };
}
