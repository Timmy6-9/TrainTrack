#!/bin/bash
read -p "Enter Network Rail Datafeed registered email address: " email
read -p "Enter Password for Network Rail Datafeed account: " password
curl -L -u ${email}":"${password} -o dailyCollection.gz 'https://datafeeds.networkrail.co.uk/ntrod/CifFileAuthenticate?type=CIF_ALL_FULL_DAILY&day=toc-full'
gzip -d dailyCollection.gz
sudo systemctl restart mongod
mongoimport --type csv --file /home/tom/Tiploc_Stanox_Locations.csv --headerline
mongoimport --type csv --file /home/tom/ActiveStations.csv --headerline
mongoimport --type json --file /home/tom/dailyCollection
rm /home/tom/dailyCollection
# Get rid of all surplus lines
mongosh --quiet --eval 'db["dailyCollection"].updateMany({},{$unset:{
"JsonScheduleV1.CIF_train_uid": "",
"JsonScheduleV1.transaction_type": "",
"JsonScheduleV1.CIF_bank_holiday_running": "",
"JsonScheduleV1.CIF_stp_indicator": "",
"JsonScheduleV1.applicable_timetable": "",
"JsonScheduleV1.schedule_segment.CIF_train_category": "",
"JsonScheduleV1.schedule_segment.CIF_headcode": "",
"JsonScheduleV1.schedule_segment.CIF_course_indicator":"",
"JsonScheduleV1.schedule_segment.CIF_business_sector": "",
"JsonScheduleV1.schedule_segment.CIF_power_type": "",
"JsonScheduleV1.schedule_segment.CIF_timing_load": "",
"JsonScheduleV1.schedule_segment.CIF_operating_characteristics": "",
"JsonScheduleV1.schedule_segment.CIF_speed": "",
"JsonScheduleV1.schedule_segment.CIF_train_class": "",
"JsonScheduleV1.schedule_segment.CIF_sleepers": "",
"JsonScheduleV1.schedule_segment.CIF_reservations": "",
"JsonScheduleV1.schedule_segment.CIF_connection_indicator": "",
"JsonScheduleV1.schedule_segment.CIF_catering_code": "",
"JsonScheduleV1.schedule_segment.CIF_service_branding": "",
"JsonScheduleV1.new_schedule_segment": "",
"JsonScheduleV1.schedule_segment.schedule_location.engineering_allowance": "",
"JsonScheduleV1.schedule_segment.schedule_location.pathing_allowance": "",
"JsonScheduleV1.schedule_segment.schedule_location.performance_allowance": "",
"JsonScheduleV1.schedule_segment.schedule_location.location_type": ""}})'
# Delete all entries that aren't schedules
mongosh --quiet --eval 'db["dailyCollection"].deleteMany({"JsonScheduleV1": {$exists: false}})'
# Delete any freight or permanent bus schedules
mongosh --quiet --eval 'db["dailyCollection"].deleteMany({$or: [{"JsonScheduleV1.train_status": "F"}, {"JsonScheduleV1.train_status": "2"}, {"JsonScheduleV1.train_status": "B"}]})'
# Pull any schedule_location entries that pass the station
mongosh --quiet --eval 'db["dailyCollection"].updateMany({},{ $pull: { "JsonScheduleV1.schedule_segment.schedule_location": { pass: {$ne: null}}}})'
# Pull any array entries that have no public arrival or departure										
mongosh --quiet --eval 'db["dailyCollection"].updateMany({},{ $pull: { "JsonScheduleV1.schedule_segment.schedule_location": { $and: [ {"public_arrival": {$eq: null}}, {"public_departure": {$eq: null}} ] }}})'
# Delete any schedules that don't include a list of locations
mongosh --quiet --eval 'db["dailyCollection"].deleteMany({"JsonScheduleV1.schedule_segment.schedule_location": {$exists: false}})'
# Index Tiploc Codes
mongosh --quiet --eval 'db["dailyCollection"].createIndex({"JsonScheduleV1.schedule_segment.schedule_location.tiploc_code": "text"})'
sudo systemctl status mongod
