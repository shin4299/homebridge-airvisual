'use strict';

const firmware = require('./package.json').version;
const fs = require('fs');
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
  this.ppb = config.ppb_units;
  this.polling = config.polling || false;
  this.https = config.https || true;
  this.debug = config.debug_mode || false;

  if (!this.key) {
    throw new Error('API key not specified');
  }
  if (!(['air_quality', 'humidity', 'temperature'].indexOf(this.sensor) > -1)) {
    this.log.warn('Unsupported sensor specified, defaulting to air quality');
    this.sensor = 'air_quality';
  }
  if (!(['cn', 'us'].indexOf(this.standard) > -1)) {
    this.log.warn('Unsupported air quality standard specified, defaulting to US');
    this.standard = 'us';
  }
  if ([this.latitude, this.longitude].indexOf(undefined) > -1) {
    if (this.latitude || this.longitude) {
      this.log.warn('Incomplete GPS coordinates specified, defaulting to IP geolocation');
      this.latitude = undefined;
      this.longitude = undefined;
    }
  }
  if ([this.city, this.state, this.country].indexOf(undefined) > -1) {
    if (this.city || this.state || this.country) {
      this.log.warn('Incomplete city specified, defaulting to IP geolocation');
      this.city = undefined;
      this.state = undefined;
      this.country = undefined;
    }
  }
  if (this.ppb) {
    for (var index = 0; index < this.ppb.length; index += 1) {
      if (!(['no2', 'o3', 'so2'].indexOf(this.ppb[index]) > -1)) {
        this.log.warn('Unsupported option specified for PPB units, units will not be converted: %s', this.ppb[index]);
      } else {
        this.log.debug('The following pollutant will be converted from ppb to µg/m3: %s', this.ppb[index]);
      }
    }
  }
  if (!([true, false].indexOf(this.polling) > -1)) {
    this.log.warn('Unsupported option specified for polling, defaulting to false');
    this.polling = false;
  }
  if (!([true, false].indexOf(this.https) > -1)) {
    this.log.warn('Unsupported option specified for HTTPS, defaulting to true');
    this.polling = true;
  }
  if (!([true, false].indexOf(this.debug) > -1)) {
    this.log.warn('Unsupported option specified for debug, defaulting to false');
    this.debug = false;
  }

  if (this.latitude && this.longitude) {
    this.log.debug('Using specified GPS coordinates: %s°, %s°', this.latitude, this.longitude);
    this.mode = 'gps';
    this.serial = String(this.latitude.toFixed(3) + '°, ' + this.longitude.toFixed(3) + '°');
  } else if (this.city && this.state && this.country) {
    this.log.debug('Using specified city: %s, %s, %s', this.city, this.state, this.country);
    this.mode = 'city';
    this.serial = String(this.city + ', ' + this.state + ', ' + this.country);
  } else {
    this.log.debug('Using IP geolocation');
    this.mode = 'ip';
    this.serial = 'IP Geolocation';
  }

  if (this.polling) {
    var that = this;
    this.interval = 60 * 60000;
    setTimeout(function () {
      that.servicePolling();
    }, this.interval);
  }

  this.log.debug('Polling is %s', (this.polling) ? 'enabled' : 'disabled');
  this.log.debug('HTTPS is %s', (this.https) ? 'enabled' : 'disabled');
  this.log.debug('Debug mode is %s', (this.debug) ? 'enabled' : 'disabled');

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

    var prefix = that.https === true ? 'https' : 'http';
    var url;
    switch (that.mode) {
      case 'city':
        url = prefix + '://api.airvisual.com/v2/city?city=' + that.city + '&state=' + that.state + '&country=' + that.country + '&key=' + that.key;
        break;
      case 'gps':
        url = prefix + '://api.airvisual.com/v2/nearest_city?lat=' + that.latitude + '&lon=' + that.longitude + '&key=' + that.key;
        break;
      case 'ip':
      default:
        url = prefix + '://api.airvisual.com/v2/nearest_city?key=' + that.key;
        break;
    }
    url = url.replace(/ /g, '%20');
    that.log.debug('URL is: %s', url);
    request({
      url: url,
      json: true
    }, function (requestError, response, data) {
      if (!requestError) {
        switch (response.statusCode) {
          case 200:
            switch (data.status) {
              case 'success':
                if (that.debug) {
                  fs.writeFile('./' + that.name + ' Response.json', JSON.stringify(data, null, 4), function (writeError) {
                    if (writeError) {
                      that.log.debug('Error while writing file: ' + writeError);
                    } else {
                      that.log.debug('File written successfully');
                    }
                  });
                }
                that.conditions.aqi = parseFloat(that.standard === 'us' ? data.data.current.pollution.aqius : data.data.current.pollution.aqicn);
                that.conditions.humidity = parseFloat(data.data.current.weather.hu);
                that.conditions.pressure = parseFloat(data.data.current.weather.pr);
                that.conditions.temperature = parseFloat(data.data.current.weather.tp);
                that.conditions.air_quality = that.convertAirQuality(that.conditions.aqi);
                if (data.data.name) {
                  that.log.debug('Station name is: %s', data.data.name);
                }
                if (data.data.local_name) {
                  that.log.debug('Local name is: %s', data.data.local_name);
                }
                that.log.debug('City is: %s', data.data.city);
                that.log.debug('State is: %s', data.data.state);
                that.log.debug('Country is: %s', data.data.country);
                that.log.debug('Latitude is: %s°', data.data.location.coordinates[1]);
                that.log.debug('Longitude is: %s°', data.data.location.coordinates[0]);
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
                    if (data.data.current.pollution.co) {
                      that.conditions.co = parseFloat(data.data.current.pollution.co.conc);
                      that.log.debug('Current carbon monoxide level is: %smg/m3 (%sµg/m3)', that.conditions.co, that.conditions.co * 1000);
                      that.conditions.co = that.convertMilligramToPPM(
                        'co',
                        parseFloat(data.data.current.pollution.co.conc),
                        that.conditions.temperature,
                        that.conditions.pressure
                      );
                      that.log.debug('Current carbon monoxide level is: %sppm', that.conditions.co);
                      that.sensorService
                        .getCharacteristic(Characteristic.CarbonMonoxideLevel)
                        .setValue(that.conditions.co);
                    }
                    if (data.data.current.pollution.n2) {
                      that.conditions.no2 = parseFloat(data.data.current.pollution.n2.conc);
                      if (that.ppb && (that.ppb.indexOf('no2') > -1)) {
                        that.log.debug('Current nitrogen dioxide density is: %sppb', that.conditions.no2);
                        that.conditions.no2 = that.convertPPBtoMicrogram(
                          'no2',
                          parseFloat(data.data.current.pollution.n2.conc),
                          that.conditions.temperature,
                          that.conditions.pressure
                        );
                      }
                      that.log.debug('Current nitrogen dioxide density is: %sµg/m3', that.conditions.no2);
                      that.sensorService
                        .getCharacteristic(Characteristic.NitrogenDioxideDensity)
                        .setValue(that.conditions.no2);
                    }
                    if (data.data.current.pollution.o3) {
                      that.conditions.o3 = parseFloat(data.data.current.pollution.o3.conc);
                      if (that.ppb && (that.ppb.indexOf('o3') > -1)) {
                        that.log.debug('Current ozone density is: %sppb', that.conditions.o3);
                        that.conditions.o3 = that.convertPPBtoMicrogram(
                          'o3',
                          parseFloat(data.data.current.pollution.o3.conc),
                          that.conditions.temperature,
                          that.conditions.pressure
                        );
                      }
                      that.log.debug('Current ozone density is: %sµg/m3', that.conditions.o3);
                      that.sensorService
                        .getCharacteristic(Characteristic.OzoneDensity)
                        .setValue(that.conditions.o3);
                    }
                    if (data.data.current.pollution.p1) {
                      that.conditions.pm10 = parseFloat(data.data.current.pollution.p1.conc);
                      that.log.debug('Current PM10 density is: %sµg/m3', that.conditions.pm10);
                      that.sensorService
                        .getCharacteristic(Characteristic.PM10Density)
                        .setValue(that.conditions.pm10);
                    }
                    if (data.data.current.pollution.p2) {
                      that.conditions.pm2_5 = parseFloat(data.data.current.pollution.p2.conc);
                      that.log.debug('Current PM2.5 density is: %sµg/m3', that.conditions.pm2_5);
                      that.sensorService
                        .getCharacteristic(Characteristic.PM2_5Density)
                        .setValue(that.conditions.pm2_5);
                    }
                    if (data.data.current.pollution.s2) {
                      that.conditions.so2 = parseFloat(data.data.current.pollution.s2.conc);
                      if (that.ppb && (that.ppb.indexOf('so2') > -1)) {
                        that.log.debug('Current sulphur dioxide density is: %sppb', that.conditions.so2);
                        that.conditions.so2 = that.convertPPBtoMicrogram(
                          'so2',
                          parseFloat(data.data.current.pollution.s2.conc),
                          that.conditions.temperature,
                          that.conditions.pressure
                        );
                      }
                      that.log.debug('Current sulphur dioxide density is: %sµg/m3', that.conditions.so2);
                      that.sensorService
                        .getCharacteristic(Characteristic.SulphurDioxideDensity)
                        .setValue(that.conditions.so2);
                    }
                    break;
                }
                that.sensorService
                  .getCharacteristic(Characteristic.StatusActive)
                  .setValue(true);
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
            that.sensorService
              .getCharacteristic(Characteristic.StatusActive)
              .setValue(false);
            break;
        }
      } else {
        that.log.error('Unknown error: %s', requestError);
        that.sensorService
          .getCharacteristic(Characteristic.StatusActive)
          .setValue(false);
      }
      callback(that.conditions);
    });
  },

  convertAirQuality: function (aqi) {
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

  convertMilligramToPPM: function (pollutant, milligram, temperature, pressure) {
    var weight;
    switch (pollutant) {
      case 'co':
        weight = 28.01;
        break;
      default:
        weight = 0;
        break;
    }
    return ((milligram * 22.41 * ((temperature + 273) / 273) * (1013 / pressure)) / weight);
  },

  convertPPBtoMicrogram: function (pollutant, ppb, temperature, pressure) {
    var weight;
    switch (pollutant) {
      case 'no2':
        weight = 46.01;
        break;
      case 'o3':
        weight = 48;
        break;
      case 'so2':
        weight = 64.07;
        break;
      default:
        weight = 0;
        break;
    }
    return Math.round(ppb * (weight / (22.41 * ((temperature + 273) / 273) * (1013 / pressure))));
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
        break;
    }

    this.accessoryInformationService
      .setCharacteristic(Characteristic.Model, this.model);

    this.sensorService
      .setCharacteristic(Characteristic.Name, this.name);

    this.sensorService
      .addCharacteristic(Characteristic.StatusActive);

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
