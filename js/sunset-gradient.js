/**
 * Generate sunset sky gradient using a live webcam image.
 * @param {HTMLElement|string} container Where to output the gradient.
 * @param {Object} [options]
 * @param {string} [options.cities=./cities.json] Where to load city definitions from.
 * @param {string} [options.proxyUrl=https://enigmatic-basin-98309.herokuapp.com/] Proxy server to use to load webcam images.
 * @param {boolean} [options.fullscreenOnClick=true] Whether to toggle fullscreen on click or not.
 * @param {boolean} [options.debug=false] Whether to output debug entries to the console or not.
 * @param {Function} [options.onCityChange] The function to call when city changes.
 * @example
 * // for the whole page, with the default options
 * new SunsetGradient('body');
 * @example
 * // for a small element, with custom cities and debugging enabled
 * new SunsetGradient('#my-gradient', {cities: 'https://my-domain.com/my-cities.json', debug: true});
 * @throws {Error} When target is not specified or does not exist
 * @constructor
 */
function SunsetGradient(container, options) {
  var self = this;

  // set instance properties
  this.sunsetCity = null;
  this.canvas = document.createElement('canvas');
  this.canvasCtx = this.canvas.getContext('2d');
  this.canvas.width = this.canvas.height = 300;
  this.isLoading = false;

  // find container
  if (container instanceof HTMLElement) {
    this.container = container;
  } else if (typeof container === 'string') {
    this.container = document.querySelector(container);

    if (!container) {
      throw new Error('Target does not exist');
    }
  } else {
    throw new Error('Target not specified');
  }

  this.container.classList.add('sunset-gradient');

  // apply options
  if (typeof options !== 'object') {
    options = {};
  }

  this.proxyUrl = options.proxyUrl || 'https://enigmatic-basin-98309.herokuapp.com/';
  this.isDebugEnabled = options.debug;
  this.triggerOnCityChange = options.onCityChange || new Function();

  this.debug('Container: %o', this.container);
  this.debug('Options: %o', options);
  this.debug(screenfull && screenfull.isEnabled ? 'Fullscreen is supported' : 'Fullscreen is not supported');

  // toggle fullscreen on click
  if (screenfull && screenfull.isEnabled && options.fullscreenOnClick !== false) {
    this.container.addEventListener('click', function() {
      screenfull.toggle(self.container === document.body ? null : self.container);
    });
  }

  // add top and bot part images for debugging
  if (this.isDebugEnabled) {
    ['top', 'bot'].forEach(function(part) {
      self[part + 'Image'] = new Image();
      self.container.appendChild(self[part + 'Image']);
    });
  }

  // add transition layers
  ['A', 'B'].forEach(function(k) {
    var layer = document.createElement('div');

    layer.setAttribute('class', 'sunset-gradient-layer');

    self.container.appendChild(layer);
    self['layer' + k] = layer;
  });

  this.activeLayer = this.layerA;
  this.inactiveLayer = this.layerB;

  // load cities and generate the gradient
  this.setState('loading');

  this.loadCities(
    typeof options.cities === 'string' ? options.cities : this.getDefaultCitiesUrl(),
    this.handleCitiesLoad.bind(this)
  );
}

/**
 * Add a debug entry to the console, if debugging is enabled.
 */
SunsetGradient.prototype.debug = function() {
  if (this.isDebugEnabled) {
    console.debug.apply(console, arguments);
  }
};

/**
 * Update UI state.
 * @param {string} state
 */
SunsetGradient.prototype.setState = function(state) {
  var self = this;

  if (this.state === state) {
    return;
  }

  this.debug('Changing state to %s', state);

  ['loading', 'live', 'waiting', 'error'].forEach(function(k) {
    self.container.classList.remove(k);
  });

  this.container.classList.add(state);
  this.state = state;
};

/**
 * Get URL of the default cities JSON file.
 * @returns {string}
 */
SunsetGradient.prototype.getDefaultCitiesUrl = function() {
  // var script = document.querySelector('script[src *= "sunset-gradient.js"]');
  // var scriptUrl = script.src.split('?')[0];

  //var scriptUrl = '../cities.json'
  var scriptUrl = 'https://cdn.jsdelivr.net/gh/michaeltsandford/sunsetsV2@latest/streams/cities.json'
  // return scriptUrl.split('/').slice(0, -1).join('/') + '/cities.json';
  return scriptUrl
};

/**
 * Load cities from a JSON file.
 * @param {string} url
 * @param {Function} callback
 */
SunsetGradient.prototype.loadCities = function(url, callback) {
  var self = this;

  this.debug('Loading city definitions from %s', url);

  var request = new XMLHttpRequest();
  

  request.onload = function() {
    if (request.status >= 200 && request.status < 400) {
      try {
        var json = JSON.parse(request.responseText);

        self.debug('Loaded city definitions: %o', json);
        callback(null, json);
      } catch (err) {
        callback(new Error('Unable to parse city definitions: ' + err.message));
      }
    } else {
      callback(new Error('Unable to load cities, HTTP status ' + request.status));
    }
  };

  request.onerror = callback;

  request.open('GET', url, true);
  request.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
  request.send();
};

/**
 * Callback for cities file request.
 * @param {null|Error} [err]
 * @param {Object} [json]
 */
SunsetGradient.prototype.handleCitiesLoad = function(err, json) {
  if (err) {
    this.setState('error');

    return;
  }

  this.cities = json;
  this.refreshGradient();
};

/**
 * Apply gradient.
 * @param {Object} colors
 */
SunsetGradient.prototype.setGradient = function(colors) {
  this.debug('Applying gradient %s, %s', colors.top, colors.bot);
  this.inactiveLayer.style.background = 'linear-gradient(' + colors.top + ', ' + colors.bot + ')';
  this.inactiveLayer.classList.add('sunset-gradient-layer-active');
  this.activeLayer.classList.remove('sunset-gradient-layer-active');
  this.activeLayer = this.activeLayer === this.layerA ? this.layerB : this.layerA;
  this.inactiveLayer = this.inactiveLayer === this.layerA ? this.layerB : this.layerA;
};

/**
 * Extract sunset color from a webcam image according to city spec.
 * @param {Object} city
 * @param {Image} webcamImage
 * @param {string} part
 * @param {Function} callback
 */
SunsetGradient.prototype.getSunsetPartColor = function(city, webcamImage, part, callback) {
  this.canvasCtx.filter = 'saturate(' + city[part].sat + '%) ' +
    'contrast(' + city[part].con + ') ' +
    'hue-rotate(' + city[part].hue + 'deg) ' +
    'brightness(' + city[part].br + ')';

  this.canvasCtx.drawImage(
    webcamImage,
    city[part].x, city[part].y, city[part].w, city[part].h, 0, 0, this.canvas.width, this.canvas.height
  );

  var dataUrl = this.canvas.toDataURL('image/jpeg', 0.5);
  var partImage = new Image();

  if (this.isDebugEnabled) {
    this[part + 'Image'].setAttribute('src', dataUrl);
  }

  partImage.addEventListener('load', function() {
    var color;

    try {
      color = new ColorThief().getColor(partImage);
    } catch (err) {
      // ColorThief throws on pure white images (https://github.com/lokesh/color-thief/pull/49)
      color = [255, 255, 255];
    }

    callback('rgb(' + color.join(',') + ')', part);
  });

  partImage.src = dataUrl;
};

/**
 * Fetch webcam image of the specified city and parse sunset colors from that.
 * @param {Object} city
 * @param {Function} callback
 */
SunsetGradient.prototype.getSunsetColors = function(city, callback) {
  var self = this;
  var colors = {};
  var webcamImageIframe = document.createElement('iframe');
  var webcamImage = new Image();

  /**
   * Callback for when one of the webcam image parts is processed.
   * @param {string} color - extracted color
   * @param {string} part - which part it was for
   */
  function handleSunsetColor(color, part) {
    self.debug('Got color of the %s part: %s', part, color);
    colors[part] = color;

    if (colors.top && colors.bot) {
      callback(null, colors);
    }
  }

  /**
   * Callback for when the webcam image is ready for processing.
   */
  function handleWebcamImageLoad() {
    self.getSunsetPartColor(city, webcamImage, 'top', handleSunsetColor);
    self.getSunsetPartColor(city, webcamImage, 'bot', handleSunsetColor);

    // cut stream to save user trafic
    webcamImage.removeEventListener('load', handleWebcamImageLoad);
    webcamImage.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    webcamImageIframe.contentWindow.stop();
    webcamImageIframe.remove();
  }

  webcamImage.addEventListener('load', handleWebcamImageLoad);

  webcamImage.addEventListener('error', function() {
    callback(new Error('Unable to load webcam image'));
  });

  webcamImageIframe.addEventListener('load', function() {
    webcamImageIframe.contentDocument.body.appendChild(webcamImage);
    webcamImage.crossOrigin = 'anonymous';
    webcamImage.src = self.proxyUrl + city.url;
    self.debug('Loading webcam image from %s', webcamImage.src);
  });

  webcamImageIframe.className = 'sunset-gradient-iframe';
  webcamImageIframe.srcdoc = '<body></body>';

  self.container.appendChild(webcamImageIframe);
};

/**
 * Get city sunset times with custom offsets applied.
 * @param {Object} city
 * @returns {Object}
 */
SunsetGradient.prototype.getCitySunsetTimes = function(city) {
  var now = new Date();
  var times = SunCalc.getTimes(now, city.lat, city.lon);
  var offset = city.offset || [0, 0];

  if (times.sunsetStart) {
    times.sunsetStart = new Date(times.sunsetStart.getTime() + offset[0] * 1000 * 60);
  }

  if (times.dusk) {
    times.dusk = new Date(times.dusk.getTime() + offset[1] * 1000 * 60);
  }

  return times;
};

/**
 * Check whether it's sunset in the specified city.
 * @param {Object} city
 * @returns {boolean}
 */
SunsetGradient.prototype.isSunsetCity = function(city) {
  var now = new Date();
  var times = this.getCitySunsetTimes(city);

  return !city.isBlacklisted && times.sunsetStart && times.dusk && times.sunsetStart <= now && times.dusk >= now;
};

/**
 * Figure out which of the cities have sunset right now.
 * @returns {Object}
 */
SunsetGradient.prototype.updateSunsetCity = function() {
  var self = this;
  var oldSunsetCity = this.sunsetCity;

  // stick to the current city until it's no longer valid
  if (!this.sunsetCity || !this.isSunsetCity(this.sunsetCity)) {
    this.sunsetCity = null;

    for (var i = 0; i < this.cities.length; i++) {
      var city = this.cities[i];

      if (!city.isBlacklisted && this.isSunsetCity(city)) {
        this.sunsetCity = city;

        break;
      }
    }
  }

  if (this.sunsetCity) {
    this.debug('The current sunset city is %o', this.sunsetCity);
  } else {
    this.debug('None of the cities have sunset right now');
  }

  // use the next closest sunset city if none found
  if (!this.sunsetCity) {
    this.sunsetCity = this.cities
      .filter(function(city) {
        return !city.isBlacklisted && self.getCitySunsetTimes(city).sunsetStart > new Date();
      })
      .sort(function(a, b) {
        return self.getCitySunsetTimes(a).sunsetStart - self.getCitySunsetTimes(b).sunsetStart;
      })[0];

    this.debug('Using the next closest one: %o', this.sunsetCity);
  }

  if (oldSunsetCity !== this.sunsetCity) {
    this.triggerOnCityChange(this.sunsetCity);
  }
};

/**
 * Determine where it's sunset right now and update the gradient.
 */
SunsetGradient.prototype.refreshGradient = function() {
  var self = this;

  this.debug('Refreshing the gradient');
  this.updateSunsetCity();

  if (this.isDebugEnabled && this.sunsetCity) {
    var times = this.getCitySunsetTimes(this.sunsetCity);

    this.debug('Current time: %s', new Date());
    this.debug('Sunset start: %s', times.sunsetStart);
    this.debug('Sunset end:   %s', times.dusk);
  }

  if (this.sunsetCity) {
    this.getSunsetColors(this.sunsetCity, function(err, colors) {
      if (err) {
        self.debug('Unable to get sunset colors: %s', err.message);

        if (!self.sunsetCity.failures) {
          self.sunsetCity.failures = 0;
        }

        self.sunsetCity.failures++;

        if (self.sunsetCity.failures === 2) {
          self.debug('Blacklisting %s', self.sunsetCity.name);
          self.sunsetCity.isBlacklisted = true;
        }

        self.refreshGradient();

        return;
      }

      self.sunsetCity.failures = 0;
      self.setState('live');
      self.setGradient(colors);
      setTimeout(self.refreshGradient.bind(self), 6000);
    });
  } else {
    this.setState('waiting');
    setTimeout(this.refreshGradient.bind(this), 45000);
  }
};
