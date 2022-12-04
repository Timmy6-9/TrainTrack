import './style.css';
import Map from 'ol/Map.js';
import OSM from 'ol/source/OSM.js';
import TileLayer from 'ol/layer/Tile.js';
import View from 'ol/View.js';
import {Text, Fill, Stroke, Circle, Style, Icon} from 'ol/style';
import {useGeographic} from 'ol/proj';
import WebGLPointsLayer from 'ol/layer/WebGLPoints';
import GeoJSON from 'ol/format/GeoJSON';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/vector';
import ImageStyle from 'ol/style/image';
import Overlay from 'ol/Overlay';
import Point from 'ol/geom/Point';

useGeographic();

var locations = "";

// IT DOES NOT MATTER WHAT TYPE OF FILE USED BUT ONLY GIVE CO-ORDINATES AS FLOAT TYPES | LONG FIRST THEN LAT
var source = new VectorSource({
  url: URL.createObjectURL(new File([],{type: "application/json"})),
  format: new GeoJSON()
});

function pointStyleFunction(feature) {
  return new Style({
    image: new Icon({
      src: './train.png',
      scale: 0.75
    }),
    text: new Text({
      text: feature.values_.id,
      offsetY: feature.values_.offset,
      fill: new Fill({color: 'rgba(0, 0, 0, 1)'}),
      scale: 1.5
    })
  })
}

var trainTextLayer = new VectorLayer({
  source: source,
  style: pointStyleFunction
});

const ws = new WebSocket('ws://192.168.0.220:443/');

const mapLayer = new TileLayer({
  source: new OSM(),
});

const map = new Map({
  target: document.getElementById('map'),
  layers: [mapLayer, trainTextLayer],
  view: new View({
    center: [-0.0599408, 51.5196195],
    zoom: 15,
  }),
})

ws.onopen = function() {
  ws.send("Register");
  console.log('Websocket Connection Registered');
}

ws.onmessage = function (event) {
  locations = event.data;
}

function newPoints(){
  if(locations != ""){
    const jsonFile = '{"type": "FeatureCollection", "features": ' + locations + '}';
    console.log(jsonFile);
    const file = new File([jsonFile], {type: "application/json",});
    URL.revokeObjectURL(source.getUrl());
    source.setUrl(URL.createObjectURL(file));
    source.refresh();
    map.render();
  }
  setTimeout(function() {newPoints()}, 10000);
}

newPoints();

// Popup labels code, not mine.
const element = document.getElementById('popup');

const popup = new Overlay({
  element: element,
  positioning: 'bottom-center',
  stopEvent: false,
});

map.addOverlay(popup);

let popover;
function disposePopover() {
  if (popover) {
    popover.dispose();
    popover = undefined;
  }
}
// display popup on click
map.on('click', function (evt) {
  const feature = map.forEachFeatureAtPixel(evt.pixel, function (feature) {
    return feature;
  });
  disposePopover();
  if (!feature) {
    return;
  }
  popup.setPosition(evt.coordinate);
  popover = new bootstrap.Popover(element, {
    placement: 'right',
    html: true,
    content: "<p> Details <br>Location: " + "<code>" + feature.get('name') + "</code>" + "<br>Next Stop: " + "<code>" + feature.get('nextStop') + "</code></p>"
  });
  popover.show();
});

// change mouse cursor when over marker
map.on('pointermove', function (e) {
  const pixel = map.getEventPixel(e.originalEvent);
  const hit = map.hasFeatureAtPixel(pixel);
  map.getTarget().style.cursor = hit ? 'pointer' : '';
});
// Close the popup when the map is moved
map.on('movestart', disposePopover);



// Unused but kept just in case

/*
var trainLayer = new WebGLPointsLayer({
  source: source,
  style: ({
    symbol: {
    symbolType: 'circle',
    size: 14,
    color: 'rgb(255, 0, 0)',
    opacity: 0.5
    }
  })
});

Small black circle for points

image: new Circle({
  fill: new Fill({color: 'rgba(0, 0, 0, 1)'}),
  stroke: new Stroke({color: 'rgba(0, 0, 0, 1)'}),
  radius: 5,
}),
*/

/*
  'circles-zoom': {
    symbol: {
      symbolType: 'circle',
      size: ['interpolate', ['exponential', 2.5], ['zoom'], 2, 1, 14, 32],
      color: ['match', ['get', 'hover'], 1, '#ff3f3f', '#006688'],
      offset: [0, 0],
      opacity: 0.95,
    }
*/

/*
function checkOffset(msgItem){

  // Check for persistent offsets
  const persOffsets = persFileArr.filter(function(arrObj){
    return JSON.parse(arrObj).properties.name == msgItem.name;
  });

  const oldOffsets = persOffsets.map(item => JSON.parse(item));

  // Check for new offsets
  const currentOffsets = newFileArr.filter(function(arrObj){
    return JSON.parse(arrObj).properties.name == msgItem.name;
  });

  const newOffsets = currentOffsets.map(item => JSON.parse(item));

  if(newOffsets.length == 0 && oldOffsets.length == 0){
    return 25;
  }
  else if(){

  }

}
*/
/*
function checkOffset(msgItem){
  const howLong = persFileArr.filter(function(arrObj){
    return JSON.parse(arrObj).properties.name == msgItem.name;
  });
  const howLongNew = newFileArr.filter(function(arrObj){
    return JSON.parse(arrObj).properties.name == msgItem.name;
  });
  if(howLongNew.length > 0 && howLong.length == 0){
    return (15 * (howLongNew.length));
  }
  else if(howLongNew.length > 0 && howLong.length > 0){
    return (15 * (howLongNew.length + howLong.length));
  }
  else if (howLongNew.length == 0 && howLong.length > 0){
    filter
    //if(){}
    //else{return (15 * (howLong.length))};
  }
  else if(howLongNew.length == 0 && howLong.length == 0){
    return 0;
  }
  else{
    console.log("EDGE CASE DETECTED: " + howLong.length + "," + howLongNew.length);
  }
}
*/