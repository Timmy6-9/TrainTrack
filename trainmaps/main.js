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
var journeyArr;
var schOpen = false;
var choosingDestination = false;
const indexMap = new Map();
const autoArray = [];
var locationData;

var originLocation;
var destName;
var originTip;
var destTip;

// IT DOES NOT MATTER WHAT TYPE OF FILE USED BUT ONLY GIVE CO-ORDINATES AS FLOAT TYPES | LONG FIRST THEN LAT
var source = new VectorSource({
  url: URL.createObjectURL(new File([],{type: "application/json"})),
  format: new GeoJSON()
});

var trainTextLayer = new VectorLayer({
  source: source,
  style: pointStyleFunction
});

const ws = new WebSocket('ws://192.168.1.12:443/');

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
    locationData = JSON.parse(event.data);
    const file = new File([jsonFile], {type: "application/json",});
    JSON.parse(event.data).forEach((object) => {
      autoArray.push(object.properties.name)
    });
    URL.revokeObjectURL(source.getUrl());
    source.setUrl(URL.createObjectURL(file));
    source.refresh();
    map.render();
  }
  else if(typeof message[0] !== "undefined" && message[0].type === "Cancel"){
    console.log("Cancels Received");
  }
  else{
    console.log("Schedule Creation Called");
    scheduleData = message;
    if(typeof scheduleData[0][0][0] === "string"){
      console.log("long time called");
      listLongTimes();
    }
    else if(typeof destTip === "undefined"){
      console.log("short time called");
      createDestinationList();
    }
  }
}

// Add actual reconnect logic
ws.onclose = function() {
  console.log("Server Connection Lost. Attempting to reconnect");
}

// Sends request to server for a list of schedules both departing and arriving at this station, returns from server as an array to be formatted by client
function scheduleRequest(tiploc, tiploc2){
  // Direct Route
  if(typeof tiploc2 === "undefined"){
    const request = {
      type: "scheduleReq",
      tiploc: tiploc
    }
    ws.send(JSON.stringify(request));
  }
  // Route with changes/Long Route
  else{
    const request = {
      type: "scheduleReqLong",
      tiploc: tiploc,
      tiplocDest: tiploc2
    }
    ws.send(JSON.stringify(request));
  }
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


  if(choosingDestination === false){
    originLocation = feature.get('name');
    popover = new bootstrap.Popover(element, {
      placement: 'right',
      html: true,
      content: "<p> Details <br>Location: " + "<code>" + feature.get('name') + "</code></p>" + "<p class='hidden'>" + "[" + feature.get('tiploc') + "]" + "</p>" + "<a href='#' id='scheduleButton'> Direct Routes </a>" + "<br>" + "<a href='#' id='startButton'> Select Start Station </a>"
    });
    popover.show();
    createStartRouteListener();
    createScheduleListener();
  }
  else if(choosingDestination === true){
    destName = feature.get('name');
    popover = new bootstrap.Popover(element, {
      placement: 'right',
      html: true,
      content: "<p> Details <br>Location: " + "<code>" + feature.get('name') + "</code></p>" + "<p class='hidden'>" + "[" + feature.get('tiploc') + "]" + "</p>" + "<br>" + "<a href='#' id='destButton'> Select Destination </a>"
    });
    popover.show();
    createDestRouteListener();
  }
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
function createScheduleListener(){
  document.getElementById('scheduleButton').addEventListener("click", openScheduleInfo, false);
}

// Start Route Button Listener
function createStartRouteListener(){
  document.getElementById('startButton').addEventListener("click", select2ndDestination, false);
}

// Destination Button Listener
function createDestRouteListener(){
  document.getElementById('destButton').addEventListener("click", searchForLongRoute, false);
}

function select2ndDestination(){
  if(choosingDestination === false){
    choosingDestination = true;
    originTip = this.offsetParent.innerHTML.substring(this.offsetParent.innerHTML.indexOf("[") + 1, this.offsetParent.innerHTML.lastIndexOf("]"));
    const selectDestNote = document.createElement("h2");
    selectDestNote.textContent = "Select Destination Station";
    document.getElementById("body").appendChild(selectDestNote);
    selectDestNote.style.position = "absolute"; selectDestNote.style.fontWeight = "bold"; selectDestNote.style.marginLeft = "2%"; selectDestNote.style.fontSize = "250%"; selectDestNote.id = "selectDestNote";
  }
}

function searchForLongRoute(){
  if(schOpen === false && choosingDestination === true){
    schOpen = true;
    choosingDestination = false;
    document.getElementById('selectDestNote').remove();
    destTip = this.offsetParent.innerHTML.substring(this.offsetParent.innerHTML.indexOf("[") + 1, this.offsetParent.innerHTML.lastIndexOf("]"));
    console.log(originLocation, destName);
    scheduleRequest(originTip, destTip);
    document.getElementById("scheduleInfo").style.width = "25%";
    const loadingImg = document.createElement("img");
    loadingImg.src = "./Loading.png";
    document.getElementById("schContent").appendChild(loadingImg);
  }
  else{
    alert("Please Close Current Schedule First");
  }
}

// Open Schedule
function openScheduleInfo(){
  if(schOpen === false && choosingDestination === false){
    schOpen = true;
    const tiploc = this.offsetParent.innerHTML.substring(this.offsetParent.innerHTML.indexOf("[") + 1, this.offsetParent.innerHTML.lastIndexOf("]"));
    scheduleRequest(tiploc);
    document.getElementById("scheduleInfo").style.width = "25%";
    const loadingImg = document.createElement("img");
    loadingImg.src = "./Loading.png";
    document.getElementById("schContent").appendChild(loadingImg);
  }
  else{
    alert("Please Close Current Schedule First");
  }
}

// --------------------------------------------------------- Direct Schedule Functions ------------------------------------------------------------- //

// Function that takes array of schedule arrays and shows list of destinations coming after the selected station
function createDestinationList(){
  const arrArr = scheduleData;
  console.log("Dest List Called");
  // Get unique names of stations later in the schedules than the current station
  document.getElementById("schContent").textContent = "";
  const nameArr = [];
  const schedHead = document.createElement("h3");
  schedHead.textContent = "Select Destination:";
  schedHead.style.textDecorationLine = "underline";
  schedHead.style.fontWeight = "bold";
  document.getElementById("schContent").appendChild(schedHead);
  // Does the array of arrays have anything in it?
  if(typeof arrArr[0] === "undefined"){
    document.getElementById("schContent").appendChild(document.createElement('br'));
    const notFoundMsg = document.createElement("p");
    notFoundMsg.textContent = "A public passenger schedule was not able to be found for this route, this is likely due to the limitations of this example application.";
    document.getElementById("schContent").appendChild(notFoundMsg);
  }
  else{
    arrArr.forEach((schedArr) => {
      schedArr.forEach((item, index, array) => {
        const locPos = array.map(thing => thing.name).indexOf(originLocation);
        if(!nameArr.includes(item.name) && item.name !== originLocation && index > locPos){
          const staButt = document.createElement("button");
          staButt.textContent = item.name;
          staButt.addEventListener("click", listTimes, false);
          nameArr.push(item.name);
          document.getElementById("schContent").appendChild(staButt);
          document.getElementById("schContent").appendChild(document.createElement('br'));
        }
      });
    });
    const directRouteNote = document.createElement("p");
    directRouteNote.textContent = "Please note these are direct routes, if your journey might require a change of service please select both a start and a destination station on the map and the fastest route will be shown.";
    document.getElementById("schContent").appendChild(directRouteNote);
    directRouteNote.style.fontSize = "12px";
  }
}

// CSS needs formatting
// Need Names in correct order ie origin, dest, origin, dest rather than dest, origin, dest, origin, dest, dest etc
function listTimes(){
  if(typeof originTip === "undefined" && typeof destTip === "undefined"){
    destName = this.outerText;
  }
  document.getElementById("schContent").textContent = "";
  var list = [];
  scheduleData.forEach((currArr, ind) => {
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
    butObj.textContent = `${item[0].name} : ${item[0].departure} | ${item[1].name} : ${item[1].arrival}`;
    butObj.setAttribute("href", "#");
    butObj.addEventListener("click", shortTimeButt, false);
    domList.appendChild(butObj);
  });
  document.getElementById("schContent").appendChild(domList);
  if(typeof originTip !== "undefined" && typeof destTip !== "undefined"){
    originTip = undefined;
    destTip = undefined;
  }
}

// list out all stops between the start and destination locations
function shortTimeButt(){
  const timeTableTab = document.getElementById("schContent");
  timeTableTab.textContent = "";
  const backButt = document.createElement("a")
  backButt.textContent = "🠔";
  backButt.setAttribute("href", "javascript:void(0)")
  backButt.addEventListener("click", createDestinationList, false);
  backButt.style.left = "1%"; backButt.style.top = "1%";
  backButt.style.position = "absolute";
  document.getElementById("schContent").appendChild(backButt);
  var index = indexMap.get(this.outerText.substring(this.outerText.indexOf(":") + 2, this.outerText.indexOf("|") - 1));
  const title = document.createElement("h3");
  title.textContent = `${originLocation} to ${destName}`;
  title.style.textDecoration = "underline";
  timeTableTab.appendChild(title);
  const subtitle = document.createElement("p");
  subtitle.textContent = "Stops highlighted in bold are the start and destination"
  subtitle.style.fontStyle = "italic";
  timeTableTab.appendChild(subtitle);
  var originPassed = false;
  var destinationPassed = false;
  scheduleData[index].forEach((item, index) => {
    const line = document.createElement("p");
    if(item.name === originLocation){
      originPassed = true;
    }
    if(originPassed === true && destinationPassed === false){
      if(item.name === originLocation){
        line.textContent = `${item.name} Departure: ${item.departure}`;
        line.style.fontWeight = "bold"
        timeTableTab.appendChild(line);
      }
      else if(item.name === destName){
        line.textContent = `${item.name} Arrival: ${item.arrival}`;
        line.style.fontWeight = "bold"
        timeTableTab.appendChild(line);
      }
      else{
        line.textContent = `${item.name} Arrival: ${item.arrival} Departure: ${item.departure}`;
        timeTableTab.appendChild(line);
      }
    }
    if(item.name === destName){
      destinationPassed = true;
    }
  });
}

// ------------------------------------------------------- Long Timetable Functions ------------------------------------------------------------------------ //

function listLongTimes(){
  journeyArr = scheduleData[0][0];
  originLocation = journeyArr[0];
  destName = journeyArr[(journeyArr.length - 1)];
  let newScheduleArr = [];
  journeyArr.forEach((stop, ind, arr) => {
    if(typeof arr[ind + 1] !== "undefined"){
      const currStopName = stop;
      const nextStopName = arr[ind + 1];
      scheduleData.forEach((route) => {
        let currStationPassed = false;
        let nextStationPassed = false;
        let firstIndex;
        let secondIndex;
        route.forEach((timeObj, index) => {
          if(currStationPassed === false && timeObj.name === currStopName){
            firstIndex = index;
            currStationPassed = true;
          }
          if(currStationPassed === true && nextStationPassed === false && timeObj.name === nextStopName){
            secondIndex = index + 1;
            nextStationPassed = true;
          }
        });
        if(currStationPassed === true && nextStationPassed === true){
          const newRoute = route.slice(firstIndex, secondIndex);
          newScheduleArr.push(newRoute);
        }
      });
    }
  });

  let fullRouteArr = [];
  // Sort route arrays by arrival/departure time of last/first stations in route | THEY WILL NOT BE THE SAME, THESE ROUTES ARE DIFFERENT SCHEDULES ON DIFFERENT LINES, IF THEY'RE THE SAME IT'S A COINCIDENCE

  // First get all the starting routes, we won't need more full timetables than this number of arrays
  newScheduleArr.forEach((schedule) => {if(schedule[0].name === originLocation) fullRouteArr.push(schedule)});

  // c stands for changes
  for(let c = 0; c < (journeyArr.length - 2); c++){
    fullRouteArr.forEach((lastSchedule, currIndex, array) => {
      let closest;
      newScheduleArr.forEach((schedule) => {
        if(schedule[0].name !== originLocation){
          if(typeof lastSchedule[(lastSchedule.length - 1)] !== "undefined" && lastSchedule[(lastSchedule.length - 1)].name === schedule[0].name && Number(lastSchedule[(lastSchedule.length - 1)].arrival) < Number(schedule[0].departure)){
            let testClosest = schedule[0].departure - lastSchedule[(lastSchedule.length - 1)].arrival;
            if(typeof closest === "undefined" || testClosest < closest){
              closest = testClosest;
              array[currIndex] = lastSchedule.concat(schedule);
            }
          }
        }
      });
    });
  }

  let finalRoutesArr = [];

  // Push to final array with any incomplete schedules removed
  fullRouteArr.forEach((finishedSchedule) => {
    if(finishedSchedule[(finishedSchedule.length - 1)].name === destName) finalRoutesArr.push(finishedSchedule);
  });

  // Sort Routes by first station departure time in ascending order
  finalRoutesArr.sort((a, b) => {
    if(typeof a[0].departure !== "undefined" && typeof b[0].departure !== "undefined") return a[0].departure - b[0].departure;
  });
  if(typeof finalRoutesArr[0] === "undefined"){
    const noRouteTitle = document.createElement("h3");
    noRouteTitle.textContent = "No Route Found";
    noRouteTitle.style.textDecorationLine = "underline";
    document.getElementById("schContent").textContent = "";
    const notFoundMsg = document.createElement("p");
    notFoundMsg.textContent = "A public passenger schedule was not able to be found for this route, this is likely due to the limitations of this example application.";
    document.getElementById("schContent").appendChild(noRouteTitle);
    document.getElementById("schContent").appendChild(notFoundMsg);
  }
  else{
    document.getElementById("schContent").textContent = "";
    // Display on frontend
    const domList = document.createElement("ol");
    const depArr = document.createElement("h3");
    depArr.textContent = "Route with changes";
    depArr.style.textDecorationLine = "underline";
    const hintMsg = document.createElement("p");
    hintMsg.textContent = "Click an item to see the full route with stops";
    document.getElementById("schContent").appendChild(depArr);
    document.getElementById("schContent").appendChild(hintMsg);
    finalRoutesArr.forEach((schedule, index) => {
      // For the index map on the long route we can simply set the first departure time as the key, they're all different.
      indexMap.set(Number(schedule[0].departure), index);
      const butObj = document.createElement("a");
      journeyArr.forEach((stop, jIndex) => {
        // stop is the name of the station to match with the schedule object names
        if(jIndex === 0){
          // first entry in schedule, just use name of first station and the departure time
          let textCon = document.createElement("p");
          textCon.textContent = `${schedule[0].name} Departure: ${schedule[0].departure}`;
          butObj.appendChild(textCon);
        }
        else if(jIndex < (journeyArr.length - 1)){
          // Search Schedule for name of current stop, use first entry found for arrival, second for departure
          // Find both schedule objects (arrival from first schedule, departure from second)
          let stopArr = [];
          schedule.forEach((schObj) => {
            if(schObj.name === stop) stopArr.push(schObj);
          });
          let textCon = document.createElement("p");
          textCon.textContent = `${stopArr[0].name} Arrival: ${stopArr[0].arrival} Departure: ${stopArr[1].departure}`;
          // Use arrival and departure found
          butObj.appendChild(textCon);
        }
        else if(jIndex === (journeyArr.length - 1)){
          let textCon = document.createElement("p");
          textCon.textContent = `${schedule[(schedule.length - 1)].name} Arrival: ${schedule[(schedule.length - 1)].arrival}`
          butObj.appendChild(textCon);
        }
      });
      butObj.setAttribute("href", "#");
      butObj.addEventListener("click", longTimeButt, false);
      domList.appendChild(butObj);
      const divider = document.createElement("hr");
      divider.style.margin = "auto";
      divider.style.width = "66%";
      domList.appendChild(divider);
    });
    document.getElementById("schContent").appendChild(domList);
    scheduleData = finalRoutesArr;
  }
}

// Same as the above function but accounts for changes
function longTimeButt(){
  console.log("Button calls")
  const index = indexMap.get(Number(this.outerText.substring(this.outerText.indexOf(":") + 2, this.innerHTML.indexOf(":") + 4)));
  const timeTableTab = document.getElementById("schContent");
  timeTableTab.textContent = "";
  const backButt = document.createElement("a");
  backButt.textContent = "🠔";
  backButt.setAttribute("href", "javascript:void(0)");
  backButt.addEventListener("click", longRedisplay, false);
  backButt.style.left = "1%"; backButt.style.top = "1%";
  backButt.style.position = "absolute";
  timeTableTab.appendChild(backButt);
  const title = document.createElement("h3");
  title.textContent = `${originLocation} to ${destName}`;
  title.style.textDecoration = "underline";
  timeTableTab.appendChild(title);
  const subtitle = document.createElement("p");
  subtitle.textContent = "Stops highlighted in bold are the start, destination and changes";
  subtitle.style.fontStyle = "italic";
  timeTableTab.appendChild(subtitle);
  const changeNumbers = document.createElement("p");
  changeNumbers.textContent = `This train has ${(journeyArr.length - 2)} changes`;
  changeNumbers.style.fontStyle = "italic";
  timeTableTab.appendChild(changeNumbers);
  let originPassed = false;
  let destinationPassed = false;
  let savedItem;
  scheduleData[index].forEach((item, ind, arr) => {
    const line = document.createElement("p");
    if(item.name === originLocation) originPassed = true;
    if(originPassed === true && destinationPassed === false){
      if(ind === 0){
        line.textContent = `${item.name} Departure: ${item.departure}`;
        line.style.fontWeight = "Bold";
        timeTableTab.appendChild(line);
      }
      else if(ind === (arr.length - 1)){
        line.textContent = `${item.name} Arrival: ${item.arrival}`;
        line.style.fontWeight = "Bold";
        timeTableTab.appendChild(line);
        destinationPassed = true;
      }
      if(ind > 0 && arr[(ind - 1)].name !== item.name && ind !== (arr.length - 1)){
        savedItem = item;
        if(item.name !== arr[(ind + 1)].name){
          line.textContent = `${item.name} Arrival: ${item.arrival} Departure: ${item.departure}`;
          timeTableTab.appendChild(line);
        }
      }
      else if(typeof arr[(ind - 1)] !== "undefined" && ind !== (arr.length - 1)){
        line.textContent = `${item.name} Arrival: ${savedItem.arrival} Departure: ${item.departure}`;
        line.style.fontWeight = "Bold";
        timeTableTab.appendChild(line);
      }
    }
  });
}

function longRedisplay(){
  document.getElementById("schContent").textContent = "";
  // Display on frontend
  const domList = document.createElement("ol");
  const depArr = document.createElement("h3");
  depArr.textContent = "Route with changes";
  depArr.style.textDecorationLine = "underline";
  const hintMsg = document.createElement("p");
  hintMsg.textContent = "Click an item to see the full route with stops";
  document.getElementById("schContent").appendChild(depArr);
  document.getElementById("schContent").appendChild(hintMsg);
  scheduleData.forEach((schedule, index) => {
    // For the index map on the long route we can simply set the first departure time as the key, they're all different.
    indexMap.set(Number(schedule[0].departure), index);
    const butObj = document.createElement("a");
    journeyArr.forEach((stop, jIndex) => {
      // stop is the name of the station to match with the schedule object names
      if(jIndex === 0){
        // first entry in schedule, just use name of first station and the departure time
        let textCon = document.createElement("p");
        textCon.textContent = `${schedule[0].name} Departure: ${schedule[0].departure}`;
        butObj.appendChild(textCon);
      }
      else if(jIndex < (journeyArr.length - 1)){
        // Search Schedule for name of current stop, use first entry found for arrival, second for departure
        // Find both schedule objects (arrival from first schedule, departure from second)
        let stopArr = [];
        schedule.forEach((schObj) => {
          if(schObj.name === stop) stopArr.push(schObj);
        });
        let textCon = document.createElement("p");
        textCon.textContent = `${stopArr[0].name} Arrival: ${stopArr[0].arrival} Departure: ${stopArr[1].departure}`;
        // Use arrival and departure found
        butObj.appendChild(textCon);
      }
      else if(jIndex === (journeyArr.length - 1)){
        let textCon = document.createElement("p");
        textCon.textContent = `${schedule[(schedule.length - 1)].name} Arrival: ${schedule[(schedule.length - 1)].arrival}`
        butObj.appendChild(textCon);
      }
    });
    butObj.setAttribute("href", "#");
    butObj.addEventListener("click", longTimeButt, false);
    domList.appendChild(butObj);
    const divider = document.createElement("hr");
    divider.style.margin = "auto";
    divider.style.width = "66%";
    domList.appendChild(divider);
  });
  document.getElementById("schContent").appendChild(domList);
}

var currZoom = map.getView().getZoom();
map.on('moveend', function(e) {
  var newZoom = map.getView().getZoom();
  if (currZoom != newZoom) {
    currZoom = newZoom;
  }
});

function pointStyleFunction(feature) {
  return new Style({
    image: new Icon({
      src: './station.png',
      scale: (0.006 * currZoom)
    }),
    text: new Text({
      text: feature.values_.original_id,
      offsetY: feature.values_.offset,
      fill: new Fill({color: 'rgba(0, 0, 0, 1)'}),
      scale: 1.5
    })
  });
}

document.getElementById("searchButton").addEventListener("click", searchForStations, false);

function searchForStations(){
  // Need a function that runs when the list of objects is received
  // Pull out the tab, add 2 input boxes, have a drop down (autocomplete) list with suggested stations under the boxes that update as the user types
  document.getElementById("scheduleInfo").style.width = "25%";
  const inputTab = document.getElementById("schContent");
  inputTab.textContent = "";
  const searchTitle = document.createElement("h3");
  searchTitle.textContent = "Route Search";
  searchTitle.style.textDecorationLine = "underline";
  const startInput = document.createElement("input");
  startInput.setAttribute("type", "text");
  startInput.style.width = "70%";
  startInput.style.margin = "auto";
  const destInput = document.createElement("input");
  destInput.setAttribute("type", "text");
  destInput.style.width = "70%";
  destInput.style.margin = "auto";
  const labelStart = document.createElement("p");
  labelStart.textContent = "Start Station: "
  const labelDest = document.createElement("p");
  labelDest.textContent = "Destination Station: "
  const sendStationsButton = document.createElement("button");
  sendStationsButton.textContent = "Search for Route";
  inputTab.appendChild(searchTitle);
  inputTab.appendChild(document.createElement("p"));
  inputTab.appendChild(labelStart);
  inputTab.appendChild(startInput);
  inputTab.appendChild(document.createElement("p"));
  inputTab.appendChild(document.createElement("p"));
  inputTab.appendChild(labelDest);
  inputTab.appendChild(destInput);
  inputTab.appendChild(document.createElement("p"));
  inputTab.appendChild(sendStationsButton);
  startInput.setAttribute("list", "startList");
  destInput.setAttribute("list", "destList");

  // Needs to be changed to use the text input
  sendStationsButton.addEventListener("click", function(){
    const startLoc = startInput.value;
    const destLoc = destInput.value;

    const startArr = locationData.filter((item) => {
      return item.properties.name === startLoc;
    })

    const destArr = locationData.filter((item) => {
      return item.properties.name === destLoc;
    })

    const startTip = startArr[0].properties.tiploc;
    const destTip = destArr[0].properties.tiploc;

    console.log(startTip, destTip);

    if(typeof startTip !== "undefined" && typeof destTip !== "undefined") scheduleRequest(startTip, destTip);
  });

  // Autocomplete
  const list = document.createElement("datalist");
  const listTwo = document.createElement("datalist");

  list.id = "startList";
  listTwo.id = "destList";

  startInput.addEventListener("input", function(){
    list.innerHTML = "";
    const currInput = this.value;
    const firstDigits = currInput.length;
    const currResults = [];
    autoArray.forEach((locationName) => {
      if(locationName.slice(0, firstDigits) === currInput) currResults.push(locationName);
      const newName = document.createElement("option");
      newName.value = locationName;
      list.appendChild(newName);
    });
    startInput.appendChild(list);
  });

  destInput.addEventListener("input", function(){
    listTwo.innerHTML = "";
    const currInput = this.value;
    const firstDigits = currInput.length;
    const currResults = [];
    autoArray.forEach((locationName) => {
      if(locationName.slice(0, firstDigits) === currInput) currResults.push(locationName);
      const newName = document.createElement("option");
      newName.value = locationName;
      listTwo.appendChild(newName);
    });
    startInput.appendChild(listTwo);
  });
}