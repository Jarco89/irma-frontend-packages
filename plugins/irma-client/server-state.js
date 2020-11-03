if ( typeof fetch === 'undefined' )
  require('isomorphic-fetch');

module.exports = class ServerState {

  constructor(mappings, options) {
    this._eventSource = this._eventSource();
    this._isRunning = false;
    this._isPolling = false;
    this._options = options;
    this._mappings = mappings;
    this._pairingEnabled = false;
  }

  observe(stateChangeCallback, errorCallback) {
    this._stateChangeCallback = stateChangeCallback;
    this._errorCallback = errorCallback;
    this._isRunning = true;

    if ( this._eventSource && this._options.serverSentEvents )
      return this._startSSE();

    this._startPolling();
  }

  updatePairingState(continueOnSecondDevice) {
    if (!this._options.pairing)
      return Promise.resolve();

    let shouldEnable = continueOnSecondDevice && this._options.pairing.onlyEnable(this._mappings);
    if (shouldEnable === this._pairingEnabled)
      return Promise.resolve();

    let request = shouldEnable
      ? this._options.pairing.enable(this._mappings)
      : this._options.pairing.disable(this._mappings);

    return fetch(request.url, request)
      .then(r => r.json())
      .then(parsed => parsed['bindingCode']); // TODO: Update
  }

  pairingCompleted() {
    if (!this._options.pairing)
      return Promise.reject(new Error("Pairing was not enabled"));

    let request = this._options.pairing.completed(this._mappings);

    return fetch(request.url, request);
  }

  cancel() {
    if (!this._options.cancel)
      return Promise.resolve();
    return fetch(this._options.cancel.url(this._mappings), {method: 'DELETE'});
  }

  close() {
    if (!this._isRunning) return false;

    if ( this._source ) {
      this._source.close();
      if ( this._options.debugging )
        console.log("🌎 Closed EventSource");
    }

    this._isRunning = false;
    return true;
  }

  _startSSE() {
    if ( this._options.debugging )
      console.log("🌎 Using EventSource for server events");

    this._source = new this._eventSource(this._options.serverSentEvents.url(this._mappings));

    const canceller = setTimeout(() => {
      if ( this._options.debugging )
        console.error(`🌎 EventSource could not connect within ${this._options.serverSentEvents.timeout}ms`);

      // Fall back to polling instead
      setTimeout(() => this._source.close(), 0); // Never block on this
      this._startPolling();
    }, this._options.serverSentEvents.timeout);

    this._source.addEventListener('open', () => clearTimeout(canceller));

    this._source.addEventListener('message', evnt => {
      clearTimeout(canceller);
      const state = JSON.parse(evnt.data);

      if ( this._options.debugging )
        console.log(`🌎 Server event: Remote state changed to '${state}'`);

      this._stateChangeCallback(state);
    });

    this._source.addEventListener('error', error => {
      clearTimeout(canceller);
      this._source.close();

      if ( this._options.debugging )
        console.error('🌎 EventSource threw an error: ', error);

      // Fall back to polling instead
      setTimeout(() => this._source.close(), 0); // Never block on this
      this._startPolling();
    });
  }

  _startPolling() {
    if ( !this._options.polling || this._isPolling )
      return;

    if ( this._options.debugging )
      console.log("🌎 Using polling for server events");

    this._currentStatus = this._options.polling.startState;
    this._isPolling = true;

    this._polling()
    .then(() => {
      if ( this._options.debugging )
        console.log("🌎 Stopped polling");
    })
    .catch((error) => {
      if ( this._options.debugging )
        console.error("🌎 Error thrown while polling: ", error);
      this._errorCallback(error);
    });
  }

  _polling() {
    return new Promise((resolve, reject) => {
      if ( !this._isRunning ) {
        this._isPolling = false;
        resolve();
        return;
      }

      fetch(this._options.polling.url(this._mappings))
      .then(r => {
        if ( r.status != 200 )
          throw(`Error in fetch: endpoint returned status other than 200 OK. Status: ${r.status} ${r.statusText}`);
        return r;
      })
      .then(r => r.json())
      .then(newStatus => {
        // Re-check running because variable might have been changed during fetch.
        if ( !this._isRunning ) {
          this._isPolling = false;
          resolve();
          return;
        }

        if ( newStatus != this._currentStatus ) {
          if ( this._options.debugging )
            console.log(`🌎 Server event: Remote state changed to '${newStatus}'`);

          this._currentStatus = newStatus;
          this._stateChangeCallback(newStatus);
        }

        setTimeout(() => {
          this._polling()
          .then(resolve)
          .catch(reject);
        }, this._options.polling.interval);
      })
      .catch(reject);
    });
  }

  _eventSource() {
    if ( typeof window == 'undefined' )
      return require('eventsource');
    else
      return window.EventSource;
  }

}
