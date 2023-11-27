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
map.on('load', ()=>{
    map.setView([44.8, 34],7)
})
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
let windyLayer;
function addLayerToMap(layer) {
    layer.addTo(map);
    addGradientInfo(layer.options.data);
}

function createBaseLayers(step, data_source) {
    return {
        "Ветер": createLayer(`../tiles/${data_source}/${step}/wind/{z}/{x}/{y}.png`, 'Ветер', 'wind', step),
        "Накопление осадков": createLayer(`../tiles/${data_source}/${step}/tp/{z}/{x}/{y}.png`, 'Накопление осадков', 'precipitation', step),
        "Температура": createLayer(`../tiles/${data_source}/${step}/st/{z}/{x}/{y}.png`, 'Температура', 'temperature', step),
        "Давление": createLayer(`../tiles/${data_source}/${step}/sp/{z}/{x}/{y}.png`, 'Давление', 'pressure', step, 20),
        "Влажность 1000 гПа": createLayer(`../tiles/${data_source}/${step}/r/{z}/{x}/{y}.png`, 'Влажность', 'humidity', step),
        "OSM": osm
    };
}

function createLayer(url, name, data, step, gradientLevel = 11) {
    return L.tileLayer.canvas(url, {
        tms: 1,
        attribution: "",
        minZoom: 0,
        maxZoom: 11,
        name: name,
        data: data,
        step: step,
        gradientLevel: gradientLevel,
    });
}

function createLayers(step, defaultLayer, isAddWind, data_source) {
    map.eachLayer(layer => {
        if (layer instanceof L.TileLayer.Canvas || layer instanceof L.MyVelocityLayer) {
            map.removeLayer(layer);
        }
    });

    if (layerControl) {
        layerControl.remove();
    }
    
    baseLayers = createBaseLayers(step, data_source);
    Object.entries(baseLayers).forEach(([name, layer]) => {
        if (name.trim() == defaultLayer.trim()) {
            addLayerToMap(layer);
        }
    });
    
    setTimeout(()=>{
        // $.getJSON(`./tiles/wind_test/wind-test.json`, function (data) {
        //     velocityLayer = L.velocityLayer({
        //         displayValues: true,
        //         displayOptions: {
        //             velocityType: "",
        //             position: "bottomleft",
        //             emptyString: "No wind data",
        //             showCardinal: true,
        //         },
        //         data: data,
        //         opacity: 0.8,
        //         velocityScale: 0.0025,
        //         colorScale: ['#ffffff', '#F6F6F6', '#EDEDED'],
        //         particleMultiplier: 1/320
                
        //     });
        //     isAddWind && velocityLayer.addTo(map);
            windyLayer = L.myVelocityLayer({
                url: `../tiles/${data_source}/${step}/wind/{z}/{x}/{y}.png`
            }).addTo(map);
            const layers = { 
                "Направление ветра": windyLayer, 
                // "Velocity анимация": velocityLayer 
            };
        
            layerControl = L.control.layers(baseLayers, layers, { collapsed: false }).addTo(map);
            const windCheckbox = $(layerControl._overlaysList).find('input[type="checkbox"]');
            windCheckbox.siblings(`span:contains("${Object.keys(layers)[0]}")`).addClass('active');
            $('.leaflet-control-layers-base input:checked').siblings('span').text(defaultLayer).addClass('active');
        // });
        
    }, 0)
    

        
}

const startStep = '18h';
const startLayer = 'Ветер';
let data_source = 'gfs'
let currentStep = Number(startStep.replace(/\D/g, ''));
let start_day = 27;
let start_hour = 0;
let start_month = 'Ноя';
createLayers(startStep, startLayer, false, data_source);
step_control_fill(start_day, start_hour, start_month)
map.fitBounds([[-85.05112877980659, 180.0], [85.0511287798066, -180.0]]);

// Overlay layers (TMS)
let currentLayerName;

map.on('baselayerchange', function (e) {
    addGradientInfo(e.layer.options.data);
});

map.on('overlayadd', function (e) {
    $(layerControl._overlaysList).find(`input[type="checkbox"]`).siblings(`span:contains("${e.name}")`).addClass('active');
});

map.on('overlayremove', function (e) {
    $(layerControl._overlaysList).find(`input[type="checkbox"]`).siblings(`span:contains("${e.name}")`).removeClass('active');
});

map.on('layeradd', function (e) {
    $('.leaflet-control-layers-base span').removeClass('active');
    $('.leaflet-control-layers-base input:checked').siblings('span').text(e.layer.options.name).addClass('active');
    currentLayerName = e.layer.options.name
});

function step_control_fill(startDay, startHour, month) {
    $('#day').empty()
    $('#hour').empty()
    function formatTime(time) {
        return time < 10 ? `0${time}:00` : `${time}:00`;
    }

    function addSteps(containerSelector, startValue, stepCount,step, clazz, isActive) {
        let container = $(containerSelector);

        for (let i = 0; i < stepCount; i+=step) {
            let step = $('<div>').addClass('step').addClass(clazz).text(formatTime((startValue + i) % 24));
            if (isActive(i)) {
                step.addClass('active');
            }
            container.append(step);
        }
    }
    
    addSteps('.hour', startHour, 24, 6,'step-control_hour', i => i === currentStep % 24);

    addSteps('.day', startDay, 4, 1,'step-control_date', i => i === Math.floor(currentStep / 24));

    $('.day .step').each(function (index) {
        $(this).text(`${startDay + index} ${month}.`);
    });
    if(currentStep === 0){
        $('#step-control .add_hour:contains("-")').addClass('disabled');
    }
    if(currentStep === 72){
        $('#step-control .add_hour:contains("+")').addClass('disabled');
        $('#step-control .step-control_hour:not(:contains("00:00"))').addClass('disabled');
    }
}

$('#step-control').on('click', function (e) {
    const activeDate = $('#step-control .step-control_date.active').html()
    const activeHour = $('#step-control .step-control_hour.active').html().slice(0, 2)
    const targetHtml = $(e.target).html();
    if ($(e.target).hasClass('step-control_date')) {
        const target_day = targetHtml.slice(0, 2)
        let selectedStep, step;
        step = (Number(target_day) - Number(start_day)) * 24 + Number(activeHour)
        selectedStep = `${step}h`
        if (step >= 72 ) {
            selectedStep = '72h'
            step = 72
            $('#step-control .step-control_hour.active').removeClass('active');
            $('#step-control .step-control_hour:contains("00:00")').addClass('active');
            $('#step-control .step-control_hour:not(:contains("00:00"))').addClass('disabled');
            $('#step-control .add_hour:contains("+")').addClass('disabled');
        }
        else {
            $('#step-control .step-control_hour').removeClass('disabled');
        }
        if(step === 0){
            $('#step-control .add_hour:contains("-")').addClass('disabled');
        }
        if(step !== 72){
            $('#step-control .add_hour:contains("+")').removeClass('disabled');
        }
        if(step !== 0){
            $('#step-control .add_hour:contains("-")').removeClass('disabled');
        }
        updateLayers(selectedStep, data_source)
        currentStep = step;
        $('#step-control .step-control_date.active').removeClass('active');
        $(e.target).addClass('active')
    } else if ($(e.target).hasClass('step-control_hour')) {
        const active_day = activeDate.slice(0, 2)
        const step = (Number(active_day) - Number(start_day)) * 24 + Number(targetHtml.slice(0, 2))
        const selectedStep = `${step}h`
        updateLayers(selectedStep, data_source);
        if(step === 0){
            $('#step-control .add_hour:contains("-")').addClass('disabled');
        }
        if(step !== 72){
            $('#step-control .add_hour:contains("+")').removeClass('disabled');
        }
        if(step !== 0){
            $('#step-control .add_hour:contains("-")').removeClass('disabled');
        }
        $('#step-control .step-control_hour.active').removeClass('active');
        $(e.target).addClass('active')
        currentStep = step;
    } else if ($(e.target).hasClass('add_hour')) {
        if (targetHtml.includes('+')) {
            const step = currentStep + 6
            const day = Math.floor(step / 24) + start_day;
            $('#step-control .add_hour:contains("-")').removeClass('disabled');
            if (step === 72) {
                $(e.target).addClass('disabled')
                $('#step-control .step-control_hour:not(:contains("00:00"))').addClass('disabled');
            }
            if (activeHour === '18') {
                $('#step-control .step-control_hour.active').removeClass('active');
                $('#step-control .step-control_hour:contains("00:00")').addClass('active');
                $('#step-control .step-control_date.active').removeClass('active');
                $(`#step-control .step-control_date:contains("${day} ${start_month}.")`).addClass('active');
            } else {
                $('#step-control .step-control_hour.active').removeClass('active');
                $(`#step-control .step-control_hour:contains("${Number(activeHour) + 6}:00")`).addClass('active');
            }
            const selectedStep = `${step}h`
            currentStep = step
            updateLayers(selectedStep, data_source)
        } else if (targetHtml.includes('-')) {
            const step = currentStep - 6
            const day = Math.floor(step / 24) + start_day;
            $('#step-control .step-control_hour').removeClass('disabled');
            $('#step-control .add_hour:contains("+")').removeClass('disabled');
            if (step === 0) {
                $(e.target).addClass('disabled')
            }
            if (activeHour === '00') {
                $('#step-control .step-control_hour.active').removeClass('active');
                $('#step-control .step-control_hour:contains("18:00")').addClass('active');
                $('#step-control .step-control_date.active').removeClass('active');
                $(`#step-control .step-control_date:contains("${day} ${start_month}.")`).addClass('active');
            } else {
                $('#step-control .step-control_hour.active').removeClass('active');
                $(`#step-control .step-control_hour:contains("${Number(activeHour) - 6}:00")`).addClass('active');
            }
            const selectedStep = `${step}h`
            currentStep = step
            updateLayers(selectedStep, data_source)
        }
    }
});

$('#model-control').on('change',(e)=>{
    const model = $(e.target).val()
    let startDay;
    let startHour;
    let month;
    if(model === 'gfs'){
        startDay = 27;
        startHour = 0;
        month = 'Ноя'
    }
    else {
        startDay = 18;
        startHour = 0;
        month = 'Янв'
    }
    step_control_fill(startDay, startHour, month)
    start_day = startDay;
    start_hour = startHour;
    start_month = month
    updateLayers(`${currentStep}h`, model)
    data_source = model;
})

function updateLayers(selectedStep, model) {
    Object.entries(baseLayers).forEach(([name, layer]) => {
        const newUrl = layer._url.replace(/\d+h/g, selectedStep).replace(data_source, model);
        layer.setUrl(newUrl);
    });
    const newWindURL = windyLayer.options.url.replace(/\d+h/g, selectedStep).replace(data_source, model)
    windyLayer._windy.setUrl(newWindURL);
   
}

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
            .map(color => `rgb(${color.data[0]}, ${color.data[1]}, ${color.data[2]})`);
    } else {
        return gradientData.map(color => `rgb(${color.data[0]}, ${color.data[1]}, ${color.data[2]})`);
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
    if (currentZoom > 11) {
        currentLayer.setUrl(osm._url);
        
    } else {
        currentLayer.setUrl(windy._url);
        
    }

});
