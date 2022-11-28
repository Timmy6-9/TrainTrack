// Security Token
// 75083e36-7f77-4ade-99db-5ca132887e22
// EK is the business code for overground London lines, the only movement feed I'm subscribed to at the moment

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

var stompit = require("stompit");
var async = require("async");

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
                            console.log(item);
                            if(item.body.reporting_stanox != '00000'){
                                msgObj = {id: item.body.train_id, currentStanox: item.body.reporting_stanox, destinationStanox: item.body.next_report_stanox};
                                console.log(msgObj);
                            }
                            else{
                                msgObj = {id: item.body.train_id, currentStanox: item.body.loc_stanox, destinationStanox: item.body.next_report_stanox};
                                console.log(msgObj);
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