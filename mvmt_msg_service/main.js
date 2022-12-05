// Security Token
// 75083e36-7f77-4ade-99db-5ca132887e22
// EK is the business code for overground London lines, the only movement feed I'm subscribed to at the moment

// Current JSON info needs to be saved to an array or object so it can be sent to any new clients connecting
// Remember to configure new sql server with proper authentication for actual service

// In the final version, this should send a binary string of JSON data which the client can then put into a file to be read by openlayers
var count = 0;
var currPositions = [];
var newPositions = [];

const offsetStore = new Map();

var _ = require('lodash');
var mysql = require('mysql');
var stompit = require("stompit");
var async = require("async");

var connection = mysql.createConnection({
    host:'127.0.0.1',
    user:'root',
    password:'',
    database:'traindb',
    port:'3306'
});

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

const { WebSocketServer } = require("ws");
const wss = new WebSocketServer({ port: 443 });
console.log(`Socket Server Started & Listening`);

const addressUserMap = new Map();
var userCounter = 0;

wss.on('connection', function connection(ws, req) {
    ws.on('message', function message() {
        // Register user
        let ip = ipv4(req.socket.remoteAddress);
        addressUserMap.set(userCounter, ip);
        console.log(addressUserMap);
        userCounter++;
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
                        function(item, next) {
                            // Look for Train Movement messages (0003)
                        if (item.header && item.header.msg_type == "0003") {
                            //console.log("rep stanox: " + '"' + item.body.reporting_stanox + '"', "loc stanox: " + '"' + item.body.loc_stanox + '"');
                            // If train terminates there will be no destination stanox, check for train_terminated flag
                            if(item.body.train_terminated == 'false'){
                                // If reporting_stanox is 00000 (manual or off-route), use loc_stanox
                                if(item.body.reporting_stanox !== "" && item.body.reporting_stanox !== "00000" && item.body.reporting_stanox.length === 5){
                                    returnLocation(item.body.reporting_stanox, function(result){
                                        const fileObj = {
                                            "type": "Feature",
                                            "geometry": {
                                            "type": "Point",
                                            "coordinates": [result.Longitude, result.Latitude]
                                            },
                                            "properties": {
                                            "name": result.Name,
                                            "id": item.body.train_id,
                                            "offset": 0,
                                            "type": item.body.event_type
                                            },
                                        }
                                        returnOperator(item.body.division_code, function(result){
                                            fileObj.properties.operator = result.CompanyName;
                                        });
                                        returnLocation(item.body.next_report_stanox, function(result){
                                            fileObj.properties.nextStop = result.Name;
                                        });
                                        newPositions[count] = fileObj;
                                        count++;
                                    });
                                }
                                else if(item.body.loc_stanox !== "" && item.body.loc_stanox !== "00000" && item.body.loc_stanox.length === 5){
                                    returnLocation(item.body.loc_stanox, function(result){
                                        const fileObj = {
                                            "type": "Feature",
                                            "geometry": {
                                            "type": "Point",
                                            "coordinates": [result.Longitude, result.Latitude]
                                            },
                                            "properties": {
                                            "name": result.Name,
                                            "id": item.body.train_id,
                                            "offset": 0,
                                            "type": item.body.event_type
                                            },
                                        }
                                        returnOperator(item.body.division_code, function(result){
                                            fileObj.properties.operator = result.CompanyName;
                                        });
                                        returnLocation(item.body.next_report_stanox, function(result){
                                            fileObj.properties.nextStop = result.Name;
                                        });
                                        newPositions[count] = fileObj;
                                        count++;
                                    });
                                }
                            }
                            else{
                                if(item.body.reporting_stanox !== "" && item.body.reporting_stanox !== "00000" && item.body.reporting_stanox.length === 5){
                                    returnLocation(item.body.reporting_stanox, function(result){
                                        const fileObj = {
                                            "type": "Feature",
                                            "geometry": {
                                            "type": "Point",
                                            "coordinates": [result.Longitude, result.Latitude]
                                            },
                                            "properties": {
                                            "name": result.Name,
                                            "id": item.body.train_id,
                                            "offset": 0,
                                            "type": item.body.event_type,
                                            "nextStop": "Terminated"
                                            },
                                        }
                                        returnOperator(item.body.division_code, function(result){
                                            fileObj.properties.operator = result.CompanyName;
                                        });
                                        newPositions[count] = fileObj;
                                        count++;
                                    });
                                }
                                else if(item.body.loc_stanox !== "" && item.body.loc_stanox !== "00000" && item.body.loc_stanox.length === 5){
                                    returnLocation(item.body.loc_stanox, function(result){
                                        const fileObj = {
                                            "type": "Feature",
                                            "geometry": {
                                            "type": "Point",
                                            "coordinates": [result.Longitude, result.Latitude]
                                            },
                                            "properties": {
                                            "name": result.Name,
                                            "id": item.body.train_id,
                                            "offset": 0,
                                            "type": item.body.event_type,
                                            "nextStop": "Terminated"
                                            },
                                        }
                                        returnOperator(item.body.division_code, function(result){
                                            fileObj.properties.operator = result.CompanyName;
                                        });
                                        newPositions[count] = fileObj;
                                        count++;
                                    });
                                }
                            }
                        }
                    next();
                    }
                );
            }
            // Call function to send locations to users every heartbeat
            replaceOffsetSend()
        });
    });
});

// This function both checks and changes label offsets as well as pushing new/updated entries to the current positions array from the new positions array
// TODO: Remove terminated items by ID after 3 or 4 subsequent heartbeats
function replaceByID(item){
    // Filter positions to get old/previous location for this train id
    filter = currPositions.filter(function(obj){
        return obj.properties.id === item.properties.id;
    });
    locationOrID = filter.map(item => item);
    const oldItem = locationOrID[0];
    // Offset Store is a Map object with station name as the key, array of train IDs at that station as the value
    if(item.properties.id !== "undefined"){
        if(oldItem != undefined){
            // Get array of stations using old entry
            if(offsetStore.has(oldItem.properties.name)){
                var IDs = offsetStore.get(oldItem.properties.name);
            }
            console.log("IDs before: ", IDs);
            // Remove old/last entry then add array back to Map
            if(IDs.includes(oldItem.properties.id)){
                const splicePos = IDs.indexOf(oldItem.properties.id);
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
                            return obj.properties.id === element;
                        });
                        const locationOrID = filter.map(item => item);
                        const currItem = locationOrID[0];
                        // Remove item with current offset
                        currPositions = currPositions.filter(function(obj){
                            return obj.properties.id !== currItem.properties.id;
                        });
                        // Work out new offset
                        if(IDs.indexOf(currItem.properties.id) == 0){
                            currItem.properties.offset = 25;
                        }
                        else if(IDs.indexOf(currItem.properties.id) > 0){
                            currItem.properties.offset = (25 + (IDs.indexOf(currItem.properties.id) * 15))
                        }
                        // Push back to current positions with correct offset
                        currPositions.push(currItem);
                    });
                }
            }
            console.log("IDs after: ", IDs);
            // Update offsetStore
            offsetStore.set(oldItem.properties.name, IDs);
        }
    }

    // Get array for new station
    if(offsetStore.has(item.properties.name)){
        var newLocIDs = offsetStore.get(item.properties.name);
    }

    if(Array.isArray(newLocIDs)){
        // Use indexOf to replace first available position for new location
        // If no index is available, push new entry to array
        if(newLocIDs.indexOf("") != -1){
            newLocIDs.splice(newLocIDs.indexOf(""), 1, item.properties.id);
        }
        else{
            newLocIDs.push(item.properties.id);
        }
        // Use the indexOf result to set the offset 0 = 25, 1 = 40, 2 = 55, etc.
        if(newLocIDs.indexOf(item.properties.id) == 0){
            item.properties.offset = 25;
        }
        else if(newLocIDs.indexOf(item.properties.id) > 0){
            item.properties.offset = (25 + (newLocIDs.indexOf(item.properties.id) * 15))
        }
    }

    // Create Map entry for station if none exists, add this id as the first entry and set offset to 25
    if(!offsetStore.has(item.properties.name)){
        const newID = [item.properties.id];
        offsetStore.set(item.properties.name, newID)
        item.properties.offset = 25;
    }

    // Add new entry to current train positions
    currPositions = currPositions.filter(function(obj){
        return obj.properties.id !== item.properties.id;
    });

    currPositions.push(item);
}

function replaceOffsetSend(){
    if(newPositions != []){
        newPositions.forEach(replaceByID);
        count = 0;
        if(currPositions != []){
            wss.clients.forEach(function each(client){
                client.send(JSON.stringify(currPositions));
            });
        }
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function returnLocation(stanox, callback){
    var query = 'SELECT Name, Latitude, Longitude FROM stanox_tiploc_locations WHERE Stanox = ' + stanox;
    connection.query(query, function(error, results, fields){
        if(error) throw error;
        return callback(results[0]);
    });
}

function returnOperator(secCode, callback){
    var query = 'SELECT CompanyName FROM toccodes WHERE SectorCode = ' + secCode;
    connection.query(query, function(error, results, fields){
        if(error) throw error;
        return callback(results[0]);
    });
}