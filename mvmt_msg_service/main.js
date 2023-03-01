// Security Token: 75083e36-7f77-4ade-99db-5ca132887e22
// Subscriptions not required anymore, great stuff!

const fs = require("fs");
const {MongoClient} = require("mongodb");

// Create Web Socket Server Object
const { WebSocketServer } = require("ws");
const wss = new WebSocketServer({ port: 443 });
console.log('Socket Server Started & Listening');

// User address map counter
var userCounter = 0;

// Array of active stations gathered on server startup, this array holds all the GeoJson objects used for plotting locations on the map | Remember to send this to all users on initial connection | This will also get rid of most locations that aren't on public schedules
const collatedStations = [];

// Map of IP addresses, might be better to replace with array
const addressUserMap = new Map();

// Map of locations, key is tiploc, value is an item containing Name, Tiploc, Stanox and Station Co-ordinates
const locationTipMap = new Map();

// Another map of locations using the stanox code as the key
const locationStaMap = new Map();

// MongoDB connection config
const uri = "mongodb://127.0.0.1:27017/?directConnection=true&serverSelectionTimeoutMS=2000&appName=mongosh+1.6.1";
const client = new MongoClient(uri);
const db = client.db('test');
const coll = db.collection('dailyCollection');
const locColl = db.collection('Tiploc_Stanox_Locations');
const actColl = db.collection('ActiveStations');

// Remove ipv6 header if address is ipv4
function ipv4(address) {
    if(address.substring(0,7) == "::ffff:"){
        let newAddress = address.slice(7,20);
        return newAddress;
    }
    else{
        return address;
    }
};

wss.on('connection', function connection(ws, req){
    ws.on('message', async function message(data){
        const msg = JSON.parse(data);
        let ip = ipv4(req.socket.remoteAddress);
        if(msg.type == 'register'){
            addressUserMap.set(userCounter, ip);
            console.log(addressUserMap);
            userCounter++;
            wss.clients.forEach(function each(client){
                if (client === ws){
                  client.send(JSON.stringify(collatedStations));
                }
            });
        }
        else if(msg.type == 'scheduleReq'){
            const schedule = await findSchedule(msg.tiploc);
            wss.clients.forEach(function each(client){
                if (client === ws){
                    client.send(JSON.stringify(schedule));
                }
            });
        }
        else if(msg.type == 'scheduleReqLong'){
            const schedule = await findLongSchedule(msg.tiploc, msg.tiplocDest);
            wss.clients.forEach(function each(client){
                if (client === ws){
                    client.send(JSON.stringify(schedule));
                }
            });
        }
    });
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// MongoDB
// Need to convert day of the week, date and time when making requests
// Remember that Sunday - Saturday is 0 - 6 in JS and days on the schedule go from Monday 1000000 to Sunday 0000001
// Need to check that the current day is after schedule start date but before schedule end date
// Need the time to find specific train times
// Start and end dates are YYYY-MM-DD
// Time format is hhmmH, with H being a half minute. The half minute isn't needed for the query as we can probably only use the number without massive overhead.
function currentDate(dateGiven){
    const today = new Date(dateGiven);
    const yr = today.getFullYear();
    var mth = today.getMonth() + 1;
    if(String(mth).length < 2){mth = "0" + String(mth)}
    var dom = today.getDate();
    if(String(dom).length < 2){dom = "0" + String(dom)}
    const date = yr + "-" + mth + "-" + dom;
    var time = "";
    var hrs = today.getHours();
    if(String(hrs).length < 2){hrs = "0" + hrs}
    var mins = today.getMinutes();
    if(String(mins).length < 2){mins = "0" + mins}
    if(today.getSeconds() > 30){time = String(hrs) + String(mins) + "H"}else{time = String(hrs) + String(mins)}
    const whatDay = today.getDay();
    var day;
    switch(whatDay){
        case 0:
            day = /......1/;
            break;
        case 1:
            day = /1....../;
            break;
        case 2:
            day = /.1...../;
            break;
        case 3:
            day = /..1..../;
            break;
        case 4:
            day = /...1.../;
            break;
        case 5:
            day = /....1../;
            break;
        case 6:
            day = /.....1./;
            break;
    }
    return [day, date, time];
}

// Service Code required, tiploc required, NEED TO INCLUDE HEADCODE FROM TRAIN ID
// Search for the names of stations affected by a cancellation message
async function getCancelledRoute(cancelledTrain, cancelTiploc){
    const dateTime = currentDate(Number(cancelledTrain.planned_dep_time));
    var cancelledRouteData = coll.find({"JsonScheduleV1.schedule_days_runs": dateTime[0], "JsonScheduleV1.schedule_segment.CIF_train_service_code": cancelledTrain.service_code, "JsonScheduleV1.schedule_segment.signalling_id": cancelledTrain.train_id.substring(2, 6), "JsonScheduleV1.schedule_segment.schedule_location": {$all: [{$elemMatch: {"tiploc_code": cancelTiploc, "departure": {$eq: dateTime[2]}}}, {$elemMatch:{"public_departure": {$not: {$eq: null}}}}]}, "JsonScheduleV1.schedule_start_date": {$lte: dateTime[1]}, "JsonScheduleV1.schedule_end_date": {$gte: dateTime[1]}});
    var cancelledRouteArr = await cancelledRouteData.toArray();
    if(typeof cancelledRouteArr[0] === "undefined"){
        console.error("No Routes Found For Given Details, searching without signalling id");
        var cancelledRouteDataSecondTry = coll.find({"JsonScheduleV1.transaction_type": "Create", $nor: [{"JsonScheduleV1.train_status": "F"}, {"JsonScheduleV1.train_status": "2"}], "JsonScheduleV1.schedule_days_runs": dateTime[0], "JsonScheduleV1.schedule_segment.CIF_train_service_code": cancelledTrain.service_code, "JsonScheduleV1.schedule_segment.schedule_location": {$all: [{$elemMatch: {"tiploc_code": cancelTiploc, "departure": {$eq: dateTime[2]}}}, {$elemMatch:{"public_departure": {$not: {$eq: null}}}}]}, "JsonScheduleV1.schedule_start_date": {$lte: dateTime[1]}, "JsonScheduleV1.schedule_end_date": {$gte: dateTime[1]}});
        var canRouteArr = await cancelledRouteDataSecondTry.toArray();
        if(typeof canRouteArr[0] === "undefined"){
            console.error("No Public Routes Found for Given Details After Second Try");
        }
        else{
            return [canRouteArr[0], dateTime[2]];
        }
    }
    else{
        return [cancelledRouteArr[0], dateTime[2]];
    }
}

// Collect all locations into a map with tiplocs as a key (Avoids having to use a huge number of asynchronous calls for user requests) | Second half collates active stations based on schedule + location data
// Really need a reliable and efficient way to cut this down to just active passenger stations
async function getLocations(){
    const dateTime = currentDate(Date.now());
    console.log("Startup Time:");
    console.log(dateTime[1], dateTime[2]);
    // Map all tiploc/location pairs
    console.log("Mapping location names...");
    // This part looks for ALL locations in the collection, so that cancellations work properly, a third map needs to be created for active stations that show up for users on the frontend | Remember to add the third map
    var locationData = locColl.find({"Tiploc": {$exists: true}, "Name": {$exists: true}}).project({Tiploc: 1, Name: 1, DisplayName: 1, Stanox: 1, Latitude: 1, Longitude: 1 ,_id: 0});
    var locationArray = await locationData.toArray();
    locationArray.forEach((item) => {
        locationTipMap.set(item.Tiploc, item);
        locationStaMap.set(item.Stanox, item);
    });
    console.log("Mapping location names finished");
    console.log("Total Locations Mapped: " + locationTipMap.size);
    // Find active stations
    console.log("Collation of active stations started...");
    const activeStationData = actColl.find({"Name": {$exists: true}});
    const activeStationArray = await activeStationData.toArray();
    const activeStations = [];
    activeStationArray.forEach((station) => {
        activeStations.push(station.Name);
    });
    locationTipMap.forEach((item) => {
        const fileObj = {
            "type": "Feature",
            "geometry": {
            "type": "Point",
            "coordinates": [item.Longitude, item.Latitude]
            },
            "properties": {
            "name": item.Name,
            "tiploc": item.Tiploc,
            "stanox": item.Stanox
            },
        }
        if(activeStations.includes(item.Name)){
            collatedStations.push(fileObj)
        }
    });
    console.log("Collation of active stations finished, active Stations Collated: " + collatedStations.length);
    if(collatedStations.length > 0) console.log("Server start-up finished");
}

getLocations();
//checkSavedMessages();

async function findSchedule(tiploc){
    const dateTime = currentDate(Date.now());
    const dayOfWeek = dateTime[0];
    const date = dateTime[1];
    const time = dateTime[2];
    const scheduleData = coll.find({"JsonScheduleV1.schedule_days_runs": dayOfWeek, "JsonScheduleV1.schedule_segment.schedule_location": {"$elemMatch": {"tiploc_code": tiploc, "public_departure": {$gte: time}}}, "JsonScheduleV1.schedule_start_date": {$lte: date}, "JsonScheduleV1.schedule_end_date": {$gte: date}});
    const scheduleArray = await scheduleData.toArray();
    const timetables = getFormattedTimetable(scheduleArray);
    console.log(tiploc);
    console.log(timetables.length)
    return timetables;
}

// These need to be objects for formatting on the client side
function getFormattedTimetable(arr){
    var timetables = [];
    for(i = 0; i < arr.length; i++){
        var timetable = [];
        const locs = arr[i].JsonScheduleV1.schedule_segment.schedule_location;
        for(x = 0; x < locs.length; x++){
            var timeObj = {"name": locationTipMap.get(locs[x].tiploc_code).Name}
            if(typeof locs[x].public_arrival !== "undefined" && locs[x].public_arrival !== null){timeObj.arrival = locs[x].public_arrival}
            if(typeof locs[x].public_departure !== "undefined" && locs[x].public_departure !== null){timeObj.departure = locs[x].public_departure}
            if(typeof Object.values(timeObj)[1] !== "undefined" || typeof Object.values(timeObj)[2] !== "undefined"){
                timetable.push(timeObj);
            }
        }
        timetables.push(timetable);
    }
    return timetables;
}

async function findLongSchedule(startTip, destTip){

    // Start recording execution time
    console.time("wholeLongSchedule");

    // Get current date and time
    const dateTime = currentDate(Date.now());
    const dayOfWeek = dateTime[0];
    const date = dateTime[1];

    // First Query Execution Time
    console.time("firstQuery");

    // Only one query is needed to start us off, this should find enough info for both direct journeys and single change journeys
    const firstRouteData = coll.find({"JsonScheduleV1.schedule_days_runs": dayOfWeek, $or: [{"JsonScheduleV1.schedule_segment.schedule_location.tiploc_code": startTip}, {"JsonScheduleV1.schedule_segment.schedule_location.tiploc_code": destTip}], "JsonScheduleV1.schedule_start_date": {$lte: date}, "JsonScheduleV1.schedule_end_date": {$gte: date}});
    const firstRouteArray = await firstRouteData.toArray();

    console.timeEnd("firstQuery");

    console.time("firstLoop");
    // Search destination schedule, if there's a direct match (destTip and startTip in same scheduleEntry) push the entire schedule entry (Front end works out direction and order)
    const directSchedules = [];
    const possibleStartConnections = [];
    firstRouteArray.forEach((scheduleEntry) => {
        // Iterate through location data, if both the destination and the starting location are present, push to directSchedules. If only one is present, push it to possibleIndirectRoutes for further checking
        const directCheck = [];
        scheduleEntry.JsonScheduleV1.schedule_segment.schedule_location.forEach((locationEntry) => {
            if(locationEntry.tiploc_code === startTip || locationEntry.tiploc_code === destTip) directCheck.push(locationEntry.tiploc_code);
        });
        if(directCheck.includes(startTip) && directCheck.includes(destTip)) directSchedules.push(scheduleEntry);
        else if(directCheck.includes(startTip)) possibleStartConnections.push(scheduleEntry);
    });

    // If there are no direct routes, start searching for connections
    if(directSchedules.length < 1){

        const possibleRoutes = [];
        const possibleFirstChanges = [];

        firstRouteArray.forEach((scheduleEntry) => {
            var startEntry;
            var startPassed = false;
            scheduleEntry.JsonScheduleV1.schedule_segment.schedule_location.forEach((locationEntry) => {
                if(startPassed === false && locationEntry.tiploc_code === startTip){
                    startEntry = locationEntry;
                    startPassed = true;
                }
                else if(startPassed === true && Number(locationEntry.public_arrival) > Number(startEntry.public_departure) && !possibleFirstChanges.includes(locationEntry.tiploc_code) && locationEntry.tiploc_code !== startTip){
                    possibleFirstChanges.push(locationEntry.tiploc_code)
                    possibleRoutes.push([startTip, locationEntry.tiploc_code])
                }
            });
        });

        let allSchedules = firstRouteArray;
        console.log(allSchedules.length)
        const allTiplocs = [possibleFirstChanges];
        let tiplocsBeforeLast;
        let previousTiplocs = possibleFirstChanges;
        let possibleCurrentChanges = [];
        let numberOfChanges = 0;
        // Set the loop to run 4 times for 5 total queries (up to 5 changes), the loop will break if a route is found.
        for(i = 0; i < 4; i++){

            let routeData;

            // Now start another search using the possible changes | If on the 3rd, 4th or 5th search, use $nin to ensure no looping back on the previous routes
            if(i === 0){
                routeData = coll.find({"JsonScheduleV1.schedule_segment.schedule_location.tiploc_code": {$in: possibleFirstChanges, $ne: startTip}, "JsonScheduleV1.schedule_start_date": {$lte: date}, "JsonScheduleV1.schedule_end_date": {$gte: date}});
            }
            else{
                routeData = coll.find({"JsonScheduleV1.schedule_segment.schedule_location.tiploc_code": {$in: previousTiplocs, $nin: tiplocsBeforeLast}, "JsonScheduleV1.schedule_start_date": {$lte: date}, "JsonScheduleV1.schedule_end_date": {$gte: date}});
            }

            const routeArray = await routeData.toArray();

            allSchedules = allSchedules.concat(routeArray);

            let destFound = false;

            routeArray.forEach((scheduleEntry) => {
                let changeEntry;
                let changePassed = false;
                scheduleEntry.JsonScheduleV1.schedule_segment.schedule_location.forEach((locationEntry) => {
                    if(changePassed === false && previousTiplocs.includes(locationEntry.tiploc_code)){
                        changeEntry = locationEntry;
                        changePassed = true;
                    }
                    else if(changePassed === true && Number(locationEntry.public_arrival) > Number(changeEntry.public_departure) && !possibleCurrentChanges.includes(locationEntry.tiploc_code) && !previousTiplocs.includes(locationEntry.tiploc_code)){
                        possibleCurrentChanges.push(locationEntry.tiploc_code);
                        possibleRoutes.push([changeEntry.tiploc_code, locationEntry.tiploc_code]);
                    }
                });
            });

            if(possibleCurrentChanges.includes(destTip)) destFound = true;

            tiplocsBeforeLast = previousTiplocs;
            previousTiplocs = possibleCurrentChanges;
            allTiplocs.push(possibleCurrentChanges);
            possibleCurrentChanges = [];

            if(destFound === true){
                numberOfChanges = (i + 1);
                break
            }
        }

        // We already know how many changes there are so start with the first tiploc and once the loop is done add the destination tiploc
        // Possible routes contains station - station arrays
        let currRoutes = [];
        console.log(possibleRoutes);
        for(c = 0; c < (numberOfChanges + 1); c++){
            const currentTiplocs = allTiplocs[c];
            if(c === 0){
                possibleRoutes.forEach((route) => {
                    if(route[0] === startTip && currentTiplocs.includes(route[1])){
                        currRoutes.push(route);
                    }
                });
            }
            else{
                currRoutes.forEach((currentRoute) => {
                    possibleRoutes.forEach((route) => {
                        if(route[0] === currentRoute[(currentRoute.length - 1)]){
                            currRoutes.push(currentRoute.concat(route[1]));
                        }
                    });
                });
            }
        }
        const routeArrs = [];
        currRoutes.forEach((route) => {
            if(route.length === (numberOfChanges + 2) && route[(route.length - 1)] === destTip) routeArrs.push(route);
        })
        console.log(allSchedules.length)
        const timetables = getFormattedLongTimetable(routeArrs, allSchedules);
        return timetables;

    }

    // If it's a direct route, call the long timetable function with startTip, destTip as the route and directSchedules as the schedule array
    const timetables = getFormattedLongTimetable([[startTip, destTip]], directSchedules);
    return timetables;
}

function getFormattedLongTimetable(routeArr, scheduleArr){
    // Get proper names of stations for frontend
    var namedRouteArr = [];
    routeArr.forEach((arr) => {
        const anotherArr = [];
        arr.forEach((tiploc) => {
            anotherArr.push(locationTipMap.get(tiploc).Name);
        });
        namedRouteArr.push(anotherArr);
    });
    console.time("longTimetable");
    var timetables = [];
    timetables.push(namedRouteArr);
    for(i = 0; i < scheduleArr.length; i++){
        var timetable = [];
        const locs = scheduleArr[i].JsonScheduleV1.schedule_segment.schedule_location;
        for(x = 0; x < locs.length; x++){
            var timeObj = {"name": locationTipMap.get(locs[x].tiploc_code).Name}
            if(typeof locs[x].public_arrival !== "undefined" && locs[x].public_arrival !== null){timeObj.arrival = locs[x].public_arrival}
            if(typeof locs[x].public_departure !== "undefined" && locs[x].public_departure !== null){timeObj.departure = locs[x].public_departure}
            if(typeof Object.values(timeObj)[1] !== "undefined" || typeof Object.values(timeObj)[2] !== "undefined"){
                timetable.push(timeObj);
            }
        }
        timetables.push(timetable);
    }
    console.timeEnd("longTimetable");
    return timetables;
}