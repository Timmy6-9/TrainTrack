// Security Token: 75083e36-7f77-4ade-99db-5ca132887e22
// EK is the business code for London Overground services
const _ = require('lodash');
const mysql = require('mysql2');
const {MongoClient} = require("mongodb");
const stompit = require("stompit");
const async = require("async");

const { WebSocketServer } = require("ws");
const wss = new WebSocketServer({ port: 8080 });
console.log(`Socket Server Started & Listening`);

// New positions array counter
var count = 0;

// User address map counter
var userCounter = 0;

// Heartbeat Counter
var heartCount = 0;

// Cancel Array Counter
var cancelCount = 0;

var currPositions = [];
var newPositions = [];
var cancelArray = [];

const offsetStore = new Map();
const addressUserMap = new Map();
const locationMap = new Map();

const connection = mysql.createConnection({
    host:'127.0.0.1',
    user:'root',
    password:'',
    database:'traindb',
    port:'3306'
});

const uri = "mongodb://127.0.0.1:27017/ScheduleDB";
const client = new MongoClient(uri);
const db = client.db('ScheduleStore');
const coll = db.collection('DailyCollection301222');
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

wss.on('connection', function connection(ws, req) {
    ws.on('message', async function message(data) {
        const msg = JSON.parse(data);
        let ip = ipv4(req.socket.remoteAddress);
        if(msg.type == 'register'){
            addressUserMap.set(userCounter, ip);
            console.log(addressUserMap);
            userCounter++;
        }
        else if(msg.type == 'scheduleReq'){
            const schedule = await findSchedule(msg.tiploc);
            await wss.clients.forEach(function each(client) {
                if (client === ws) {
                  client.send(JSON.stringify(schedule));
                }
            });
        }
    });
});

// Connect options with standard headers
var connectOptions = {
    "host": "datafeeds.networkrail.co.uk",
    "port": 61618,
    "connectHeaders": {
        "client-id": "",            // request a durable subscription - set this to the login name you use to subscribe
        "host": "/",
        "login": "tmoater@googlemail.com",
        "passcode": "8YPKfzBWZf4HJyk@",
        "heart-beat": "15000,15000"
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
    "destination": "/topic/TRAIN_MVT_EK_TOC",                           // subscribe for a destination to which messages are sent
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
                            // Look for Train Movement messages (0003)
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
                            // Train Cancellation Messages
                            else if(item.header && item.header.msg_type == "0002"){
                                // Be sure to add more details to this message, for notifications later on. | Train cancellation messages have nearly all data required for this.
                                const fileObj = {
                                    "type": "Feature",
                                    "geometry": {
                                    "type": "Point",
                                    "coordinates": [0, 0]
                                    },
                                    "properties": {
                                    "name": "Cancelled",
                                    "current_id": item.body.train_id,
                                    "original_id": item.body.train_id,
                                    "tiploc": "Cancelled",
                                    "service_code": item.body.train_service_code,
                                    "offset": "Cancelled",
                                    "event_type": "Cancelled",
                                    "nextStop": "Cancelled"
                                    },
                                }
                                newPositions[count] = fileObj;
                                count++;
                            }
                    //next();
                    }
                );
            }
            // Call function to send locations to users every heartbeat
            replaceOffsetSend();
            sendCancellations();
        });
    });
});

// NEED TO CHANGE THIS TO USE CORRECT ID
// Individual trains are represented by a 10 digit UID, service codes are 8 digit numbers corresponding to routes from one terminating station to another
// This function both checks and changes label offsets as well as pushing new/updated entries to the current positions array from the new positions array, also removes trains that have terminated
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

function sendCancellations(){
    if(cancelArray != []){
        wss.clients.forEach(function each(client){
            client.send(JSON.stringify(cancelArray));
        });
        console.log("Cancellations Sent")
        cancelArray = [];
        cancelCount = 0;
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// MySQL

async function returnLocation(type, code){
    const result = await connection.promise().query('SELECT Name, Latitude, Longitude, Tiploc FROM stanox_tiploc_locations WHERE ' + type + ' = ' + "'" + code + "'" );
    if(result[0][0] != undefined){
        return result[0][0];
    }
}

async function returnOperator(secCode){
    const result = await connection.promise().query('SELECT CompanyName FROM toccodes WHERE SectorCode = ' + secCode);
    return result[0][0];
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// MongoDB
// Need to convert day of the week, date and time when making requests
// Remember that Sunday - Saturday is 0 - 6 in JS and days on the schedule go from Monday 1000000 to Sunday 0000001
// Need to check that the current day is after schedule start date but before schedule end date
// Need the time to find specific train times
// Start and end dates are YYYY-MM-DD
// Time formate is HHMMh, with h being a capital H for half minute
    function currentDate(){
        const today = new Date(Date.now());
        const yr = today.getFullYear();
        const mth = today.getMonth() + 1;
        if(mth.length < 2){mth = "0" + mth}
        const dom = today.getDate();
        if(dom.length < 2){dom = "0" + dom}
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
        const dateTime = currentDate();
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

    async function getLocationName(){
        console.log("mapping location names...");
        var locationData = locColl.find({"Tiploc": {$exists: true}, "Name": {$exists: true}}).project({Tiploc: 1, Name: 1, _id: 0});
        var locationArray = await locationData.toArray();
        locationArray.forEach(function(item){
            locationMap.set(item.Tiploc, item.Name);
        });
        console.log("mapping location names FINISHED");
    }

    // These need to be objects for formatting on the client side
    function getFormattedTimetable(arr){
        var timetables = [];
        for(i = 0; i < arr.length; i++){
            var timetable = [];
            const locs = arr[i].JsonScheduleV1.schedule_segment.schedule_location;
            for(x = 0; x < locs.length; x++){
                var timeObj = {"name": locationMap.get(locs[x].tiploc_code)}
                if(typeof locs[x].public_arrival !== "undefined" && locs[x].public_arrival !== null){timeObj.arrival = locs[x].public_arrival}
                if(typeof locs[x].public_departure !== "undefined" && locs[x].public_departure !== null){timeObj.departure = locs[x].public_departure}
                if(typeof Object.values(timeObj)[1] !== "undefined" && typeof Object.values(timeObj)[2] !== "undefined"){
                    if(timeObj.departure.length >= 4 || timeObj.arrival.length >= 4){timetable.push(timeObj)}
                }
            }
            timetables.push(timetable);
        }
        return timetables;
    }
    getLocationName();

// Need popup sidebar on frontend that appears on left side of screen to show formatted schedule data

// Use origin station + destination station to get times and route

// Use time in milliseconds to get next scheduled stop for a train

// Train Status is not "F" (Freight)

// Create and populate map of tiploc codes and actual names on startup?