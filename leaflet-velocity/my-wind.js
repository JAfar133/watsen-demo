
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
    this.MAX_PARTICLE_AGE = 80,
    this.WIND_MULTIPLIER = 0.04
    this.OPACITY = 0.6
    L.setOptions(this, options);
  },
  delegate: function delegate(del) {
    this._delegate = del;
    return this;
  },
  onRemove: function onRemove(map) {
    var del = this._delegate || this;
    del.onLayerWillUnmount && del.onLayerWillUnmount(); // -- callback

    this.options.pane.removeChild(this._canvas);
    map.off(this.getEvents(), this);
    this._canvas = null;
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
    var self = this;

    self._onLayerDidMove();
  },
 
  drawLayer: function drawLayer() {
    var size = this._map.getSize();
    var bounds = this._map.getBounds();
    var zoom = this._map.getZoom();
    var topLeft = this._map.project(bounds.getNorthWest(), zoom);
    var bottomRight = this._map.project(bounds.getSouthEast(), zoom);

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
    const canvas = document.createElement('canvas')
    canvas.width = this._canvas.width;
    canvas.height = this._canvas.height;
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, 3000, 3000)
    ctx.globalAlpha = 0.85
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
            ctx.drawImage(img, 0, 0, img.width, img.height, tileX, tileY, size, size);
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
    Promise.all(promises)
    .finally(() => {
      var prev = "lighter";
      const MAX_PARTICLE_AGE = this.MAX_PARTICLE_AGE
      const WIND_MULTIPLIER = this.WIND_MULTIPLIER;
      const particles = this.getWindDataFromCanvas(canvas);
      const mainCanvas = this._canvas;
      const mainCtx = this._canvas.getContext('2d')
      mainCtx.globalCompositeOperation = "destination-in";
      mainCtx.globalCompositeOperation = prev;
      mainCtx.globalAlpha = this.OPACITY; // Draw new particle trails.
      function drawParticle(particle) {
         // Длина черточки, представляющей вектор ветра
          const lineLength = 5;

          // Вычисление конечных координат для черточки в направлении ветра
          const endX = particle.xt + lineLength * Math.cos(-particle.wd);
          const endY = particle.yt + lineLength * Math.sin(-particle.wd);

          // Отрисовка черточки
          mainCtx.beginPath();
          mainCtx.moveTo(particle.xt, particle.yt);
          mainCtx.lineTo(endX, endY);
          mainCtx.strokeStyle = 'white';
          mainCtx.lineWidth = particle.ws / 10; // Ширина линии черточки
          mainCtx.stroke();
      }
      
      function updateParticle(particle) {
        particle.age++;

        const windX = particle.ws * Math.cos(-particle.wd) * WIND_MULTIPLIER;
        const windY = particle.ws * Math.sin(-particle.wd) * WIND_MULTIPLIER;

        particle.xt += windX;
        particle.yt += windY;

        if (particle.age >= MAX_PARTICLE_AGE) {
            particle.xt = particle.x;
            particle.yt = particle.y;
            particle.age = 0;
        }
    }
      
      function animateParticles() {
        mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
      
        particles.forEach((particle, index) => {
          updateParticle(particle);
          drawParticle(particle);
        });
      
        requestAnimationFrame(animateParticles);
      }
      
      animateParticles();
    });
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
  getWindDataFromCanvas: function (canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return this.decodeColorToParticles(imageData)
  },
  
  decodeColorToParticles: function(imgData) {
    const particles = []
    const data = imgData.data;
    const width = imgData.width;
    const zoom = this._map.getZoom()
    let step = 27;
    for (let y = 0; y < imgData.height; y+=step) {
        for (let x = 0; x < width; x+=step) {
            const index = (y * width + x) * 4;

            // const { u_data, v_data } = this.getWindDataFromPixel([
            //     data[index],
            //     data[index + 1],
            //     data[index + 2]
            // ]);
            // const wind_speed = Math.sqrt(u_data**2, v_data**2);

            // const wind_direction = Math.atan2(v_data, u_data);
            // const age = Math.floor(Math.random() * MAX_PARTICLE_AGE)

            const { wind_speed, wind_direction } = this.getWindDataFromPixel([
                data[index],
                data[index + 1],
                data[index + 2]
            ]);
            particles.push({
              age: Math.random() * this.MAX_PARTICLE_AGE,
              x: x,
              y: y,
              ws: wind_speed,
              wd: wind_direction,
              xy: x,
              yt: y
            })
        }
    }

    return particles;
  },
  getWindDataFromPixel: function(pixel) {
      const [r, g, b] = pixel;
      // let u_data = g * 35 / 255;
      // let v_data = b * 35 / 255;
      // const r_string = r.toString()
      // if (parseInt(r_string[1], 10) === 0) {
      //     u_data *= -1;
      // }

      // if (parseInt(r_string[2], 10) === 0) {
      //     v_data *= -1;
      // }

      // return {v_data, u_data}

      const wind_speed = b * 50 / 255
      const wind_direction = g / 255 * 2 * Math.PI - Math.PI

      return {wind_speed, wind_direction}
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
  onDrawLayer: function onDrawLayer(overlay, params) {
    var self = this;

    // draw

    self._startWindy();
  },
  _startWindy: function _startWindy() {
    // start animation
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
  _mouseControl: null,
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
    }).delegate(this);;

    this._canvasLayer.addTo(map);

    this._map = map;
  },

  
  setData: function setData(data) {
    
  },
  setOpacity: function setOpacity(opacity) {
    this._canvasLayer.setOpacity(opacity);
  },
  setOptions: function setOptions(options) {
    
  },
  _destroyWind: function _destroyWind() {
    if (this._timer) clearTimeout(this._timer);
    if (this._windy) this._windy.stop();
    if (this._context) this._context.clearRect(0, 0, 3000, 3000);
    if (this._mouseControl) this._map.removeControl(this._mouseControl);

    this._map.removeLayer(this._canvasLayer);
  }
});

L.myVelocityLayer = function (options) {
  return new L.MyVelocityLayer(options);
};
