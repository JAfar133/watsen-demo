/* **** Leaflet **** */

// Base layers
var osm = L.tileLayer('https://tiles.windy.com/tiles/v10.0/darkmap/{z}/{x}/{y}.png', {
    opacity: 0.9,
    zIndex: 1001
});

// Map
var map = L.map('map', {
    maxBounds: [[-85.05112877980659, -720000.0], [85.0511287798066, 720000.0]],
    zoom: 7,
    minZoom: 2,
    maxZoom: 18,
    worldCopyJump: false
});
osm.addTo(map);

// Title
var title = L.control();
title.onAdd = function (map) {
    this._div = L.DomUtil.create('div', 'ctl title');
    this.update();
    return this._div;
};
title.update = function (props) {
    this._div.innerHTML = "";
};
title.addTo(map);

let layerControl;

function addLayerToMap(layer) {
    layer.addTo(map);
    addGradientInfo(layer.options.data);
}

function createBaseLayers(step) {
    return {
        "Ветер": createLayer(`../tiles/${step}/wind/{z}/{x}/{y}.png`, 'Ветер', 'wind'),
        "Накопление осадков": createLayer(`../tiles/${step}/tp/{z}/{x}/{y}.png`, 'Накопление осадков', 'precipitation'),
        "Температура": createLayer(`../tiles/${step}/st/{z}/{x}/{y}.png`, 'Температура', 'temperature'),
        "Давление": createLayer(`../tiles/${step}/sp/{z}/{x}/{y}.png`, 'Давление', 'pressure', 20),
        // "Температура 2 метра": createLayer(`../tiles/${step}/2t/{z}/{x}/{y}.png`, 'Температура 2 метра', 'temperature'),
        "Влажность 1000 гПа": createLayer(`../tiles/${step}/r/{z}/{x}/{y}.png`, 'Влажность 1000 гПа', 'humidity')
    };
}

function createLayer(url, name, data, gradientLevel = 10) {
    return L.tileLayer.canvas(url, {
        tms: 1,
        attribution: "",
        minZoom: 0,
        maxZoom: 11,
        name: name,
        data: data,
        gradientLevel: gradientLevel
    });
}

function createLayers(step, defaultLayer, isAddWind) {
    map.eachLayer(layer => {
        if (layer instanceof L.TileLayer.Canvas || layer instanceof L.VelocityLayer) {
            map.removeLayer(layer);
        }
    });

    if (layerControl) {
        layerControl.remove();
    }

    var baseLayers = createBaseLayers(step);
    Object.entries(baseLayers).forEach(([name, layer]) => {
        if (name.trim() == defaultLayer.toString().trim()) {
            addLayerToMap(layer);
        }
    });

    $.getJSON(`../tiles/${step}/oper-${step}wind.json`, function (data) {
        var velocityLayer = L.velocityLayer({
            displayValues: true,
            displayOptions: {
                velocityType: "",
                position: "bottomleft",
                emptyString: "No wind data"
            },
            data: data,
            opacity: 0.8,
            velocityScale: 0.0025,
            colorScale: ['#ffffff', '#F6F6F6', '#EDEDED'],
        });
        isAddWind && velocityLayer.addTo(map);

        const layers = { "Анимация ветра": velocityLayer };

        layerControl = L.control.layers(baseLayers, layers, { collapsed: false }).addTo(map);
        setTimeout(() => {
            const windCheckbox = $(layerControl._overlaysList).find('input[type="checkbox"]');
            isAddWind && windCheckbox.siblings('span').addClass('active');
            $('.leaflet-control-layers-base input:checked').siblings('span').text(defaultLayer).addClass('active');
        }, 0);

    });
}

const startStep = '24h';
const startLayer = 'Ветер';
createLayers(startStep, startLayer, true);

// Overlay layers (TMS)

map.on('baselayerchange', function (e) {
    addGradientInfo(e.layer.options.data);
    $('.leaflet-control-layers-base span').removeClass('active');
    $('.leaflet-control-layers-base input:checked').siblings('span').addClass('active');
});

map.on('overlayadd', function (e) {
    const windCheckbox = $(layerControl._overlaysList).find('input[type="checkbox"]');
    windCheckbox.siblings('span').addClass('active');
});

map.on('overlayremove', function (e) {
    const windCheckbox = $(layerControl._overlaysList).find('input[type="checkbox"]');
    windCheckbox.siblings('span').removeClass('active');
});

map.on('layeradd', function (e) {
    $('.leaflet-control-layers-base input:checked').siblings('span').text(e.layer.options.name).addClass('active');
});

map.fitBounds([[-85.05112877980659, 180.0], [85.0511287798066, -180.0]]);

var stepControl = L.control();
stepControl.onAdd = function (map) {
    const div = L.DomUtil.create('div', 'step-select-control');
    const select = document.createElement('select');
    select.id = 'step-select';
    const option = document.createElement('option');
    option.innerHTML = `18.01.2023`;
    option.disabled = true;
    select.appendChild(option);
    for (let i = 0; i <= 72; i += 6) {
        const option = document.createElement('option');
        option.innerHTML = `${i} ч`;
        if (`${i}h` === startStep) {
            option.setAttribute('selected', 'selected');
        }
        option.setAttribute('value', `${i}h`);
        select.appendChild(option);
    }

    div.appendChild(select);

    return div;
};
stepControl.addTo(map);

$('#step-select').on('change', (e) => {
    const selectedStep = e.target.value;
    const currentLayer = $('.leaflet-control-layers-base input:checked').siblings('span').html();
    const windChecked = $('.leaflet-control-layers-overlays input:checkbox').prop('checked');
    createLayers(selectedStep, currentLayer, windChecked);
});

function getGradientDiv() {
    let div = $('.layer-gradient');
    if (div.length) {
        return $(div).eq(0);
    }
    div = document.createElement('div');
    $(div).addClass('layer-gradient');
    return $(div);
}

function addGradientInfo(data) {
    const currentGradient = gradient[data];
    const gradient_div = getGradientDiv();

    const liner_gradient = currentGradient.map(color => {
        return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    });

    gradient_div.css('background', `linear-gradient(to right,${liner_gradient[0]}, ${liner_gradient.join(', ')}, ${liner_gradient.pop()})`);
    gradient_div.html('');
    units[data].forEach(unit => {
        gradient_div.append(`<span>${unit.toString()}</span>`);
    });
    $('#rh_bottom').append(gradient_div);
}
