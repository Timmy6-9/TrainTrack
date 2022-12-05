import './style.css';
import Map from 'ol/Map.js';
import OSM from 'ol/source/OSM.js';
import TileLayer from 'ol/layer/Tile.js';
import View from 'ol/View.js';
import {Text, Fill, Style, Icon} from 'ol/style';
import {useGeographic} from 'ol/proj';
import GeoJSON from 'ol/format/GeoJSON';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/vector';
import Overlay from 'ol/Overlay';

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

ws.onmessage = function(event) {
  locations = event.data;
  if(locations !== ""){
    const jsonFile = '{"type": "FeatureCollection", "features": ' + locations + '}';
    console.log(jsonFile);
    const file = new File([jsonFile], {type: "application/json",});
    URL.revokeObjectURL(source.getUrl());
    source.setUrl(URL.createObjectURL(file));
    source.refresh();
    map.render();
  }
}

ws.onclose = function() {
  console.log("Server Connection Lost. Attempting to reconnect");
}

// Popup labels
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
    content: "<p> Details <br>Location: " + "<code>" + feature.get('name') + "</code><br>Next Stop: " + "<code>" + feature.get('nextStop') + "</code><br>Type: " + "<code>" + feature.get('type') + "</code><br>Operator: " + "<code>" + feature.get('operator') + "</code></p>"
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