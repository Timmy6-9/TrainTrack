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
var destName;
var indexMap = new Map();

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

const ws = new WebSocket('ws://192.168.1.12:8080/');

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
});

ws.onopen = function() {
  const registerMsg = {type: 'register'};
  ws.send(JSON.stringify(registerMsg));
  console.log('Websocket Connection Registered');
}

// Change the if statements to read object properties on first array index instead of using includes
ws.onmessage = function(event){
  const message = JSON.parse(event.data);
  if(typeof event.data !== "undefined" && event.data.includes("geometry")){
    const jsonFile = '{"type": "FeatureCollection", "features": ' + event.data + '}';
    const file = new File([jsonFile], {type: "application/json",});
    URL.revokeObjectURL(source.getUrl());
    source.setUrl(URL.createObjectURL(file));
    source.refresh();
    map.render();
  }
  else if(typeof message[0] !== "undefined" && message[0].type === "Cancel"){
    console.log("Cancels Received");
  }
  else{
    //if(typeof message[0] !== "undefined" && message[0].train_id){
      //console.log("Movement Messages Received");
      //const todaysMessages = [];
      //const today = timeFunc(Date.now())[1];
      //const time = timeFunc(Date.now() - 450000)[0];
      //console.log(today);
      //message.forEach((item) => {
      //  const dateTime = timeFunc(Number(item.planned_time))
      //  if(dateTime[1] == today && dateTime[0] > time && item.next_tiploc) todaysMessages.push(item);
      //});
      //console.log(todaysMessages);
      console.log("Schedule Creation Called");
      scheduleData = message;
      createDestinationList(message);
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
function openScheduleInfo(){
  if(schOpen === false){
    schOpen = true;
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
  // Does the array of arrays have anything in it?
  if(typeof arrArr[0] === "undefined"){
    document.getElementById("schContent").appendChild(document.createElement('br'));
    const notFoundMsg = document.createElement("p");
    notFoundMsg.textContent = "A public passenger schedule was not able to be found for this train or ferry route, if you believe this is an error and a schedule should be available for this route please contact us at placeholder@email.co.uk"
    document.getElementById("schContent").appendChild(notFoundMsg);
  }
  else{
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
}

// CSS needs formatting
// Need Names in correct order ie origin, dest, origin, dest rather than dest, origin, dest, origin, dest, dest etc
function stationButtonClicked(){
  destName = this.outerText;
  document.getElementById("schContent").textContent = "";
  var list = [];
  scheduleData.forEach((currArr, ind, arr) => {
    // Remember these return arrays and need to be accessed as such
    // Get the origin from array
    const origin = currArr.filter(function(obj){return (obj.name === originLocation)});
    // Get the destination from array
    const dest = currArr.filter(function(obj){return (obj.name === destName)});
    // Check the destination comes after the origin before pushing
    if(typeof origin[0] !== "undefined" && typeof dest[0] !== "undefined" && Number(origin[0].departure) < Number(dest[0].arrival)){
      // Push items into an array so they stay together during sorting
      list.push([origin[0], dest[0], ind]);
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
  const domList = document.createElement("ol");
  const depArr = document.createElement("h3");
  depArr.textContent = "Departure | Arrival";
  depArr.style.textDecorationLine = "underline";
  const hintMsg = document.createElement("p");
  hintMsg.textContent = "Click an item to see the full route with stops";
  document.getElementById("schContent").appendChild(depArr);
  document.getElementById("schContent").appendChild(hintMsg);
  list.forEach((item) => {
    indexMap.set(item[0].departure, item[2]);
    const butObj = document.createElement("a");
    butObj.textContent = item[0].name + ": " + item[0].departure + " | " + item[1].name + ": " + item[1].arrival;
    butObj.setAttribute("href", "#");
    butObj.addEventListener("click", testTimeButt, false);
    domList.appendChild(butObj);
  });
  document.getElementById("schContent").appendChild(domList);
}

function testTimeButt(){
  var index = indexMap.get(this.outerText.substring(this.outerText.indexOf(":") + 2, this.outerText.indexOf("|") - 1));
  var tableList = [];
  var originPassed = false;
  var destinationPassed = false;
  scheduleData[index].forEach((item) => {
    if(item.name === originLocation) originPassed = true;
    if(originPassed === true && destinationPassed === false) tableList.push(item);
    if(item.name === destName) destinationPassed = true;
  });
  console.log(tableList);
}




/*
function timeFunc(dateGiven){
  const today = new Date(dateGiven);
  var time = "";
  var hrs = today.getHours();
  if(String(hrs).length < 2){hrs = "0" + hrs}
  var mins = today.getMinutes();
  if(String(mins).length < 2){mins = "0" + mins}
  if(today.getSeconds() > 30){time = String(hrs) + String(mins) + "H"}else{time = String(hrs) + String(mins)}
  const date = today.getDate();
  return [time, date];
}



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