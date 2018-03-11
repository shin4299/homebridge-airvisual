# homebridge-airvisual
Homebridge plugin for AirVisual API

## Installation

1. Install homebridge using: `npm install -g homebridge`
2. Install this plugin using: `npm install -g homebridge-airvisual`
3. Register for an account and get an API key at https://www.airvisual.com/api
4. Update the Homebridge configuration file

## Configuration

Example config.json:

```js
"accessories": [
  {
    "accessory": "AirVisual",
    "name": "AirVisual",
    "api_key": "",
    "sensor": "air_quality",
    "aqi_standard": "us",
    "latitude": "",
    "longitude": "",
    "city": "",
    "state": "",
    "country": "",
    "polling": "false"
  }
],
```

## Details

Field | Required | Default | Description
:--- | :---: | :---: | :---
`accessory` | yes | `AirVisual` | Must always be `AirVisual`
`name` | yes | `AirVisual` | Can be specified by user
`api_key` | yes | | Obtain from https://www.airvisual.com/api
`sensor` | no | `air_quality` | Must be `air_quality`, `humidity`, or `temperature`
`aqi_standard` | no | `us` | Only applicable if `sensor` is set to `air_quality`, must be `cn` (for China) or `us` (for United States) 
`latitude` | no | | See **Location** notes below
`longitude` | no | | See **Location** notes below
`city` | no | | See **Location** notes below
`state` | no | | See **Location** notes below
`country` | no | | See **Location** notes below
`polling` | no | `false` | Must be `true` or `false`

## Location

By default, AirVisual will use IP geolocation to determine the nearest station to get data from (no configuration needed).

Alternatively, GPS coordinates or a specific city can be used.

* GPS coordinates can be found using https://www.latlong.net

* A specific city, state, and country can be found using https://www.airvisual.com/world

  * Browse to the desired city

  * Format will be shown as *City > State > Country*

* If both `latitude`, `longitude` and `city`, `state`, `country` are specified; the GPS coordinates will be used

## Miscellaneous

* Homebridge supports multiple instances for accessories; the configuration entry can be duplicated for each location and/or sensor type desired

* This plugin was developed for the "Community" (free) version of the AirVisual API; additional information is available from the "Startup" and "Enterprise" (paid) versions. Support for that additional information is planned but not yet implemented.
