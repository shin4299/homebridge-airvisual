'use strict';

const firmware = require('./package.json').version;
const request = require('request');

var Service;
var Characteristic;

function AirVisualAccessory(log, config) {
  this.log = log;
  this.name = config.name;
  this.key = config.api_key;
  this.sensor = config.sensor || 'air_quality';
  this.standard = config.aqi_standard || 'us';
  this.latitude = config.latitude;
  this.longitude = config.longitude;
  this.city = config.city;
  this.state = config.state;
  this.country = config.country;
  this.polling = config.polling || false;

  if (!this.key) {
    throw new Error('API key not specified');
  }
  if (!(['air_quality', 'humidity', 'temperature'].indexOf(this.sensor) > -1)) {
    this.log.error('Unsupported sensor specified, defaulting to air quality');
    this.sensor = 'air_quality';
  }
  if (!(['cn', 'us'].indexOf(this.standard) > -1)) {
    this.log.error('Unsupported air quality standard specified, defaulting to US');
    this.standard = 'us';
  }
  if ([this.latitude, this.longitude].indexOf(undefined) > -1) {
    if (this.latitude || this.longitude) {
      this.log.error('Incomplete GPS coordinates specified, defaulting to IP geolocation');
      this.latitude = undefined;
      this.longitude = undefined;
    }
  }
  if ([this.city, this.state, this.country].indexOf(undefined) > -1) {
    if (this.city || this.state || this.country) {
      this.log.error('Incomplete city specified, defaulting to IP geolocation');
      this.city = undefined;
      this.state = undefined;
      this.country = undefined;
    }
  }
  if (!([true, false].indexOf(this.polling) > -1)) {
    this.log.error('Unsupported option specified for polling, defaulting to false');
    this.polling = false;
  }

  if (this.latitude && this.longitude) {
    this.log.debug('Using GPS coordinates');
    this.mode = 'gps';
    this.serial = String(this.latitude.toFixed(3) + ', ' + this.longitude.toFixed(3));
  } else if (this.city && this.state && this.country) {
    this.log.debug('Using specified city');
    this.mode = 'city';
    this.serial = String(this.city + ', ' + this.state + ', ' + this.country);
  } else {
    this.log.debug('Using IP geolocation');
    this.mode = 'ip';
    this.serial = 'IP Geolocation';
  }

  if (this.polling) {
    var that = this;
    this.interval = 10 * 60000;
    setTimeout(function () {
      that.servicePolling();
    }, this.interval);
  }

  this.log.debug('Polling is %s', (this.polling) ? 'enabled' : 'disabled');

  this.conditions = {};
}

AirVisualAccessory.prototype = {

  servicePolling: function () {
    this.log.debug('Polling');
    this.getData(function (conditions) {
      var that = this;
      switch (that.sensor) {
        case 'humidity':
          that.sensorService.setCharacteristic(
            Characteristic.CurrentRelativeHumidity,
            conditions.humidity
          );
          break;
        case 'temperature':
          that.sensorService.setCharacteristic(
            Characteristic.CurrentTemperature,
            conditions.temperature
          );
          break;
        case 'air_quality':
        default:
          that.sensorService.setCharacteristic(
            Characteristic.AirQuality,
            conditions.air_quality
          );
          break;
      }
      setTimeout(function () {
        that.servicePolling();
      }, that.interval);
    }.bind(this));
  },

  getAirQuality: function (callback) {
    this.getData(function (conditions) {
      callback(null, conditions.air_quality);
    });
  },

 getPM25: function (callback) {
    this.getData(function (conditions) {
      callback(null, conditions.aqi);
    });
  },
  
  getHumidity: function (callback) {
    this.getData(function (conditions) {
      callback(null, conditions.humidity);
    });
  },

  getTemperature: function (callback) {
    this.getData(function (conditions) {
      callback(null, conditions.temperature);
    });
  },

  getData: function (callback) {
    var that = this;
    var url;

    switch (that.mode) {
      case 'gps':
        url = 'https://api.airvisual.com/v2/nearest_city?lat=' + that.latitude + '&lon=' + that.longitude + '&key=' + that.key;
        break;
      case 'city':
        url = 'https://api.airvisual.com/v2/city?city=' + that.city + '&state=' + that.state + '&country=' + that.country + '&key=' + that.key;
        break;
      case 'ip':
      default:
        url = 'https://api.airvisual.com/v2/nearest_city?key=' + that.key;
        break;
    }

    request({
      url: url,
      json: true
    }, function (error, response, data) {
      if (!error) {
        switch (response.statusCode) {
          case 200:
            switch (data.status) {
              case 'success':
                that.log.debug('City is: %s', data.data.city);
                that.log.debug('State is: %s', data.data.state);
                that.log.debug('Country is: %s', data.data.country);
                that.log.debug('Latitude is: %s', data.data.location.coordinates[0]);
                that.log.debug('Longitude is: %s', data.data.location.coordinates[1]);

                that.conditions.aqi = parseFloat(that.standard === 'us' ? data.data.current.pollution.aqius : data.data.current.pollution.aqicn);
                that.conditions.humidity = parseFloat(data.data.current.weather.hu);
                that.conditions.temperature = parseFloat(data.data.current.weather.tp);

                switch (that.sensor) {
                  case 'humidity':
                    that.log.debug('Current humidity is: %s%', that.conditions.humidity);
                    break;
                  case 'temperature':
                    that.log.debug('Current temperature is: %s°C (%s°F)', that.conditions.temperature, that.convertTemperature(that.conditions.temperature));
                    break;
                  case 'air_quality':
                  default:
                    that.log.debug('Current air quality index is: %s', that.conditions.aqi);
                    break;
                }

                that.conditions.air_quality = that.convertAQI(that.conditions.aqi);

                that.sensorService.getCharacteristic(Characteristic.StatusActive).setValue(true);
                break;
              case 'call_limit_reached':
                that.log.error('Call limit reached');
                break;
              case 'api_key_expired':
                that.log.error('API key expired');
                break;
              case 'incorrect_api_key':
                that.log.error('Incorrect API key');
                break;
              case 'ip_location_failed':
                that.log.error('IP location failed');
                break;
              case 'no_nearest_station':
                that.log.error('No nearest station');
                break;
              case 'feature_not_available':
                that.log.error('Feature not available');
                break;
              case 'too_many_requests':
                that.log.error('Too many requests');
                break;
              default:
                that.log.error('Unknown status: %s', data.status);
                break;
            }
            break;
          default:
            that.log.error('Response: %s', response.statusCode);
            that.sensorService.getCharacteristic(Characteristic.StatusActive).setValue(false);
            break;
        }
      } else {
        that.log.error('Unknown error');
        that.sensorService.getCharacteristic(Characteristic.StatusActive).setValue(false);
      }
      callback(that.conditions);
    });
  },

  convertAQI: function (aqi) {
    var characteristic;
    if (!aqi) {
      characteristic = Characteristic.AirQuality.UNKNOWN;
    } else if (aqi >= 201) {
      characteristic = Characteristic.AirQuality.POOR;
    } else if (aqi >= 151) {
      characteristic = Characteristic.AirQuality.INFERIOR;
    } else if (aqi >= 101) {
      characteristic = Characteristic.AirQuality.FAIR;
    } else if (aqi >= 51) {
      characteristic = Characteristic.AirQuality.GOOD;
    } else if (aqi >= 0) {
      characteristic = Characteristic.AirQuality.EXCELLENT;
    } else {
      characteristic = Characteristic.AirQuality.UNKNOWN;
    }
    return characteristic;
  },

  convertTemperature: function (temperature) {
    return (temperature * 1.8) + 32;
  },

  identify: function (callback) {
    this.log.debug('Identified');
    callback();
  },

  getServices: function () {
    var services = [];

    this.accessoryInformationService = new Service.AccessoryInformation();

    this.accessoryInformationService
      .setCharacteristic(Characteristic.FirmwareRevision, firmware)
      .setCharacteristic(Characteristic.Manufacturer, 'AirVisual')
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.SerialNumber, this.serial);

    this.accessoryInformationService
      .setCharacteristic(Characteristic.Identify)
      .on('set', this.identify.bind(this));

    switch (this.sensor) {
      case 'humidity':
        this.model = 'Humidity Sensor';
        this.sensorService = new Service.HumiditySensor();
        this.sensorService
          .getCharacteristic(Characteristic.CurrentRelativeHumidity)
          .on('get', this.getHumidity.bind(this));
        break;
      case 'temperature':
        this.model = 'Temperature Sensor';
        this.sensorService = new Service.TemperatureSensor();
        this.sensorService
          .getCharacteristic(Characteristic.CurrentTemperature)
          .on('get', this.getTemperature.bind(this));
        break;
      case 'air_quality':
      default:
        this.model = 'Air Quality Sensor';
        this.sensorService = new Service.AirQualitySensor();
        this.sensorService
          .getCharacteristic(Characteristic.AirQuality)
          .on('get', this.getAirQuality.bind(this));
        this.sensorService
          .getCharacteristic(Characteristic.PM2_5Density)
          .on('get', this.getPM25.bind(this));
        break;
    }

    this.accessoryInformationService
      .setCharacteristic(Characteristic.Model, this.model);

    this.sensorService
      .setCharacteristic(Characteristic.Name, this.name);

    this.sensorService.addCharacteristic(Characteristic.StatusActive);

    services.push(
      this.accessoryInformationService,
      this.sensorService
    );

    return services;
  }
};

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory('homebridge-airvisual', 'AirVisual', AirVisualAccessory);
};
