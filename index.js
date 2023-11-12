/* **** Leaflet **** */

// Base layers
var windy = L.tileLayer('https://tiles.windy.com/tiles/v10.0/darkmap/{z}/{x}/{y}.png', {
    opacity: 1,
    zIndex: 1001,
    name: "OSM"
});
var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    opacity: 1,
    zIndex: 1001
});
var currentLayer = L.tileLayer('https://tiles.windy.com/tiles/v10.0/darkmap/{z}/{x}/{y}.png', {
    opacity: 1,
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
        "Влажность 1000 гПа": createLayer(`../tiles/${step}/r/{z}/{x}/{y}.png`, 'Влажность 1000 гПа', 'humidity'),
        "OSM": osm
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

    $.getJSON(`./tiles/${step}/oper-${step}wind.json`, function (data) {
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
            particleMultiplier: 1/320
            
        });
        isAddWind && velocityLayer.addTo(map);
        const layers = { "Анимация ветра": velocityLayer };

        layerControl = L.control.layers(baseLayers, layers, { collapsed: false }).addTo(map);
        
        const windCheckbox = $(layerControl._overlaysList).find('input[type="checkbox"]');
        isAddWind && windCheckbox.siblings('span').addClass('active');
        $('.leaflet-control-layers-base input:checked').siblings('span').text(defaultLayer).addClass('active');
        
    });
}

const startStep = '24h';
const startLayer = 'Ветер';
createLayers(startStep, startLayer, true);
map.on('load', ()=>{
    map.setView([44.8, 34],7)
})
// Overlay layers (TMS)
let currentLayerName;
map.on('baselayerchange', function (e) {
    addGradientInfo(e.layer.options.data);
});

map.on('overlayadd', function (e) {
    $(layerControl._overlaysList).find('input[type="checkbox"]').siblings('span').addClass('active');
});

map.on('overlayremove', function (e) {
    $(layerControl._overlaysList).find('input[type="checkbox"]').siblings('span').removeClass('active');
});

map.on('layeradd', function (e) {
    $('.leaflet-control-layers-base span').removeClass('active');
    $('.leaflet-control-layers-base input:checked').siblings('span').text(e.layer.options.name).addClass('active');
    
    if(e.layer._url === osm._url && map.hasLayer(velocityLayer)){
        updateVelocityLayer(velocityLayer._windy.defaulColorScale, velocityLayer.options.particleMultiplier)
        velocityLayer._startWindy()
    }
    else if(e.layer._url !== osm._url && currentLayerName === undefined && map.hasLayer(velocityLayer)){
        updateVelocityLayer(velocityLayer.options.colorScale, velocityLayer.options.particleMultiplier)
        velocityLayer._startWindy()
    }
    currentLayerName = e.layer.options.name
});

map.fitBounds([[-85.05112877980659, 180.0], [85.0511287798066, -180.0]]);


function addStepSelect() {
    const div = document.createElement('div');
    div.classList.add('step-select-control');
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

    $('#rh_bottom').append(div);
};

addStepSelect()


$('#step-select').on('change', (e) => {
    const selectedStep = e.target.value;
    const currentLayer = $('.leaflet-control-layers-base input:checked').siblings('span').html();
    const windChecked = $('.leaflet-control-layers-overlays input:checkbox').prop('checked');

    Object.entries(baseLayers).forEach(([name, layer]) => {
        const new_url = layer._url.replace(/\d+h/g, selectedStep);
        layer.setUrl(new_url)
    });

    $.getJSON(`./tiles/${selectedStep}/oper-${selectedStep}wind.json`, function (data) {
        velocityLayer.setData(data)
        if(windChecked) {
            velocityLayer._windy.stop()
            velocityLayer._startWindy()
        }
    })
});

function addGradientInfo(data) {
    if(data){
        const currentGradient = gradient[data];
        const gradient_div = getGradientDiv();
        const linear_gradient = calculateLinearGradient(currentGradient, data);
        setGradientStyles(gradient_div, linear_gradient);
        renderGradientUnits(gradient_div, units[data], data);
        $('#rh_bottom').append(gradient_div);
    }
    else {
        getGradientDiv().hide();
    }
    
}

function getGradientDiv() {
    let div = $('.layer-gradient');
    div.show();
    if (div.length) {
        return div.eq(0);
    }
    div = $('<div>').addClass('layer-gradient');
    return div;
}

function calculateLinearGradient(gradientData, dataType) {
    if (window.innerWidth < 991) {
        return gradientData
            .filter((color, index) => shouldIncludeColor(index, dataType))
            .map(color => `rgb(${color[0]}, ${color[1]}, ${color[2]})`);
    } else {
        return gradientData.map(color => `rgb(${color[0]}, ${color[1]}, ${color[2]})`);
    }
}

function shouldIncludeColor(index, dataType) {
    return (index % 2 === 0 && dataType !== 'precipitation' && dataType !== 'temperature') ||
           (dataType === 'precipitation') ||
           (dataType === 'temperature' && (index !== 0 && index !== 1 && index !== 2));
}

function setGradientStyles(gradientDiv, linearGradient) {
    gradientDiv.css('background', `linear-gradient(to right, ${linearGradient.join(', ')})`);
    gradientDiv.html('');
}

function renderGradientUnits(gradientDiv, unitArray, dataType) {
    unitArray.forEach((unit, index) => {
        if (window.innerWidth < 991 && shouldSkipUnit(index, dataType)) {
            return;
        }
        gradientDiv.append(`<span>${unit.toString()}</span>`);
    });
}

function shouldSkipUnit(index, dataType) {
    return (dataType === 'temperature' && (index === 1 || index === 2 || index === 3)) ||
            (index % 2 !== 0 && dataType !== 'precipitation' && dataType !== 'temperature');
}



map.on('zoom', () => {
    const currentZoom = map.getZoom();
    let colorScale, particleMultiplier;
    if (currentZoom > 11) {
        currentLayer.setUrl(osm._url);
        colorScale = velocityLayer._windy.defaulColorScale;
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
        if(map.hasLayer(osm)){
            velocityLayer._windy.updateParams(velocityLayer._windy.defaulColorScale, particleMultiplier);
        }
        else velocityLayer._windy.updateParams(colorScale, particleMultiplier);
    }
}

function switchToLayer(current, to) {
    if(!map.hasLayer(to)){
        map.addLayer(to)
        map.removeLayer(current)
    }
}


