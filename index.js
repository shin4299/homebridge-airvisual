/* eslint-disable object-curly-newline */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-multi-spaces */
/* eslint-disable array-bracket-spacing */
/* eslint-disable camelcase */

'use strict';

const fetch = require('node-fetch');
const { StorageArea } = require('node-kv-storage');

const { name: pkgName, version: firmware } = require('./package.json');
const { ParamsURL, JSONRequest } = require('./helpers');

const API = 'https://api.airvisual.com';

let Service;
let Characteristic;

class AirVisualAccessory {
  constructor(log, config) {
    this.storage = new StorageArea(pkgName);
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
    this.interval = (config.interval || 15) * 60 * 1000;

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

    if (config.interval >= 1000) {
      this.log.warn(`Interval is specified in minutes, using ${Math.floor(config.interval / 1000)} minutes instead.`);
      this.interval = config.interval;
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
      for (let index = 0; index < this.ppb.length; index += 1) {
        if (!(['no2', 'o3', 'so2'].indexOf(this.ppb[index]) > -1)) {
          this.log.warn('Unsupported option specified for PPB units, units will not be converted: %s', this.ppb[index]);
        } else {
          this.log.debug('The following pollutant will be converted from ppb to µg/m3: %s', this.ppb[index]);
        }
      }
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

    this.log.debug('Polling is %s', (this.polling) ? 'enabled' : 'disabled');
    this.log.debug('Save response is %s', (this.save) ? 'enabled' : 'disabled');

    this.getConditions = this.getConditions.bind(this);
    this.servicePolling = this.servicePolling.bind(this);

    this.servicePolling();
  }

  servicePolling() {
    this.log.debug('Polling');
    this.requestAndStoreData().then(this.getConditions).then((conditions) => {
      switch (this.sensor) {
        case 'humidity':
          this.sensorService.setCharacteristic(
            Characteristic.CurrentRelativeHumidity,
            conditions.humidity
          );
          break;
        case 'temperature':
          this.sensorService.setCharacteristic(
            Characteristic.CurrentTemperature,
            conditions.temperature
          );
          break;
        case 'air_quality':
        default:
          this.sensorService.setCharacteristic(
            Characteristic.AirQuality,
            conditions.air_quality
          );
          break;
      }
      setTimeout(this.servicePolling, this.interval);
    }).catch(err => this.log.error(err.message));
  }

  getAirQuality(callback) {
    this.storage.get(this.name).then(this.getConditions).then((conditions) => {
      callback(null, conditions.air_quality);
    }).catch(err => this.log.error(err.message));
  }

  getHumidity(callback) {
    this.storage.get(this.name).then(this.getConditions).then((conditions) => {
      callback(null, conditions.humidity);
    }).catch(err => this.log.error(err.message));
  }

  getTemperature(callback) {
    this.storage.get(this.name).then(this.getConditions).then((conditions) => {
      callback(null, conditions.temperature);
    }).catch(err => this.log.error(err.message));
  }

  getConditions(data) {
    const conditions = {};
    conditions.aqi = parseFloat(this.standard === 'us' ? data.data.current.pollution.aqius : data.data.current.pollution.aqicn);
    conditions.humidity = parseFloat(data.data.current.weather.hu);
    conditions.pressure = parseFloat(data.data.current.weather.pr);
    conditions.temperature = parseFloat(data.data.current.weather.tp);
    conditions.air_quality = this.convertAirQuality(conditions.aqi);
    if (data.data.name) {
      this.log.debug('Station name is: %s', data.data.name);
    }
    if (data.data.local_name) {
      this.log.debug('Local name is: %s', data.data.local_name);
    }
    this.log.debug('City is: %s', data.data.city);
    this.log.debug('State is: %s', data.data.state);
    this.log.debug('Country is: %s', data.data.country);
    this.log.debug('Latitude is: %s°', data.data.location.coordinates[1]);
    this.log.debug('Longitude is: %s°', data.data.location.coordinates[0]);
    switch (this.sensor) {
      case 'humidity':
        this.log.debug('Current humidity is: %s%', conditions.humidity);
        break;
      case 'temperature':
        this.log.debug('Current temperature is: %s°C (%s°F)', conditions.temperature, this.convertTemperature(conditions.temperature));
        break;
      case 'air_quality':
      default:
        this.log.debug('Current air quality index is: %s', conditions.aqi);
        if (data.data.current.pollution.co) {
          conditions.co = parseFloat(data.data.current.pollution.co.conc);
          this.log.debug('Current carbon monoxide level is: %smg/m3 (%sµg/m3)', conditions.co, conditions.co * 1000);
          conditions.co = this.convertMilligramToPPM(
            'co',
            conditions.co,
            conditions.temperature,
            conditions.pressure
          );
          this.log.debug('Current carbon monoxide level is: %sppm', conditions.co);
          this.sensorService
            .getCharacteristic(Characteristic.CarbonMonoxideLevel)
            .setValue(conditions.co);
        } else {
          this.sensorService
            .removeCharacteristic(Characteristic.CarbonMonoxideLevel);
        }

        if (data.data.current.pollution.n2) {
          conditions.no2 = parseFloat(data.data.current.pollution.n2.conc);
          if (this.ppb && (this.ppb.indexOf('no2') > -1)) {
            this.log.debug('Current nitrogen dioxide density is: %sppb', conditions.no2);
            this.conditions.no2 = this.convertPPBtoMicrogram(
              'no2',
              conditions.no2,
              conditions.temperature,
              conditions.pressure
            );
          }
          this.log.debug('Current nitrogen dioxide density is: %sµg/m3', conditions.no2);
          this.sensorService
            .getCharacteristic(Characteristic.NitrogenDioxideDensity)
            .setValue(conditions.no2);
        } else {
          this.sensorService
            .removeCharacteristic(Characteristic.NitrogenDioxideDensity);
        }

        if (data.data.current.pollution.o3) {
          conditions.o3 = parseFloat(data.data.current.pollution.o3.conc);
          if (this.ppb && (this.ppb.indexOf('o3') > -1)) {
            this.log.debug('Current ozone density is: %sppb', conditions.o3);
            conditions.o3 = this.convertPPBtoMicrogram(
              'o3',
              conditions.o3,
              conditions.temperature,
              conditions.pressure
            );
          }
          this.log.debug('Current ozone density is: %sµg/m3', conditions.o3);
          this.sensorService
            .getCharacteristic(Characteristic.OzoneDensity)
            .setValue(conditions.o3);
        } else {
          this.sensorService
            .removeCharacteristic(Characteristic.OzoneDensity);
        }

        if (data.data.current.pollution.p1) {
          conditions.pm10 = parseFloat(data.data.current.pollution.p1.conc);
          this.log.debug('Current PM10 density is: %sµg/m3', conditions.pm10);
          this.sensorService
            .getCharacteristic(Characteristic.PM10Density)
            .setValue(conditions.pm10);
        } else {
          // const pm10 = this.inferPM10(conditions.aqi);
          // if (pm10) {
          //   conditions.pm10 = pm10;
          //   this.log('Inferred PM10 density is: %sµg/m3', conditions.pm10);
          //   this.sensorService
          //     .getCharacteristic(Characteristic.PM10Density)
          //     .setValue(conditions.pm10);
          // } else {
          this.sensorService
            .removeCharacteristic(Characteristic.PM10Density);
          // }
        }

        if (data.data.current.pollution.p2) {
          conditions.pm2_5 = parseFloat(data.data.current.pollution.p2.conc);
          this.log.debug('Current PM2.5 density is: %sµg/m3', conditions.pm2_5);
          this.sensorService
            .getCharacteristic(Characteristic.PM2_5Density)
            .setValue(conditions.pm2_5);
        } else {
          const pm2_5 = this.inferPM2_5(conditions.aqi);
          if (pm2_5) {
            conditions.pm2_5 = pm2_5;
            this.log('Inferred PM2.5 density is: %sµg/m3', conditions.pm2_5);
            this.sensorService
              .getCharacteristic(Characteristic.PM2_5Density)
              .setValue(conditions.pm2_5);
          } else {
            this.sensorService
              .removeCharacteristic(Characteristic.PM2_5Density);
          }
        }

        if (data.data.current.pollution.s2) {
          conditions.so2 = parseFloat(data.data.current.pollution.s2.conc);
          if (this.ppb && (this.ppb.indexOf('so2') > -1)) {
            this.log.debug('Current sulphur dioxide density is: %sppb', conditions.so2);
            this.conditions.so2 = this.convertPPBtoMicrogram(
              'so2',
              conditions.so2,
              conditions.temperature,
              conditions.pressure
            );
          }
          this.log.debug('Current sulphur dioxide density is: %sµg/m3', conditions.so2);
          this.sensorService
            .getCharacteristic(Characteristic.SulphurDioxideDensity)
            .setValue(conditions.so2);
        } else {
          this.sensorService
            .removeCharacteristic(Characteristic.SulphurDioxideDensity);
        }

        break;
    }

    this.sensorService
      .getCharacteristic(Characteristic.StatusActive)
      .setValue(true);

    return conditions;
  }

  getURL() {
    const { mode, key } = this;
    switch (mode) {
      case 'city': {
        const { city, state, country } = this;
        return new ParamsURL('/v2/city', { city, state, country, key }, API);
      }
      case 'gps': {
        const { latitude: lat, longitude: lon } = this;
        return new ParamsURL('/v2/nearest_city', { lat,  lon, key }, API);
      }
      case 'ip':
      default:
        return new ParamsURL('/v2/nearest_city', { key }, API);
    }
  }

  async requestAndStoreData() {
    try {
      const url = this.getURL();
      this.log('Fetching URL: %s', url);
      const response = await fetch(new JSONRequest(url));
      if (response.ok) {
        const data = await response.json();
        switch (data.status) {
          case 'success':
            await this.storage.set(this.name, data);
            return data;
          case 'call_limit_reached':
            throw Error('Call limit reached');
          case 'api_key_expired':
            throw Error('API key expired');
          case 'incorrect_api_key':
            throw Error('Incorrect API key');
          case 'ip_location_failed':
            throw Error('IP location failed');
          case 'no_nearest_station':
            throw Error('No nearest station');
          case 'feature_not_available':
            throw Error('Feature not available');
          case 'too_many_requests':
            throw Error('Too many requests');
          default:
            throw Error('Unknown status: %s', data.status);
        }
      } else {
        this.sensorService
          .getCharacteristic(Characteristic.StatusActive)
          .setValue(false);
        throw Error('Response: %s', response.statusCode);
      }
    } catch (requestError) {
      this.sensorService
        .getCharacteristic(Characteristic.StatusActive)
        .setValue(false);
      throw Error('Unknown error: %s', requestError);
    }
  }

  convertAirQuality(aqi) {
    let characteristic;
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
  }

  // Source: https://en.wikipedia.org/wiki/Air_quality_index#Computing_the_AQI
  inferPM2_5(aqi) { // μg/m3
    if (!aqi) return null;
    const table = [
      [  0,  50,   0.0,  12.0],
      [ 50, 100,  12.0,  35.5],
      [100, 150,  35.5,  55.5],
      [150, 200,  55.5, 150.5],
      [200, 300, 150.5, 250.5],
      [300, 400, 250.5, 350.5],
      [400, 500, 350.5, 500.5],
    ];
    const [aqiLow, aqiHigh, pmLow, pmHigh] = table.find(([l, h]) => aqi >= l && aqi < h);
    return pmLow + (((aqi - aqiLow) * (pmHigh - pmLow)) / (aqiHigh - aqiLow));
  }

  // inferPM10(aqi) { // μg/m3
  //   if (!aqi) return null;
  //   const table = [
  //     [  0,  50,   0,  55],
  //     [ 50, 100,  55, 155],
  //     [100, 150, 155, 255],
  //     [150, 200, 255, 355],
  //     [200, 300, 355, 425],
  //     [300, 400, 425, 505],
  //     [400, 500, 505, 605],
  //   ];
  //   const [aqiLow, aqiHigh, pmLow, pmHigh] = table.find(([l, h]) => aqi >= l && aqi < h);
  //   return pmLow + (((aqi - aqiLow) * (pmHigh - pmLow)) / (aqiHigh - aqiLow));
  // }

  convertMilligramToPPM(pollutant, milligram, temperature, pressure) {
    let weight;
    switch (pollutant) {
      case 'co':
        weight = 28.01;
        break;
      default:
        weight = 0;
        break;
    }
    return ((milligram * 22.41 * ((temperature + 273) / 273) * (1013 / pressure)) / weight);
  }

  convertPPBtoMicrogram(pollutant, ppb, temperature, pressure) {
    let weight;
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
  }

  convertTemperature(temperature) {
    return (temperature * 1.8) + 32;
  }

  identify(callback) {
    this.log.debug('Identified');
    callback();
  }

  getServices() {
    const services = [];

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
}

module.exports = (homebridge) => {
  global.NODE_KV_STORAGE_DIR = homebridge.user.storagePath();
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory('homebridge-airvisual-2', 'AirVisual', AirVisualAccessory);
};
