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

var scheduleData;
var schOpen = false;
var originLocation;

// IT DOES NOT MATTER WHAT TYPE OF FILE USED BUT ONLY GIVE CO-ORDINATES AS FLOAT TYPES | LONG FIRST THEN LAT
var source = new VectorSource({
  url: URL.createObjectURL(new File([],{type: "application/json"})),
  format: new GeoJSON()
});

function pointStyleFunction(feature) {
  return new Style({
    image: new Icon({
      src: './station.png',
      scale: 0.075
    }),
    text: new Text({
      text: feature.values_.original_id,
      offsetY: feature.values_.offset,
      fill: new Fill({color: 'rgba(0, 0, 0, 1)'}),
      scale: 1.5
    })
  });
}

var trainTextLayer = new VectorLayer({
  source: source,
  style: pointStyleFunction
});

const ws = new WebSocket('ws://192.168.0.220:8080/');

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
  const registerMsg = {type: 'register'};
  ws.send(JSON.stringify(registerMsg));
  console.log('Websocket Connection Registered');
}

// Change the if statements to read object properties on first array index instead of using includes
ws.onmessage = function(event) {
  if(event.data !== "" && event.data.length > 0){
    if(event.data.includes("geometry") && !event.data.includes("Cancelled")){
      const jsonFile = '{"type": "FeatureCollection", "features": ' + event.data + '}';
      const file = new File([jsonFile], {type: "application/json",});
      URL.revokeObjectURL(source.getUrl());
      source.setUrl(URL.createObjectURL(file));
      source.refresh();
      map.render();
    }
    else if(event.data.includes("geometry") && event.data.includes("Cancelled")){
      console.log(event.data);
    }
    //THIS NEEDS TO BE AN ELSE IF, otherwise empty event data will use this
    else if(typeof JSON.parse(event.data)[0][0].name !== "undefined"){
      console.log("Schedule Creation Called")
      scheduleData = JSON.parse(event.data);
      createDestinationList(JSON.parse(event.data));
    }
  }
}

// Add actual reconnect logic
ws.onclose = function() {
  console.log("Server Connection Lost. Attempting to reconnect");
}

// Sends request to server for a list of schedules both departing and arriving at this station, returns from server as an array to be formatted by client
function scheduleRequest(tiploc){
  const request = {
    type: "scheduleReq",
    tiploc: tiploc
  }
  ws.send(JSON.stringify(request));
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
// Display popup on click
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
    content: "<p> Details <br>Location: " + "<code>" + feature.get('name') + "</code></p>" + "<p class='hidden'>" + "[" + feature.get('tiploc') + "]" + "</p>" + "<a href='#' id='scheduleButton'> Schedule </a>"
  });

  originLocation = feature.get('name');

  popover.show();

  createScheduleButton();
});

// Change mouse cursor when over marker
map.on('pointermove', function (e) {

  const pixel = map.getEventPixel(e.originalEvent);

  const hit = map.hasFeatureAtPixel(pixel);

  map.getTarget().style.cursor = hit ? 'pointer' : '';

});

// Close the popup when the map is moved
map.on('movestart', disposePopover);

// Close Schedule Info Sidebar
document.getElementById("schedule-close-button").addEventListener("click", closeSchedule, false);
function closeSchedule() {
  document.getElementById("schContent").textContent = "";
  document.getElementById("scheduleInfo").style.width = "0%";
  schOpen = false;
}

// Schedule Button Listener
function createScheduleButton(){
  document.getElementById('scheduleButton').addEventListener("click", openScheduleInfo, false);
}

// Open Schedule
async function openScheduleInfo(){
  if(schOpen === false){
    schOpen = true;
    console.log(this.offsetParent.innerHTML)
    const tiploc = this.offsetParent.innerHTML.substring(this.offsetParent.innerHTML.indexOf("[") + 1, this.offsetParent.innerHTML.lastIndexOf("]"));
    scheduleRequest(tiploc);
    document.getElementById("scheduleInfo").style.width = "25%";
    const loadingImg = document.createElement("img");
    loadingImg.src = "./Loading.png";
    document.getElementById("schContent").appendChild(loadingImg);
  }
  else{
    console.log("Close Current Schedule Display");
  }
}

// REMEMBER TO FORMAT STATION NAMES, Capitalize each word
// Function that takes array of schedule arrays and shows list of destinations coming after the selected station
function createDestinationList(arrArr){
  // Get unique names of stations later in the schedules than the current station
  document.getElementById("schContent").textContent = "";
  const nameArr = [];
  const schedHead = document.createElement("h3");
  schedHead.textContent = "Select Destination:";
  document.getElementById("schContent").appendChild(schedHead);
  // For each individual array
  arrArr.forEach((schedArr) => {
    schedArr.forEach((item, index, array) => {
      const locPos = array.map(thing => thing.name).indexOf(originLocation);
      if(!nameArr.includes(item.name) && item.name !== originLocation && index > locPos){
        const staButt = document.createElement("button");
        staButt.textContent = item.name;
        staButt.addEventListener("click", stationButtonClicked, false);
        nameArr.push(item.name);
        document.getElementById("schContent").appendChild(staButt);
        document.getElementById("schContent").appendChild(document.createElement('br'));
      }
    });
  });
}

// CSS needs formatting
// Need Names in correct order ie origin, dest, origin, dest rather than dest, origin, dest, origin, dest, dest etc
function stationButtonClicked(){
  const destName = this.outerText;
  document.getElementById("schContent").textContent = "";
  var list = [];
  scheduleData.forEach((currArr) => {
    // Remember these return arrays and need to be accessed as such
    // Get the origin from array
    const origin = currArr.filter(function(obj){return (obj.name === originLocation)});
    // Get the destination from array
    const dest = currArr.filter(function(obj){return (obj.name === destName)});
    // Check the destination comes after the origin before pushing
    //console.log(origin, dest);
    if(typeof origin[0] !== "undefined" && typeof dest[0] !== "undefined" && Number(origin[0].departure) < Number(dest[0].arrival)){
      // Push items into an array so they stay together during sorting
      list.push([origin[0], dest[0]]);
    }
  });
  // Remove duplicates
  //list = list.filter(function(obj){return (obj.arrival !== schedItem.arrival && obj.departure !== schedItem.departure)});
  // Sort by either departure or arrival time, based on what's available
  list.sort((a, b) => {
    if(a[0].arrival != "undefined" && b[0].arrival != "undefined") return a[0].arrival - b[0].arrival;
    else if(a[0].departure != "undefined" && b[0].departure != "undefined") return a[0].departure - b[0].departure;
  });
  // Add to DOM
  //const domList = document.createElement("li");
  //document.getElementById("schContent").textContent = list;
  console.log(list);
}

/*
  const listObj = document.createElement("p");
  listObj.textContent = schedItem.name + " Departure: " + schedItem.departure;
  domList.appendChild(listObj);
else if(){
  const listObj = document.createElement("p");
  listObj.textContent = schedItem.name + " Arrival: " + schedItem.arrival;
  domList.appendChild(listObj);
  domList.appendChild(document.createElement('br'));
}
*/