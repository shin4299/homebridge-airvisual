"use strict";

var request = require("request");
var Service, Characteristic;

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-airvisual", "AirVisual", AirVisualAccessory);
}

function AirVisualAccessory(log, config) {
  this.log = log;
  this.name = config["name"];

  this.key = config["api_key"];
  this.standard = config["aqi_standard"] || "us";
  this.latitude = config["latitude"];
  this.longitude = config["longitude"];
  this.radius = config["radius"] || 1000;
  this.city = config["city"];
  this.state = config["state"];
  this.country = config["country"];
  this.polling = config["polling"] || false;


/*
  this.zip = config["zipcode"];
  this.distance = config["distance"] || "25";
  this.airnow_api = config["airnow_api"];
  this.aqicn_api = config["aqicn_api"];
  this.aqicn_city = config["aqicn_city"] || "here";
  this.mpolling = config["polling"] || "off";
  this.polling = this.mpolling;
  this.serial = config["serial"];


  if (this.provider != "airnow" && this.provider != "aqicn") {
    throw new Error("Invalid provider specified");
  }
  if (this.provider == "airnow" && !this.zip) {
    throw new Error("A config value for 'zipcode' is required if using AirNow for provider");
  }
  if (this.provider == "airnow" && !this.airnow_api) {
    throw new Error("A config value for 'airnow_api' is required if using AirNow for provider");
  }
  if (this.provider == "aqicn" && !this.aqicn_api) {
    throw new Error("A config value for 'aqicn_api' is required if using AQICN for provider");
  }
*/

  if (this.polling) {
    var that = this;
    this.interval = 5 * 60000;
    setTimeout(function () {
      that.servicePolling();
    }, this.interval);
  };

  this.log.debug("Polling is %s", (this.polling) ? "enabled" : "disabled");

  this.noFault = Characteristic.StatusFault.NO_FAULT; // 0
  this.generalFault = Characteristic.StatusFault.GENERAL_FAULT; // 1
}

AirVisualAccessory.prototype = {

  servicePolling: function () {
    this.log.debug("Polling");
    this.getData(function (aqi) {
      var that = this;
      that.airQualitySensorService.setCharacteristic(Characteristic.AirQuality, aqi);
      setTimeout(function () {
        that.servicePolling();
      }, that.interval);
    }.bind(this));
  },

  getAirQuality: function (callback) {
    this.getData(function (aqi) {
      callback(null, aqi);
    });
  },

  getData: function (callback) {
    var that = this;
    var url, aqi;

    aqi = 0;
    
    if (this.latitude && this.longitude) {
      url = "https://api.airvisual.com/v2/nearest_city?lat=" + this.latitude + "&lon=" + this.longitude + "&key=" + this.key;
      that.log.debug("Using GPS coordinates");
    }
    else if (this.city && this.state && this.country) {
      url = "https://api.airvisual.com/v2/city?city=" + this.city + "&state=" + this.state + "&country=" + this.country + "&key=" + this.key;
      that.log.debug("Using city, state, and country");
    }
    else {
      url = "https://api.airvisual.com/v2/nearest_city?key=" + this.key;
      that.log.debug("Using IP geolocation");
    }

    request({
      url: url,
      json: true
    }, function (err, response, data) {
      if (!err && response.statusCode === 200) {
        switch (data.status) {
          case "success":
            that.log.debug("Success");
            aqi = parseFloat("data.current.pollution.aqi" + this.standard);
            that.log.debug("Air quality index is: %s", aqi);

            //that.airQualitySensorService.setCharacteristic(Characteristic.StatusActive, true);
            //that.log.debug("Active status is: true");

            //that.airQualitySensorService.setCharacteristic(Characteristic.StatusFault, this.noFault);
            //that.log.debug("Fault status is: no fault");

            break:
          case "call_limit_reached":
            that.log.debug("Call limit reached");
            break:
          case "api_key_expired":
            that.log.debug("API key expired");
            break:
          case "incorrect_api_key":
            that.log.debug("Incorrect API key");
            break:
          case "ip_location_failed":
            that.log.debug("IP location failed");
            break:
          case "no_nearest_station":
            that.log.debug("No nearest station");
            break:
          case "feature_not_available":
            that.log.debug("Feature not available");
            break:
          case "too_many_requests":
            that.log.debug("Too many requests");
            break:
          default:
            that.log.debug("Unknown status");
            break:
        }
      }
      else {
        that.log.error("Unknown error");

        //that.airQualitySensorService.setCharacteristic(Characteristic.StatusActive, fault);
        //that.log.debug("Active status is: false");

        //that.airQualitySensorService.setCharacteristic(Characteristic.StatusFault, this.generalFault);
        //that.log.debug("Fault status is: general fault");
      }
      callback(that.convertAQI(aqi));
    });

/*
    if (this.provider == "airnow") {
      url = "http://www.airnowapi.org/aq/observation/zipCode/current/?format=application/json&zipCode=" + this.zip +
      "&distance=" + this.distance + "&API_KEY=" + this.airnow_api;

      request({
        url: url,
        json: true
      }, function (err, response, observations) {
        if (!err && response.statusCode === 200){
          if (typeof observations[0] === "undefined"){
            that.log.error("Configuration error: Invalid zip code for %s", that.providerProper);

            that.airQualitySensorService.setCharacteristic(Characteristic.StatusActive, false);
            that.log.debug("Active status is: false");

            that.airQualitySensorService.setCharacteristic(Characteristic.StatusFault, this.generalFault);
            that.log.debug("Fault status is: general fault");
          }
          else if (typeof observations[0]["AQI"] === "undefined") {
            that.log.error("Observation error: %s for %s", striptags(observations), that.providerProper);
 
            that.airQualitySensorService.setCharacteristic(Characteristic.StatusActive, false);
            that.log.debug("Active status is: false");
 
            that.airQualitySensorService.setCharacteristic(Characteristic.StatusFault, this.generalFault);
            that.log.debug("Fault status is: general fault");
          }
          else {
            for (var key in observations) {
              switch (observations[key]["ParameterName"]) {
                case "O3":
                  var o3 = parseFloat(observations[key]["AQI"]);
                  that.airQualitySensorService.setCharacteristic(Characteristic.OzoneDensity, o3);
                  that.log.debug("Ozone density is: %s", o3);
                  break;
                case "PM2.5":
                  var pm25 = parseFloat(observations[key]["AQI"]);
                  that.airQualitySensorService.setCharacteristic(Characteristic.PM2_5Density, pm25);
                  that.log.debug("Ozone density is: %s", pm25);
                  break;
                case "PM10":
                  var pm10 = parseFloat(observations[key]["AQI"]);
                  that.airQualitySensorService.setCharacteristic(Characteristic.PM10Density, pm10);
                  that.log.debug("Ozone density is: %s", pm10);
                  break;
              }
              aqi = Math.max(aqi,parseFloat(observations[key]["AQI"]))
            }
            that.log.debug("Air quality index is: %s", aqi.toString());

            that.airQualitySensorService.setCharacteristic(Characteristic.StatusActive, true);
            that.log.debug("Active status is: true");

            that.airQualitySensorService.setCharacteristic(Characteristic.StatusFault, this.noFault);
            that.log.debug("Fault status is: no fault");
          }
        }
        else {
          that.log.error("Unknown error from %s", that.providerProper);

          that.airQualitySensorService.setCharacteristic(Characteristic.StatusActive, false);
          that.log.debug("Active status is: false");

          that.airQualitySensorService.setCharacteristic(Characteristic.StatusFault, this.generalFault);
          that.log.debug("Fault status is: general fault");
        }
        callback(that.convertAQI(aqi));
      });
    }
    else if (this.provider == "aqicn") {
      url = "http://api.waqi.info/feed/" + this.aqicn_city + "/?token=" + this.aqicn_api;

      request({
        url: url,
        json: true
      }, function (err, response, observations) {
        if (!err && response.statusCode === 200 && observations.status == "ok" && observations.data.idx != "-1"){
          aqi = parseFloat(observations.data.aqi);
          that.log.debug("Air quality index is: %s", observations.data.aqi);

          that.airQualitySensorService.setCharacteristic(Characteristic.StatusActive, true);
          that.log.debug("Active status is: true");

          that.airQualitySensorService.setCharacteristic(Characteristic.StatusFault, this.noFault);
          that.log.debug("Fault status is: no fault");

          
          if (observations.data.iaqi.hasOwnProperty("o3")) {
            var o3 = parseFloat(observations.data.iaqi.o3.v);
            that.airQualitySensorService.setCharacteristic(Characteristic.OzoneDensity, o3);
            that.log.debug("Ozone density is: %s", o3);
          }
          else {
            that.airQualitySensorService.removeCharacteristic(Characteristic.OzoneDensity);
          }

          if (observations.data.iaqi.hasOwnProperty("no2")) {
            var no2 = parseFloat(observations.data.iaqi.no2.v);
            that.airQualitySensorService.setCharacteristic(Characteristic.NitrogenDioxideDensity, no2);
            that.log.debug("Nitrogen dioxide density is: %s", no2);
          }
          else {
            that.airQualitySensorService.removeCharacteristic(Characteristic.NitrogenDioxideDensity);
          }

          if (observations.data.iaqi.hasOwnProperty("so2")) {
            var so2 = parseFloat(observations.data.iaqi.so2.v);
            that.airQualitySensorService.setCharacteristic(Characteristic.SulphurDioxideDensity, so2);
            that.log.debug("Sulphur dioxide density is: %s", so2);
          }
          else {
            that.airQualitySensorService.removeCharacteristic(Characteristic.SulphurDioxideDensity);
          }

          if (observations.data.iaqi.hasOwnProperty("pm25")) {
            var pm25 = parseFloat(observations.data.iaqi.pm25.v);
            that.airQualitySensorService.setCharacteristic(Characteristic.PM2_5Density, pm25);
            that.log.debug("PM2.5 density is: %s", pm25);
          }
          else {
            that.airQualitySensorService.removeCharacteristic(Characteristic.PM2_5Density);
          }

          if (observations.data.iaqi.hasOwnProperty("pm10")) {
            var pm10 = parseFloat(observations.data.iaqi.pm10.v);
            that.airQualitySensorService.setCharacteristic(Characteristic.PM10Density, pm10);
            that.log.debug("PM10 density is: %s", pm10);
          }
          else {
            that.airQualitySensorService.removeCharacteristic(Characteristic.PM10Density);
          }

          if (observations.data.iaqi.hasOwnProperty("co")) {
            var co = parseFloat(observations.data.iaqi.co.v);
            that.airQualitySensorService.setCharacteristic(Characteristic.CarbonMonoxideLevel, co);
            that.log.debug("Carbon monoxide level is: %s", co);
          }
          else {
            that.airQualitySensorService.removeCharacteristic(Characteristic.CarbonMonoxideLevel);
          }

        }
        else if (!err && observations.status == "error") {
          that.log.error("Observation error: %s from %s", observations.data, that.providerProper);
        }
        else if (!err && observations.status == "ok" && observations.data.idx == "-1") {
          that.log.error("Configuration error: Invalid city code from %s", that.providerProper);
        }
        else {
          that.log.error("Unknown error from %s", that.providerProper);

          that.airQualitySensorService.setCharacteristic(Characteristic.StatusActive, false);
          that.log.debug("Active status is: false");

          that.airQualitySensorService.setCharacteristic(Characteristic.StatusFault, this.generalFault);
          that.log.debug("Fault status is: general fault");
        }
        callback(that.convertAQI(aqi));
      });
    }
*/
  },

  convertAQI: function (aqi) {
    if (!aqi) {
      return Characteristic.AirQuality.UNKNOWN;
    }
    else if (aqi >= 201) {
      return Characteristic.AirQuality.POOR;
    }
    else if (aqi >= 151) {
      return Characteristic.AirQuality.INFERIOR;
    }
    else if (aqi >= 101) {
      return Characteristic.AirQuality.FAIR;
    }
    else if (aqi >= 51) {
      return Characteristic.AirQuality.GOOD;
    }
    else if (aqi >= 0) {
      return Characteristic.AirQuality.EXCELLENT;
    }
    else {
      return Characteristic.AirQuality.UNKNOWN;
    }
  },

  identify: function (callback) {
    this.log.debug("Identified");
    callback();
  },

  getServices: function () {
    var services = []
    var accessoryInformationService = new Service.AccessoryInformation();

    accessoryInformationService
      .setCharacteristic(Characteristic.FirmwareRevision, require('./package.json').version || "Unknown")
      .setCharacteristic(Characteristic.Manufacturer, "AirNow")
      .setCharacteristic(Characteristic.Model, "Air Quality Sensor")
      .setCharacteristic(Characteristic.SerialNumber, "Unknown"));

    services.push(accessoryInformationService);

    this.airQualitySensorService = new Service.AirQualitySensor(this.name);

    this.airQualitySensorService
      .getCharacteristic(Characteristic.AirQuality)
      .on('get', this.getAirQuality.bind(this));

    //this.airQualitySensorService.addCharacteristic(Characteristic.StatusActive);
    //this.airQualitySensorService.addCharacteristic(Characteristic.StatusFault);

    services.push(this.airQualitySensorService);

    return services;
  }
};
