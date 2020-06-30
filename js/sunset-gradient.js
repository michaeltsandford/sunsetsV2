/**
 * Generate sunset sky gradient using a live webcam image.
 * @param {HTMLElement|string} container Where to output the gradient.
 * @param {Object} [options]
 * @param {string} [options.cities=./cities.json] Where to load city definitions from.
 * @param {string} [options.proxyUrl=https://pure-crag-66869.herokuapp.com/] Proxy server to use to load webcam images.
 * @param {boolean} [options.fullscreenOnClick=true] Whether to toggle fullscreen on click or not.
 * @param {boolean} [options.debug=false] Whether to output debug entries to the console or not.
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

  this.proxyUrl = options.proxyUrl || 'https://pure-crag-66869.herokuapp.com/';
  this.isDebugEnabled = options.debug;

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
  var script = document.querySelector('script[src *= "sunset-gradient.js"]');
  var scriptUrl = script.src.split('?')[0];

  return scriptUrl.split('/').slice(0, -1).join('/') + '/cities.json';
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
  this.debug('Applying gradient to the container - %s, %s', colors.top, colors.bot);
  this.container.style = 'background: linear-gradient(' + colors.top + ', ' + colors.bot + ')';
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
    webcamImage.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs%3D';
  }

  webcamImage.addEventListener('load', handleWebcamImageLoad);

  webcamImage.addEventListener('error', function() {
    callback(new Error('Unable to load webcam image'));
  });

  webcamImage.crossOrigin = 'anonymous';
  webcamImage.src = this.proxyUrl + city.url;

  this.debug('Loading webcam image from %s', webcamImage.src);
};

/**
 * Check whether it's sunset in the specified city.
 * @param {Object} city
 * @returns {boolean}
 */
SunsetGradient.prototype.isSunsetCity = function(city) {
  var now = new Date();
  var times = SunCalc.getTimes(now, city.lat, city.lon);

  return times.sunsetStart && times.dusk && times.sunsetStart <= now && times.dusk >= now;
};

/**
 * Figure out which of the cities have sunset right now.
 * @returns {Object}
 */
SunsetGradient.prototype.updateSunsetCity = function() {
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

  this.debug('The current sunset city is %o', this.sunsetCity);
};

/**
 * Determine where it's sunset right now and update the gradient.
 */
SunsetGradient.prototype.refreshGradient = function() {
  var self = this;

  this.debug('Refreshing the gradient');
  this.updateSunsetCity();

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
      setTimeout(self.refreshGradient.bind(self), 12000);
    });
  } else {
    this.setState('waiting');
    setTimeout(this.refreshGradient.bind(this), 45000);
  }
};
