Current Features:
- Tracks Arrival and Departure messages for all trains run by London Overground on a map
- Any cancelled or terminated trains are no longer tracked
- Clicking on a train shows some basic details and sends a request to the server, the server returns all scheduled trains going through that station for the rest of the day, which the client then logs in the console

TO-DO:

Front end:
- Schedule button in popup that sends the request for formatted schedule data
- Cancellation ticker with cancelled train details
- Add filter for different train operators once more data feeds are added
- Expand Filtering from this point

Back end:
- Add rollup/vite script to movement service package.json once finished with majority of backend
- Clean up movement service as much as possible
- Subscribe to more data feeds from network rail once service is streamlined and can handle more points

Both:
- Stress Test