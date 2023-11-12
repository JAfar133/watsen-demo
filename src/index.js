/* **** Leaflet **** */

// Base layers
var windy = L.tileLayer('https://tiles.windy.com/tiles/v10.0/darkmap/{z}/{x}/{y}.png', {
    opacity: 0.9,
    zIndex: 1001
});
var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    opacity: 1,
    zIndex: 1001
});
var currentLayer = L.tileLayer('https://tiles.windy.com/tiles/v10.0/darkmap/{z}/{x}/{y}.png', {
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
currentLayer.addTo(map);

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
let velocityLayer;
let baseLayers;
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
        "Влажность 1000 гПа": createLayer(`../tiles/${step}/r/{z}/{x}/{y}.png`, 'Влажность 1000 гПа', 'humidity')
    };
}

function createLayer(url, name, data, gradientLevel = 11) {
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
    
    baseLayers = createBaseLayers(step);
    Object.entries(baseLayers).forEach(([name, layer]) => {
        if (name.trim() == defaultLayer.trim()) {
            addLayerToMap(layer);
        }
    });

    $.getJSON(`../tiles/${step}/oper-${step}wind.json`, function (data) {
        velocityLayer = L.velocityLayer({
            displayValues: true,
            displayOptions: {
                velocityType: "",
                position: "bottomleft",
                emptyString: "No wind data",
                showCardinal: true,
            },
            data: data,
            opacity: 0.8,
            velocityScale: 0.0025,
            colorScale: ['#ffffff', '#F6F6F6', '#EDEDED'],
            particleMultiplier: 0.6/320
            
        });
        isAddWind && velocityLayer.addTo(map);
        const layers = { "Анимация ветра": velocityLayer };

        layerControl = L.control.layers(baseLayers, layers, { collapsed: false }).addTo(map);
        
        const windCheckbox = $(layerControl._overlaysList).find('input[type="checkbox"]');
        isAddWind && windCheckbox.siblings('span').addClass('active');
        $('.leaflet-control-layers-base input:checked').siblings('span').text(defaultLayer).addClass('active');
        
    });
}

const startStep = '0h';
const startLayer = 'Ветер';
createLayers(startStep, startLayer, true);
map.on('load', ()=>{
    map.setView([44.8, 34],7)
})
// Overlay layers (TMS)

map.on('baselayerchange', function (e) {
    addGradientInfo(e.layer.options.data);
    $('.leaflet-control-layers-base span').removeClass('active');
    $(layerControl._overlaysList).find('input:checked').siblings('span').addClass('active');
});

map.on('overlayadd', function (e) {
    $(layerControl._overlaysList).find('input[type="checkbox"]').siblings('span').addClass('active');
});

map.on('overlayremove', function (e) {
    $(layerControl._overlaysList).find('input[type="checkbox"]').siblings('span').removeClass('active');
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
    option.innerHTML = `18.01.2023 00:00`;
    option.disabled = true;
    select.appendChild(option);
    for (let i = 0; i <= 72; i += 6) {
        const option = document.createElement('option');
        option.innerHTML = `+${i} ч`;
        if(i===0) option.innerHTML = `Сейчас`;
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

    Object.entries(baseLayers).forEach(([name, layer]) => {
        const new_url = layer._url.replace(/\d+h/g, selectedStep);
        layer.setUrl(new_url)
    });

        $.getJSON(`../tiles/${selectedStep}/oper-${selectedStep}wind.json`, function (data) {
            velocityLayer.setData(data)
            if(windChecked) {
                velocityLayer._startWindy()
            }
        })
});

function addGradientInfo(data) {
    function getGradientDiv() {
        let div = $('.layer-gradient');
        if (div.length) {
            return $(div).eq(0);
        }
        div = document.createElement('div');
        $(div).addClass('layer-gradient');
        return $(div);
    }

    const currentGradient = gradient[data];
    const gradient_div = getGradientDiv();
    let linear_gradient;

    if (window.innerWidth < 991) {
        linear_gradient = currentGradient.filter((color, index) => index % 2 === 0)
            .map(color => `rgb(${color[0]}, ${color[1]}, ${color[2]})`);
    } else {
        linear_gradient = currentGradient.map(color => `rgb(${color[0]}, ${color[1]}, ${color[2]})`);
    }

    gradient_div.css('background', `linear-gradient(to right,${linear_gradient.join(', ')})`);
    gradient_div.html('');

    units[data].forEach((unit, index) => {
        if (window.innerWidth < 991 && index % 2 !== 0 && data !=="precipitation") {
            return;
        }
        gradient_div.append(`<span>${unit.toString()}</span>`);
    });

    $('#rh_bottom').append(gradient_div);
}

map.on('zoom', () => {
    const currentZoom = map.getZoom();
    let colorScale, particleMultiplier;
    if (currentZoom > 11) {
        currentLayer.setUrl(osm._url);
        colorScale = ["#ED0CFF", "#ED0C80", "#ED0C00"];
        particleMultiplier = 0.1 / 320;
    } else {
        currentLayer.setUrl(windy._url);
        if (currentZoom > 8) {
            colorScale = velocityLayer.options.colorScale;
            particleMultiplier = 0.3 / 320;
        } else if (currentZoom > 5) {
            colorScale = velocityLayer.options.colorScale;
            particleMultiplier = 0.6 / 320;
        } else {
            colorScale = velocityLayer.options.colorScale;
            particleMultiplier = velocityLayer.options.particleMultiplier;
        }
    }

    updateVelocityLayer(colorScale, particleMultiplier);
});


function updateVelocityLayer(colorScale, particleMultiplier) {
    if (map.hasLayer(velocityLayer)) {
        velocityLayer._windy.updateParams(colorScale, particleMultiplier);
    }
}

function switchToLayer(current, to) {
    if(!map.hasLayer(to)){
        map.addLayer(to)
        map.removeLayer(current)
    }
}


