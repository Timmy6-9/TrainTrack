Current Features:

Client Side/Frontend:
- Shows locations of any stations with an active schedule for the rest of the day from the point at which it was restarted | Currently works with ~2400 stations, may need to change/add some manually
- Clicking the schedule button for a location will bring up a list of destinations, when one is clicked it will show a list of train times from the origin location to the the selected destination (Currently in console)

Server Side/Backend:
- Collates relevant data from train movement messages into an array and sends the array to client via websocket connection every heartbeat (currently 15 seconds)
- Handles cancellations and terminations, sends cancellations to client (Cancellations will be displayed on a ticker at the bottom of the screen)
- Collects schedule information for a chosen location on request from clients using current time/date combined with a tiploc code and sends all available data for ordering/formatting
- Uses MySQL and MongoDB to return information about locations and schedules (Current plan is to move to just MongoDB as it's much faster and a relational database isn't needed)

Planned features:
- Ability to select 2 stations on the map and get schedule, stops etc. between the 2
- Actual arrival time estimates using message data
- Ability to get a schedule from any location to another (within the realms of possibility), with stops and changes shown
- Highlighting of both origin and destination stations on the map with little start and finish tags, with change/stop tags for train changes
- Filtering displayed stations by train operator
- Use of geolocation API to suggest a station to use
- All UK passenger services to be displayed rather than just the London Overground feed
- Automate schedule updating as much as possible and implement automatic nightly (~4am) server restarts
