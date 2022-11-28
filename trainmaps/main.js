import './style.css';
import Map from 'ol/Map.js';
import OSM from 'ol/source/OSM.js';
import TileLayer from 'ol/layer/Tile.js';
import View from 'ol/View.js';
import {Text, Fill, Stroke, Circle, Style} from 'ol/style';
import {useGeographic} from 'ol/proj';
import WebGLPointsLayer from 'ol/layer/WebGLPoints';
import GeoJSON from 'ol/format/GeoJSON';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/vector';

useGeographic();

var persFileArr = [];
var newFileArr = [];
var counter = 0;

// IT DOES NOT MATTER WHAT TYPE OF FILE USED BUT ONLY GIVE CO-ORDINATES AS FLOAT TYPES | LONG FIRST THEN LAT
var source = new VectorSource({
  url: URL.createObjectURL(new File([],{type: "application/json"})),
  format: new GeoJSON()
});

function pointStyleFunction(feature) {
  return new Style({
    image: new Circle({
      fill: new Fill({color: 'rgba(0, 0, 0, 1)'}),
      stroke: new Stroke({color: 'rgba(0, 0, 0, 1)'}),
      radius: 5,
    }),
    text: new Text({
      text: feature.values_.id,
      offsetY: 15,
      fill: new Fill({color: 'rgba(0, 0, 0, 1)'}),
      scale: 1.75,
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
  target: 'map',
  layers: [mapLayer, trainTextLayer],
  view: new View({
    center: [-0.0599408, 51.5196195],
    zoom: 15,
  }),
});

ws.onopen = function() {
  ws.send("Register");
  console.log('Websocket Connection Registered');
};

ws.onmessage = function (event) {

  const msgObj = (JSON.parse(event.data));

  const fileObj = {
    "type": "Feature",
    "geometry": {
      "type": "Point",
      "coordinates": [msgObj.long, msgObj.lat]
    },
    "properties": {
      "name": msgObj.name,
      "id": msgObj.id,
      "type": msgObj.type
    },
  }

  newFileArr[counter] = JSON.stringify(fileObj);
  counter++;
};

// Need to use filter for both otherwise entries will be pushed constantly
function replaceByID(item){
  persFileArr = persFileArr.filter(function(obj){
    return JSON.parse(obj).properties.id !== JSON.parse(item).properties.id;
  });
  persFileArr.push(item);
}

function newPoints(){
  if(newFileArr != []){
  newFileArr.forEach(replaceByID);
    if(persFileArr != []){
      const jsonFile = '{"type": "FeatureCollection", "features": [' + persFileArr + ']}';

      const file = new File([jsonFile], {type: "application/json",});

      URL.revokeObjectURL(source.getUrl());

      source.setUrl(URL.createObjectURL(file));

      newFileArr = [];
      counter = 0;
      source.refresh();
      map.render();
    }
  }
  setTimeout(function() {newPoints()}, 10000);
}

newPoints();



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
*/