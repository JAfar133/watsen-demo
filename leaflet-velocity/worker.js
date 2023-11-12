// worker.js
importScripts('https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.7.5/proj4.js');

onmessage = function (event) {
    const { x, y } = event.data;

    // Определите вашу проекцию EPSG:3857
    const epsg3857 = '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +no_defs';

    // Преобразуйте экранные координаты в географические
    const lonlat = proj4(epsg3857, 'EPSG:4326', [x, y]);

    postMessage({ lon: lonlat[0], lat: lonlat[1] });
};
