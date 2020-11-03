const ServerSession = require('./server-session');
const ServerState   = require('./server-state');
const merge         = require('deepmerge');

module.exports = class IrmaClient {

  constructor({stateMachine, options}) {
    this._stateMachine = stateMachine;
    this._options      = this._sanitizeOptions(options);
    this._session      = this._options.session ? new ServerSession(this._options.session) : false;
  }

  stateChange({newState, transition, payload}) {
    switch(newState) {
      case 'Loading':
        this._canRestart = payload.canRestart;
        return this._startNewSession();
      case 'MediumContemplation':
        return this._startWatchingServerState(payload);
      case 'ShowingQRCode':
      case 'ShowingQRCodeInstead':
        this._pairingPromise = this._serverState.updatePairingState(true);
        break;
      case 'ShowingIrmaButton':
        this._pairingPromise = this._serverState.updatePairingState(false);
        break;
      case 'ContinueInIrmaApp':
        if (transition === 'pairingCompleted') {
          return this._serverState.pairingCompleted();
        }
        break;
      case 'Success':
        this._successPayload = payload;
        // Fallthrough
      case 'Cancelled':
      case 'TimedOut':
      case 'Error':
      case 'Aborted':
        this._serverCloseSession();
        break;
    }
  }

  start() {
    if (this._options.session) {
      this._stateMachine.transition('initialize', {
        canRestart: ![undefined, null, false].includes(this._options.session.start),
      });
    }
  }

  close() {
    if (this._stateMachine.currentState() === 'Success')
      return Promise.resolve(this._successPayload);
    return Promise.resolve();
  }

  _startNewSession() {
    if (this._session) {
      this._session.start()
        .then(resp => {
          if (this._stateMachine.currentState() == 'Loading') {
            this._stateMachine.transition('loaded', resp);
          } else {
            // State was changed while loading, so cancel again.
            this._serverState = new ServerState(resp, this._options.state);
            this._serverState.cancel()
              .catch(error => {
                if (this._options.debugging)
                  console.error("Session could not be cancelled:", error);
              });
          }
        })
        .catch(error => {
          if (this._options.debugging)
            console.error("Error starting a new session on the server:", error);
          this._handleNoSuccess('fail', error);
        })
    }
  }

  _startWatchingServerState(payload) {
    this._serverState = new ServerState(payload, this._options.state);

    try {
      this._serverState.observe(s => this._serverStateChange(s), e => this._serverHandleError(e));
    } catch (error) {
      if ( this._options.debugging )
        console.error("Observing server state could not be started: ", error);

      this._handleNoSuccess('fail', error);
    }
  }

  _serverCloseSession() {
    if (this._serverState) {
      if (this._serverState.close()) {
        // If the server is still in an active state, we have to actively cancel.
        this._serverState.cancel()
          .catch(error => {
            if (this._options.debugging)
              console.error("Session could not be cancelled:", error);
          });
      }
    }
  }

  _serverHandleError(error) {
    if ( this._options.debugging )
      console.error("Error while observing server state: ", error);

    this._handleNoSuccess('fail', error);
  }

  _serverStateChange(newState) {
    switch(newState) {
      case 'BINDING': // TODO: Update
        // TODO: Return object?
        return this._pairingPromise.then(pairingCode => this._stateMachine.transition('appPairing', {pairingCode}));
      case 'CONNECTED':
        if (this._stateMachine.currentState() !== 'ContinueInIrmaApp')
          this._stateMachine.transition('appConnected');
        return;
      case 'DONE':
        // What we hope will happen ;)
        return this._successStateReached();
      case 'CANCELLED':
        // This is a conscious choice by a user.
        this._serverState.close();
        return this._handleNoSuccess('cancel');
      case 'TIMEOUT':
        this._serverState.close();
        // This is a known and understood error. We can be explicit to the user.
        return this._handleNoSuccess('timeout');
      default:
        // Catch unknown errors and give generic error message. We never really
        // want to get here.
        if ( this._options.debugging )
          console.error(`Unknown state received from server: '${newState}'. Payload:`, payload);

        this._serverState.close();
        return this._handleNoSuccess('fail', new Error('Unknown state received from server'));
    }
  }

  _successStateReached() {
    if (this._session) {
      return this._session.result()
        .then(result => this._stateMachine.transition('succeed', result))
        .catch(error => {
          if (this._options.debugging)
            console.error("Error fetching session result from the server:", error);

          this._handleNoSuccess('fail', error);
        });
    }
    this._stateMachine.transition('succeed');
  }

  _handleNoSuccess(transition, payload) {
    if (this._canRestart)
      return this._stateMachine.transition(transition, payload);
    this._stateMachine.finalTransition(transition, payload);
  }

  _cancel_session() {
    if (!this._options.cancel)
      return Promise.resolve();
    return fetch(this._options.cancel.url(this._mappings), {method: 'DELETE'});
  }

  _sanitizeOptions(options) {
    const defaults = {
      session: {
        url: '',
        start: {
          url:          o => `${o.url}/session`,
          parseResponse: r => r.json()
          // And default custom settings for fetch()'s init parameter
          // https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch
        },
        mapping: {
          sessionPtr:    r => r.sessionPtr,
          sessionToken:  r => r.token,
          frontendAuth:  r => r.frontendAuth
        },
        result: {
          url:           (o, {sessionToken}) => `${o.url}/session/${sessionToken}/result`,
          parseResponse: r => r.json()
          // And default custom settings for fetch()'s init parameter
          // https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/fetch
        }
      },
      state: {
        debugging:  options.debugging,

        serverSentEvents: {
          url:        m => `${m.sessionPtr['u']}/statusevents`,
          timeout:    2000,
        },

        polling: {
          url:        m => `${m.sessionPtr['u']}/status`,
          interval:   500,
          startState: 'INITIALIZED'
        },

        cancel: {
          url:        m => m.sessionPtr['u']
        },

        // TODO: What to do with code duplication?
        pairing: {
          onlyEnable: m => true, //m.frontendAuth && m.sessionPtr.irmaqr === 'issuing', // TODO: Check strictness.

          enable: m => ({
            url: `${m.sessionPtr.u}/frontend/options`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': m.frontendAuth
            },
            body: JSON.stringify({
              bindingMethod: 'pin'
            }),
            parseResponse: r => r.json()['bindingCode']
          }),

          disable: m => ({
            url: `${m.sessionPtr.u}/frontend/options`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': m.frontendAuth
            },
            body: JSON.stringify({
              bindingMethod: 'none'
            })
          }),

          completed: m => ({
            url: `${m.sessionPtr.u}/frontend/bindingcompleted`,
            method: 'POST',
            headers: {
              'Authorization': m.frontendAuth
            },
          }),
        },
      }
    };

    return merge(defaults, options);
  }

}
