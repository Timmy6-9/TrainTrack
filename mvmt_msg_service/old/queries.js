// Remember to configure new sql server with proper authentication for actual service
var mysql = require('mysql');

const ws = new WebSocket('ws://192.168.0.220:443/');

var connection = mysql.createConnection({
    host:'127.0.0.1',
    user:'root',
    password:'',
    database:'traindb',
    port:'3306'
});

function returnLocation(stanox, callback){

    var query = 'SELECT * FROM stanox_tiploc_locations WHERE Stanox=' + stanox;

    connection.connect();

    connection.query(query, function(error, results, fields){
        if(error) throw error;
        return callback(results[0]);
    });

    connection.end();
}