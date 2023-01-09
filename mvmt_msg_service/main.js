// Security Token: 75083e36-7f77-4ade-99db-5ca132887e22
// Subscriptions not required anymore, great stuff!

const fs = require("fs")
const _ = require("lodash");
const {MongoClient} = require("mongodb");
const stompit = require("stompit");
const async = require("async");

// Create Web Socket Server Object
const { WebSocketServer } = require("ws");
const wss = new WebSocketServer({ port: 8080 });
console.log(`Socket Server Started & Listening`);

// User address map counter
var userCounter = 0;

// Heartbeat Counter for getting rid of stuck/abandoned movement messages
var frameCount = 0;

// Activated Trains Array Counter
var activeCount = 0;

// Cancellation Array Counter
var cancelCount = 0;

// Activated Trains Array Counter
var moveCount = 0;

// Currently Activated Trains Running
var activatedTrains = [];

// Newly Activated Train Schedules
var newActivatedTrains = [];

// Array of cancellations to be sent out separately
var cancelArray = [];

// New cancel messages
var newCancellations = [];

// Array of cancellations to be sent out separately
var movementArray = [];

// New cancel messages
var newMovements = [];

// Array of active stations gathered on server startup, this array holds all the GeoJson objects used for plotting locations on the map | Remember to send this to all users on initial connection | This will also get rid of most locations that aren't on public schedules
const collatedStations = [];

// Map of IP addresses, might be better to replace with array
const addressUserMap = new Map();

// Map of locations, key is tiploc, value is an item containing Name, Tiploc, Stanox and Station Co-ordinates
const locationTipMap = new Map();

// Another map of locations using the stanox code as the key
const locationStaMap = new Map();

// Label/Popup Offsets for openlayers/frontend to use, station is key, array of train IDs are the values | Not currently used
//const offsetStore = new Map();

// MongoDB connection config
const uri = "mongodb://127.0.0.1:27017/ScheduleDB";
const client = new MongoClient(uri);
const db = client.db('ScheduleStore');
const coll = db.collection('DailyCollection_2022-01-09');
const locColl = db.collection('Tiploc_Stanox_Locations');

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
    });
});

// Connect options with standard headers
var connectOptions = {
    "host": "publicdatafeeds.networkrail.co.uk",
    "port": 61618,
    "connectHeaders": {
        "client-id": "",            // request a durable subscription - set this to the login name you use to subscribe
        "host": "/",
        "login": "tmoater@googlemail.com",
        "passcode": "8YPKfzBWZf4HJyk@",
        "heart-beat": "45000,45000"
    }
};

// Reconnect management for stompit client
var reconnectOptions = {
    "initialReconnectDelay": 10,    // milliseconds delay of the first reconnect
    "maxReconnectDelay": 30000,     // maximum milliseconds delay of any reconnect
    "useExponentialBackOff": true,  // exponential increase in reconnect delay
    "maxReconnects": 30,            // maximum number of failed reconnects consecutively
    "randomize": false              // randomly choose a server to use when reconnecting
                                    // (there are no other servers at this time)
};

var connectionManager = new stompit.ConnectFailover([connectOptions], reconnectOptions);

connectionManager.connect(function (error, client, reconnect) {
    if (error) {
        console.log("Terminal error, gave up reconnecting");
        return;
    }

    client.on("error", function (error) {
        console.log("Connection lost. Reconnecting...");
        reconnect();
    });

    var headers = {
    "destination": "/topic/TRAIN_MVT_ALL_TOC",                           // subscribe for a destination to which messages are sent
    "ack": "client-individual"                                          // the client will send ACK frames individually for each message processed
    //"activemq.subscriptionName": "londonovergroundtrack-train_mvt"    // request a durable subscription - set this to an unique string for each feed
    };

    client.subscribe(headers, function (error, message) {
        if (error) {
            console.log("Subscription failed:", error.message);
            return;
        }
        message.readString("utf-8", function (error, body) {
            if (error) {
                console.log("Failed to read a message", error);
                return;
            }
            if (body) {
                var data;
                try {
                    data = JSON.parse(body);
                } catch (e) {
                    console.log("Failed to parse JSON", e);
                    return;
                    }
                    async.each(data,
                        async function(item) {
                            // ADD TIMES FROM ALL MESSAGES TO ALL OBJECTS
                            // Change of identity messages shouldn't be needed, wiki seems to imply they only apply to freight trains although isn't explicit | I have no idea if change of location messages are the same, will need to test.
                            // Retrieve all pertinent info from incoming messages and save it in objects to be stored in arrays
                            // Train Activation Messages
                            if(item.header && item.header.msg_type == "0001"){
                                const activatedObj = {
                                    "type": "Activation",
                                    "train_id": item.body.train_id,
                                    "train_uid": item.body.train_uid,
                                    "service_code": item.body.train_service_code,
                                    "schedule_start": item.body.schedule_start_date,
                                    "schedule_end": item.body.schedule_end_date,
                                    "origin_departure": item.body.origin_dep_timestamp,
                                    "origin_stanox": item.body.sched_origin_stanox
                                }
                                newActivatedTrains[activeCount] = activatedObj;
                                activeCount++;
                            }
                            // Train Cancellation Messages
                            else if(item.header && item.header.msg_type == "0002"){
                                const cancelObj = {
                                    "type": "Cancel",
                                    "train_id": item.body.train_id, // 10 digit train ID, will always be original ID from activation message
                                    "op_id": item.body.toc_id, // Operator ID
                                    "division_code": item.body.division_code, // Div Code
                                    "route_origin": "To Be Filled",
                                    "sub_stops_arr": "To Be Filled",
                                    "service_code": item.body.train_service_code, // Service code, for narrowing down search results
                                    "cancel_time": item.body.canx_timestamp, // Time the train was cancelled
                                    "planned_dep_time": item.body.dep_timestamp, // Time the train would have departed the location
                                    "formatted_dep_time": "To Be Filled",
                                    "loc_stanox": "To Be Filled"
                                }
                                if(typeof item.body.orig_loc_stanox === "undefined"){
                                    cancelObj.loc_stanox = item.body.loc_stanox;
                                }
                                else{
                                    cancelObj.loc_stanox = item.body.orig_loc_stanox;
                                }
                                // Get Tiploc using Stanox of cancel message station || if statement is to filter out freight trains as freight yards etc are excluded from station map objects
                                if(typeof locationStaMap.get(cancelObj.loc_stanox) !== "undefined"){
                                    const locTip = locationStaMap.get(cancelObj.loc_stanox).Tiploc;
                                    const resArr = await getCancelledRoute(cancelObj, locTip);
                                    if(typeof resArr !== "undefined"){
                                        // resArr[1] is the planned departure time from the station
                                        const formatTime = resArr[1].slice(0,2) + ":" + resArr[1].slice(2);
                                        const stopsArr = [];
                                        var stopFound = false;
                                        const schedArr = resArr[0].JsonScheduleV1.schedule_segment.schedule_location
                                        for(n = 0; n < schedArr.length; n++){
                                            if(stopFound === false && schedArr[n].tiploc_code == locTip){
                                                stopFound = true;
                                            }
                                            else if(stopFound === true){
                                                const canOb = {
                                                    "StationName": locationTipMap.get(schedArr[n].tiploc_code).Name,
                                                }
                                                if(typeof schedArr[n].public_arrival !== "undefined")   canOb.arrival = schedArr[n].public_arrival;
                                                if(typeof schedArr[n].public_departure !== "undefined") canOb.departure = schedArr[n].public_departure;
                                                stopsArr.push(canOb);
                                            }
                                        }
                                        console.log(formatTime + " from " + locationStaMap.get(cancelObj.loc_stanox).Name + " has been cancelled");
                                        cancelObj.formatted_dep_time = formatTime;
                                        cancelObj.route_origin = locationStaMap.get(cancelObj.loc_stanox).Name;
                                        cancelObj.sub_stops_arr = stopsArr;
                                        newCancellations[cancelCount] = cancelObj;
                                        cancelCount++
                                    }
                                    else{
                                        const canTime = currentDate(Number(cancelObj.planned_dep_time));
                                        console.log("Cancelled public route not found for ID: " + cancelObj.train_id, "Departure Location: " + locationStaMap.get(cancelObj.loc_stanox).Tiploc, "Departure Time: " + canTime[2]);
                                    }
                                }
                            }
                            else if(item.header && item.header.msg_type == "0003"){
                                const movementObj = {
                                    "type": "Movement",
                                    "train_id": item.body.train_id, // 10 digit train ID, original from activation time
                                    "op_id": item.body.toc_id, // Operator ID
                                    "division_code": item.body.division_code,
                                    "service_code": item.body.train_service_code, // Schedule service code
                                    "stanox_code": item.body.loc_stanox,
                                    "planned_time": item.body.planned_timestamp, // Time this train was due to arrive/depart the location in the schedule
                                    "actual_time": item.body.actual_timestamp // Time the train actually arrived/departed the location
                                }
                                newMovements[moveCount] = movementObj;
                                moveCount++;
                            }
                        }
                    );
            }
            // Call function to send cancellations and movement messages to users every frame
            saveAndSend();
            frameCount++;
        });
    });
});

function saveAndSend(){
    // Activated Schedules
    newActivatedTrains.forEach((item) => {
        activatedTrains = activatedTrains.filter(function(obj){
            return obj.train_id !== item.train_id;
        });
        activatedTrains.push(item);
    });
    console.log(activatedTrains.length);
    if(activatedTrains[0] !== "undefined"){
        fs.writeFileSync("./activeTrainMessages.json", JSON.stringify(activatedTrains), 'utf-8');
    }
    newActivatedTrains = [];
    activeCount = 0;

    // Movements of running schedules
    newMovements.forEach((item) => {
        movementArray = movementArray.filter(function(obj){
            return obj.train_id !== item.train_id;
        });
        movementArray.push(item);
    });
    console.log(movementArray.length);
    if(movementArray[0] !== "undefined"){
        fs.writeFileSync("./movementTrainMessages.json", JSON.stringify(movementArray), 'utf-8');
    }
    newMovements = [];
    moveCount = 0;

    // Cancelled Trains
    newCancellations.forEach((item) => {
        cancelArray = cancelArray.filter(function(obj){
            return obj.train_id !== item.train_id;
        });
        cancelArray.push(item);
    });
    console.log(cancelArray.length)
    if(cancelArray[0] !== "undefined"){
        wss.clients.forEach(function each(client){
            client.send(JSON.stringify(cancelArray));
        });
        fs.writeFileSync("./cancelledTrainMessages.json", JSON.stringify(cancelArray), 'utf-8');
        newCancellations = [];
        cancelCount = 0;
    }
}

// To ensure the server can be restarted in a situation such as a power outage or hardware problem, the message functions will save to files that this function will load from on startup. These files should be scheduled for deletion as part of automating server startup
async function checkSavedMessages(){
    if(fs.existsSync('./activeTrainMessages.json')){
        if(fs.statSync('./activeTrainMessages.json').size > 0){
            activatedTrains = fs.readFileSync('./activeTrainMessages.json', {encoding: 'utf-8'});
            activatedTrains = JSON.parse(activatedTrains);
            console.log("Active array length: " + activatedTrains.length);
        }
    }

    if(fs.existsSync('./movementTrainMessages.json')){
        if(fs.statSync('./movementTrainMessages.json').size > 0){
            movementArray = fs.readFileSync('./movementTrainMessages.json', {encoding: 'utf-8'});
            movementArray = JSON.parse(movementArray);
            console.log("Movement array length: " + movementArray.length);
        }
    }

    if(fs.existsSync('./cancelledTrainMessages.json')){
        if(fs.statSync('./cancelledTrainMessages.json').size > 0){
            cancelArray = fs.readFileSync('./cancelledTrainMessages.json', {encoding: 'utf-8'});
            cancelArray = JSON.parse(cancelArray);
            console.log("Cancel array length: " + cancelArray.length);
        }
    }
}


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

    // Find better ways to filter this data and apply it to routes/services
    async function findSchedule(tiploc){
        const dateTime = currentDate(Date.now());
        const dayOfWeek = dateTime[0];
        const date = dateTime[1];
        const time = dateTime[2];
        // Use $gte and $lte to query the start and end of schedule dates against the current day
        const scheduleData = coll.find({"JsonScheduleV1.transaction_type": "Create", "JsonScheduleV1.train_status": {$not: {$eq:"F"}}, "JsonScheduleV1.schedule_days_runs": dayOfWeek, "JsonScheduleV1.schedule_segment.schedule_location": {"$elemMatch": {"tiploc_code": tiploc, "public_departure": {$gte: time}}}, "JsonScheduleV1.schedule_start_date": {$lte: date}, "JsonScheduleV1.schedule_end_date": {$gte: date}});
        const scheduleArray = await scheduleData.toArray();
        var timetables = getFormattedTimetable(scheduleArray);
        console.log(tiploc);
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

    // Service Code required, tiploc required, NEED TO INCLUDE HEADCODE FROM TRAIN ID
    // Search for the names of stations affected by a cancellation message
    async function getCancelledRoute(cancelledTrain, cancelTiploc){
        const dateTime = currentDate(Number(cancelledTrain.planned_dep_time));
        var cancelledRouteData = coll.find({"JsonScheduleV1.transaction_type": "Create", $nor: [{"JsonScheduleV1.train_status": "F"}, {"JsonScheduleV1.train_status": "2"}], "JsonScheduleV1.schedule_days_runs": dateTime[0], "JsonScheduleV1.schedule_segment.CIF_train_service_code": cancelledTrain.service_code, "JsonScheduleV1.schedule_segment.signalling_id": cancelledTrain.train_id.substring(2, 6), "JsonScheduleV1.schedule_segment.schedule_location": {$all: [{$elemMatch: {"tiploc_code": cancelTiploc, "departure": {$eq: dateTime[2]}}}, {$elemMatch:{"public_departure": {$not: {$eq: null}}}}]}, "JsonScheduleV1.schedule_start_date": {$lte: dateTime[1]}, "JsonScheduleV1.schedule_end_date": {$gte: dateTime[1]}});
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
        var passengerLocationData = locColl.find({"Tiploc": {$exists: true}, "Name": {$exists: true}, "Details/OffNetwork": "false", $nor: [ {"Details/TPS_StationType": "NotSet"}, {"Details/TPS_StationType": "RoutingOnly"} ], $nor: [ {"Details/TPS_StationCategory": "NonPassengerOrOperational"}, {"Details/TPS_StationCategory": "FreightYard"}] }).project({Tiploc: 1, Name: 1, DisplayName: 1, Stanox: 1, Latitude: 1, Longitude: 1 ,_id: 0});
        var passengerLocationArray = await passengerLocationData.toArray();
        console.log("Mapping location names finished");
        console.log("Active Stations Mapped: " + locationTipMap.size);
        // Find active stations
        console.log("Collation of active stations started...");
        passengerLocationArray.forEach((item) => {
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
            if(item.Name !== item.DisplayName) fileObj.name = item.DisplayName;
            collatedStations.push(fileObj);
        });
        console.log("Collation of active stations finished");
        console.log("Stations Collated: " + collatedStations.length);

    }

getLocations();

checkSavedMessages();


//var locationData = locColl.find({"Tiploc": {$exists: true}, "Name": {$exists: true}, "Details/OffNetwork": "false", $nor: [ {"Details/TPS_StationType": "NotSet"}, {"Details/TPS_StationType": "RoutingOnly"} ], $nor: [ {"Details/TPS_StationCategory": "NonPassengerOrOperational"}, {"Details/TPS_StationCategory": "FreightYard"}] }).project({Tiploc: 1, Name: 1, DisplayName: 1, Stanox: 1, Latitude: 1, Longitude: 1 ,_id: 0});

// Look for Train Movement messages (0003)
/*
if(item.header && item.header.msg_type == "0003") {
    // If train terminates there will be no destination stanox, check for train_terminated flag
    if(item.body.train_terminated == 'false' && item.body.nextStop != ''){
        if(item.body.loc_stanox !== "" && item.body.loc_stanox !== "00000" && item.body.loc_stanox.length === 5){
            const result = await returnLocation("Stanox", item.body.loc_stanox);
            const fileObj = {
                "type": "Feature",
                "geometry": {
                "type": "Point",
                "coordinates": [result.Longitude, result.Latitude]
                },
                "properties": {
                "name": result.Name,
                "current_id": item.body.current_train_id,
                "original_id": item.body.train_id,
                "tiploc": result.Tiploc,
                "service_code": item.body.train_service_code,
                "offset": 0,
                "event_type": item.body.event_type,
                "message_count": heartCount
                },
            }

            const retOp = await returnOperator(item.body.division_code);
            fileObj.properties.operator = retOp.CompanyName;

            // Drop message if next location can't be found
            const nextLoc = await returnLocation("Stanox", item.body.next_report_stanox);
            if(typeof nextLoc !== "undefined" && typeof nextLoc.Name !== "undefined"){
                fileObj.properties.nextStop = nextLoc.Name;
                newPositions[count] = fileObj;
                count++;
            }
        }
    }
    else{
        if(item.body.loc_stanox !== "" && item.body.loc_stanox !== "00000" && item.body.loc_stanox.length === 5){
            const result = await returnLocation("Stanox", item.body.loc_stanox);
            const fileObj = {
                "type": "Feature",
                "geometry": {
                "type": "Point",
                "coordinates": [result.Longitude, result.Latitude]
                },
                "properties": {
                "name": result.Name,
                "current_id": item.body.current_train_id,
                "original_id": item.body.train_id,
                "tiploc": result.Tiploc,
                "service_code": item.body.train_service_code,
                "offset": 0,
                "event_type": item.body.event_type,
                "nextStop": "Terminated",
                "message_count": heartCount
                },
            }

            const retOp = await returnOperator(item.body.division_code);
            fileObj.properties.operator = retOp.CompanyName;

            newPositions[count] = fileObj;
            count++;
        }
    }
}
*/





// NEED TO CHANGE THIS TO USE CORRECT ID
// Individual trains are represented by a 10 digit UID, service codes are 8 digit numbers corresponding to routes from one terminating station to another
// This function both checks and changes label offsets as well as pushing new/updated entries to the current positions array from the new positions array, also removes trains that have terminated
/*
function replaceByID(item){
    // Filter positions to get old/previous location for this train id
    filter = currPositions.filter(function(obj){
        return obj.properties.original_id === item.properties.original_id;
    });
    locationOrID = filter.map(item => item);
    const oldItem = locationOrID[0];
    // Offset Store is a Map object with station name as the key, array of train IDs at that station as the value
    if(item.properties.original_id != undefined){
        if(oldItem != undefined){
            // Get array of stations using old entry
            if(offsetStore.has(oldItem.properties.name)){
                var IDs = offsetStore.get(oldItem.properties.name);
            }
            // Remove old/last entry then add array back to Map
            if(IDs.includes(oldItem.properties.original_id)){
                const splicePos = IDs.indexOf(oldItem.properties.original_id);
                IDs.splice(splicePos, 1, "");
                // If the splice was before the last id, create a new array with just the ids then work out the offsets again
                lastIDPos = IDs.findLastIndex((element) => element.length == 10);
                if(splicePos < lastIDPos){
                    var IDs = _.remove(IDs, function(n) {
                        return n != "";
                    });
                    // Work out offsets
                    IDs.forEach(element => {
                        // Find item using id
                        const filter = currPositions.filter(function(obj){
                            return obj.properties.original_id === element;
                        });
                        const locationOrID = filter.map(item => item);
                        const currItem = locationOrID[0];
                        // Remove item with current offset
                        currPositions = currPositions.filter(function(obj){
                            return obj.properties.original_id !== currItem.properties.original_id;
                        });
                        // Work out new offset
                        if(IDs.indexOf(currItem.properties.original_id) == 0){
                            currItem.properties.offset = 25;
                        }
                        else if(IDs.indexOf(currItem.properties.original_id) > 0){
                            currItem.properties.offset = (25 + (IDs.indexOf(currItem.properties.original_id) * 15));
                        }
                        // Push back to current positions with correct offset
                        currPositions.push(currItem);
                    });
                }
            }
            // Update offsetStore
            offsetStore.set(oldItem.properties.name, IDs);
        }
    }

    if(item.properties.nextStop === "Terminated" || item.properties.nextStop === "Cancelled"){
        // If train is cancelled, add the object to the cancelled trains array
        if(item.properties.nextStop === "Cancelled"){
            cancelArray[cancelCount] = item;
            cancelCount++;
        };
        // If train is terminated, remove it from the array, same if train is cancelled
        console.log(item.properties.original_id + " " + item.properties.nextStop + " ( " + item.properties.service_code + " ) ");
        currPositions = currPositions.filter(function(obj){
           return obj.properties.original_id !== item.properties.original_id;
       });
    }
    else{
        // Get array for new station
        if(offsetStore.has(item.properties.name)){
            var newLocIDs = offsetStore.get(item.properties.name);
        }
        if(Array.isArray(newLocIDs)){
            // Use indexOf to replace first available position for new location
            // If no index is available, push new entry to array
            if(newLocIDs.indexOf("") != -1){
                newLocIDs.splice(newLocIDs.indexOf(""), 1, item.properties.original_id);
            }
            else{
                newLocIDs.push(item.properties.original_id);
            }
            // Use the indexOf result to set the offset 0 = 25, 1 = 40, 2 = 55, etc.
            if(newLocIDs.indexOf(item.properties.original_id) == 0){
                item.properties.offset = 25;
            }
            else if(newLocIDs.indexOf(item.properties.original_id) > 0){
                item.properties.offset = (25 + (newLocIDs.indexOf(item.properties.original_id) * 15));
            }
        }
        // Create Map entry for station if none exists, add this id as the first entry and set offset to 25
        if(!offsetStore.has(item.properties.name)){
            const newID = [item.properties.original_id];
            offsetStore.set(item.properties.name, newID);
            item.properties.offset = 25;
        }
        // Add new entry to current train positions
        currPositions = currPositions.filter(function(obj){
            return obj.properties.original_id !== item.properties.original_id;
        });
        currPositions.push(item);
    }
}
function deleteAfter5(item){
    // If the train/ID hasn't been heard from for 5+ minutes, drop from array | Prevents clutter and trains sticking around because no termination/cancellation message is sent out.
    if((item.properties.heartCount + 20) < heartCount){
        currPositions = currPositions.filter(function(obj){
            return obj.properties.original_id !== item.properties.original_id;
        });
        console.log("Lingering ID Removed");
    }
}
function replaceOffsetSend(){
    if(newPositions != []){
        newPositions.forEach(replaceByID);
        count = 0;
        if(currPositions != []){
            currPositions.forEach(deleteAfter5);
            wss.clients.forEach(function each(client){
                client.send(JSON.stringify(currPositions));
            });
        }
    }
}
*/