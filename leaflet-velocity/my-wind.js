
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
    L.setOptions(this, options);
  },
  delegate: function delegate(del) {
    this._delegate = del;
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
    var self = this;

    self._onLayerDidMove();
  },
  //-------------------------------------------------------------
  getNewCoordinates: function getNewCoordinates(coord, targetZoom) {
    // Функция для растяжения координат тайла для более высокого зума
    const factor = 2 ** (targetZoom - coord.z);
    return {
        x: coord.x * factor,
        y: coord.y * factor,
        z: targetZoom
    };
  },
  //------------------------------------------------------------------------------
  drawLayer: function drawLayer() {
    // -- todo make the viewInfo properties  flat objects.
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
    var startTileX = Math.floor(topLeft.x / tileSize);
    var startTileY = Math.floor(topLeft.y / tileSize);
    var endTileX = Math.ceil(bottomRight.x / tileSize);
    var endTileY = Math.ceil(bottomRight.y / tileSize);
    var leftOffset = 0;
    var topOffset = 0

    if(zoom > MAX_ZOOM) {
      startTileY = Math.round(startTileY / zoomFactor) * zoomFactor - zoomFactor;

    }
    if(zoom > MAX_ZOOM) {
      startTileX = Math.round(startTileX / zoomFactor) * zoomFactor - zoomFactor ;
    }

    leftOffset += topLeft.x - (startTileX * tileSize);
    topOffset += topLeft.y - (startTileY * tileSize);

    const ctx = this._canvas.getContext('2d')
    ctx.clearRect(0, 0, 3000, 3000)
    ctx.globalAlpha = 0.85
    let countX = 0;
    let countY = 0;
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
                draw(scaledCoords, countX, countY, scaledTileSize, leftOffset, topOffset) 
              }
                
              countY+=tileSize/scaledTileSize
            }
            
            else {
              draw(coord, countX, countY, tileSize, leftOffset, topOffset)
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
      if(coord.x >= 0 && coord.y >= 0){
        const img = new Image()
        img.src = `../tiles/wind_test/${coord.z}/${coord.x}/${coord.y}.png`
        img.onload = () => {
            const tileX = countX * size - offsetLeft;
            const tileY = countY * size - offsetTop;
            ctx.drawImage(img, 0, 0, img.width, img.height, tileX, tileY, size, size)
          }
      }
    }

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
});

L.myVelocityLayer = function (options) {
  return new L.MyVelocityLayer(options);
};


// _getData: function _getData() {
//     function downloadCanvasImage(dataUrl) {
//       const a = document.createElement('a');
//       a.href = dataUrl;
//       a.download = "test.jpg";
//       document.body.appendChild(a);
//       a.click();
//       document.body.removeChild(a);
//   }
//     return new Promise((resolve, reject) => {
//         const bounds = map.getBounds();
//         const zoom = map.getZoom();
//         const size = map.getSize();
//         const url1 = `../tiles/wind_test/1/1/1.png`;
//         const url2 = `../tiles/wind_test/1/0/1.png`;
//         const url3 = `../tiles/wind_test/1/1/0.png`;
//         const url4 = `../tiles/wind_test/1/0/0.png`;
//         const dataCanvas = document.createElement('canvas');
//         dataCanvas.width = 512;
//         dataCanvas.height = 512;
//         const dataCtx = dataCanvas.getContext('2d');
//         const urls = [url1, url2, url3, url4];

//         let imagesLoaded = 0;

//         urls.forEach((url, index) => {
//             const img = new Image();
//             img.src = url;
//             img.onload = () => {
//                 if (index === 0) {
//                     dataCtx.drawImage(img, 0, 0, img.width, img.height, 0, 0, img.width, img.height);
//                 }
//                 if (index === 1) {
//                     dataCtx.drawImage(img, 0, 0, img.width, img.height, 256, 0, img.width, img.height);
//                 }
//                 if (index === 2) {
//                     dataCtx.drawImage(img, 0, 0, img.width, img.height, 0, 256, img.width, img.height);
//                 }
//                 if (index === 3) {
//                     dataCtx.drawImage(img, 0, 0, img.width, img.height, 256, 256, img.width, img.height);

//                     setTimeout(() => {
//                         const wind_layer = document.createElement('canvas');
//                         const pane = map.createPane('wind_pane')

//                         wind_layer.width = 1440;
//                         wind_layer.height = 721;

//                         const wind_layer_ctx = wind_layer.getContext('2d')
//                         wind_layer_ctx.drawImage(dataCanvas, 0, 0, wind_layer.width, wind_layer.height)
//                         downloadCanvasImage(dataCanvas.toDataURL())
//                         downloadCanvasImage(dataCanvas.toDataURL())
//                         const imgData = wind_layer_ctx.getImageData(0, 0, wind_layer.width, wind_layer.height)
//                         const { u_data, v_data } = decodeColorToWindData(imgData)
//                         let lo1 = -180
//                         let la1 = 90
    
//                         let lo2 = 180
//                         let la2 = -90
//                         const dx = 0.25
//                         const dy = 0.25

//                         const data = [
//                             {
//                                 header: {
//                                     "lo1": lo1,
//                                     "la1": la1,
//                                     "lo2": lo2,
//                                     "la2": la2,
//                                     "dx": dx,
//                                     "dy": dy,
//                                     "nx": wind_layer.width,
//                                     "ny": wind_layer.height,
//                                     "parameterNumber": 2,
//                                     "parameterCategory": 2
//                                 },
//                                 data: u_data
//                             },
//                             {
//                                 header: {
//                                     "lo1": lo1,
//                                     "la1": la1,
//                                     "lo2": lo2,
//                                     "la2": la2,
//                                     "dx": dx,
//                                     "dy": dy,
//                                     "nx": wind_layer.width,
//                                     "ny": wind_layer.height,
//                                     "parameterNumber": 3,
//                                     "parameterCategory": 2
//                                 },
//                                 data: v_data
//                             },
//                         ]

//                         resolve(data);
//                     }, 100)
//                 }
//             };
//         });
//     });
//       function decodeColorToWindData(imgData) {
//         const u_data_array = [];
//         const v_data_array = [];
//         const data = imgData.data;
//         const width = imgData.width;

//         for (let y = 0; y < imgData.height; y++) {
//             for (let x = 0; x < width; x++) {
//                 const index = (y * width + x) * 4;

//                 const { u_data, v_data } = getWindDataFromPixel([
//                     data[index],
//                     data[index + 1],
//                     data[index + 2]
//                 ]);

//                 u_data_array.push(u_data);
//                 v_data_array.push(v_data);
//             }
//         }

//         return { u_data: u_data_array, v_data: v_data_array };
//     }
//     function getWindDataFromPixel(pixel) {
//         const [r, g, b] = pixel;
//         let u_data = g * 35 / 255;
//         let v_data = b * 35 / 255;
//         const r_string = r.toString()
//         if (parseInt(r_string[1], 10) === 0) {
//             u_data *= -1;
//         }
    
//         if (parseInt(r_string[2], 10) === 0) {
//             v_data *= -1;
//         }
    
//         return {v_data, u_data}
//     }