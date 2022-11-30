// Security Token
// 75083e36-7f77-4ade-99db-5ca132887e22
// EK is the business code for overground London lines, the only movement feed I'm subscribed to at the moment

// Current JSON info needs to be saved to an array or object so it can be sent to any new clients connecting
// Remember to configure new sql server with proper authentication for actual service

// In the final version, this should send a binary string of JSON data which the client can then put into a file to be read by openlayers
// const currPositions = [];

var mysql = require('mysql');
var stompit = require("stompit");
var async = require("async");

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

// Connect options with standard headers
var connectOptions = {
    "host": "datafeeds.networkrail.co.uk",
    "port": 61618,
    "connectHeaders": {
        "client-id": "",            // request a durable subscription - set this to the login name you use to subscribe
        "host": "/",
        "login": "tmoater@googlemail.com",
        "passcode": "8YPKfzBWZf4HJyk@",
        "heart-beat": "10000,10000"
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
                            // If train terminates there will be no destination stanox, check for train_terminated flag
                            if(item.body.train_terminated == 'false'){
                                // If reporting_stanox is 00000 (manual or off-route), use loc_stanox
                                if(item.body.reporting_stanox != '00000'){
                                    returnLocation(item.body.reporting_stanox, function(result){
                                        const msgObj = {id: item.body.train_id, name: result.Name, lat: result.Latitude, long: result.Longitude, type: item.body.event_type, msgType: 'Current', offset: 25}
                                        wss.clients.forEach(function each(client){
                                            client.send(JSON.stringify(msgObj));
                                        });
                                    });
                                    /*
                                    returnLocation(item.body.next_report_stanox, function(result){
                                        const msgObj = {id: item.body.train_id, name: result.Name, lat: result.Latitude, long: result.Longitude, msgType: 'Next'}
                                        wss.clients.forEach(function each(client){
                                            client.send(JSON.stringify(msgObj));
                                       });
                                    });
                                    */
                                }
                                else{
                                    returnLocation(item.body.loc_stanox, function(result){
                                        const msgObj = {id: item.body.train_id, name: result.Name, lat: result.Latitude, long: result.Longitude, type: item.body.event_type, msgType: 'Current', offset: 25}
                                        wss.clients.forEach(function each(client){
                                            client.send(JSON.stringify(msgObj));
                                        });
                                    });
                                    /*
                                    returnLocation(item.body.next_report_stanox, function(result){
                                        const msgObj = {id: item.body.train_id, name: result.Name, lat: result.Latitude, long: result.Longitude, msgType: 'Next'}
                                        wss.clients.forEach(function each(client){
                                            client.send(JSON.stringify(msgObj));
                                        });
                                    });
                                    */
                                }
                            }
                            else{
                                if(item.body.reporting_stanox != '00000'){
                                    returnLocation(item.body.reporting_stanox, function(result){
                                        const msgObj = {id: item.body.train_id, name: result.Name, lat: result.Latitude, long: result.Longitude, type: item.body.event_type, terminated: item.body.train_terminated, msgType: 'Current', offset: 25}
                                        wss.clients.forEach(function each(client){
                                            client.send(JSON.stringify(msgObj));
                                        });
                                    });
                                }
                                else{
                                    returnLocation(item.body.loc_stanox, function(result){
                                        const msgObj = {id: item.body.train_id, name: result.Name, lat: result.Latitude, long: result.Longitude, type: item.body.event_type, terminated: item.body.train_terminated, msgType: 'Current', offset: 25}
                                        wss.clients.forEach(function each(client){
                                            client.send(JSON.stringify(msgObj));
                                        });
                                        });
                                    }
                            }
                        }
                        next();
                        }
                    );
                }
                //client.ack(message); // Send ACK frame to server
            });
        });
    });
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Remember to configure new sql server with proper authentication for actual service

var connection = mysql.createConnection({
    host:'127.0.0.1',
    user:'root',
    password:'',
    database:'traindb',
    port:'3306'
});

function returnLocation(stanox, callback){

    var query = 'SELECT Name, Latitude, Longitude FROM stanox_tiploc_locations WHERE Stanox=' + stanox;

    connection.query(query, function(error, results, fields){
        if(error) throw error;
        return callback(results[0]);
    });
}